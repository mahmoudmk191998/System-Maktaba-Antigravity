/**
 * Cash Register Shift Management Service
 * Manages cashier register sessions, opening floats, closing reconciliations,
 * cash differences/variances, and shift audit records.
 */

import { db } from '@/lib/firebase';
import {
  collection,
  doc,
  getDoc,
  getDocs,
  query,
  where,
  orderBy,
  limit,
  addDoc,
  updateDoc,
} from 'firebase/firestore';
import type { CashierShift } from '@/types/retail.types';

export interface OpenShiftParams {
  tenantId: string;
  branchId: string;
  cashierId: string;
  cashierNameSnapshot: string;
  openingCash: number;
  notes?: string;
}

export interface CloseShiftParams {
  tenantId: string;
  shiftId: string;
  closedBy: string;
  closingCashActual: number;
  notes?: string;
}

/**
 * Finds the currently active open register shift for a cashier in a branch
 */
export async function getActiveCashRegisterShift(
  tenantId: string,
  branchId: string,
  cashierId: string
): Promise<CashierShift | null> {
  if (!tenantId || !branchId || !cashierId) return null;

  const q = query(
    collection(db, 'cashier_shifts'),
    where('tenantId', '==', tenantId),
    where('branchId', '==', branchId),
    where('cashierId', '==', cashierId),
    where('status', '==', 'open'),
    limit(1)
  );

  const snap = await getDocs(q);
  if (snap.empty) return null;
  const docSnap = snap.docs[0];
  return { id: docSnap.id, ...docSnap.data() } as CashierShift;
}

/**
 * Opens a new cashier register shift
 */
export async function openCashRegisterShift(
  params: OpenShiftParams
): Promise<{ success: boolean; shift?: CashierShift; error?: string }> {
  const { tenantId, branchId, cashierId, cashierNameSnapshot, openingCash, notes } = params;

  if (openingCash < 0) {
    return { success: false, error: 'مبلغ العهدة الافتتاحية لا يمكن أن يكون سالباً' };
  }

  // Check if cashier already has an open shift in this branch
  const existing = await getActiveCashRegisterShift(tenantId, branchId, cashierId);
  if (existing) {
    return { success: true, shift: existing };
  }

  const now = new Date().toISOString();
  const shiftData: Omit<CashierShift, 'id'> = {
    tenantId,
    branchId,
    cashierId,
    cashierNameSnapshot,
    status: 'open',
    openingCash: Number(openingCash),
    openedAt: now,
    totalSalesCash: 0,
    totalSalesCard: 0,
    totalSalesOther: 0,
    totalSalesCount: 0,
    totalRefunds: 0,
    cashIn: 0,
    cashOut: 0,
    notes: notes || '',
  };

  const docRef = await addDoc(collection(db, 'cashier_shifts'), shiftData);
  if (typeof window !== 'undefined') {
    window.dispatchEvent(new CustomEvent('alwan_shifts_synced'));
  }
  return {
    success: true,
    shift: { id: docRef.id, ...shiftData },
  };
}

/**
 * Closes an active register shift and calculates variance
 */
export async function closeCashRegisterShift(
  params: CloseShiftParams
): Promise<{ success: boolean; shift?: CashierShift; error?: string }> {
  const { tenantId, shiftId, closedBy, closingCashActual, notes } = params;

  const shiftRef = doc(db, 'cashier_shifts', shiftId);
  const snap = await getDoc(shiftRef);

  if (!snap.exists()) {
    return { success: false, error: 'سجل الوردية غير موجود' };
  }

  const data = snap.data() as CashierShift;
  if (data.tenantId !== tenantId) {
    return { success: false, error: 'غير مصرح بالوصول' };
  }
  if (data.status !== 'open') {
    return { success: false, error: 'الوردية مغلقة بالفعل مسبقاً' };
  }

  const opening = Number(data.openingCash || 0);
  const cashSales = Number(data.totalSalesCash || 0);
  const refunds = Number(data.totalRefunds || 0);
  const cashIn = Number(data.cashIn || 0);
  const cashOut = Number(data.cashOut || 0);

  // Expected Cash = Opening Float + Cash Sales + Cash In - Cash Out - Refunds
  const expectedCash = Math.round((opening + cashSales + cashIn - cashOut - refunds) * 100) / 100;
  const actualCash = Math.round(Number(closingCashActual) * 100) / 100;
  const difference = Math.round((actualCash - expectedCash) * 100) / 100;

  const now = new Date().toISOString();
  const updates: Partial<CashierShift> = {
    status: 'closed',
    closingCashExpected: expectedCash,
    closingCashActual: actualCash,
    cashDifference: difference,
    closedAt: now,
    notes: notes ? `${data.notes || ''} | ${notes}` : data.notes,
  };

  await updateDoc(shiftRef, {
    ...updates,
    closedBy,
    updatedAt: now,
  });

  if (typeof window !== 'undefined') {
    window.dispatchEvent(new CustomEvent('alwan_shifts_synced'));
  }

  return {
    success: true,
    shift: { ...data, ...updates, id: shiftId },
  };
}
