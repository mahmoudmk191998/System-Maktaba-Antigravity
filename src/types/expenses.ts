export type ExpenseCategory = 'رواتب' | 'مشتريات' | 'صيانة' | 'أخرى' | 'سلف الموظفين';

export interface Expense {
  id: string;
  amount: number;
  category: ExpenseCategory;
  description: string;
  date: string; // YYYY-MM-DD
  createdBy: string; // User ID
  tenantId?: string;
  branchId?: string; // Tenant/Branch ID
  shift_id?: string; // Connected Shift ID
  payment_id?: string; // Reference to salary_payment ID
  reference_id?: string; // e.g. salary_payment_{paymentId} or employee_advance_{advanceId}
  payroll_period?: string; // e.g. '2026-09'
  employee_id?: string; // Connected employee ID
  employee_name?: string; // Employee name for advances or salaries
  advance_id?: string; // Reference to advance ID
  type?: 'expense' | 'employee_advance';
  paymentMethod?: string;
  affectsCashFlow?: boolean; // Default true
  affectsProfitLoss?: boolean; // false for employee_advance, true for normal expenses
  isOperatingExpense?: boolean; // false for employee_advance, true for normal operating expenses
  status?: 'active' | 'voided';
  voidReason?: string;
  voidedAt?: string;
  voidedBy?: string;
  createdAt: string; // ISO 8601
  updatedAt?: string;
}

