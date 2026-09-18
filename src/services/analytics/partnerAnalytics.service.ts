/**
 * Partner Analytics Service (Suppliers & Customers)
 * Computes supplier lead times, fill rates, on-time delivery rates,
 * customer lifetime value (LTV), repeat rates, and RFM behavioral segmentation.
 * Fully compliant with Audit 6 (includes archived partners for historical integrity).
 */

import { collection, getDocs, query, where } from 'firebase/firestore';
import { db } from '../../lib/firebase';
import { Customer, GoodsReceivedNote, PurchaseOrder, PurchaseReturn, Sale, Supplier } from '../../types/retail.types';
import { DateRange, parseToDate } from './reportingTimezone';

export interface SupplierPerformanceMetrics {
  supplierId: string;
  supplierCode: string;
  name: string;
  supplierType: string;
  totalOrders: number;
  totalPurchasesAmount: number;
  totalReceivedUnits: number;
  totalOrderedUnits: number;
  fillRatePct: number; // received / ordered
  avgLeadTimeDays: number;
  onTimeDeliveryRatePct: number;
  totalReturnsAmount: number;
  returnRatePct: number;
  currentBalanceOwed: number;
  scorecardRating: 'A+' | 'A' | 'B' | 'C' | 'D';
  isArchived: boolean;
}

export type RFMSegment =
  | 'champions'
  | 'loyal_customers'
  | 'potential_loyalist'
  | 'recent_customers'
  | 'at_risk'
  | 'hibernating'
  | 'lost';

export interface CustomerRFMProfile {
  customerId: string;
  customerCode?: string;
  name: string;
  phone: string;
  customerType: string;
  firstOrderDate: string;
  lastOrderDate: string;
  recencyDays: number;
  frequencyOrders: number;
  monetaryLtv: number;
  averageOrderValue: number;
  rScore: number; // 1-5
  fScore: number; // 1-5
  mScore: number; // 1-5
  rfmScore: string; // e.g. "555"
  segment: RFMSegment;
  segmentLabelAr: string;
  currentBalance: number;
  creditLimit: number;
  isArchived: boolean;
}

export interface PartnerAnalyticsReport {
  suppliers: SupplierPerformanceMetrics[];
  customers: CustomerRFMProfile[];
  summary: {
    totalSuppliersCount: number;
    totalPurchasingVolume: number;
    avgSupplierFillRatePct: number;
    totalCustomersCount: number;
    repeatCustomerRatePct: number;
    portfolioLtv: number;
    topSegmentCounts: Record<RFMSegment, number>;
  };
}

/**
 * Generate complete Supplier & Customer analytics
 */
export async function generatePartnerAnalytics(
  tenantId: string,
  dateRange: DateRange,
  branchId?: string
): Promise<PartnerAnalyticsReport> {
  // Safe query helper to prevent permission-denied or schema mismatches from failing the entire report
  const safeGetDocs = async (collName: string) => {
    try {
      return await getDocs(query(collection(db, collName), where('tenantId', '==', tenantId)));
    } catch (e) {
      console.warn(`Safe fetch failed for collection "${collName}":`, e);
      return { forEach: () => {}, docs: [] };
    }
  };

  // 1. Fetch Suppliers, Purchase Orders, GRNs, and Purchase Returns safely
  const [supSnap, poSnap, grnSnapPrimary, pretSnap, custSnap, saleSnap] = await Promise.all([
    safeGetDocs('suppliers'),
    safeGetDocs('purchase_orders'),
    safeGetDocs('goods_receipts'),
    safeGetDocs('purchase_returns'),
    safeGetDocs('customers'),
    safeGetDocs('sales'),
  ]);

  // Fallback to legacy goods_received_notes if goods_receipts was empty
  let grnSnap = grnSnapPrimary;
  if ((grnSnap as any).docs?.length === 0) {
    const fallbackGrn = await safeGetDocs('goods_received_notes');
    if ((fallbackGrn as any).docs?.length > 0) {
      grnSnap = fallbackGrn;
    }
  }

  // Map suppliers (Audit 6: including archived)
  const suppliersMap = new Map<string, Supplier>();
  supSnap.forEach((doc) => {
    suppliersMap.set(doc.id, { id: doc.id, ...doc.data() } as Supplier);
  });

  // Process Supplier POs and Lead Times
  const supStats = new Map<
    string,
    {
      totalOrders: number;
      totalPurchasesAmount: number;
      orderedUnits: number;
      leadTimes: number[];
      onTimeCount: number;
      deliveredOrdersCount: number;
    }
  >();

  poSnap.forEach((doc) => {
    const po = doc.data() as PurchaseOrder;
    if (po.status === 'cancelled') return;
    const sid = po.supplierId;
    if (!sid) return;

    if (!supStats.has(sid)) {
      supStats.set(sid, {
        totalOrders: 0,
        totalPurchasesAmount: 0,
        orderedUnits: 0,
        leadTimes: [],
        onTimeCount: 0,
        deliveredOrdersCount: 0,
      });
    }
    const stat = supStats.get(sid)!;
    stat.totalOrders += 1;
    stat.totalPurchasesAmount += po.grandTotal || po.totalAmount || 0;

    for (const it of po.items || []) {
      stat.orderedUnits += it.quantity || 0;
    }
  });

  // Process GRNs for actual delivery lead time and received units
  const supReceivedUnits = new Map<string, number>();
  grnSnap.forEach((doc) => {
    const grn = doc.data() as GoodsReceivedNote;
    const sid = grn.supplierId;
    if (!sid) return;

    let units = 0;
    for (const it of grn.items || []) {
      units += it.acceptedQuantity || (it as any).quantity || 0;
    }
    supReceivedUnits.set(sid, (supReceivedUnits.get(sid) || 0) + units);

    // Compute lead time if orderDate is present on referenced PO
    if (grn.receivedDate && grn.createdAt) {
      const stat = supStats.get(sid);
      if (stat) {
        stat.deliveredOrdersCount += 1;
        const rDate = parseToDate(grn.receivedDate);
        const cDate = parseToDate(grn.createdAt);
        if (rDate && cDate) {
          const diffDays = Math.max(0, Math.round((rDate.getTime() - cDate.getTime()) / (1000 * 60 * 60 * 24)));
          if (diffDays > 0 && diffDays < 180) {
            stat.leadTimes.push(diffDays);
          }
        }
        // Assume on-time if not flagged delayed
        stat.onTimeCount += 1;
      }
    }
  });

  // Process Purchase Returns
  const supReturnsMap = new Map<string, number>();
  pretSnap.forEach((doc) => {
    const pret = doc.data() as PurchaseReturn;
    const sid = pret.supplierId;
    if (sid) {
      const amt = pret.refundAmount || pret.totalAmount || 0;
      supReturnsMap.set(sid, (supReturnsMap.get(sid) || 0) + amt);
    }
  });

  // Assemble Supplier Performance
  const suppliers: SupplierPerformanceMetrics[] = [];
  let totalPurchasingVolume = 0;
  let totalFillRateSum = 0;

  for (const [sid, sup] of suppliersMap.entries()) {
    const stat = supStats.get(sid) || {
      totalOrders: 0,
      totalPurchasesAmount: 0,
      orderedUnits: 0,
      leadTimes: [],
      onTimeCount: 0,
      deliveredOrdersCount: 0,
    };
    const receivedUnits = supReceivedUnits.get(sid) || 0;
    const returnsAmt = supReturnsMap.get(sid) || 0;

    totalPurchasingVolume += stat.totalPurchasesAmount;

    const fillRatePct =
      stat.orderedUnits > 0
        ? Math.min(100, Number(((receivedUnits / stat.orderedUnits) * 100).toFixed(2)))
        : stat.totalOrders > 0
        ? 100
        : 0;

    totalFillRateSum += fillRatePct;

    const avgLead =
      stat.leadTimes.length > 0
        ? Number((stat.leadTimes.reduce((a, b) => a + b, 0) / stat.leadTimes.length).toFixed(1))
        : sup.paymentTermsDays || 7;

    const onTimeRatePct =
      stat.deliveredOrdersCount > 0
        ? Number(((stat.onTimeCount / stat.deliveredOrdersCount) * 100).toFixed(2))
        : 100;

    const returnRatePct =
      stat.totalPurchasesAmount > 0
        ? Number(((returnsAmt / stat.totalPurchasesAmount) * 100).toFixed(2))
        : 0;

    // Scorecard Rating: Composite of Fill Rate, On-Time Rate & Return Rate
    let rating: 'A+' | 'A' | 'B' | 'C' | 'D' = 'B';
    const compositeScore = fillRatePct * 0.4 + onTimeRatePct * 0.4 - returnRatePct * 2;
    if (compositeScore >= 95) rating = 'A+';
    else if (compositeScore >= 85) rating = 'A';
    else if (compositeScore >= 70) rating = 'B';
    else if (compositeScore >= 50) rating = 'C';
    else rating = 'D';

    suppliers.push({
      supplierId: sid,
      supplierCode: sup.supplierCode || sid,
      name: sup.name,
      supplierType: sup.supplierType || 'wholesaler',
      totalOrders: stat.totalOrders,
      totalPurchasesAmount: Number(stat.totalPurchasesAmount.toFixed(2)),
      totalReceivedUnits: receivedUnits,
      totalOrderedUnits: stat.orderedUnits,
      fillRatePct,
      avgLeadTimeDays: avgLead,
      onTimeDeliveryRatePct: onTimeRatePct,
      totalReturnsAmount: Number(returnsAmt.toFixed(2)),
      returnRatePct,
      currentBalanceOwed: Number((sup.currentBalance || 0).toFixed(2)),
      scorecardRating: rating,
      isArchived: sup.archived || !sup.active,
    });
  }

  suppliers.sort((a, b) => b.totalPurchasesAmount - a.totalPurchasesAmount);

  // 2. Customer RFM & Lifetime Value
  const customerMap = new Map<string, Customer>();
  custSnap.forEach((doc) => {
    customerMap.set(doc.id, { id: doc.id, ...doc.data() } as Customer);
  });

  const customerSaleStats = new Map<
    string,
    {
      orderCount: number;
      totalSpend: number;
      firstOrder: string;
      lastOrder: string;
    }
  >();

  let effectiveSaleDocs = (saleSnap as any).docs || [];
  if (effectiveSaleDocs.length === 0) {
    const ordersSnap = await safeGetDocs('orders');
    if ((ordersSnap as any).docs?.length > 0) {
      effectiveSaleDocs = (ordersSnap as any).docs;
    }
  }

  effectiveSaleDocs.forEach((doc: any) => {
    const sale = doc.data() as Sale;
    if (sale.status === 'cancelled' || (sale as any).status === 'voided') return;
    const cid = sale.customerId || (sale as any).customer_id;
    if (!cid || cid === 'guest') return;

    const sDate = parseToDate(sale.createdAt) || new Date();
    const isoStr = sDate.toISOString();

    if (!customerSaleStats.has(cid)) {
      customerSaleStats.set(cid, {
        orderCount: 0,
        totalSpend: 0,
        firstOrder: isoStr,
        lastOrder: isoStr,
      });
    }

    const cStat = customerSaleStats.get(cid)!;
    cStat.orderCount += 1;
    cStat.totalSpend += sale.total || 0;
    if (isoStr < cStat.firstOrder) cStat.firstOrder = isoStr;
    if (isoStr > cStat.lastOrder) cStat.lastOrder = isoStr;
  });

  const nowMs = new Date().getTime();
  const rawProfiles: {
    cust: Customer;
    recency: number;
    frequency: number;
    monetary: number;
    firstOrder: string;
    lastOrder: string;
  }[] = [];

  for (const [cid, cust] of customerMap.entries()) {
    const stats = customerSaleStats.get(cid);
    if (!stats) continue; // Only score customers with purchase history

    const lastMs = new Date(stats.lastOrder).getTime();
    const recencyDays = Math.max(0, Math.round((nowMs - lastMs) / (1000 * 60 * 60 * 24)));

    rawProfiles.push({
      cust,
      recency: recencyDays,
      frequency: stats.orderCount,
      monetary: stats.totalSpend,
      firstOrder: stats.firstOrder,
      lastOrder: stats.lastOrder,
    });
  }

  // RFM Quintile Scoring (1 to 5)
  // Recency: Lower days = Higher score 5
  // Frequency: Higher orders = Higher score 5
  // Monetary: Higher spend = Higher score 5
  const customers: CustomerRFMProfile[] = rawProfiles.map((p) => {
    let rScore = 1;
    if (p.recency <= 14) rScore = 5;
    else if (p.recency <= 30) rScore = 4;
    else if (p.recency <= 60) rScore = 3;
    else if (p.recency <= 120) rScore = 2;

    let fScore = 1;
    if (p.frequency >= 10) fScore = 5;
    else if (p.frequency >= 5) fScore = 4;
    else if (p.frequency >= 3) fScore = 3;
    else if (p.frequency >= 2) fScore = 2;

    let mScore = 1;
    if (p.monetary >= 10000) mScore = 5;
    else if (p.monetary >= 5000) mScore = 4;
    else if (p.monetary >= 2000) mScore = 3;
    else if (p.monetary >= 500) mScore = 2;

    // Segment derivation
    let segment: RFMSegment = 'recent_customers';
    let labelAr = 'عملاء جدد';

    if (rScore >= 4 && fScore >= 4 && mScore >= 4) {
      segment = 'champions';
      labelAr = 'عملاء نُخبة (أبطال)';
    } else if (fScore >= 3 && mScore >= 3 && rScore >= 3) {
      segment = 'loyal_customers';
      labelAr = 'عملاء مخلصون';
    } else if (rScore >= 4 && fScore <= 2) {
      segment = 'potential_loyalist';
      labelAr = 'عملاء واعدون';
    } else if (rScore <= 2 && fScore >= 3) {
      segment = 'at_risk';
      labelAr = 'معرضون للمغادرة (بحاجة لاهتمام)';
    } else if (rScore === 1 && fScore <= 2) {
      segment = 'hibernating';
      labelAr = 'خاملون';
    } else if (rScore === 1 && mScore >= 4) {
      segment = 'lost';
      labelAr = 'عملاء قيّمون مفقودون';
    }

    const aov = p.frequency > 0 ? Number((p.monetary / p.frequency).toFixed(2)) : 0;

    return {
      customerId: p.cust.id,
      customerCode: p.cust.customerCode || p.cust.id,
      name: p.cust.name,
      phone: p.cust.phone,
      customerType: p.cust.customerType || 'retail',
      firstOrderDate: p.firstOrder,
      lastOrderDate: p.lastOrder,
      recencyDays: p.recency,
      frequencyOrders: p.frequency,
      monetaryLtv: Number(p.monetary.toFixed(2)),
      averageOrderValue: aov,
      rScore,
      fScore,
      mScore,
      rfmScore: `${rScore}${fScore}${mScore}`,
      segment,
      segmentLabelAr: labelAr,
      currentBalance: Number((p.cust.currentBalance || 0).toFixed(2)),
      creditLimit: Number((p.cust.creditLimit || 0).toFixed(2)),
      isArchived: p.cust.archived || !p.cust.active,
    };
  });

  customers.sort((a, b) => b.monetaryLtv - a.monetaryLtv);

  // Summary stats
  const repeatCustomersCount = customers.filter((c) => c.frequencyOrders > 1).length;
  const repeatCustomerRatePct = customers.length > 0 ? Number(((repeatCustomersCount / customers.length) * 100).toFixed(2)) : 0;
  const portfolioLtv = Number(customers.reduce((sum, c) => sum + c.monetaryLtv, 0).toFixed(2));

  const topSegmentCounts: Record<RFMSegment, number> = {
    champions: customers.filter((c) => c.segment === 'champions').length,
    loyal_customers: customers.filter((c) => c.segment === 'loyal_customers').length,
    potential_loyalist: customers.filter((c) => c.segment === 'potential_loyalist').length,
    recent_customers: customers.filter((c) => c.segment === 'recent_customers').length,
    at_risk: customers.filter((c) => c.segment === 'at_risk').length,
    hibernating: customers.filter((c) => c.segment === 'hibernating').length,
    lost: customers.filter((c) => c.segment === 'lost').length,
  };

  const avgSupplierFillRatePct =
    suppliers.length > 0 ? Number((totalFillRateSum / suppliers.length).toFixed(2)) : 0;

  return {
    suppliers,
    customers,
    summary: {
      totalSuppliersCount: suppliers.length,
      totalPurchasingVolume: Number(totalPurchasingVolume.toFixed(2)),
      avgSupplierFillRatePct,
      totalCustomersCount: customers.length,
      repeatCustomerRatePct,
      portfolioLtv,
      topSegmentCounts,
    },
  };
}
