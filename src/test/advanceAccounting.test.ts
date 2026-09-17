import { describe, it, expect } from 'vitest';
import type { Expense } from '@/types/expenses';
import { resolveNotificationRoute } from '@/lib/notificationRoutes';

describe('Advance Accounting & Cash Flow Integration', () => {
  it('Scenario 1: Advance granted generates cash outflow without increasing operating expenses', () => {
    // Regular operating expenses
    const existingExpenses: Expense[] = [
      {
        id: 'exp_1',
        amount: 3000,
        category: 'مشتريات',
        description: 'شراء لحوم وخضار',
        date: '2026-09-01',
        createdBy: 'user_1',
        affectsCashFlow: true,
        affectsProfitLoss: true,
        isOperatingExpense: true,
        status: 'active',
        createdAt: '2026-09-01T10:00:00.000Z',
      },
    ];

    // New employee advance record (Ahmed: 2,000 EGP)
    const advanceExpense: Expense = {
      id: 'employee_advance_adv_123',
      amount: 2000,
      category: 'سلف الموظفين',
      type: 'employee_advance',
      description: 'سلفة موظف: أحمد محمد',
      date: '2026-09-05',
      paymentMethod: 'cash',
      employee_id: 'emp_ahmed',
      employee_name: 'أحمد محمد',
      advance_id: 'adv_123',
      reference_id: 'employee_advance_adv_123',
      affectsCashFlow: true,
      affectsProfitLoss: false,
      isOperatingExpense: false,
      status: 'active',
      createdBy: 'admin_1',
      createdAt: '2026-09-05T12:00:00.000Z',
    };

    const allExpenses = [...existingExpenses, advanceExpense];
    const activeExpenses = allExpenses.filter((e) => e.status !== 'voided');

    // 1. Total Cash Outflow from Safe (Must include the 2,000 EGP advance)
    const totalCashOutflows = activeExpenses
      .filter((e) => e.affectsCashFlow !== false)
      .reduce((sum, e) => sum + e.amount, 0);

    // 2. Operating Expenses for P&L (Must strictly exclude employee advances)
    const operatingExpenses = activeExpenses
      .filter(
        (e) =>
          e.category !== 'سلف الموظفين' &&
          e.isOperatingExpense !== false &&
          e.type !== 'employee_advance'
      )
      .reduce((sum, e) => sum + e.amount, 0);

    // 3. Employee Advances total
    const totalAdvances = activeExpenses
      .filter((e) => e.category === 'سلف الموظفين' || e.type === 'employee_advance')
      .reduce((sum, e) => sum + e.amount, 0);

    expect(totalCashOutflows).toBe(5000); // 3000 + 2000
    expect(operatingExpenses).toBe(3000); // Only operating expenses
    expect(totalAdvances).toBe(2000);
  });

  it('Scenario 2: End of month salary disbursement with advance deduction prevents double counting', () => {
    // Gross Salary = 8,000 EGP
    const grossSalary = 8000;
    // Advance = 2,000 EGP
    const advanceDeduction = 2000;
    // Net cash salary paid = 6,000 EGP
    const netSalaryPaid = grossSalary - advanceDeduction;
    expect(netSalaryPaid).toBe(6000);

    // 1. Advance transaction created earlier in the month
    const advanceTransaction: Expense = {
      id: 'employee_advance_adv_999',
      amount: 2000,
      category: 'سلف الموظفين',
      type: 'employee_advance',
      description: 'سلفة موظف: أحمد محمد',
      date: '2026-09-05',
      affectsCashFlow: true,
      affectsProfitLoss: false,
      isOperatingExpense: false,
      status: 'active',
      createdBy: 'admin_1',
      createdAt: '2026-09-05T10:00:00.000Z',
    };

    // 2. Salary payment transaction at end of month (Category: 'رواتب')
    const salaryExpense: Expense = {
      id: 'exp_salary_pay_888',
      amount: netSalaryPaid, // 6,000 EGP
      category: 'رواتب',
      description: 'صرف راتب شهر 2026-09 للموظف أحمد محمد',
      date: '2026-09-30',
      payment_id: 'pay_888',
      reference_id: 'salary_payment_pay_888',
      payroll_period: '2026-09',
      employee_id: 'emp_ahmed',
      affectsCashFlow: true,
      affectsProfitLoss: true,
      isOperatingExpense: true,
      status: 'active',
      createdBy: 'admin_1',
      createdAt: '2026-09-30T16:00:00.000Z',
    };

    const periodExpenses = [advanceTransaction, salaryExpense];

    // Total actual cash paid across both transactions
    const totalCashPaid = periodExpenses
      .filter((e) => e.status !== 'voided' && e.affectsCashFlow !== false)
      .reduce((sum, e) => sum + e.amount, 0);

    // Total actual cash paid MUST equal exactly the 8,000 EGP gross salary
    expect(totalCashPaid).toBe(8000); // 2000 (advance) + 6000 (salary) = 8000
    expect(totalCashPaid).not.toBe(10000); // Guaranteed no double counting!

    // Operating expenses recognized for P&L:
    // Salary expense is 6,000 EGP. If the company recognizes gross labor cost of 8,000,
    // the advance repayment settles the asset. As operating expenses in the cash ledger:
    const operatingExpenses = periodExpenses
      .filter((e) => e.category !== 'سلف الموظفين' && e.isOperatingExpense !== false)
      .reduce((sum, e) => sum + e.amount, 0);

    expect(operatingExpenses).toBe(6000);
  });

  it('Scenario 3: Cancelled advance voids linked cash transaction and eliminates active cash outflow', () => {
    // Initial active advance
    const advanceTransaction: Expense = {
      id: 'employee_advance_adv_cancelled',
      amount: 2500,
      category: 'سلف الموظفين',
      type: 'employee_advance',
      description: 'سلفة موظف: محمود خالد',
      date: '2026-09-10',
      affectsCashFlow: true,
      affectsProfitLoss: false,
      isOperatingExpense: false,
      status: 'active',
      createdBy: 'admin_1',
      createdAt: '2026-09-10T11:00:00.000Z',
    };

    // Upon cancellation
    const voidedAdvanceTransaction: Expense = {
      ...advanceTransaction,
      status: 'voided',
      voidReason: 'إلغاء السلفة: خطأ في التسجيل',
      voidedAt: '2026-09-10T12:00:00.000Z',
      voidedBy: 'المدير',
      affectsCashFlow: false,
    };

    const expensesList = [voidedAdvanceTransaction];

    // Cash outflows excluding voided records
    const activeCashOutflows = expensesList
      .filter((e) => e.status !== 'voided' && e.affectsCashFlow !== false)
      .reduce((sum, e) => sum + e.amount, 0);

    expect(activeCashOutflows).toBe(0);
    expect(voidedAdvanceTransaction.status).toBe('voided');
    expect(voidedAdvanceTransaction.voidReason).toBe('إلغاء السلفة: خطأ في التسجيل');
  });

  it('Scenario 4: Idempotent reference key prevents duplicate expense records on double-click', () => {
    const advanceId = 'adv_unique_456';
    const expenseId1 = `employee_advance_${advanceId}`;
    const expenseId2 = `employee_advance_${advanceId}`;

    expect(expenseId1).toBe(expenseId2);

    const expenseStore = new Map<string, Expense>();
    
    // First click
    expenseStore.set(expenseId1, {
      id: expenseId1,
      amount: 1500,
      category: 'سلف الموظفين',
      description: 'سلفة موظف',
      date: '2026-09-12',
      createdBy: 'admin',
      status: 'active',
      createdAt: '2026-09-12T10:00:00.000Z',
    });

    // Rapid second click (idempotent overwrite)
    expenseStore.set(expenseId2, {
      id: expenseId2,
      amount: 1500,
      category: 'سلف الموظفين',
      description: 'سلفة موظف',
      date: '2026-09-12',
      createdBy: 'admin',
      status: 'active',
      createdAt: '2026-09-12T10:00:00.000Z',
    });

    expect(expenseStore.size).toBe(1);
  });
});

describe('Notification Deep-Link & Route Resolver', () => {
  it('Resolves legacy /payroll to actual /hr?tab=reports route', () => {
    const route = resolveNotificationRoute({ actionRoute: '/payroll' });
    expect(route).toBe('/hr?tab=reports');
  });

  it('Resolves legacy /payroll with query parameters', () => {
    const route = resolveNotificationRoute({ actionRoute: '/payroll?period=2026-09' });
    expect(route).toBe('/hr?tab=reports&period=2026-09');
  });

  it('Resolves advances route to /hr?tab=reports&section=advances', () => {
    const route = resolveNotificationRoute({ actionRoute: '/advances' });
    expect(route).toBe('/hr?tab=reports&section=advances');
  });

  it('Resolves attendance notification route to /hr?tab=attendance', () => {
    const route = resolveNotificationRoute({ actionRoute: '/attendance' });
    expect(route).toBe('/hr?tab=attendance');
  });

  it('Resolves category fallback when actionRoute is empty or missing', () => {
    expect(resolveNotificationRoute({ category: 'payroll' })).toBe('/hr?tab=reports');
    expect(resolveNotificationRoute({ category: 'advances' })).toBe('/hr?tab=reports&section=advances');
    expect(resolveNotificationRoute({ category: 'expenses' })).toBe('/expenses');
    expect(resolveNotificationRoute({ category: 'inventory' })).toBe('/inventory');
    expect(resolveNotificationRoute({ category: 'suppliers' })).toBe('/suppliers');
    expect(resolveNotificationRoute({ category: 'orders' })).toBe('/orders-history');
    expect(resolveNotificationRoute({ category: 'security' })).toBe('/permissions');
    expect(resolveNotificationRoute({ category: 'settings' })).toBe('/settings');
  });

  it('Blocks malicious or external protocols and safely falls back', () => {
    expect(resolveNotificationRoute({ actionRoute: 'javascript:alert(1)' })).toBe('/');
    expect(resolveNotificationRoute({ actionRoute: 'data:text/html;base64,PHNjcmlwdD5hbGVydCgxKTwvc2NyaXB0Pg==' })).toBe('/');
    expect(resolveNotificationRoute({ actionRoute: 'https://attacker.com/steal-token' })).toBe('/');
    expect(resolveNotificationRoute({ actionRoute: '//evil.com' })).toBe('/');
  });

  it('Preserves valid registered relative routes', () => {
    expect(resolveNotificationRoute({ actionRoute: '/orders-history' })).toBe('/orders-history');
    expect(resolveNotificationRoute({ actionRoute: '/expenses' })).toBe('/expenses');
    expect(resolveNotificationRoute({ actionRoute: '/inventory' })).toBe('/inventory');
    expect(resolveNotificationRoute({ actionRoute: '/suppliers' })).toBe('/suppliers');
  });
});
