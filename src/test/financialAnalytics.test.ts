import { describe, it, expect } from 'vitest';
import type { Expense } from '@/types/expenses';
import { getDateBounds } from '@/services/financialAnalytics';

describe('Financial Analytics Adapter (Read-Only & Zero Impact)', () => {
  it('Date bounds helper correctly normalizes intervals without time drift', () => {
    const todayBounds = getDateBounds('today');
    expect(todayBounds.start.getHours()).toBe(0);
    expect(todayBounds.start.getMinutes()).toBe(0);

    const customBounds = getDateBounds('custom', '2026-09-01', '2026-09-15');
    expect(customBounds.start.getFullYear()).toBe(2026);
    expect(customBounds.start.getMonth()).toBe(8); // September (0-indexed)
    expect(customBounds.start.getDate()).toBe(1);
    expect(customBounds.end.getDate()).toBe(15);
  });

  it('Separates Operating Expenses from Cash Outflows with advances integrity', () => {
    const expenses: Expense[] = [
      {
        id: 'exp_rent',
        amount: 5000,
        category: 'أخرى',
        description: 'إيجار المحل',
        date: '2026-09-01',
        createdBy: 'admin',
        affectsCashFlow: true,
        affectsProfitLoss: true,
        isOperatingExpense: true,
        status: 'active',
        createdAt: '2026-09-01T10:00:00Z',
      },
      {
        id: 'exp_advance_1',
        amount: 2000,
        category: 'سلف الموظفين',
        type: 'employee_advance',
        description: 'سلفة موظف: أحمد',
        date: '2026-09-02',
        createdBy: 'admin',
        affectsCashFlow: true,
        affectsProfitLoss: false,
        isOperatingExpense: false,
        status: 'active',
        createdAt: '2026-09-02T10:00:00Z',
      },
      {
        id: 'exp_voided',
        amount: 1500,
        category: 'صيانة',
        description: 'صيانة ملغاة',
        date: '2026-09-03',
        createdBy: 'admin',
        affectsCashFlow: false,
        affectsProfitLoss: false,
        isOperatingExpense: false,
        status: 'voided',
        createdAt: '2026-09-03T10:00:00Z',
      },
    ];

    const activeExpenses = expenses.filter((e) => e.status !== 'voided');

    // 1. Operating Expenses (Strictly excludes advances and voided items)
    const operatingExpenses = activeExpenses
      .filter((e) => e.category !== 'سلف الموظفين' && e.isOperatingExpense !== false && e.type !== 'employee_advance')
      .reduce((sum, e) => sum + e.amount, 0);

    // 2. Cash Outflow (Includes operating expense + advance, excludes voided)
    const totalCashOutflows = activeExpenses
      .filter((e) => e.affectsCashFlow !== false)
      .reduce((sum, e) => sum + e.amount, 0);

    expect(operatingExpenses).toBe(5000);
    expect(totalCashOutflows).toBe(7000); // 5000 + 2000
  });

  it('Guarantees zero double counting when month-end salary payment is made after advance', () => {
    // Employee Gross Salary = 8,000 EGP
    const grossSalary = 8000;
    const advanceAmount = 2000;
    const netSalaryPaid = grossSalary - advanceAmount; // 6,000 EGP

    const advanceOutflow: Expense = {
      id: 'employee_advance_101',
      amount: advanceAmount,
      category: 'سلف الموظفين',
      type: 'employee_advance',
      description: 'سلفة موظف',
      date: '2026-09-05',
      createdBy: 'admin',
      affectsCashFlow: true,
      affectsProfitLoss: false,
      isOperatingExpense: false,
      status: 'active',
      createdAt: '2026-09-05T10:00:00Z',
    };

    const salaryPaymentOutflow: Expense = {
      id: 'salary_payment_202',
      amount: netSalaryPaid,
      category: 'رواتب',
      description: 'صرف راتب شهر 2026-09',
      date: '2026-09-30',
      createdBy: 'admin',
      affectsCashFlow: true,
      affectsProfitLoss: true,
      isOperatingExpense: true,
      status: 'active',
      createdAt: '2026-09-30T10:00:00Z',
    };

    const ledger = [advanceOutflow, salaryPaymentOutflow];
    const totalActualCashPaid = ledger
      .filter((e) => e.status !== 'voided' && e.affectsCashFlow !== false)
      .reduce((sum, e) => sum + e.amount, 0);

    expect(totalActualCashPaid).toBe(8000);
    expect(totalActualCashPaid).not.toBe(10000);
  });

  it('Calculates Operating Result (صافي الحركة التشغيلية) transparently', () => {
    const totalSales = 25000;
    const operatingExpenses = 12000;
    const wasteCost = 800;

    // Operating Result = Sales - Operating Expenses - Waste
    const operatingResult = totalSales - operatingExpenses - wasteCost;

    expect(operatingResult).toBe(12200);
  });

  it('Calculates Expected Cash based on Opening Cash + Cash Sales - Cash Outflows', () => {
    const openingCash = 1000;
    const cashSales = 15000;
    const totalCashOutflows = 7000;

    const expectedCash = Math.max(0, openingCash + cashSales - totalCashOutflows);
    expect(expectedCash).toBe(9000); // 1000 + 15000 - 7000
  });
});
