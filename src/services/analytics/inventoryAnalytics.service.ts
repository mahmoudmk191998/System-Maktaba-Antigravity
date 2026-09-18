/**
 * Inventory Analytics, Health, Valuation & Aging Intelligence
 * Computes cost vs retail inventory valuation, turnover ratio, DIO,
 * stock cover, sell-through rates, and detects dead/slow-moving capital.
 */

import { collection, getDocs, query, where } from 'firebase/firestore';
import { db } from '../../lib/firebase';
import { BranchStockRecord, Product, Sale } from '../../types/retail.types';
import { DateRange } from './reportingTimezone';
import { fetchSalesPeriodData } from './salesAnalytics.service';

export interface InventoryValuationSummary {
  totalSkusCount: number;
  totalUnitsOnHand: number;
  totalCostValuation: number;
  totalRetailValuation: number;
  unrealizedGrossProfit: number;
  potentialGrossMarginPct: number;
  deadStockCapital: number;
  slowMovingCapital: number;
  lowStockItemsCount: number;
  outOfStockItemsCount: number;
}

export interface ProductInventoryHealthItem {
  productId: string;
  variantId?: string | null;
  sku: string;
  name: string;
  category: string;
  brand: string;
  currentStock: number;
  availableStock: number;
  reservedStock: number;
  unitCost: number;
  retailPrice: number;
  totalCostValue: number;
  totalRetailValue: number;
  unitsSoldInPeriod: number;
  avgDailySales: number;
  stockCoverDays: number; // days until out of stock
  turnoverRatio: number;
  dioDays: number;
  status: 'normal' | 'low_stock' | 'out_of_stock' | 'slow_moving' | 'dead_stock' | 'excess';
  daysSinceLastSale?: number;
  isArchived: boolean;
}

export interface CategoryInventoryBreakdown {
  category: string;
  skuCount: number;
  unitsOnHand: number;
  costValuation: number;
  retailValuation: number;
  shareOfCapitalPct: number;
}

export interface InventoryAnalyticsReport {
  summary: InventoryValuationSummary;
  categoryBreakdown: CategoryInventoryBreakdown[];
  deadStockItems: ProductInventoryHealthItem[];
  slowMovingItems: ProductInventoryHealthItem[];
  lowStockItems: ProductInventoryHealthItem[];
  allHealthItems: ProductInventoryHealthItem[];
  periodTurnoverRatio: number;
  periodDio: number;
}

/**
 * Fetch all stock records for tenant and optional branch
 */
export async function fetchTenantStockBalances(
  tenantId: string,
  branchId?: string
): Promise<BranchStockRecord[]> {
  const records: BranchStockRecord[] = [];
  try {
    const stockRef = collection(db, 'branch_stock');
    let q = query(stockRef, where('tenantId', '==', tenantId));
    if (branchId && branchId !== 'all') {
      q = query(q, where('branchId', '==', branchId));
    }
    const snap = await getDocs(q);
    snap.forEach((doc) => {
      records.push({ id: doc.id, ...doc.data() } as BranchStockRecord);
    });
  } catch (err) {
    console.warn('fetchTenantStockBalances query failed, trying safe fallback:', err);
    try {
      const snap = await getDocs(query(collection(db, 'branch_stock'), where('tenantId', '==', tenantId)));
      snap.forEach((doc) => {
        const d = doc.data();
        if (branchId && branchId !== 'all' && (d.branchId || d.branch_id) && (d.branchId || d.branch_id) !== branchId) return;
        records.push({ id: doc.id, ...d } as BranchStockRecord);
      });
    } catch (fbErr) {
      console.warn('fetchTenantStockBalances fallback failed:', fbErr);
    }
  }
  return records;
}

/**
 * Fetch all products (including archived ones for historical consistency - Audit 6)
 */
export async function fetchProductsCatalog(tenantId: string): Promise<Map<string, Product>> {
  const catalog = new Map<string, Product>();
  try {
    const prodRef = collection(db, 'products');
    const q = query(prodRef, where('tenantId', '==', tenantId));
    const snap = await getDocs(q);
    snap.forEach((doc) => {
      catalog.set(doc.id, { id: doc.id, ...doc.data() } as Product);
    });
  } catch (err) {
    console.warn('fetchProductsCatalog failed, trying fallback:', err);
    try {
      const snap = await getDocs(query(collection(db, 'products'), where('tenant_id', '==', tenantId)));
      snap.forEach((doc) => {
        catalog.set(doc.id, { id: doc.id, ...doc.data() } as Product);
      });
    } catch {}
  }
  return catalog;
}

/**
 * Generate full inventory analytics and aging intelligence
 */
export async function generateInventoryAnalytics(
  tenantId: string,
  analysisRange: DateRange,
  branchId?: string,
  options?: {
    deadStockDaysThreshold?: number; // default 90
    slowMovingCoverDaysThreshold?: number; // default 120
  }
): Promise<InventoryAnalyticsReport> {
  const deadStockThresholdDays = options?.deadStockDaysThreshold ?? 90;
  const slowMovingThresholdDays = options?.slowMovingCoverDaysThreshold ?? 120;

  // 1. Fetch balances & product catalog
  const [stockRecords, catalog] = await Promise.all([
    fetchTenantStockBalances(tenantId, branchId),
    fetchProductsCatalog(tenantId),
  ]);

  // 2. Fetch sales for the period to evaluate velocity & sales history
  const { sales: periodSales } = await fetchSalesPeriodData(tenantId, analysisRange, branchId);

  const productUnitsSoldMap = new Map<string, number>();
  const productLastSaleDateMap = new Map<string, string>();
  let totalPeriodCogs = 0;

  periodSales.forEach((sale) => {
    if (sale.status === 'cancelled' || (sale as any).status === 'voided') return;

    for (const item of sale.items || []) {
      const pid = item.productId;
      const qty = item.baseQuantity || item.quantity || 0;
      productUnitsSoldMap.set(pid, (productUnitsSoldMap.get(pid) || 0) + qty);

      const unitCost = item.unitCostSnapshot ?? (item as any).costPriceSnapshot ?? 0;
      totalPeriodCogs += item.totalCost !== undefined ? item.totalCost : qty * unitCost;

      const curLast = productLastSaleDateMap.get(pid);
      if (!curLast || (sale.createdAt && sale.createdAt > curLast)) {
        productLastSaleDateMap.set(pid, sale.createdAt);
      }
    }
  });

  // Calculate duration of analysis period in days
  const startMs = new Date(analysisRange.startIso).getTime();
  const endMs = new Date(analysisRange.endIso).getTime();
  const periodDays = Math.max(1, Math.round((endMs - startMs) / (1000 * 60 * 60 * 24)));

  // 3. Process stock health item by item
  const healthItems: ProductInventoryHealthItem[] = [];
  let totalUnitsOnHand = 0;
  let totalCostValuation = 0;
  let totalRetailValuation = 0;
  let deadStockCapital = 0;
  let slowMovingCapital = 0;
  let lowStockCount = 0;
  let outOfStockCount = 0;

  const nowMs = new Date().getTime();

  for (const record of stockRecords) {
    const prod = catalog.get(record.productId);
    const qty = record.quantity ?? record.onHandQuantity ?? 0;
    const reserved = record.reservedQuantity ?? 0;
    const available = record.availableQuantity ?? Math.max(0, qty - reserved);

    const unitCost = record.unitCost ?? record.averageCost ?? prod?.costPrice ?? 0;
    const retailPrice = prod?.retailPrice ?? (prod as any)?.sellingPrice ?? unitCost;

    const totalCostValue = Number((qty * unitCost).toFixed(2));
    const totalRetailValue = Number((qty * retailPrice).toFixed(2));

    totalUnitsOnHand += qty;
    totalCostValuation += totalCostValue;
    totalRetailValuation += totalRetailValue;

    const unitsSold = productUnitsSoldMap.get(record.productId) || 0;
    const avgDailySales = Number((unitsSold / periodDays).toFixed(4));
    
    // Stock cover days
    let stockCoverDays = 999;
    if (avgDailySales > 0) {
      stockCoverDays = Math.round(available / avgDailySales);
    } else if (available === 0) {
      stockCoverDays = 0;
    }

    // Turnover and DIO
    const itemPeriodCogs = unitsSold * unitCost;
    const turnoverRatio = totalCostValue > 0 ? Number((itemPeriodCogs / totalCostValue).toFixed(2)) : 0;
    const dioDays = turnoverRatio > 0 ? Math.round((periodDays / turnoverRatio)) : (unitsSold === 0 && qty > 0 ? 999 : 0);

    // Last sale age
    let daysSinceLastSale = 999;
    const lastSaleDate = productLastSaleDateMap.get(record.productId);
    if (lastSaleDate) {
      daysSinceLastSale = Math.max(0, Math.round((nowMs - new Date(lastSaleDate).getTime()) / (1000 * 60 * 60 * 24)));
    }

    // Determine Status
    const reorderPoint = record.reorderPoint ?? (record as any).minimumStock ?? 5;
    let status: ProductInventoryHealthItem['status'] = 'normal';

    if (qty <= 0) {
      status = 'out_of_stock';
      outOfStockCount++;
    } else if (available <= reorderPoint) {
      status = 'low_stock';
      lowStockCount++;
    } else if (unitsSold === 0 && daysSinceLastSale >= deadStockThresholdDays) {
      status = 'dead_stock';
      deadStockCapital += totalCostValue;
    } else if (stockCoverDays >= slowMovingThresholdDays) {
      status = 'slow_moving';
      slowMovingCapital += totalCostValue;
    }

    healthItems.push({
      productId: record.productId,
      variantId: record.variantId,
      sku: (prod as any)?.sku || record.productId,
      name: prod?.name || (record as any)?.productName || 'Unknown Product',
      category: prod?.category || 'General',
      brand: prod?.brand || 'Generic',
      currentStock: qty,
      availableStock: available,
      reservedStock: reserved,
      unitCost,
      retailPrice,
      totalCostValue,
      totalRetailValue,
      unitsSoldInPeriod: unitsSold,
      avgDailySales,
      stockCoverDays,
      turnoverRatio,
      dioDays,
      status,
      daysSinceLastSale,
      isArchived: prod?.isArchived ?? false,
    });
  }

  // 4. Overall Portfolio Turnover & DIO
  const avgInventoryValue = totalCostValuation > 0 ? totalCostValuation : 1;
  const periodTurnoverRatio = Number((totalPeriodCogs / avgInventoryValue).toFixed(2));
  const periodDio = periodTurnoverRatio > 0 ? Math.round(periodDays / periodTurnoverRatio) : 0;

  // 5. Category Breakdown
  const catMap = new Map<string, { skuCount: number; unitsOnHand: number; costVal: number; retailVal: number }>();
  for (const item of healthItems) {
    const cRec = catMap.get(item.category) || { skuCount: 0, unitsOnHand: 0, costVal: 0, retailVal: 0 };
    cRec.skuCount += 1;
    cRec.unitsOnHand += item.currentStock;
    cRec.costVal += item.totalCostValue;
    cRec.retailVal += item.totalRetailValue;
    catMap.set(item.category, cRec);
  }

  const categoryBreakdown: CategoryInventoryBreakdown[] = Array.from(catMap.entries()).map(([cat, val]) => ({
    category: cat,
    skuCount: val.skuCount,
    unitsOnHand: val.unitsOnHand,
    costValuation: Number(val.costVal.toFixed(2)),
    retailValuation: Number(val.retailVal.toFixed(2)),
    shareOfCapitalPct: totalCostValuation > 0 ? Number(((val.costVal / totalCostValuation) * 100).toFixed(2)) : 0,
  })).sort((a, b) => b.costValuation - a.costValuation);

  // Filtered lists
  const deadStockItems = healthItems.filter((i) => i.status === 'dead_stock').sort((a, b) => b.totalCostValue - a.totalCostValue);
  const slowMovingItems = healthItems.filter((i) => i.status === 'slow_moving').sort((a, b) => b.totalCostValue - a.totalCostValue);
  const lowStockItems = healthItems.filter((i) => i.status === 'low_stock' || i.status === 'out_of_stock').sort((a, b) => a.availableStock - b.availableStock);

  const unrealizedGrossProfit = totalRetailValuation - totalCostValuation;
  const potentialGrossMarginPct = totalRetailValuation > 0 ? Number(((unrealizedGrossProfit / totalRetailValuation) * 100).toFixed(2)) : 0;

  const summary: InventoryValuationSummary = {
    totalSkusCount: healthItems.length,
    totalUnitsOnHand,
    totalCostValuation: Number(totalCostValuation.toFixed(2)),
    totalRetailValuation: Number(totalRetailValuation.toFixed(2)),
    unrealizedGrossProfit: Number(unrealizedGrossProfit.toFixed(2)),
    potentialGrossMarginPct,
    deadStockCapital: Number(deadStockCapital.toFixed(2)),
    slowMovingCapital: Number(slowMovingCapital.toFixed(2)),
    lowStockItemsCount: lowStockCount,
    outOfStockItemsCount: outOfStockCount,
  };

  return {
    summary,
    categoryBreakdown,
    deadStockItems,
    slowMovingItems,
    lowStockItems,
    allHealthItems: healthItems,
    periodTurnoverRatio,
    periodDio,
  };
}
