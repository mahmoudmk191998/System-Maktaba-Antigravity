/**
 * Demand Intelligence & Explainable Reorder Recommendation Engine
 * Computes multi-window velocity (7d, 30d, 90d), trend shifts,
 * and transparent, human-readable reorder formulas.
 */

import { collection, getDocs, query, where } from 'firebase/firestore';
import { db } from '../../lib/firebase';
import { Product, PurchaseOrder, Sale } from '../../types/retail.types';
import { fetchTenantStockBalances } from './inventoryAnalytics.service';
import { fetchSalesPeriodData } from './salesAnalytics.service';
import { parseToDate } from './reportingTimezone';

export type DemandTrend = 'increasing' | 'stable' | 'declining' | 'no_sales';
export type ReorderUrgency = 'critical' | 'high' | 'medium' | 'low';

export interface ProductDemandProfile {
  productId: string;
  variantId?: string | null;
  sku: string;
  name: string;
  category: string;
  brand: string;
  preferredSupplierId?: string;
  preferredSupplierName?: string;
  sales7d: number;
  sales30d: number;
  sales90d: number;
  dailyVelocity7d: number;
  dailyVelocity30d: number;
  dailyVelocity90d: number;
  effectiveDailyDemand: number;
  trend: DemandTrend;
  currentStock: number;
  availableStock: number;
  incomingPoStock: number; // pending approved PO items
  leadTimeDays: number;
  safetyStockDays: number;
  safetyStockUnits: number;
  targetStockLevel: number;
  packSize: number;
  unitCost: number;
  reorderQuantity: number;
  reorderPacks: number;
  estimatedTotalCost: number;
  urgency: ReorderUrgency;
  explanationAr: string;
  explanationEn: string;
}

export interface SupplierReorderGroup {
  supplierId: string;
  supplierName: string;
  itemsCount: number;
  totalUnitsToOrder: number;
  estimatedTotalCost: number;
  criticalItemsCount: number;
  highUrgencyItemsCount: number;
  items: ProductDemandProfile[];
}

export interface DemandIntelligenceReport {
  recommendations: ProductDemandProfile[];
  bySupplier: SupplierReorderGroup[];
  totalRecommendedCost: number;
  totalItemsNeedingReorder: number;
  criticalItemsCount: number;
  highUrgencyCount: number;
}

/**
 * Fetch rolling sales data for past 90 days to compute velocity windows
 */
async function fetchRollingSalesData(
  tenantId: string,
  branchId?: string,
  referenceDate: Date = new Date()
): Promise<{ sales7d: Map<string, number>; sales30d: Map<string, number>; sales90d: Map<string, number> }> {
  const nowMs = referenceDate.getTime();
  const ms7d = nowMs - 7 * 24 * 60 * 60 * 1000;
  const ms30d = nowMs - 30 * 24 * 60 * 60 * 1000;
  const ms90d = nowMs - 90 * 24 * 60 * 60 * 1000;
  const iso90d = new Date(ms90d).toISOString();
  const endIso = new Date(nowMs + 86400000).toISOString();

  const sales7d = new Map<string, number>();
  const sales30d = new Map<string, number>();
  const sales90d = new Map<string, number>();

  try {
    const { sales } = await fetchSalesPeriodData(
      tenantId,
      { startIso: iso90d, endIso, timeZone: 'UTC' },
      branchId && branchId !== 'all' ? branchId : undefined
    );

    sales.forEach((sale) => {
      if (sale.status === 'cancelled' || (sale as any).status === 'voided') return;

      const saleDate = parseToDate(sale.createdAt);
      const saleTime = saleDate ? saleDate.getTime() : 0;
      for (const item of sale.items || []) {
        const pid = item.productId;
        const qty = item.baseQuantity || item.quantity || 0;

        // 90d window
        sales90d.set(pid, (sales90d.get(pid) || 0) + qty);

        // 30d window
        if (saleTime >= ms30d) {
          sales30d.set(pid, (sales30d.get(pid) || 0) + qty);
        }

        // 7d window
        if (saleTime >= ms7d) {
          sales7d.set(pid, (sales7d.get(pid) || 0) + qty);
        }
      }
    });
  } catch (err) {
    console.warn('demandAndReorder sales query failed:', err);
  }

  return { sales7d, sales30d, sales90d };
}

/**
 * Fetch quantity pending on incoming approved or ordered purchase orders
 */
async function fetchIncomingApprovedPOQuantities(
  tenantId: string,
  branchId?: string
): Promise<Map<string, number>> {
  const poRef = collection(db, 'purchase_orders');
  const snap = await getDocs(query(poRef, where('tenantId', '==', tenantId)));
  const incomingMap = new Map<string, number>();

  snap.forEach((doc) => {
    const po = doc.data() as PurchaseOrder;
    // Only count active incoming orders
    if (
      po.status === 'approved' ||
      po.status === 'ordered' ||
      (po.status as any) === 'partially_received' ||
      (po.status as any) === 'submitted'
    ) {
      if (branchId && branchId !== 'all' && po.destinationLocationId && po.destinationLocationId !== branchId) {
        return;
      }
      for (const item of po.items || []) {
        const remaining = Math.max(0, (item.quantity || 0) - ((item as any).receivedQuantity || 0));
        if (remaining > 0) {
          incomingMap.set(item.productId, (incomingMap.get(item.productId) || 0) + remaining);
        }
      }
    }
  });

  return incomingMap;
}

/**
 * Generate full demand intelligence and explainable reorder recommendations
 */
export async function generateDemandAndReorderReport(
  tenantId: string,
  branchId?: string,
  defaultLeadTimeDays: number = 7,
  defaultSafetyStockDays: number = 5,
  catalogMap?: Map<string, Product>
): Promise<DemandIntelligenceReport> {
  const [stockRecords, rollingSales, incomingMap] = await Promise.all([
    fetchTenantStockBalances(tenantId, branchId),
    fetchRollingSalesData(tenantId, branchId),
    fetchIncomingApprovedPOQuantities(tenantId, branchId),
  ]);

  // Load products catalog if not provided
  let catalog = catalogMap;
  if (!catalog) {
    const prodRef = collection(db, 'products');
    const prodSnap = await getDocs(query(prodRef, where('tenantId', '==', tenantId)));
    catalog = new Map<string, Product>();
    prodSnap.forEach((doc) => {
      catalog!.set(doc.id, { id: doc.id, ...doc.data() } as Product);
    });
  }

  const recommendations: ProductDemandProfile[] = [];

  for (const record of stockRecords) {
    const prod = catalog.get(record.productId);
    if (prod?.isArchived) continue; // Skip archived products from reordering recommendations

    const currentStock = record.quantity ?? record.onHandQuantity ?? 0;
    const reservedStock = record.reservedQuantity ?? 0;
    const availableStock = record.availableQuantity ?? Math.max(0, currentStock - reservedStock);
    const incomingPoStock = incomingMap.get(record.productId) || 0;

    const s7 = rollingSales.sales7d.get(record.productId) || 0;
    const s30 = rollingSales.sales30d.get(record.productId) || 0;
    const s90 = rollingSales.sales90d.get(record.productId) || 0;

    const v7 = Number((s7 / 7).toFixed(3));
    const v30 = Number((s30 / 30).toFixed(3));
    const v90 = Number((s90 / 90).toFixed(3));

    // Trend detection
    let trend: DemandTrend = 'stable';
    if (v30 === 0 && v7 === 0) {
      trend = 'no_sales';
    } else if (v30 > 0) {
      const ratio = v7 / v30;
      if (ratio >= 1.2) trend = 'increasing';
      else if (ratio <= 0.8) trend = 'declining';
    }

    // Effective daily demand: weighted blend prioritizing recent 7d if trending up, else 30d
    let effectiveDailyDemand = v30;
    if (trend === 'increasing') {
      effectiveDailyDemand = Number((v7 * 0.6 + v30 * 0.4).toFixed(3));
    } else if (effectiveDailyDemand === 0 && v90 > 0) {
      effectiveDailyDemand = v90;
    }

    const leadTime = (prod as any)?.leadTimeDays || defaultLeadTimeDays;
    const safetyDays = (prod as any)?.safetyStockDays || defaultSafetyStockDays;

    // Safety stock: configured unit threshold or (safetyDays * dailyDemand)
    const minSafetyUnits = (prod as any)?.minSafetyStock || 0;
    const calculatedSafetyUnits = Math.ceil(effectiveDailyDemand * safetyDays);
    const safetyStockUnits = Math.max(minSafetyUnits, calculatedSafetyUnits);

    // Target stock level: (leadTime * dailyDemand) + safetyStockUnits
    const leadTimeDemand = Math.ceil(effectiveDailyDemand * leadTime);
    const targetStockLevel = leadTimeDemand + safetyStockUnits;

    // Explainable Reorder Formula: Target - Available - Incoming
    const netDeficit = targetStockLevel - availableStock - incomingPoStock;

    // Pack size rounding
    const packSize = (prod as any)?.packSize || 1;
    let reorderQuantity = 0;
    let reorderPacks = 0;

    if (netDeficit > 0 && (effectiveDailyDemand > 0 || availableStock <= 0)) {
      reorderPacks = Math.ceil(netDeficit / packSize);
      reorderQuantity = reorderPacks * packSize;
    }

    // Urgency calculation
    let urgency: ReorderUrgency = 'low';
    if (availableStock <= 0) {
      urgency = 'critical';
    } else if (availableStock <= safetyStockUnits) {
      urgency = 'high';
    } else if (availableStock <= targetStockLevel) {
      urgency = 'medium';
    }

    const unitCost = record.unitCost ?? record.averageCost ?? prod?.costPrice ?? 0;
    const estimatedTotalCost = Number((reorderQuantity * unitCost).toFixed(2));

    // Human-readable explanations
    const explanationAr = `المبيعات اليومية: ${effectiveDailyDemand.toFixed(1)}، مدة التوريد: ${leadTime} يوم (${leadTimeDemand} وحدة)، أمان: ${safetyStockUnits} وحدة. المتاح: ${availableStock}، قيد التوريد بأمر شراء: ${incomingPoStock}. العجز: ${netDeficit > 0 ? netDeficit : 0} وحدة.`;
    const explanationEn = `Daily Sales: ${effectiveDailyDemand.toFixed(1)}, Lead Time: ${leadTime}d (${leadTimeDemand}u), Safety: ${safetyStockUnits}u. Available: ${availableStock}, Incoming PO: ${incomingPoStock}. Deficit: ${netDeficit > 0 ? netDeficit : 0} units.`;

    // Only include items with positive reorder recommendations or critical stockout
    if (reorderQuantity > 0 || urgency === 'critical' || urgency === 'high') {
      recommendations.push({
        productId: record.productId,
        variantId: record.variantId,
        sku: (prod as any)?.sku || record.productId,
        name: prod?.name || 'Unknown Product',
        category: prod?.category || 'General',
        brand: prod?.brand || 'Generic',
        preferredSupplierId: (prod as any)?.preferredSupplierId || (prod as any)?.supplierId || 'unassigned',
        preferredSupplierName: (prod as any)?.preferredSupplierName || (prod as any)?.supplierName || 'غير محدد (Unassigned)',
        sales7d: s7,
        sales30d: s30,
        sales90d: s90,
        dailyVelocity7d: v7,
        dailyVelocity30d: v30,
        dailyVelocity90d: v90,
        effectiveDailyDemand,
        trend,
        currentStock,
        availableStock,
        incomingPoStock,
        leadTimeDays: leadTime,
        safetyStockDays: safetyDays,
        safetyStockUnits,
        targetStockLevel,
        packSize,
        unitCost,
        reorderQuantity,
        reorderPacks,
        estimatedTotalCost,
        urgency,
        explanationAr,
        explanationEn,
      });
    }
  }

  // Sort: critical first, then high, then estimated cost descending
  const urgencyWeight: Record<ReorderUrgency, number> = { critical: 4, high: 3, medium: 2, low: 1 };
  recommendations.sort((a, b) => {
    const diff = urgencyWeight[b.urgency] - urgencyWeight[a.urgency];
    if (diff !== 0) return diff;
    return b.estimatedTotalCost - a.estimatedTotalCost;
  });

  // Group by Supplier
  const supplierMap = new Map<string, SupplierReorderGroup>();
  for (const item of recommendations) {
    const sid = item.preferredSupplierId || 'unassigned';
    const sname = item.preferredSupplierName || 'غير محدد (Unassigned)';

    if (!supplierMap.has(sid)) {
      supplierMap.set(sid, {
        supplierId: sid,
        supplierName: sname,
        itemsCount: 0,
        totalUnitsToOrder: 0,
        estimatedTotalCost: 0,
        criticalItemsCount: 0,
        highUrgencyItemsCount: 0,
        items: [],
      });
    }

    const group = supplierMap.get(sid)!;
    group.itemsCount += 1;
    group.totalUnitsToOrder += item.reorderQuantity;
    group.estimatedTotalCost = Number((group.estimatedTotalCost + item.estimatedTotalCost).toFixed(2));
    if (item.urgency === 'critical') group.criticalItemsCount++;
    if (item.urgency === 'high') group.highUrgencyItemsCount++;
    group.items.push(item);
  }

  const bySupplier = Array.from(supplierMap.values()).sort((a, b) => b.estimatedTotalCost - a.estimatedTotalCost);

  const totalRecommendedCost = Number(
    recommendations.reduce((sum, r) => sum + r.estimatedTotalCost, 0).toFixed(2)
  );
  const criticalItemsCount = recommendations.filter((r) => r.urgency === 'critical').length;
  const highUrgencyCount = recommendations.filter((r) => r.urgency === 'high').length;

  return {
    recommendations,
    bySupplier,
    totalRecommendedCost,
    totalItemsNeedingReorder: recommendations.length,
    criticalItemsCount,
    highUrgencyCount,
  };
}
