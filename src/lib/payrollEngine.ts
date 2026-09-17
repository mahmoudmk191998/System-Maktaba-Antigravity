import type {
  PayrollRecord,
  PayrollPeriod,
  PayrollStatus,
  Advance,
  AdvanceInstallment,
  SalaryPayment,
  AttendanceSummary,
} from '@/types/payroll';
import type { EmployeeLeave } from '@/types/leave';

export interface EmployeeData {
  id: string;
  name: string;
  role?: string;
  department?: string;
  salary?: number | string;
  employee_type?: string;
  status?: string;
}

export interface AttendanceRecordData {
  id?: string;
  employeeId?: string;
  employee_id?: string;
  date: string; // YYYY-MM-DD
  status: string; // 'present' | 'late' | 'early_leave' | 'absent' | 'on_leave'
  lateMinutes?: number;
  hours?: number;
  workedMinutes?: number;
  checkIn?: string;
  checkOut?: string;
}

export interface PayrollCalculationOptions {
  employee: EmployeeData;
  period: PayrollPeriod; // 'YYYY-MM'
  attendanceRecords: AttendanceRecordData[];
  advances: Advance[];
  payments: SalaryPayment[];
  existingRecord?: Partial<PayrollRecord> | null;
  hrSettings?: {
    late_deduction_enabled?: boolean;
    overtime_enabled?: boolean;
  };
  manualAdditions?: {
    allowances?: number;
    bonuses?: number;
    overtime?: number;
  };
  manualDeductions?: {
    amount?: number;
    reason?: string;
  };
  approvedLeaves?: EmployeeLeave[];
}

/**
 * Deterministically calculates payroll for a given employee and period.
 * Protects historical data by prioritizing basicSalarySnapshot when available.
 */
export function calculateEmployeePayroll(options: PayrollCalculationOptions): PayrollRecord {
  const {
    employee,
    period,
    attendanceRecords,
    advances,
    payments,
    existingRecord,
    hrSettings,
    manualAdditions,
    manualDeductions,
  } = options;

  const [yearStr, monthStr] = period.split('-');
  const year = parseInt(yearStr, 10) || new Date().getFullYear();
  const month = parseInt(monthStr, 10) || new Date().getMonth() + 1;

  // 1. Basic Salary Snapshot (Preserve historical snapshot if it already exists!)
  const baseSalary = existingRecord?.basicSalarySnapshot !== undefined
    ? Number(existingRecord.basicSalarySnapshot)
    : Math.max(0, Number(employee.salary) || 0);

  const dailyRate = baseSalary > 0 ? baseSalary / 30 : 0;
  const hourlyRate = dailyRate / 8;

  // 2. Attendance & Approved Leaves Metrics for the period
  const empAttendance = attendanceRecords.filter((a) => {
    const empId = a.employeeId || a.employee_id;
    return empId === employee.id && a.date && a.date.startsWith(period);
  });

  const empApprovedLeaves = (options.approvedLeaves || []).filter((l) => {
    return l.employee_id === employee.id && l.status === 'approved';
  });

  // Collect specific dates covered by approved leaves in this period
  const approvedLeaveDates = new Set<string>();
  const approvedUnpaidDates = new Set<string>();

  empApprovedLeaves.forEach((l) => {
    if (!l.start_date || !l.end_date) return;
    const start = new Date(l.start_date);
    const end = new Date(l.end_date);
    if (isNaN(start.getTime()) || isNaN(end.getTime()) || start > end) return;
    let curr = new Date(start);
    while (curr <= end) {
      const dStr = curr.toISOString().split('T')[0];
      if (dStr.startsWith(period)) {
        approvedLeaveDates.add(dStr);
        if (!l.is_paid) {
          approvedUnpaidDates.add(dStr);
        }
      }
      curr.setDate(curr.getDate() + 1);
    }
  });

  const attendedDays = empAttendance.filter(
    (a) => a.status === 'present' || a.status === 'late' || a.status === 'early_leave'
  ).length;

  // Crucial: Absent days should NOT count days that have an approved leave!
  const absentDays = empAttendance.filter(
    (a) => a.status === 'absent' && !approvedLeaveDates.has(a.date)
  ).length;

  const unpaidLeaveDays = approvedUnpaidDates.size;
  const leaveDays = approvedLeaveDates.size;

  const lateCount = empAttendance.filter(
    (a) => a.status === 'late' || (Number(a.lateMinutes) || 0) > 0
  ).length;

  const totalLateMinutes = empAttendance.reduce(
    (sum, a) => sum + (Number(a.lateMinutes) || 0),
    0
  );

  const totalHours = empAttendance.reduce(
    (sum, a) => sum + (Number(a.hours) || 0),
    0
  );

  // Calculate early leave minutes if present
  const earlyLeaveMinutes = empAttendance.reduce((sum, a) => {
    if (a.status === 'early_leave' && (a as any).earlyMinutes) {
      return sum + Number((a as any).earlyMinutes);
    }
    return sum;
  }, 0);

  // 3. Attendance Deductions
  let lateDeductions = 0;
  if (hrSettings?.late_deduction_enabled && totalLateMinutes > 0) {
    lateDeductions = Math.round((totalLateMinutes / 60) * hourlyRate);
  }

  // Absence deduction (dailyRate per unauthorized absent day)
  let absenceDeductions = 0;
  if (absentDays > 0) {
    absenceDeductions = Math.round(absentDays * dailyRate);
  }

  // Approved Unpaid leave deduction (dailyRate per approved unpaid leave day)
  let unpaidLeaveDeductions = 0;
  if (unpaidLeaveDays > 0) {
    unpaidLeaveDeductions = Math.round(unpaidLeaveDays * dailyRate);
  }

  let attendanceDeductions = lateDeductions + absenceDeductions + unpaidLeaveDeductions;

  // Build human-readable breakdown explanation
  const deductionParts: string[] = [];
  if (lateDeductions > 0) {
    deductionParts.push(`تأخير: ${lateDeductions} ج.م (${totalLateMinutes} دقيقة)`);
  }
  if (absenceDeductions > 0) {
    deductionParts.push(`غياب: ${absenceDeductions} ج.م (${absentDays} يوم)`);
  }
  if (unpaidLeaveDeductions > 0) {
    deductionParts.push(`إجازة بدون مرتب: ${unpaidLeaveDeductions} ج.م (${unpaidLeaveDays} يوم)`);
  }
  const deductionReason = deductionParts.length > 0
    ? deductionParts.join(' | ')
    : 'لا توجد خصومات حضور';

  let attendanceSummary: AttendanceSummary = {
    attendedDays,
    absentDays,
    lateCount,
    totalLateMinutes,
    earlyLeaveMinutes,
    totalHours: Math.round(totalHours * 10) / 10,
    deductionReason,
    leaveDays,
    unpaidLeaveDays,
  };

  // If historical snapshot is finalized as paid, strictly preserve historical attendance deductions
  if (existingRecord?.status === 'paid' && existingRecord.attendanceDeductions !== undefined) {
    attendanceDeductions = existingRecord.attendanceDeductions;
    if (existingRecord.attendanceSummary) {
      attendanceSummary = existingRecord.attendanceSummary as AttendanceSummary;
    }
  }

  // 4. Overtime & Allowances
  let overtime = 0;
  if (hrSettings?.overtime_enabled && totalHours > attendedDays * 8) {
    const overtimeHours = totalHours - attendedDays * 8;
    overtime = Math.round(overtimeHours * hourlyRate * 1.5);
  }
  if (manualAdditions?.overtime !== undefined) {
    overtime = Number(manualAdditions.overtime) || 0;
  } else if (existingRecord?.overtime !== undefined && existingRecord.overtime > 0) {
    overtime = Number(existingRecord.overtime);
  }

  const bonuses = manualAdditions?.bonuses !== undefined
    ? Number(manualAdditions.bonuses)
    : Number(existingRecord?.bonuses || 0);

  const allowances = manualAdditions?.allowances !== undefined
    ? Number(manualAdditions.allowances)
    : Number(existingRecord?.allowances || 0);

  const grossSalary = Math.round(baseSalary + overtime + bonuses + allowances);

  // 5. Advances Deductions (Strict idempotency checking!)
  const empAdvances = advances.filter(
    (adv) => adv.employeeId === employee.id && adv.status !== 'cancelled'
  );

  let advanceDeductions = 0;
  for (const adv of empAdvances) {
    // If the advance has already been deducted in this period:
    if (adv.deductedPeriods && adv.deductedPeriods.includes(period)) {
      // Use the installment amount that was previously locked for this period
      const lockedAmount = adv.repaymentType === 'next_salary'
        ? adv.amount
        : Math.min(adv.amount, adv.installmentAmount || adv.amount);
      advanceDeductions += lockedAmount;
    } else if (adv.remainingAmount > 0) {
      // Calculate installment for this period
      if (adv.repaymentType === 'next_salary') {
        advanceDeductions += adv.remainingAmount;
      } else {
        const inst = Math.min(adv.remainingAmount, adv.installmentAmount || adv.remainingAmount);
        advanceDeductions += inst;
      }
    }
  }

  // 6. Manual Deductions
  const manualDeductionsAmount = manualDeductions?.amount !== undefined
    ? Number(manualDeductions.amount)
    : Number(existingRecord?.manualDeductions || 0);

  const manualDeductionsReason = manualDeductions?.reason !== undefined
    ? manualDeductions.reason
    : existingRecord?.manualDeductionsReason || '';

  // 7. Net Salary
  const netSalary = Math.max(
    0,
    Math.round(grossSalary - attendanceDeductions - manualDeductionsAmount - advanceDeductions)
  );

  // 8. Total Paid from Completed Salary Payments
  const empPayments = payments.filter(
    (p) =>
      p.employeeId === employee.id &&
      p.payrollPeriod === period &&
      p.status === 'completed'
  );

  const totalPaid = empPayments.length > 0
    ? empPayments.reduce((sum, p) => sum + Number(p.amount || 0), 0)
    : (existingRecord?.totalPaid !== undefined ? Number(existingRecord.totalPaid) : 0);
  const remaining = Math.max(0, netSalary - totalPaid);

  let status: PayrollStatus = 'unpaid';
  if (totalPaid >= netSalary && netSalary > 0) {
    status = 'paid';
  } else if (totalPaid > 0) {
    status = 'partial';
  } else if (netSalary === 0 && (grossSalary > 0 || baseSalary > 0)) {
    // If net salary was completely offset by deductions/advances
    status = 'paid';
  }

  const recordId = existingRecord?.id || `payroll_${employee.id}_${period.replace('-', '_')}`;

  return {
    id: recordId,
    tenant_id: existingRecord?.tenant_id || '',
    branch_id: existingRecord?.branch_id || '',
    employeeId: employee.id,
    employeeName: employee.name,
    employeeRole: employee.role || '',
    period,
    year,
    month,
    basicSalarySnapshot: baseSalary,
    dailyRateSnapshot: Math.round(dailyRate * 100) / 100,
    hourlyRateSnapshot: Math.round(hourlyRate * 100) / 100,
    allowances,
    overtime,
    bonuses,
    grossSalary,
    attendanceDeductions,
    attendanceSummary,
    manualDeductions: manualDeductionsAmount,
    manualDeductionsReason: manualDeductionsReason || '',
    advanceDeductions,
    netSalary,
    totalPaid,
    remaining,
    status,
    createdAt: existingRecord?.createdAt || new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    createdBy: existingRecord?.createdBy || '',
  };
}

/**
 * Calculates due installment amount for an advance for a given period.
 * Returns 0 if already deducted for this period or if fully paid/cancelled.
 */
export function calculateAdvanceDueInstallment(advance: Advance, period: PayrollPeriod): number {
  if (advance.status === 'cancelled' || advance.status === 'fully_paid') {
    return 0;
  }
  if (advance.remainingAmount <= 0) {
    return 0;
  }
  if (advance.deductedPeriods && advance.deductedPeriods.includes(period)) {
    return 0; // Already deducted for this period!
  }

  if (advance.repaymentType === 'next_salary') {
    return advance.remainingAmount;
  }

  return Math.min(advance.remainingAmount, advance.installmentAmount || advance.remainingAmount);
}

/**
 * Simulates or executes advancing deduction state transition
 */
export function applyAdvanceDeduction(advance: Advance, period: PayrollPeriod, installmentAmount: number): Advance {
  if (advance.deductedPeriods && advance.deductedPeriods.includes(period)) {
    return advance; // Idempotent
  }

  const paidAmount = (advance.paidAmount || 0) + installmentAmount;
  const remainingAmount = Math.max(0, (advance.amount || 0) - paidAmount);
  const remainingInstallments = Math.max(0, (advance.remainingInstallments || 1) - 1);

  const status = remainingAmount <= 0 ? 'fully_paid' : 'partially_paid';

  return {
    ...advance,
    paidAmount,
    remainingAmount,
    remainingInstallments,
    status,
    deductedPeriods: [...(advance.deductedPeriods || []), period],
  };
}

/**
 * Pure function: Reverses a salary payment and accurately updates the PayrollRecord totals.
 * Immutably preserves the payment history with status = 'voided'.
 */
export function reverseSalaryPaymentInPayroll(options: {
  payroll: PayrollRecord;
  payment: SalaryPayment;
  reason: string;
  performedBy: string;
}): { updatedPayroll: PayrollRecord; updatedPayment: SalaryPayment } {
  const { payroll, payment, reason, performedBy } = options;

  if (payment.status === 'voided') {
    throw new Error('الدفعة ملغاة مسبقاً (Already Voided)');
  }
  if (!reason || !reason.trim()) {
    throw new Error('سبب الإلغاء إجباري');
  }

  const nowIso = new Date().toISOString();

  const updatedPayment: SalaryPayment = {
    ...payment,
    status: 'voided',
    voidReason: reason.trim(),
    voidedAt: nowIso,
    voidedBy: performedBy,
  };

  const newTotalPaid = Math.max(0, (payroll.totalPaid || 0) - payment.amount);
  const newRemaining = Math.max(0, payroll.netSalary - newTotalPaid);

  let newStatus: PayrollStatus = 'unpaid';
  if (newTotalPaid >= payroll.netSalary && payroll.netSalary > 0) {
    newStatus = 'paid';
  } else if (newTotalPaid > 0) {
    newStatus = 'partial';
  } else {
    newStatus = 'unpaid';
  }

  const updatedPayroll: PayrollRecord = {
    ...payroll,
    totalPaid: newTotalPaid,
    remaining: newRemaining,
    status: newStatus,
    updatedAt: nowIso,
  };

  return { updatedPayroll, updatedPayment };
}

/**
 * Pure function: Cancels an advance record.
 * If uncollected (paidAmount === 0): marks cancelled and zero out remaining amount.
 * If partially paid: marks cancelled, cancels future installments, retains historical paid installments.
 */
export function cancelAdvanceRecord(options: {
  advance: Advance;
  reason: string;
  performedBy: string;
}): { updatedAdvance: Advance; wasPartiallyPaid: boolean } {
  const { advance, reason, performedBy } = options;

  if (advance.status === 'cancelled') {
    throw new Error('السلفة ملغاة مسبقاً (Already Cancelled)');
  }
  if (!reason || !reason.trim()) {
    throw new Error('سبب الإلغاء إجباري');
  }

  const wasPartiallyPaid = (advance.paidAmount || 0) > 0;
  const nowIso = new Date().toISOString();

  const updatedAdvance: Advance = {
    ...advance,
    status: 'cancelled',
    remainingAmount: 0,
    remainingInstallments: 0,
    cancelReason: reason.trim(),
    cancelledAt: nowIso,
    cancelledBy: performedBy,
    updatedAt: nowIso,
    notes: `${advance.notes || ''} [تم الإلغاء بواسطة ${performedBy}: ${reason.trim()}]`.trim(),
  };

  return { updatedAdvance, wasPartiallyPaid };
}

/**
 * Pure guard: Checks whether an advance installment can be reversed safely.
 * If the linked salary payroll has already been paid out, reversal is blocked
 * until the salary payment itself is reversed first.
 */
export function canReverseAdvanceInstallment(
  installment: AdvanceInstallment,
  payroll?: PayrollRecord | null
): { allowed: boolean; reason?: string } {
  if (installment.status === 'voided') {
    return { allowed: false, reason: 'القسط ملغي مسبقاً' };
  }

  if (payroll && (payroll.totalPaid || 0) > 0) {
    return {
      allowed: false,
      reason: 'هذا القسط مرتبط بمرتب تم دفعه بالفعل. يجب أولاً عكس/تعديل دفعة المرتب.',
    };
  }

  return { allowed: true };
}

/**
 * Pure function: Reverses an advance installment, restoring balance to both Advance and Payroll.
 */
export function reverseAdvanceInstallment(options: {
  installment: AdvanceInstallment;
  advance: Advance;
  payroll: PayrollRecord;
  reason: string;
  performedBy: string;
}): {
  updatedInstallment: AdvanceInstallment;
  updatedAdvance: Advance;
  updatedPayroll: PayrollRecord;
} {
  const { installment, advance, payroll, reason, performedBy } = options;

  const check = canReverseAdvanceInstallment(installment, payroll);
  if (!check.allowed) {
    throw new Error(check.reason || 'لا يمكن عكس هذا القسط');
  }

  if (!reason || !reason.trim()) {
    throw new Error('سبب الإلغاء إجباري');
  }

  const nowIso = new Date().toISOString();

  // 1. Update Installment
  const updatedInstallment: AdvanceInstallment = {
    ...installment,
    status: 'voided',
    voidReason: reason.trim(),
    voidedAt: nowIso,
    voidedBy: performedBy,
  };

  // 2. Restore Advance
  const restoredPaidAmount = Math.max(0, (advance.paidAmount || 0) - installment.amount);
  const restoredRemainingAmount = Math.min(
    advance.amount,
    (advance.remainingAmount || 0) + installment.amount
  );
  const restoredRemainingInstallments =
    advance.repaymentType === 'installments'
      ? (advance.remainingInstallments || 0) + 1
      : 1;
  const restoredDeductedPeriods = (advance.deductedPeriods || []).filter(
    (p) => p !== installment.period
  );
  const restoredStatus = restoredPaidAmount > 0 ? 'partially_paid' : 'active';

  const updatedAdvance: Advance = {
    ...advance,
    paidAmount: restoredPaidAmount,
    remainingAmount: restoredRemainingAmount,
    remainingInstallments: restoredRemainingInstallments,
    deductedPeriods: restoredDeductedPeriods,
    status: restoredStatus,
    updatedAt: nowIso,
  };

  // 3. Restore Payroll
  const newAdvanceDeductions = Math.max(
    0,
    (payroll.advanceDeductions || 0) - installment.amount
  );
  const newNetSalary = Math.max(
    0,
    payroll.grossSalary -
      payroll.attendanceDeductions -
      payroll.manualDeductions -
      newAdvanceDeductions
  );
  const newRemaining = Math.max(0, newNetSalary - (payroll.totalPaid || 0));

  let newStatus: PayrollStatus = 'unpaid';
  if ((payroll.totalPaid || 0) >= newNetSalary && newNetSalary > 0) {
    newStatus = 'paid';
  } else if ((payroll.totalPaid || 0) > 0) {
    newStatus = 'partial';
  } else {
    newStatus = 'unpaid';
  }

  const updatedPayroll: PayrollRecord = {
    ...payroll,
    advanceDeductions: newAdvanceDeductions,
    netSalary: newNetSalary,
    remaining: newRemaining,
    status: newStatus,
    updatedAt: nowIso,
  };

  return { updatedInstallment, updatedAdvance, updatedPayroll };
}

/**
 * Pure function: Calculates active vs voided expense statistics
 */
export function calculateActiveExpenseTotals(
  expenses: Array<{ amount: number; status?: string; category?: string }>
): {
  totalActive: number;
  totalVoided: number;
  salaryExpenses: number;
} {
  let totalActive = 0;
  let totalVoided = 0;
  let salaryExpenses = 0;

  for (const exp of expenses) {
    const amt = Number(exp.amount) || 0;
    if (exp.status === 'voided') {
      totalVoided += amt;
    } else {
      totalActive += amt;
      if (exp.category === 'رواتب') {
        salaryExpenses += amt;
      }
    }
  }

  return { totalActive, totalVoided, salaryExpenses };
}

/**
 * Pure function: Evaluates whether an advance can be Hard Deleted or if it must be Cancelled.
 * Strict Rule:
 * - If NO financial activity has occurred (paidAmount === 0, no paid installments, no deducted periods linked to paid salaries):
 *   Hard delete is allowed.
 * - If ANY financial activity has occurred:
 *   Hard delete is REJECTED. Cancel/Void must be used instead.
 */
export function canDeleteAdvance(
  advance: Advance,
  installments?: AdvanceInstallment[],
  payments?: SalaryPayment[]
): { allowed: boolean; reason?: string } {
  // 1. Check if any paid amount exists
  if ((advance.paidAmount || 0) > 0) {
    return {
      allowed: false,
      reason: 'لا يمكن حذف هذه السلفة نهائيًا لأنها تحتوي على عمليات مالية سابقة (تم سداد جزء منها). يمكنك إلغاؤها بدلًا من ذلك مع إيقاف الأقساط المستقبلية.',
    };
  }

  // 2. Check if any installment was marked paid
  if (installments && installments.length > 0) {
    const paidInstallment = installments.find(
      (i) => i.advanceId === advance.id && i.status === 'paid' && i.amount > 0
    );
    if (paidInstallment) {
      return {
        allowed: false,
        reason: 'لا يمكن حذف هذه السلفة نهائيًا لوجود أقساط مسددة مرتبطة بها.',
      };
    }
  }

  // 3. Check if deducted in any payroll period that resulted in actual completed salary payments
  if (advance.deductedPeriods && advance.deductedPeriods.length > 0) {
    if (payments && payments.length > 0) {
      const activePaymentsForPeriods = payments.filter(
        (p) =>
          p.employeeId === advance.employeeId &&
          p.status === 'completed' &&
          advance.deductedPeriods.includes(p.payrollPeriod)
      );
      if (activePaymentsForPeriods.length > 0) {
        return {
          allowed: false,
          reason: 'لا يمكن حذف هذه السلفة نهائيًا لأنها خُصمت بالفعل في مسيرات رواتب تم صرفها.',
        };
      }
    }
  }

  return { allowed: true };
}

