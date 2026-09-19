/**
 * Aggregated Statistics Service
 * 
 * Provides an ultra-efficient, atomic aggregation layer for daily and monthly business statistics.
 * Drastically reduces Firestore reads on Dashboard and Reports from thousands to 1-2 document reads.
 */

import { db } from '@/lib/firebase';
import {
  doc,
  getDoc,
  setDoc,
  collection,
  serverTimestamp,
  Transaction,
  writeBatch,
} from 'firebase/firestore';
import {
  getTenantDateString,
  getTenantMonthString,
} from '@/lib/reportingTimezone';
import { firestoreLogger } from '@/lib/firestoreLogger';

export const STATS_DAILY_COLLECTION = 'stats_daily';
export const STATS_MONTHLY_COLLECTION = 'stats_monthly';

export interface FinancialStatsSnapshot {
  id?: string;
  tenantId: string;
  branchId?: string;
  date: string; // YYYY-MM-DD for daily, YYYY-MM for monthly
  grossSales: number;
  returnsTotal: number;
  netSales: number;
  totalProfit: number;
  totalExpenses: number;
  totalPurchases: number;
  invoicesCount: number;
  completedInvoicesCount: number;
  itemsSold: number;
  topSellingItems?: Array<{ id: string; name: string; quantity: number; total: number }>;
  updatedAt?: any;
}

export function getDailyStatsDocId(tenantId: string, dateStr: string): string {
  return `${tenantId}_${dateStr}`;
}

export function getMonthlyStatsDocId(tenantId: string, monthStr: string): string {
  return `${tenantId}_${monthStr}`;
}

export function createDefaultStats(tenantId: string, date: string, branchId = 'all'): FinancialStatsSnapshot {
  return {
    tenantId,
    branchId,
    date,
    grossSales: 0,
    returnsTotal: 0,
    netSales: 0,
    totalProfit: 0,
    totalExpenses: 0,
    totalPurchases: 0,
    invoicesCount: 0,
    completedInvoicesCount: 0,
    itemsSold: 0,
    topSellingItems: [],
  };
}

/**
 * Merges top selling items array while keeping length capped to top 5
 */
function mergeTopSelling(
  current: Array<{ id: string; name: string; quantity: number; total: number }> = [],
  newItems: Array<{ id: string; name: string; quantity: number; total: number }> = []
) {
  const map = new Map<string, { id: string; name: string; quantity: number; total: number }>();
  for (const it of current) {
    map.set(it.id, { ...it });
  }
  for (const it of newItems) {
    if (!it.id) continue;
    const existing = map.get(it.id) || { id: it.id, name: it.name, quantity: 0, total: 0 };
    existing.quantity += it.quantity;
    existing.total += it.total;
    if (it.name) existing.name = it.name;
    map.set(it.id, existing);
  }
  return Array.from(map.values())
    .sort((a, b) => b.quantity - a.quantity)
    .slice(0, 5);
}

/**
 * Applies a new sale atomically inside a checkout transaction.
 */
export async function applySaleToStatsInTransaction(
  tx: Transaction,
  tenantId: string,
  saleDate: any,
  saleData: {
    grossTotal: number;
    profit: number;
    itemsCount: number;
    itemsSummary?: Array<{ id: string; name: string; quantity: number; total: number }>;
  }
): Promise<void> {
  const dateStr = getTenantDateString(saleDate);
  const monthStr = getTenantMonthString(saleDate);

  const dailyDocRef = doc(db, STATS_DAILY_COLLECTION, getDailyStatsDocId(tenantId, dateStr));
  const monthlyDocRef = doc(db, STATS_MONTHLY_COLLECTION, getMonthlyStatsDocId(tenantId, monthStr));

  const [dailySnap, monthlySnap] = await Promise.all([
    tx.get(dailyDocRef),
    tx.get(monthlyDocRef),
  ]);

  firestoreLogger.logOperation('StatsTransaction', STATS_DAILY_COLLECTION, 'getDoc', 1);
  firestoreLogger.logOperation('StatsTransaction', STATS_MONTHLY_COLLECTION, 'getDoc', 1);

  // Daily mutation
  const dailyPrev: FinancialStatsSnapshot = dailySnap.exists()
    ? (dailySnap.data() as FinancialStatsSnapshot)
    : createDefaultStats(tenantId, dateStr);

  const dailyGross = Math.round(((dailyPrev.grossSales || 0) + saleData.grossTotal) * 100) / 100;
  const dailyReturns = dailyPrev.returnsTotal || 0;
  const dailyNet = Math.round((dailyGross - dailyReturns) * 100) / 100;
  const dailyProfit = Math.round(((dailyPrev.totalProfit || 0) + saleData.profit) * 100) / 100;

  const dailyNext: FinancialStatsSnapshot = {
    ...dailyPrev,
    grossSales: dailyGross,
    returnsTotal: dailyReturns,
    netSales: dailyNet,
    totalProfit: dailyProfit,
    invoicesCount: (dailyPrev.invoicesCount || 0) + 1,
    completedInvoicesCount: (dailyPrev.completedInvoicesCount || 0) + 1,
    itemsSold: (dailyPrev.itemsSold || 0) + saleData.itemsCount,
    topSellingItems: mergeTopSelling(dailyPrev.topSellingItems, saleData.itemsSummary),
    updatedAt: serverTimestamp(),
  };
  tx.set(dailyDocRef, dailyNext);

  // Monthly mutation
  const monthlyPrev: FinancialStatsSnapshot = monthlySnap.exists()
    ? (monthlySnap.data() as FinancialStatsSnapshot)
    : createDefaultStats(tenantId, monthStr);

  const monthlyGross = Math.round(((monthlyPrev.grossSales || 0) + saleData.grossTotal) * 100) / 100;
  const monthlyReturns = monthlyPrev.returnsTotal || 0;
  const monthlyNet = Math.round((monthlyGross - monthlyReturns) * 100) / 100;
  const monthlyProfit = Math.round(((monthlyPrev.totalProfit || 0) + saleData.profit) * 100) / 100;

  const monthlyNext: FinancialStatsSnapshot = {
    ...monthlyPrev,
    grossSales: monthlyGross,
    returnsTotal: monthlyReturns,
    netSales: monthlyNet,
    totalProfit: monthlyProfit,
    invoicesCount: (monthlyPrev.invoicesCount || 0) + 1,
    completedInvoicesCount: (monthlyPrev.completedInvoicesCount || 0) + 1,
    itemsSold: (monthlyPrev.itemsSold || 0) + saleData.itemsCount,
    topSellingItems: mergeTopSelling(monthlyPrev.topSellingItems, saleData.itemsSummary),
    updatedAt: serverTimestamp(),
  };
  tx.set(monthlyDocRef, monthlyNext);

  firestoreLogger.logOperation('StatsTransaction', STATS_DAILY_COLLECTION, 'setDoc', 1);
  firestoreLogger.logOperation('StatsTransaction', STATS_MONTHLY_COLLECTION, 'setDoc', 1);
}

/**
 * Applies a sale return / refund atomically inside a return transaction.
 * Strictly recorded on the return date (financial impact date).
 */
export async function applyReturnToStatsInTransaction(
  tx: Transaction,
  tenantId: string,
  returnDate: any,
  returnData: {
    refundAmount: number;
    costReversed: number;
    returnedItemsCount: number;
  }
): Promise<void> {
  const dateStr = getTenantDateString(returnDate);
  const monthStr = getTenantMonthString(returnDate);

  const dailyDocRef = doc(db, STATS_DAILY_COLLECTION, getDailyStatsDocId(tenantId, dateStr));
  const monthlyDocRef = doc(db, STATS_MONTHLY_COLLECTION, getMonthlyStatsDocId(tenantId, monthStr));

  const [dailySnap, monthlySnap] = await Promise.all([
    tx.get(dailyDocRef),
    tx.get(monthlyDocRef),
  ]);

  // Daily
  const dailyPrev: FinancialStatsSnapshot = dailySnap.exists()
    ? (dailySnap.data() as FinancialStatsSnapshot)
    : createDefaultStats(tenantId, dateStr);

  const dailyGross = dailyPrev.grossSales || 0;
  const dailyReturns = Math.round(((dailyPrev.returnsTotal || 0) + returnData.refundAmount) * 100) / 100;
  const dailyNet = Math.round((dailyGross - dailyReturns) * 100) / 100;
  const returnProfitDeduction = Math.round((returnData.refundAmount - returnData.costReversed) * 100) / 100;
  const dailyProfit = Math.round(((dailyPrev.totalProfit || 0) - returnProfitDeduction) * 100) / 100;

  const dailyNext: FinancialStatsSnapshot = {
    ...dailyPrev,
    grossSales: dailyGross,
    returnsTotal: dailyReturns,
    netSales: dailyNet,
    totalProfit: dailyProfit,
    itemsSold: Math.max(0, (dailyPrev.itemsSold || 0) - returnData.returnedItemsCount),
    updatedAt: serverTimestamp(),
  };
  tx.set(dailyDocRef, dailyNext);

  // Monthly
  const monthlyPrev: FinancialStatsSnapshot = monthlySnap.exists()
    ? (monthlySnap.data() as FinancialStatsSnapshot)
    : createDefaultStats(tenantId, monthStr);

  const monthlyGross = monthlyPrev.grossSales || 0;
  const monthlyReturns = Math.round(((monthlyPrev.returnsTotal || 0) + returnData.refundAmount) * 100) / 100;
  const monthlyNet = Math.round((monthlyGross - monthlyReturns) * 100) / 100;
  const monthlyProfit = Math.round(((monthlyPrev.totalProfit || 0) - returnProfitDeduction) * 100) / 100;

  const monthlyNext: FinancialStatsSnapshot = {
    ...monthlyPrev,
    grossSales: monthlyGross,
    returnsTotal: monthlyReturns,
    netSales: monthlyNet,
    totalProfit: monthlyProfit,
    itemsSold: Math.max(0, (monthlyPrev.itemsSold || 0) - returnData.returnedItemsCount),
    updatedAt: serverTimestamp(),
  };
  tx.set(monthlyDocRef, monthlyNext);
}

/**
 * Reverses a voided/cancelled sale from stats atomically in a transaction.
 */
export async function applyVoidSaleToStatsInTransaction(
  tx: Transaction,
  tenantId: string,
  saleDate: any,
  saleData: {
    total: number;
    profit: number;
    itemsCount: number;
    returnsToReverse?: number;
    originalSaleTotal?: number;
  }
): Promise<void> {
  const dateStr = getTenantDateString(saleDate);
  const monthStr = getTenantMonthString(saleDate);

  const dailyDocRef = doc(db, STATS_DAILY_COLLECTION, getDailyStatsDocId(tenantId, dateStr));
  const monthlyDocRef = doc(db, STATS_MONTHLY_COLLECTION, getMonthlyStatsDocId(tenantId, monthStr));

  const [dailySnap, monthlySnap] = await Promise.all([
    tx.get(dailyDocRef),
    tx.get(monthlyDocRef),
  ]);

  const returnsToReverse = Number(saleData.returnsToReverse || 0);
  const grossDeduction = saleData.originalSaleTotal !== undefined
    ? Number(saleData.originalSaleTotal)
    : (Number(saleData.total || 0) + returnsToReverse);

  if (dailySnap.exists()) {
    const p = dailySnap.data() as FinancialStatsSnapshot;
    const newReturns = Math.max(0, Math.round(((p.returnsTotal || 0) - returnsToReverse) * 100) / 100);
    const gross = Math.max(0, Math.round(((p.grossSales || 0) - grossDeduction) * 100) / 100);
    const net = Math.max(0, Math.round((gross - newReturns) * 100) / 100);
    const profit = Math.round(((p.totalProfit || 0) - saleData.profit) * 100) / 100;

    tx.set(dailyDocRef, {
      ...p,
      grossSales: gross,
      returnsTotal: newReturns,
      netSales: net,
      totalProfit: profit,
      completedInvoicesCount: Math.max(0, (p.completedInvoicesCount || 1) - 1),
      itemsSold: Math.max(0, (p.itemsSold || 0) - saleData.itemsCount),
      updatedAt: serverTimestamp(),
    });
  }

  if (monthlySnap.exists()) {
    const p = monthlySnap.data() as FinancialStatsSnapshot;
    const newReturns = Math.max(0, Math.round(((p.returnsTotal || 0) - returnsToReverse) * 100) / 100);
    const gross = Math.max(0, Math.round(((p.grossSales || 0) - grossDeduction) * 100) / 100);
    const net = Math.max(0, Math.round((gross - newReturns) * 100) / 100);
    const profit = Math.round(((p.totalProfit || 0) - saleData.profit) * 100) / 100;

    tx.set(monthlyDocRef, {
      ...p,
      grossSales: gross,
      returnsTotal: newReturns,
      netSales: net,
      totalProfit: profit,
      completedInvoicesCount: Math.max(0, (p.completedInvoicesCount || 1) - 1),
      itemsSold: Math.max(0, (p.itemsSold || 0) - saleData.itemsCount),
      updatedAt: serverTimestamp(),
    });
  }
}

/**
 * Records or reverses expenses in daily & monthly stats
 */
export async function applyExpenseToStats(
  tenantId: string,
  expenseDate: any,
  amount: number,
  isReversal = false
): Promise<void> {
  const dateStr = getTenantDateString(expenseDate);
  const monthStr = getTenantMonthString(expenseDate);
  const factor = isReversal ? -1 : 1;
  const delta = Math.round(amount * factor * 100) / 100;

  try {
    const dailyDocRef = doc(db, STATS_DAILY_COLLECTION, getDailyStatsDocId(tenantId, dateStr));
    const monthlyDocRef = doc(db, STATS_MONTHLY_COLLECTION, getMonthlyStatsDocId(tenantId, monthStr));

    const [dSnap, mSnap] = await Promise.all([getDoc(dailyDocRef), getDoc(monthlyDocRef)]);

    const dPrev = dSnap.exists() ? (dSnap.data() as FinancialStatsSnapshot) : createDefaultStats(tenantId, dateStr);
    const mPrev = mSnap.exists() ? (mSnap.data() as FinancialStatsSnapshot) : createDefaultStats(tenantId, monthStr);

    const batch = writeBatch(db);
    batch.set(dailyDocRef, {
      ...dPrev,
      totalExpenses: Math.max(0, Math.round(((dPrev.totalExpenses || 0) + delta) * 100) / 100),
      updatedAt: serverTimestamp(),
    });
    batch.set(monthlyDocRef, {
      ...mPrev,
      totalExpenses: Math.max(0, Math.round(((mPrev.totalExpenses || 0) + delta) * 100) / 100),
      updatedAt: serverTimestamp(),
    });
    await batch.commit();
  } catch (err) {
    console.warn('Failed updating expense stats:', err);
  }
}

/**
 * Records or reverses purchases in daily & monthly stats
 */
export async function applyPurchaseToStats(
  tenantId: string,
  purchaseDate: any,
  amount: number,
  isReversal = false
): Promise<void> {
  const dateStr = getTenantDateString(purchaseDate);
  const monthStr = getTenantMonthString(purchaseDate);
  const factor = isReversal ? -1 : 1;
  const delta = Math.round(amount * factor * 100) / 100;

  try {
    const dailyDocRef = doc(db, STATS_DAILY_COLLECTION, getDailyStatsDocId(tenantId, dateStr));
    const monthlyDocRef = doc(db, STATS_MONTHLY_COLLECTION, getMonthlyStatsDocId(tenantId, monthStr));

    const [dSnap, mSnap] = await Promise.all([getDoc(dailyDocRef), getDoc(monthlyDocRef)]);

    const dPrev = dSnap.exists() ? (dSnap.data() as FinancialStatsSnapshot) : createDefaultStats(tenantId, dateStr);
    const mPrev = mSnap.exists() ? (mSnap.data() as FinancialStatsSnapshot) : createDefaultStats(tenantId, monthStr);

    const batch = writeBatch(db);
    batch.set(dailyDocRef, {
      ...dPrev,
      totalPurchases: Math.max(0, Math.round(((dPrev.totalPurchases || 0) + delta) * 100) / 100),
      updatedAt: serverTimestamp(),
    });
    batch.set(monthlyDocRef, {
      ...mPrev,
      totalPurchases: Math.max(0, Math.round(((mPrev.totalPurchases || 0) + delta) * 100) / 100),
      updatedAt: serverTimestamp(),
    });
    await batch.commit();
  } catch (err) {
    console.warn('Failed updating purchase stats:', err);
  }
}

/**
 * Fast Read: Fetch single day stats snapshot (1 Read)
 */
export async function fetchDailyStats(
  tenantId: string,
  dateStr: string
): Promise<FinancialStatsSnapshot | null> {
  if (!tenantId || !dateStr) return null;
  const docRef = doc(db, STATS_DAILY_COLLECTION, getDailyStatsDocId(tenantId, dateStr));
  const snap = await getDoc(docRef);
  firestoreLogger.logOperation('fetchDailyStats', STATS_DAILY_COLLECTION, 'getDoc', 1);
  if (!snap.exists()) return null;
  return snap.data() as FinancialStatsSnapshot;
}

/**
 * Fast Read: Fetch monthly stats snapshot (1 Read)
 */
export async function fetchMonthlyStats(
  tenantId: string,
  monthStr: string
): Promise<FinancialStatsSnapshot | null> {
  if (!tenantId || !monthStr) return null;
  const docRef = doc(db, STATS_MONTHLY_COLLECTION, getMonthlyStatsDocId(tenantId, monthStr));
  const snap = await getDoc(docRef);
  firestoreLogger.logOperation('fetchMonthlyStats', STATS_MONTHLY_COLLECTION, 'getDoc', 1);
  if (!snap.exists()) return null;
  return snap.data() as FinancialStatsSnapshot;
}

/**
 * Fast Read: Fetch a list of recent days (e.g. for last 7 days revenue chart)
 */
export async function fetchMultiDayStats(
  tenantId: string,
  dateList: string[]
): Promise<FinancialStatsSnapshot[]> {
  if (!tenantId || dateList.length === 0) return [];
  const promises = dateList.map((d) => fetchDailyStats(tenantId, d));
  const results = await Promise.all(promises);
  return results.filter((r): r is FinancialStatsSnapshot => r !== null);
}
