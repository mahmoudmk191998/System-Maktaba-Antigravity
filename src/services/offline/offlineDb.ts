/**
 * Offline-First IndexedDB Storage Layer
 * Built on native 'idb' with atomic multi-store transactions,
 * zero localStorage usage, and durable lease & queue mechanisms.
 */

import { openDB, IDBPDatabase } from 'idb';
import type {
  OfflineOperation,
  ShadowStockEntry,
  CatalogCacheEntry,
  OfflineShiftEntry,
  OfflineLease,
  OfflineSettings,
  DEFAULT_OFFLINE_SETTINGS,
} from './offlineTypes';

export const DB_NAME = 'alwan_offline_erp';
export const DB_VERSION = 1;

export interface AlwanOfflineDBSchema {
  offline_queue: {
    key: string;
    value: OfflineOperation<any>;
    indexes: {
      by_status: string;
      by_tenant: string;
      by_branch: string;
      by_type: string;
      by_idempotency: string;
      by_created_at: string;
    };
  };
  shadow_stock: {
    key: string;
    value: ShadowStockEntry;
    indexes: {
      by_tenant: string;
      by_branch: string;
      by_product: string;
    };
  };
  catalog_cache: {
    key: string;
    value: CatalogCacheEntry;
    indexes: {
      by_barcode: string;
      by_sku: string;
      by_category: string;
      by_tenant: string;
    };
  };
  offline_shifts: {
    key: string;
    value: OfflineShiftEntry;
    indexes: {
      by_tenant: string;
      by_branch: string;
    };
  };
  offline_leases: {
    key: string;
    value: OfflineLease;
  };
  offline_meta: {
    key: string;
    value: { key: string; value: any; updatedAt: string };
  };
  offline_counts: {
    key: string;
    value: any;
    indexes: {
      by_tenant: string;
      by_branch: string;
      by_status: string;
    };
  };
}

let dbPromise: Promise<IDBPDatabase<AlwanOfflineDBSchema>> | null = null;

export async function getOfflineDB(): Promise<IDBPDatabase<AlwanOfflineDBSchema>> {
  if (dbPromise) return dbPromise;

  dbPromise = openDB<AlwanOfflineDBSchema>(DB_NAME, DB_VERSION, {
    upgrade(db, oldVersion, newVersion, transaction) {
      // 1. offline_queue
      if (!db.objectStoreNames.contains('offline_queue')) {
        const queueStore = db.createObjectStore('offline_queue', { keyPath: 'id' });
        queueStore.createIndex('by_status', 'status');
        queueStore.createIndex('by_tenant', 'tenantId');
        queueStore.createIndex('by_branch', 'branchId');
        queueStore.createIndex('by_type', 'operationType');
        queueStore.createIndex('by_idempotency', 'idempotencyKey', { unique: false });
        queueStore.createIndex('by_created_at', 'createdAt');
      }

      // 2. shadow_stock
      if (!db.objectStoreNames.contains('shadow_stock')) {
        const stockStore = db.createObjectStore('shadow_stock', { keyPath: 'stockKey' });
        stockStore.createIndex('by_tenant', 'tenantId');
        stockStore.createIndex('by_branch', 'branchId');
        stockStore.createIndex('by_product', 'productId');
      }

      // 3. catalog_cache
      if (!db.objectStoreNames.contains('catalog_cache')) {
        const catalogStore = db.createObjectStore('catalog_cache', { keyPath: 'id' });
        catalogStore.createIndex('by_barcode', 'barcode');
        catalogStore.createIndex('by_sku', 'sku');
        catalogStore.createIndex('by_category', 'categoryId');
        catalogStore.createIndex('by_tenant', 'tenantId');
      }

      // 4. offline_shifts
      if (!db.objectStoreNames.contains('offline_shifts')) {
        const shiftStore = db.createObjectStore('offline_shifts', { keyPath: 'shiftId' });
        shiftStore.createIndex('by_tenant', 'tenantId');
        shiftStore.createIndex('by_branch', 'branchId');
      }

      // 5. offline_leases
      if (!db.objectStoreNames.contains('offline_leases')) {
        db.createObjectStore('offline_leases', { keyPath: 'key' });
      }

      // 6. offline_meta
      if (!db.objectStoreNames.contains('offline_meta')) {
        db.createObjectStore('offline_meta', { keyPath: 'key' });
      }

      // 7. offline_counts
      if (!db.objectStoreNames.contains('offline_counts')) {
        const countStore = db.createObjectStore('offline_counts', { keyPath: 'sessionId' });
        countStore.createIndex('by_tenant', 'tenantId');
        countStore.createIndex('by_branch', 'branchId');
        countStore.createIndex('by_status', 'status');
      }
    },
    blocked() {
      console.warn('Alwan Offline Database upgrade blocked by another tab');
    },
    blocking() {
      console.warn('Alwan Offline Database is blocking a database upgrade in another tab');
    },
  });

  return dbPromise;
}

/**
 * Gets or initializes the unique Device Installation UUID.
 * Never uses hardware fingerprints or sensitive hardware properties.
 */
export async function getOrCreateDeviceId(): Promise<string> {
  const db = await getOfflineDB();
  const existing = await db.get('offline_meta', 'device_id');
  if (existing && existing.value) {
    return existing.value as string;
  }

  const newDeviceId = typeof crypto !== 'undefined' && crypto.randomUUID
    ? crypto.randomUUID()
    : 'dev_' + Math.random().toString(36).substring(2, 10) + Date.now().toString(36);

  await db.put('offline_meta', {
    key: 'device_id',
    value: newDeviceId,
    updatedAt: new Date().toISOString(),
  });

  return newDeviceId;
}

let localReceiptCounter = 0;

/**
 * Generates high-entropy temporary receipt number.
 * Format: OFF-{branchShort}-{deviceShort}-{timestamp36}-{seq}-{entropy}
 * Guaranteed practical cross-device uniqueness and clearly distinct from final server invoice numbers.
 */
export async function generateTemporaryReceiptNumber(tenantId: string, branchCode: string): Promise<string> {
  const deviceId = await getOrCreateDeviceId();
  const deviceShort = deviceId.replace(/[^a-zA-Z0-9]/g, '').slice(-4).toUpperCase();
  const branchShort = (branchCode || 'HQ').replace(/[^a-zA-Z0-9]/g, '').slice(0, 3).toUpperCase();
  const time36 = Date.now().toString(36).toUpperCase();
  localReceiptCounter = (localReceiptCounter + 1) % 1000000;
  const seq = localReceiptCounter.toString(36).padStart(4, '0').toUpperCase();
  const entropy = typeof crypto !== 'undefined' && crypto.randomUUID
    ? crypto.randomUUID().replace(/[^a-zA-Z0-9]/g, '').slice(0, 6).toUpperCase()
    : Math.random().toString(36).substring(2, 8).toUpperCase();

  return `OFF-${branchShort}-${deviceShort}-${time36}-${seq}-${entropy}`;
}

/**
 * Resets the in-memory DB connection (useful for tests and migrations)
 */
export function resetDbPromiseForTests() {
  dbPromise = null;
}
