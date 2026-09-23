/**
 * Offline-First Resilience & Automatic Sync Engine
 * Core Domain Models & Types
 */

import type { PaymentEntry, Sale } from '@/types/retail.types';

export type OfflineOperationStatus =
  | 'pending'
  | 'syncing'
  | 'synced'
  | 'conflict'
  | 'failed'
  | 'cancelled'
  | 'awaiting_confirmation';

export type OfflineOperationType =
  | 'pos_sale'
  | 'inventory_count_session'
  | 'inventory_count_scan'
  | 'customer_draft'
  | 'shift_close';

export interface OfflineOperation<TPayload = unknown> {
  id: string;
  tenantId: string;
  branchId: string;
  operationType: OfflineOperationType;
  idempotencyKey: string;
  payload: TPayload;
  status: OfflineOperationStatus;
  priority: number; // 1 (highest) to 5
  createdAt: string;
  updatedAt: string;
  createdBy: string;
  createdByUserId?: string;
  retryCount: number;
  lastAttemptAt?: string;
  nextRetryAt?: string;
  serverReferenceId?: string;
  errorCode?: string;
  errorMessage?: string;
  dependencyIds?: string[];
  conflictKey?: string; // Entity serialization key (e.g. stockKey or shiftId)
  clientSnapshot?: {
    temporaryReceiptNumber?: string;
    grandTotal?: number;
    priceSnapshot?: Record<string, number>;
    stockSnapshot?: Record<string, number>;
    shiftId?: string;
  };
  schemaVersion: number;
  operationVersion: number;
}

export interface ShadowStockEntry {
  stockKey: string; // `${tenantId}___${branchId}___${productId}___${variantId || 'main'}`
  tenantId: string;
  branchId: string;
  productId: string;
  variantId: string | null;
  onHand: number;
  available: number;
  reserved: number;
  averageCost: number;
  lastSyncedAt: string;
  lastLocallyModifiedAt: string;
}

export interface CatalogCacheEntry {
  id: string; // productId or `${productId}___${variantId}`
  tenantId: string;
  productId: string;
  variantId: string | null;
  name: string;
  sku: string;
  barcode: string;
  categoryId?: string | null;
  categoryName?: string | null;
  unitId?: string | null;
  unitName?: string | null;
  sellingPrice: number;
  wholesalePrice?: number;
  minimumPrice?: number;
  taxRate?: number;
  cost?: number;
  hasVariants?: boolean;
  active: boolean;
  updatedAt: string;
}

export interface OfflineShiftEntry {
  shiftId: string;
  tenantId: string;
  branchId: string;
  cashierId: string;
  cashierName: string;
  shiftNumber: string;
  openedAt: string;
  startingCash: number;
  serverExpectedCash: number;
  serverExpectedCard: number;
  shadowExpectedCash: number;
  shadowExpectedCard: number;
  pendingSalesCount: number;
  status: 'open' | 'pending_close';
  lastSyncedAt: string;
}

export interface OfflineLease {
  key: string; // 'sync_leader'
  leaderId: string;
  acquiredAt: number;
  leaseUntil: number;
  heartbeatAt: number;
}

export type ConnectivityStatus = 'online' | 'offline' | 'reconnecting' | 'degraded';

export interface CacheHealthStatus {
  isReady: boolean;
  lastSyncedAt?: string;
  lastCatalogSyncAt?: string;
  lastStockSyncAt?: string;
  lastSettingsSyncAt?: string;
  isStale?: boolean;
  staleHours?: number;
  productCount: number;
  stockCount: number;
  categoriesCount: number;
  reason?: string;
}

export interface DeviceOfflineReadiness {
  tenantId: string;
  branchId: string;
  tenantName?: string;
  branchName?: string;
  catalogSyncedAt?: string;
  stockSyncedAt?: string;
  settingsSyncedAt?: string;
  categoriesSyncedAt?: string;
  cacheSchemaVersion: number;
  cacheReady: boolean;
  preparedAt: string;
}

export interface OfflineReadinessBreakdown {
  catalog: 'ready' | 'missing';
  stock: 'ready' | 'missing';
  settings: 'ready' | 'missing';
  categories: 'ready' | 'missing';
  posAssets: 'ready' | 'missing';
  authSession: 'ready' | 'missing';
  lastSyncedAt: string | null;
  isFullyReady: boolean;
  catalogCount: number;
  stockCount: number;
  categoriesCount: number;
}

export interface OfflineSettings {
  offlineModeEnabled: boolean;
  offlineSalesEnabled: boolean;
  allowOfflineCashSales: boolean;
  allowOfflineCreditSales: boolean;
  allowOfflineCardRecordedSales: boolean;
  offlineMaxTransactionAmount: number;
  offlineMaxPendingSales: number;
  offlineStockSafetyBuffer: number;
  honorOfflinePriceSnapshot: boolean;
  offlineCacheMaxAgeHours: number;
}

export const DEFAULT_OFFLINE_SETTINGS: OfflineSettings = {
  offlineModeEnabled: true,
  offlineSalesEnabled: true,
  allowOfflineCashSales: true,
  allowOfflineCreditSales: false, // Default false: strict financial limit safety
  allowOfflineCardRecordedSales: true, // Only if confirmed on external physical terminal
  offlineMaxTransactionAmount: 15000,
  offlineMaxPendingSales: 100,
  offlineStockSafetyBuffer: 0,
  honorOfflinePriceSnapshot: false, // Triggers review if server price changed
  offlineCacheMaxAgeHours: 48,
};

export interface OfflineSalePayload {
  tenantId: string;
  branchId: string;
  branchCode: string;
  cashierId: string;
  cashierNameSnapshot: string;
  customerId: string | null;
  customerNameSnapshot: string;
  customerPhoneSnapshot: string;
  shiftId: string | null;
  saleType: 'retail' | 'wholesale';
  items: Array<{
    productId: string;
    variantId?: string | null;
    productName: string;
    variantName?: string;
    sku?: string;
    barcode?: string;
    categoryName?: string;
    brandName?: string;
    quantity: number;
    inputUnitId?: string;
    conversionFactor?: number;
    unitSellingPrice: number;
    originalUnitPrice?: number;
    discountAmount?: number;
    taxRate?: number;
    priceSource?: string;
    minimumSellingPrice?: number;
  }>;
  payments: PaymentEntry[];
  cartDiscountAmount?: number;
  discountType?: 'percentage' | 'fixed';
  discountValue?: number;
  serviceChargeRate?: number;
  serviceChargeAmount?: number;
  taxIncluded?: boolean;
  serviceChargeIncluded?: boolean;
  clientCheckoutId: string;
  temporaryReceiptNumber: string;
  externalPaymentConfirmed?: boolean;
  externalReference?: string;
  notes?: string;
}
