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
import { fetchCategoriesFromDb } from '../categories/categories.service';

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
  if (!tenantId) return [];

  const recordsById = new Map<string, BranchStockRecord>();
  const stockRef = collection(db, 'branch_stock');

  for (const tenantField of ['tenantId', 'tenant_id'] as const) {
    try {
      const snap = await getDocs(query(stockRef, where(tenantField, '==', tenantId)));
      snap.forEach((stockDoc) => {
        const data = stockDoc.data();
        const docBranchId = data.branchId || data.branch_id;
        if (branchId && branchId !== 'all' && docBranchId && docBranchId !== branchId) return;
        recordsById.set(stockDoc.id, { id: stockDoc.id, ...data } as BranchStockRecord);
      });
    } catch (err) {
      console.warn(`fetchTenantStockBalances failed for ${tenantField}:`, err);
    }
  }

  return Array.from(recordsById.values());
}

/**
 * Fetch all products (including archived ones for historical consistency - Audit 6)
 */
export async function fetchProductsCatalog(tenantId: string): Promise<Map<string, Product>> {
  const catalog = new Map<string, Product>();
  if (!tenantId) return catalog;

  const prodRef = collection(db, 'products');
  for (const tenantField of ['tenantId', 'tenant_id'] as const) {
    try {
      const snap = await getDocs(query(prodRef, where(tenantField, '==', tenantId)));
      snap.forEach((productDoc) => {
        catalog.set(productDoc.id, {
          id: productDoc.id,
          ...productDoc.data(),
        } as Product);
      });
    } catch (err) {
      console.warn(`fetchProductsCatalog failed for ${tenantField}:`, err);
    }
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

  // 1. Fetch balances, product catalog & categories
  const [stockRecords, catalog, categoriesList] = await Promise.all([
    fetchTenantStockBalances(tenantId, branchId),
    fetchProductsCatalog(tenantId),
    fetchCategoriesFromDb(tenantId).catch(() => []),
  ]);

  const categoryNameMap = new Map<string, string>();
  categoriesList.forEach((c) => {
    if (c.id && c.name) categoryNameMap.set(c.id, c.name);
    if (c.name) categoryNameMap.set(c.name, c.name);
  });

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

  const effectiveStockRecords = [...stockRecords];
  const registeredProductIdsInStock = new Set(effectiveStockRecords.map((r) => r.productId));

  // Synthesize stock records for any catalog product not yet in branch_stock
  catalog.forEach((prod, prodId) => {
    if (!registeredProductIdsInStock.has(prodId) && !prod.isArchived) {
      const stockQty = Number((prod as any).stock ?? (prod as any).quantity ?? (prod as any).onHandQuantity ?? 0);
      effectiveStockRecords.push({
        id: `synth_${prodId}`,
        tenantId,
        branchId: branchId || 'default',
        productId: prodId,
        quantity: stockQty,
        onHandQuantity: stockQty,
        availableQuantity: stockQty,
        reservedQuantity: 0,
        unitCost: Number(prod.costPrice ?? (prod as any).cost ?? 0),
        reorderPoint: Number((prod as any).reorderPoint ?? (prod as any).minStock ?? 5),
        lastMovementAt: prod.updatedAt || prod.createdAt || new Date().toISOString(),
      } as BranchStockRecord);
      registeredProductIdsInStock.add(prodId);
    }
  });

  for (const record of effectiveStockRecords) {
    const prod = catalog.get(record.productId);
    const qty = record.quantity ?? record.onHandQuantity ?? 0;
    const reserved = record.reservedQuantity ?? 0;
    const available = record.availableQuantity ?? Math.max(0, qty - reserved);

    const unitCost = record.unitCost ?? record.averageCost ?? prod?.costPrice ?? (prod as any)?.cost ?? 0;
    const retailPrice = prod?.retailPrice ?? (prod as any)?.sellingPrice ?? (prod as any)?.price ?? unitCost;

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

    const resolvedName =
      prod?.name ||
      (prod as any)?.nameAr ||
      (prod as any)?.title ||
      (record as any)?.productName ||
      (record as any)?.name ||
      'كتاب / صنف مسجل';

    const rawCat = (prod as any)?.categoryName || (prod as any)?.category_name || prod?.category || (prod as any)?.categoryId || (record as any)?.category || 'عام';
    const resolvedCategory = categoryNameMap.get(rawCat) || rawCat;
    const resolvedBrand = prod?.brand || (prod as any)?.publisher || (prod as any)?.author || 'عام';
    const resolvedSku = prod?.sku || (prod as any)?.barcode || record.productId;

    healthItems.push({
      productId: record.productId,
      variantId: record.variantId,
      sku: resolvedSku,
      name: resolvedName,
      category: resolvedCategory,
      brand: resolvedBrand,
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
