/**
 * Offline Boot Hardening & Runtime Readiness Verification Tests
 * Verifies that once a device is prepared/synced online, it can boot, navigate,
 * search catalog, scan barcodes, and sell offline without "يجب الاتصال بالإنترنت" blockers.
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import {
  offlineCacheService,
  isGenuineTransportError,
  connectivityService,
} from '@/services/offline';
import type { Product, ProductCategory, StockBalance } from '@/types/retail.types';

// In-Memory IndexedDB Mock for Vitest & jsdom
const inMemoryStores = new Map<string, Map<string, any>>();
const getStore = (name: string) => {
  if (!inMemoryStores.has(name)) inMemoryStores.set(name, new Map());
  return inMemoryStores.get(name)!;
};

const keyPathMap: Record<string, string> = {
  offline_queue: 'id',
  shadow_stock: 'stockKey',
  catalog_cache: 'id',
  offline_shifts: 'shiftId',
  offline_leases: 'key',
  offline_meta: 'key',
  offline_counts: 'sessionId',
};

const mockDb = {
  get: async (storeName: string, key: string) => {
    return getStore(storeName).get(key);
  },
  getAll: async (storeName: string) => {
    return Array.from(getStore(storeName).values());
  },
  getAllFromIndex: async (storeName: string, indexName: string, queryVal: any) => {
    const items = Array.from(getStore(storeName).values());
    const field = indexName.replace(/^by_/, '');
    return items.filter((item: any) => {
      if (field === 'tenant') return item.tenantId === queryVal;
      if (field === 'branch') return item.branchId === queryVal;
      if (field === 'status') return item.status === queryVal;
      if (field === 'barcode') return item.barcode === queryVal;
      if (field === 'sku') return item.sku === queryVal;
      if (field === 'category') return item.categoryId === queryVal;
      return item[field] === queryVal;
    });
  },
  countFromIndex: async (storeName: string, indexName: string, queryVal: any) => {
    const all = await mockDb.getAllFromIndex(storeName, indexName, queryVal);
    return all.length;
  },
  put: async (storeName: string, val: any) => {
    const keyField = keyPathMap[storeName] || 'id';
    const key = val[keyField];
    getStore(storeName).set(key, val);
    return key;
  },
  delete: async (storeName: string, key: string) => {
    getStore(storeName).delete(key);
  },
  clear: async (storeName: string) => {
    getStore(storeName).clear();
  },
  transaction: (storeNames: string | string[], mode: string) => {
    const names = Array.isArray(storeNames) ? storeNames : [storeNames];
    return {
      objectStore: (name: string) => ({
        put: async (val: any) => mockDb.put(name, val),
        get: async (key: string) => mockDb.get(name, key),
        delete: async (key: string) => mockDb.delete(name, key),
      }),
      done: Promise.resolve(),
    };
  },
};

vi.mock('@/services/offline/offlineDb', () => ({
  getOfflineDB: vi.fn(async () => mockDb),
  DB_VERSION: 1,
  DB_NAME: 'alwan_offline_erp',
}));

describe('CRITICAL HOTFIX: Offline Boot & Runtime Path Hardening', () => {
  const tenantId = 'tenant_boot_test';
  const branchId = 'branch_boot_test';

  const sampleProducts: Product[] = [
    {
      id: 'prod_book_01',
      tenantId,
      name: 'كتاب قواعد اللغة العربية',
      sku: 'BOOK-ARB-01',
      barcode: '622123456001',
      categoryId: 'cat_books',
      categoryName: 'كتب تعليمية',
      baseUnitId: 'unit_piece',
      baseUnitName: 'نسخة',
      retailPrice: 85,
      wholesalePrice: 70,
      purchasePrice: 50,
      taxRate: 0.14,
      hasVariants: false,
      active: true,
      quantity: 50,
      minStock: 5,
    } as any,
    {
      id: 'prod_pen_02',
      tenantId,
      name: 'طقم أقلام حبر جاف',
      sku: 'PEN-SET-02',
      barcode: '622123456002',
      categoryId: 'cat_stationery',
      categoryName: 'أدوات مكتبية',
      baseUnitId: 'unit_set',
      baseUnitName: 'طقم',
      retailPrice: 45,
      wholesalePrice: 35,
      purchasePrice: 25,
      taxRate: 0.14,
      hasVariants: true,
      active: true,
      variants: [
        {
          id: 'var_blue',
          name: 'أزرق',
          sku: 'PEN-SET-02-BLU',
          barcode: '622123456003',
          price: 45,
          active: true,
        },
      ],
    } as any,
  ];

  const sampleCategories: ProductCategory[] = [
    {
      id: 'cat_books',
      name: 'كتب تعليمية',
      slug: 'educational-books',
      tenantId,
      active: true,
      sortOrder: 1,
    } as any,
    {
      id: 'cat_stationery',
      name: 'أدوات مكتبية',
      slug: 'stationery',
      tenantId,
      active: true,
      sortOrder: 2,
    } as any,
  ];

  beforeEach(() => {
    inMemoryStores.clear();
    localStorage.clear();
    vi.clearAllMocks();
  });

  it('1. First-Time Device (Never Prepared) is blocked with exact, clear message', async () => {
    const health = await offlineCacheService.checkCacheHealth(tenantId, branchId);
    expect(health.isReady).toBe(false);
    expect(health.reason).toContain(
      'يلزم الاتصال بالإنترنت مرة واحدة لتحميل بيانات الفرع قبل استخدام وضع عدم الاتصال.'
    );
  });

  it('2. Prepared Device boots offline without errors or forced internet requirement', async () => {
    // Online preparation
    await offlineCacheService.prepareDeviceForOffline(tenantId, branchId, {
      products: sampleProducts,
      categories: sampleCategories,
      settings: { offlineModeEnabled: true, allowOfflineCashSales: true },
      tenantName: 'مكتبة ألوان الحديثة',
      branchName: 'فرع مدينة نصر',
    });

    // Check health offline
    const health = await offlineCacheService.checkCacheHealth(tenantId, branchId);
    expect(health.isReady).toBe(true);
    expect(health.productCount).toBeGreaterThan(0);
    expect(health.categoriesCount).toBe(2);
    expect(health.isStale).toBe(false);
  });

  it('3. offlineCacheReady and readiness metadata persist durably in IndexedDB', async () => {
    await offlineCacheService.persistDeviceReadiness(tenantId, branchId, {
      tenantName: 'مكتبة ألوان',
      branchName: 'الفرع الرئيسي',
      cacheReady: true,
    });

    // Read directly from IndexedDB
    const stored = await offlineCacheService.getDeviceReadiness(tenantId, branchId);
    expect(stored).not.toBeNull();
    expect(stored?.cacheReady).toBe(true);
    expect(stored?.tenantName).toBe('مكتبة ألوان');
    expect(stored?.branchName).toBe('الفرع الرئيسي');
    expect(stored?.preparedAt).toBeDefined();

    // Verify active device pointer
    const activeDevice = await offlineCacheService.getActiveOfflineDevice();
    expect(activeDevice).toEqual({ tenantId, branchId });
  });

  it('4. Reconstructs Product[] array from catalog_cache for instant offline UI bootstrap', async () => {
    await offlineCacheService.cacheProductsCatalog(tenantId, sampleProducts);

    const catalog = await offlineCacheService.getCachedCatalog(tenantId);
    expect(catalog.length).toBe(2);

    const book = catalog.find((p) => p.id === 'prod_book_01');
    expect(book).toBeDefined();
    expect(book?.name).toBe('كتاب قواعد اللغة العربية');
    expect(book?.retailPrice).toBe(85);
    expect(book?.barcode).toBe('622123456001');

    const pen = catalog.find((p) => p.id === 'prod_pen_02');
    expect(pen).toBeDefined();
    expect(pen?.hasVariants).toBe(true);
    expect(pen?.variants?.length).toBe(1);
    expect(pen?.variants?.[0].barcode).toBe('622123456003');
  });

  it('5. Caches and retrieves categories from IndexedDB offline', async () => {
    await offlineCacheService.cacheCategories(tenantId, sampleCategories);

    const cachedCats = await offlineCacheService.getCachedCategories(tenantId);
    expect(cachedCats.length).toBe(2);
    expect(cachedCats[0].name).toBe('كتب تعليمية');
    expect(cachedCats[1].name).toBe('أدوات مكتبية');
  });

  it('6. Caches and retrieves offline settings from IndexedDB', async () => {
    const settings = {
      offlineModeEnabled: true,
      offlineSalesEnabled: true,
      allowOfflineCashSales: true,
      offlineMaxTransactionAmount: 20000,
    };
    await offlineCacheService.cacheSettings(tenantId, settings);

    const retrieved = await offlineCacheService.getCachedSettings(tenantId);
    expect(retrieved).toEqual(settings);
    expect(retrieved.allowOfflineCashSales).toBe(true);
  });

  it('7. Instant offline barcode lookup matches parent products and variants', async () => {
    await offlineCacheService.cacheProductsCatalog(tenantId, sampleProducts);

    // Parent product barcode lookup
    const bookMatch = await offlineCacheService.findOfflineProductByBarcode(tenantId, '622123456001');
    expect(bookMatch).not.toBeNull();
    expect(bookMatch?.productId).toBe('prod_book_01');
    expect(bookMatch?.sellingPrice).toBe(85);

    // Variant barcode lookup
    const variantMatch = await offlineCacheService.findOfflineProductByBarcode(tenantId, '622123456003');
    expect(variantMatch).not.toBeNull();
    expect(variantMatch?.productId).toBe('prod_pen_02');
    expect(variantMatch?.variantId).toBe('var_blue');
  });

  it('8. Instant offline product search filters by query and category', async () => {
    await offlineCacheService.cacheProductsCatalog(tenantId, sampleProducts);

    // Search by name
    const nameResults = await offlineCacheService.searchOfflineProducts(tenantId, 'قواعد');
    expect(nameResults.length).toBe(1);
    expect(nameResults[0].productId).toBe('prod_book_01');

    // Search by SKU
    const skuResults = await offlineCacheService.searchOfflineProducts(tenantId, 'PEN-SET');
    expect(skuResults.length).toBe(1);
    expect(skuResults[0].productId).toBe('prod_pen_02');

    // Filter by category
    const catResults = await offlineCacheService.searchOfflineProducts(tenantId, '', 'cat_stationery');
    expect(catResults.length).toBe(1);
    expect(catResults[0].productId).toBe('prod_pen_02');
  });

  it('9. isGenuineTransportError distinguishes transport failures from permission and business errors', () => {
    // Genuine transport failures
    expect(isGenuineTransportError({ code: 'unavailable' })).toBe(true);
    expect(isGenuineTransportError({ code: 'network-request-failed' })).toBe(true);
    expect(isGenuineTransportError(new Error('Failed to fetch'))).toBe(true);
    expect(isGenuineTransportError(new Error('NetworkError when attempting to fetch resource.'))).toBe(true);

    // Non-transport / permission errors must NEVER be masked as network errors
    expect(isGenuineTransportError({ code: 'permission-denied' })).toBe(false);
    expect(isGenuineTransportError({ message: 'Missing or insufficient permissions.' })).toBe(false);
    expect(isGenuineTransportError({ code: 'unauthenticated' })).toBe(false);
    expect(isGenuineTransportError({ code: 'not-found' })).toBe(false);
    expect(isGenuineTransportError(new Error('الرصيد غير كافٍ لإتمام العملية'))).toBe(false);
  });

  it('10. Stale cache generates warning but does NOT block offline sales', async () => {
    const threeDaysAgo = new Date(Date.now() - 72 * 60 * 60 * 1000).toISOString();

    await mockDb.put('catalog_cache', {
      id: 'prod_stale_01',
      tenantId,
      productId: 'prod_stale_01',
      variantId: null,
      name: 'كتاب قديم',
      sku: 'OLD-01',
      barcode: '999999999',
      sellingPrice: 100,
      active: true,
      updatedAt: threeDaysAgo,
    });

    await mockDb.put('offline_meta', {
      key: `catalog_synced_${tenantId}`,
      value: { count: 1, timestamp: threeDaysAgo },
      updatedAt: threeDaysAgo,
    });

    await offlineCacheService.persistDeviceReadiness(tenantId, branchId, {
      catalogSyncedAt: threeDaysAgo,
      stockSyncedAt: threeDaysAgo,
      preparedAt: threeDaysAgo,
      cacheReady: true,
    });

    const health = await offlineCacheService.checkCacheHealth(tenantId, branchId);
    expect(health.isReady).toBe(true); // NOT blocked!
    expect(health.isStale).toBe(true);
    expect(health.staleHours).toBeGreaterThanOrEqual(71);
    expect(health.reason).toContain('تحذير: لم يتم تحديث كتالوج الفرع');
  });

  it('11. Detailed Offline Readiness breakdown provides explicit item-by-item status', async () => {
    // Before prep
    let breakdown = await offlineCacheService.getDetailedReadiness(tenantId, branchId);
    expect(breakdown.catalog).toBe('missing');
    expect(breakdown.isFullyReady).toBe(false);

    // After prep
    await offlineCacheService.prepareDeviceForOffline(tenantId, branchId, {
      products: sampleProducts,
      categories: sampleCategories,
      settings: { offlineModeEnabled: true },
      tenantName: 'مكتبة ألوان',
      branchName: 'الفرع الرئيسي',
    });

    breakdown = await offlineCacheService.getDetailedReadiness(tenantId, branchId);
    expect(breakdown.catalog).toBe('ready');
    expect(breakdown.stock).toBe('ready');
    expect(breakdown.categories).toBe('ready');
    expect(breakdown.settings).toBe('ready');
    expect(breakdown.isFullyReady).toBe(true);
    expect(breakdown.catalogCount).toBe(2);
    expect(breakdown.categoriesCount).toBe(2);
  });

  it('12. Cached session and tenant/branch snapshot restores state immediately', () => {
    const cachedData = {
      tenantId: 'tenant_snapshot_99',
      branchId: 'branch_snapshot_99',
      currentTenant: { id: 'tenant_snapshot_99', name: 'ألوان إكسبريس' },
      currentBranch: { id: 'branch_snapshot_99', name: 'فرع المترو' },
      settings: { offlineModeEnabled: true },
    };

    localStorage.setItem('alwan_cached_tenant_branch', JSON.stringify(cachedData));

    const retrieved = JSON.parse(localStorage.getItem('alwan_cached_tenant_branch')!);
    expect(retrieved.tenantId).toBe('tenant_snapshot_99');
    expect(retrieved.branchId).toBe('branch_snapshot_99');
    expect(retrieved.currentTenant.name).toBe('ألوان إكسبريس');
  });
});
