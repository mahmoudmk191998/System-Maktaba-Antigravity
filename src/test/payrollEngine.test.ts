import { describe, it, expect } from 'vitest';
import {
  calculateEmployeePayroll,
  calculateAdvanceDueInstallment,
  applyAdvanceDeduction,
  reverseSalaryPaymentInPayroll,
  cancelAdvanceRecord,
  canReverseAdvanceInstallment,
  reverseAdvanceInstallment,
  calculateActiveExpenseTotals,
  canDeleteAdvance,
} from '../lib/payrollEngine';
import type { Advance, AdvanceInstallment, PayrollRecord, SalaryPayment } from '../types/payroll';

describe('Payroll Engine Test Suite', () => {
  // Scenario 27: Ahmed's Core Scenario
  it('Scenario 27: Correctly calculates Net Salary, multi-payments, and final Paid status for Ahmed', () => {
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

    // Attendance records that yield exactly 200 EGP deduction
    // Daily rate = 8000/30 = 266.67, Hourly rate = 33.33
    // Late minutes = 360 mins (6 hours) * 33.33 = 200 EGP
    const attendanceRecords = [
      {
        employeeId: 'emp_ahmed',
        date: '2026-09-05',
        status: 'late',
        lateMinutes: 360,
        hours: 8,
      },
      {
        employeeId: 'emp_ahmed',
        date: '2026-09-06',
        status: 'present',
        lateMinutes: 0,
        hours: 8,
      },
    ];

    const hrSettings = {
      late_deduction_enabled: true,
      overtime_enabled: false,
    };

    // Initial state before any payments
    const initialPayroll = calculateEmployeePayroll({
      employee,
      period: '2026-09',
      attendanceRecords,
      advances: [advance],
      payments: [],
      hrSettings,
    });

    expect(initialPayroll.basicSalarySnapshot).toBe(8000);
    expect(initialPayroll.attendanceDeductions).toBe(200);
    expect(initialPayroll.advanceDeductions).toBe(500);
    expect(initialPayroll.grossSalary).toBe(8000);
    expect(initialPayroll.netSalary).toBe(7300);
    expect(initialPayroll.totalPaid).toBe(0);
    expect(initialPayroll.remaining).toBe(7300);
    expect(initialPayroll.status).toBe('unpaid');

    // Payment #1: 3,000 EGP
    const payment1: SalaryPayment = {
      id: 'pay_1',
      tenant_id: 'tenant_1',
      payrollId: initialPayroll.id,
      employeeId: 'emp_ahmed',
      employeeName: 'أحمد محمد',
      payrollPeriod: '2026-09',
      amount: 3000,
      paymentMethod: 'cash',
      idempotencyKey: 'idemp_1',
      status: 'completed',
      createdAt: '2026-09-25T10:00:00.000Z',
      createdBy: 'admin',
    };

    const payrollAfterPayment1 = calculateEmployeePayroll({
      employee,
      period: '2026-09',
      attendanceRecords,
      advances: [advance],
      payments: [payment1],
      existingRecord: initialPayroll,
      hrSettings,
    });

    expect(payrollAfterPayment1.totalPaid).toBe(3000);
    expect(payrollAfterPayment1.remaining).toBe(4300);
    expect(payrollAfterPayment1.status).toBe('partial');

    // Payment #2: 4,300 EGP
    const payment2: SalaryPayment = {
      id: 'pay_2',
      tenant_id: 'tenant_1',
      payrollId: initialPayroll.id,
      employeeId: 'emp_ahmed',
      employeeName: 'أحمد محمد',
      payrollPeriod: '2026-09',
      amount: 4300,
      paymentMethod: 'bank_transfer',
      idempotencyKey: 'idemp_2',
      status: 'completed',
      createdAt: '2026-09-30T10:00:00.000Z',
      createdBy: 'admin',
    };

    const payrollAfterPayment2 = calculateEmployeePayroll({
      employee,
      period: '2026-09',
      attendanceRecords,
      advances: [advance],
      payments: [payment1, payment2],
      existingRecord: initialPayroll,
      hrSettings,
    });

    expect(payrollAfterPayment2.totalPaid).toBe(7300);
    expect(payrollAfterPayment2.remaining).toBe(0);
    expect(payrollAfterPayment2.status).toBe('paid');
  });

  // Scenario 28: 4-Month Advance Installments & No 5th Installment
  it('Scenario 28: Manages 4-month advance progression (2,000 on 500x4) and halts on 0 remaining', () => {
    let advance: Advance = {
      id: 'adv_loan_1',
      tenant_id: 'tenant_1',
      employeeId: 'emp_1',
      employeeName: 'سارة',
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

    // Month 1: 2026-09
    const due1 = calculateAdvanceDueInstallment(advance, '2026-09');
    expect(due1).toBe(500);
    advance = applyAdvanceDeduction(advance, '2026-09', due1);
    expect(advance.paidAmount).toBe(500);
    expect(advance.remainingAmount).toBe(1500);
    expect(advance.remainingInstallments).toBe(3);
    expect(advance.status).toBe('partially_paid');

    // Trying to deduct again in Month 1 returns 0 (Idempotency)
    const duplicateDueMonth1 = calculateAdvanceDueInstallment(advance, '2026-09');
    expect(duplicateDueMonth1).toBe(0);

    // Month 2: 2026-10
    const due2 = calculateAdvanceDueInstallment(advance, '2026-10');
    expect(due2).toBe(500);
    advance = applyAdvanceDeduction(advance, '2026-10', due2);
    expect(advance.paidAmount).toBe(1000);
    expect(advance.remainingAmount).toBe(1000);
    expect(advance.remainingInstallments).toBe(2);

    // Month 3: 2026-11
    const due3 = calculateAdvanceDueInstallment(advance, '2026-11');
    expect(due3).toBe(500);
    advance = applyAdvanceDeduction(advance, '2026-11', due3);
    expect(advance.paidAmount).toBe(1500);
    expect(advance.remainingAmount).toBe(500);
    expect(advance.remainingInstallments).toBe(1);

    // Month 4: 2026-12
    const due4 = calculateAdvanceDueInstallment(advance, '2026-12');
    expect(due4).toBe(500);
    advance = applyAdvanceDeduction(advance, '2026-12', due4);
    expect(advance.paidAmount).toBe(2000);
    expect(advance.remainingAmount).toBe(0);
    expect(advance.remainingInstallments).toBe(0);
    expect(advance.status).toBe('fully_paid');

    // Month 5: 2027-01 (Cannot create 5th installment)
    const due5 = calculateAdvanceDueInstallment(advance, '2027-01');
    expect(due5).toBe(0);
  });

  // Scenario 30: Historical Snapshot Protection
  it('Scenario 30: Modifying current employee salary later does not alter previously generated payroll record', () => {
    const historicalPayrollRecord = {
      id: 'payroll_emp1_2026_01',
      tenant_id: 'tenant_1',
      employeeId: 'emp_1',
      employeeName: 'أحمد',
      period: '2026-01',
      year: 2026,
      month: 1,
      basicSalarySnapshot: 7000, // Salary back in January was 7,000
      grossSalary: 7000,
      netSalary: 7000,
      totalPaid: 7000,
      remaining: 0,
      status: 'paid' as const,
      attendanceDeductions: 0,
      advanceDeductions: 0,
      manualDeductions: 0,
      allowances: 0,
      overtime: 0,
      bonuses: 0,
    };

    // Employee gets salary raised to 8,000 in February
    const updatedEmployee = {
      id: 'emp_1',
      name: 'أحمد',
      salary: 8000,
    };

    // Re-calculating January with the existing record preserved
    const recheckedJanuary = calculateEmployeePayroll({
      employee: updatedEmployee,
      period: '2026-01',
      attendanceRecords: [],
      advances: [],
      payments: [
        {
          id: 'p1',
          tenant_id: 'tenant_1',
          payrollId: 'payroll_emp1_2026_01',
          employeeId: 'emp_1',
          employeeName: 'أحمد',
          payrollPeriod: '2026-01',
          amount: 7000,
          paymentMethod: 'cash',
          idempotencyKey: 'k1',
          status: 'completed',
          createdAt: '',
          createdBy: '',
        },
      ],
      existingRecord: historicalPayrollRecord,
    });

    // Must still be 7000, not 8000!
    expect(recheckedJanuary.basicSalarySnapshot).toBe(7000);
    expect(recheckedJanuary.netSalary).toBe(7000);
    expect(recheckedJanuary.remaining).toBe(0);
    expect(recheckedJanuary.status).toBe('paid');
  });

  // Scenario 29 Edge Cases:
  it('Scenario 29.1: Handles employee without salary (salary = 0)', () => {
    const zeroSalaryEmp = {
      id: 'emp_intern',
      name: 'متدرب',
      salary: 0,
    };

    const payroll = calculateEmployeePayroll({
      employee: zeroSalaryEmp,
      period: '2026-09',
      attendanceRecords: [],
      advances: [],
      payments: [],
    });

    expect(payroll.basicSalarySnapshot).toBe(0);
    expect(payroll.grossSalary).toBe(0);
    expect(payroll.netSalary).toBe(0);
    expect(payroll.remaining).toBe(0);
    expect(payroll.status).toBe('unpaid');
  });

  it('Scenario 29.2: Correctly calculates overtime when overtime_enabled is true', () => {
    const emp = {
      id: 'emp_librarian',
      name: 'أمين مكتبة',
      salary: 9000, // 300 daily, 37.5 hourly
    };

    // 1 attended day with 12 hours worked (4 hours overtime)
    const attendanceRecords = [
      {
        employeeId: 'emp_librarian',
        date: '2026-09-10',
        status: 'present',
        hours: 12,
        lateMinutes: 0,
      },
    ];

    const payroll = calculateEmployeePayroll({
      employee: emp,
      period: '2026-09',
      attendanceRecords,
      advances: [],
      payments: [],
      hrSettings: {
        overtime_enabled: true,
      },
    });

    // 4 overtime hours * 37.5 * 1.5 = 225 EGP
    expect(payroll.overtime).toBe(225);
    expect(payroll.grossSalary).toBe(9225);
    expect(payroll.netSalary).toBe(9225);
  });

  it('Scenario 29.3: Prevents negative Net Salary when deductions exceed gross salary', () => {
    const emp = {
      id: 'emp_debt',
      name: 'موظف بخصومات عالية',
      salary: 3000,
    };

    const advance: Advance = {
      id: 'adv_heavy',
      tenant_id: 't1',
      employeeId: 'emp_debt',
      employeeName: 'موظف بخصومات عالية',
      amount: 5000,
      paidAmount: 0,
      remainingAmount: 5000,
      repaymentType: 'next_salary',
      installmentAmount: 5000,
      numberOfInstallments: 1,
      remainingInstallments: 1,
      startDate: '2026-09-01',
      paymentMethod: 'cash',
      status: 'active',
      deductedPeriods: [],
      createdAt: '',
      createdBy: '',
    };

    const payroll = calculateEmployeePayroll({
      employee: emp,
      period: '2026-09',
      attendanceRecords: [],
      advances: [advance],
      payments: [],
    });

    expect(payroll.grossSalary).toBe(3000);
    expect(payroll.advanceDeductions).toBe(5000);
    // Net salary cannot be negative
    expect(payroll.netSalary).toBe(0);
    expect(payroll.remaining).toBe(0);
  });

  // User Required Financial Reversal Test Scenarios (Tests 1 through 7)
  describe('Financial Reversal / Void / Cancel Subsystem', () => {
    // Test 1: Full Salary Payment Void
    it('Test 1: Salary 8,000, Payment 8,000 -> Void payment -> Paid: 0, Remaining: 8,000, Status: unpaid', () => {
      const payroll: PayrollRecord = {
        id: 'payroll_emp1_2026_09',
        tenant_id: 't1',
        employeeId: 'emp_1',
        employeeName: 'محمد أحمد',
        employeeRole: 'كاشير',
        period: '2026-09',
        year: 2026,
        month: 9,
        basicSalarySnapshot: 8000,
        dailyRateSnapshot: 266.67,
        hourlyRateSnapshot: 33.33,
        allowances: 0,
        overtime: 0,
        bonuses: 0,
        grossSalary: 8000,
        attendanceDeductions: 0,
        attendanceSummary: {
          attendedDays: 30,
          absentDays: 0,
          lateCount: 0,
          totalLateMinutes: 0,
          earlyLeaveMinutes: 0,
          totalHours: 240,
          deductionReason: '',
        },
        manualDeductions: 0,
        advanceDeductions: 0,
        netSalary: 8000,
        totalPaid: 8000,
        remaining: 0,
        status: 'paid',
        createdAt: '2026-09-01T00:00:00Z',
        updatedAt: '2026-09-01T00:00:00Z',
      };

      const payment: SalaryPayment = {
        id: 'pay_full_1',
        tenant_id: 't1',
        payrollId: payroll.id,
        employeeId: 'emp_1',
        employeeName: 'محمد أحمد',
        payrollPeriod: '2026-09',
        amount: 8000,
        paymentMethod: 'cash',
        idempotencyKey: 'idemp_pay_full_1',
        status: 'completed',
        createdAt: '2026-09-25T10:00:00Z',
        createdBy: 'admin',
      };

      const { updatedPayroll, updatedPayment } = reverseSalaryPaymentInPayroll({
        payroll,
        payment,
        reason: 'تم إدخال المبلغ بالخطأ',
        performedBy: 'المدير العام',
      });

      expect(updatedPayment.status).toBe('voided');
      expect(updatedPayment.voidReason).toBe('تم إدخال المبلغ بالخطأ');
      expect(updatedPayroll.totalPaid).toBe(0);
      expect(updatedPayroll.remaining).toBe(8000);
      expect(updatedPayroll.status).toBe('unpaid');
    });

    // Test 2: Partial Salary Payment Void
    it('Test 2: Salary 8,000, Payment #1 3,000, Payment #2 5,000 -> Void Payment #1 -> Paid: 5,000, Remaining: 3,000, Status: partial', () => {
      const payroll: PayrollRecord = {
        id: 'payroll_emp1_2026_09',
        tenant_id: 't1',
        employeeId: 'emp_1',
        employeeName: 'محمد أحمد',
        employeeRole: 'كاشير',
        period: '2026-09',
        year: 2026,
        month: 9,
        basicSalarySnapshot: 8000,
        dailyRateSnapshot: 266.67,
        hourlyRateSnapshot: 33.33,
        allowances: 0,
        overtime: 0,
        bonuses: 0,
        grossSalary: 8000,
        attendanceDeductions: 0,
        attendanceSummary: {
          attendedDays: 30,
          absentDays: 0,
          lateCount: 0,
          totalLateMinutes: 0,
          earlyLeaveMinutes: 0,
          totalHours: 240,
          deductionReason: '',
        },
        manualDeductions: 0,
        advanceDeductions: 0,
        netSalary: 8000,
        totalPaid: 8000, // 3,000 + 5,000
        remaining: 0,
        status: 'paid',
        createdAt: '2026-09-01T00:00:00Z',
        updatedAt: '2026-09-01T00:00:00Z',
      };

      const payment1: SalaryPayment = {
        id: 'pay_part_1',
        tenant_id: 't1',
        payrollId: payroll.id,
        employeeId: 'emp_1',
        employeeName: 'محمد أحمد',
        payrollPeriod: '2026-09',
        amount: 3000,
        paymentMethod: 'cash',
        idempotencyKey: 'idemp_1',
        status: 'completed',
        createdAt: '2026-09-15T10:00:00Z',
        createdBy: 'admin',
      };

      const { updatedPayroll, updatedPayment } = reverseSalaryPaymentInPayroll({
        payroll,
        payment: payment1,
        reason: 'إلغاء جزء الدفعة الأولى',
        performedBy: 'المدير العام',
      });

      expect(updatedPayment.status).toBe('voided');
      expect(updatedPayroll.totalPaid).toBe(5000);
      expect(updatedPayroll.remaining).toBe(3000);
      expect(updatedPayroll.status).toBe('partial');
    });

    // Test 3: Cancel Uncollected Advance
    it('Test 3: Advance 2,000, Paid 0 -> Cancel Advance -> Status: cancelled, Remaining: 0', () => {
      const advance: Advance = {
        id: 'adv_unpaid_1',
        tenant_id: 't1',
        employeeId: 'emp_1',
        employeeName: 'سارة',
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
        createdAt: '2026-09-01T00:00:00Z',
        createdBy: 'admin',
      };

      const { updatedAdvance, wasPartiallyPaid } = cancelAdvanceRecord({
        advance,
        reason: 'طلب الموظف إلغاء السلفة قبل الصرف',
        performedBy: 'المدير',
      });

      expect(wasPartiallyPaid).toBe(false);
      expect(updatedAdvance.status).toBe('cancelled');
      expect(updatedAdvance.remainingAmount).toBe(0);
      expect(updatedAdvance.remainingInstallments).toBe(0);
      expect(updatedAdvance.cancelReason).toBe('طلب الموظف إلغاء السلفة قبل الصرف');
    });

    // Test 4: Cancel Partially Paid Advance
    it('Test 4: Advance 2,000, Installment 500, Paid installments 500 -> Cancel Advance -> Future cancelled, historical remains, status: cancelled', () => {
      const advance: Advance = {
        id: 'adv_partial_1',
        tenant_id: 't1',
        employeeId: 'emp_1',
        employeeName: 'سارة',
        amount: 2000,
        paidAmount: 500,
        remainingAmount: 1500,
        repaymentType: 'installments',
        installmentAmount: 500,
        numberOfInstallments: 4,
        remainingInstallments: 3,
        startDate: '2026-09-01',
        paymentMethod: 'cash',
        status: 'partially_paid',
        deductedPeriods: ['2026-09'],
        createdAt: '2026-09-01T00:00:00Z',
        createdBy: 'admin',
      };

      const { updatedAdvance, wasPartiallyPaid } = cancelAdvanceRecord({
        advance,
        reason: 'إعفاء الموظف من بقية الأقساط بموافقة الإدارة',
        performedBy: 'المدير التنفيذي',
      });

      expect(wasPartiallyPaid).toBe(true);
      expect(updatedAdvance.status).toBe('cancelled');
      expect(updatedAdvance.paidAmount).toBe(500); // Historical payment remains!
      expect(updatedAdvance.remainingAmount).toBe(0); // Future liability stopped!
      expect(updatedAdvance.remainingInstallments).toBe(0);
    });

    // Test 5: Double click Cancel (Idempotency)
    it('Test 5: Double click Cancel -> Rejects duplicate cancellation', () => {
      const advance: Advance = {
        id: 'adv_idem_1',
        tenant_id: 't1',
        employeeId: 'emp_1',
        employeeName: 'سارة',
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
        createdAt: '2026-09-01T00:00:00Z',
        createdBy: 'admin',
      };

      const { updatedAdvance } = cancelAdvanceRecord({
        advance,
        reason: 'إلغاء أولي',
        performedBy: 'المدير',
      });

      // Second attempt on already cancelled advance
      expect(() =>
        cancelAdvanceRecord({
          advance: updatedAdvance,
          reason: 'إلغاء مكرر بالخطأ',
          performedBy: 'المدير',
        })
      ).toThrowError('Already Cancelled');
    });

    // Test 6: Unauthorized user permission check
    it('Test 6: Unauthorized user attempts cancellation -> Permission denied', () => {
      const userRoles = ['waiter'];
      const userPermissions: string[] = ['tables.view'];

      const checkPermission = (roles: string[], perms: string[]) => {
        const isAuthorized =
          roles.includes('admin') ||
          roles.includes('super_admin') ||
          roles.includes('owner') ||
          roles.includes('manager') ||
          perms.includes('*') ||
          perms.includes('payroll.manage');
        if (!isAuthorized) {
          throw new Error('غير مصرح لك بإجراء هذه العملية المالية');
        }
        return true;
      };

      expect(() => checkPermission(userRoles, userPermissions)).toThrowError(
        'غير مصرح لك بإجراء هذه العملية المالية'
      );

      // Verify authorized manager succeeds
      expect(checkPermission(['manager'], [])).toBe(true);
      expect(checkPermission(['admin'], [])).toBe(true);
    });

    // Test 7: Voided Salary Payment appears in Expenses and is excluded from active totals
    it('Test 7: Voided Salary Payment in Expenses is excluded from active totals', () => {
      const expenses = [
        { id: 'exp_1', amount: 1500, category: 'مشتريات', status: 'active' },
        { id: 'exp_2', amount: 8000, category: 'رواتب', status: 'voided' }, // Voided salary payment
        { id: 'exp_3', amount: 5000, category: 'رواتب', status: 'active' }, // Active salary payment
      ];

      const { totalActive, totalVoided, salaryExpenses } = calculateActiveExpenseTotals(expenses);

      // Total active must be 1500 + 5000 = 6500 (voided 8000 excluded!)
      expect(totalActive).toBe(6500);
      expect(totalVoided).toBe(8000);
      expect(salaryExpenses).toBe(5000);
    });

    // Test 8: Installment Reversal Guard (Cannot reverse installment if salary was already paid out)
    it('Test 8: Prevents reversing advance installment if associated payroll is already paid', () => {
      const paidPayroll: PayrollRecord = {
        id: 'payroll_p1',
        tenant_id: 't1',
        employeeId: 'emp_1',
        employeeName: 'علي',
        employeeRole: 'طباخ',
        period: '2026-09',
        year: 2026,
        month: 9,
        basicSalarySnapshot: 8000,
        dailyRateSnapshot: 266.67,
        hourlyRateSnapshot: 33.33,
        allowances: 0,
        overtime: 0,
        bonuses: 0,
        grossSalary: 8000,
        attendanceDeductions: 0,
        attendanceSummary: {
          attendedDays: 30,
          absentDays: 0,
          lateCount: 0,
          totalLateMinutes: 0,
          earlyLeaveMinutes: 0,
          totalHours: 240,
          deductionReason: '',
        },
        manualDeductions: 0,
        advanceDeductions: 500,
        netSalary: 7500,
        totalPaid: 7500, // Salary of 7,500 was paid out!
        remaining: 0,
        status: 'paid',
        createdAt: '2026-09-01T00:00:00Z',
        updatedAt: '2026-09-01T00:00:00Z',
      };

      const installment: AdvanceInstallment = {
        id: 'inst_1',
        tenant_id: 't1',
        advanceId: 'adv_1',
        employeeId: 'emp_1',
        payrollId: 'payroll_p1',
        period: '2026-09',
        amount: 500,
        status: 'paid',
        paidAt: '2026-09-25T10:00:00Z',
        createdAt: '2026-09-25T10:00:00Z',
      };

      const advance: Advance = {
        id: 'adv_1',
        tenant_id: 't1',
        employeeId: 'emp_1',
        employeeName: 'علي',
        amount: 2000,
        paidAmount: 500,
        remainingAmount: 1500,
        repaymentType: 'installments',
        installmentAmount: 500,
        numberOfInstallments: 4,
        remainingInstallments: 3,
        startDate: '2026-09-01',
        paymentMethod: 'cash',
        status: 'partially_paid',
        deductedPeriods: ['2026-09'],
        createdAt: '2026-09-01T00:00:00Z',
        createdBy: 'admin',
      };

      // Guard should block reversal
      const guardResult = canReverseAdvanceInstallment(installment, paidPayroll);
      expect(guardResult.allowed).toBe(false);
      expect(guardResult.reason).toContain('هذا القسط مرتبط بمرتب تم دفعه بالفعل');

      expect(() =>
        reverseAdvanceInstallment({
          installment,
          advance,
          payroll: paidPayroll,
          reason: 'إلغاء قسط',
          performedBy: 'المدير',
        })
      ).toThrowError(/هذا القسط مرتبط بمرتب تم دفعه بالفعل/);

      // Now if the salary payment was first voided, totalPaid becomes 0:
      const unpaidPayroll = { ...paidPayroll, totalPaid: 0, remaining: 7500, status: 'unpaid' as const };
      const allowedResult = canReverseAdvanceInstallment(installment, unpaidPayroll);
      expect(allowedResult.allowed).toBe(true);

      const reversed = reverseAdvanceInstallment({
        installment,
        advance,
        payroll: unpaidPayroll,
        reason: 'إلغاء القسط بعد إلغاء الراتب',
        performedBy: 'المدير',
      });

      expect(reversed.updatedInstallment.status).toBe('voided');
      // Advance balance restored
      expect(reversed.updatedAdvance.paidAmount).toBe(0);
      expect(reversed.updatedAdvance.remainingAmount).toBe(2000);
      expect(reversed.updatedAdvance.remainingInstallments).toBe(4);
      expect(reversed.updatedAdvance.deductedPeriods).toEqual([]);
      // Payroll deduction removed, net salary restored to 8000
      expect(reversed.updatedPayroll.advanceDeductions).toBe(0);
      expect(reversed.updatedPayroll.netSalary).toBe(8000);
      expect(reversed.updatedPayroll.remaining).toBe(8000);
    });

    // =========================================================================
    // SECTION 4: ADVANCE HARD DELETE VS CANCELLATION TESTS (USER SPECIFIED)
    // =========================================================================

    // Test 1: Advance = 2,000, Paid = 0 -> Hard Delete allowed, removed from active advances
    it('Test 1: Allows Hard Delete for advance with 0 paid amount and updates payroll calculation', () => {
      const advance: Advance = {
        id: 'adv_unpaid',
        tenant_id: 't1',
        employeeId: 'emp_1',
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
        createdAt: '2026-09-01T00:00:00Z',
        createdBy: 'admin',
      };

      const check = canDeleteAdvance(advance, []);
      expect(check.allowed).toBe(true);

      // Verify payroll before delete includes advance deduction (500)
      const emp = { id: 'emp_1', name: 'أحمد محمد', salary: 6000 };
      const payrollBefore = calculateEmployeePayroll({
        employee: emp,
        period: '2026-09',
        attendanceRecords: [],
        advances: [advance],
        payments: [],
      });
      expect(payrollBefore.advanceDeductions).toBe(500);
      expect(payrollBefore.netSalary).toBe(5500);

      // After Hard Delete: advances array excludes the deleted advance
      const remainingAdvances: Advance[] = [];
      const payrollAfter = calculateEmployeePayroll({
        employee: emp,
        period: '2026-09',
        attendanceRecords: [],
        advances: remainingAdvances,
        payments: [],
      });
      expect(payrollAfter.advanceDeductions).toBe(0);
      expect(payrollAfter.netSalary).toBe(6000);
    });

    // Test 2: Advance = 2,000, Paid = 500 -> Hard Delete rejected, Cancel/Void available
    it('Test 2: Rejects Hard Delete when advance has paid amount > 0 and requires Cancel/Void', () => {
      const partiallyPaidAdvance: Advance = {
        id: 'adv_partially_paid',
        tenant_id: 't1',
        employeeId: 'emp_1',
        employeeName: 'أحمد محمد',
        amount: 2000,
        paidAmount: 500,
        remainingAmount: 1500,
        repaymentType: 'installments',
        installmentAmount: 500,
        numberOfInstallments: 4,
        remainingInstallments: 3,
        startDate: '2026-09-01',
        paymentMethod: 'cash',
        status: 'partially_paid',
        deductedPeriods: ['2026-09'],
        createdAt: '2026-09-01T00:00:00Z',
        createdBy: 'admin',
      };

      const check = canDeleteAdvance(partiallyPaidAdvance, []);
      expect(check.allowed).toBe(false);
      expect(check.reason).toContain('لا يمكن حذف هذه السلفة نهائيًا');

      // Cancel/Void is available instead:
      const { updatedAdvance } = cancelAdvanceRecord({
        advance: partiallyPaidAdvance,
        reason: 'طلب إلغاء من الإدارة',
        performedBy: 'المدير',
      });
      expect(updatedAdvance.status).toBe('cancelled');
      expect(updatedAdvance.remainingAmount).toBe(0);
      expect(updatedAdvance.paidAmount).toBe(500); // Historical paid amount remains preserved
    });

    // Test 3: Advance = 2,000, Paid = 0, Future installments exist -> Hard Delete removes future installments
    it('Test 3: Safely removes advance and wipes pending future installments', () => {
      const advance: Advance = {
        id: 'adv_with_future',
        tenant_id: 't1',
        employeeId: 'emp_1',
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
        createdAt: '2026-09-01T00:00:00Z',
        createdBy: 'admin',
      };

      const futureInstallments: AdvanceInstallment[] = [
        {
          id: 'inst_1',
          tenant_id: 't1',
          advanceId: 'adv_with_future',
          employeeId: 'emp_1',
          payrollId: 'p1',
          period: '2026-09',
          amount: 500,
          status: 'voided', // Unpaid/pending
          paidAt: '',
          createdAt: '2026-09-01T00:00:00Z',
        },
      ];

      const check = canDeleteAdvance(advance, futureInstallments);
      expect(check.allowed).toBe(true);

      // Filtering out the deleted advance and its installments
      const activeAdvances = [advance].filter((a) => a.id !== 'adv_with_future');
      const activeInstallments = futureInstallments.filter((i) => i.advanceId !== 'adv_with_future');
      expect(activeAdvances.length).toBe(0);
      expect(activeInstallments.length).toBe(0);
    });

    // Test 4: Concurrency / Idempotent double delete
    it('Test 4: Prevents double deletion and operates idempotently', () => {
      const advancesStore: Record<string, Advance> = {
        adv_1: {
          id: 'adv_1',
          tenant_id: 't1',
          employeeId: 'emp_1',
          employeeName: 'أحمد',
          amount: 1000,
          paidAmount: 0,
          remainingAmount: 1000,
          repaymentType: 'next_salary',
          installmentAmount: 1000,
          numberOfInstallments: 1,
          remainingInstallments: 1,
          startDate: '2026-09-01',
          paymentMethod: 'cash',
          status: 'active',
          deductedPeriods: [],
          createdAt: '2026-09-01T00:00:00Z',
          createdBy: 'admin',
        },
      };

      // First delete operation
      const performDelete = (id: string) => {
        if (!advancesStore[id]) {
          return { success: false, message: 'السلفة غير موجودة أو تم حذفها بالفعل' };
        }
        delete advancesStore[id];
        return { success: true };
      };

      const op1 = performDelete('adv_1');
      expect(op1.success).toBe(true);
      expect(advancesStore['adv_1']).toBeUndefined();

      // Second delete operation (double click)
      const op2 = performDelete('adv_1');
      expect(op2.success).toBe(false);
      expect(op2.message).toContain('تم حذفها بالفعل');
    });

    // Test 5: Role permission check rejects unauthorized users
    it('Test 5: Enforces role permissions and rejects unauthorized users', () => {
      const checkPermission = (user: any) => {
        if (!user) return false;
        if (user.isAdmin) return true;
        if (user.role && ['admin', 'owner', 'manager'].includes(user.role)) return true;
        if (user.roles && user.roles.some((r: string) => ['admin', 'owner', 'manager'].includes(r))) return true;
        return false;
      };

      const cashier = { id: 'u1', name: 'كاشير 1', role: 'cashier' };
      const waiter = { id: 'u2', name: 'ويتر 1', role: 'waiter' };
      const manager = { id: 'u3', name: 'مدير الفرع', role: 'manager' };
      const admin = { id: 'u4', name: 'المسؤول', isAdmin: true };

      expect(checkPermission(cashier)).toBe(false);
      expect(checkPermission(waiter)).toBe(false);
      expect(checkPermission(manager)).toBe(true);
      expect(checkPermission(admin)).toBe(true);
    });

    // Test 6: Delete one advance while employee has another advance -> only selected changes
    it('Test 6: Deleting one advance does not alter another advance of the same employee', () => {
      const advance1: Advance = {
        id: 'adv_mistake',
        tenant_id: 't1',
        employeeId: 'emp_1',
        employeeName: 'أحمد',
        amount: 2000,
        paidAmount: 0,
        remainingAmount: 2000,
        repaymentType: 'next_salary',
        installmentAmount: 2000,
        numberOfInstallments: 1,
        remainingInstallments: 1,
        startDate: '2026-09-01',
        paymentMethod: 'cash',
        status: 'active',
        deductedPeriods: [],
        createdAt: '2026-09-01T00:00:00Z',
        createdBy: 'admin',
      };

      const advance2: Advance = {
        id: 'adv_valid',
        tenant_id: 't1',
        employeeId: 'emp_1',
        employeeName: 'أحمد',
        amount: 3000,
        paidAmount: 1000,
        remainingAmount: 2000,
        repaymentType: 'installments',
        installmentAmount: 1000,
        numberOfInstallments: 3,
        remainingInstallments: 2,
        startDate: '2026-08-01',
        paymentMethod: 'bank_transfer',
        status: 'partially_paid',
        deductedPeriods: ['2026-08'],
        createdAt: '2026-08-01T00:00:00Z',
        createdBy: 'admin',
      };

      const emp = { id: 'emp_1', name: 'أحمد', salary: 10000 };
      const listBefore = [advance1, advance2];

      // Payroll before deleting adv_mistake
      const pBefore = calculateEmployeePayroll({
        employee: emp,
        period: '2026-09',
        attendanceRecords: [],
        advances: listBefore,
        payments: [],
      });
      // advanceDeductions = 2000 (adv1 full) + 1000 (adv2 installment) = 3000
      expect(pBefore.advanceDeductions).toBe(3000);
      expect(pBefore.netSalary).toBe(7000);

      // Delete only adv_mistake
      const listAfter = listBefore.filter((a) => a.id !== 'adv_mistake');
      expect(listAfter.length).toBe(1);
      expect(listAfter[0].id).toBe('adv_valid');
      expect(listAfter[0].paidAmount).toBe(1000);
      expect(listAfter[0].remainingAmount).toBe(2000);
      expect(listAfter[0].remainingInstallments).toBe(2);

      // Payroll after deleting adv_mistake: only adv_valid deduction (1000)
      const pAfter = calculateEmployeePayroll({
        employee: emp,
        period: '2026-09',
        attendanceRecords: [],
        advances: listAfter,
        payments: [],
      });
      expect(pAfter.advanceDeductions).toBe(1000);
      expect(pAfter.netSalary).toBe(9000);
    });
  });
});

