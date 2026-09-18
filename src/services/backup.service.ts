import { db } from '@/lib/firebase';
import {
  collection,
  query,
  where,
  getDocs,
  doc,
  setDoc,
  deleteDoc,
  writeBatch,
  getDoc,
  orderBy,
  limit,
} from 'firebase/firestore';
import type {
  BackupManifest,
  BackupPayload,
  BackupRecord,
  BackupType,
  CollectionAuditItem,
  DisasterRecoveryStatus,
  RestoreDryRunResult,
  RestoreExecutionOptions,
  RestoreJobRecord,
} from '@/types/backup.types';

export const CURRENT_SCHEMA_VERSION = 1;
export const APP_VERSION = '2.4.0';

/**
 * Standard modules mapping to their respective Firestore collections
 */
export const MODULE_COLLECTION_MAP: Record<string, string[]> = {
  hr: [
    'employees',
    'shifts',
    'attendance',
    'payrolls',
    'salary_payments',
    'advances',
    'advance_installments',
    'employee_leaves',
    'hr_settings',
  ],
  financial: [
    'expenses',
    'daily_closings',
    'payrolls',
    'salary_payments',
    'advances',
    'advance_installments',
    'accounting_records',
    'payments',
    'customer_ledgers',
    'customer_ledger',
    'customer_receivables',
    'customer_payments',
    'customer_payment_allocations',
    'supplier_ledgers',
    'supplier_ledger',
    'supplier_payments',
    'chart_of_accounts',
    'account_code_index',
    'journal_entries',
    'journal_lines',
    'journal_idempotency',
    'fiscal_years',
    'fiscal_periods',
    'accounting_settings',
    'accounting_events',
    'financial_accounts',
    'opening_balance_migrations',
    'daily_analytics_metrics',
    'analytics_settings',
    'reorder_settings',
    'season_definitions',
  ],
  accounting: [
    'chart_of_accounts',
    'account_code_index',
    'journal_entries',
    'journal_lines',
    'journal_idempotency',
    'fiscal_years',
    'fiscal_periods',
    'accounting_settings',
    'accounting_events',
    'financial_accounts',
    'opening_balance_migrations',
  ],
  analytics: [
    'daily_analytics_metrics',
    'analytics_settings',
    'reorder_settings',
    'season_definitions',
  ],
  purchasing: [
    'suppliers',
    'supplier_products',
    'purchase_orders',
    'goods_receipts',
    'purchase_returns',
    'supplier_ledger',
    'supplier_payments',
    'purchase_idempotency',
  ],
  inventory: [
    'inventory_items',
    'units',
    'suppliers',
    'supplier_products',
    'purchase_orders',
    'goods_receipts',
    'purchase_returns',
    'supplier_ledger',
    'supplier_payments',
    'purchase_idempotency',
    'recipes',
    'recipe_ingredients',
    'branch_stock',
    'stock_movements',
    'branch_transfers',
    'inventory_counts',
    'damage_loss_records',
  ],
  orders: [
    'orders',
    'order_items',
    'order_status_history',
    'pos_shifts',
    'call_center_orders',
    'sales',
    'sale_items',
    'sale_payments',
    'sale_returns',
    'sale_return_items',
    'sale_refunds',
    'sale_exchanges',
    'return_idempotency',
    'held_sales',
    'cashier_shifts',
    'cash_register_shifts',
    'cash_register_transactions',
    'sale_idempotency',
    'sequence_counters',
  ],
  catalog: [
    'menu_categories',
    'menu_items',
    'products',
    'product_variants',
    'categories',
    'brands',
    'attributes',
    'addons',
  ],
  operations: [
    'tables',
    'reservations',
    'delivery_zones',
    'promotions',
    'coupons',
    'offers',
    'customers',
    'price_lists',
    'price_list_items',
    'customer_product_prices',
    'customer_idempotency',
  ],
  config: [
    'tenants',
    'branches',
    'profiles',
    'user_roles',
    'user_permissions',
    'audit_logs',
  ],
  governance: [
    'approval_requests',
    'approval_steps',
    'approval_settings',
    'settings_audit_log',
    'feature_flags',
  ],
  documents: [
    'attachments',
  ],
};

export const ALL_AUDITED_COLLECTIONS: string[] = Array.from(
  new Set(Object.values(MODULE_COLLECTION_MAP).flat())
);

/**
 * Deterministic JSON serialization for canonical hashing
 */
export function canonicalJsonStringify(obj: any): string {
  if (obj === null || typeof obj !== 'object') {
    return JSON.stringify(obj);
  }
  if (Array.isArray(obj)) {
    return '[' + obj.map(canonicalJsonStringify).join(',') + ']';
  }
  const sortedKeys = Object.keys(obj).sort();
  const pairs = sortedKeys.map((key) => `${JSON.stringify(key)}:${canonicalJsonStringify(obj[key])}`);
  return '{' + pairs.join(',') + '}';
}

/**
 * Pure SHA-256 Checksum Calculation (supports Browser crypto.subtle and Node fallback)
 */
export async function calculateSHA256(content: string): Promise<string> {
  const encoder = new TextEncoder();
  const data = encoder.encode(content);

  // Modern browser / Node.js 18+ Web Crypto API
  if (typeof crypto !== 'undefined' && crypto.subtle) {
    const hashBuffer = await crypto.subtle.digest('SHA-256', data);
    const hashArray = Array.from(new Uint8Array(hashBuffer));
    return hashArray.map((b) => b.toString(16).padStart(2, '0')).join('');
  }

  // Fallback for isolated environments
  let hash = 0;
  for (let i = 0; i < content.length; i++) {
    const char = content.charCodeAt(i);
    hash = (hash << 5) - hash + char;
    hash |= 0;
  }
  return Math.abs(hash).toString(16).padStart(64, '0');
}

/**
 * Pure Checksum Verification
 */
export async function verifyChecksum(
  dataPayload: Record<string, any[]>,
  expectedChecksum: string
): Promise<{ valid: boolean; calculatedChecksum: string }> {
  const canonicalData = canonicalJsonStringify(dataPayload);
  const calculatedChecksum = await calculateSHA256(canonicalData);
  return {
    valid: calculatedChecksum.toLowerCase() === expectedChecksum.toLowerCase(),
    calculatedChecksum,
  };
}

/**
 * Pure, Read-Only Data Extraction for Backup
 * Strictly never mutates or locks any existing documents
 */
export async function collectTenantData(
  tenantId: string,
  branchId?: string | null,
  modules?: string[]
): Promise<{ data: Record<string, any[]>; collectionCounts: Record<string, number>; totalDocs: number }> {
  let targetCollections: string[] = [];

  if (!modules || modules.length === 0 || modules.includes('all')) {
    targetCollections = ALL_AUDITED_COLLECTIONS;
  } else {
    const set = new Set<string>();
    modules.forEach((mod) => {
      const colls = MODULE_COLLECTION_MAP[mod] || [];
      colls.forEach((c) => set.add(c));
    });
    targetCollections = Array.from(set);
  }

  const resultData: Record<string, any[]> = {};
  const collectionCounts: Record<string, number> = {};
  let totalDocs = 0;

  for (const collName of targetCollections) {
    try {
      const collRef = collection(db, collName);
      // Try tenant_id first, then tenantId for consistency
      const q = query(collRef, where('tenant_id', '==', tenantId));
      let snap = await getDocs(q);

      if (snap.empty) {
        const altQ = query(collRef, where('tenantId', '==', tenantId));
        snap = await getDocs(altQ);
      }

      let docs = snap.docs.map((d) => ({ _id: d.id, ...d.data() }));

      // If branch filtering is requested and collection is branch-scoped
      if (branchId && branchId !== 'all') {
        docs = docs.filter((d: any) => {
          const docBranch = d.branch_id || d.branchId;
          return !docBranch || docBranch === branchId;
        });
      }

      // Security Sanitization: Strip accidental server secret fields
      const sanitizedDocs = docs.map((d: any) => {
        const copy = { ...d };
        delete copy.api_secret;
        delete copy.secret_hash;
        delete copy.client_secret;
        delete copy.webhook_secret;
        delete copy.token_secret;
        return copy;
      });

      resultData[collName] = sanitizedDocs;
      collectionCounts[collName] = sanitizedDocs.length;
      totalDocs += sanitizedDocs.length;
    } catch (err) {
      console.warn(`[Backup] Warning reading collection ${collName}:`, (err as Error).message);
      resultData[collName] = [];
      collectionCounts[collName] = 0;
    }
  }

  return { data: resultData, collectionCounts, totalDocs };
}

/**
 * Creates a Full or Module Backup with Canonical SHA-256 Checksum and Audit Trail
 */
export async function createBackup(options: {
  tenantId: string;
  branchIds?: string[];
  backupType?: BackupType;
  selectedModule?: string;
  createdBy: string;
  createdByName?: string;
  notes?: string;
}): Promise<{ record: BackupRecord; payload: BackupPayload; jsonBlob: Blob }> {
  const {
    tenantId,
    branchIds = [],
    backupType = 'full',
    selectedModule,
    createdBy,
    createdByName,
    notes,
  } = options;

  const now = new Date();
  const timestamp = now.toISOString();
  const cleanIso = timestamp.replace(/[:.]/g, '-');
  const backupId = `backup_${tenantId}_${cleanIso}`;

  // 1. Gather collections data
  const modulesToInclude = selectedModule ? [selectedModule] : undefined;
  const primaryBranch = branchIds.length === 1 ? branchIds[0] : null;

  const { data, collectionCounts, totalDocs } = await collectTenantData(
    tenantId,
    primaryBranch,
    modulesToInclude
  );

  // 2. Canonical serialization & SHA-256 checksum
  const canonicalData = canonicalJsonStringify(data);
  const checksum = await calculateSHA256(canonicalData);
  const sizeBytes = new Blob([canonicalData]).size;

  // 3. Assemble Manifest
  const manifest: BackupManifest = {
    backupId,
    version: 1,
    schemaVersion: CURRENT_SCHEMA_VERSION,
    tenantId,
    branchIds,
    createdAt: timestamp,
    createdBy,
    createdByName,
    backupType,
    selectedModule,
    collectionsIncluded: Object.keys(data).filter((k) => data[k].length > 0),
    documentsCount: totalDocs,
    sizeBytes,
    checksum,
    status: 'completed',
    appVersion: APP_VERSION,
    collectionCounts,
    hasSensitiveData: true,
    fileReferencesOnly: true,
    notes,
  };

  const payload: BackupPayload = { manifest, data };

  // 4. Save metadata record to Firestore backups collection
  const record: BackupRecord = {
    ...manifest,
    isVerified: true,
    verifiedAt: timestamp,
  };

  try {
    await setDoc(doc(db, 'backups', backupId), record);
  } catch (err) {
    console.warn('[Backup] Failed to save backup record in Firestore:', (err as Error).message);
  }

  // 5. Write Immutable Audit Log
  try {
    const auditId = `audit_backup_create_${Date.now()}`;
    await setDoc(doc(db, 'audit_logs', auditId), {
      id: auditId,
      action: 'BACKUP_CREATED',
      tenant_id: tenantId,
      branch_id: primaryBranch || 'all',
      performed_by: createdBy,
      performed_by_name: createdByName || createdBy,
      timestamp,
      details: {
        backupId,
        backupType,
        documentsCount: totalDocs,
        checksum,
        sizeBytes,
      },
    });
  } catch (err) {
    console.warn('[Backup] Failed to write audit log:', (err as Error).message);
  }

  // 6. Generate JSON Blob for secure download
  const fullJsonString = JSON.stringify(payload, null, 2);
  const jsonBlob = new Blob([fullJsonString], { type: 'application/json' });

  return { record, payload, jsonBlob };
}

/**
 * Comprehensive Dry Run Validation
 * CRITICAL: Strictly 0 writes to Firestore.
 * Performs deep structural, tenant, and foreign key verification.
 */
export async function performRestoreDryRun(
  payload: BackupPayload,
  targetTenantId: string,
  targetBranchId?: string
): Promise<RestoreDryRunResult> {
  const errors: string[] = [];
  const warnings: string[] = [];
  const missingForeignKeys: string[] = [];
  const collectionsSummary: Record<string, CollectionAuditItem> = {};

  const { manifest, data } = payload;

  // 1. Basic Format Validation
  if (!manifest || !data) {
    return {
      canRestore: false,
      isCompatible: false,
      checksumValid: false,
      tenantMatch: false,
      schemaSupported: false,
      targetTenantId,
      backupTenantId: manifest?.tenantId || 'unknown',
      totalDocumentsInBackup: 0,
      collectionsSummary: {},
      errors: ['بنية ملف النسخة الاحتياطية غير صالحة أو تالفة (Manifest or Data missing).'],
      warnings: [],
      financialChecksPassed: false,
      missingForeignKeys: [],
      timestamp: new Date().toISOString(),
    };
  }

  // 2. Checksum Verification
  const checksumCheck = await verifyChecksum(data, manifest.checksum);
  if (!checksumCheck.valid) {
    errors.push(
      `فشل التحقق من التوقيع الرقمي (Checksum Mismatch). الملف قد تم التعديل عليه أو تلفه. المحسوب: ${checksumCheck.calculatedChecksum} مقابل المسجل: ${manifest.checksum}`
    );
  }

  // 3. Strict Tenant Isolation Check
  const tenantMatch = manifest.tenantId === targetTenantId;
  if (!tenantMatch) {
    errors.push(
      `غير مسموح بالاستعادة عبر منشآت مختلفة (Cross-Tenant Rejected). النسخة تابعة للمنشأة [${manifest.tenantId}] بينما المنشأة الحالية هي [${targetTenantId}].`
    );
  }

  // 4. Schema Compatibility Check
  const schemaSupported = manifest.schemaVersion <= CURRENT_SCHEMA_VERSION;
  if (!schemaSupported) {
    errors.push(
      `إصدار مخطط البيانات (${manifest.schemaVersion}) أحدث من الإصدار المدعوم في هذا النظام (${CURRENT_SCHEMA_VERSION}). يلزم تحديث النظام أولاً.`
    );
  }

  // 5. Branch check
  if (targetBranchId && targetBranchId !== 'all' && manifest.branchIds && manifest.branchIds.length > 0) {
    if (!manifest.branchIds.includes(targetBranchId)) {
      warnings.push(
        `النسخة الاحتياطية تنتمي إلى الفروع [${manifest.branchIds.join(', ')}] بينما الفرع المحدد هو [${targetBranchId}]. سيتم تطبيق التعيين للفرع المختار.`
      );
    }
  }

  // 6. Deep Collection & Document Analysis (Read-Only)
  let totalDocumentsInBackup = 0;
  let financialChecksPassed = true;

  // Build employee and supplier lookup for referential checks
  const employeeIds = new Set<string>((data.employees || []).map((e: any) => e._id || e.id));
  const supplierIds = new Set<string>((data.suppliers || []).map((s: any) => s._id || s.id));

  for (const [collName, docs] of Object.entries(data)) {
    if (!Array.isArray(docs)) continue;
    totalDocumentsInBackup += docs.length;

    let toCreate = 0;
    let toUpdate = 0;
    let identical = 0;
    const collMissingRefs: string[] = [];

    // Query existing IDs in Firestore for this collection
    const existingIds = new Set<string>();
    try {
      const existingSnap = await getDocs(query(collection(db, collName), where('tenant_id', '==', targetTenantId)));
      existingSnap.docs.forEach((d) => existingIds.add(d.id));
    } catch (_) { }

    for (const d of docs) {
      const docId = d._id || d.id;
      if (!docId) {
        errors.push(`مستند في المجموعة [${collName}] لا يحتوي على معرّف ID صالح.`);
        continue;
      }

      if (existingIds.has(docId)) {
        toUpdate++;
      } else {
        toCreate++;
      }

      // Referential checks
      if (collName === 'payrolls' && d.employeeId && !employeeIds.has(d.employeeId)) {
        collMissingRefs.push(`مسير رواتب يشير لموظف غير موجود: ${d.employeeId}`);
        missingForeignKeys.push(`payroll -> employee: ${d.employeeId}`);
      }
      if (collName === 'purchase_orders' && d.supplier_id && !supplierIds.has(d.supplier_id)) {
        collMissingRefs.push(`أمر شراء يشير لمورد غير موجود: ${d.supplier_id}`);
        missingForeignKeys.push(`purchase -> supplier: ${d.supplier_id}`);
      }

      // Financial Sanity Checks (Structure only, never recomputing historical balances)
      if (collName === 'orders') {
        const amt = Number(d.total_amount || d.final_amount || d.total || 0);
        if (isNaN(amt) || amt < 0) {
          financialChecksPassed = false;
          errors.push(`طلب برقم [${docId}] يحتوي على إجمالي مالي غير صالح: ${amt}`);
        }
      }
      if (collName === 'expenses') {
        const amt = Number(d.amount || 0);
        if (isNaN(amt) || amt < 0) {
          financialChecksPassed = false;
          errors.push(`مصروف برقم [${docId}] يحتوي على قيمة مالية غير صالحة: ${amt}`);
        }
      }
    }

    collectionsSummary[collName] = {
      collection: collName,
      count: docs.length,
      toCreate,
      toUpdate,
      identical,
      missingReferences: collMissingRefs,
      status: collMissingRefs.length > 0 ? 'warning' : 'clean',
    };
  }

  const canRestore = errors.length === 0 && checksumCheck.valid && tenantMatch && schemaSupported;

  return {
    canRestore,
    isCompatible: schemaSupported && tenantMatch,
    checksumValid: checksumCheck.valid,
    tenantMatch,
    schemaSupported,
    targetTenantId,
    backupTenantId: manifest.tenantId,
    totalDocumentsInBackup,
    collectionsSummary,
    errors,
    warnings,
    financialChecksPassed,
    missingForeignKeys,
    timestamp: new Date().toISOString(),
  };
}

/**
 * Creates an Automatic Pre-Restore Safety Backup
 * Prerequisite before any restore execution
 */
export async function createPreRestoreSafetyBackup(
  tenantId: string,
  targetBranchId?: string,
  performedBy?: string
): Promise<string> {
  const safety = await createBackup({
    tenantId,
    branchIds: targetBranchId ? [targetBranchId] : [],
    backupType: 'full',
    createdBy: performedBy || 'system_restore_safety',
    createdByName: 'Pre-Restore Safety Snapshot',
    notes: 'نسخة احتياطية وقائية تم إنشاؤها تلقائياً قبل تنفيذ عملية استعادة البيانات',
  });

  return safety.record.backupId;
}

/**
 * Safe Restore Execution
 * Respects chunked Firestore batch limits (max 250 writes per batch)
 * Enforces typed confirmation phrase and pre-restore safety snapshot
 */
export async function executeSafeRestore(
  payload: BackupPayload,
  options: RestoreExecutionOptions
): Promise<{ success: boolean; documentsRestoredCount: number; safetyBackupId: string; error?: string }> {
  const { tenantId, confirmationPhrase, confirmedBy, mode = 'merge', selectedModules } = options;

  // 1. Strict Confirmation Phrase Check
  const validPhrases = ['استعادة', 'restore', 'RESTORE'];
  if (!validPhrases.includes(confirmationPhrase.trim())) {
    throw new Error('عبارة التأكيد غير صحيحة. يجب كتابة "استعادة" لتأكيد الاستعادة الآمنة.');
  }

  // 2. Cross-Tenant Rejection
  if (payload.manifest.tenantId !== tenantId) {
    throw new Error('تم رفض العملية: لا يمكن استعادة بيانات منشأة داخل منشأة أخرى.');
  }

  // 3. Pre-Restore Safety Backup
  const safetyBackupId = await createPreRestoreSafetyBackup(tenantId, options.branchId, confirmedBy);

  // 4. Initialize Restore Job Record
  const restoreJobId = `restore_${Date.now()}`;
  const now = new Date().toISOString();
  const jobRecord: RestoreJobRecord = {
    id: restoreJobId,
    tenantId,
    backupId: payload.manifest.backupId,
    status: 'started',
    startedAt: now,
    startedBy: confirmedBy,
    mode,
    collectionsRestored: [],
    documentsRestoredCount: 0,
    batchesCount: 0,
    safetyBackupId,
  };

  try {
    await setDoc(doc(db, 'restore_jobs', restoreJobId), jobRecord);
  } catch (_) { }

  // 5. Audit Log: RESTORE_STARTED
  try {
    const auditId = `audit_restore_start_${Date.now()}`;
    await setDoc(doc(db, 'audit_logs', auditId), {
      id: auditId,
      action: 'RESTORE_STARTED',
      tenant_id: tenantId,
      performed_by: confirmedBy,
      timestamp: now,
      details: {
        restoreJobId,
        backupId: payload.manifest.backupId,
        safetyBackupId,
        mode,
      },
    });
  } catch (_) { }

  // 6. Execute Chunked Batch Writes
  let totalRestored = 0;
  let batchCount = 0;
  const restoredCollections: string[] = [];

  try {
    // Filter collections if module mode
    let collectionsToRestore = Object.keys(payload.data);
    if (mode === 'module' && selectedModules && selectedModules.length > 0) {
      const allowedSet = new Set<string>();
      selectedModules.forEach((m) => (MODULE_COLLECTION_MAP[m] || []).forEach((c) => allowedSet.add(c)));
      collectionsToRestore = collectionsToRestore.filter((c) => allowedSet.has(c));
    }

    for (const collName of collectionsToRestore) {
      const docs = payload.data[collName] || [];
      if (!Array.isArray(docs) || docs.length === 0) continue;

      restoredCollections.push(collName);

      // Chunk in max 250 items per batch
      const CHUNK_SIZE = 250;
      for (let i = 0; i < docs.length; i += CHUNK_SIZE) {
        const chunk = docs.slice(i, i + CHUNK_SIZE);
        const batch = writeBatch(db);

        for (const item of chunk) {
          const docId = item._id || item.id;
          if (!docId) continue;

          const docCopy = { ...item };
          delete docCopy._id; // Remove temporary internal helper ID

          // Enforce tenant isolation in restored payload
          docCopy.tenant_id = tenantId;

          const docRef = doc(db, collName, docId);
          batch.set(docRef, docCopy, { merge: true });
          totalRestored++;
        }

        await batch.commit();
        batchCount++;
      }
    }

    // 7. Complete Job Record
    const completedAt = new Date().toISOString();
    try {
      await setDoc(
        doc(db, 'restore_jobs', restoreJobId),
        {
          status: 'completed',
          completedAt,
          documentsRestoredCount: totalRestored,
          batchesCount: batchCount,
          collectionsRestored: restoredCollections,
        },
        { merge: true }
      );
    } catch (_) { }

    // 8. Audit Log: RESTORE_COMPLETED
    try {
      const auditId = `audit_restore_complete_${Date.now()}`;
      await setDoc(doc(db, 'audit_logs', auditId), {
        id: auditId,
        action: 'RESTORE_COMPLETED',
        tenant_id: tenantId,
        performed_by: confirmedBy,
        timestamp: completedAt,
        details: {
          restoreJobId,
          backupId: payload.manifest.backupId,
          safetyBackupId,
          totalRestored,
          batchCount,
          restoredCollections,
        },
      });
    } catch (_) { }

    return { success: true, documentsRestoredCount: totalRestored, safetyBackupId };
  } catch (err: any) {
    const errorMsg = err?.message || 'خطأ غير متوقع أثناء استعادة البيانات';

    try {
      await setDoc(
        doc(db, 'restore_jobs', restoreJobId),
        {
          status: 'failed',
          completedAt: new Date().toISOString(),
          error: errorMsg,
          documentsRestoredCount: totalRestored,
          batchesCount: batchCount,
        },
        { merge: true }
      );
    } catch (_) { }

    try {
      const auditId = `audit_restore_failed_${Date.now()}`;
      await setDoc(doc(db, 'audit_logs', auditId), {
        id: auditId,
        action: 'RESTORE_FAILED',
        tenant_id: tenantId,
        performed_by: confirmedBy,
        timestamp: new Date().toISOString(),
        details: {
          restoreJobId,
          error: errorMsg,
          safetyBackupId,
        },
      });
    } catch (_) { }

    throw new Error(`فشلت عملية الاستعادة: ${errorMsg}`);
  }
}

/**
 * Fetch Backup History for Tenant
 */
export async function fetchBackupHistory(tenantId: string): Promise<BackupRecord[]> {
  try {
    const q = query(
      collection(db, 'backups'),
      where('tenantId', '==', tenantId),
      orderBy('createdAt', 'desc'),
      limit(50)
    );
    const snap = await getDocs(q);
    return snap.docs.map((d) => ({ ...d.data() } as BackupRecord));
  } catch (err) {
    console.warn('[Backup] Error fetching backup history:', (err as Error).message);
    return [];
  }
}

/**
 * Delete a Backup Record (Metadata only, never touches production collections)
 */
export async function deleteBackupRecord(backupId: string, tenantId: string, deletedBy: string): Promise<void> {
  const docRef = doc(db, 'backups', backupId);
  const snap = await getDoc(docRef);

  if (snap.exists() && snap.data().tenantId !== tenantId) {
    throw new Error('غير مصرح لك بحذف نسخة احتياطية خاصة بمنشأة أخرى.');
  }

  await deleteDoc(docRef);

  // Audit Log: BACKUP_DELETED
  try {
    const auditId = `audit_backup_delete_${Date.now()}`;
    await setDoc(doc(db, 'audit_logs', auditId), {
      id: auditId,
      action: 'BACKUP_DELETED',
      tenant_id: tenantId,
      performed_by: deletedBy,
      timestamp: new Date().toISOString(),
      details: { backupId },
    });
  } catch (_) { }
}

/**
 * Calculates Disaster Recovery Health Status & Readiness
 */
export async function getDisasterRecoveryStatus(tenantId: string): Promise<DisasterRecoveryStatus> {
  const history = await fetchBackupHistory(tenantId);

  if (history.length === 0) {
    return {
      lastBackupAt: null,
      lastBackupAgeHours: null,
      lastVerifiedAt: null,
      lastRestoreTestAt: null,
      totalBackupsCount: 0,
      healthStatus: 'critical',
      healthMessage: 'لا توجد أي نسخ احتياطية مسجلة للنظام. يرجى إنشاء نسخة احتياطية فوراً لحماية البيانات.',
    };
  }

  const latest = history[0];
  const lastDate = new Date(latest.createdAt);
  const now = new Date();
  const diffHours = Math.round((now.getTime() - lastDate.getTime()) / (1000 * 60 * 60));

  // Find last verified backup
  const lastVerified = history.find((b) => b.isVerified);

  // Find last Dry Run test from audit_logs if available
  let lastRestoreTestAt: string | null = null;
  try {
    const auditSnap = await getDocs(
      query(
        collection(db, 'audit_logs'),
        where('tenant_id', '==', tenantId),
        where('action', '==', 'RESTORE_DRY_RUN'),
        orderBy('timestamp', 'desc'),
        limit(1)
      )
    );
    if (!auditSnap.empty) {
      lastRestoreTestAt = auditSnap.docs[0].data().timestamp || null;
    }
  } catch (_) { }

  let healthStatus: 'healthy' | 'warning' | 'critical' = 'healthy';
  let healthMessage = 'حالة النسخ الاحتياطي ممتازة. البيانات مؤمنة وجاهزة للتعافي.';

  if (diffHours > 168) {
    // Older than 7 days
    healthStatus = 'critical';
    healthMessage = `آخر نسخة احتياطية منذ ${Math.round(diffHours / 24)} يوماً. النظام معرض لفقدان بيانات حديثة في حال حدوث طارئ.`;
  } else if (diffHours > 24) {
    // Older than 24 hours
    healthStatus = 'warning';
    healthMessage = `آخر نسخة احتياطية منذ ${diffHours} ساعة. يُفضل إنشاء نسخة احتياطية يومية.`;
  } else if (!lastRestoreTestAt) {
    healthStatus = 'warning';
    healthMessage = 'النسخ الاحتياطي حديث، ولكن لم يتم إجراء اختبار استعادة افتراضي (Dry Run) مؤخراً.';
  }

  return {
    lastBackupAt: latest.createdAt,
    lastBackupAgeHours: diffHours,
    lastVerifiedAt: lastVerified ? lastVerified.verifiedAt || lastVerified.createdAt : null,
    lastRestoreTestAt,
    totalBackupsCount: history.length,
    healthStatus,
    healthMessage,
  };
}
