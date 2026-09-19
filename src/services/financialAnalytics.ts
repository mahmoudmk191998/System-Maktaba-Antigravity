import { db } from '@/lib/firebase';
import { collection, query, where, getDocs, limit as fsLimit } from 'firebase/firestore';
import type { Expense } from '@/types/expenses';
import type { Advance, PayrollRecord } from '@/types/payroll';
import { parseToDate } from './analytics/reportingTimezone';
import { firestoreLogger } from '@/lib/firestoreLogger';

export interface ExecutiveFinancialMetrics {
  // Sales Metrics
  totalSales: number;
  cashSales: number;
  electronicSales: number;
  ordersCount: number;
  averageTicket: number;

  // Expenses & Cashflow
  operatingExpenses: number;
  totalCashOutflows: number;
  
  // Payroll & Advances
  payrollDisbursed: number;
  payrollRemaining: number;
  advancesDisbursed: number;
  advancesOutstanding: number;

  // Purchases & Procurement
  purchasesTotal: number;
  purchasesPaid: number;
  purchasesUnpaid: number;
  supplierBalancesTotal: number;

  // Waste & Losses
  wasteCost: number;

  // Operational Result (Sales - Operating Expenses - Waste)
  operatingResult: number;

  // Safe Cash Estimation
  openingCash: number;
  expectedCash: number;

  // Breakdown for Visuals
  expensesByCategory: { name: string; value: number }[];
  timelineData: {
    date: string;
    sales: number;
    cashSales: number;
    cashOutflows: number;
    operatingExpenses: number;
  }[];
}

/**
 * Normalizes date bounds for in-memory filtering (start of start date to end of end date).
 */
export function getDateBounds(dateRange: string, customStart?: string, customEnd?: string): { start: Date; end: Date } {
  const now = new Date();
  const start = new Date();
  const end = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 23, 59, 59, 999);

  switch (dateRange) {
    case 'today':
      start.setHours(0, 0, 0, 0);
      break;
    case 'yesterday':
      start.setDate(now.getDate() - 1);
      start.setHours(0, 0, 0, 0);
      end.setDate(now.getDate() - 1);
      end.setHours(23, 59, 59, 999);
      break;
    case 'week':
      start.setDate(now.getDate() - 7);
      start.setHours(0, 0, 0, 0);
      break;
    case 'month':
      start.setDate(1);
      start.setHours(0, 0, 0, 0);
      break;
    case 'year':
      start.setMonth(0, 1);
      start.setHours(0, 0, 0, 0);
      break;
    case 'custom':
      if (customStart && customEnd) {
        const [sy, sm, sd] = customStart.split('-').map(Number);
        const [ey, em, ed] = customEnd.split('-').map(Number);
        start.setFullYear(sy, sm - 1, sd);
        start.setHours(0, 0, 0, 0);
        end.setFullYear(ey, em - 1, ed);
        end.setHours(23, 59, 59, 999);
      }
      break;
    case 'all':
    default:
      start.setFullYear(2000, 0, 1);
      start.setHours(0, 0, 0, 0);
      end.setFullYear(2099, 11, 31);
      end.setHours(23, 59, 59, 999);
      break;
  }

  return { start, end };
}

/**
 * Pure, Read-Only Analytics Service:
 * Aggregates financial and operational data across all system modules without modifying any existing records.
 */
export async function fetchExecutiveFinancialMetrics(
  tenantId: string,
  branchId?: string | null,
  dateRange: string = 'month',
  customStart?: string,
  customEnd?: string
): Promise<ExecutiveFinancialMetrics> {
  const { start, end } = getDateBounds(dateRange, customStart, customEnd);
  const isAllBranches = !branchId || branchId === 'all';

  // 1. Fetch Sales (Retail Sales Source of Truth) with comprehensive fallbacks
  const salesMap = new Map<string, any>();
  const tryLoadSales = async (col: string, field: string, val: string) => {
    try {
      const snap = await getDocs(query(collection(db, col), where(field, '==', val)));
      snap.docs.forEach((d) => {
        if (!salesMap.has(d.id)) salesMap.set(d.id, { id: d.id, ...d.data() });
      });
    } catch {}
  };

  if (tenantId) {
    await tryLoadSales('sales', 'tenantId', tenantId);
    await tryLoadSales('sales', 'tenant_id', tenantId);
    await tryLoadSales('orders', 'tenantId', tenantId);
    await tryLoadSales('orders', 'tenant_id', tenantId);
  }
  if (salesMap.size === 0) {
    await tryLoadSales('sales', 'tenantId', 'default');
    await tryLoadSales('sales', 'tenant_id', 'default');
    await tryLoadSales('orders', 'tenantId', 'default');
    await tryLoadSales('orders', 'tenant_id', 'default');
  }
  if (salesMap.size === 0) {
    try {
      const snap = await getDocs(collection(db, 'sales'));
      snap.docs.forEach((d) => {
        const data = d.data();
        const docTenant = data.tenantId || data.tenant_id;
        if (!tenantId || tenantId === 'default' || !docTenant || docTenant === tenantId || docTenant === 'default') {
          if (!salesMap.has(d.id)) salesMap.set(d.id, { id: d.id, ...data });
        }
      });
    } catch {}
  }

  // Filter valid completed/paid sales within date bounds and branch
  const validSales = Array.from(salesMap.values()).filter((s) => {
    const sBranch = s.branchId || s.branch_id || s.destinationLocationId || s.locationId;
    if (!isAllBranches && sBranch && sBranch !== branchId && sBranch !== 'default') return false;
    if (s.status === 'cancelled' || s.saleStatus === 'cancelled' || s.status === 'voided') return false;
    const sDateVal = s.createdAt || s.created_at || s.completedAt || s.date || s.order_date || s.timestamp || s.saleDate;
    const sDate = parseToDate(sDateVal);
    if (!sDate) return false;
    return sDate >= start && sDate <= end;
  });

  let totalSales = 0;
  let cashSales = 0;
  let electronicSales = 0;

  validSales.forEach((s) => {
    const amount = Number(s.total || s.total_amount || s.final_amount || 0);
    totalSales += amount;

    const payments = s.payments || s.paymentMethods || [];
    if (payments.length > 0) {
      payments.forEach((p: any) => {
        const pMethod = String(p.method || '').toLowerCase();
        const pAmt = Number(p.amount || 0);
        if (pMethod === 'cash' || pMethod === 'نقدي' || pMethod === 'كاش') {
          cashSales += pAmt;
        } else {
          electronicSales += pAmt;
        }
      });
    } else {
      const method = String(s.payment_method || '').toLowerCase();
      if (method === 'cash' || method === 'نقدي' || method === 'كاش') {
        cashSales += amount;
      } else {
        electronicSales += amount;
      }
    }
  });

  // 1.5 Fetch Returns & Deduct from Sales Metrics with fallbacks
  const returnsMap = new Map<string, any>();
  const tryLoadReturns = async (col: string, field: string, val: string) => {
    try {
      const snap = await getDocs(query(collection(db, col), where(field, '==', val)));
      snap.docs.forEach((d) => {
        if (!returnsMap.has(d.id)) returnsMap.set(d.id, { id: d.id, ...d.data() });
      });
    } catch {}
  };
  if (tenantId) {
    await tryLoadReturns('sale_returns', 'tenantId', tenantId);
    await tryLoadReturns('sale_returns', 'tenant_id', tenantId);
    await tryLoadReturns('sales_returns', 'tenantId', tenantId);
    await tryLoadReturns('sales_returns', 'tenant_id', tenantId);
  }
  if (returnsMap.size === 0 && tenantId && tenantId !== 'default') {
    await tryLoadReturns('sale_returns', 'tenantId', 'default');
    await tryLoadReturns('sale_returns', 'tenant_id', 'default');
  }

  const validReturns = Array.from(returnsMap.values()).filter((r) => {
    const rBranch = r.branchId || r.branch_id;
    if (!isAllBranches && rBranch && rBranch !== branchId && rBranch !== 'default') return false;
    if (r.status && r.status !== 'completed') return false;
    const rDateVal = r.createdAt || r.created_at || r.date || r.timestamp;
    const rDate = parseToDate(rDateVal);
    if (!rDate) return false;
    return rDate >= start && rDate <= end;
  });

  let totalReturns = 0;
  let cashRefunds = 0;
  validReturns.forEach((r) => {
    const refundAmt = Number(r.refundAmount ?? r.subtotalReturned ?? r.total ?? 0);
    totalReturns += refundAmt;
    const method = String(r.refundMethod || '').toLowerCase();
    if (method === 'cash' || method === 'نقدي' || method === 'كاش') {
      cashRefunds += refundAmt;
    }
  });

  // Net sales totals after returns deduction
  totalSales = Math.max(0, totalSales - totalReturns);
  cashSales = Math.max(0, cashSales - cashRefunds);

  const ordersCount = validSales.length;
  const averageTicket = ordersCount > 0 ? Math.round(totalSales / ordersCount) : 0;

  // 2. Fetch Expenses (Expenses & Cash Outflows Source of Truth) with full fallbacks and safety
  const expensesMap = new Map<string, Expense>();
  const tryLoadExpenses = async (col: string, field: string, val: string) => {
    try {
      const snap = await getDocs(query(collection(db, col), where(field, '==', val)));
      snap.docs.forEach((d) => {
        if (!expensesMap.has(d.id)) expensesMap.set(d.id, { id: d.id, ...d.data() } as Expense);
      });
    } catch {}
  };

  if (tenantId) {
    await tryLoadExpenses('expenses', 'tenantId', tenantId);
    await tryLoadExpenses('expenses', 'tenant_id', tenantId);
  }
  if (expensesMap.size === 0 && tenantId && tenantId !== 'default') {
    await tryLoadExpenses('expenses', 'tenantId', 'default');
    await tryLoadExpenses('expenses', 'tenant_id', 'default');
  }
  if (expensesMap.size === 0) {
    try {
      const snap = await getDocs(collection(db, 'expenses'));
      snap.docs.forEach((d) => {
        const data = d.data() as any;
        const docTenant = data.tenantId || data.tenant_id;
        if (!tenantId || tenantId === 'default' || !docTenant || docTenant === tenantId || docTenant === 'default') {
          if (!expensesMap.has(d.id)) expensesMap.set(d.id, { id: d.id, ...data } as Expense);
        }
      });
    } catch {}
  }

  // Filter active expenses within date bounds
  const activeExpenses = Array.from(expensesMap.values()).filter((e: any) => {
    if (e.status === 'voided' || e.status === 'cancelled') return false;
    const eBranch = e.branchId || e.branch_id;
    if (!isAllBranches && eBranch && eBranch !== branchId && eBranch !== 'default') return false;
    const eDate = parseToDate(e.date || e.createdAt || e.created_at || e.timestamp);
    if (!eDate) return false;
    return eDate >= start && eDate <= end;
  });

  // Operating Expenses: Excludes advances and non-operating transactions
  const operatingExpenses = activeExpenses
    .filter((e) => e.category !== 'سلف الموظفين' && e.isOperatingExpense !== false && e.type !== 'employee_advance')
    .reduce((sum, e) => sum + Number(e.amount || 0), 0);

  // Cash Outflows: Money leaving the safe (Includes operating expenses + employee advances)
  const totalCashOutflows = activeExpenses
    .filter((e) => e.affectsCashFlow !== false)
    .reduce((sum, e) => sum + Number(e.amount || 0), 0);

  // Expenses by Category (for pie charts)
  const categoryMap = new Map<string, number>();
  activeExpenses.forEach((e) => {
    const cat = e.category || 'أخرى';
    categoryMap.set(cat, (categoryMap.get(cat) || 0) + Number(e.amount || 0));
  });
  const expensesByCategory = Array.from(categoryMap.entries())
    .map(([name, value]) => ({ name, value }))
    .sort((a, b) => b.value - a.value);

  // 3. Fetch Advances (wrapped safely)
  let advancesDisbursed = 0;
  let advancesOutstanding = 0;
  try {
    const advancesConstraints: any[] = [where('tenant_id', '==', tenantId)];
    const advancesSnap = await getDocs(query(collection(db, 'advances'), ...advancesConstraints));
    const rawAdvances = advancesSnap.docs.map((d) => ({ id: d.id, ...(d.data() as any) })) as Advance[];
    const periodAdvances = rawAdvances.filter((a) => {
      if (a.status === 'cancelled') return false;
      if (!isAllBranches && (a as any).branch_id && (a as any).branch_id !== branchId) return false;
      const aDate = parseToDate(a.createdAt);
      if (!aDate) return false;
      return aDate >= start && aDate <= end;
    });
    advancesDisbursed = periodAdvances.reduce((sum, a) => sum + Number(a.amount || 0), 0);
    advancesOutstanding = rawAdvances
      .filter((a) => a.status === 'active' || a.status === 'partially_paid')
      .reduce((sum, a) => sum + Number(a.remainingAmount || 0), 0);
  } catch {}

  // 4. Fetch Payroll (wrapped safely)
  let payrollDisbursed = 0;
  let payrollRemaining = 0;
  try {
    const payrollSnap = await getDocs(query(collection(db, 'payrolls'), where('tenant_id', '==', tenantId)));
    const rawPayroll = payrollSnap.docs.map((d) => ({ id: d.id, ...(d.data() as any) })) as PayrollRecord[];
    const activePayroll = rawPayroll.filter((p) => isAllBranches || !(p as any).branch_id || (p as any).branch_id === branchId);
    payrollDisbursed = activePayroll.reduce((sum, p) => sum + Number(p.totalPaid || 0), 0);
    payrollRemaining = activePayroll.reduce((sum, p) => sum + Number(p.remaining || 0), 0);
  } catch {}

  // 5. Fetch Purchases & Suppliers (wrapped safely)
  let purchasesTotal = 0;
  let purchasesPaid = 0;
  let purchasesUnpaid = 0;
  let supplierBalancesTotal = 0;
  try {
    let purchasesSnap = await getDocs(query(collection(db, 'purchase_orders'), where('tenantId', '==', tenantId)));
    if (purchasesSnap.empty) {
      purchasesSnap = await getDocs(query(collection(db, 'purchase_orders'), where('tenant_id', '==', tenantId)));
    }
    const rawPurchases = purchasesSnap.docs.map((d) => ({ id: d.id, ...(d.data() as any) }));
    const periodPurchases = rawPurchases.filter((p) => {
      if (p.status === 'cancelled') return false;
      if (!isAllBranches && (p.branchId || p.branch_id) && (p.branchId || p.branch_id) !== branchId) return false;
      const pDate = parseToDate(p.createdAt || p.created_at);
      if (!pDate) return false;
      return pDate >= start && pDate <= end;
    });
    purchasesTotal = periodPurchases.reduce((sum, p) => sum + Number(p.totalAmount || p.total_amount || p.total || 0), 0);
    purchasesPaid = periodPurchases.reduce((sum, p) => sum + Number(p.paidAmount || p.paid_amount || 0), 0);
    purchasesUnpaid = Math.max(0, purchasesTotal - purchasesPaid);

    let suppliersSnap = await getDocs(query(collection(db, 'suppliers'), where('tenantId', '==', tenantId)));
    if (suppliersSnap.empty) {
      suppliersSnap = await getDocs(query(collection(db, 'suppliers'), where('tenant_id', '==', tenantId)));
    }
    const rawSuppliers = suppliersSnap.docs.map((d) => ({ id: d.id, ...(d.data() as any) }));
    supplierBalancesTotal = rawSuppliers.reduce((sum, s) => sum + Number(s.currentBalance ?? s.current_balance ?? 0), 0);
  } catch {}

  // 6. Fetch Waste (wrapped safely)
  let wasteCost = 0;
  try {
    let movementsSnap = await getDocs(query(collection(db, 'stock_movements'), where('tenantId', '==', tenantId)));
    if (movementsSnap.empty) {
      movementsSnap = await getDocs(query(collection(db, 'stock_movements'), where('tenant_id', '==', tenantId)));
    }
    const rawMovements = movementsSnap.docs.map((d) => ({ id: d.id, ...(d.data() as any) }));
    const periodWasteMovements = rawMovements.filter((m) => {
      if (!isAllBranches && (m.branchId || m.branch_id) && (m.branchId || m.branch_id) !== branchId) return false;
      const isWaste = m.movementType === 'waste' || m.movement_type === 'waste';
      if (!isWaste) return false;
      const mDate = parseToDate(m.createdAt || m.created_at);
      if (!mDate) return false;
      return mDate >= start && mDate <= end;
    });
    wasteCost = periodWasteMovements.reduce((sum, m) => {
      const unitCost = Number(m.unitCostSnapshot || m.unit_cost || m.averageCost || 0);
      const qty = Math.abs(Number(m.quantity || m.baseQuantity || 0));
      return sum + (qty * unitCost);
    }, 0);
  } catch {}

  // 7. Calculate Operating Result
  const operatingResult = totalSales - operatingExpenses - wasteCost;

  // 8. Safe Cash Estimation (Opening Cash from shifts + Cash Sales - Cash Outflows)
  let openingCash = 0;
  try {
    const shiftQ = tenantId
      ? query(collection(db, 'cashier_shifts'), where('tenantId', '==', tenantId), fsLimit(50))
      : query(collection(db, 'cashier_shifts'), fsLimit(50));
    let posShiftsSnap = await getDocs(shiftQ);
    firestoreLogger.logOperation('financialAnalytics.shifts', 'cashier_shifts', 'getDocs', posShiftsSnap.docs.length);
    if (posShiftsSnap.empty && tenantId) {
      posShiftsSnap = await getDocs(query(collection(db, 'cashier_shifts'), where('tenant_id', '==', tenantId), fsLimit(50)));
      firestoreLogger.logOperation('financialAnalytics.shiftsAlt', 'cashier_shifts', 'getDocs', posShiftsSnap.docs.length);
    }
    const rawPosShifts = posShiftsSnap.docs.map((d) => ({ id: d.id, ...(d.data() as any) }));
    const periodShifts = rawPosShifts.filter((s) => {
      if (!isAllBranches && (s.branchId || s.branch_id) && (s.branchId || s.branch_id) !== branchId) return false;
      const sDate = parseToDate(s.start_time || s.openedAt || s.createdAt);
      if (!sDate) return false;
      return sDate >= start && sDate <= end;
    });
    openingCash = periodShifts.reduce((sum, s) => sum + Number(s.starting_cash || s.openingCash || 0), 0);
  } catch {}
  const expectedCash = Math.max(0, openingCash + cashSales - totalCashOutflows);

  // 9. Timeline Data for Trend Charts
  const dailyMap = new Map<string, { sales: number; cashSales: number; cashOutflows: number; operatingExpenses: number }>();

  // Aggregate sales by day
  validSales.forEach((s) => {
    const sDateStr = s.createdAt || s.created_at;
    const dStr = new Date(sDateStr).toLocaleDateString('ar-EG', { month: 'short', day: 'numeric' });
    const cur = dailyMap.get(dStr) || { sales: 0, cashSales: 0, cashOutflows: 0, operatingExpenses: 0 };
    const amount = Number(s.total || s.total_amount || 0);
    cur.sales += amount;

    const payments = s.payments || s.paymentMethods || [];
    let isCash = false;
    if (payments.length > 0) {
      isCash = payments.some((p: any) => String(p.method || '').toLowerCase() === 'cash');
    } else {
      const method = String(s.payment_method || '').toLowerCase();
      isCash = (method === 'cash' || method === 'نقدي' || method === 'كاش');
    }
    if (isCash) {
      cur.cashSales += amount;
    }
    dailyMap.set(dStr, cur);
  });

  // Deduct returns by day
  validReturns.forEach((r) => {
    const rDateStr = r.createdAt || r.created_at;
    if (!rDateStr) return;
    const dStr = new Date(rDateStr).toLocaleDateString('ar-EG', { month: 'short', day: 'numeric' });
    const cur = dailyMap.get(dStr) || { sales: 0, cashSales: 0, cashOutflows: 0, operatingExpenses: 0 };
    const refundAmt = Number(r.refundAmount ?? r.subtotalReturned ?? r.total ?? 0);
    cur.sales = Math.max(0, cur.sales - refundAmt);

    const method = String(r.refundMethod || '').toLowerCase();
    if (method === 'cash' || method === 'نقدي' || method === 'كاش') {
      cur.cashSales = Math.max(0, cur.cashSales - refundAmt);
    }
    dailyMap.set(dStr, cur);
  });

  // Aggregate expenses by day safely
  activeExpenses.forEach((e: any) => {
    const eDate = parseToDate(e.date || e.createdAt || e.created_at || e.timestamp);
    if (!eDate) return;
    const dStr = eDate.toLocaleDateString('ar-EG', { month: 'short', day: 'numeric' });
    const cur = dailyMap.get(dStr) || { sales: 0, cashSales: 0, cashOutflows: 0, operatingExpenses: 0 };
    const amount = Number(e.amount || 0);
    if (e.affectsCashFlow !== false) {
      cur.cashOutflows += amount;
    }
    if (e.category !== 'سلف الموظفين' && e.isOperatingExpense !== false && e.type !== 'employee_advance') {
      cur.operatingExpenses += amount;
    }
    dailyMap.set(dStr, cur);
  });

  const timelineData = Array.from(dailyMap.entries())
    .map(([date, data]) => ({ date, ...data }))
    .slice(-15); // Latest 15 days

  return {
    totalSales,
    cashSales,
    electronicSales,
    ordersCount,
    averageTicket,
    operatingExpenses,
    totalCashOutflows,
    payrollDisbursed,
    payrollRemaining,
    advancesDisbursed,
    advancesOutstanding,
    purchasesTotal,
    purchasesPaid,
    purchasesUnpaid,
    supplierBalancesTotal,
    wasteCost,
    operatingResult,
    openingCash,
    expectedCash,
    expensesByCategory,
    timelineData,
  };
}
