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
  query,
  where,
  orderBy,
  limit as fsLimit,
} from 'firebase/firestore';
import type { DamageLossRecord, DamageLossType } from '@/types/retail.types';
import { applyStockMovement } from './retailInventory.service';

export interface CreateDamageLossInput {
  tenantId: string;
  locationId: string;
  productId: string;
  variantId?: string | null;
  productNameSnapshot?: string;
  quantity: number;
  unitCost: number;
  type: DamageLossType;
  reason: string;
  employeeId: string;
  notes?: string;
}

/**
 * Records an instance of damaged or lost retail stock.
 * Deducts stock atomically via Stock Movement.
 */
export async function recordDamageOrLoss(
  input: CreateDamageLossInput
): Promise<{ success: boolean; record?: DamageLossRecord; error?: string }> {
  const {
    tenantId,
    locationId,
    productId,
    variantId = null,
    productNameSnapshot,
    quantity,
    unitCost,
    type,
    reason,
    employeeId,
    notes,
  } = input;

  if (!tenantId || !locationId || !productId) {
    return { success: false, error: 'بيانات المؤسسة والموقع والمنتج مطلوبة' };
  }

  if (quantity <= 0) {
    return { success: false, error: 'كمية الهالك أو الفقد يجب أن تكون أكبر من صفر' };
  }

  const recordRef = doc(collection(db, 'damage_loss_records'));
  const totalCost = Math.round(quantity * unitCost * 100) / 100;
  const now = new Date().toISOString();

  // 1. Deduct stock atomically
  const idempKey = `damage_loss:${recordRef.id}:${productId}:${variantId || 'base'}`;
  const movementType = type === 'lost' ? 'loss' : 'damage';

  const moveRes = await applyStockMovement({
    tenantId,
    locationId,
    productId,
    variantId,
    movementType,
    direction: 'out',
    quantity,
    unitCost,
    allowNegativeStock: false,
    referenceType: 'damage_loss',
    referenceId: recordRef.id,
    idempotencyKey: idempKey,
    employeeId,
    reason: `تسجيل ${type === 'lost' ? 'فقد وعجز' : 'توالف وهالك'}: ${reason}`,
    notes,
  });

  if (!moveRes.success) {
    return { success: false, error: moveRes.error || 'فشل في خصم رصيد الهالك من المخزن' };
  }

  // 2. Save damage/loss record
  const record: DamageLossRecord = {
    id: recordRef.id,
    tenantId,
    branchId: locationId,
    productId,
    variantId,
    quantity,
    unitCost,
    totalCostValue: totalCost,
    reason,
    type,
    employeeId,
    notes: productNameSnapshot ? `[${productNameSnapshot}] ${notes || ''}` : notes,
    createdAt: now,
  };

  await setDoc(recordRef, record);
  return { success: true, record };
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
    tenantId,
    locationId,
    productId,
    variantId,
    movementType: 'recovery',
    direction: 'in',
    quantity,
    unitCost,
    referenceType: 'damage_loss',
    referenceId: originalRecordId,
    idempotencyKey: idempKey,
    employeeId: recoveredBy,
    reason: 'استرداد بضاعة بعد الفقد / العثور عليها',
    notes,
  });

  if (!moveRes.success) {
    return { success: false, error: moveRes.error || 'فشل في إضافة رصيد البضاعة المستردة' };
  }

  // If linked to an original record, update its notes
  if (originalRecordId) {
    try {
      const origRef = doc(db, 'damage_loss_records', originalRecordId);
      const snap = await getDoc(origRef);
      if (snap.exists()) {
        const origData = snap.data();
        await updateDoc(origRef, {
          notes: `${origData.notes || ''} | تم استرداد كمية (${quantity}) بواسطة ${recoveredBy}`,
        });
      }
    } catch {
      // Non-fatal
    }
  }

  return { success: true };
}

/**
 * Fetches damage & loss records for a tenant with optional filtering.
 */
export async function fetchDamageLossRecordsFromDb(
  tenantId: string,
  options: { locationId?: string; type?: DamageLossType; pageSize?: number } = {}
): Promise<DamageLossRecord[]> {
  if (!tenantId) return [];
  const constraints: any[] = [where('tenantId', '==', tenantId)];

  if (options.locationId) {
    constraints.push(where('branchId', '==', options.locationId));
  }
  if (options.type) {
    constraints.push(where('type', '==', options.type));
  }

  constraints.push(orderBy('createdAt', 'desc'));
  constraints.push(fsLimit(options.pageSize || 50));

  const q = query(collection(db, 'damage_loss_records'), ...constraints);
  const snap = await getDocs(q);

  return snap.docs.map((d) => ({
    id: d.id,
    ...d.data(),
  })) as DamageLossRecord[];
}
