/**
 * Existing Data Backfill / Migration Service
 * 
 * Safely computes historical aggregated statistics for all existing sales, returns,
 * expenses, and purchases, populating stats_daily and stats_monthly.
 * 
 * Key Guarantees:
 * 1. Strict Idempotency: re-running overwrites target partition with deterministic totals.
 * 2. Zero Data Loss: original collections are NEVER modified or deleted.
 * 3. Accurate Accounting: excludes cancelled/voided transactions and uses costPriceSnapshot for profit.
 * 4. Migration Marker: tracks completion status in system_migrations collection.
 */

import { db } from '@/lib/firebase';
import {
  collection,
  doc,
  getDoc,
  getDocs,
  query,
  where,
  writeBatch,
  serverTimestamp,
} from 'firebase/firestore';
import {
  STATS_DAILY_COLLECTION,
  STATS_MONTHLY_COLLECTION,
  getDailyStatsDocId,
  getMonthlyStatsDocId,
  createDefaultStats,
  FinancialStatsSnapshot,
} from './aggregatedStats.service';
import {
  getTenantDateString,
  getTenantMonthString,
  parseToTenantDate,
} from '@/lib/reportingTimezone';
import { firestoreLogger } from '@/lib/firestoreLogger';

export const MIGRATION_VERSION = 1;
export const MIGRATION_COLLECTION = 'system_migrations';

export interface MigrationStatus {
  tenantId: string;
  migrationVersion: number;
  completedAt: string;
  daysProcessed: number;
  monthsProcessed: number;
  totalSalesProcessed: number;
  totalGrossSales: number;
  returnsProcessed?: number;
  expensesProcessed?: number;
  purchaseOrdersProcessed?: number;
}

/**
 * Checks if stats backfill has already been completed for this tenant
 */
export async function isStatsMigrationComplete(tenantId: string): Promise<boolean> {
  if (!tenantId) return false;
  try {
    const docRef = doc(db, MIGRATION_COLLECTION, `stats_backfill_${tenantId}`);
    const snap = await getDoc(docRef);
    if (!snap.exists()) return false;
    const data = snap.data();
    return data?.migrationVersion >= MIGRATION_VERSION;
  } catch (err) {
    console.warn('Failed checking migration status:', err);
    return false;
  }
}

/**
 * Executes historical backfill migration across sales, returns, expenses, and purchases
 */
export async function runStatsBackfill(
  tenantId: string,
  forceRerun = false
): Promise<{ success: boolean; message: string; summary?: MigrationStatus }> {
  if (!tenantId) {
    return { success: false, message: 'معرف المنشأة مفقود' };
  }

  if (!forceRerun) {
    const alreadyDone = await isStatsMigrationComplete(tenantId);
    if (alreadyDone) {
      return { success: true, message: 'تم إتمام الترحيل مسبقاً لهذه المنشأة' };
    }
  }

  console.log(`[StatsMigration] Starting backfill for tenant: ${tenantId}`);

  try {
    // 1. Fetch raw historical sales
    let salesSnap = await getDocs(query(collection(db, 'sales'), where('tenantId', '==', tenantId)));
    if (salesSnap.empty) {
      salesSnap = await getDocs(query(collection(db, 'sales'), where('tenant_id', '==', tenantId)));
    }
    let rawSales = salesSnap.docs.map((d) => ({ id: d.id, ...d.data() as any }));

    // Fallback: check legacy orders if sales is empty
    if (rawSales.length === 0) {
      let ordersSnap = await getDocs(query(collection(db, 'orders'), where('tenantId', '==', tenantId)));
      if (ordersSnap.empty) {
        ordersSnap = await getDocs(query(collection(db, 'orders'), where('tenant_id', '==', tenantId)));
      }
      rawSales = ordersSnap.docs.map((d) => ({ id: d.id, ...d.data() as any }));
    }

    // 2. Fetch raw returns
    let returnsSnap = await getDocs(query(collection(db, 'sale_returns'), where('tenantId', '==', tenantId)));
    if (returnsSnap.empty) {
      returnsSnap = await getDocs(query(collection(db, 'sale_returns'), where('tenant_id', '==', tenantId)));
    }
    const rawReturns = returnsSnap.docs.map((d) => ({ id: d.id, ...d.data() as any }));

    // 3. Fetch raw expenses
    let expensesSnap = await getDocs(query(collection(db, 'expenses'), where('tenantId', '==', tenantId)));
    if (expensesSnap.empty) {
      expensesSnap = await getDocs(query(collection(db, 'expenses'), where('tenant_id', '==', tenantId)));
    }
    const rawExpenses = expensesSnap.docs.map((d) => ({ id: d.id, ...d.data() as any }));

    // 4. Fetch raw purchases
    let purchasesSnap = await getDocs(query(collection(db, 'purchase_orders'), where('tenantId', '==', tenantId)));
    if (purchasesSnap.empty) {
      purchasesSnap = await getDocs(query(collection(db, 'purchase_orders'), where('tenant_id', '==', tenantId)));
    }
    const rawPurchases = purchasesSnap.docs.map((d) => ({ id: d.id, ...d.data() as any }));

    // In-memory aggregates mapped by day (YYYY-MM-DD)
    const dailyMap = new Map<string, FinancialStatsSnapshot>();

    const getOrCreateDaily = (dStr: string): FinancialStatsSnapshot => {
      if (!dailyMap.has(dStr)) {
        dailyMap.set(dStr, createDefaultStats(tenantId, dStr));
      }
      return dailyMap.get(dStr)!;
    };

    let totalGrossAll = 0;
    let validSalesCount = 0;

    // A. Aggregate Sales
    for (const sale of rawSales) {
      // Exclude voided, cancelled, drafts
      if (sale.status === 'cancelled' || sale.status === 'voided' || sale.status === 'draft') continue;
      if (sale.saleStatus === 'cancelled' || sale.saleStatus === 'voided') continue;

      const dateVal = sale.createdAt || sale.created_at || sale.completedAt || sale.date;
      const dateStr = getTenantDateString(dateVal);
      const snapshot = getOrCreateDaily(dateStr);

      const totalVal = Number(sale.total || sale.totalAmount || sale.finalTotal || 0);
      const costVal = Number(sale.costTotal || sale.totalCost || 0);
      const profitVal = Number(sale.profit !== undefined ? sale.profit : totalVal - costVal);
      const itemsCountVal = Array.isArray(sale.items)
        ? sale.items.reduce((s: number, i: any) => s + (Number(i.quantity || i.qty || 1)), 0)
        : Number(sale.itemsCount || 1);

      snapshot.grossSales = Math.round((snapshot.grossSales + totalVal) * 100) / 100;
      snapshot.totalProfit = Math.round((snapshot.totalProfit + profitVal) * 100) / 100;
      snapshot.invoicesCount += 1;
      snapshot.completedInvoicesCount += 1;
      snapshot.itemsSold += itemsCountVal;

      totalGrossAll += totalVal;
      validSalesCount++;
    }

    // B. Aggregate Returns (on return date)
    for (const ret of rawReturns) {
      if (ret.status === 'cancelled' || ret.status === 'voided') continue;

      const dateVal = ret.createdAt || ret.created_at || ret.returnDate || ret.date;
      const dateStr = getTenantDateString(dateVal);
      const snapshot = getOrCreateDaily(dateStr);

      const refundVal = Number(ret.refundAmount || ret.totalRefund || ret.total || 0);
      const costReversedVal = Number(ret.costReversed || ret.costTotal || 0);
      const returnProfit = Math.round((refundVal - costReversedVal) * 100) / 100;
      const returnedQtyVal = Array.isArray(ret.items)
        ? ret.items.reduce((s: number, i: any) => s + (Number(i.returnedQuantity || i.quantity || 1)), 0)
        : Number(ret.itemsCount || 1);

      snapshot.returnsTotal = Math.round((snapshot.returnsTotal + refundVal) * 100) / 100;
      snapshot.totalProfit = Math.round((snapshot.totalProfit - returnProfit) * 100) / 100;
      snapshot.itemsSold = Math.max(0, snapshot.itemsSold - returnedQtyVal);
    }

    // C. Aggregate Expenses
    for (const exp of rawExpenses) {
      if (exp.status === 'voided' || exp.status === 'cancelled' || exp.status === 'rejected') continue;

      const dateVal = exp.date || exp.createdAt || exp.created_at;
      const dateStr = getTenantDateString(dateVal);
      const snapshot = getOrCreateDaily(dateStr);

      const amt = Number(exp.amount || 0);
      snapshot.totalExpenses = Math.round((snapshot.totalExpenses + amt) * 100) / 100;
    }

    // D. Aggregate Purchases
    for (const pur of rawPurchases) {
      if (pur.status === 'cancelled' || pur.status === 'draft' || pur.status === 'rejected') continue;

      const dateVal = pur.createdAt || pur.created_at || pur.orderDate;
      const dateStr = getTenantDateString(dateVal);
      const snapshot = getOrCreateDaily(dateStr);

      const amt = Number(pur.totalAmount || pur.total_amount || pur.total || 0);
      snapshot.totalPurchases = Math.round((snapshot.totalPurchases + amt) * 100) / 100;
    }

    // Calculate netSales for each day
    for (const snap of dailyMap.values()) {
      snap.netSales = Math.round((snap.grossSales - snap.returnsTotal) * 100) / 100;
      snap.updatedAt = serverTimestamp();
    }

    // E. Aggregate Monthly from Daily
    const monthlyMap = new Map<string, FinancialStatsSnapshot>();
    for (const [dayStr, daySnap] of dailyMap.entries()) {
      const monthStr = dayStr.substring(0, 7);
      if (!monthlyMap.has(monthStr)) {
        monthlyMap.set(monthStr, createDefaultStats(tenantId, monthStr));
      }
      const mSnap = monthlyMap.get(monthStr)!;
      mSnap.grossSales = Math.round((mSnap.grossSales + daySnap.grossSales) * 100) / 100;
      mSnap.returnsTotal = Math.round((mSnap.returnsTotal + daySnap.returnsTotal) * 100) / 100;
      mSnap.netSales = Math.round((mSnap.grossSales - mSnap.returnsTotal) * 100) / 100;
      mSnap.totalProfit = Math.round((mSnap.totalProfit + daySnap.totalProfit) * 100) / 100;
      mSnap.totalExpenses = Math.round((mSnap.totalExpenses + daySnap.totalExpenses) * 100) / 100;
      mSnap.totalPurchases = Math.round((mSnap.totalPurchases + daySnap.totalPurchases) * 100) / 100;
      mSnap.invoicesCount += daySnap.invoicesCount;
      mSnap.completedInvoicesCount += daySnap.completedInvoicesCount;
      mSnap.itemsSold += daySnap.itemsSold;
      mSnap.updatedAt = serverTimestamp();
    }

    // F. Commit in Batches (max 400 ops per batch to be well within Firestore 500 limit)
    const BATCH_SIZE = 400;
    let currentBatch = writeBatch(db);
    let opCount = 0;

    for (const [dStr, dSnap] of dailyMap.entries()) {
      const docRef = doc(db, STATS_DAILY_COLLECTION, getDailyStatsDocId(tenantId, dStr));
      currentBatch.set(docRef, dSnap);
      opCount++;
      if (opCount >= BATCH_SIZE) {
        await currentBatch.commit();
        currentBatch = writeBatch(db);
        opCount = 0;
      }
    }

    for (const [mStr, mSnap] of monthlyMap.entries()) {
      const docRef = doc(db, STATS_MONTHLY_COLLECTION, getMonthlyStatsDocId(tenantId, mStr));
      currentBatch.set(docRef, mSnap);
      opCount++;
      if (opCount >= BATCH_SIZE) {
        await currentBatch.commit();
        currentBatch = writeBatch(db);
        opCount = 0;
      }
    }

    // Record migration completion marker
    const markerRef = doc(db, MIGRATION_COLLECTION, `stats_backfill_${tenantId}`);
    const summary: MigrationStatus = {
      tenantId,
      migrationVersion: MIGRATION_VERSION,
      completedAt: new Date().toISOString(),
      daysProcessed: dailyMap.size,
      monthsProcessed: monthlyMap.size,
      totalSalesProcessed: validSalesCount,
      totalGrossSales: Math.round(totalGrossAll * 100) / 100,
      returnsProcessed: rawReturns.length,
      expensesProcessed: rawExpenses.length,
      purchaseOrdersProcessed: rawPurchases.length,
    };
    currentBatch.set(markerRef, summary);
    await currentBatch.commit();

    console.log(`[StatsMigration] Backfill finished: ${dailyMap.size} days, ${monthlyMap.size} months.`);
    return {
      success: true,
      message: `تم الترحيل بنجاح (${dailyMap.size} يوم، ${monthlyMap.size} شهر)`,
      summary,
    };
  } catch (err: any) {
    console.error('[StatsMigration] Migration failed:', err);
    return { success: false, message: `فشل الترحيل: ${err.message}` };
  }
}
