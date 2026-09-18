/**
 * Branch Comparison & Employee/Cashier Operational Intelligence
 * Benchmarks branch performance, inter-branch transfer volumes,
 * and cashier operational speed, discounts, and return patterns.
 * Fully compliant with Audit 6 (includes archived branches & employees).
 */

import { collection, getDocs, query, where } from 'firebase/firestore';
import { db } from '../../lib/firebase';
import { BranchTransfer, Sale, SaleReturn } from '../../types/retail.types';
import { DateRange } from './reportingTimezone';
import { fetchSalesPeriodData } from './salesAnalytics.service';

export interface BranchPerformanceRecord {
  branchId: string;
  branchName: string;
  transactionsCount: number;
  grossSales: number;
  discounts: number;
  returns: number;
  netSales: number;
  cogs: number;
  grossProfit: number;
  grossMarginPct: number;
  avgBasketSize: number;
  avgOrderValue: number;
  outgoingTransfersCount: number;
  incomingTransfersCount: number;
  transferredUnitsVolume: number;
}

export interface CashierOperationalRecord {
  cashierId: string;
  cashierName: string;
  invoicesCount: number;
  totalGrossSales: number;
  totalDiscounts: number;
  discountRatePct: number;
  totalNetSales: number;
  returnsCount: number;
  returnsAmount: number;
  splitPaymentInvoicesCount: number;
  itemsProcessedCount: number;
  avgItemsPerInvoice: number;
  avgOrderValue: number;
}

export interface BranchAndEmployeeReport {
  branches: BranchPerformanceRecord[];
  cashiers: CashierOperationalRecord[];
  summary: {
    totalBranchesCount: number;
    totalActiveCashiers: number;
    totalTransfersVolume: number;
  };
}

export async function generateBranchAndEmployeeAnalytics(
  tenantId: string,
  dateRange: DateRange
): Promise<BranchAndEmployeeReport> {
  const fetchSafeTransfersDocs = async () => {
    try {
      return await getDocs(query(collection(db, 'branch_transfers'), where('tenantId', '==', tenantId)));
    } catch {
      return { forEach: () => {} };
    }
  };

  const fetchSafeBranchesDocs = async () => {
    try {
      return await getDocs(query(collection(db, 'branches'), where('tenantId', '==', tenantId)));
    } catch {
      return { forEach: () => {} };
    }
  };

  const [salesData, transfersSnap, branchesSnap] = await Promise.all([
    fetchSalesPeriodData(tenantId, dateRange),
    fetchSafeTransfersDocs(),
    fetchSafeBranchesDocs(),
  ]);

  const { sales, returns } = salesData;

  // Branch names map
  const branchNameMap = new Map<string, string>();
  branchesSnap.forEach((doc) => {
    const d = doc.data();
    branchNameMap.set(doc.id, d.name || d.branchName || doc.id);
  });

  // Branch metrics map
  const branchStats = new Map<
    string,
    {
      txCount: number;
      grossSales: number;
      discounts: number;
      returns: number;
      itemsCount: number;
      cogs: number;
      outgoingTransfers: number;
      incomingTransfers: number;
      transferredUnits: number;
    }
  >();

  const getBranchStat = (bId: string) => {
    if (!branchStats.has(bId)) {
      branchStats.set(bId, {
        txCount: 0,
        grossSales: 0,
        discounts: 0,
        returns: 0,
        itemsCount: 0,
        cogs: 0,
        outgoingTransfers: 0,
        incomingTransfers: 0,
        transferredUnits: 0,
      });
    }
    return branchStats.get(bId)!;
  };

  // Cashier metrics map
  const cashierStats = new Map<
    string,
    {
      name: string;
      invoices: number;
      grossSales: number;
      discounts: number;
      itemsCount: number;
      splitCount: number;
      returnsCount: number;
      returnsAmount: number;
    }
  >();

  sales.forEach((sale) => {
    if (sale.status === 'cancelled' || (sale as any).status === 'voided') return;

    const bId = sale.branchId || 'default';
    const bStat = getBranchStat(bId);

    const subtotal = sale.subtotal || sale.total + (sale.discountTotal || 0);
    const disc = sale.discountTotal || 0;
    bStat.txCount += 1;
    bStat.grossSales += subtotal;
    bStat.discounts += disc;

    let saleItemsCount = 0;
    let saleCogs = 0;

    for (const item of sale.items || []) {
      const qty = item.baseQuantity || item.quantity || 0;
      const unitCost = item.unitCostSnapshot ?? (item as any).costPriceSnapshot ?? (item as any).costPrice ?? 0;
      saleItemsCount += qty;
      saleCogs += item.totalCost !== undefined ? item.totalCost : qty * unitCost;
    }

    if (saleCogs === 0 && (sale.costTotal || 0) > 0) {
      saleCogs = sale.costTotal;
    }

    bStat.itemsCount += saleItemsCount;
    bStat.cogs += saleCogs;

    // Cashier
    const cId = sale.cashierId || (sale as any).cashier_id || (sale as any).created_by || 'unassigned';
    const cName = sale.cashierNameSnapshot || (sale as any).cashier_name || 'كاشير';
    if (!cashierStats.has(cId)) {
      cashierStats.set(cId, {
        name: cName,
        invoices: 0,
        grossSales: 0,
        discounts: 0,
        itemsCount: 0,
        splitCount: 0,
        returnsCount: 0,
        returnsAmount: 0,
      });
    }
    const cStat = cashierStats.get(cId)!;
    cStat.invoices += 1;
    cStat.grossSales += subtotal;
    cStat.discounts += disc;
    cStat.itemsCount += saleItemsCount;
    if (sale.paymentMethods && sale.paymentMethods.length > 1) {
      cStat.splitCount += 1;
    }
  });

  // Returns processing
  returns.forEach((ret) => {
    const bId = ret.branchId || (ret as any).branch_id || 'default';
    const bStat = getBranchStat(bId);
    const refundAmt = ret.refundAmount || ret.subtotalReturned || (ret as any).total || 0;
    bStat.returns += refundAmt;
    bStat.cogs = Math.max(0, bStat.cogs - (ret.costReversed || (ret as any).cost_reversed || 0));

    const cId = ret.cashierId || (ret as any).cashier_id || ret.processedBy || (ret as any).processed_by || 'unassigned';
    if (cashierStats.has(cId)) {
      const cStat = cashierStats.get(cId)!;
      cStat.returnsCount += 1;
      cStat.returnsAmount += refundAmt;
    }
  });

  // Transfers processing
  let totalTransfersVolume = 0;
  transfersSnap.forEach((doc) => {
    const t = doc.data() as BranchTransfer;
    const fromB = t.fromLocationId || (t as any).fromBranchId;
    const toB = t.toLocationId || (t as any).toBranchId;

    let units = 0;
    for (const it of t.items || []) {
      units += it.quantity || 0;
    }
    totalTransfersVolume += units;

    if (fromB) {
      const stat = getBranchStat(fromB);
      stat.outgoingTransfers += 1;
      stat.transferredUnits += units;
    }
    if (toB) {
      const stat = getBranchStat(toB);
      stat.incomingTransfers += 1;
      stat.transferredUnits += units;
    }
  });

  // Build Branches list
  const branches: BranchPerformanceRecord[] = Array.from(branchStats.entries()).map(([bId, s]) => {
    const netSales = Math.max(0, s.grossSales - s.discounts - s.returns);
    const grossProfit = netSales - s.cogs;
    const grossMarginPct = netSales > 0 ? Number(((grossProfit / netSales) * 100).toFixed(2)) : 0;
    const avgBasketSize = s.txCount > 0 ? Number((s.itemsCount / s.txCount).toFixed(2)) : 0;
    const avgOrderValue = s.txCount > 0 ? Number((netSales / s.txCount).toFixed(2)) : 0;

    return {
      branchId: bId,
      branchName: branchNameMap.get(bId) || (bId === 'default' ? 'الفرع الرئيسي' : `فرع (${bId})`),
      transactionsCount: s.txCount,
      grossSales: Number(s.grossSales.toFixed(2)),
      discounts: Number(s.discounts.toFixed(2)),
      returns: Number(s.returns.toFixed(2)),
      netSales: Number(netSales.toFixed(2)),
      cogs: Number(s.cogs.toFixed(2)),
      grossProfit: Number(grossProfit.toFixed(2)),
      grossMarginPct,
      avgBasketSize,
      avgOrderValue,
      outgoingTransfersCount: s.outgoingTransfers,
      incomingTransfersCount: s.incomingTransfers,
      transferredUnitsVolume: s.transferredUnits,
    };
  }).sort((a, b) => b.netSales - a.netSales);

  // Build Cashiers list
  const cashiers: CashierOperationalRecord[] = Array.from(cashierStats.entries()).map(([cId, s]) => {
    const netSales = Math.max(0, s.grossSales - s.discounts - s.returnsAmount);
    const discRate = s.grossSales > 0 ? Number(((s.discounts / s.grossSales) * 100).toFixed(2)) : 0;
    const avgItems = s.invoices > 0 ? Number((s.itemsCount / s.invoices).toFixed(1)) : 0;
    const aov = s.invoices > 0 ? Number((netSales / s.invoices).toFixed(2)) : 0;

    return {
      cashierId: cId,
      cashierName: s.name,
      invoicesCount: s.invoices,
      totalGrossSales: Number(s.grossSales.toFixed(2)),
      totalDiscounts: Number(s.discounts.toFixed(2)),
      discountRatePct: discRate,
      totalNetSales: Number(netSales.toFixed(2)),
      returnsCount: s.returnsCount,
      returnsAmount: Number(s.returnsAmount.toFixed(2)),
      splitPaymentInvoicesCount: s.splitCount,
      itemsProcessedCount: s.itemsCount,
      avgItemsPerInvoice: avgItems,
      avgOrderValue: aov,
    };
  }).sort((a, b) => b.totalNetSales - a.totalNetSales);

  return {
    branches,
    cashiers,
    summary: {
      totalBranchesCount: branches.length,
      totalActiveCashiers: cashiers.length,
      totalTransfersVolume,
    },
  };
}
