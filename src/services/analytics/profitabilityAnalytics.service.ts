/**
 * Retail Profitability & Margin Analytics Engine
 * Calculates gross profit using immutable historical cost snapshots (unitCostSnapshot),
 * detects margin erosion, profit leaks, and branch operating contribution.
 */

import { collection, getDocs, query, where } from 'firebase/firestore';
import { db } from '../../lib/firebase';
import { Sale, SaleReturn, Product } from '../../types/retail.types';
import { DateRange, parseToDate } from './reportingTimezone';
import { fetchSalesPeriodData } from './salesAnalytics.service';
import { getExpenses } from '../expenses';
import { fetchProductsCatalog } from './inventoryAnalytics.service';
import { fetchCategoriesFromDb } from '../categories/categories.service';

export interface ProductProfitabilityRecord {
  productId: string;
  sku: string;
  name: string;
  category: string;
  unitsSold: number;
  netRevenue: number;
  historicalCogs: number;
  grossProfit: number;
  grossMarginPct: number;
  averageUnitSellingPrice: number;
  averageUnitCost: number;
  isNegativeMargin: boolean;
  isLowMargin: boolean; // < 10%
  isArchived: boolean;
}

export interface ProfitLeakMetrics {
  totalDiscountsGiven: number;
  discountToSalesRatioPct: number;
  totalReturnsValue: number;
  returnsToSalesRatioPct: number;
  shrinkageDamageCost: number;
  negativeMarginSalesCount: number;
  negativeMarginLossAmount: number;
  topDiscountCashiers: { cashierId: string; cashierName: string; totalDiscounts: number; salesCount: number }[];
  highReturnProducts: { productId: string; name: string; returnedQty: number; returnedAmount: number; returnRatePct: number }[];
}

export interface BranchContributionMargin {
  branchId: string;
  branchName: string;
  netSales: number;
  cogs: number;
  grossProfit: number;
  grossMarginPct: number;
  operatingExpenses: number;
  contributionMargin: number; // Gross Profit - Direct Expenses
  contributionMarginPct: number;
}

export interface ProfitabilityAnalyticsReport {
  overallNetSales: number;
  overallCogs: number;
  overallGrossProfit: number;
  overallGrossMarginPct: number;
  topProfitableProducts: ProductProfitabilityRecord[];
  bottomMarginProducts: ProductProfitabilityRecord[];
  allProductProfitability: ProductProfitabilityRecord[];
  marginErosionAlerts: ProductProfitabilityRecord[];
  profitLeaks: ProfitLeakMetrics;
  branchContributions: BranchContributionMargin[];
}

/**
 * Generate full profitability intelligence report
 */
export async function generateProfitabilityReport(
  tenantId: string,
  dateRange: DateRange,
  branchId?: string,
  catalogMap?: Map<string, Product>,
  lowMarginThresholdPct: number = 10
): Promise<ProfitabilityAnalyticsReport> {
  const salesData = await fetchSalesPeriodData(tenantId, dateRange, branchId);

  // Load product catalog if not provided
  let catalog = catalogMap;
  if (!catalog) {
    catalog = await fetchProductsCatalog(tenantId);
  }

  // Load categories map to resolve raw category IDs to registered human-readable names
  const categoryNameMap = new Map<string, string>();
  try {
    const cats = await fetchCategoriesFromDb(tenantId);
    cats.forEach((c) => {
      if (c.id && c.name) categoryNameMap.set(c.id, c.name);
      if (c.name) categoryNameMap.set(c.name, c.name);
    });

    if (categoryNameMap.size === 0) {
      const catSnap = await getDocs(collection(db, 'categories'));
      catSnap.forEach((doc) => {
        const d = doc.data();
        const catName = d.name || d.nameAr || d.title || d.nameEn;
        if (catName) {
          categoryNameMap.set(doc.id, catName);
          categoryNameMap.set(catName, catName);
        }
      });
    }
  } catch (err) {
    console.warn('Failed to load categories map in profitabilityAnalytics:', err);
  }

  // Load branch names map
  const branchNameMap = new Map<string, string>();
  try {
    let bSnap = await getDocs(query(collection(db, 'branches'), where('tenantId', '==', tenantId)));
    if (bSnap.empty) {
      bSnap = await getDocs(query(collection(db, 'branches'), where('tenant_id', '==', tenantId)));
    }
    if (bSnap.empty) {
      bSnap = await getDocs(query(collection(db, 'branches')));
    }
    bSnap.forEach((doc) => {
      const d = doc.data();
      branchNameMap.set(doc.id, d.name || d.branchName || doc.id);
    });
  } catch (err) {
    console.warn('Failed to load branches map in profitabilityAnalytics:', err);
  }

  // Map to hold product level sales and snapshot COGS
  const productMap = new Map<
    string,
    {
      sku: string;
      name: string;
      category: string;
      unitsSold: number;
      grossRevenue: number;
      discounts: number;
      cost: number;
      isArchived: boolean;
    }
  >();

  const cashierDiscountMap = new Map<string, { name: string; discounts: number; count: number }>();
  let totalDiscountsGiven = 0;
  let totalGrossSales = 0;
  let negativeMarginLoss = 0;
  let negativeMarginSalesCount = 0;

  // Branch level tracking
  const branchMap = new Map<string, { netSales: number; cogs: number; grossProfit: number }>();

  for (const sale of salesData.sales) {
    const bId = sale.branchId || 'default';
    if (!branchMap.has(bId)) {
      branchMap.set(bId, { netSales: 0, cogs: 0, grossProfit: 0 });
    }
    const bRec = branchMap.get(bId)!;

    const subtotal = sale.subtotal || sale.total + (sale.discountTotal || 0);
    totalGrossSales += subtotal;
    const sDiscount = sale.discountTotal || 0;
    totalDiscountsGiven += sDiscount;

    // Cashier tracking
    const cId = sale.cashierId || (sale as any).cashier_id || (sale as any).created_by || 'unassigned';
    const cName = sale.cashierNameSnapshot || (sale as any).cashier_name || (sale as any).cashierName || 'كاشير مسجل';
    const cRec = cashierDiscountMap.get(cId) || { name: cName, discounts: 0, count: 0 };
    cRec.discounts += sDiscount;
    cRec.count += 1;
    cashierDiscountMap.set(cId, cRec);

    let saleCostTotal = 0;
    let saleNetRevenueTotal = 0;

    for (const item of sale.items || []) {
      const pid = item.productId;
      const qty = item.baseQuantity || item.quantity || 0;
      const lineTotal = item.lineTotal || 0;
      // Invariant: MUST use unitCostSnapshot, NEVER current fluctuating WAC
      const unitCost = item.unitCostSnapshot ?? (item as any).costPriceSnapshot ?? 0;
      const lineCost = item.totalCost !== undefined ? item.totalCost : qty * unitCost;

      saleCostTotal += lineCost;
      saleNetRevenueTotal += lineTotal;

      const prod = catalog.get(pid);
      const registeredName =
        prod?.name ||
        (prod as any)?.nameAr ||
        (prod as any)?.title ||
        item.productNameSnapshot ||
        item.productName ||
        item.name ||
        'كتاب / صنف مسجل';

      // Resolve category ID to registered name, never leave as alphanumeric ID
      const rawCategory =
        (prod as any)?.categoryName ||
        (prod as any)?.category_name ||
        prod?.category ||
        (prod as any)?.categoryId ||
        (prod as any)?.category_id ||
        item.categorySnapshot ||
        'عام';

      let resolvedCategory = categoryNameMap.get(rawCategory) || rawCategory;
      if (categoryNameMap.has(resolvedCategory)) {
        resolvedCategory = categoryNameMap.get(resolvedCategory)!;
      }
      if (!resolvedCategory || resolvedCategory.trim() === '' || resolvedCategory === 'undefined') {
        resolvedCategory = 'عام';
      }

      const cur = productMap.get(pid) || {
        sku: prod?.sku || (prod as any)?.barcode || item.skuSnapshot || pid,
        name: registeredName,
        category: resolvedCategory,
        unitsSold: 0,
        grossRevenue: 0,
        discounts: 0,
        cost: 0,
        isArchived: prod?.isArchived ?? false,
      };

      cur.unitsSold += qty;
      cur.grossRevenue += lineTotal + (item.discountAmount || 0);
      cur.discounts += item.discountAmount || 0;
      cur.cost += lineCost;
      productMap.set(pid, cur);

      // Check item-level margin erosion
      if (lineTotal < lineCost) {
        negativeMarginLoss += (lineCost - lineTotal);
        negativeMarginSalesCount++;
      }
    }

    bRec.netSales += saleNetRevenueTotal;
    bRec.cogs += saleCostTotal;
    bRec.grossProfit += (saleNetRevenueTotal - saleCostTotal);
  }

  // Returns tracking and deduction
  let totalReturnsValue = 0;
  const returnedProductMap = new Map<string, { qty: number; amount: number; name: string }>();

  for (const ret of salesData.returns) {
    const rAmt = ret.refundAmount || ret.subtotalReturned || 0;
    totalReturnsValue += rAmt;

    const bId = ret.branchId || 'default';
    if (branchMap.has(bId)) {
      const bRec = branchMap.get(bId)!;
      bRec.netSales = Math.max(0, bRec.netSales - rAmt);
      bRec.cogs = Math.max(0, bRec.cogs - (ret.costReversed || 0));
      bRec.grossProfit = bRec.netSales - bRec.cogs;
    }

    for (const item of ret.items || []) {
      const pid = item.productId;
      const qty = item.quantityReturned || (item as any).quantity || 0;
      const amt = item.refundAmount || (item as any).lineTotal || 0;
      const rCost = item.costReversed || (qty * (item.unitCostSnapshot ?? 0));

      const prod = catalog.get(pid);
      const retProdName =
        prod?.name ||
        (prod as any)?.nameAr ||
        (prod as any)?.title ||
        item.productNameSnapshot ||
        item.productName ||
        item.name ||
        'كتاب / صنف مسجل';

      const rRec = returnedProductMap.get(pid) || { qty: 0, amount: 0, name: retProdName };
      rRec.qty += qty;
      rRec.amount += amt;
      returnedProductMap.set(pid, rRec);

      // Adjust in productMap
      if (productMap.has(pid)) {
        const pRec = productMap.get(pid)!;
        pRec.unitsSold = Math.max(0, pRec.unitsSold - qty);
        pRec.grossRevenue = Math.max(0, pRec.grossRevenue - amt);
        pRec.cost = Math.max(0, pRec.cost - rCost);
      }
    }
  }

  // Fetch Damage / Loss shrinkage movements in this period
  let shrinkageDamageCost = 0;
  try {
    const moveRef = collection(db, 'stock_movements');
    let moveDocs: any[] = [];
    try {
      let mQ = query(
        moveRef,
        where('tenantId', '==', tenantId),
        where('createdAt', '>=', dateRange.startIso),
        where('createdAt', '<=', dateRange.endIso)
      );
      if (branchId && branchId !== 'all') {
        mQ = query(mQ, where('branchId', '==', branchId));
      }
      const moveSnap = await getDocs(mQ);
      moveDocs = moveSnap.docs;
    } catch {
      const fbSnap = await getDocs(query(moveRef, where('tenantId', '==', tenantId)));
      const startMs = parseToDate(dateRange.startIso)?.getTime() || 0;
      const endMs = parseToDate(dateRange.endIso)?.getTime() || Infinity;
      moveDocs = fbSnap.docs.filter((d) => {
        const m = d.data();
        if (branchId && branchId !== 'all' && m.branchId && m.branchId !== branchId) return false;
        const dVal = parseToDate(m.createdAt);
        if (!dVal) return true;
        const ms = dVal.getTime();
        return ms >= startMs && ms <= endMs;
      });
    }
    moveDocs.forEach((doc) => {
      const m = doc.data();
      if (m.movementType === 'damage' || m.movementType === 'loss') {
        const cost = (m.quantity || 0) * (m.unitCost || 0);
        shrinkageDamageCost += cost;
      }
    });
  } catch (err) {
    console.warn('Failed to fetch shrinkage movements, continuing:', err);
  }

  // Build product profitability list
  const allProductProfitability: ProductProfitabilityRecord[] = [];
  let overallNetSales = 0;
  let overallCogs = 0;

  for (const [pid, p] of productMap.entries()) {
    const netRev = Math.max(0, p.grossRevenue - p.discounts);
    const profit = netRev - p.cost;
    const marginPct = netRev > 0 ? Number(((profit / netRev) * 100).toFixed(2)) : 0;
    const isNegative = profit < 0;
    const isLow = !isNegative && marginPct < lowMarginThresholdPct;

    overallNetSales += netRev;
    overallCogs += p.cost;

    allProductProfitability.push({
      productId: pid,
      sku: p.sku,
      name: p.name,
      category: p.category,
      unitsSold: p.unitsSold,
      netRevenue: Number(netRev.toFixed(2)),
      historicalCogs: Number(p.cost.toFixed(2)),
      grossProfit: Number(profit.toFixed(2)),
      grossMarginPct: marginPct,
      averageUnitSellingPrice: p.unitsSold > 0 ? Number((netRev / p.unitsSold).toFixed(2)) : 0,
      averageUnitCost: p.unitsSold > 0 ? Number((p.cost / p.unitsSold).toFixed(2)) : 0,
      isNegativeMargin: isNegative,
      isLowMargin: isLow,
      isArchived: p.isArchived,
    });
  }

  const overallGrossProfit = overallNetSales - overallCogs;
  const overallGrossMarginPct = overallNetSales > 0 ? Number(((overallGrossProfit / overallNetSales) * 100).toFixed(2)) : 0;

  // Sorting
  const topProfitableProducts = [...allProductProfitability]
    .sort((a, b) => b.grossProfit - a.grossProfit)
    .slice(0, 20);

  const bottomMarginProducts = [...allProductProfitability]
    .sort((a, b) => a.grossMarginPct - b.grossMarginPct)
    .slice(0, 20);

  const marginErosionAlerts = allProductProfitability
    .filter((p) => p.isNegativeMargin || p.isLowMargin)
    .sort((a, b) => a.grossMarginPct - b.grossMarginPct);

  // Profit leak details
  const topDiscountCashiers = Array.from(cashierDiscountMap.entries())
    .map(([cid, val]) => ({
      cashierId: cid,
      cashierName: val.name,
      totalDiscounts: Number(val.discounts.toFixed(2)),
      salesCount: val.count,
    }))
    .sort((a, b) => b.totalDiscounts - a.totalDiscounts)
    .slice(0, 10);

  const highReturnProducts = Array.from(returnedProductMap.entries())
    .map(([pid, r]) => {
      const pData = productMap.get(pid);
      const totalRev = (pData?.grossRevenue || 0) + r.amount;
      const ratePct = totalRev > 0 ? Number(((r.amount / totalRev) * 100).toFixed(2)) : 100;
      return {
        productId: pid,
        name: r.name,
        returnedQty: r.qty,
        returnedAmount: Number(r.amount.toFixed(2)),
        returnRatePct: ratePct,
      };
    })
    .sort((a, b) => b.returnedAmount - a.returnedAmount)
    .slice(0, 10);

  const profitLeaks: ProfitLeakMetrics = {
    totalDiscountsGiven: Number(totalDiscountsGiven.toFixed(2)),
    discountToSalesRatioPct: totalGrossSales > 0 ? Number(((totalDiscountsGiven / totalGrossSales) * 100).toFixed(2)) : 0,
    totalReturnsValue: Number(totalReturnsValue.toFixed(2)),
    returnsToSalesRatioPct: totalGrossSales > 0 ? Number(((totalReturnsValue / totalGrossSales) * 100).toFixed(2)) : 0,
    shrinkageDamageCost: Number(shrinkageDamageCost.toFixed(2)),
    negativeMarginSalesCount,
    negativeMarginLossAmount: Number(negativeMarginLoss.toFixed(2)),
    topDiscountCashiers,
    highReturnProducts,
  };

  // Branch operating expenses & contribution margin
  let expensesList: any[] = [];
  try {
    expensesList = await getExpenses(tenantId, branchId, dateRange.startDate, dateRange.endDate);
  } catch (err) {
    console.warn('Failed to load expenses for branch contribution, continuing:', err);
  }

  const branchExpensesMap = new Map<string, number>();
  for (const exp of expensesList) {
    const bid = exp.branchId || 'default';
    branchExpensesMap.set(bid, (branchExpensesMap.get(bid) || 0) + (exp.amount || 0));
  }

  const branchContributions: BranchContributionMargin[] = Array.from(branchMap.entries()).map(([bid, b]) => {
    const exp = branchExpensesMap.get(bid) || 0;
    const contrib = b.grossProfit - exp;
    const contribPct = b.netSales > 0 ? Number(((contrib / b.netSales) * 100).toFixed(2)) : 0;
    return {
      branchId: bid,
      branchName: branchNameMap.get(bid) || (bid === 'default' ? 'الفرع الرئيسي' : `فرع (${bid})`),
      netSales: Number(b.netSales.toFixed(2)),
      cogs: Number(b.cogs.toFixed(2)),
      grossProfit: Number(b.grossProfit.toFixed(2)),
      grossMarginPct: b.netSales > 0 ? Number(((b.grossProfit / b.netSales) * 100).toFixed(2)) : 0,
      operatingExpenses: Number(exp.toFixed(2)),
      contributionMargin: Number(contrib.toFixed(2)),
      contributionMarginPct: contribPct,
    };
  }).sort((a, b) => b.contributionMargin - a.contributionMargin);

  return {
    overallNetSales: Number(overallNetSales.toFixed(2)),
    overallCogs: Number(overallCogs.toFixed(2)),
    overallGrossProfit: Number(overallGrossProfit.toFixed(2)),
    overallGrossMarginPct,
    topProfitableProducts,
    bottomMarginProducts,
    allProductProfitability,
    marginErosionAlerts,
    profitLeaks,
    branchContributions,
  };
}
