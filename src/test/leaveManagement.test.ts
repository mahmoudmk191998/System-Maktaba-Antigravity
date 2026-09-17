import { describe, it, expect } from 'vitest';
import {
  calculateLeaveWorkingDays,
  checkDateRangeOverlap,
  calculateEmployeeLeaveBalance,
} from '@/services/leave.service';
import { calculateEmployeePayroll } from '@/lib/payrollEngine';
import { resolveNotificationRoute } from '@/lib/notificationRoutes';
import { calculateEffectivePermissions } from '@/lib/permissionsModel';
import type { EmployeeLeave } from '@/types/leave';
import type { EmployeeData, AttendanceRecordData } from '@/lib/payrollEngine';

describe('Employee Leave Management Integration Suite', () => {
  const dummyEmployee: EmployeeData = {
    id: 'emp_001',
    name: 'أحمد محمود',
    role: 'طاهي رئيسي',
    salary: 6000, // Daily rate = 6000 / 30 = 200 EGP, Hourly = 25 EGP
  };

  describe('1. Working Days Calculation & Shift Off-Days Exclusion', () => {
    it('calculates single-day leave correctly (same start and end date)', () => {
      const res = calculateLeaveWorkingDays('2026-10-05', '2026-10-05');
      expect(res.requestedDays).toBe(1);
      expect(res.workingDaysCount).toBe(1);
      expect(res.offDaysCount).toBe(0);
    });

    it('excludes shift off-days (e.g. Friday) from working days count', () => {
      // 2026-10-01 is Thursday, 2026-10-02 is Friday, 2026-10-03 is Saturday
      // Shift works Saturday through Thursday (Friday is off)
      const shiftWorkingDays = ['السبت', 'الأحد', 'الاثنين', 'الثلاثاء', 'الأربعاء', 'الخميس'];
      const res = calculateLeaveWorkingDays('2026-10-01', '2026-10-03', shiftWorkingDays);

      expect(res.requestedDays).toBe(3);
      expect(res.workingDaysCount).toBe(2); // Thursday and Saturday only
      expect(res.offDaysCount).toBe(1);     // Friday is off
    });

    it('returns zero for invalid date sequences (start > end)', () => {
      const res = calculateLeaveWorkingDays('2026-10-10', '2026-10-05');
      expect(res.requestedDays).toBe(0);
      expect(res.workingDaysCount).toBe(0);
    });
  });

  describe('2. Overlapping Leave Prevention Logic', () => {
    it('detects exact date overlap', () => {
      expect(checkDateRangeOverlap('2026-10-01', '2026-10-05', '2026-10-01', '2026-10-05')).toBe(true);
    });

    it('detects partial overlap (start within existing range)', () => {
      expect(checkDateRangeOverlap('2026-10-04', '2026-10-08', '2026-10-01', '2026-10-05')).toBe(true);
    });

    it('detects subset / superset date overlap', () => {
      expect(checkDateRangeOverlap('2026-10-02', '2026-10-03', '2026-10-01', '2026-10-10')).toBe(true);
    });

    it('returns false for completely disjoint dates', () => {
      expect(checkDateRangeOverlap('2026-10-01', '2026-10-05', '2026-10-06', '2026-10-10')).toBe(false);
      expect(checkDateRangeOverlap('2026-10-15', '2026-10-20', '2026-10-01', '2026-10-05')).toBe(false);
    });
  });

  describe('3. Leave Balance Calculation', () => {
    it('correctly tracks used paid days and does not deplete annual balance with unpaid leave', () => {
      const dummyLeaves: EmployeeLeave[] = [
        {
          id: 'l1',
          tenant_id: 't1',
          employee_id: 'emp_001',
          employee_name_snapshot: 'أحمد',
          leave_type: 'annual',
          is_paid: true,
          start_date: '2026-05-01',
          end_date: '2026-05-05',
          requested_days: 5,
          working_days_count: 5,
          status: 'approved',
          reason: 'إجازة سنوية',
          created_by: 'admin',
          created_at: '2026-05-01T00:00:00Z',
        },
        {
          id: 'l2',
          tenant_id: 't1',
          employee_id: 'emp_001',
          employee_name_snapshot: 'أحمد',
          leave_type: 'unpaid',
          is_paid: false,
          start_date: '2026-06-01',
          end_date: '2026-06-03',
          requested_days: 3,
          working_days_count: 3,
          status: 'approved',
          reason: 'ظرف خاص',
          created_by: 'admin',
          created_at: '2026-06-01T00:00:00Z',
        },
        {
          id: 'l3',
          tenant_id: 't1',
          employee_id: 'emp_001',
          employee_name_snapshot: 'أحمد',
          leave_type: 'annual',
          is_paid: true,
          start_date: '2026-07-01',
          end_date: '2026-07-02',
          requested_days: 2,
          working_days_count: 2,
          status: 'pending',
          reason: 'طلب قادم',
          created_by: 'admin',
          created_at: '2026-07-01T00:00:00Z',
        },
      ];

      const balance = calculateEmployeeLeaveBalance(dummyLeaves, 21, 2026);
      expect(balance.entitlement).toBe(21);
      expect(balance.usedPaidDays).toBe(5);
      expect(balance.usedUnpaidDays).toBe(3);
      expect(balance.pendingDays).toBe(2);
      expect(balance.remainingDays).toBe(16); // 21 - 5 (unpaid does NOT deduct from annual entitlement)
    });

    it('handles employees without configured entitlement (null balance)', () => {
      const balance = calculateEmployeeLeaveBalance([], null, 2026);
      expect(balance.entitlement).toBeNull();
      expect(balance.usedPaidDays).toBe(0);
      expect(balance.remainingDays).toBeNull();
    });
  });

  describe('4. Payroll Integration — Paid Leave (Zero Impact & No Absence Deduction)', () => {
    it('employee with approved paid leave is not marked absent and receives full salary', () => {
      const paidLeave: EmployeeLeave = {
        id: 'leave_paid_1',
        tenant_id: 't1',
        employee_id: dummyEmployee.id,
        employee_name_snapshot: dummyEmployee.name,
        leave_type: 'annual',
        is_paid: true,
        start_date: '2026-09-10',
        end_date: '2026-09-12',
        requested_days: 3,
        working_days_count: 3,
        status: 'approved',
        reason: 'راحة سنوية',
        created_by: 'admin',
        created_at: '2026-09-01T00:00:00Z',
      };

      // Attendance records for September (some present, and records on leave days)
      const attendance: AttendanceRecordData[] = [
        { date: '2026-09-01', status: 'present', employeeId: dummyEmployee.id, hours: 8 },
        { date: '2026-09-02', status: 'present', employeeId: dummyEmployee.id, hours: 8 },
        { date: '2026-09-10', status: 'on_leave', employeeId: dummyEmployee.id },
        { date: '2026-09-11', status: 'on_leave', employeeId: dummyEmployee.id },
        { date: '2026-09-12', status: 'on_leave', employeeId: dummyEmployee.id },
      ];

      const payroll = calculateEmployeePayroll({
        employee: dummyEmployee,
        period: '2026-09',
        attendanceRecords: attendance,
        advances: [],
        payments: [],
        approvedLeaves: [paidLeave],
      });

      expect(payroll.attendanceDeductions).toBe(0);
      expect(payroll.attendanceSummary.absentDays).toBe(0);
      expect(payroll.attendanceSummary.leaveDays).toBe(3);
      expect(payroll.attendanceSummary.unpaidLeaveDays).toBe(0);
      expect(payroll.netSalary).toBe(6000); // Base salary intact!
    });
  });

  describe('5. Payroll Integration — Unpaid Leave (Single Deduction, No Double Count)', () => {
    it('approved unpaid leave deducts exact daily rate once without unauthorized absence penalty', () => {
      const unpaidLeave: EmployeeLeave = {
        id: 'leave_unpaid_1',
        tenant_id: 't1',
        employee_id: dummyEmployee.id,
        employee_name_snapshot: dummyEmployee.name,
        leave_type: 'unpaid',
        is_paid: false,
        start_date: '2026-09-15',
        end_date: '2026-09-16', // 2 days -> 2 * 200 = 400 EGP deduction
        requested_days: 2,
        working_days_count: 2,
        status: 'approved',
        reason: 'إجازة بدون راتب معتمدة',
        created_by: 'admin',
        created_at: '2026-09-01T00:00:00Z',
      };

      // Even if attendance had an accidental 'absent' marked on one of the approved leave days,
      // it must NOT be double deducted!
      const attendance: AttendanceRecordData[] = [
        { date: '2026-09-01', status: 'present', employeeId: dummyEmployee.id, hours: 8 },
        { date: '2026-09-15', status: 'absent', employeeId: dummyEmployee.id }, // on approved leave day
        { date: '2026-09-16', status: 'on_leave', employeeId: dummyEmployee.id },
      ];

      const payroll = calculateEmployeePayroll({
        employee: dummyEmployee,
        period: '2026-09',
        attendanceRecords: attendance,
        advances: [],
        payments: [],
        approvedLeaves: [unpaidLeave],
      });

      // Daily rate = 6000 / 30 = 200 EGP. 2 unpaid days = 400 EGP.
      expect(payroll.attendanceDeductions).toBe(400);
      expect(payroll.attendanceSummary.absentDays).toBe(0); // Protected from unauthorized absence!
      expect(payroll.attendanceSummary.unpaidLeaveDays).toBe(2);
      expect(payroll.netSalary).toBe(5600); // 6000 - 400 = 5600 EGP
      expect(payroll.attendanceSummary.deductionReason).toContain('إجازة بدون مرتب: 400 ج.م');
    });
  });

  describe('6. Leave Status Lifecycle (Pending & Rejected Leaves)', () => {
    it('pending or rejected leave does not modify attendance or payroll deductions', () => {
      const pendingLeave: EmployeeLeave = {
        id: 'leave_pending_1',
        tenant_id: 't1',
        employee_id: dummyEmployee.id,
        employee_name_snapshot: dummyEmployee.name,
        leave_type: 'annual',
        is_paid: true,
        start_date: '2026-09-20',
        end_date: '2026-09-21',
        requested_days: 2,
        working_days_count: 2,
        status: 'pending', // NOT approved
        reason: 'طلب إجازة قيد الانتظار',
        created_by: 'user',
        created_at: '2026-09-01T00:00:00Z',
      };

      // Employee was absent on that day without approved leave yet
      const attendance: AttendanceRecordData[] = [
        { date: '2026-09-20', status: 'absent', employeeId: dummyEmployee.id },
      ];

      const payroll = calculateEmployeePayroll({
        employee: dummyEmployee,
        period: '2026-09',
        attendanceRecords: attendance,
        advances: [],
        payments: [],
        approvedLeaves: [pendingLeave], // Ignored because status is pending
      });

      // 1 day unauthorized absence = 200 EGP deduction
      expect(payroll.attendanceDeductions).toBe(200);
      expect(payroll.attendanceSummary.absentDays).toBe(1);
    });
  });

  describe('7. Historical Snapshot Preservation (Finalized Payroll Invariance)', () => {
    it('retroactively adding an approved leave does not mutate a finalized paid payroll', () => {
      const existingPaidRecord = {
        id: 'payroll_emp_001_2026_08',
        period: '2026-08',
        basicSalarySnapshot: 6000,
        attendanceDeductions: 400, // Historical deduction of 400 EGP
        netSalary: 5600,
        totalPaid: 5600,
        remaining: 0,
        status: 'paid' as const,
        attendanceSummary: {
          attendedDays: 20,
          absentDays: 2,
          lateCount: 0,
          totalLateMinutes: 0,
          earlyLeaveMinutes: 0,
          totalHours: 160,
          deductionReason: 'غياب: 400 ج.م (2 يوم)',
        },
      };

      // Later, an approved paid leave for August 2026 is added
      const retroactiveLeave: EmployeeLeave = {
        id: 'leave_retro_1',
        tenant_id: 't1',
        employee_id: dummyEmployee.id,
        employee_name_snapshot: dummyEmployee.name,
        leave_type: 'annual',
        is_paid: true,
        start_date: '2026-08-10',
        end_date: '2026-08-11',
        requested_days: 2,
        working_days_count: 2,
        status: 'approved',
        reason: 'إجازة متأخرة التوثيق',
        created_by: 'admin',
        created_at: '2026-09-01T00:00:00Z',
      };

      const payroll = calculateEmployeePayroll({
        employee: dummyEmployee,
        period: '2026-08',
        attendanceRecords: [],
        advances: [],
        payments: [],
        existingRecord: existingPaidRecord,
        approvedLeaves: [retroactiveLeave],
      });

      // Historical finalized record remains strictly immutable!
      expect(payroll.attendanceDeductions).toBe(400);
      expect(payroll.netSalary).toBe(5600);
      expect(payroll.status).toBe('paid');
    });
  });

  describe('8. Roles & Permissions (RBAC)', () => {
    it('HR role has all leave management permissions', () => {
      const hrPerms = calculateEffectivePermissions('hr');
      expect(hrPerms).toContain('leave.view');
      expect(hrPerms).toContain('leave.create');
      expect(hrPerms).toContain('leave.approve');
      expect(hrPerms).toContain('leave.reject');
      expect(hrPerms).toContain('leave.cancel');
      expect(hrPerms).toContain('leave.manage_balance');
    });

    it('Manager has operational leave permissions (view, create, approve)', () => {
      const managerPerms = calculateEffectivePermissions('manager');
      expect(managerPerms).toContain('leave.view');
      expect(managerPerms).toContain('leave.create');
      expect(managerPerms).toContain('leave.approve');
    });

    it('Cashier has no access to leave management', () => {
      const cashierPerms = calculateEffectivePermissions('cashier');
      expect(cashierPerms).not.toContain('leave.view');
      expect(cashierPerms).not.toContain('leave.create');
      expect(cashierPerms).not.toContain('leave.approve');
    });
  });

  describe('9. Notification Deep-Link Resolution', () => {
    it('resolves /leaves action route to /hr?tab=leaves', () => {
      const resolved = resolveNotificationRoute({ actionRoute: '/leaves' });
      expect(resolved).toBe('/hr?tab=leaves');
    });

    it('resolves category leaves to /hr?tab=leaves', () => {
      const resolved = resolveNotificationRoute({ category: 'leaves' });
      expect(resolved).toBe('/hr?tab=leaves');
    });
  });

  describe('10. Crash Prevention & Legacy Employee Compatibility', () => {
    it('handles legacy employee without leave entitlement safely', () => {
      const legacyEmployee: EmployeeData = {
        id: 'emp_legacy',
        name: 'موظف قديم',
        role: 'مساعد طاهي',
        salary: 4500,
        // no annual_leave_entitlement
      };

      const bal = calculateEmployeeLeaveBalance([], (legacyEmployee as any).annual_leave_entitlement);
      expect(bal.entitlement).toBeNull();
      expect(bal.remainingDays).toBeNull();
      expect(bal.usedPaidDays).toBe(0);
      expect(bal.usedUnpaidDays).toBe(0);
    });

    it('handles employee without shift schedule safely (defaults to weekend logic)', () => {
      // No shiftDays provided -> should not throw, should exclude Friday (2026-10-02)
      const res = calculateLeaveWorkingDays('2026-10-01', '2026-10-03', undefined);
      expect(res.requestedDays).toBe(3);
      expect(res.workingDaysCount).toBe(2);
      expect(res.offDaysCount).toBe(1);
    });

    it('handles empty leaves array in payroll engine without crash', () => {
      const payroll = calculateEmployeePayroll({
        employee: dummyEmployee,
        period: '2026-10',
        attendanceRecords: [],
        advances: [],
        payments: [],
        approvedLeaves: [],
      });
      expect(payroll.attendanceSummary.leaveDays).toBe(0);
      expect(payroll.attendanceSummary.unpaidLeaveDays).toBe(0);
      expect(payroll.netSalary).toBe(6000);
    });

    it('handles malformed / invalid leave dates in payroll engine without infinite loop or crash', () => {
      const malformedLeaves = [
        {
          id: 'leave_bad_1',
          employee_id: dummyEmployee.id,
          status: 'approved',
          start_date: 'invalid-date',
          end_date: '2026-10-05',
          is_paid: true,
        },
        {
          id: 'leave_bad_2',
          employee_id: dummyEmployee.id,
          status: 'approved',
          start_date: '2026-10-10',
          end_date: '2026-10-05', // start > end
          is_paid: true,
        },
      ];

      const payroll = calculateEmployeePayroll({
        employee: dummyEmployee,
        period: '2026-10',
        attendanceRecords: [],
        advances: [],
        payments: [],
        approvedLeaves: malformedLeaves as any,
      });
      expect(payroll.netSalary).toBe(6000);
    });

    it('safely calculates leave working days for empty, null, or malformed inputs', () => {
      expect(calculateLeaveWorkingDays('', '')).toEqual({ requestedDays: 0, workingDaysCount: 0, offDaysCount: 0 });
      expect(calculateLeaveWorkingDays(null as any, undefined as any)).toEqual({ requestedDays: 0, workingDaysCount: 0, offDaysCount: 0 });
      expect(calculateLeaveWorkingDays('bad-date', 'another-bad-date')).toEqual({ requestedDays: 0, workingDaysCount: 0, offDaysCount: 0 });
    });
  });
});

