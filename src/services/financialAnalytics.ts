import { db } from '@/lib/firebase';
import { collection, query, where, getDocs } from 'firebase/firestore';
import type { Expense } from '@/types/expenses';
import type { Advance, PayrollRecord } from '@/types/payroll';

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
      start.setMonth(now.getMonth() - 1);
      start.setHours(0, 0, 0, 0);
      break;
    case 'year':
      start.setFullYear(now.getFullYear() - 1);
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
      start.setFullYear(2020, 0, 1);
      start.setHours(0, 0, 0, 0);
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

  // 1. Fetch Orders (Sales Source of Truth)
  const ordersConstraints: any[] = [where('tenant_id', '==', tenantId)];
  if (!isAllBranches) {
    ordersConstraints.push(where('branch_id', '==', branchId));
  }
  const ordersSnap = await getDocs(query(collection(db, 'orders'), ...ordersConstraints));
  const rawOrders = ordersSnap.docs.map((d) => ({ id: d.id, ...(d.data() as any) }));

  // Filter valid completed/paid orders within date bounds
  const validOrders = rawOrders.filter((o) => {
    if (!o.created_at) return false;
    if (o.status === 'cancelled') return false;
    const oDate = new Date(o.created_at);
    return oDate >= start && oDate <= end;
  });

  let totalSales = 0;
  let cashSales = 0;
  let electronicSales = 0;

  validOrders.forEach((o) => {
    const amount = Number(o.total_amount || o.final_amount || o.total || 0);
    totalSales += amount;
    const method = String(o.payment_method || '').toLowerCase();
    if (method === 'cash' || method === 'نقدي' || method === 'كاش') {
      cashSales += amount;
    } else {
      electronicSales += amount;
    }
  });

  const ordersCount = validOrders.length;
  const averageTicket = ordersCount > 0 ? Math.round(totalSales / ordersCount) : 0;

  // 2. Fetch Expenses (Expenses & Cash Outflows Source of Truth)
  const expensesConstraints: any[] = [where('tenantId', '==', tenantId)];
  if (!isAllBranches) {
    expensesConstraints.push(where('branchId', '==', branchId));
  }
  const expensesSnap = await getDocs(query(collection(db, 'expenses'), ...expensesConstraints));
  const rawExpenses = expensesSnap.docs.map((d) => ({ id: d.id, ...(d.data() as any) })) as Expense[];

  // Filter active expenses within date bounds
  const activeExpenses = rawExpenses.filter((e) => {
    if (e.status === 'voided') return false;
    if (!e.date) return false;
    const [year, month, day] = e.date.split('-').map(Number);
    const eDate = new Date(year, month - 1, day);
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

  // 3. Fetch Advances
  const advancesConstraints: any[] = [where('tenant_id', '==', tenantId)];
  if (!isAllBranches) {
    advancesConstraints.push(where('branch_id', '==', branchId));
  }
  const advancesSnap = await getDocs(query(collection(db, 'advances'), ...advancesConstraints));
  const rawAdvances = advancesSnap.docs.map((d) => ({ id: d.id, ...(d.data() as any) })) as Advance[];

  // Filter advances disbursed in this period
  const periodAdvances = rawAdvances.filter((a) => {
    if (a.status === 'cancelled') return false;
    if (!a.createdAt) return false;
    const aDate = new Date(a.createdAt);
    return aDate >= start && aDate <= end;
  });
  const advancesDisbursed = periodAdvances.reduce((sum, a) => sum + Number(a.amount || 0), 0);

  // All active/partially paid advances outstanding balance
  const advancesOutstanding = rawAdvances
    .filter((a) => a.status === 'active' || a.status === 'partially_paid')
    .reduce((sum, a) => sum + Number(a.remainingAmount || 0), 0);

  // 4. Fetch Payroll
  const payrollConstraints: any[] = [where('tenant_id', '==', tenantId)];
  if (!isAllBranches) {
    payrollConstraints.push(where('branch_id', '==', branchId));
  }
  const payrollSnap = await getDocs(query(collection(db, 'payrolls'), ...payrollConstraints));
  const rawPayroll = payrollSnap.docs.map((d) => ({ id: d.id, ...(d.data() as any) })) as PayrollRecord[];

  const payrollDisbursed = rawPayroll.reduce((sum, p) => sum + Number(p.totalPaid || 0), 0);
  const payrollRemaining = rawPayroll.reduce((sum, p) => sum + Number(p.remaining || 0), 0);

  // 5. Fetch Purchases & Suppliers
  const purchasesConstraints: any[] = [where('tenant_id', '==', tenantId)];
  if (!isAllBranches) {
    purchasesConstraints.push(where('branch_id', '==', branchId));
  }
  const purchasesSnap = await getDocs(query(collection(db, 'purchase_orders'), ...purchasesConstraints));
  const rawPurchases = purchasesSnap.docs.map((d) => ({ id: d.id, ...(d.data() as any) }));

  const periodPurchases = rawPurchases.filter((p) => {
    if (p.status === 'cancelled') return false;
    if (!p.created_at) return false;
    const pDate = new Date(p.created_at);
    return pDate >= start && pDate <= end;
  });

  const purchasesTotal = periodPurchases.reduce((sum, p) => sum + Number(p.total_amount || 0), 0);
  const purchasesPaid = periodPurchases.reduce((sum, p) => sum + Number(p.paid_amount || 0), 0);
  const purchasesUnpaid = Math.max(0, purchasesTotal - purchasesPaid);

  // Fetch Suppliers Outstanding Balances
  const suppliersSnap = await getDocs(query(collection(db, 'suppliers'), where('tenant_id', '==', tenantId)));
  const rawSuppliers = suppliersSnap.docs.map((d) => ({ id: d.id, ...(d.data() as any) }));
  const supplierBalancesTotal = rawSuppliers.reduce((sum, s) => sum + Number(s.current_balance || 0), 0);

  // 6. Fetch Waste (from stock_movements where movement_type === 'waste')
  const inventoryItemsSnap = await getDocs(query(collection(db, 'inventory_items'), where('tenant_id', '==', tenantId)));
  const itemCostMap = new Map<string, number>();
  inventoryItemsSnap.docs.forEach((d) => {
    const data = d.data() as any;
    itemCostMap.set(d.id, Number(data.cost_per_unit || 0));
  });

  const wasteConstraints: any[] = [where('tenant_id', '==', tenantId)];
  if (!isAllBranches) {
    wasteConstraints.push(where('branch_id', '==', branchId));
  }
  const movementsSnap = await getDocs(query(collection(db, 'stock_movements'), ...wasteConstraints));
  const rawMovements = movementsSnap.docs.map((d) => ({ id: d.id, ...(d.data() as any) }));

  const periodWasteMovements = rawMovements.filter((m) => {
    if (m.movement_type !== 'waste') return false;
    if (!m.created_at) return false;
    const mDate = new Date(m.created_at);
    return mDate >= start && mDate <= end;
  });

  const wasteCost = periodWasteMovements.reduce((sum, m) => {
    const unitCost = itemCostMap.get(m.item_id) || 0;
    const qty = Math.abs(Number(m.quantity || 0));
    return sum + qty * unitCost;
  }, 0);

  // 7. Calculate Operating Result (صافي الحركة التشغيلية)
  // Sales - Operating Expenses - Recognized Waste
  const operatingResult = totalSales - operatingExpenses - wasteCost;

  // 8. Safe Cash Estimation (Opening Cash from shifts + Cash Sales - Cash Outflows)
  const posShiftsConstraints: any[] = [];
  if (!isAllBranches) {
    posShiftsConstraints.push(where('branch_id', '==', branchId));
  }
  const posShiftsSnap = await getDocs(query(collection(db, 'pos_shifts'), ...posShiftsConstraints));
  const rawPosShifts = posShiftsSnap.docs.map((d) => ({ id: d.id, ...(d.data() as any) }));
  
  const periodShifts = rawPosShifts.filter((s) => {
    if (!s.start_time) return false;
    const sDate = new Date(s.start_time);
    return sDate >= start && sDate <= end;
  });
  const openingCash = periodShifts.reduce((sum, s) => sum + Number(s.starting_cash || 0), 0);
  const expectedCash = Math.max(0, openingCash + cashSales - totalCashOutflows);

  // 9. Timeline Data for Trend Charts
  const dailyMap = new Map<string, { sales: number; cashSales: number; cashOutflows: number; operatingExpenses: number }>();

  // Aggregate orders by day
  validOrders.forEach((o) => {
    const dStr = new Date(o.created_at).toLocaleDateString('ar-EG', { month: 'short', day: 'numeric' });
    const cur = dailyMap.get(dStr) || { sales: 0, cashSales: 0, cashOutflows: 0, operatingExpenses: 0 };
    const amount = Number(o.total_amount || o.final_amount || o.total || 0);
    cur.sales += amount;
    const method = String(o.payment_method || '').toLowerCase();
    if (method === 'cash' || method === 'نقدي' || method === 'كاش') {
      cur.cashSales += amount;
    }
    dailyMap.set(dStr, cur);
  });

  // Aggregate expenses by day
  activeExpenses.forEach((e) => {
    const [year, month, day] = e.date.split('-').map(Number);
    const dStr = new Date(year, month - 1, day).toLocaleDateString('ar-EG', { month: 'short', day: 'numeric' });
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
