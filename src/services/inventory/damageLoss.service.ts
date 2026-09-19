/**
 * Damage, Loss & Recovery Subsystem for Bookstore & Stationery Retail
 * 
 * Manages write-offs for damaged books, leaking pens, broken geometry sets,
 * and tracks inventory losses with atomic stock deductions.
 * Also supports recovery workflows when missing items are found.
 */

import { db } from '@/lib/firebase';
import {
  collection,
  doc,
  getDoc,
  getDocs,
  setDoc,
  updateDoc,
  deleteDoc,
  query,
  where,
  limit as fsLimit,
} from 'firebase/firestore';
import type { DamageLossRecord, DamageLossType } from '@/types/retail.types';
import { applyStockMovement } from './retailInventory.service';

const LOCAL_STORAGE_DAMAGE_KEY = 'pos_damage_loss_records';

function getLocalDamageRecords(): DamageLossRecord[] {
  try {
    const raw = localStorage.getItem(LOCAL_STORAGE_DAMAGE_KEY);
    return raw ? JSON.parse(raw) : [];
  } catch {
    return [];
  }
}

function saveLocalDamageRecord(record: DamageLossRecord): void {
  try {
    const existing = getLocalDamageRecords();
    const updated = [record, ...existing.filter((r) => r.id !== record.id)];
    localStorage.setItem(LOCAL_STORAGE_DAMAGE_KEY, JSON.stringify(updated.slice(0, 300)));
  } catch {
    // Ignore quota errors
  }
}

export interface CreateDamageLossInput {
  tenantId?: string;
  locationId?: string;
  productId: string;
  variantId?: string | null;
  productNameSnapshot?: string;
  quantity: number;
  unitCost: number;
  type: DamageLossType;
  reason: string;
  employeeId?: string;
  notes?: string;
  skipStockMovement?: boolean;
}

/**
 * Records an instance of damaged or lost retail stock.
 * Deducts stock atomically via Stock Movement (unless skipStockMovement is true) and persists to Firestore + LocalStorage.
 */
export async function recordDamageOrLoss(
  input: CreateDamageLossInput
): Promise<{ success: boolean; record?: DamageLossRecord; error?: string }> {
  const effTenantId = input.tenantId || localStorage.getItem('current_tenant_id') || 'default-tenant';
  const effLocationId = input.locationId || 'main';
  const {
    productId,
    variantId = null,
    productNameSnapshot,
    quantity,
    unitCost,
    type,
    reason,
    notes,
    skipStockMovement = false,
  } = input;
  const employeeId = input.employeeId || 'المسؤول';

  if (!productId) {
    return { success: false, error: 'بيانات المنتج مطلوبة' };
  }

  if (quantity <= 0) {
    return { success: false, error: 'كمية الهالك أو الفقد يجب أن تكون أكبر من صفر' };
  }

  const recordRef = doc(collection(db, 'damage_loss_records'));
  const totalCost = Math.round(quantity * unitCost * 100) / 100;
  const now = new Date().toISOString();

  // 1. Deduct stock atomically via Stock Movement if not already deducted
  if (!skipStockMovement) {
    const idempKey = `damage_loss:${recordRef.id}:${productId}:${variantId || 'base'}`;
    const movementType = type === 'lost' ? 'loss' : 'damage';

    const moveRes = await applyStockMovement({
      tenantId: effTenantId,
      locationId: effLocationId,
      productId,
      variantId,
      movementType,
      direction: 'out',
      quantity,
      unitCost,
      allowNegativeStock: true, // Allow marking damage even if physical count had variance
      referenceType: 'damage_loss',
      referenceId: recordRef.id,
      idempotencyKey: idempKey,
      employeeId,
      reason: `تسجيل ${type === 'lost' ? 'فقد وعجز' : 'توالف وهالك'}: ${reason}`,
      notes: productNameSnapshot ? `[${productNameSnapshot}] ${notes || ''}` : notes,
    });

    if (!moveRes.success) {
      console.warn('Stock movement warning for damage/loss:', moveRes.error);
    }
  }

  // 2. Build and save damage/loss record
  const record: DamageLossRecord = {
    id: recordRef.id,
    tenantId: effTenantId,
    branchId: effLocationId,
    productId,
    variantId,
    productNameSnapshot,
    quantity,
    unitCost,
    totalCostValue: totalCost,
    reason,
    type,
    employeeId,
    notes: productNameSnapshot ? `[${productNameSnapshot}] ${notes || ''}` : notes,
    createdAt: now,
  };

  // Dual-sync: LocalStorage first for instant UI availability
  saveLocalDamageRecord(record);

  // Firestore write
  try {
    await setDoc(recordRef, {
      ...record,
      branch_id: effLocationId, // for compatibility with legacy queries
      tenant_id: effTenantId,
    });
  } catch (err) {
    console.warn('Firestore setDoc failed for damage record, saved locally:', err);
  }

  return { success: true, record };
}

/**
 * Deletes a damage/loss record and automatically returns the lost/damaged quantity back to inventory.
 */
export async function deleteDamageLossRecord(
  recordId: string,
  tenantId?: string,
  locationId?: string,
  productId?: string,
  variantId?: string | null,
  quantity?: number,
  unitCost?: number
): Promise<{ success: boolean; error?: string }> {
  const effTenant = tenantId || localStorage.getItem('current_tenant_id') || 'default-tenant';
  let targetRecord: DamageLossRecord | null = null;

  // First try to find existing record details if not provided
  try {
    const snap = await getDoc(doc(db, 'damage_loss_records', recordId));
    if (snap.exists()) {
      targetRecord = { id: snap.id, ...snap.data() } as DamageLossRecord;
    }
  } catch {
    // Non-fatal
  }

  if (!targetRecord) {
    const locals = getLocalDamageRecords();
    targetRecord = locals.find((r) => r.id === recordId) || null;
  }

  const effProductId = productId || targetRecord?.productId;
  const effVariantId = variantId !== undefined ? variantId : targetRecord?.variantId;
  const effQty = quantity !== undefined ? Math.abs(quantity) : Math.abs(targetRecord?.quantity || 0);
  const effCost = unitCost !== undefined ? unitCost : (targetRecord?.unitCost || 0);
  const effLoc = locationId || targetRecord?.branchId || 'main';

  // 1. Revert stock atomically if product and quantity exist
  if (effProductId && effQty > 0) {
    try {
      await applyStockMovement({
        tenantId: effTenant,
        locationId: effLoc,
        productId: effProductId,
        variantId: effVariantId,
        movementType: 'stock_adjustment_in',
        direction: 'in',
        quantity: effQty,
        unitCost: effCost,
        referenceType: 'damage_loss',
        referenceId: recordId,
        employeeId: 'المسؤول',
        reason: 'إلغاء وحذف تسجيل هالك/تالف وإعادة الكمية للمخزون',
      });
    } catch (e) {
      console.warn('Failed to revert stock for deleted damage record:', e);
    }
  }

  // 2. Remove from LocalStorage
  try {
    const locals = getLocalDamageRecords();
    const updated = locals.filter((r) => r.id !== recordId);
    localStorage.setItem(LOCAL_STORAGE_DAMAGE_KEY, JSON.stringify(updated));
  } catch {
    // Non-fatal
  }

  // 3. Delete from Firestore
  try {
    await deleteDoc(doc(db, 'damage_loss_records', recordId));
  } catch (err: any) {
    console.warn('Failed to delete doc in Firestore:', err);
  }

  return { success: true };
}

/**
 * Records recovery of previously lost goods.
 * Adds stock back via an atomic 'recovery' movement.
 */
export async function recordStockRecovery(
  tenantId: string,
  locationId: string,
  productId: string,
  variantId: string | null | undefined,
  quantity: number,
  unitCost: number,
  recoveredBy: string,
  originalRecordId?: string,
  notes?: string
): Promise<{ success: boolean; error?: string }> {
  if (quantity <= 0) {
    return { success: false, error: 'الكمية المستردة يجب أن تكون أكبر من صفر' };
  }

  const idempKey = `recovery:${originalRecordId || 'adhoc'}:${productId}:${Date.now()}`;
  const moveRes = await applyStockMovement({
    tenantId: tenantId || 'default-tenant',
    locationId: locationId || 'main',
    productId,
    variantId,
    movementType: 'recovery',
    direction: 'in',
    quantity,
    unitCost,
    referenceType: 'damage_loss',
    referenceId: originalRecordId,
    idempotencyKey: idempKey,
    employeeId: recoveredBy || 'المسؤول',
    reason: 'استرداد بضاعة بعد الفقد / العثور عليها',
    notes,
  });

  if (!moveRes.success) {
    return { success: false, error: moveRes.error || 'فشل في إضافة رصيد البضاعة المستردة' };
  }

  // If linked to an original record, update its notes in Firestore and LocalStorage
  if (originalRecordId) {
    try {
      const origRef = doc(db, 'damage_loss_records', originalRecordId);
      const snap = await getDoc(origRef);
      if (snap.exists()) {
        const origData = snap.data();
        const updatedNotes = `${origData.notes || ''} | تم استرداد كمية (${quantity}) بواسطة ${recoveredBy}`;
        await updateDoc(origRef, { notes: updatedNotes });
      }
    } catch {
      // Non-fatal
    }

    try {
      const locals = getLocalDamageRecords();
      const updated = locals.map((r) => {
        if (r.id === originalRecordId) {
          return { ...r, notes: `${r.notes || ''} | تم استرداد كمية (${quantity}) بواسطة ${recoveredBy}` };
        }
        return r;
      });
      localStorage.setItem(LOCAL_STORAGE_DAMAGE_KEY, JSON.stringify(updated));
    } catch {
      // Non-fatal
    }
  }

  return { success: true };
}

/**
 * Fetches damage & loss records for a tenant with in-memory filtering and sorting.
 * Completely immune to Firestore missing composite index errors and merges with local records.
 */
export async function fetchDamageLossRecordsFromDb(
  tenantId: string,
  options: { locationId?: string; type?: DamageLossType; pageSize?: number } = {}
): Promise<DamageLossRecord[]> {
  const effTenant = tenantId || localStorage.getItem('current_tenant_id') || 'default-tenant';
  let firestoreRecords: DamageLossRecord[] = [];

  try {
    // Single-field equality to completely avoid composite index requirement
    const q = query(
      collection(db, 'damage_loss_records'),
      where('tenantId', '==', effTenant),
      fsLimit(options.pageSize || 100)
    );
    const snap = await getDocs(q);
    firestoreRecords = snap.docs.map((d) => ({
      id: d.id,
      ...d.data(),
    })) as DamageLossRecord[];

    // If empty with effTenant, try without tenant filter as fallback
    if (firestoreRecords.length === 0) {
      try {
        const fallbackSnap = await getDocs(
          query(collection(db, 'damage_loss_records'), fsLimit(100))
        );
        firestoreRecords = fallbackSnap.docs.map((d) => ({
          id: d.id,
          ...d.data(),
        })) as DamageLossRecord[];
      } catch {
        // Non-fatal
      }
    }
  } catch (err) {
    console.warn('Firestore fetchDamageLossRecordsFromDb failed, falling back to local:', err);
  }

  // Merge with local records
  const localRecords = getLocalDamageRecords();
  const recordsMap = new Map<string, DamageLossRecord>();

  firestoreRecords.forEach((r) => recordsMap.set(r.id, r));
  localRecords.forEach((r) => {
    if (!recordsMap.has(r.id)) {
      recordsMap.set(r.id, r);
    }
  });

  let merged = Array.from(recordsMap.values());

  // Filter by locationId in memory
  if (options.locationId && options.locationId !== 'all') {
    merged = merged.filter(
      (r) => !r.branchId || r.branchId === options.locationId || r.branchId === 'main'
    );
  }

  // Filter by type in memory
  if (options.type && options.type !== ('all' as any)) {
    merged = merged.filter((r) => r.type === options.type);
  }

  // Sort in memory by createdAt descending
  merged.sort((a, b) => new Date(b.createdAt || 0).getTime() - new Date(a.createdAt || 0).getTime());

  return merged;
}
