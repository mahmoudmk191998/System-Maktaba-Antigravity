export type LeaveType = 'annual' | 'sick' | 'emergency' | 'unpaid' | 'other';

export type LeaveStatus = 'pending' | 'approved' | 'rejected' | 'cancelled';

export interface EmployeeLeave {
  id: string;
  leaveId?: string;
  tenant_id: string;
  branch_id?: string | null;

  employee_id: string;
  employee_name_snapshot: string;
  employee_role_snapshot?: string;
  employee_department_snapshot?: string;

  leave_type: LeaveType;
  is_paid: boolean;

  start_date: string; // 'YYYY-MM-DD'
  end_date: string;   // 'YYYY-MM-DD'
  requested_days: number;
  working_days_count: number;

  status: LeaveStatus;

  reason: string;
  notes?: string;

  created_by: string;
  created_by_name?: string;
  created_at: string; // ISO

  approved_by?: string | null;
  approved_by_name?: string | null;
  approved_at?: string | null;

  rejected_by?: string | null;
  rejected_by_name?: string | null;
  rejected_at?: string | null;
  rejection_reason?: string | null;

  cancelled_by?: string | null;
  cancelled_by_name?: string | null;
  cancelled_at?: string | null;
  cancellation_reason?: string | null;

  updated_at?: string;
}

export interface LeaveBalanceSummary {
  entitlement: number | null; // null if not configured
  usedPaidDays: number;
  usedUnpaidDays: number;
  pendingDays: number;
  remainingDays: number | null;
}

export const LEAVE_TYPE_CONFIG: Record<
  LeaveType,
  { labelAr: string; labelEn: string; defaultPaid: boolean; color: string; bg: string }
> = {
  annual: {
    labelAr: 'إجازة سنوية',
    labelEn: 'Annual Leave',
    defaultPaid: true,
    color: 'text-emerald-500',
    bg: 'bg-emerald-500/10 border-emerald-500/20',
  },
  sick: {
    labelAr: 'إجازة مرضية',
    labelEn: 'Sick Leave',
    defaultPaid: true,
    color: 'text-blue-500',
    bg: 'bg-blue-500/10 border-blue-500/20',
  },
  emergency: {
    labelAr: 'إجازة طارئة',
    labelEn: 'Emergency Leave',
    defaultPaid: true,
    color: 'text-amber-500',
    bg: 'bg-amber-500/10 border-amber-500/20',
  },
  unpaid: {
    labelAr: 'إجازة بدون مرتب',
    labelEn: 'Unpaid Leave',
    defaultPaid: false,
    color: 'text-rose-500',
    bg: 'bg-rose-500/10 border-rose-500/20',
  },
  other: {
    labelAr: 'أخرى',
    labelEn: 'Other Leave',
    defaultPaid: false,
    color: 'text-purple-500',
    bg: 'bg-purple-500/10 border-purple-500/20',
  },
};

export const LEAVE_STATUS_CONFIG: Record<
  LeaveStatus,
  { labelAr: string; color: string; bg: string }
> = {
  pending: {
    labelAr: 'قيد الانتظار',
    color: 'text-amber-500',
    bg: 'bg-amber-500/10 border-amber-500/20',
  },
  approved: {
    labelAr: 'معتمدة',
    color: 'text-emerald-500',
    bg: 'bg-emerald-500/10 border-emerald-500/20',
  },
  rejected: {
    labelAr: 'مرفوضة',
    color: 'text-rose-500',
    bg: 'bg-rose-500/10 border-rose-500/20',
  },
  cancelled: {
    labelAr: 'ملغاة',
    color: 'text-slate-400',
    bg: 'bg-slate-500/10 border-slate-500/20',
  },
};
