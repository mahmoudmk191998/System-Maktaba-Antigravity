/**
 * Sales Analytics & Demand Intelligence Service
 * Computes deep sales intelligence, category/brand performance,
 * book-specific dimensions, hourly peak heatmaps, and basket associations.
 */

import { collection, getDocs, query, where } from 'firebase/firestore';
import { db } from '../../lib/firebase';
import { Sale, SaleReturn, Product } from '../../types/retail.types';
import { DateRange, DEFAULT_TIMEZONE, formatZonedDate, getZonedParts, parseToDate } from './reportingTimezone';
import { buildKPIChange, KPIChange } from './analyticsDefinitions';
import { fetchProductsCatalog } from './inventoryAnalytics.service';

export interface SalesKPISummary {
  grossSales: KPIChange;
  discounts: KPIChange;
  returns: KPIChange;
  netSales: KPIChange;
  cogs: KPIChange;
  grossProfit: KPIChange;
  grossMarginPct: KPIChange;
  transactionsCount: KPIChange;
  itemsSoldCount: KPIChange;
  averageBasketSize: KPIChange; // items per transaction
  averageOrderValue: KPIChange; // net sales per transaction
}

export interface DimensionPerformance {
  key: string;
  label: string;
  unitsSold: number;
  netSales: number;
  cogs: number;
  grossProfit: number;
  grossMarginPct: number;
  transactionSharePct: number;
}

export interface DailySalesTrend {
  date: string; // YYYY-MM-DD in target timezone
  grossSales: number;
  discounts: number;
  returns: number;
  netSales: number;
  cogs: number;
  grossProfit: number;
  transactionsCount: number;
}

export interface HourlySalesDistribution {
  hour: number; // 0 - 23
  salesCount: number;
  totalSalesAmount: number;
  avgTicket: number;
}

export interface PaymentMethodShare {
  method: string;
  count: number;
  amount: number;
  sharePct: number;
}

export interface BasketAssociationPair {
  productAId: string;
  productAName: string;
  productBId: string;
  productBName: string;
  coOccurrenceCount: number;
  supportPct: number; // percentage of total transactions containing both
}

export interface SalesAnalyticsReport {
  summary: SalesKPISummary;
  dailyTrends: DailySalesTrend[];
  hourlyDistribution: HourlySalesDistribution[];
  categories: DimensionPerformance[];
  brands: DimensionPerformance[];
  bookAuthors: DimensionPerformance[];
  bookPublishers: DimensionPerformance[];
  bookSubjects: DimensionPerformance[];
  bookGrades: DimensionPerformance[];
  paymentMethods: PaymentMethodShare[];
  retailVsWholesale: {
    retail: { sales: number; count: number };
    wholesale: { sales: number; count: number };
  };
  frequentlyBoughtTogether: BasketAssociationPair[];
}

interface RawSalesPeriodData {
  sales: Sale[];
  returns: SaleReturn[];
}

/**
 * Fetch sales and returns for a specific date range, tenant, and optional branch
 */
export async function fetchSalesPeriodData(
  tenantId: string,
  dateRange: DateRange,
  branchId?: string,
  timeZone: string = DEFAULT_TIMEZONE
): Promise<RawSalesPeriodData> {
  const startMs = new Date(dateRange.startIso).getTime();
  const endMs = new Date(dateRange.endIso).getTime();

  const isMatchingSale = (s: any): boolean => {
    if (s.status === 'cancelled' || s.saleStatus === 'cancelled' || s.status === 'voided') return false;

    // Check branch
    const b = s.branchId || s.branch_id || s.destinationLocationId || s.locationId;
    if (branchId && branchId !== 'all' && b && b !== branchId && b !== 'default') return false;

    // If preset is all-time (covers wide range)
    if (dateRange.startDate <= '2020-01-01' && dateRange.endDate >= '2030-01-01') {
      return true;
    }

    // Parse date safely from any format (or default to now so un-dated sales aren't lost)
    const dVal = s.createdAt || s.created_at || s.completedAt || s.date || s.order_date || s.timestamp || s.saleDate || s.createdDate || s.time || s.updatedAt;
    const date = parseToDate(dVal);
    if (!date) return true; // Don't drop sales with missing or unusual timestamp
    const ms = date.getTime();

    // Check millisecond range
    if (ms >= startMs && ms <= endMs) return true;

    // Check date string in reporting timezone
    const saleDateStr = formatZonedDate(date, timeZone);
    if (saleDateStr && dateRange.startDate && dateRange.endDate) {
      if (saleDateStr >= dateRange.startDate && saleDateStr <= dateRange.endDate) {
        return true;
      }
    }
    return false;
  };

  const normalizeSale = (d: any, id: string): Sale => {
    const total = Number(d.total ?? d.total_amount ?? d.final_amount ?? d.grandTotal ?? 0);
    const discount = Number(d.discountTotal ?? d.discount ?? d.discount_amount ?? 0);
    const subtotal = Number(d.subtotal ?? d.subtotal_amount ?? (total + discount));
    let costTotal = Number(d.costTotal ?? d.totalCost ?? d.cogs ?? 0);
    let grossProfit = Number(d.grossProfit ?? (total - costTotal));
    const dVal = d.createdAt || d.created_at || d.completedAt || d.date || d.order_date || d.timestamp || d.saleDate || d.createdDate || d.time || d.updatedAt;
    const date = parseToDate(dVal);
    const isoString = date ? date.toISOString() : new Date().toISOString();

    const items = (d.items || []).map((it: any) => {
      const qty = Number(it.quantity || it.qty || 1);
      const baseQuantity = Number(it.baseQuantity || it.quantity || it.qty || 1);
      const unitPrice = Number(it.unitPrice ?? it.unitSellingPrice ?? it.price ?? 0);
      const unitCostSnapshot = Number(it.unitCostSnapshot ?? it.costPriceSnapshot ?? it.unitCost ?? it.cost_price ?? it.cost ?? 0);
      const totalCost = it.totalCost !== undefined ? Number(it.totalCost) : (unitCostSnapshot > 0 ? baseQuantity * unitCostSnapshot : undefined);
      const lineTotal = Number(it.lineTotal ?? it.total ?? (qty * unitPrice));

      return {
        ...it,
        quantity: qty,
        baseQuantity,
        unitPrice,
        unitCostSnapshot,
        totalCost,
        lineTotal,
      };
    });

    // If costTotal is 0 but line items have costs, aggregate them
    if (costTotal === 0 && items.length > 0) {
      const itemCostSum = items.reduce((sum: number, it: any) => sum + (it.totalCost || 0), 0);
      if (itemCostSum > 0) {
        costTotal = itemCostSum;
        grossProfit = total - costTotal;
      }
    }

    return {
      ...d,
      id,
      tenantId: d.tenantId || d.tenant_id || tenantId,
      branchId: d.branchId || d.branch_id || branchId || '',
      invoiceNumber: d.invoiceNumber || d.invoice_number || d.orderNumber || d.order_number || id.slice(0, 8),
      createdAt: isoString,
      completedAt: isoString,
      status: d.status || d.saleStatus || 'completed',
      saleStatus: d.saleStatus || d.status || 'completed',
      subtotal,
      discountTotal: discount,
      discount,
      total,
      costTotal,
      grossProfit,
      items,
      paymentMethods: d.paymentMethods || d.payments || [],
      payments: d.payments || [],
    } as Sale;
  };

  const salesDocsMap = new Map<string, any>();

  const safeAddDoc = (id: string, data: any) => {
    if (!salesDocsMap.has(id)) {
      salesDocsMap.set(id, data);
    }
  };

  // Fetch only documents explicitly owned by the current tenant.
  // Never fall back to "default" or an unfiltered collection read: that can resurrect
  // deleted test data in reports and can leak records across tenants.
  for (const collName of ['sales', 'orders', 'invoices']) {
    try {
      const snap1 = await getDocs(query(collection(db, collName), where('tenantId', '==', tenantId)));
      snap1.docs.forEach((d) => safeAddDoc(d.id, d.data()));
    } catch (e) {
      console.warn(`Unable to query ${collName}.tenantId for reporting:`, e);
    }

    try {
      const snap2 = await getDocs(query(collection(db, collName), where('tenant_id', '==', tenantId)));
      snap2.docs.forEach((d) => safeAddDoc(d.id, d.data()));
    } catch (e) {
      console.warn(`Unable to query ${collName}.tenant_id for reporting:`, e);
    }
  }

  // If any orders/sales have no line items, attempt to load from 'order_items' or 'sale_items' collection
  const missingItemsOrderIds = Array.from(salesDocsMap.entries())
    .filter(([_, d]) => !d.items || d.items.length === 0)
    .map(([id]) => id);

  if (missingItemsOrderIds.length > 0) {
    try {
      for (let i = 0; i < missingItemsOrderIds.length; i += 10) {
        const chunk = missingItemsOrderIds.slice(i, i + 10);
        try {
          const qItems = query(collection(db, 'order_items'), where('order_id', 'in', chunk));
          const snapItems = await getDocs(qItems);
          snapItems.forEach((docSnap) => {
            const itemData = docSnap.data();
            const ordId = itemData.order_id || itemData.orderId;
            const ordDoc = salesDocsMap.get(ordId);
            if (ordDoc) {
              if (!ordDoc.items) ordDoc.items = [];
              ordDoc.items.push({
                id: docSnap.id,
                productId: itemData.menu_item_id || itemData.productId || docSnap.id,
                productName: itemData.name || itemData.productName || 'عنصر',
                quantity: Number(itemData.quantity || 1),
                baseQuantity: Number(itemData.quantity || 1),
                unitPrice: Number(itemData.unit_price || itemData.price || 0),
                unitCostSnapshot: Number(itemData.cost || 0),
                totalCost: Number(itemData.cost || 0) * Number(itemData.quantity || 1),
                lineTotal: Number(itemData.quantity || 1) * Number(itemData.unit_price || itemData.price || 0),
                categoryName: itemData.category_id || 'عام',
              });
            }
          });
        } catch {}

        try {
          const qSaleItems = query(collection(db, 'sale_items'), where('sale_id', 'in', chunk));
          const snapSaleItems = await getDocs(qSaleItems);
          snapSaleItems.forEach((docSnap) => {
            const itemData = docSnap.data();
            const saleId = itemData.sale_id || itemData.saleId;
            const saleDoc = salesDocsMap.get(saleId);
            if (saleDoc) {
              if (!saleDoc.items) saleDoc.items = [];
              saleDoc.items.push({
                id: docSnap.id,
                productId: itemData.productId || docSnap.id,
                productName: itemData.productNameSnapshot || itemData.productName || itemData.name || 'صنف',
                quantity: Number(itemData.quantity || 1),
                baseQuantity: Number(itemData.baseQuantity || itemData.quantity || 1),
                unitPrice: Number(itemData.unitSellingPrice || itemData.unitPrice || itemData.price || 0),
                unitCostSnapshot: Number(itemData.unitCostSnapshot || itemData.cost || 0),
                totalCost: Number(itemData.totalCost || (Number(itemData.cost || 0) * Number(itemData.quantity || 1))),
                lineTotal: Number(itemData.lineTotal || (Number(itemData.quantity || 1) * Number(itemData.unitSellingPrice || 0))),
                categoryName: itemData.categorySnapshot || 'عام',
              });
            }
          });
        } catch {}
      }
    } catch (e) {
      console.warn('Could not load line items fallback:', e);
    }
  }

  const sales: Sale[] = [];
  for (const [id, rawData] of salesDocsMap.entries()) {
    if (isMatchingSale(rawData)) {
      sales.push(normalizeSale(rawData, id));
    }
  }

  // Fetch returns from both sale_returns and sales_returns
  const returnsDocsMap = new Map<string, any>();
  const safeAddReturn = (id: string, data: any) => {
    if (!returnsDocsMap.has(id)) {
      returnsDocsMap.set(id, data);
    }
  };

  for (const collName of ['sale_returns', 'sales_returns']) {
    try {
      const snap1 = await getDocs(query(collection(db, collName), where('tenantId', '==', tenantId)));
      snap1.docs.forEach((d) => safeAddReturn(d.id, d.data()));
    } catch (e) {
      console.warn(`Unable to query ${collName}.tenantId for returns reporting:`, e);
    }

    try {
      const snap2 = await getDocs(query(collection(db, collName), where('tenant_id', '==', tenantId)));
      snap2.docs.forEach((d) => safeAddReturn(d.id, d.data()));
    } catch (e) {
      console.warn(`Unable to query ${collName}.tenant_id for returns reporting:`, e);
    }
  }

  const returns: SaleReturn[] = [];
  for (const [id, r] of returnsDocsMap.entries()) {
    if (r.status && r.status !== 'completed') continue;
    const b = r.branchId || r.branch_id;
    if (branchId && branchId !== 'all' && b && b !== branchId) continue;

    const dVal = r.createdAt || r.created_at || r.returnDate || r.completedAt || r.timestamp;
    const date = parseToDate(dVal) || new Date();
    const ms = date.getTime();
    const returnDateStr = formatZonedDate(date, timeZone);
    const inRange = (ms >= startMs && ms <= endMs) || 
      Boolean(returnDateStr && dateRange.startDate && dateRange.endDate && returnDateStr >= dateRange.startDate && returnDateStr <= dateRange.endDate);

    if (inRange) {
      returns.push({
        id,
        ...r,
        refundAmount: Number(r.refundAmount ?? r.subtotalReturned ?? r.total ?? 0),
        costReversed: Number(r.costReversed ?? 0),
        createdAt: date.toISOString(),
      } as SaleReturn);
    }
  }

  return { sales, returns };
}

/**
 * Internal helper to calculate core aggregates from raw sales & returns
 */
function computePeriodAggregates(data: RawSalesPeriodData) {
  let grossSales = 0;
  let discounts = 0;
  let itemsSoldCount = 0;
  let cogs = 0;
  let totalInvoiceTotals = 0;
  let recordedGrossProfit = 0;

  for (const sale of data.sales) {
    const total = Number(sale.total ?? (sale as any).final_amount ?? (sale as any).grandTotal ?? 0);
    const disc = Number(sale.discountTotal ?? sale.discount ?? (sale as any).discount_amount ?? 0);
    const sub = Number(sale.subtotal ?? (sale as any).subtotal_amount ?? (total + disc));

    grossSales += (sub > 0 ? sub : total + disc);
    discounts += disc;
    totalInvoiceTotals += total;

    if (sale.grossProfit !== undefined && Number(sale.grossProfit) > 0) {
      recordedGrossProfit += Number(sale.grossProfit);
    }

    let saleItemsCount = 0;
    let saleCost = 0;

    if (Array.isArray(sale.items) && sale.items.length > 0) {
      for (const item of sale.items) {
        const qty = Number(item.baseQuantity || item.quantity || 1);
        saleItemsCount += qty;
        const unitCost = Number(item.unitCostSnapshot ?? (item as any).costPriceSnapshot ?? (item as any).unitCost ?? (item as any).costPrice ?? (item as any).cost ?? 0);
        saleCost += (item.totalCost !== undefined ? Number(item.totalCost) : qty * unitCost);
      }
    } else {
      saleItemsCount = 1;
    }
    itemsSoldCount += saleItemsCount;

    // Fallback 1: document-level costTotal
    if (saleCost === 0 && (sale.costTotal || (sale as any).totalCost || (sale as any).cogs)) {
      saleCost = Number(sale.costTotal || (sale as any).totalCost || (sale as any).cogs || 0);
    }
    // Fallback 2: compute cost from total - grossProfit if grossProfit was saved
    if (saleCost === 0 && (sale.grossProfit !== undefined && Number(sale.grossProfit) > 0 && total > Number(sale.grossProfit))) {
      saleCost = Math.max(0, total - Number(sale.grossProfit));
    }
    cogs += saleCost;
  }

  let returnsTotal = 0;
  let returnCogs = 0;
  for (const ret of data.returns) {
    returnsTotal += Number(ret.refundAmount ?? ret.subtotalReturned ?? (ret as any).total ?? 0);
    returnCogs += Number(ret.costReversed ?? 0);
  }

  const netCogs = Math.max(0, cogs - returnCogs);

  // Net Sales calculation:
  // In POS invoices, the sum of totals already incorporates discounts.
  // Net sales = (gross billed amount) - (refunds)
  const billedNet = Math.max(0, totalInvoiceTotals - returnsTotal);
  const standardNet = Math.max(0, grossSales - discounts - returnsTotal);
  const netSales = Math.max(billedNet, standardNet);

  // Gross profit calculation with fallbacks
  let grossProfit = Math.max(0, netSales - netCogs);
  if (grossProfit === 0 && recordedGrossProfit > 0) {
    grossProfit = Math.max(0, recordedGrossProfit - returnsTotal);
  }
  if (grossProfit === 0 && cogs === 0 && netSales > 0) {
    grossProfit = recordedGrossProfit > 0 ? recordedGrossProfit : netSales;
  }

  const grossMarginPct = netSales > 0 ? Number(((grossProfit / netSales) * 100).toFixed(2)) : 0;
  const transactionsCount = data.sales.length;
  const averageBasketSize = transactionsCount > 0 ? Number((itemsSoldCount / transactionsCount).toFixed(1)) : 0;
  const averageOrderValue = transactionsCount > 0 ? Number((netSales / transactionsCount).toFixed(2)) : 0;

  return {
    grossSales,
    discounts,
    returns: returnsTotal,
    netSales,
    cogs: netCogs,
    grossProfit,
    grossMarginPct,
    transactionsCount,
    itemsSoldCount,
    averageBasketSize,
    averageOrderValue,
  };
}

/**
 * Generate full sales analytics report with dimensional breakdowns and association mining
 */
export async function generateSalesAnalytics(
  tenantId: string,
  currentRange: DateRange,
  branchId?: string,
  comparisonRange?: DateRange,
  timeZone: string = DEFAULT_TIMEZONE,
  productsCatalog?: Map<string, Product>
): Promise<SalesAnalyticsReport> {
  let catalog = productsCatalog;
  if (!catalog) {
    catalog = await fetchProductsCatalog(tenantId);
  }

  const currentData = await fetchSalesPeriodData(tenantId, currentRange, branchId, timeZone);
  const curAgg = computePeriodAggregates(currentData);

  let prevAgg: ReturnType<typeof computePeriodAggregates> | undefined;
  if (comparisonRange) {
    const prevData = await fetchSalesPeriodData(tenantId, comparisonRange, branchId, timeZone);
    prevAgg = computePeriodAggregates(prevData);
  }

  const summary: SalesKPISummary = {
    grossSales: buildKPIChange(curAgg.grossSales, prevAgg?.grossSales),
    discounts: buildKPIChange(curAgg.discounts, prevAgg?.discounts),
    returns: buildKPIChange(curAgg.returns, prevAgg?.returns),
    netSales: buildKPIChange(curAgg.netSales, prevAgg?.netSales),
    cogs: buildKPIChange(curAgg.cogs, prevAgg?.cogs),
    grossProfit: buildKPIChange(curAgg.grossProfit, prevAgg?.grossProfit),
    grossMarginPct: buildKPIChange(curAgg.grossMarginPct, prevAgg?.grossMarginPct),
    transactionsCount: buildKPIChange(curAgg.transactionsCount, prevAgg?.transactionsCount),
    itemsSoldCount: buildKPIChange(curAgg.itemsSoldCount, prevAgg?.itemsSoldCount),
    averageBasketSize: buildKPIChange(curAgg.averageBasketSize, prevAgg?.averageBasketSize),
    averageOrderValue: buildKPIChange(curAgg.averageOrderValue, prevAgg?.averageOrderValue),
  };

  // Daily Trend aggregation (respecting local timezone)
  const dailyMap = new Map<string, DailySalesTrend>();
  for (const s of currentData.sales) {
    const zonedDate = formatZonedDate(s.createdAt, timeZone);
    if (!dailyMap.has(zonedDate)) {
      dailyMap.set(zonedDate, {
        date: zonedDate,
        grossSales: 0,
        discounts: 0,
        returns: 0,
        netSales: 0,
        cogs: 0,
        grossProfit: 0,
        transactionsCount: 0,
      });
    }
    const day = dailyMap.get(zonedDate)!;
    const subtotal = s.subtotal || s.total + (s.discountTotal || 0);
    day.grossSales += subtotal;
    day.discounts += s.discountTotal || 0;
    day.transactionsCount += 1;

    let saleCogs = 0;
    for (const item of s.items || []) {
      const qty = item.baseQuantity || item.quantity || 0;
      const unitCost = item.unitCostSnapshot ?? (item as any).costPriceSnapshot ?? 0;
      saleCogs += item.totalCost !== undefined ? item.totalCost : qty * unitCost;
    }
    if (saleCogs === 0 && (s.costTotal || (s as any).totalCost)) {
      saleCogs = Number(s.costTotal || (s as any).totalCost || 0);
    }
    day.cogs += saleCogs;
  }

  for (const ret of currentData.returns) {
    const zonedDate = formatZonedDate(ret.createdAt, timeZone);
    if (dailyMap.has(zonedDate)) {
      const day = dailyMap.get(zonedDate)!;
      day.returns += ret.refundAmount || ret.subtotalReturned || 0;
      day.cogs = Math.max(0, day.cogs - (ret.costReversed || 0));
    }
  }

  const dailyTrends = Array.from(dailyMap.values()).map((d) => {
    d.netSales = Math.max(0, d.grossSales - d.discounts - d.returns);
    d.grossProfit = d.netSales - d.cogs;
    return d;
  }).sort((a, b) => a.date.localeCompare(b.date));

  // Hourly Distribution
  const hourlyCounts = Array.from({ length: 24 }, (_, i) => ({
    hour: i,
    salesCount: 0,
    totalSalesAmount: 0,
    avgTicket: 0,
  }));

  for (const s of currentData.sales) {
    const sDate = parseToDate(s.createdAt) || new Date();
    const parts = getZonedParts(sDate, timeZone);
    const h = parts.hour;
    if (h >= 0 && h < 24) {
      hourlyCounts[h].salesCount += 1;
      hourlyCounts[h].totalSalesAmount += s.total || 0;
    }
  }

  for (const h of hourlyCounts) {
    h.avgTicket = h.salesCount > 0 ? Number((h.totalSalesAmount / h.salesCount).toFixed(2)) : 0;
  }

  // Dimension Performance Helpers
  const catMap = new Map<string, { label: string; units: number; sales: number; cogs: number }>();
  const brandMap = new Map<string, { label: string; units: number; sales: number; cogs: number }>();
  const authorMap = new Map<string, { label: string; units: number; sales: number; cogs: number }>();
  const publisherMap = new Map<string, { label: string; units: number; sales: number; cogs: number }>();
  const subjectMap = new Map<string, { label: string; units: number; sales: number; cogs: number }>();
  const gradeMap = new Map<string, { label: string; units: number; sales: number; cogs: number }>();

  // Payment method accumulation
  const paymentMethodMap = new Map<string, { count: number; amount: number }>();

  // Retail vs Wholesale
  let retailSales = 0;
  let retailCount = 0;
  let wholesaleSales = 0;
  let wholesaleCount = 0;

  // Basket Association pairs
  const pairCounts = new Map<string, { pAId: string; pAName: string; pBId: string; pBName: string; count: number }>();

  for (const sale of currentData.sales) {
    if (sale.priceTierUsed === 'wholesale' || sale.saleType === 'wholesale') {
      wholesaleSales += sale.total || 0;
      wholesaleCount += 1;
    } else {
      retailSales += sale.total || 0;
      retailCount += 1;
    }

    // Payment methods
    for (const p of sale.paymentMethods || []) {
      const pm = p.method || 'cash';
      const prev = paymentMethodMap.get(pm) || { count: 0, amount: 0 };
      prev.count += 1;
      prev.amount += p.amount || 0;
      paymentMethodMap.set(pm, prev);
    }

    // Items and Dimensions
    const uniqueSaleItemProductIds: string[] = [];
    const itemMapById = new Map<string, string>();

    for (const item of sale.items || []) {
      const qty = item.baseQuantity || item.quantity || 0;
      const lineTotal = item.lineTotal || 0;
      const unitCost = item.unitCostSnapshot ?? (item as any).costPriceSnapshot ?? 0;
      const lineCost = item.totalCost !== undefined ? item.totalCost : qty * unitCost;

      const prod = catalog?.get(item.productId);
      const resolvedProdName =
        prod?.name ||
        (prod as any)?.nameAr ||
        (prod as any)?.title ||
        item.productNameSnapshot ||
        item.productName ||
        item.name ||
        'كتاب / صنف مسجل';

      // Category
      const cat = prod?.category || item.categorySnapshot || 'عام';
      const cRec = catMap.get(cat) || { label: cat, units: 0, sales: 0, cogs: 0 };
      cRec.units += qty;
      cRec.sales += lineTotal;
      cRec.cogs += lineCost;
      catMap.set(cat, cRec);

      // Brand / Publisher
      const brand = prod?.brand || (prod as any)?.publisher || item.brandSnapshot || 'عام';
      const bRec = brandMap.get(brand) || { label: brand, units: 0, sales: 0, cogs: 0 };
      bRec.units += qty;
      bRec.sales += lineTotal;
      bRec.cogs += lineCost;
      brandMap.set(brand, bRec);

      // Book-specific metadata from catalog if available
      const author = prod?.metadata?.author || (prod as any)?.author || (prod as any)?.bookAuthor || 'عام / غير محدد';
      const pub = prod?.metadata?.publisher || (prod as any)?.publisher || (prod as any)?.bookPublisher || prod?.brand || 'عام / غير محدد';
      const subject = prod?.metadata?.subject || (prod as any)?.subject || prod?.category || 'عام / غير محدد';
      const grade = prod?.metadata?.gradeLevel || (prod as any)?.gradeLevel || (prod as any)?.educationalStage || 'كافة المراحل / عام';

      const aRec = authorMap.get(author) || { label: author, units: 0, sales: 0, cogs: 0 };
      aRec.units += qty;
      aRec.sales += lineTotal;
      aRec.cogs += lineCost;
      authorMap.set(author, aRec);

      const pRec = publisherMap.get(pub) || { label: pub, units: 0, sales: 0, cogs: 0 };
      pRec.units += qty;
      pRec.sales += lineTotal;
      pRec.cogs += lineCost;
      publisherMap.set(pub, pRec);

      const sRec = subjectMap.get(subject) || { label: subject, units: 0, sales: 0, cogs: 0 };
      sRec.units += qty;
      sRec.sales += lineTotal;
      sRec.cogs += lineCost;
      subjectMap.set(subject, sRec);

      const gRec = gradeMap.get(grade) || { label: grade, units: 0, sales: 0, cogs: 0 };
      gRec.units += qty;
      gRec.sales += lineTotal;
      gRec.cogs += lineCost;
      gradeMap.set(grade, gRec);

      if (!uniqueSaleItemProductIds.includes(item.productId)) {
        uniqueSaleItemProductIds.push(item.productId);
        itemMapById.set(item.productId, resolvedProdName);
      }
    }

    // Association Pairs (Market Basket Analysis)
    if (uniqueSaleItemProductIds.length > 1) {
      for (let i = 0; i < uniqueSaleItemProductIds.length; i++) {
        for (let j = i + 1; j < uniqueSaleItemProductIds.length; j++) {
          const pA = uniqueSaleItemProductIds[i] < uniqueSaleItemProductIds[j] ? uniqueSaleItemProductIds[i] : uniqueSaleItemProductIds[j];
          const pB = uniqueSaleItemProductIds[i] < uniqueSaleItemProductIds[j] ? uniqueSaleItemProductIds[j] : uniqueSaleItemProductIds[i];
          const pairKey = `${pA}___${pB}`;
          const currentPair = pairCounts.get(pairKey) || {
            pAId: pA,
            pAName: itemMapById.get(pA) || 'Item A',
            pBId: pB,
            pBName: itemMapById.get(pB) || 'Item B',
            count: 0,
          };
          currentPair.count += 1;
          pairCounts.set(pairKey, currentPair);
        }
      }
    }
  }

  // Convert map to DimensionPerformance array
  const totalSalesNet = curAgg.netSales || 1;
  const toDimArray = (map: Map<string, { label: string; units: number; sales: number; cogs: number }>): DimensionPerformance[] => {
    return Array.from(map.entries()).map(([key, val]) => {
      const grossProfit = val.sales - val.cogs;
      const grossMarginPct = val.sales > 0 ? Number(((grossProfit / val.sales) * 100).toFixed(2)) : 0;
      const transactionSharePct = Number(((val.sales / totalSalesNet) * 100).toFixed(2));
      return {
        key,
        label: val.label,
        unitsSold: val.units,
        netSales: Number(val.sales.toFixed(2)),
        cogs: Number(val.cogs.toFixed(2)),
        grossProfit: Number(grossProfit.toFixed(2)),
        grossMarginPct,
        transactionSharePct,
      };
    }).sort((a, b) => b.netSales - a.netSales);
  };

  // Payment Methods
  const totalPayAmount = Array.from(paymentMethodMap.values()).reduce((sum, v) => sum + v.amount, 0) || 1;
  const paymentMethods: PaymentMethodShare[] = Array.from(paymentMethodMap.entries()).map(([method, val]) => ({
    method,
    count: val.count,
    amount: Number(val.amount.toFixed(2)),
    sharePct: Number(((val.amount / totalPayAmount) * 100).toFixed(2)),
  })).sort((a, b) => b.amount - a.amount);

  // Market basket association ranking
  const totalTrans = curAgg.transactionsCount || 1;
  const frequentlyBoughtTogether: BasketAssociationPair[] = Array.from(pairCounts.values())
    .map((p) => ({
      productAId: p.pAId,
      productAName: p.pAName,
      productBId: p.pBId,
      productBName: p.pBName,
      coOccurrenceCount: p.count,
      supportPct: Number(((p.count / totalTrans) * 100).toFixed(2)),
    }))
    .sort((a, b) => b.coOccurrenceCount - a.coOccurrenceCount)
    .slice(0, 15);

  return {
    summary,
    dailyTrends,
    hourlyDistribution,
    categories: toDimArray(catMap),
    brands: toDimArray(brandMap),
    bookAuthors: toDimArray(authorMap),
    bookPublishers: toDimArray(publisherMap),
    bookSubjects: toDimArray(subjectMap),
    bookGrades: toDimArray(gradeMap),
    paymentMethods,
    retailVsWholesale: {
      retail: { sales: Number(retailSales.toFixed(2)), count: retailCount },
      wholesale: { sales: Number(wholesaleSales.toFixed(2)), count: wholesaleCount },
    },
    frequentlyBoughtTogether,
  };
}
