import { db } from '@/lib/firebase';
import {
  collection,
  doc,
  addDoc,
  updateDoc,
  getDocs,
  getDoc,
  query,
  where,
  orderBy,
  limit as firestoreLimit,
} from 'firebase/firestore';
import type {
  EmployeeLeave,
  LeaveType,
  LeaveStatus,
  LeaveBalanceSummary,
} from '@/types/leave';
import { publishNotification } from './notifications.service';

export const LEAVES_COLLECTION = 'employee_leaves';

export const DAY_INDEX_TO_ARABIC: Record<number, string> = {
  0: 'الأحد',
  1: 'الاثنين',
  2: 'الثلاثاء',
  3: 'الأربعاء',
  4: 'الخميس',
  5: 'الجمعة',
  6: 'السبت',
};

/**
 * Calculates requested calendar days and actual working leave days by excluding shift off-days.
 */
export function calculateLeaveWorkingDays(
  startDateStr: string,
  endDateStr: string,
  shiftDays?: string[]
): { requestedDays: number; workingDaysCount: number; offDaysCount: number } {
  if (!startDateStr || !endDateStr) {
    return { requestedDays: 0, workingDaysCount: 0, offDaysCount: 0 };
  }

  const start = new Date(startDateStr);
  const end = new Date(endDateStr);

  if (isNaN(start.getTime()) || isNaN(end.getTime()) || start > end) {
    return { requestedDays: 0, workingDaysCount: 0, offDaysCount: 0 };
  }

  let current = new Date(start);
  let requestedDays = 0;
  let workingDaysCount = 0;
  let offDaysCount = 0;

  // Normalized shift days check (if empty, assume all days work)
  const hasShiftSchedule = Array.isArray(shiftDays) && shiftDays.length > 0;

  while (current <= end) {
    requestedDays++;
    const dayOfWeek = current.getDay();
    const arabicDayName = DAY_INDEX_TO_ARABIC[dayOfWeek];

    if (hasShiftSchedule) {
      if (shiftDays.includes(arabicDayName)) {
        workingDaysCount++;
      } else {
        offDaysCount++;
      }
    } else {
      // Default: exclude Friday as traditional weekend if no shift schedule exists
      if (dayOfWeek === 5) {
        offDaysCount++;
      } else {
        workingDaysCount++;
      }
    }

    current.setDate(current.getDate() + 1);
  }

  return { requestedDays, workingDaysCount, offDaysCount };
}

/**
 * Checks if a requested leave date range overlaps with existing approved leaves for the employee.
 */
export function checkDateRangeOverlap(
  startA: string,
  endA: string,
  startB: string,
  endB: string
): boolean {
  return !(endA < startB || startA > endB);
}

/**
 * Queries active approved leaves to prevent overlapping approved leaves for an employee.
 */
export async function checkOverlappingLeaves(
  tenantId: string,
  employeeId: string,
  startDate: string,
  endDate: string,
  excludeLeaveId?: string
): Promise<{ hasOverlap: boolean; conflictingLeave?: EmployeeLeave }> {
  try {
    const q = query(
      collection(db, LEAVES_COLLECTION),
      where('tenant_id', '==', tenantId),
      where('employee_id', '==', employeeId),
      where('status', '==', 'approved')
    );
    const snap = await getDocs(q);

    for (const d of snap.docs) {
      if (excludeLeaveId && d.id === excludeLeaveId) continue;
      const leave = { id: d.id, ...d.data() } as EmployeeLeave;
      if (checkDateRangeOverlap(startDate, endDate, leave.start_date, leave.end_date)) {
        return { hasOverlap: true, conflictingLeave: leave };
      }
    }

    return { hasOverlap: false };
  } catch (err) {
    console.warn('Error checking overlapping leaves:', err);
    return { hasOverlap: false };
  }
}

/**
 * Computes leave balance statistics for an employee.
 */
export function calculateEmployeeLeaveBalance(
  leaves: EmployeeLeave[],
  entitlement: number | null | undefined,
  currentYear: number = new Date().getFullYear()
): LeaveBalanceSummary {
  const yearStr = String(currentYear);

  const yearLeaves = leaves.filter(
    (l) => l.start_date && l.start_date.startsWith(yearStr)
  );

  const usedPaidDays = yearLeaves
    .filter((l) => l.status === 'approved' && l.is_paid)
    .reduce((sum, l) => sum + (Number(l.working_days_count) || 0), 0);

  const usedUnpaidDays = yearLeaves
    .filter((l) => l.status === 'approved' && !l.is_paid)
    .reduce((sum, l) => sum + (Number(l.working_days_count) || 0), 0);

  const pendingDays = yearLeaves
    .filter((l) => l.status === 'pending')
    .reduce((sum, l) => sum + (Number(l.working_days_count) || 0), 0);

  const parsedEntitlement =
    entitlement !== null && entitlement !== undefined && !isNaN(Number(entitlement))
      ? Number(entitlement)
      : null;

  const remainingDays =
    parsedEntitlement !== null ? Math.max(0, parsedEntitlement - usedPaidDays) : null;

  return {
    entitlement: parsedEntitlement,
    usedPaidDays,
    usedUnpaidDays,
    pendingDays,
    remainingDays,
  };
}

/**
 * Creates a new Employee Leave record with validation, overlap checks, and audit logging.
 */
export async function createEmployeeLeave(data: {
  tenantId: string;
  branchId?: string | null;
  employeeId: string;
  employeeName: string;
  employeeRole?: string;
  employeeDepartment?: string;
  leaveType: LeaveType;
  isPaid: boolean;
  startDate: string;
  endDate: string;
  shiftDays?: string[];
  reason: string;
  notes?: string;
  initialStatus?: LeaveStatus;
  actorUser: { id: string; name?: string; email?: string };
}): Promise<{ success: boolean; leaveId?: string; error?: string }> {
  try {
    const {
      tenantId,
      branchId,
      employeeId,
      employeeName,
      employeeRole,
      employeeDepartment,
      leaveType,
      isPaid,
      startDate,
      endDate,
      shiftDays,
      reason,
      notes,
      initialStatus = 'pending',
      actorUser,
    } = data;

    if (!tenantId) return { success: false, error: 'معرّف المكتبة/المؤسسة (Tenant ID) مطلوب.' };
    if (!employeeId) return { success: false, error: 'يرجى اختيار الموظف.' };
    if (!startDate || !endDate) return { success: false, error: 'يرجى تحديد تاريخ البداية والنهاية.' };
    if (startDate > endDate) return { success: false, error: 'تاريخ البداية يجب ألا يتجاوز تاريخ النهاية.' };
    if (!reason.trim()) return { success: false, error: 'يرجى كتابة سبب الإجازة.' };

    const { requestedDays, workingDaysCount } = calculateLeaveWorkingDays(
      startDate,
      endDate,
      shiftDays
    );

    // If creating directly as approved, verify no overlapping approved leaves
    if (initialStatus === 'approved') {
      const overlap = await checkOverlappingLeaves(tenantId, employeeId, startDate, endDate);
      if (overlap.hasOverlap) {
        return {
          success: false,
          error: `لا يمكن اعتماد الإجازة لوجود إجازة معتمدة سابقة متداخلة للموظف من ${overlap.conflictingLeave?.start_date} إلى ${overlap.conflictingLeave?.end_date}.`,
        };
      }
    }

    const nowIso = new Date().toISOString();

    const payload: Omit<EmployeeLeave, 'id'> = {
      tenant_id: tenantId,
      branch_id: branchId || null,
      employee_id: employeeId,
      employee_name_snapshot: employeeName,
      employee_role_snapshot: employeeRole || '',
      employee_department_snapshot: employeeDepartment || '',
      leave_type: leaveType,
      is_paid: isPaid,
      start_date: startDate,
      end_date: endDate,
      requested_days: requestedDays,
      working_days_count: workingDaysCount,
      status: initialStatus,
      reason: reason.trim(),
      notes: notes?.trim() || '',
      created_by: actorUser.id,
      created_by_name: actorUser.name || actorUser.email || 'مسؤول النظام',
      created_at: nowIso,
      approved_by: initialStatus === 'approved' ? actorUser.id : null,
      approved_by_name: initialStatus === 'approved' ? (actorUser.name || actorUser.email || 'مسؤول النظام') : null,
      approved_at: initialStatus === 'approved' ? nowIso : null,
      updated_at: nowIso,
    };

    const docRef = await addDoc(collection(db, LEAVES_COLLECTION), payload);

    // 1. Audit Log
    try {
      await addDoc(collection(db, 'audit_logs'), {
        tenant_id: tenantId,
        branch_id: branchId || null,
        action: initialStatus === 'approved' ? 'LEAVE_APPROVED' : 'LEAVE_CREATED',
        entity: 'employee_leave',
        target_id: docRef.id,
        user: actorUser.name || actorUser.email || 'مسؤول النظام',
        details: `تسجيل إجازة (${payload.leave_type}) للموظف: ${employeeName} من ${startDate} إلى ${endDate} (${workingDaysCount} يوم عمل فعلية) - الحالة: ${initialStatus}`,
        severity: 'info',
        created_at: nowIso,
      });
    } catch (auditErr) {
      console.warn('Audit log write warning:', auditErr);
    }

    // 2. Notification Center
    try {
      await publishNotification({
        tenantId,
        branchId: branchId || undefined,
        type: 'info',
        category: 'leaves' as any,
        priority: 'normal',
        title: initialStatus === 'approved' ? 'اعتماد إجازة جديدة' : 'طلب إجازة جديد',
        message: `تم ${initialStatus === 'approved' ? 'تسجيل واعتماد' : 'تقديم'} إجازة (${payload.leave_type === 'annual' ? 'سنوية' : payload.leave_type === 'sick' ? 'مرضية' : 'إجازة'}) للموظف ${employeeName} من ${startDate} إلى ${endDate}.`,
        actionRoute: '/hr?tab=leaves',
        relatedEntityType: 'employee_leave',
        relatedEntityId: docRef.id,
        requiredPermission: 'leave.view',
        createdBy: actorUser.name || actorUser.email || 'مسؤول النظام',
      });
    } catch (notifErr) {
      console.warn('Notification publish warning:', notifErr);
    }

    return { success: true, leaveId: docRef.id };
  } catch (err: any) {
    return { success: false, error: err.message || 'حدث خطأ أثناء حفظ الإجازة.' };
  }
}

/**
 * Approves a pending employee leave after checking for overlap.
 */
export async function approveEmployeeLeave(
  leaveId: string,
  tenantId: string,
  actorUser: { id: string; name?: string; email?: string },
  notes?: string
): Promise<{ success: boolean; error?: string }> {
  try {
    const leaveRef = doc(db, LEAVES_COLLECTION, leaveId);
    const snap = await getDoc(leaveRef);

    if (!snap.exists()) {
      return { success: false, error: 'سجل الإجازة غير موجود.' };
    }

    const leave = { id: snap.id, ...snap.data() } as EmployeeLeave;

    if (leave.status === 'approved') {
      return { success: true };
    }

    // Overlap validation
    const overlap = await checkOverlappingLeaves(
      tenantId,
      leave.employee_id,
      leave.start_date,
      leave.end_date,
      leaveId
    );

    if (overlap.hasOverlap) {
      return {
        success: false,
        error: `لا يمكن اعتماد الإجازة لوجود إجازة معتمدة سابقة متداخلة للموظف من ${overlap.conflictingLeave?.start_date} إلى ${overlap.conflictingLeave?.end_date}.`,
      };
    }

    const nowIso = new Date().toISOString();

    await updateDoc(leaveRef, {
      status: 'approved',
      approved_by: actorUser.id,
      approved_by_name: actorUser.name || actorUser.email || 'مسؤول النظام',
      approved_at: nowIso,
      updated_at: nowIso,
      notes: notes ? `${leave.notes || ''}\nملاحظات الاعتماد: ${notes}`.trim() : leave.notes,
    });

    // Audit Log
    try {
      await addDoc(collection(db, 'audit_logs'), {
        tenant_id: tenantId,
        branch_id: leave.branch_id || null,
        action: 'LEAVE_APPROVED',
        entity: 'employee_leave',
        target_id: leaveId,
        user: actorUser.name || actorUser.email || 'مسؤول النظام',
        details: `اعتماد إجازة الموظف ${leave.employee_name_snapshot} للفترة من ${leave.start_date} إلى ${leave.end_date}`,
        severity: 'info',
        created_at: nowIso,
      });
    } catch (auditErr) {
      console.warn('Audit log write warning:', auditErr);
    }

    // Notification
    try {
      await publishNotification({
        tenantId,
        branchId: leave.branch_id || undefined,
        type: 'success',
        category: 'leaves' as any,
        priority: 'normal',
        title: 'تم اعتماد إجازة',
        message: `تم اعتماد إجازة ${leave.employee_name_snapshot} من ${leave.start_date} إلى ${leave.end_date} بنجاح.`,
        actionRoute: '/hr?tab=leaves',
        relatedEntityType: 'employee_leave',
        relatedEntityId: leaveId,
        requiredPermission: 'leave.view',
        createdBy: actorUser.name || actorUser.email || 'مسؤول النظام',
      });
    } catch (notifErr) {
      console.warn('Notification publish warning:', notifErr);
    }

    return { success: true };
  } catch (err: any) {
    return { success: false, error: err.message || 'فشل اعتماد الإجازة.' };
  }
}

/**
 * Rejects a pending leave with a mandatory reason.
 */
export async function rejectEmployeeLeave(
  leaveId: string,
  tenantId: string,
  rejectionReason: string,
  actorUser: { id: string; name?: string; email?: string }
): Promise<{ success: boolean; error?: string }> {
  try {
    if (!rejectionReason.trim()) {
      return { success: false, error: 'يرجى كتابة سبب رفض الإجازة.' };
    }

    const leaveRef = doc(db, LEAVES_COLLECTION, leaveId);
    const snap = await getDoc(leaveRef);

    if (!snap.exists()) {
      return { success: false, error: 'سجل الإجازة غير موجود.' };
    }

    const leave = snap.data() as EmployeeLeave;
    const nowIso = new Date().toISOString();

    await updateDoc(leaveRef, {
      status: 'rejected',
      rejected_by: actorUser.id,
      rejected_by_name: actorUser.name || actorUser.email || 'مسؤول النظام',
      rejected_at: nowIso,
      rejection_reason: rejectionReason.trim(),
      updated_at: nowIso,
    });

    // Audit Log
    try {
      await addDoc(collection(db, 'audit_logs'), {
        tenant_id: tenantId,
        branch_id: leave.branch_id || null,
        action: 'LEAVE_REJECTED',
        entity: 'employee_leave',
        target_id: leaveId,
        user: actorUser.name || actorUser.email || 'مسؤول النظام',
        details: `رفض إجازة الموظف ${leave.employee_name_snapshot}. السبب: ${rejectionReason.trim()}`,
        severity: 'warning',
        created_at: nowIso,
      });
    } catch (auditErr) {
      console.warn('Audit log write warning:', auditErr);
    }

    // Notification
    try {
      await publishNotification({
        tenantId,
        branchId: leave.branch_id || undefined,
        type: 'warning',
        category: 'leaves' as any,
        priority: 'normal',
        title: 'رفض طلب إجازة',
        message: `تم رفض طلب إجازة ${leave.employee_name_snapshot} للفترة من ${leave.start_date} إلى ${leave.end_date}.`,
        actionRoute: '/hr?tab=leaves',
        relatedEntityType: 'employee_leave',
        relatedEntityId: leaveId,
        requiredPermission: 'leave.view',
        createdBy: actorUser.name || actorUser.email || 'مسؤول النظام',
      });
    } catch (notifErr) {
      console.warn('Notification publish warning:', notifErr);
    }

    return { success: true };
  } catch (err: any) {
    return { success: false, error: err.message || 'فشل رفض الإجازة.' };
  }
}

/**
 * Cancels an approved or pending leave safely without destroying historical past attendance.
 */
export async function cancelEmployeeLeave(
  leaveId: string,
  tenantId: string,
  cancellationReason: string,
  actorUser: { id: string; name?: string; email?: string }
): Promise<{ success: boolean; error?: string }> {
  try {
    const leaveRef = doc(db, LEAVES_COLLECTION, leaveId);
    const snap = await getDoc(leaveRef);

    if (!snap.exists()) {
      return { success: false, error: 'سجل الإجازة غير موجود.' };
    }

    const leave = snap.data() as EmployeeLeave;
    const nowIso = new Date().toISOString();

    await updateDoc(leaveRef, {
      status: 'cancelled',
      cancelled_by: actorUser.id,
      cancelled_by_name: actorUser.name || actorUser.email || 'مسؤول النظام',
      cancelled_at: nowIso,
      cancellation_reason: cancellationReason.trim(),
      updated_at: nowIso,
    });

    // Audit Log
    try {
      await addDoc(collection(db, 'audit_logs'), {
        tenant_id: tenantId,
        branch_id: leave.branch_id || null,
        action: 'LEAVE_CANCELLED',
        entity: 'employee_leave',
        target_id: leaveId,
        user: actorUser.name || actorUser.email || 'مسؤول النظام',
        details: `إلغاء إجازة الموظف ${leave.employee_name_snapshot} (${leave.start_date} إلى ${leave.end_date}). السبب: ${cancellationReason.trim()}`,
        severity: 'warning',
        created_at: nowIso,
      });
    } catch (auditErr) {
      console.warn('Audit log write warning:', auditErr);
    }

    return { success: true };
  } catch (err: any) {
    return { success: false, error: err.message || 'فشل إلغاء الإجازة.' };
  }
}
