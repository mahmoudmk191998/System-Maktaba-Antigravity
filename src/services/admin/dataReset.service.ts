/**
 * Strict tenant data reset service.
 *
 * Goals:
 * - Delete the tenant's operational/test data from Firestore itself (server reads only).
 * - Never report success when a collection failed or documents are still present.
 * - Delete legacy child documents that do not carry tenantId by following their parent IDs.
 * - Preserve authentication / tenant identity / user profiles / roles / branch definitions.
 * - Reset analytics migration state so deleted reports cannot be rebuilt from stale legacy data.
 */

import { db } from '@/lib/firebase';
import {
  collection,
  doc,
  getDocsFromServer,
  query,
  where,
  writeBatch,
  setDoc,
  deleteDoc,
  type DocumentReference,
  type QueryConstraint,
} from 'firebase/firestore';
import { MIGRATION_VERSION } from '@/services/analytics/statsMigration.service';

export interface DataWipeOptions {
  tenantId: string;
  branchId?: string | null;
  onProgress?: (message: string, percent: number) => void;
  preserveMainBranch?: boolean;
}

export interface DataWipeVerification {
  collectionsChecked: number;
  remainingDocuments: number;
  failedCollections: string[];
  leftovers: Array<{ collection: string; count: number }>;
}

export interface DataWipeResult {
  success: boolean;
  totalDocumentsDeleted: number;
  collectionsProcessed: number;
  reinitializedUnitsCount: number;
  verification: DataWipeVerification;
  error?: string;
}

/**
 * Persistent identity/config collections intentionally preserved by "مسح جميع البيانات".
 * The action is a tenant operational reset, not an account deletion.
 */
export const RESET_PRESERVED_COLLECTIONS = [
  'tenants',
  'branches',
  'profiles',
  'users',
  'user_roles',
  'user_permissions',
  'hr_settings',
  'audit_logs',
  'settings_audit_log',
  'backups',
  'restore_jobs',
] as const;

/**
 * Canonical wipe registry.
 * Includes current retail collections, accounting/analytics projections, idempotency locks,
 * and legacy collections that were historically read by reports.
 *
 * Keeping harmless non-existing collection names here is intentional: an empty collection
 * returns an empty query and gives us forward/backward compatibility.
 */
export const TENANT_COLLECTIONS_TO_WIPE: readonly string[] = [
  // Catalog / product identity
  'products',
  'product_variants',
  'product_skus',
  'product_barcodes',
  'categories',
  'brands',
  'attributes',
  'addons',
  'units',
  'price_lists',
  'price_list_items',
  'customer_product_prices',

  // Inventory
  'branch_stock',
  'stock_movements',
  'inventory_items',
  'inventory_locations',
  'inventory_counts',
  'branch_transfers',
  'damage_loss_records',

  // Sales / invoices / POS
  'sales',
  'invoices',
  'sale_items',
  'sale_payments',
  'sale_returns',
  'sales_returns',
  'sale_return_items',
  'sales_return_items',
  'sale_refunds',
  'sale_exchanges',
  'held_sales',
  'orders',
  'order_items',
  'order_status_history',
  'payments',
  'call_center_orders',
  'cashier_shifts',
  'cash_register_shifts',
  'cash_shifts',
  'cash_register_transactions',
  'pos_shifts',

  // Customers / receivables
  'customers',
  'customer_ledgers',
  'customer_ledger',
  'customer_receivables',
  'customer_payments',
  'customer_payment_allocations',

  // Purchasing / suppliers
  'purchases',
  'purchase_orders',
  'purchase_order_items',
  'goods_receipts',
  'goods_receipt_items',
  'purchase_returns',
  'purchase_return_items',
  'suppliers',
  'supplier_products',
  'supplier_ledgers',
  'supplier_ledger',
  'supplier_payments',

  // Expenses / closing / maintenance
  'expenses',
  'daily_closings',
  'maintenance_records',

  // HR operational data (accounts/profiles remain preserved)
  'employees',
  'payrolls',
  'advances',
  'advance_installments',
  'salary_payments',
  'employee_leaves',
  'attendance',
  'shifts',
  'branch_shifts',
  'drivers',

  // Accounting operational ledger/config generated during test operation
  'accounting_records',
  'accounting_events',
  'journal_entries',
  'journal_lines',
  'journal_idempotency',
  'account_code_index',
  'financial_accounts',
  'fiscal_periods',
  'fiscal_years',
  'chart_of_accounts',
  'accounting_settings',
  'opening_balance_migrations',

  // Analytics / projections / migration ledgers
  'stats_daily',
  'stats_monthly',
  'daily_analytics_metrics',
  'analytics_settings',
  'reorder_settings',
  'season_definitions',
  'system_migrations',

  // Idempotency / counters
  'sale_idempotency',
  'return_idempotency',
  'purchase_idempotency',
  'customer_idempotency',
  'stock_idempotency',
  'sequence_counters',
  'branch_counters',

  // Marketing / notifications / governance operational records
  'promotions',
  'coupons',
  'offers',
  'notifications',
  'notification_reads',
  'approval_requests',
  'approval_steps',
  'attachments',

  // Legacy restaurant-era collections that can still be referenced by compatibility code
  'menu_categories',
  'menu_items',
  'tables',
  'recipes',
  'recipe_ingredients',
  'production_batches',
  'prep_lists',
  'reservations',
  'delivery_zones',
];

/**
 * Collections commonly carrying branch references even when tenantId was absent in old data.
 * We query these using every branch belonging to the tenant, not only the currently selected branch.
 */
const BRANCH_SCOPED_COLLECTIONS = new Set<string>([
  'branch_stock',
  'stock_movements',
  'inventory_counts',
  'branch_transfers',
  'damage_loss_records',
  'sales',
  'invoices',
  'orders',
  'payments',
  'cashier_shifts',
  'cash_register_shifts',
  'cash_shifts',
  'cash_register_transactions',
  'pos_shifts',
  'expenses',
  'daily_closings',
  'attendance',
  'branch_shifts',
  'maintenance_records',
]);

type ParentKey =
  | 'products'
  | 'orders'
  | 'sales'
  | 'returns'
  | 'journals'
  | 'recipes'
  | 'priceLists'
  | 'customerPayments'
  | 'approvalRequests'
  | 'notifications'
  | 'purchaseOrders'
  | 'goodsReceipts';

interface RelatedCollectionSpec {
  parent: ParentKey;
  fields: string[];
}

/**
 * Some historical child collections were written without tenantId.
 * They must be removed by following IDs of tenant-owned parent documents captured BEFORE deletion.
 */
const RELATED_COLLECTIONS: Record<string, RelatedCollectionSpec> = {
  product_variants: { parent: 'products', fields: ['productId', 'product_id'] },
  order_items: { parent: 'orders', fields: ['orderId', 'order_id'] },
  order_status_history: { parent: 'orders', fields: ['orderId', 'order_id'] },
  sale_items: { parent: 'sales', fields: ['saleId', 'sale_id'] },
  sale_payments: { parent: 'sales', fields: ['saleId', 'sale_id'] },
  sale_return_items: { parent: 'returns', fields: ['returnId', 'saleReturnId', 'return_id', 'sale_return_id'] },
  sales_return_items: { parent: 'returns', fields: ['returnId', 'saleReturnId', 'return_id', 'sale_return_id'] },
  journal_lines: { parent: 'journals', fields: ['journalEntryId', 'journal_entry_id'] },
  recipe_ingredients: { parent: 'recipes', fields: ['recipeId', 'recipe_id'] },
  price_list_items: { parent: 'priceLists', fields: ['priceListId', 'price_list_id'] },
  customer_payment_allocations: { parent: 'customerPayments', fields: ['customerPaymentId', 'paymentId', 'payment_id'] },
  approval_steps: { parent: 'approvalRequests', fields: ['approvalRequestId', 'requestId', 'approval_request_id'] },
  notification_reads: { parent: 'notifications', fields: ['notificationId', 'notification_id'] },
  purchase_order_items: { parent: 'purchaseOrders', fields: ['purchaseOrderId', 'purchase_order_id'] },
  goods_receipt_items: { parent: 'goodsReceipts', fields: ['goodsReceiptId', 'goods_receipt_id'] },
  purchase_return_items: { parent: 'goodsReceipts', fields: ['goodsReceiptId', 'goods_receipt_id'] },
};

export const DEFAULT_STANDARD_UNITS = [
  { name: 'قطعة', abbreviation: 'قطعة', type: 'count' },
  { name: 'علبة', abbreviation: 'علبة', type: 'count' },
  { name: 'كرتونة', abbreviation: 'كرتونة', type: 'count' },
  { name: 'دستة', abbreviation: 'دستة', type: 'count' },
  { name: 'رزمة', abbreviation: 'رزمة', type: 'count' },
  { name: 'باكيت', abbreviation: 'باكيت', type: 'count' },
  { name: 'متر', abbreviation: 'م', type: 'length' },
  { name: 'سنتيمتر', abbreviation: 'سم', type: 'length' },
  { name: 'كيلوجرام', abbreviation: 'كجم', type: 'weight' },
  { name: 'جرام', abbreviation: 'جم', type: 'weight' },
];

const IN_QUERY_CHUNK = 25;
const DELETE_BATCH_SIZE = 350;

function uniqueRefs(refs: DocumentReference[]): DocumentReference[] {
  const map = new Map<string, DocumentReference>();
  refs.forEach((ref) => map.set(ref.path, ref));
  return Array.from(map.values());
}

function chunkArray<T>(items: T[], size: number): T[][] {
  if (items.length === 0) return [];
  const result: T[][] = [];
  for (let i = 0; i < items.length; i += size) {
    result.push(items.slice(i, i + size));
  }
  return result;
}

async function queryRefs(
  collectionName: string,
  constraints: QueryConstraint[]
): Promise<DocumentReference[]> {
  const snap = await getDocsFromServer(query(collection(db, collectionName), ...constraints));
  return snap.docs.map((d) => d.ref);
}

async function queryIdsByTenant(collectionName: string, tenantId: string): Promise<string[]> {
  const refs = [
    ...(await queryRefs(collectionName, [where('tenantId', '==', tenantId)])),
    ...(await queryRefs(collectionName, [where('tenant_id', '==', tenantId)])),
  ];
  return uniqueRefs(refs).map((ref) => ref.id);
}

async function queryTenantBranchIds(tenantId: string): Promise<string[]> {
  const refs = [
    ...(await queryRefs('branches', [where('tenantId', '==', tenantId)])),
    ...(await queryRefs('branches', [where('tenant_id', '==', tenantId)])),
  ];
  return uniqueRefs(refs).map((ref) => ref.id);
}

async function queryRefsByValues(
  collectionName: string,
  fields: string[],
  values: string[]
): Promise<DocumentReference[]> {
  if (values.length === 0) return [];

  const refs: DocumentReference[] = [];
  for (const field of fields) {
    for (const chunk of chunkArray(values, IN_QUERY_CHUNK)) {
      refs.push(...(await queryRefs(collectionName, [where(field, 'in', chunk)])));
    }
  }
  return uniqueRefs(refs);
}

async function batchDeleteDocRefs(docRefs: DocumentReference[]): Promise<number> {
  const refs = uniqueRefs(docRefs);
  let deletedCount = 0;

  for (let i = 0; i < refs.length; i += DELETE_BATCH_SIZE) {
    const chunk = refs.slice(i, i + DELETE_BATCH_SIZE);
    const batch = writeBatch(db);
    chunk.forEach((ref) => batch.delete(ref));
    await batch.commit();
    deletedCount += chunk.length;
  }

  return deletedCount;
}

interface ResetContext {
  tenantId: string;
  branchIds: string[];
  parentIds: Record<ParentKey, string[]>;
}

async function buildResetContext(tenantId: string): Promise<ResetContext> {
  const branchIds = await queryTenantBranchIds(tenantId);

  const [
    products,
    orders,
    sales,
    saleReturns,
    salesReturns,
    journals,
    recipes,
    priceLists,
    customerPayments,
    approvalRequests,
    notifications,
    purchaseOrders,
    goodsReceipts,
  ] = await Promise.all([
    queryIdsByTenant('products', tenantId),
    queryIdsByTenant('orders', tenantId),
    queryIdsByTenant('sales', tenantId),
    queryIdsByTenant('sale_returns', tenantId),
    queryIdsByTenant('sales_returns', tenantId),
    queryIdsByTenant('journal_entries', tenantId),
    queryIdsByTenant('recipes', tenantId),
    queryIdsByTenant('price_lists', tenantId),
    queryIdsByTenant('customer_payments', tenantId),
    queryIdsByTenant('approval_requests', tenantId),
    queryIdsByTenant('notifications', tenantId),
    queryIdsByTenant('purchase_orders', tenantId),
    queryIdsByTenant('goods_receipts', tenantId),
  ]);

  return {
    tenantId,
    branchIds,
    parentIds: {
      products,
      orders,
      sales,
      returns: Array.from(new Set([...saleReturns, ...salesReturns])),
      journals,
      recipes,
      priceLists,
      customerPayments,
      approvalRequests,
      notifications,
      purchaseOrders,
      goodsReceipts,
    },
  };
}

async function collectCollectionRefs(
  collectionName: string,
  ctx: ResetContext
): Promise<DocumentReference[]> {
  const refs: DocumentReference[] = [];

  // Canonical tenant ownership fields.
  refs.push(...(await queryRefs(collectionName, [where('tenantId', '==', ctx.tenantId)])));
  refs.push(...(await queryRefs(collectionName, [where('tenant_id', '==', ctx.tenantId)])));

  // Historical branch-only rows.
  if (BRANCH_SCOPED_COLLECTIONS.has(collectionName) && ctx.branchIds.length > 0) {
    refs.push(...(await queryRefsByValues(collectionName, ['branchId', 'branch_id'], ctx.branchIds)));
  }

  // Historical child rows without tenant fields.
  const related = RELATED_COLLECTIONS[collectionName];
  if (related) {
    refs.push(
      ...(await queryRefsByValues(
        collectionName,
        related.fields,
        ctx.parentIds[related.parent]
      ))
    );
  }

  return uniqueRefs(refs);
}

async function clearDeterministicBranchCounters(branchIds: string[]): Promise<number> {
  let deleted = 0;
  for (const branchId of branchIds) {
    try {
      await deleteDoc(doc(db, 'branch_counters', branchId));
      deleted++;
    } catch {
      // Verification of branch_counters also runs through branch ownership queries where possible.
    }
  }
  return deleted;
}

async function verifyWipe(
  ctx: ResetContext
): Promise<DataWipeVerification> {
  const leftovers: Array<{ collection: string; count: number }> = [];
  const failedCollections: string[] = [];

  for (const collectionName of TENANT_COLLECTIONS_TO_WIPE) {
    try {
      const refs = await collectCollectionRefs(collectionName, ctx);
      if (refs.length > 0) {
        leftovers.push({ collection: collectionName, count: refs.length });
      }
    } catch (err) {
      console.error(`[DataReset] Verification failed for ${collectionName}:`, err);
      failedCollections.push(collectionName);
    }
  }

  return {
    collectionsChecked: TENANT_COLLECTIONS_TO_WIPE.length,
    remainingDocuments: leftovers.reduce((sum, item) => sum + item.count, 0),
    failedCollections,
    leftovers,
  };
}

async function reinitializeCleanSystemState(
  tenantId: string,
  branchIds: string[]
): Promise<number> {
  const now = new Date().toISOString();

  // Re-seed retail units.
  const unitsBatch = writeBatch(db);
  for (const u of DEFAULT_STANDARD_UNITS) {
    const uRef = doc(collection(db, 'units'));
    unitsBatch.set(uRef, {
      id: uRef.id,
      ...u,
      tenantId,
      tenant_id: tenantId,
      createdAt: now,
      updatedAt: now,
    });
  }
  await unitsBatch.commit();

  // Mark analytics backfill as clean/complete so an empty reset does not immediately
  // rebuild historical KPIs from compatibility collections.
  await setDoc(doc(db, 'system_migrations', `stats_backfill_${tenantId}`), {
    tenantId,
    tenant_id: tenantId,
    migrationVersion: MIGRATION_VERSION,
    completedAt: now,
    resetAt: now,
    resetReason: 'tenant_data_wipe',
    daysProcessed: 0,
    monthsProcessed: 0,
    totalSalesProcessed: 0,
    totalGrossSales: 0,
    returnsProcessed: 0,
    expensesProcessed: 0,
    purchaseOrdersProcessed: 0,
  });

  // Reset branch operational counters without deleting branch identity.
  for (const branchId of branchIds) {
    await setDoc(
      doc(db, 'branch_counters', branchId),
      {
        tenantId,
        tenant_id: tenantId,
        branchId,
        currentOrderNumber: 0,
        last_order_number: 0,
        reusable_numbers: [],
        lastResetDate: now,
      },
      { merge: false }
    );
  }

  return DEFAULT_STANDARD_UNITS.length;
}

/**
 * Executes a strict tenant reset.
 *
 * IMPORTANT:
 * - Every Firestore read uses getDocsFromServer() so browser/cache state cannot make a wipe
 *   appear complete when the server still contains data.
 * - Any failed collection or any post-delete leftover causes success=false.
 */
export async function wipeAndReinitializeTenantData(
  options: DataWipeOptions
): Promise<DataWipeResult> {
  const { tenantId, onProgress } = options;
  const cleanTenantId = tenantId?.trim();

  const emptyVerification: DataWipeVerification = {
    collectionsChecked: 0,
    remainingDocuments: 0,
    failedCollections: [],
    leftovers: [],
  };

  if (!cleanTenantId) {
    return {
      success: false,
      totalDocumentsDeleted: 0,
      collectionsProcessed: 0,
      reinitializedUnitsCount: 0,
      verification: emptyVerification,
      error: 'معرف المؤسسة مفقود (Tenant ID is required)',
    };
  }

  let totalDocumentsDeleted = 0;
  let collectionsProcessed = 0;
  const failures: string[] = [];

  const totalSteps = TENANT_COLLECTIONS_TO_WIPE.length + 4;
  let step = 0;
  const progress = (message: string) => {
    step++;
    onProgress?.(message, Math.min(98, Math.round((step / totalSteps) * 100)));
  };

  try {
    progress('جاري فحص بيانات المؤسسة على الخادم...');
    const ctx = await buildResetContext(cleanTenantId);

    // Delete collection-by-collection. Do not hide collection failures.
    for (const collectionName of TENANT_COLLECTIONS_TO_WIPE) {
      progress(`جاري مسح ${collectionName} من قاعدة البيانات...`);
      try {
        const refs = await collectCollectionRefs(collectionName, ctx);
        totalDocumentsDeleted += await batchDeleteDocRefs(refs);
        collectionsProcessed++;
      } catch (err: any) {
        console.error(`[DataReset] Failed wiping ${collectionName}:`, err);
        failures.push(`${collectionName}: ${err?.message || 'unknown error'}`);
      }
    }

    // Deterministic branch counter docs may not contain tenant fields.
    totalDocumentsDeleted += await clearDeterministicBranchCounters(ctx.branchIds);

    progress('جاري التحقق من قاعدة البيانات بعد المسح...');
    const verification = await verifyWipe(ctx);

    if (failures.length > 0 || verification.failedCollections.length > 0 || verification.remainingDocuments > 0) {
      const leftoverSummary = verification.leftovers
        .slice(0, 8)
        .map((item) => `${item.collection}(${item.count})`)
        .join(', ');

      return {
        success: false,
        totalDocumentsDeleted,
        collectionsProcessed,
        reinitializedUnitsCount: 0,
        verification: {
          ...verification,
          failedCollections: Array.from(
            new Set([
              ...verification.failedCollections,
              ...failures.map((f) => f.split(':')[0]),
            ])
          ),
        },
        error:
          verification.remainingDocuments > 0
            ? `لم يكتمل المسح: ما زالت هناك ${verification.remainingDocuments} مستندات على الخادم${leftoverSummary ? ` [${leftoverSummary}]` : ''}.`
            : `لم يكتمل المسح بسبب أخطاء في بعض المجموعات: ${failures.slice(0, 5).join(' | ')}`,
      };
    }

    progress('جاري إعادة تهيئة الوحدات والعدادات وحالة التقارير...');
    const reinitializedUnitsCount = await reinitializeCleanSystemState(
      cleanTenantId,
      ctx.branchIds
    );

    progress('تم المسح والتحقق وإعادة التهيئة بنجاح');

    return {
      success: true,
      totalDocumentsDeleted,
      collectionsProcessed,
      reinitializedUnitsCount,
      verification,
    };
  } catch (err: any) {
    console.error('[DataReset] Fatal reset error:', err);
    return {
      success: false,
      totalDocumentsDeleted,
      collectionsProcessed,
      reinitializedUnitsCount: 0,
      verification: emptyVerification,
      error: err?.message || 'حدث خطأ غير متوقع أثناء مسح البيانات',
    };
  }
}
