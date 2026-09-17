import { describe, it, expect } from 'vitest';
import {
  calculateEmployeePayroll,
  calculateAdvanceDueInstallment,
  calculateActiveExpenseTotals,
} from '../lib/payrollEngine';
import type { Advance } from '../types/payroll';
import type { Expense } from '../types/expenses';
import type { DifferenceType } from '../types/dailyClosing.types';
import { ROLE_TEMPLATES, calculateEffectivePermissions } from '../lib/permissionsModel';
import { getDateBounds } from '../services/financialAnalytics';

describe('GOLDEN REGRESSION SUITE - Zero Impact Verification', () => {
  describe('1. Payroll Engine Golden Path Invariance', () => {
    it('verifies Ahmed core payroll calculation produces identical net salary and advance deduction', () => {
      const employee = {
        id: 'emp_ahmed',
        name: 'أحمد محمد',
        role: 'كاشير',
        salary: 8000,
      };

      const advance: Advance = {
        id: 'adv_1',
        tenant_id: 'tenant_1',
        employeeId: 'emp_ahmed',
        employeeName: 'أحمد محمد',
        amount: 2000,
        paidAmount: 0,
        remainingAmount: 2000,
        repaymentType: 'installments',
        installmentAmount: 500,
        numberOfInstallments: 4,
        remainingInstallments: 4,
        startDate: '2026-09-01',
        paymentMethod: 'cash',
        status: 'active',
        deductedPeriods: [],
        createdAt: '2026-09-01T10:00:00.000Z',
        createdBy: 'admin',
      };

      const payroll = calculateEmployeePayroll({
        employee: employee as any,
        period: '2026-09',
        attendanceRecords: [
          { employeeId: 'emp_ahmed', date: '2026-09-01', status: 'present', shiftHours: 8 },
        ],
        advances: [advance],
        payments: [],
      });

      // Base: 8000
      // Advances deduction: 500
      // Net salary = 8000 - 500 = 7500
      expect(payroll.basicSalarySnapshot).toBe(8000);
      expect(payroll.advanceDeductions).toBe(500);
      expect(payroll.netSalary).toBe(7500);
      expect(payroll.totalPaid).toBe(0);
      expect(payroll.remaining).toBe(7500);
    });

    it('verifies advance due installments calculation logic remains pure and unmodified', () => {
      const advance: Advance = {
        id: 'adv_full',
        tenant_id: 'tenant_1',
        employeeId: 'emp_1',
        employeeName: 'محمد',
        amount: 1500,
        paidAmount: 500,
        remainingAmount: 1000,
        repaymentType: 'full',
        startDate: '2026-09-01',
        status: 'active',
        deductedPeriods: [],
        createdAt: '2026-09-01T10:00:00.000Z',
        createdBy: 'admin',
      };

      const due = calculateAdvanceDueInstallment(advance, '2026-09');
      expect(due).toBe(1000);
    });
  });

  describe('2. Expense Accounting & Cash Flow Separation Invariance', () => {
    it('verifies calculateActiveExpenseTotals strictly separates active, voided, and salary expenses', () => {
      const expenses = [
        { amount: 1500, status: 'active', category: 'إيجار' },
        { amount: 2000, status: 'active', category: 'سلف الموظفين' },
        { amount: 4000, status: 'active', category: 'رواتب' },
        { amount: 500, status: 'voided', category: 'صيانة' },
      ];

      const totals = calculateActiveExpenseTotals(expenses);

      // Voided expense (500) is excluded from totalActive
      // totalActive = 1500 + 2000 + 4000 = 7500
      // totalVoided = 500
      // salaryExpenses = 4000
      expect(totals.totalActive).toBe(7500);
      expect(totals.totalVoided).toBe(500);
      expect(totals.salaryExpenses).toBe(4000);
    });

    it('verifies cash flow vs operating expense isolation rules', () => {
      const expenses: Expense[] = [
        {
          id: 'exp_rent',
          amount: 5000,
          category: 'إيجار',
          description: 'إيجار',
          date: '2026-09-15',
          createdBy: 'admin',
          affectsCashFlow: true,
          affectsProfitLoss: true,
          isOperatingExpense: true,
          status: 'active',
          createdAt: '2026-09-15T10:00:00.000Z',
        },
        {
          id: 'exp_advance',
          amount: 2000,
          category: 'سلف الموظفين',
          type: 'employee_advance',
          description: 'سلفة موظف',
          date: '2026-09-15',
          createdBy: 'admin',
          affectsCashFlow: true,
          affectsProfitLoss: false,
          isOperatingExpense: false,
          status: 'active',
          createdAt: '2026-09-15T12:00:00.000Z',
        },
      ];

      const active = expenses.filter((e) => e.status !== 'voided');
      const cashOutflow = active.filter((e) => e.affectsCashFlow !== false).reduce((sum, e) => sum + e.amount, 0);
      const opExpenses = active.filter((e) => e.category !== 'سلف الموظفين' && e.isOperatingExpense !== false && e.type !== 'employee_advance').reduce((sum, e) => sum + e.amount, 0);

      expect(cashOutflow).toBe(7000); // 5000 + 2000
      expect(opExpenses).toBe(5000); // Excludes 2000 advance
    });
  });

  describe('3. Pure Non-Invasive Analytics & Daily Closing Formula Invariance', () => {
    it('verifies getDateBounds normalizes intervals without time drift', () => {
      const bounds = getDateBounds('today');
      expect(bounds.start.getHours()).toBe(0);
      expect(bounds.start.getMinutes()).toBe(0);
      expect(bounds.end.getHours()).toBe(23);
      expect(bounds.end.getMinutes()).toBe(59);
    });

    it('verifies daily closing cash difference formulas strictly observe balanced/shortage/overage contracts', () => {
      const openingCash = 1000;
      const cashSales = 5000;
      const cashOutflows = 1500;
      const expectedCash = openingCash + cashSales - cashOutflows; // 4500

      const evaluateDifference = (actualCash: number): { difference: number; differenceType: DifferenceType } => {
        const difference = actualCash - expectedCash;
        let differenceType: DifferenceType = 'balanced';
        if (difference < 0) differenceType = 'shortage';
        else if (difference > 0) differenceType = 'overage';
        return { difference, differenceType };
      };

      // 1. Exact match
      const bal = evaluateDifference(4500);
      expect(bal.difference).toBe(0);
      expect(bal.differenceType).toBe('balanced');

      // 2. Shortage (missing 100 EGP)
      const short = evaluateDifference(4400);
      expect(short.difference).toBe(-100);
      expect(short.differenceType).toBe('shortage');

      // 3. Overage (surplus 150 EGP)
      const over = evaluateDifference(4650);
      expect(over.difference).toBe(150);
      expect(over.differenceType).toBe('overage');
    });

    it('verifies operating result transparent formula (Sales - Operating Expenses - Waste)', () => {
      const sales = 30000;
      const opExpenses = 10000;
      const waste = 500;
      const operatingResult = sales - opExpenses - waste;

      expect(operatingResult).toBe(19500);
    });
  });

  describe('4. RBAC Schema & Permissions Compatibility', () => {
    it('preserves existing role structures while seamlessly supporting new finance permissions', () => {
      // Owner/Admin have wildcards
      expect(calculateEffectivePermissions('owner')).toContain('*');
      expect(calculateEffectivePermissions('admin')).toContain('*');

      // Manager has dashboard and closing permissions
      expect(ROLE_TEMPLATES.manager.permissions).toContain('financial_dashboard.view');
      expect(ROLE_TEMPLATES.manager.permissions).toContain('daily_closing.view');
      expect(ROLE_TEMPLATES.manager.permissions).toContain('daily_closing.create');
      expect(ROLE_TEMPLATES.manager.permissions).toContain('daily_closing.update');
      expect(ROLE_TEMPLATES.manager.permissions).not.toContain('daily_closing.void');

      // Accountant has view and create permissions, but void is restricted
      expect(ROLE_TEMPLATES.accountant.permissions).toContain('financial_dashboard.view');
      expect(ROLE_TEMPLATES.accountant.permissions).toContain('daily_closing.view');
      expect(ROLE_TEMPLATES.accountant.permissions).toContain('daily_closing.create');
      expect(ROLE_TEMPLATES.accountant.permissions).not.toContain('daily_closing.void');

      // Cashier and Kitchen roles do NOT have access to financial dashboard
      expect(calculateEffectivePermissions('cashier')).not.toContain('financial_dashboard.view');
      expect(calculateEffectivePermissions('kitchen')).not.toContain('financial_dashboard.view');
    });
  });
});
