/**
 * Analytics Aggregation Engine & Daily Metrics Pre-calculation
 * Stores fast-retrieval pre-aggregated daily metrics in 'daily_analytics_metrics'.
 * Deterministic doc key: `${tenantId}___${branchId}___${dateStr}`.
 * Provides an Idempotent Rebuild Utility to recalculate any historical date range.
 */

import { doc, getDoc, setDoc, collection, query, where, getDocs } from 'firebase/firestore';
import { db } from '../../lib/firebase';
import { Sale, SaleReturn } from '../../types/retail.types';
import { DateRange, DEFAULT_TIMEZONE, formatZonedDate, getZonedDayBounds } from './reportingTimezone';
import { fetchSalesPeriodData } from './salesAnalytics.service';

export interface DailyAnalyticsMetricRecord {
  id: string; // `${tenantId}___${branchId}___${date}`
  tenantId: string;
  branchId: string; // 'all' or specific branch ID
  date: string;     // YYYY-MM-DD in target timezone
  timeZone: string;
  grossSales: number;
  discounts: number;
  returns: number;
  netSales: number;
  cogs: number;
  grossProfit: number;
  grossMarginPct: number;
  transactionsCount: number;
  itemsSoldCount: number;
  cashSales: number;
  cardSales: number;
  creditSales: number;
  retailSales: number;
  wholesaleSales: number;
  updatedAt: string;
}

export function getDailyMetricDocId(tenantId: string, branchId: string, dateStr: string): string {
  return `${tenantId}___${branchId || 'all'}___${dateStr}`;
}

/**
 * Rebuild daily metrics idempotently for a specific date range and branch
 */
export async function rebuildDailyAnalyticsForDateRange(
  tenantId: string,
  startDateStr: string,
  endDateStr: string,
  branchId: string = 'all',
  timeZone: string = DEFAULT_TIMEZONE
): Promise<{ processedDaysCount: number; updatedRecordIds: string[] }> {
  const startBounds = getZonedDayBounds(startDateStr, timeZone);
  const endBounds = getZonedDayBounds(endDateStr, timeZone);

  // 1. Fetch sales and returns safely
  const { sales, returns } = await fetchSalesPeriodData(
    tenantId,
    { startIso: startBounds.startIso, endIso: endBounds.endIso, timeZone },
    branchId !== 'all' ? branchId : undefined
  );

  // 2. Accumulate per date (in local timezone)
  const dayBuckets = new Map<string, Omit<DailyAnalyticsMetricRecord, 'id' | 'updatedAt'>>();

  // Initialize all days in range to ensure empty days have 0 records
  const [sy, sm, sd] = startDateStr.split('-').map(Number);
  const [ey, em, ed] = endDateStr.split('-').map(Number);
  const curDate = new Date(Date.UTC(sy, sm - 1, sd, 12, 0, 0));
  const endDateObj = new Date(Date.UTC(ey, em - 1, ed, 12, 0, 0));

  while (curDate <= endDateObj) {
    const dStr = formatZonedDate(curDate, timeZone);
    dayBuckets.set(dStr, {
      tenantId,
      branchId,
      date: dStr,
      timeZone,
      grossSales: 0,
      discounts: 0,
      returns: 0,
      netSales: 0,
      cogs: 0,
      grossProfit: 0,
      grossMarginPct: 0,
      transactionsCount: 0,
      itemsSoldCount: 0,
      cashSales: 0,
      cardSales: 0,
      creditSales: 0,
      retailSales: 0,
      wholesaleSales: 0,
    });
    curDate.setUTCDate(curDate.getUTCDate() + 1);
  }

  sales.forEach((sale) => {
    if (sale.status === 'cancelled' || (sale as any).status === 'voided') return;

    const dStr = formatZonedDate(sale.createdAt, timeZone);
    if (!dayBuckets.has(dStr)) return;

    const b = dayBuckets.get(dStr)!;
    const subtotal = sale.subtotal || sale.total + (sale.discountTotal || 0);
    const disc = sale.discountTotal || 0;

    b.grossSales += subtotal;
    b.discounts += disc;
    b.transactionsCount += 1;

    let saleCogs = 0;
    for (const it of sale.items || []) {
      const qty = it.baseQuantity || it.quantity || 0;
      b.itemsSoldCount += qty;
      const unitCost = it.unitCostSnapshot ?? (it as any).costPriceSnapshot ?? (it as any).costPrice ?? 0;
      saleCogs += it.totalCost !== undefined ? it.totalCost : qty * unitCost;
    }
    if (saleCogs === 0 && (sale.costTotal || 0) > 0) {
      saleCogs = sale.costTotal;
    }
    b.cogs += saleCogs;

    // Payment methods
    for (const p of sale.paymentMethods || []) {
      if (p.method === 'cash') b.cashSales += p.amount || 0;
      else if (p.method === 'card') b.cardSales += p.amount || 0;
      else if (p.method === 'credit' || p.method === 'receivable') b.creditSales += p.amount || 0;
    }

    // Retail vs Wholesale
    if (sale.priceTierUsed === 'wholesale' || sale.saleType === 'wholesale') {
      b.wholesaleSales += sale.total || 0;
    } else {
      b.retailSales += sale.total || 0;
    }
  });

  returns.forEach((ret) => {
    const dStr = formatZonedDate(ret.createdAt, timeZone);
    if (!dayBuckets.has(dStr)) return;

    const b = dayBuckets.get(dStr)!;
    const refundAmt = ret.refundAmount || ret.subtotalReturned || (ret as any).total || 0;
    b.returns += refundAmt;
    b.cogs = Math.max(0, b.cogs - (ret.costReversed || (ret as any).cost_reversed || 0));
  });

  // 4. Upsert records idempotently
  const now = new Date().toISOString();
  const updatedRecordIds: string[] = [];

  for (const [dateStr, bucket] of dayBuckets.entries()) {
    const docId = getDailyMetricDocId(tenantId, branchId, dateStr);
    bucket.netSales = Math.max(0, bucket.grossSales - bucket.discounts - bucket.returns);
    bucket.grossProfit = bucket.netSales - bucket.cogs;
    bucket.grossMarginPct = bucket.netSales > 0 ? Number(((bucket.grossProfit / bucket.netSales) * 100).toFixed(2)) : 0;

    const record: DailyAnalyticsMetricRecord = {
      ...bucket,
      id: docId,
      grossSales: Number(bucket.grossSales.toFixed(2)),
      discounts: Number(bucket.discounts.toFixed(2)),
      returns: Number(bucket.returns.toFixed(2)),
      netSales: Number(bucket.netSales.toFixed(2)),
      cogs: Number(bucket.cogs.toFixed(2)),
      grossProfit: Number(bucket.grossProfit.toFixed(2)),
      cashSales: Number(bucket.cashSales.toFixed(2)),
      cardSales: Number(bucket.cardSales.toFixed(2)),
      creditSales: Number(bucket.creditSales.toFixed(2)),
      retailSales: Number(bucket.retailSales.toFixed(2)),
      wholesaleSales: Number(bucket.wholesaleSales.toFixed(2)),
      updatedAt: now,
    };

    const docRef = doc(db, 'daily_analytics_metrics', docId);
    await setDoc(docRef, record, { merge: true });
    updatedRecordIds.push(docId);
  }

  return {
    processedDaysCount: dayBuckets.size,
    updatedRecordIds,
  };
}

/**
 * Fetch pre-aggregated daily metrics from cache/store
 */
export async function getAggregatedDailyMetrics(
  tenantId: string,
  startDateStr: string,
  endDateStr: string,
  branchId: string = 'all'
): Promise<DailyAnalyticsMetricRecord[]> {
  const metricsRef = collection(db, 'daily_analytics_metrics');
  const q = query(
    metricsRef,
    where('tenantId', '==', tenantId),
    where('branchId', '==', branchId),
    where('date', '>=', startDateStr),
    where('date', '<=', endDateStr)
  );

  const snap = await getDocs(q);
  const records: DailyAnalyticsMetricRecord[] = [];
  snap.forEach((doc) => {
    records.push(doc.data() as DailyAnalyticsMetricRecord);
  });

  return records.sort((a, b) => a.date.localeCompare(b.date));
}
