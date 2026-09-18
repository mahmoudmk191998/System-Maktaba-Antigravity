import { db } from '@/lib/firebase';
import {
  collection,
  doc,
  query,
  where,
  getDocs,
  getDoc,
  setDoc,
  updateDoc,
  addDoc,
  orderBy,
  limit as firestoreLimit,
} from 'firebase/firestore';
import type { DailyClosing, DailyClosingPreview, DifferenceType } from '@/types/dailyClosing.types';
import type { Expense } from '@/types/expenses';
import { publishNotification } from './notifications.service';

const CLOSINGS_COLLECTION = 'daily_closings';

/**
 * Calculates a live preview of expected cash and financials for a given date and branch
 * without saving or mutating any records.
 */
export async function calculateDailyClosingPreview(
  tenantId: string,
  branchId: string,
  dateStr: string, // YYYY-MM-DD
  openingCashOverride?: number
): Promise<DailyClosingPreview> {
  const [year, month, day] = dateStr.split('-').map(Number);
  const startOfDay = new Date(year, month - 1, day, 0, 0, 0, 0);
  const endOfDay = new Date(year, month - 1, day, 23, 59, 59, 999);

  // 1. Fetch Day's Sales
  let salesSnap = await getDocs(query(
    collection(db, 'sales'),
    where('tenantId', '==', tenantId)
  ));
  if (salesSnap.empty) {
    const fallbackSnap = await getDocs(query(collection(db, 'orders'), where('tenant_id', '==', tenantId)));
    if (!fallbackSnap.empty) salesSnap = fallbackSnap;
  }

  const daySales = salesSnap.docs
    .map((d) => ({ id: d.id, ...(d.data() as any) }))
    .filter((s) => {
      if (branchId && branchId !== 'all' && (s.branchId || s.branch_id) && (s.branchId || s.branch_id) !== branchId) return false;
      if (s.status === 'cancelled' || s.saleStatus === 'cancelled') return false;
      const sDateStr = s.createdAt || s.created_at;
      if (!sDateStr) return false;
      const sDate = new Date(sDateStr);
      return sDate >= startOfDay && sDate <= endOfDay;
    });

  let salesTotal = 0;
  let cashSales = 0;
  let electronicSales = 0;
  let totalDiscounts = 0;

  daySales.forEach((s) => {
    const amount = Number(s.total || s.total_amount || s.final_amount || 0);
    const disc = Number(s.discountTotal ?? s.discount ?? s.discount_amount ?? 0);
    salesTotal += amount;
    totalDiscounts += disc;
    const payments = s.payments || s.paymentMethods || [];
    if (payments.length > 0) {
      payments.forEach((p: any) => {
        const pMethod = String(p.method || '').toLowerCase();
        const pAmt = Number(p.amount || 0);
        if (pMethod === 'cash' || pMethod === 'نقدي' || pMethod === 'كاش') {
          cashSales += pAmt;
        } else {
          electronicSales += pAmt;
        }
      });
    } else {
      const method = String(s.payment_method || '').toLowerCase();
      if (method === 'cash' || method === 'نقدي' || method === 'كاش') {
        cashSales += amount;
      } else {
        electronicSales += amount;
      }
    }
  });

  // 2. Fetch Day's Expenses & Cash Outflows
  const expensesQuery = query(
    collection(db, 'expenses'),
    where('tenantId', '==', tenantId),
    where('branchId', '==', branchId)
  );
  const expensesSnap = await getDocs(expensesQuery);
  const dayExpenses = expensesSnap.docs
    .map((d) => ({ id: d.id, ...(d.data() as any) })) as Expense[];

  const activeDayExpenses = dayExpenses.filter((e) => {
    if (e.status === 'voided') return false;
    return e.date === dateStr;
  });

  const operatingExpenses = activeDayExpenses
    .filter((e) => e.category !== 'سلف الموظفين' && e.isOperatingExpense !== false && e.type !== 'employee_advance')
    .reduce((sum, e) => sum + Number(e.amount || 0), 0);

  const cashOutflows = activeDayExpenses
    .filter((e) => e.affectsCashFlow !== false)
    .reduce((sum, e) => sum + Number(e.amount || 0), 0);

  const salaryPaymentsCash = activeDayExpenses
    .filter((e) => e.category === 'رواتب')
    .reduce((sum, e) => sum + Number(e.amount || 0), 0);

  const advancesCash = activeDayExpenses
    .filter((e) => e.category === 'سلف الموظفين' || e.type === 'employee_advance')
    .reduce((sum, e) => sum + Number(e.amount || 0), 0);

  // 3. Fetch Purchases
  let purchasesSnap = await getDocs(query(
    collection(db, 'purchase_orders'),
    where('tenantId', '==', tenantId)
  ));
  if (purchasesSnap.empty) {
    purchasesSnap = await getDocs(query(collection(db, 'purchase_orders'), where('tenant_id', '==', tenantId)));
  }
  const dayPurchases = purchasesSnap.docs
    .map((d) => ({ id: d.id, ...(d.data() as any) }))
    .filter((p) => {
      if (branchId && branchId !== 'all' && (p.branchId || p.branch_id) && (p.branchId || p.branch_id) !== branchId) return false;
      if (p.status === 'cancelled') return false;
      const pDateStr = p.createdAt || p.created_at;
      if (!pDateStr) return false;
      const pDate = new Date(pDateStr);
      return pDate >= startOfDay && pDate <= endOfDay;
    });

  const purchasesTotal = dayPurchases.reduce((sum, p) => sum + Number(p.totalAmount || p.total_amount || p.total || 0), 0);
  const purchasesCash = dayPurchases
    .filter((p) => String(p.paymentType || p.payment_type || '').toLowerCase() === 'cash')
    .reduce((sum, p) => sum + Number(p.paidAmount || p.paid_amount || 0), 0);

  // 4. Fetch Waste Cost
  let movementsSnap = await getDocs(query(
    collection(db, 'stock_movements'),
    where('tenantId', '==', tenantId)
  ));
  if (movementsSnap.empty) {
    movementsSnap = await getDocs(query(collection(db, 'stock_movements'), where('tenant_id', '==', tenantId)));
  }
  const dayWaste = movementsSnap.docs
    .map((d) => ({ id: d.id, ...(d.data() as any) }))
    .filter((m) => {
      if (branchId && branchId !== 'all' && (m.branchId || m.branch_id) && (m.branchId || m.branch_id) !== branchId) return false;
      const isWaste = m.movementType === 'waste' || m.movement_type === 'waste';
      if (!isWaste) return false;
      const mDateStr = m.createdAt || m.created_at;
      if (!mDateStr) return false;
      const mDate = new Date(mDateStr);
      return mDate >= startOfDay && mDate <= endOfDay;
    });

  const wasteCost = dayWaste.reduce((sum, m) => {
    const unitCost = Number(m.unitCostSnapshot || m.unit_cost || m.averageCost || 0);
    const qty = Math.abs(Number(m.quantity || m.baseQuantity || 0));
    return sum + (qty * unitCost);
  }, 0);

  // 5. Opening Cash
  let openingCash = openingCashOverride !== undefined ? Number(openingCashOverride) : 0;
  if (openingCashOverride === undefined) {
    const posShiftsQuery = query(
      collection(db, 'pos_shifts'),
      where('branch_id', '==', branchId)
    );
    const shiftsSnap = await getDocs(posShiftsQuery);
    const dayShifts = shiftsSnap.docs
      .map((d) => ({ id: d.id, ...(d.data() as any) }))
      .filter((s) => {
        if (!s.start_time) return false;
        const sDate = new Date(s.start_time);
        return sDate >= startOfDay && sDate <= endOfDay;
      });
    openingCash = dayShifts.reduce((sum, s) => sum + Number(s.starting_cash || 0), 0);
  }

  // Expected Cash = Opening Cash + Cash Sales - Cash Outflows
  const expectedCash = Math.max(0, openingCash + cashSales - cashOutflows);

  // Check if closing record already exists
  const closingDocId = `${tenantId}_${branchId}_${dateStr}`;
  const existingClosingSnap = await getDoc(doc(db, CLOSINGS_COLLECTION, closingDocId));
  const existingClosing = existingClosingSnap.exists()
    ? ({ id: existingClosingSnap.id, ...(existingClosingSnap.data() as any) } as DailyClosing)
    : null;

  return {
    date: dateStr,
    tenantId,
    branchId,
    salesTotal,
    cashSales,
    electronicSales,
    ordersCount: dayOrders.length,
    totalDiscounts,
    operatingExpenses,
    cashOutflows,
    salaryPaymentsCash,
    advancesCash,
    purchasesTotal,
    purchasesCash,
    wasteCost,
    openingCash,
    expectedCash,
    existingClosing,
  };
}

/**
 * Creates an immutable Daily Closing Snapshot.
 * Enforces idempotency to prevent duplicate closings for the same branch and date.
 */
export async function createDailyClosing(
  preview: DailyClosingPreview,
  actualCash: number,
  differenceReason: string = '',
  notes: string = '',
  currentUser: { name?: string; email?: string; uid?: string }
): Promise<{ success: boolean; id?: string; error?: string }> {
  try {
    const docId = `${preview.tenantId}_${preview.branchId}_${preview.date}`;
    const docRef = doc(db, CLOSINGS_COLLECTION, docId);

    // 1. Verify idempotency
    const existingSnap = await getDoc(docRef);
    if (existingSnap.exists()) {
      const existingData = existingSnap.data() as DailyClosing;
      if (existingData.status !== 'voided') {
        return {
          success: false,
          error: `تم إغلاق هذا اليوم (${preview.date}) بالفعل لهذا الفرع بواسطة ${existingData.closedBy || 'الإدارة'}.`,
        };
      }
    }

    const numActual = Number(actualCash);
    if (!Number.isFinite(numActual) || numActual < 0) {
      return { success: false, error: 'النقدية الفعلية يجب أن تكون رقماً موجباً أو صفراً.' };
    }

    const difference = Math.round((numActual - preview.expectedCash) * 100) / 100;
    let differenceType: DifferenceType = 'balanced';
    if (difference < 0) differenceType = 'shortage';
    else if (difference > 0) differenceType = 'overage';

    if (difference !== 0 && !differenceReason.trim()) {
      return { success: false, error: 'يرجى تحديد سبب فارق النقدية (عجز أو فائض) للمتابعة.' };
    }

    const nowIso = new Date().toISOString();
    const operatorName = currentUser.name || currentUser.email || 'المدير';

    const closingRecord: DailyClosing = {
      id: docId,
      tenantId: preview.tenantId,
      branchId: preview.branchId,
      date: preview.date,
      salesSnapshot: preview.salesTotal,
      cashSalesSnapshot: preview.cashSales,
      electronicSalesSnapshot: preview.electronicSales,
      ordersCountSnapshot: preview.ordersCount,
      discountsSnapshot: preview.totalDiscounts || 0,
      operatingExpensesSnapshot: preview.operatingExpenses,
      cashOutflowsSnapshot: preview.cashOutflows,
      salaryPaymentsSnapshot: preview.salaryPaymentsCash,
      advancesSnapshot: preview.advancesCash,
      purchasesSnapshot: preview.purchasesTotal,
      wasteSnapshot: preview.wasteCost,
      openingCash: preview.openingCash,
      expectedCash: preview.expectedCash,
      actualCash: numActual,
      difference,
      differenceType,
      differenceReason: differenceReason.trim(),
      notes: notes.trim(),
      status: difference !== 0 ? 'needs_review' : 'closed',
      closedBy: operatorName,
      closedAt: nowIso,
    };

    // Save standalone snapshot without mutating original collections
    await setDoc(docRef, closingRecord);

    // Record Audit Log
    await addDoc(collection(db, 'audit_logs'), {
      tenant_id: preview.tenantId,
      branch_id: preview.branchId,
      action: 'DAILY_CLOSING_CREATED',
      entityType: 'daily_closing',
      entityId: docId,
      user: operatorName,
      expectedCash: preview.expectedCash,
      actualCash: numActual,
      difference,
      differenceType,
      date: preview.date,
      details: `إغلاق اليوم المالي بتاريخ ${preview.date} (المتوقع: ${preview.expectedCash} ج.م، الفعلي: ${numActual} ج.م، الفارق: ${difference} ج.م)`,
      severity: difference !== 0 ? 'warning' : 'info',
      created_at: nowIso,
    });

    // Smart Notification to Managers & Owners
    const isLargeDifference = Math.abs(difference) >= 500;
    publishNotification({
      type: isLargeDifference ? 'warning' : difference !== 0 ? 'info' : 'success',
      category: 'expenses',
      priority: isLargeDifference ? 'high' : 'normal',
      title: difference !== 0 ? 'إغلاق يوم مع فارق نقدي' : 'تم إغلاق اليوم المالي بنجاح',
      message: `تم إغلاق يوم ${preview.date} للفرع بواسطة ${operatorName}. النقدية الفعلية: ${numActual} ج.م (الفارق: ${difference} ج.م)`,
      branchId: preview.branchId,
      relatedEntityType: 'daily_closing',
      relatedEntityId: docId,
      requiredPermission: 'daily_closing.view',
      actionRoute: '/executive?tab=closing',
      deduplicationKey: `closing_${docId}`,
    }).catch(() => {});

    return { success: true, id: docId };
  } catch (err: any) {
    console.error('Error creating daily closing:', err);
    return { success: false, error: err.message || 'حدث خطأ أثناء حفظ الإغلاق اليومي.' };
  }
}

/**
 * Voids an existing daily closing with mandatory audit reason.
 */
export async function voidDailyClosing(
  closingId: string,
  reason: string,
  currentUser: { name?: string; email?: string }
): Promise<{ success: boolean; error?: string }> {
  try {
    const docRef = doc(db, CLOSINGS_COLLECTION, closingId);
    const snap = await getDoc(docRef);
    if (!snap.exists()) {
      return { success: false, error: 'سجل الإغلاق غير موجود.' };
    }

    const nowIso = new Date().toISOString();
    const operatorName = currentUser.name || currentUser.email || 'المدير';

    await updateDoc(docRef, {
      status: 'voided',
      voidReason: reason.trim(),
      voidedAt: nowIso,
      voidedBy: operatorName,
    });

    const data = snap.data() as DailyClosing;
    await addDoc(collection(db, 'audit_logs'), {
      tenant_id: data.tenantId,
      branch_id: data.branchId,
      action: 'DAILY_CLOSING_VOIDED',
      entityType: 'daily_closing',
      entityId: closingId,
      user: operatorName,
      reason: reason.trim(),
      details: `إلغاء إغلاق اليوم المالي لتاريخ ${data.date}. السبب: ${reason.trim()}`,
      severity: 'warning',
      created_at: nowIso,
    });

    return { success: true };
  } catch (err: any) {
    console.error('Error voiding daily closing:', err);
    return { success: false, error: err.message || 'فشل في إلغاء الإغلاق اليومي.' };
  }
}

/**
 * Fetches recent daily closings for history tracking.
 */
export async function fetchDailyClosingsHistory(
  tenantId: string,
  branchId?: string | null,
  limitCount: number = 30
): Promise<DailyClosing[]> {
  try {
    const constraints: any[] = [where('tenantId', '==', tenantId)];
    if (branchId && branchId !== 'all') {
      constraints.push(where('branchId', '==', branchId));
    }
    const q = query(collection(db, CLOSINGS_COLLECTION), ...constraints, firestoreLimit(limitCount));
    const snap = await getDocs(q);
    const list = snap.docs.map((d) => ({ id: d.id, ...(d.data() as any) })) as DailyClosing[];
    list.sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());
    return list;
  } catch (err) {
    console.error('Error fetching closings history:', err);
    return [];
  }
}
