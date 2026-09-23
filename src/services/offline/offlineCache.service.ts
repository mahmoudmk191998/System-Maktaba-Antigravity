/**
 * Local Catalog & Stock Cache Service
 * Handles pre-warming, cache health verification, and zero-latency offline lookups.
 */

import { getOfflineDB } from './offlineDb';
import type {
  CatalogCacheEntry,
  ShadowStockEntry,
  OfflineShiftEntry,
  CacheHealthStatus,
} from './offlineTypes';
import type { Product, StockBalance, CashierShift } from '@/types/retail.types';

export class OfflineCacheService {
  /**
   * Pre-warms or refreshes the local catalog cache from loaded products.
   */
  public async cacheProductsCatalog(
    tenantId: string,
    products: Product[]
  ): Promise<number> {
    if (!products || products.length === 0) return 0;
    const db = await getOfflineDB();
    const tx = db.transaction('catalog_cache', 'readwrite');
    const store = tx.objectStore('catalog_cache');
    const now = new Date().toISOString();

    let count = 0;
    for (const p of products) {
      if (p.hasVariants && p.variants && p.variants.length > 0) {
        for (const v of p.variants) {
          const entry: CatalogCacheEntry = {
            id: `${p.id}___${v.id}`,
            tenantId,
            productId: p.id,
            variantId: v.id,
            name: `${p.name} (${v.name})`,
            sku: v.sku || p.sku,
            barcode: v.barcode || p.barcode || '',
            categoryId: p.categoryId,
            categoryName: p.categoryName,
            unitId: p.baseUnitId,
            unitName: p.baseUnitName,
            sellingPrice: v.price || p.retailPrice || 0,
            wholesalePrice: v.wholesalePrice || p.wholesalePrice || 0,
            minimumPrice: v.minimumPrice || p.minimumPrice || 0,
            cost: v.cost || p.purchasePrice || 0,
            taxRate: p.taxRate ?? 0.14,
            hasVariants: true,
            active: p.active !== false && v.active !== false,
            updatedAt: now,
          };
          await store.put(entry);
          count++;
        }
      } else {
        const entry: CatalogCacheEntry = {
          id: p.id,
          tenantId,
          productId: p.id,
          variantId: null,
          name: p.name,
          sku: p.sku,
          barcode: p.barcode || '',
          categoryId: p.categoryId,
          categoryName: p.categoryName,
          unitId: p.baseUnitId,
          unitName: p.baseUnitName,
          sellingPrice: p.retailPrice || 0,
          wholesalePrice: p.wholesalePrice || 0,
          minimumPrice: p.minimumPrice || 0,
          cost: p.purchasePrice || 0,
          taxRate: p.taxRate ?? 0.14,
          hasVariants: false,
          active: p.active !== false,
          updatedAt: now,
        };
        await store.put(entry);
        count++;
      }
    }

    await tx.done;

    // Record cache update in offline_meta
    await db.put('offline_meta', {
      key: `catalog_synced_${tenantId}`,
      value: { count, timestamp: now },
      updatedAt: now,
    });

    return count;
  }

  /**
   * Pre-warms or refreshes the branch shadow stock balances from server balances.
   */
  public async cacheStockBalances(
    tenantId: string,
    branchId: string,
    balances: StockBalance[]
  ): Promise<number> {
    if (!balances || balances.length === 0) return 0;
    const db = await getOfflineDB();
    const tx = db.transaction('shadow_stock', 'readwrite');
    const store = tx.objectStore('shadow_stock');
    const now = new Date().toISOString();

    let count = 0;
    for (const b of balances) {
      const vId = b.variantId && b.variantId.trim() !== '' ? b.variantId.trim() : null;
      const stockKey = `${tenantId}___${branchId}___${b.productId}___${vId || 'main'}`;
      
      const onHand = Number(b.onHandQuantity ?? b.quantity ?? 0);
      const reserved = Number(b.reservedQuantity ?? 0);
      const available = Math.max(0, onHand - reserved);
      const averageCost = Number(b.averageCost ?? b.unitCost ?? 0);

      const entry: ShadowStockEntry = {
        stockKey,
        tenantId,
        branchId,
        productId: b.productId,
        variantId: vId,
        onHand,
        available,
        reserved,
        averageCost,
        lastSyncedAt: now,
        lastLocallyModifiedAt: now,
      };

      await store.put(entry);
      count++;
    }

    await tx.done;

    await db.put('offline_meta', {
      key: `stock_synced_${tenantId}_${branchId}`,
      value: { count, timestamp: now },
      updatedAt: now,
    });

    return count;
  }

  /**
   * Caches active cashier shift snapshot
   */
  public async cacheActiveShift(shift: CashierShift): Promise<void> {
    if (!shift || !shift.id) return;
    const db = await getOfflineDB();
    const now = new Date().toISOString();

    const existing = await db.get('offline_shifts', shift.id);
    const entry: OfflineShiftEntry = {
      shiftId: shift.id,
      tenantId: shift.tenantId,
      branchId: shift.branchId,
      cashierId: shift.cashierId,
      cashierName: shift.cashierName,
      shiftNumber: shift.shiftNumber || '1',
      openedAt: shift.openedAt,
      startingCash: shift.startingCash || 0,
      serverExpectedCash: shift.expectedCash || shift.startingCash || 0,
      serverExpectedCard: shift.totalCard || 0,
      shadowExpectedCash: existing ? existing.shadowExpectedCash : (shift.expectedCash || shift.startingCash || 0),
      shadowExpectedCard: existing ? existing.shadowExpectedCard : (shift.totalCard || 0),
      pendingSalesCount: existing ? existing.pendingSalesCount : 0,
      status: shift.status === 'open' ? 'open' : 'pending_close',
      lastSyncedAt: now,
    };

    await db.put('offline_shifts', entry);
  }

  /**
   * Retrieves active cached shift
   */
  public async getCachedActiveShift(tenantId: string, branchId: string): Promise<OfflineShiftEntry | null> {
    const db = await getOfflineDB();
    const all = await db.getAllFromIndex('offline_shifts', 'by_branch', branchId);
    const openShifts = all.filter((s) => s.tenantId === tenantId && s.status === 'open');
    return openShifts.length > 0 ? openShifts[0] : null;
  }

  /**
   * Safeguard 5:
   * Checks whether the local cache has completed at least one successful catalog & stock synchronization.
   * If not, offline POS is blocked to prevent selling with zero or corrupted data.
   */
  public async checkCacheHealth(tenantId: string, branchId: string): Promise<CacheHealthStatus> {
    try {
      const db = await getOfflineDB();
      const catalogMeta = await db.get('offline_meta', `catalog_synced_${tenantId}`);
      const stockMeta = await db.get('offline_meta', `stock_synced_${tenantId}_${branchId}`);

      const productCount = await db.countFromIndex('catalog_cache', 'by_tenant', tenantId);
      const stockCount = await db.countFromIndex('shadow_stock', 'by_branch', branchId);

      const hasCatalog = productCount > 0 && catalogMeta?.value?.timestamp;
      const hasStock = stockCount > 0 && stockMeta?.value?.timestamp;

      if (!hasCatalog && !hasStock) {
        return {
          isReady: false,
          productCount,
          stockCount,
          categoriesCount: 0,
          reason: 'لم تتم مزامنة الكتالوج أو أرصدة المخزون لهذا الفرع مسبقاً. يجب الاتصال بالإنترنت أولاً لتحميل البيانات.',
        };
      }

      if (!hasCatalog) {
        return {
          isReady: false,
          productCount,
          stockCount,
          categoriesCount: 0,
          reason: 'كتالوج الأصناف والأسعار غير محمل محلياً.',
        };
      }

      const lastCatalogSyncAt = catalogMeta?.value?.timestamp;
      const lastStockSyncAt = stockMeta?.value?.timestamp;
      const latestTimestamp = lastCatalogSyncAt || lastStockSyncAt;
      const ageHours = latestTimestamp
        ? Math.floor((Date.now() - new Date(latestTimestamp).getTime()) / (1000 * 60 * 60))
        : 0;
      const maxAgeHours = 48;
      const isStale = ageHours > maxAgeHours;

      return {
        isReady: true,
        lastSyncedAt: latestTimestamp,
        lastCatalogSyncAt,
        lastStockSyncAt,
        isStale,
        staleHours: ageHours,
        productCount,
        stockCount,
        categoriesCount: 0,
        reason: isStale ? `تحذير: لم يتم تحديث كتالوج الفرع منذ ${ageHours} ساعة.` : undefined,
      };
    } catch (err: any) {
      return {
        isReady: false,
        productCount: 0,
        stockCount: 0,
        categoriesCount: 0,
        reason: err?.message || 'فشل فحص سلامة الذاكرة المحلية',
      };
    }
  }

  /**
   * Zero-latency offline lookup by barcode
   */
  public async findOfflineProductByBarcode(
    tenantId: string,
    barcode: string
  ): Promise<CatalogCacheEntry | null> {
    if (!barcode) return null;
    const db = await getOfflineDB();
    const cleanBarcode = barcode.trim();
    const matches = await db.getAllFromIndex('catalog_cache', 'by_barcode', cleanBarcode);
    const tenantMatches = matches.filter((m) => m.tenantId === tenantId && m.active);
    return tenantMatches.length > 0 ? tenantMatches[0] : null;
  }

  /**
   * Zero-latency offline search
   */
  public async searchOfflineProducts(
    tenantId: string,
    queryText: string,
    categoryId?: string | null
  ): Promise<CatalogCacheEntry[]> {
    const db = await getOfflineDB();
    const all = await db.getAllFromIndex('catalog_cache', 'by_tenant', tenantId);
    const q = (queryText || '').toLowerCase().trim();

    return all.filter((entry) => {
      if (!entry.active) return false;
      if (categoryId && categoryId !== '__ALL__' && entry.categoryId !== categoryId) {
        return false;
      }
      if (!q) return true;
      return (
        entry.name.toLowerCase().includes(q) ||
        (entry.sku && entry.sku.toLowerCase().includes(q)) ||
        (entry.barcode && entry.barcode.includes(q))
      );
    });
  }

  /**
   * Retrieves shadow stock entry
   */
  public async getShadowStock(
    tenantId: string,
    branchId: string,
    productId: string,
    variantId?: string | null
  ): Promise<ShadowStockEntry | null> {
    const db = await getOfflineDB();
    const vId = variantId && variantId.trim() !== '' ? variantId.trim() : null;
    const stockKey = `${tenantId}___${branchId}___${productId}___${vId || 'main'}`;
    const entry = await db.get('shadow_stock', stockKey);
    return entry || null;
  }
}

export const offlineCacheService = new OfflineCacheService();
