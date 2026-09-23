/**
 * Local Catalog & Stock Cache Service
 * Handles pre-warming, cache health verification, and zero-latency offline lookups.
 */

import { getOfflineDB, DB_VERSION } from './offlineDb';
import type {
  CatalogCacheEntry,
  ShadowStockEntry,
  OfflineShiftEntry,
  CacheHealthStatus,
  DeviceOfflineReadiness,
  OfflineReadinessBreakdown,
} from './offlineTypes';
import type { Product, StockBalance, CashierShift, ProductCategory } from '@/types/retail.types';

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
   * Safeguard 5 & 19:
   * Checks whether the local cache has completed at least one successful synchronization.
   * Distinguishes first-time devices from prepared devices with durable IndexedDB readiness.
   */
  public async checkCacheHealth(tenantId: string, branchId: string): Promise<CacheHealthStatus> {
    try {
      const db = await getOfflineDB();

      // Resolve tenantId & branchId from active offline device if not passed
      let effectiveTenantId = tenantId;
      let effectiveBranchId = branchId;
      if (!effectiveTenantId || !effectiveBranchId) {
        const activeDevice = await this.getActiveOfflineDevice();
        if (activeDevice) {
          effectiveTenantId = effectiveTenantId || activeDevice.tenantId;
          effectiveBranchId = effectiveBranchId || activeDevice.branchId;
        }
      }

      if (!effectiveTenantId) {
        return {
          isReady: false,
          productCount: 0,
          stockCount: 0,
          categoriesCount: 0,
          reason: 'لم تتم مزامنة الكتالوج أو أرصدة المخزون لهذا الفرع مسبقاً. يلزم الاتصال بالإنترنت مرة واحدة لتحميل بيانات الفرع قبل استخدام وضع عدم الاتصال.',
        };
      }

      const catalogMeta = await db.get('offline_meta', `catalog_synced_${effectiveTenantId}`);
      const stockMeta = await db.get('offline_meta', `stock_synced_${effectiveTenantId}_${effectiveBranchId}`);
      const readinessMeta = await db.get('offline_meta', `device_readiness_${effectiveTenantId}_${effectiveBranchId}`);

      const productCount = await db.countFromIndex('catalog_cache', 'by_tenant', effectiveTenantId);
      const stockCount = effectiveBranchId
        ? await db.countFromIndex('shadow_stock', 'by_branch', effectiveBranchId)
        : 0;
      const categories = await this.getCachedCategories(effectiveTenantId);
      const categoriesCount = categories.length;

      const isDevicePrepared = Boolean(readinessMeta?.value?.cacheReady);
      const hasCatalog = productCount > 0;

      // Case A: Device never prepared and has zero products
      if (!hasCatalog && !isDevicePrepared) {
        return {
          isReady: false,
          productCount: 0,
          stockCount: 0,
          categoriesCount: 0,
          reason: 'لم تتم مزامنة الكتالوج أو أرصدة المخزون لهذا الفرع مسبقاً. يلزم الاتصال بالإنترنت مرة واحدة لتحميل بيانات الفرع قبل استخدام وضع عدم الاتصال.',
        };
      }

      // Case B: Device is prepared or catalog is loaded locally
      const lastCatalogSyncAt = catalogMeta?.value?.timestamp || readinessMeta?.value?.catalogSyncedAt;
      const lastStockSyncAt = stockMeta?.value?.timestamp || readinessMeta?.value?.stockSyncedAt;
      const latestTimestamp = lastCatalogSyncAt || lastStockSyncAt || readinessMeta?.value?.preparedAt;
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
        categoriesCount,
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

  /**
   * Persists durable device readiness metadata in IndexedDB offline_meta.
   */
  public async persistDeviceReadiness(
    tenantId: string,
    branchId: string,
    meta?: Partial<DeviceOfflineReadiness>
  ): Promise<DeviceOfflineReadiness> {
    const db = await getOfflineDB();
    const now = new Date().toISOString();
    const existing = await this.getDeviceReadiness(tenantId, branchId);

    const readiness: DeviceOfflineReadiness = {
      tenantId,
      branchId,
      tenantName: meta?.tenantName || existing?.tenantName || 'MK',
      branchName: meta?.branchName || existing?.branchName || 'الفرع الرئيسي',
      catalogSyncedAt: meta?.catalogSyncedAt || existing?.catalogSyncedAt || now,
      stockSyncedAt: meta?.stockSyncedAt || existing?.stockSyncedAt || now,
      settingsSyncedAt: meta?.settingsSyncedAt || existing?.settingsSyncedAt || now,
      categoriesSyncedAt: meta?.categoriesSyncedAt || existing?.categoriesSyncedAt || now,
      cacheSchemaVersion: DB_VERSION,
      cacheReady: true,
      preparedAt: existing?.preparedAt || now,
    };

    await db.put('offline_meta', {
      key: `device_readiness_${tenantId}_${branchId}`,
      value: readiness,
      updatedAt: now,
    });

    // Store active offline device pointer so boot can resolve tenant and branch without Firestore
    await db.put('offline_meta', {
      key: 'active_offline_device',
      value: { tenantId, branchId },
      updatedAt: now,
    });

    return readiness;
  }

  /**
   * Retrieves durable device readiness metadata from IndexedDB
   */
  public async getDeviceReadiness(
    tenantId: string,
    branchId: string
  ): Promise<DeviceOfflineReadiness | null> {
    try {
      const db = await getOfflineDB();
      const meta = await db.get('offline_meta', `device_readiness_${tenantId}_${branchId}`);
      return meta?.value || null;
    } catch {
      return null;
    }
  }

  /**
   * Retrieves active offline device pointer
   */
  public async getActiveOfflineDevice(): Promise<{ tenantId: string; branchId: string } | null> {
    try {
      const db = await getOfflineDB();
      const meta = await db.get('offline_meta', 'active_offline_device');
      return meta?.value || null;
    } catch {
      return null;
    }
  }

  /**
   * Caches retail product categories into IndexedDB
   */
  public async cacheCategories(tenantId: string, categories: ProductCategory[]): Promise<number> {
    if (!categories || categories.length === 0) return 0;
    const db = await getOfflineDB();
    const now = new Date().toISOString();

    await db.put('offline_meta', {
      key: `categories_${tenantId}`,
      value: categories,
      updatedAt: now,
    });

    return categories.length;
  }

  /**
   * Retrieves cached retail product categories from IndexedDB
   */
  public async getCachedCategories(tenantId: string): Promise<ProductCategory[]> {
    try {
      const db = await getOfflineDB();
      const meta = await db.get('offline_meta', `categories_${tenantId}`);
      return Array.isArray(meta?.value) ? meta.value : [];
    } catch {
      return [];
    }
  }

  /**
   * Caches tenant settings into IndexedDB
   */
  public async cacheSettings(tenantId: string, settings: any): Promise<void> {
    if (!settings) return;
    const db = await getOfflineDB();
    const now = new Date().toISOString();

    await db.put('offline_meta', {
      key: `settings_${tenantId}`,
      value: settings,
      updatedAt: now,
    });
  }

  /**
   * Retrieves cached tenant settings from IndexedDB
   */
  public async getCachedSettings(tenantId: string): Promise<any | null> {
    try {
      const db = await getOfflineDB();
      const meta = await db.get('offline_meta', `settings_${tenantId}`);
      return meta?.value || null;
    } catch {
      return null;
    }
  }

  /**
   * Reconstructs Product[] array from catalog_cache for instant offline UI bootstrap
   */
  public async getCachedCatalog(tenantId: string): Promise<Product[]> {
    try {
      const db = await getOfflineDB();
      const all = await db.getAllFromIndex('catalog_cache', 'by_tenant', tenantId);

      const productMap = new Map<string, Product>();

      for (const entry of all) {
        if (!productMap.has(entry.productId)) {
          productMap.set(entry.productId, {
            id: entry.productId,
            tenantId: entry.tenantId,
            name: entry.hasVariants ? entry.name.replace(/\s*\([^)]*\)$/, '') : entry.name,
            sku: entry.sku,
            barcode: entry.barcode,
            categoryId: entry.categoryId || '',
            categoryName: entry.categoryName || '',
            baseUnitId: entry.unitId || '',
            baseUnitName: entry.unitName || '',
            retailPrice: entry.sellingPrice,
            wholesalePrice: entry.wholesalePrice || 0,
            minimumPrice: entry.minimumPrice || 0,
            purchasePrice: entry.cost || 0,
            taxRate: entry.taxRate ?? 0.14,
            hasVariants: Boolean(entry.hasVariants),
            active: entry.active,
            variants: [],
            createdAt: entry.updatedAt,
            updatedAt: entry.updatedAt,
          } as any);
        }

        const p = productMap.get(entry.productId)!;
        if (entry.variantId) {
          p.hasVariants = true;
          if (!p.variants) p.variants = [];
          const varNameMatch = entry.name.match(/\(([^)]+)\)$/);
          const varName = varNameMatch ? varNameMatch[1] : 'Variant';
          p.variants.push({
            id: entry.variantId,
            productId: entry.productId,
            name: varName,
            sku: entry.sku,
            barcode: entry.barcode,
            price: entry.sellingPrice,
            wholesalePrice: entry.wholesalePrice || 0,
            minimumPrice: entry.minimumPrice || 0,
            cost: entry.cost || 0,
            active: entry.active,
          } as any);
        }
      }

      return Array.from(productMap.values());
    } catch {
      return [];
    }
  }

  /**
   * Prepares and warms this device for offline operation in a single coordinated action.
   */
  public async prepareDeviceForOffline(
    tenantId: string,
    branchId: string,
    options?: {
      products?: Product[];
      categories?: ProductCategory[];
      settings?: any;
      balances?: StockBalance[];
      tenantName?: string;
      branchName?: string;
    }
  ): Promise<DeviceOfflineReadiness> {
    const db = await getOfflineDB();
    const now = new Date().toISOString();

    let productCount = 0;
    if (options?.products && options.products.length > 0) {
      productCount = await this.cacheProductsCatalog(tenantId, options.products);
    } else {
      productCount = await db.countFromIndex('catalog_cache', 'by_tenant', tenantId);
    }

    if (options?.categories && options.categories.length > 0) {
      await this.cacheCategories(tenantId, options.categories);
    }

    if (options?.settings) {
      await this.cacheSettings(tenantId, options.settings);
    }

    if (options?.balances && options.balances.length > 0) {
      await this.cacheStockBalances(tenantId, branchId, options.balances);
    } else if (options?.products && options.products.length > 0) {
      // Synthesize initial shadow stock from products if balances not separately queried
      const initialBalances: StockBalance[] = options.products.map((p) => ({
        productId: p.id,
        variantId: undefined,
        onHandQuantity: p.quantity ?? 100,
        reservedQuantity: 0,
        averageCost: p.purchasePrice ?? 0,
      } as any));
      await this.cacheStockBalances(tenantId, branchId, initialBalances);
    }

    const readiness = await this.persistDeviceReadiness(tenantId, branchId, {
      tenantName: options?.tenantName,
      branchName: options?.branchName,
      catalogSyncedAt: now,
      stockSyncedAt: now,
      settingsSyncedAt: now,
      categoriesSyncedAt: now,
      cacheReady: true,
    });

    return readiness;
  }

  /**
   * Returns explicit breakdown of offline readiness for Settings / System Health display.
   */
  public async getDetailedReadiness(
    tenantId: string,
    branchId: string
  ): Promise<OfflineReadinessBreakdown> {
    try {
      const db = await getOfflineDB();
      const productCount = await db.countFromIndex('catalog_cache', 'by_tenant', tenantId);
      const stockCount = branchId ? await db.countFromIndex('shadow_stock', 'by_branch', branchId) : 0;
      const categories = await this.getCachedCategories(tenantId);
      const settings = await this.getCachedSettings(tenantId);
      const readiness = await this.getDeviceReadiness(tenantId, branchId);

      const hasCatalog = productCount > 0;
      const hasStock = stockCount > 0 || (readiness?.cacheReady && hasCatalog);
      const hasCategories = categories.length > 0;
      const hasSettings = Boolean(settings);
      const hasSession = Boolean(
        typeof window !== 'undefined' &&
          (window.localStorage.getItem('alwan_cached_tenant_branch') ||
            window.localStorage.getItem('alwan_offline_session'))
      );
      const hasPosAssets = typeof navigator !== 'undefined' && 'serviceWorker' in navigator;

      const isFullyReady = hasCatalog && hasStock && (readiness?.cacheReady ?? false);

      return {
        catalog: hasCatalog ? 'ready' : 'missing',
        stock: hasStock ? 'ready' : 'missing',
        settings: hasSettings ? 'ready' : 'missing',
        categories: hasCategories ? 'ready' : 'missing',
        posAssets: hasPosAssets ? 'ready' : 'missing',
        authSession: hasSession ? 'ready' : 'missing',
        lastSyncedAt: readiness?.preparedAt || readiness?.catalogSyncedAt || null,
        isFullyReady,
        catalogCount: productCount,
        stockCount,
        categoriesCount: categories.length,
      };
    } catch {
      return {
        catalog: 'missing',
        stock: 'missing',
        settings: 'missing',
        categories: 'missing',
        posAssets: 'missing',
        authSession: 'missing',
        lastSyncedAt: null,
        isFullyReady: false,
        catalogCount: 0,
        stockCount: 0,
        categoriesCount: 0,
      };
    }
  }
}

export const offlineCacheService = new OfflineCacheService();
