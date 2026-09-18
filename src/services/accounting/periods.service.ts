/**
 * Fiscal Periods & Closing Service (Phase 9)
 * Manages fiscal years, monthly fiscal periods, period locks (open, soft_closed, closed),
 * and pre-closing validations.
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
  runTransaction,
  writeBatch,
} from 'firebase/firestore';
import type { FiscalYear, FiscalPeriod, PeriodStatus } from '@/types/retail.types';

/**
 * Initializes a Fiscal Year and 12 monthly Fiscal Periods for a tenant.
 */
export async function initializeFiscalYear(
  tenantId: string,
  year: number,
  startMonth: number = 1 // 1 = January
): Promise<{ fiscalYear: FiscalYear; periods: FiscalPeriod[] }> {
  if (!tenantId) throw new Error('مُعرّف المنشأة إلزامي');

  const yearId = `${tenantId}_${year}`;
  const yearRef = doc(db, 'fiscal_years', yearId);

  const existing = await getDoc(yearRef);
  if (existing.exists()) {
    // Already exists, fetch its periods
    const periodsSnap = await getDocs(
      query(collection(db, 'fiscal_periods'), where('tenantId', '==', tenantId), where('fiscalYearId', '==', yearId), orderBy('periodNumber', 'asc'))
    );
    return {
      fiscalYear: existing.data() as FiscalYear,
      periods: periodsSnap.docs.map((d) => d.data() as FiscalPeriod),
    };
  }

  const batch = writeBatch(db);
  const now = new Date().toISOString();

  // Start date and end date
  const startStr = `${year}-${String(startMonth).padStart(2, '0')}-01T00:00:00Z`;
  const endYear = startMonth === 1 ? year : year + 1;
  const endMonth = startMonth === 1 ? 12 : startMonth - 1;
  const lastDay = new Date(endYear, endMonth, 0).getDate();
  const endStr = `${endYear}-${String(endMonth).padStart(2, '0')}-${String(lastDay).padStart(2, '0')}T23:59:59Z`;

  const newYear: FiscalYear = {
    id: yearId,
    tenantId,
    name: `السنة المالية ${year}`,
    startDate: startStr,
    endDate: endStr,
    status: 'open',
    createdAt: now,
    updatedAt: now,
  };

  batch.set(yearRef, newYear);

  const periods: FiscalPeriod[] = [];

  for (let i = 1; i <= 12; i++) {
    const curMonth = ((startMonth - 1 + (i - 1)) % 12) + 1;
    const curYear = startMonth + i - 1 > 12 ? year + 1 : year;
    const curMonthStr = String(curMonth).padStart(2, '0');
    const pStartDate = `${curYear}-${curMonthStr}-01T00:00:00Z`;
    const daysInCurMonth = new Date(curYear, curMonth, 0).getDate();
    const pEndDate = `${curYear}-${curMonthStr}-${String(daysInCurMonth).padStart(2, '0')}T23:59:59Z`;

    const periodId = `${tenantId}_${curYear}_${curMonthStr}`;
    const periodRef = doc(db, 'fiscal_periods', periodId);

    const periodData: FiscalPeriod = {
      id: periodId,
      tenantId,
      fiscalYearId: yearId,
      name: `${curYear}-${curMonthStr}`,
      periodNumber: i,
      startDate: pStartDate,
      endDate: pEndDate,
      status: 'open',
    };

    batch.set(periodRef, periodData);
    periods.push(periodData);
  }

  await batch.commit();
  return { fiscalYear: newYear, periods };
}

/**
 * Fetches all fiscal years for a tenant, ordered by startDate descending.
 */
export async function getFiscalYears(tenantId: string): Promise<FiscalYear[]> {
  if (!tenantId) return [];
  const q = query(
    collection(db, 'fiscal_years'),
    where('tenantId', '==', tenantId),
    orderBy('startDate', 'desc')
  );
  const snap = await getDocs(q);
  return snap.docs.map((d) => d.data() as FiscalYear);
}

/**
 * Fetches all fiscal periods for a tenant, ordered by startDate ascending.
 */
export async function getFiscalPeriods(tenantId: string, fiscalYearId?: string): Promise<FiscalPeriod[]> {
  if (!tenantId) return [];
  const constraints = [
    where('tenantId', '==', tenantId),
  ];
  if (fiscalYearId) {
    constraints.push(where('fiscalYearId', '==', fiscalYearId));
  }
  constraints.push(orderBy('startDate', 'asc'));

  const q = query(collection(db, 'fiscal_periods'), ...constraints);
  const snap = await getDocs(q);
  if (snap.empty && !fiscalYearId) {
    // Auto-initialize current year
    const curYear = new Date().getFullYear();
    const res = await initializeFiscalYear(tenantId, curYear);
    return res.periods;
  }
  return snap.docs.map((d) => d.data() as FiscalPeriod);
}

/**
 * Checks whether posting is allowed on a specific transaction date.
 */
export async function checkPostingAllowedInPeriod(
  tenantId: string,
  postingDate: string,
  options?: { allowSoftClosedOverride?: boolean }
): Promise<{ allowed: boolean; reason?: string; period?: FiscalPeriod }> {
  const pDate = new Date(postingDate);
  const curYear = pDate.getFullYear();
  const curMonth = String(pDate.getMonth() + 1).padStart(2, '0');
  const periodId = `${tenantId}_${curYear}_${curMonth}`;

  const pRef = doc(db, 'fiscal_periods', periodId);
  const snap = await getDoc(pRef);

  if (!snap.exists()) {
    // If period doesn't exist yet, try to initialize the fiscal year
    const res = await initializeFiscalYear(tenantId, curYear);
    const matched = res.periods.find((p) => p.id === periodId);
    if (!matched) return { allowed: true }; // Fallback allowed
    return { allowed: true, period: matched };
  }

  const period = snap.data() as FiscalPeriod;

  if (period.status === 'closed') {
    return {
      allowed: false,
      reason: `الفترة المالية (${period.name}) مغلقة نهائياً. لا يمكن ترحيل قيود محاسبية إليها.`,
      period,
    };
  }

  if (period.status === 'soft_closed') {
    if (!options?.allowSoftClosedOverride) {
      return {
        allowed: false,
        reason: `الفترة المالية (${period.name}) مغلقة إدارياً مؤقتاً (Soft Closed). تتطلب صلاحية اعتماد خاصة للترحيل.`,
        period,
      };
    }
  }

  return { allowed: true, period };
}

/**
 * Soft-closes a fiscal period (requires manager override to post).
 */
export async function softCloseFiscalPeriod(tenantId: string, periodId: string): Promise<void> {
  const pRef = doc(db, 'fiscal_periods', periodId);
  const snap = await getDoc(pRef);
  if (!snap.exists()) throw new Error('الفترة المالية غير موجودة');
  if (snap.data().tenantId !== tenantId) throw new Error('غير مصرح بالوصول لهذه الفترة');

  await runTransaction(db, async (tx) => {
    tx.update(pRef, {
      status: 'soft_closed',
      updatedAt: new Date().toISOString(),
    });
  });
}

/**
 * Hard-closes a fiscal period after validating unposted events.
 */
export async function closeFiscalPeriod(
  tenantId: string,
  periodId: string,
  closedBy: string
): Promise<{ success: boolean; warnings?: string[] }> {
  const pRef = doc(db, 'fiscal_periods', periodId);
  const snap = await getDoc(pRef);
  if (!snap.exists()) throw new Error('الفترة المالية غير موجودة');
  const period = snap.data() as FiscalPeriod;
  if (period.tenantId !== tenantId) throw new Error('غير مصرح');

  // Pre-closing validation: check if there are pending unposted outbox events in this period
  const pendingSnap = await getDocs(
    query(
      collection(db, 'accounting_events'),
      where('tenantId', '==', tenantId),
      where('status', '==', 'pending')
    )
  );

  const warnings: string[] = [];
  if (!pendingSnap.empty) {
    warnings.push(`يوجد ${pendingSnap.size} أحداث محاسبية معلقة في صندوق الانتظار (Outbox)`);
  }

  // Check draft journals
  const draftsSnap = await getDocs(
    query(
      collection(db, 'journal_entries'),
      where('tenantId', '==', tenantId),
      where('fiscalPeriodId', '==', periodId),
      where('status', '==', 'draft')
    )
  );
  if (!draftsSnap.empty) {
    warnings.push(`يوجد ${draftsSnap.size} مسودات قيود يومية غير مرحلة في هذه الفترة`);
  }

  await runTransaction(db, async (tx) => {
    tx.update(pRef, {
      status: 'closed',
      closedAt: new Date().toISOString(),
      closedBy,
    });
  });

  return { success: true, warnings };
}

/**
 * Reopens a closed fiscal period (Strictly audited).
 */
export async function reopenFiscalPeriod(
  tenantId: string,
  periodId: string,
  reopenedBy: string,
  reason: string
): Promise<void> {
  if (!reason || reason.trim().length < 5) {
    throw new Error('سبب إعادة فتح الفترة المالية إلزامي ولا يقل عن 5 أحرف');
  }

  const pRef = doc(db, 'fiscal_periods', periodId);
  const snap = await getDoc(pRef);
  if (!snap.exists()) throw new Error('الفترة المالية غير موجودة');

  await runTransaction(db, async (tx) => {
    tx.update(pRef, {
      status: 'open',
      reopenedAt: new Date().toISOString(),
      reopenedBy,
      reopenReason: reason.trim(),
    });
  });
}
