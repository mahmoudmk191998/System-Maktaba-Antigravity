export type PayrollPeriod = string; // Format: 'YYYY-MM' (e.g. '2026-09')

export type PayrollStatus = 'unpaid' | 'partial' | 'paid';

export type PaymentMethod = 'cash' | 'bank_transfer' | 'vodafone_cash' | 'instapay' | 'other';

export type AdvanceStatus = 'active' | 'partially_paid' | 'fully_paid' | 'cancelled';

export type AdvanceRepaymentType = 'next_salary' | 'installments';

export interface AttendanceSummary {
  attendedDays: number;
  absentDays: number;
  lateCount: number;
  totalLateMinutes: number;
  earlyLeaveMinutes: number;
  totalHours: number;
  deductionReason: string;
  leaveDays?: number;
  unpaidLeaveDays?: number;
}

export interface PayrollRecord {
  id: string;
  tenant_id: string;
  branch_id?: string;
  employeeId: string;
  employeeName: string;
  employeeRole: string;
  period: PayrollPeriod;
  year: number;
  month: number;
  basicSalarySnapshot: number;
  dailyRateSnapshot: number;
  hourlyRateSnapshot: number;
  allowances: number;
  overtime: number;
  bonuses: number;
  grossSalary: number;
  attendanceDeductions: number;
  attendanceSummary: AttendanceSummary;
  manualDeductions: number;
  manualDeductionsReason?: string;
  advanceDeductions: number;
  netSalary: number;
  totalPaid: number;
  remaining: number;
  status: PayrollStatus;
  createdAt: string;
  updatedAt: string;
  createdBy?: string;
}

export interface SalaryPayment {
  id: string;
  tenant_id: string;
  branch_id?: string;
  payrollId: string;
  employeeId: string;
  employeeName: string;
  payrollPeriod: PayrollPeriod;
  amount: number;
  paymentMethod: PaymentMethod;
  referenceNumber?: string;
  notes?: string;
  idempotencyKey: string;
  expenseId?: string;
  status: 'completed' | 'voided';
  voidReason?: string;
  voidedAt?: string;
  voidedBy?: string;
  createdAt: string;
  createdBy: string;
}

export interface Advance {
  id: string;
  tenant_id: string;
  branch_id?: string;
  employeeId: string;
  employeeName: string;
  amount: number;
  paidAmount: number;
  remainingAmount: number;
  repaymentType: AdvanceRepaymentType;
  installmentAmount: number;
  numberOfInstallments: number;
  remainingInstallments: number;
  startDate: string; // YYYY-MM-DD
  paymentMethod: PaymentMethod;
  status: AdvanceStatus;
  deductedPeriods: PayrollPeriod[]; // e.g. ['2026-09', '2026-10'] - prevents duplicate installment deduction
  notes?: string;
  expenseId?: string;
  expense_id?: string;
  cancelReason?: string;
  cancelledAt?: string;
  cancelledBy?: string;
  createdAt: string;
  createdBy: string;
  updatedAt?: string;
}

export interface AdvanceInstallment {
  id: string;
  tenant_id: string;
  advanceId: string;
  employeeId: string;
  payrollId: string;
  period: PayrollPeriod;
  amount: number;
  status: 'paid' | 'voided' | 'cancelled';
  voidReason?: string;
  voidedAt?: string;
  voidedBy?: string;
  paidAt: string;
  createdAt: string;
}

export type FinancialAuditAction =
  | 'SALARY_PAYMENT_VOIDED'
  | 'ADVANCE_CANCELLED'
  | 'ADVANCE_DELETED'
  | 'ADVANCE_INSTALLMENT_REVERSED'
  | 'SALARY_PAID'
  | 'ADVANCE_CREATED'
  | 'EMPLOYEE_ADVANCE_CREATED'
  | 'EMPLOYEE_ADVANCE_CANCELLED';

export interface FinancialAuditLog {
  action: FinancialAuditAction;
  entityType: 'salary_payment' | 'advance' | 'advance_installment';
  entityId: string;
  employeeId: string;
  employeeName?: string;
  amount: number;
  reason: string;
  performedBy: string;
  performedAt: string;
  previousStatus: string;
  newStatus: string;
  tenant_id: string;
  branch_id?: string;
  details?: string;
}

export interface PayrollKPIs {
  totalPayroll: number;
  totalPaid: number;
  totalRemaining: number;
  activeAdvancesTotal: number;
  employeesCount: number;
}
