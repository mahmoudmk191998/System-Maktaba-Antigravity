import { useState, useMemo, useEffect, useCallback } from 'react';
import {
  CalendarOff,
  Plus,
  Search,
  CheckCircle2,
  XCircle,
  Clock,
  Calendar,
  AlertCircle,
  Filter,
  UserCheck,
  UserX,
  FileText,
  Trash2,
  Edit,
  ShieldCheck,
  Building2,
  Users,
  Info,
  ChevronDown,
} from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
  DialogDescription,
} from '@/components/ui/dialog';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
  DropdownMenuSeparator,
} from '@/components/ui/dropdown-menu';
import { toast } from 'sonner';
import { db } from '@/lib/firebase';
import {
  collection,
  query,
  where,
  onSnapshot,
  orderBy,
} from 'firebase/firestore';
import type {
  EmployeeLeave,
  LeaveType,
  LeaveStatus,
} from '@/types/leave';
import {
  LEAVE_TYPE_CONFIG,
  LEAVE_STATUS_CONFIG,
} from '@/types/leave';
import {
  calculateLeaveWorkingDays,
  createEmployeeLeave,
  approveEmployeeLeave,
  rejectEmployeeLeave,
  cancelEmployeeLeave,
  calculateEmployeeLeaveBalance,
  LEAVES_COLLECTION,
} from '@/services/leave.service';
import { useUserPermissions } from '@/hooks/usePermissions';

interface LeavesTabProps {
  tenantId: string;
  branchId?: string | null;
  employees: any[];
  shifts: any[];
  user: any;
  preselectedEmployeeId?: string | null;
  onClearPreselectedEmployee?: () => void;
}

export function LeavesTab({
  tenantId,
  branchId,
  employees,
  shifts,
  user,
  preselectedEmployeeId,
  onClearPreselectedEmployee,
}: LeavesTabProps) {
  const { hasPermission, isAdmin } = useUserPermissions();

  const canView = isAdmin || hasPermission('leave.view') || hasPermission('hr.view_employees');
  const canCreate = isAdmin || hasPermission('leave.create') || hasPermission('hr.manage_employees');
  const canApprove = isAdmin || hasPermission('leave.approve');
  const canReject = isAdmin || hasPermission('leave.reject');
  const canCancel = isAdmin || hasPermission('leave.cancel');

  const [leaves, setLeaves] = useState<EmployeeLeave[]>([]);
  const [loading, setLoading] = useState(true);

  // Filters State
  const [searchQuery, setSearchQuery] = useState('');
  const [typeFilter, setTypeFilter] = useState<string>('all');
  const [statusFilter, setStatusFilter] = useState<string>('all');
  const [employeeFilter, setEmployeeFilter] = useState<string>('all');

  // Modals State
  const [isCreateOpen, setIsCreateOpen] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);

  // Leave Form State
  const todayStr = new Date().toISOString().split('T')[0];
  const [formData, setFormData] = useState({
    employeeId: '',
    leaveType: 'annual' as LeaveType,
    isPaid: true,
    startDate: todayStr,
    endDate: todayStr,
    reason: '',
    notes: '',
    initialStatus: 'approved' as LeaveStatus,
  });

  // Action Modals (Approve / Reject / Cancel)
  const [selectedLeaveForAction, setSelectedLeaveForAction] = useState<EmployeeLeave | null>(null);
  const [actionType, setActionType] = useState<'approve' | 'reject' | 'cancel' | null>(null);
  const [actionReason, setActionReason] = useState('');

  // Handle Preselected Employee
  useEffect(() => {
    if (preselectedEmployeeId) {
      setFormData((prev) => ({
        ...prev,
        employeeId: preselectedEmployeeId,
      }));
      setIsCreateOpen(true);
    }
  }, [preselectedEmployeeId]);

  // Real-time Firestore Subscription for Leaves
  useEffect(() => {
    if (!tenantId) {
      setLoading(false);
      return;
    }

    setLoading(true);
    let q = query(
      collection(db, LEAVES_COLLECTION),
      where('tenant_id', '==', tenantId)
    );

    // Branch Isolation
    if (branchId && !isAdmin && !hasPermission('permissions.manage')) {
      q = query(
        collection(db, LEAVES_COLLECTION),
        where('tenant_id', '==', tenantId),
        where('branch_id', '==', branchId)
      );
    }

    const unsub = onSnapshot(
      q,
      (snapshot) => {
        const items = snapshot.docs.map((d) => ({
          id: d.id,
          ...d.data(),
        })) as EmployeeLeave[];

        // Sort descending by start_date client-side
        items.sort((a, b) => (b.start_date || '').localeCompare(a.start_date || ''));
        setLeaves(items);
        setLoading(false);
      },
      (err) => {
        console.warn('Leaves subscription warning:', err);
        setLoading(false);
      }
    );

    return () => unsub();
  }, [tenantId, branchId, isAdmin, hasPermission]);

  // Selected Employee object for form
  const selectedEmp = useMemo(() => {
    return employees.find((e) => e.id === formData.employeeId) || null;
  }, [employees, formData.employeeId]);

  // Selected Employee's Shift Days
  const selectedEmpShiftDays = useMemo(() => {
    if (!selectedEmp || !Array.isArray(shifts)) return undefined;
    const shiftId = selectedEmp.shift_id || selectedEmp.default_shift_id || selectedEmp.shiftId;
    if (!shiftId) return undefined;
    const shift = shifts.find((s) => s?.id === shiftId);
    return Array.isArray(shift?.days) ? shift.days : undefined;
  }, [selectedEmp, shifts]);

  // Live calculation of requested and working leave days
  const durationPreview = useMemo(() => {
    return calculateLeaveWorkingDays(
      formData.startDate,
      formData.endDate,
      selectedEmpShiftDays
    );
  }, [formData.startDate, formData.endDate, selectedEmpShiftDays]);

  // Selected Employee's current Leave Balance
  const selectedEmpBalance = useMemo(() => {
    if (!selectedEmp) return null;
    const empLeaves = (leaves || []).filter((l) => l && l.employee_id === selectedEmp.id);
    return calculateEmployeeLeaveBalance(empLeaves, selectedEmp.annual_leave_entitlement);
  }, [selectedEmp, leaves]);

  // KPI Metrics Calculation
  const kpis = useMemo(() => {
    const today = new Date().toISOString().split('T')[0];
    const next7Days = new Date();
    next7Days.setDate(next7Days.getDate() + 7);
    const next7DaysStr = next7Days.toISOString().split('T')[0];

    const safeLeaves = leaves || [];

    const currentLeaves = safeLeaves.filter(
      (l) => l && l.status === 'approved' && l.start_date && l.end_date && l.start_date <= today && today <= l.end_date
    );

    const upcomingLeaves = safeLeaves.filter(
      (l) => l && l.status === 'approved' && l.start_date && l.start_date > today && l.start_date <= next7DaysStr
    );

    const pendingLeaves = safeLeaves.filter((l) => l && l.status === 'pending');

    const thisMonthPrefix = today.substring(0, 7);
    const approvedThisMonth = safeLeaves.filter(
      (l) => l && l.status === 'approved' && (l.start_date || '').startsWith(thisMonthPrefix)
    );

    return {
      onLeaveToday: currentLeaves.length,
      upcomingCount: upcomingLeaves.length,
      pendingCount: pendingLeaves.length,
      approvedThisMonthCount: approvedThisMonth.length,
    };
  }, [leaves]);

  // Filtered leaves list
  const filteredLeaves = useMemo(() => {
    return leaves.filter((l) => {
      // Search
      if (searchQuery.trim()) {
        const q = searchQuery.toLowerCase();
        const matchName = (l.employee_name_snapshot || '').toLowerCase().includes(q);
        const matchReason = (l.reason || '').toLowerCase().includes(q);
        if (!matchName && !matchReason) return false;
      }

      // Type Filter
      if (typeFilter !== 'all' && l.leave_type !== typeFilter) return false;

      // Status Filter
      if (statusFilter !== 'all' && l.status !== statusFilter) return false;

      // Employee Filter
      if (employeeFilter !== 'all' && l.employee_id !== employeeFilter) return false;

      return true;
    });
  }, [leaves, searchQuery, typeFilter, statusFilter, employeeFilter]);

  // Handle Form Type Change
  const handleTypeChange = (newType: LeaveType) => {
    const config = LEAVE_TYPE_CONFIG[newType];
    setFormData((prev) => ({
      ...prev,
      leaveType: newType,
      isPaid: config ? config.defaultPaid : prev.isPaid,
    }));
  };

  // Submit Create Leave
  const handleCreateLeave = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!formData.employeeId) {
      toast.error('يرجى اختيار الموظف أولاً.');
      return;
    }
    if (!formData.startDate || !formData.endDate) {
      toast.error('يرجى تحديد تاريخ البداية والنهاية.');
      return;
    }
    if (formData.startDate > formData.endDate) {
      toast.error('تاريخ بداية الإجازة لا يمكن أن يكون بعد تاريخ النهاية.');
      return;
    }
    if (!formData.reason.trim()) {
      toast.error('يرجى كتابة سبب الإجازة.');
      return;
    }

    setIsSubmitting(true);
    try {
      const res = await createEmployeeLeave({
        tenantId,
        branchId: branchId || selectedEmp?.branch_id || null,
        employeeId: formData.employeeId,
        employeeName: selectedEmp?.name || 'موظف',
        employeeRole: selectedEmp?.role || '',
        employeeDepartment: selectedEmp?.department || '',
        leaveType: formData.leaveType,
        isPaid: formData.isPaid,
        startDate: formData.startDate,
        endDate: formData.endDate,
        shiftDays: selectedEmpShiftDays,
        reason: formData.reason,
        notes: formData.notes,
        initialStatus: canApprove ? formData.initialStatus : 'pending',
        actorUser: {
          id: user?.uid || 'user',
          name: user?.displayName || user?.name || user?.email || 'المدير',
          email: user?.email,
        },
      });

      if (res.success) {
        toast.success('تم تسجيل الإجازة بنجاح!');
        setIsCreateOpen(false);
        if (onClearPreselectedEmployee) onClearPreselectedEmployee();
        setFormData({
          employeeId: '',
          leaveType: 'annual',
          isPaid: true,
          startDate: todayStr,
          endDate: todayStr,
          reason: '',
          notes: '',
          initialStatus: 'approved',
        });
      } else {
        toast.error(res.error || 'فشل تسجيل الإجازة.');
      }
    } catch (err: any) {
      toast.error('خطأ: ' + err.message);
    } finally {
      setIsSubmitting(false);
    }
  };

  // Handle Action Execution (Approve, Reject, Cancel)
  const handleExecuteAction = async () => {
    if (!selectedLeaveForAction || !actionType) return;
    setIsSubmitting(true);

    const actor = {
      id: user?.uid || 'user',
      name: user?.displayName || user?.name || user?.email || 'المدير',
      email: user?.email,
    };

    try {
      if (actionType === 'approve') {
        const res = await approveEmployeeLeave(
          selectedLeaveForAction.id,
          tenantId,
          actor,
          actionReason
        );
        if (res.success) {
          toast.success('تم اعتماد الإجازة بنجاح.');
        } else {
          toast.error(res.error || 'فشل اعتماد الإجازة.');
        }
      } else if (actionType === 'reject') {
        if (!actionReason.trim()) {
          toast.error('يجب كتابة سبب الرفض.');
          setIsSubmitting(false);
          return;
        }
        const res = await rejectEmployeeLeave(
          selectedLeaveForAction.id,
          tenantId,
          actionReason,
          actor
        );
        if (res.success) {
          toast.success('تم رفض طلب الإجازة.');
        } else {
          toast.error(res.error || 'فشل رفض الإجازة.');
        }
      } else if (actionType === 'cancel') {
        if (!actionReason.trim()) {
          toast.error('يجب كتابة سبب الإلغاء.');
          setIsSubmitting(false);
          return;
        }
        const res = await cancelEmployeeLeave(
          selectedLeaveForAction.id,
          tenantId,
          actionReason,
          actor
        );
        if (res.success) {
          toast.success('تم إلغاء الإجازة بنجاح.');
        } else {
          toast.error(res.error || 'فشل إلغاء الإجازة.');
        }
      }

      setSelectedLeaveForAction(null);
      setActionType(null);
      setActionReason('');
    } catch (err: any) {
      toast.error('خطأ في تنفيذ الإجراء: ' + err.message);
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="space-y-6 font-cairo" dir="rtl">
      {/* 1. Header & Quick Action */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h2 className="text-xl font-bold tracking-tight text-foreground flex items-center gap-2">
            <CalendarOff className="w-5 h-5 text-primary" />
            إدارة إجازات الموظفين
          </h2>
          <p className="text-xs text-muted-foreground mt-1">
            تسجيل واعتماد الإجازات، متابعة الأرصدة السنوية، والربط المباشر مع سجل الحضور والرواتب.
          </p>
        </div>

        {canCreate && (
          <Button
            onClick={() => {
              setFormData({
                employeeId: employees[0]?.id || '',
                leaveType: 'annual',
                isPaid: true,
                startDate: todayStr,
                endDate: todayStr,
                reason: '',
                notes: '',
                initialStatus: canApprove ? 'approved' : 'pending',
              });
              setIsCreateOpen(true);
            }}
            className="gap-2 shadow-sm touch-manipulation h-10 px-4"
          >
            <Plus className="w-4 h-4" />
            منح / طلب إجازة
          </Button>
        )}
      </div>

      {/* 2. Top KPI Cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <Card className="bg-slate-900/50 border-slate-800">
          <CardContent className="p-3">
            <div className="flex items-center gap-2.5">
              <div className="w-10 h-10 rounded-xl bg-amber-500/10 text-amber-400 flex items-center justify-center shrink-0">
                <Users className="w-5 h-5" />
              </div>
              <div>
                <p className="text-xl font-bold text-amber-400">{kpis.onLeaveToday}</p>
                <p className="text-[11px] text-muted-foreground">في إجازة اليوم</p>
              </div>
            </div>
          </CardContent>
        </Card>

        <Card className="bg-slate-900/50 border-slate-800">
          <CardContent className="p-3">
            <div className="flex items-center gap-2.5">
              <div className="w-10 h-10 rounded-xl bg-blue-500/10 text-blue-400 flex items-center justify-center shrink-0">
                <Calendar className="w-5 h-5" />
              </div>
              <div>
                <p className="text-xl font-bold text-blue-400">{kpis.upcomingCount}</p>
                <p className="text-[11px] text-muted-foreground">قادمة خلال 7 أيام</p>
              </div>
            </div>
          </CardContent>
        </Card>

        <Card className="bg-slate-900/50 border-slate-800">
          <CardContent className="p-3">
            <div className="flex items-center gap-2.5">
              <div className="w-10 h-10 rounded-xl bg-purple-500/10 text-purple-400 flex items-center justify-center shrink-0">
                <Clock className="w-5 h-5" />
              </div>
              <div>
                <p className="text-xl font-bold text-purple-400">{kpis.pendingCount}</p>
                <p className="text-[11px] text-muted-foreground">بانتظار الاعتماد</p>
              </div>
            </div>
          </CardContent>
        </Card>

        <Card className="bg-slate-900/50 border-slate-800">
          <CardContent className="p-3">
            <div className="flex items-center gap-2.5">
              <div className="w-10 h-10 rounded-xl bg-emerald-500/10 text-emerald-400 flex items-center justify-center shrink-0">
                <CheckCircle2 className="w-5 h-5" />
              </div>
              <div>
                <p className="text-xl font-bold text-emerald-400">{kpis.approvedThisMonthCount}</p>
                <p className="text-[11px] text-muted-foreground">معتمدة هذا الشهر</p>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* 3. Search & Filters Bar */}
      <Card className="bg-slate-900/40 border-slate-800">
        <CardContent className="p-3.5 space-y-3">
          <div className="flex flex-col md:flex-row gap-2.5">
            <div className="relative flex-1">
              <Search className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
              <Input
                placeholder="بحث باسم الموظف أو سبب الإجازة..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="pr-10 h-9 text-xs"
              />
            </div>

            <div className="flex flex-wrap items-center gap-2">
              {/* Employee Filter */}
              <select
                value={employeeFilter}
                onChange={(e) => setEmployeeFilter(e.target.value)}
                className="h-9 rounded-md border border-input bg-background px-2.5 text-xs"
              >
                <option value="all">جميع الموظفين</option>
                {employees.map((emp) => (
                  <option key={emp.id} value={emp.id}>
                    {emp.name}
                  </option>
                ))}
              </select>

              {/* Type Filter */}
              <select
                value={typeFilter}
                onChange={(e) => setTypeFilter(e.target.value)}
                className="h-9 rounded-md border border-input bg-background px-2.5 text-xs"
              >
                <option value="all">جميع أنواع الإجازات</option>
                {Object.entries(LEAVE_TYPE_CONFIG).map(([key, cfg]) => (
                  <option key={key} value={key}>
                    {cfg.labelAr}
                  </option>
                ))}
              </select>

              {/* Status Filter */}
              <select
                value={statusFilter}
                onChange={(e) => setStatusFilter(e.target.value)}
                className="h-9 rounded-md border border-input bg-background px-2.5 text-xs"
              >
                <option value="all">جميع الحالات</option>
                {Object.entries(LEAVE_STATUS_CONFIG).map(([key, cfg]) => (
                  <option key={key} value={key}>
                    {cfg.labelAr}
                  </option>
                ))}
              </select>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* 4. Leaves Content: Mobile Cards (< md) & Desktop Table (>= md) */}
      <div className="space-y-4">
        {loading ? (
          <div className="text-center py-12 text-muted-foreground text-xs">
            جاري تحميل سجلات الإجازات...
          </div>
        ) : filteredLeaves.length === 0 ? (
          <Card className="border-dashed border-slate-800 bg-slate-950/20">
            <CardContent className="flex flex-col items-center justify-center py-12 text-center">
              <CalendarOff className="w-10 h-10 text-muted-foreground mb-3 opacity-60" />
              <p className="text-sm font-bold text-foreground">لا توجد إجازات مسجلة</p>
              <p className="text-xs text-muted-foreground mt-1 max-w-sm">
                لم يتم العثور على أي إجازات تطابق معايير البحث أو التصفية الحالية.
              </p>
            </CardContent>
          </Card>
        ) : (
          <>
            {/* Mobile Cards View (< md) */}
            <div className="md:hidden space-y-3">
              {filteredLeaves.map((leave) => {
                const typeCfg = LEAVE_TYPE_CONFIG[leave.leave_type] || LEAVE_TYPE_CONFIG.other;
                const statusCfg = LEAVE_STATUS_CONFIG[leave.status] || LEAVE_STATUS_CONFIG.pending;

                return (
                  <Card key={leave.id} className="border-slate-800 bg-slate-950/40 p-3.5 space-y-3">
                    <div className="flex items-start justify-between gap-2">
                      <div>
                        <p className="font-bold text-sm text-foreground">{leave.employee_name_snapshot}</p>
                        <p className="text-[11px] text-muted-foreground">
                          {leave.employee_role_snapshot || 'موظف'} • {leave.employee_department_snapshot || 'عام'}
                        </p>
                      </div>
                      <div className="flex items-center gap-1.5 shrink-0">
                        <Badge variant="outline" className={`text-[10px] px-2 py-0.5 ${typeCfg.bg} ${typeCfg.color}`}>
                          {typeCfg.labelAr}
                        </Badge>
                        <Badge variant="outline" className={`text-[10px] px-2 py-0.5 ${statusCfg.bg} ${statusCfg.color}`}>
                          {statusCfg.labelAr}
                        </Badge>
                      </div>
                    </div>

                    <div className="grid grid-cols-3 gap-1.5 text-center bg-slate-900/60 p-2 rounded-lg border border-slate-800 text-xs">
                      <div>
                        <span className="text-[10px] text-muted-foreground block">من</span>
                        <span className="font-mono font-medium">{leave.start_date}</span>
                      </div>
                      <div>
                        <span className="text-[10px] text-muted-foreground block">إلى</span>
                        <span className="font-mono font-medium">{leave.end_date}</span>
                      </div>
                      <div>
                        <span className="text-[10px] text-muted-foreground block">المدة الفعلية</span>
                        <span className="font-bold text-primary">{leave.working_days_count} يوم</span>
                      </div>
                    </div>

                    <div className="flex items-center justify-between text-xs pt-1 border-t border-slate-900">
                      <div className="flex items-center gap-2">
                        <Badge
                          variant="outline"
                          className={leave.is_paid ? 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20 text-[10px]' : 'bg-rose-500/10 text-rose-400 border-rose-500/20 text-[10px]'}
                        >
                          {leave.is_paid ? 'مدفوعة الأجر' : 'بدون راتب'}
                        </Badge>
                        {leave.reason && (
                          <span className="text-[11px] text-muted-foreground truncate max-w-[150px]">
                            {leave.reason}
                          </span>
                        )}
                      </div>

                      {/* Mobile Actions */}
                      <div className="flex items-center gap-1">
                        {leave.status === 'pending' && canApprove && (
                          <Button
                            size="sm"
                            variant="ghost"
                            onClick={() => {
                              setSelectedLeaveForAction(leave);
                              setActionType('approve');
                              setActionReason('');
                            }}
                            className="h-8 px-2 text-emerald-400 hover:text-emerald-300 hover:bg-emerald-500/10 text-xs"
                          >
                            <CheckCircle2 className="w-3.5 h-3.5 ml-1" />
                            اعتماد
                          </Button>
                        )}
                        {leave.status === 'pending' && canReject && (
                          <Button
                            size="sm"
                            variant="ghost"
                            onClick={() => {
                              setSelectedLeaveForAction(leave);
                              setActionType('reject');
                              setActionReason('');
                            }}
                            className="h-8 px-2 text-rose-400 hover:text-rose-300 hover:bg-rose-500/10 text-xs"
                          >
                            <XCircle className="w-3.5 h-3.5 ml-1" />
                            رفض
                          </Button>
                        )}
                        {leave.status === 'approved' && canCancel && (
                          <Button
                            size="sm"
                            variant="ghost"
                            onClick={() => {
                              setSelectedLeaveForAction(leave);
                              setActionType('cancel');
                              setActionReason('');
                            }}
                            className="h-8 px-2 text-slate-400 hover:text-slate-200 hover:bg-slate-800 text-xs"
                          >
                            إلغاء
                          </Button>
                        )}
                      </div>
                    </div>
                  </Card>
                );
              })}
            </div>

            {/* Desktop Table View (>= md) */}
            <div className="hidden md:block overflow-x-auto rounded-lg border border-slate-800 bg-slate-950/20">
              <Table>
                <TableHeader>
                  <TableRow className="border-slate-800 hover:bg-transparent">
                    <TableHead className="text-right">الموظف</TableHead>
                    <TableHead className="text-right">نوع الإجازة</TableHead>
                    <TableHead className="text-right">من</TableHead>
                    <TableHead className="text-right">إلى</TableHead>
                    <TableHead className="text-center">أيام العمل</TableHead>
                    <TableHead className="text-center">الأجر</TableHead>
                    <TableHead className="text-center">الحالة</TableHead>
                    <TableHead className="text-right">السبب</TableHead>
                    <TableHead className="text-left">الإجراءات</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filteredLeaves.map((leave) => {
                    const typeCfg = LEAVE_TYPE_CONFIG[leave.leave_type] || LEAVE_TYPE_CONFIG.other;
                    const statusCfg = LEAVE_STATUS_CONFIG[leave.status] || LEAVE_STATUS_CONFIG.pending;

                    return (
                      <TableRow key={leave.id} className="border-slate-800/60 hover:bg-slate-900/40">
                        <TableCell className="font-medium text-slate-100">
                          <div>
                            <span>{leave.employee_name_snapshot}</span>
                            <span className="block text-[11px] text-muted-foreground">
                              {leave.employee_role_snapshot || 'موظف'}
                            </span>
                          </div>
                        </TableCell>
                        <TableCell>
                          <Badge variant="outline" className={`text-xs ${typeCfg.bg} ${typeCfg.color}`}>
                            {typeCfg.labelAr}
                          </Badge>
                        </TableCell>
                        <TableCell className="font-mono text-xs text-slate-300">{leave.start_date}</TableCell>
                        <TableCell className="font-mono text-xs text-slate-300">{leave.end_date}</TableCell>
                        <TableCell className="text-center">
                          <span className="font-bold text-primary">{leave.working_days_count}</span>
                          {leave.requested_days !== leave.working_days_count && (
                            <span className="block text-[10px] text-muted-foreground">
                              (من أصل {leave.requested_days})
                            </span>
                          )}
                        </TableCell>
                        <TableCell className="text-center">
                          <Badge
                            variant="outline"
                            className={leave.is_paid ? 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20 text-[11px]' : 'bg-rose-500/10 text-rose-400 border-rose-500/20 text-[11px]'}
                          >
                            {leave.is_paid ? 'مدفوعة' : 'بدون مرتب'}
                          </Badge>
                        </TableCell>
                        <TableCell className="text-center">
                          <Badge variant="outline" className={`text-xs ${statusCfg.bg} ${statusCfg.color}`}>
                            {statusCfg.labelAr}
                          </Badge>
                        </TableCell>
                        <TableCell className="text-xs text-muted-foreground max-w-[180px] truncate" title={leave.reason}>
                          {leave.reason}
                        </TableCell>
                        <TableCell className="text-left">
                          <div className="flex items-center justify-end gap-1.5">
                            {leave.status === 'pending' && canApprove && (
                              <Button
                                size="sm"
                                variant="outline"
                                onClick={() => {
                                  setSelectedLeaveForAction(leave);
                                  setActionType('approve');
                                  setActionReason('');
                                }}
                                className="h-8 text-xs border-emerald-500/30 text-emerald-400 hover:bg-emerald-500/10 hover:text-emerald-300 gap-1"
                              >
                                <CheckCircle2 className="w-3.5 h-3.5" />
                                اعتماد
                              </Button>
                            )}
                            {leave.status === 'pending' && canReject && (
                              <Button
                                size="sm"
                                variant="outline"
                                onClick={() => {
                                  setSelectedLeaveForAction(leave);
                                  setActionType('reject');
                                  setActionReason('');
                                }}
                                className="h-8 text-xs border-rose-500/30 text-rose-400 hover:bg-rose-500/10 hover:text-rose-300 gap-1"
                              >
                                <XCircle className="w-3.5 h-3.5" />
                                رفض
                              </Button>
                            )}
                            {leave.status === 'approved' && canCancel && (
                              <Button
                                size="sm"
                                variant="ghost"
                                onClick={() => {
                                  setSelectedLeaveForAction(leave);
                                  setActionType('cancel');
                                  setActionReason('');
                                }}
                                className="h-8 text-xs text-muted-foreground hover:text-rose-400 hover:bg-rose-500/10"
                              >
                                إلغاء
                              </Button>
                            )}
                          </div>
                        </TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            </div>
          </>
        )}
      </div>

      {/* 5. Create Leave Dialog */}
      <Dialog open={isCreateOpen} onOpenChange={setIsCreateOpen}>
        <DialogContent className="max-w-md max-h-[90dvh] overflow-y-auto font-cairo" dir="rtl">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <CalendarOff className="w-5 h-5 text-primary" />
              منح / تسجيل إجازة لموظف
            </DialogTitle>
            <DialogDescription className="text-xs">
              تحديد تفاصيل الإجازة، نوعها، الأثر المالي، وفحص تداخل التواريخ تلقائياً.
            </DialogDescription>
          </DialogHeader>

          <form onSubmit={handleCreateLeave} className="space-y-4 py-2">
            {/* Employee Selector */}
            <div className="space-y-1.5">
              <Label className="text-xs">الموظف *</Label>
              <select
                value={formData.employeeId}
                onChange={(e) => setFormData({ ...formData, employeeId: e.target.value })}
                className="w-full h-10 rounded-md border border-input bg-background px-3 text-xs"
                required
              >
                <option value="">-- اختر الموظف --</option>
                {employees.map((emp) => (
                  <option key={emp.id} value={emp.id}>
                    {emp.name} ({emp.role || 'موظف'})
                  </option>
                ))}
              </select>
            </div>

            {/* Employee Leave Balance Card (if employee selected) */}
            {selectedEmp && selectedEmpBalance && (
              <div className="bg-slate-900/60 p-2.5 rounded-lg border border-slate-800 text-xs space-y-1.5">
                <div className="flex items-center justify-between text-muted-foreground">
                  <span>الرصيد السنوي المستحق:</span>
                  <span className="font-bold text-foreground">
                    {selectedEmpBalance.entitlement !== null
                      ? `${selectedEmpBalance.entitlement} يوم`
                      : 'غير محدد'}
                  </span>
                </div>
                <div className="flex items-center justify-between text-muted-foreground">
                  <span>المستخدم (مدفوع):</span>
                  <span className="font-medium text-amber-400">{selectedEmpBalance.usedPaidDays} يوم</span>
                </div>
                {selectedEmpBalance.remainingDays !== null && (
                  <div className="flex items-center justify-between pt-1 border-t border-slate-800">
                    <span className="font-semibold text-foreground">المتبقي من الرصيد:</span>
                    <span className="font-bold text-emerald-400">{selectedEmpBalance.remainingDays} يوم</span>
                  </div>
                )}
              </div>
            )}

            {/* Leave Type Selector */}
            <div className="space-y-1.5">
              <Label className="text-xs">نوع الإجازة *</Label>
              <select
                value={formData.leaveType}
                onChange={(e) => handleTypeChange(e.target.value as LeaveType)}
                className="w-full h-10 rounded-md border border-input bg-background px-3 text-xs"
              >
                {Object.entries(LEAVE_TYPE_CONFIG).map(([key, cfg]) => (
                  <option key={key} value={key}>
                    {cfg.labelAr} ({cfg.defaultPaid ? 'مدفوعة افتراضياً' : 'غير مدفوعة'})
                  </option>
                ))}
              </select>
            </div>

            {/* Paid vs Unpaid Toggle */}
            <div className="flex items-center justify-between p-3 rounded-lg border border-slate-800 bg-slate-950/30">
              <div className="space-y-0.5">
                <Label className="text-xs font-bold">إجازة مدفوعة الأجر (Paid Leave)</Label>
                <p className="text-[11px] text-muted-foreground">
                  {formData.isPaid
                    ? 'لا يتم خصم أي مبلغ من الراتب، ولا تُحسب كغياب.'
                    : 'يتم احتساب خصم يومي مصرح به دون اعتباره غياباً غير مبرر.'}
                </p>
              </div>
              <Switch
                checked={formData.isPaid}
                onCheckedChange={(val) => setFormData({ ...formData, isPaid: val })}
              />
            </div>

            {/* Date Range Pickers */}
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label className="text-xs">تاريخ البداية *</Label>
                <Input
                  type="date"
                  value={formData.startDate}
                  onChange={(e) => setFormData({ ...formData, startDate: e.target.value })}
                  className="h-10 text-xs"
                  required
                />
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs">تاريخ النهاية *</Label>
                <Input
                  type="date"
                  value={formData.endDate}
                  onChange={(e) => setFormData({ ...formData, endDate: e.target.value })}
                  className="h-10 text-xs"
                  required
                />
              </div>
            </div>

            {/* Live Duration Breakdown Preview */}
            <div className="bg-primary/5 p-2.5 rounded-lg border border-primary/20 text-xs flex items-center justify-between">
              <div>
                <span className="text-muted-foreground">أيام التقويم: </span>
                <span className="font-bold text-foreground">{durationPreview.requestedDays} يوم</span>
              </div>
              <div>
                <span className="text-muted-foreground">أيام العمل الفعلية: </span>
                <span className="font-black text-primary">{durationPreview.workingDaysCount} يوم</span>
              </div>
              {durationPreview.offDaysCount > 0 && (
                <div>
                  <span className="text-[10px] text-amber-400">({durationPreview.offDaysCount} عطلة أسبوعية)</span>
                </div>
              )}
            </div>

            {/* Reason */}
            <div className="space-y-1.5">
              <Label className="text-xs">سبب الإجازة *</Label>
              <Input
                placeholder="مثال: ظروف عائلية، مراجعة طبية، راحة سنوية..."
                value={formData.reason}
                onChange={(e) => setFormData({ ...formData, reason: e.target.value })}
                className="h-10 text-xs"
                required
              />
            </div>

            {/* Notes */}
            <div className="space-y-1.5">
              <Label className="text-xs">ملاحظات إضافية (اختياري)</Label>
              <Input
                placeholder="أي ملاحظات للإدارة..."
                value={formData.notes}
                onChange={(e) => setFormData({ ...formData, notes: e.target.value })}
                className="h-10 text-xs"
              />
            </div>

            {/* Initial Status (if user has approve permissions) */}
            {canApprove && (
              <div className="space-y-1.5">
                <Label className="text-xs">حالة الاعتماد المبدئية</Label>
                <select
                  value={formData.initialStatus}
                  onChange={(e) => setFormData({ ...formData, initialStatus: e.target.value as LeaveStatus })}
                  className="w-full h-10 rounded-md border border-input bg-background px-3 text-xs"
                >
                  <option value="approved">معتمدة مباشرة (Approved)</option>
                  <option value="pending">قيد الانتظار للمراجعة (Pending)</option>
                </select>
              </div>
            )}

            <DialogFooter className="pt-3 gap-2">
              <Button
                type="button"
                variant="outline"
                onClick={() => setIsCreateOpen(false)}
                disabled={isSubmitting}
                className="h-10 text-xs"
              >
                إلغاء
              </Button>
              <Button type="submit" disabled={isSubmitting} className="h-10 text-xs gap-1.5">
                {isSubmitting ? 'جاري الحفظ...' : 'حفظ وتسجيل الإجازة'}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      {/* 6. Action Dialog (Approve / Reject / Cancel) */}
      <Dialog
        open={!!selectedLeaveForAction && !!actionType}
        onOpenChange={(open) => {
          if (!open) {
            setSelectedLeaveForAction(null);
            setActionType(null);
            setActionReason('');
          }
        }}
      >
        <DialogContent className="max-w-md font-cairo" dir="rtl">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              {actionType === 'approve' && <CheckCircle2 className="w-5 h-5 text-emerald-400" />}
              {actionType === 'reject' && <XCircle className="w-5 h-5 text-rose-400" />}
              {actionType === 'cancel' && <AlertCircle className="w-5 h-5 text-amber-400" />}
              {actionType === 'approve' && 'اعتماد الإجازة'}
              {actionType === 'reject' && 'رفض طلب الإجازة'}
              {actionType === 'cancel' && 'إلغاء الإجازة المعتمدة'}
            </DialogTitle>
            <DialogDescription className="text-xs">
              الموظف: {selectedLeaveForAction?.employee_name_snapshot} للفترة من{' '}
              {selectedLeaveForAction?.start_date} إلى {selectedLeaveForAction?.end_date} (
              {selectedLeaveForAction?.working_days_count} يوم عمل)
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-3 py-2">
            {actionType === 'approve' && (
              <p className="text-xs text-muted-foreground leading-relaxed">
                هل أنت متأكد من اعتماد هذه الإجازة؟ سيتم توثيقها في سجل الحضور والرواتب ولن يتم احتساب هذه الأيام كغياب.
              </p>
            )}

            {(actionType === 'reject' || actionType === 'cancel') && (
              <div className="space-y-1.5">
                <Label className="text-xs">
                  {actionType === 'reject' ? 'سبب الرفض *' : 'سبب الإلغاء *'}
                </Label>
                <Input
                  placeholder="يرجى توضيح السبب..."
                  value={actionReason}
                  onChange={(e) => setActionReason(e.target.value)}
                  className="h-10 text-xs"
                  required
                />
              </div>
            )}
          </div>

          <DialogFooter className="gap-2">
            <Button
              variant="outline"
              onClick={() => {
                setSelectedLeaveForAction(null);
                setActionType(null);
                setActionReason('');
              }}
              disabled={isSubmitting}
              className="h-10 text-xs"
            >
              رجوع
            </Button>
            <Button
              onClick={handleExecuteAction}
              disabled={isSubmitting}
              className={`h-10 text-xs ${
                actionType === 'approve'
                  ? 'bg-emerald-600 hover:bg-emerald-700'
                  : actionType === 'reject'
                  ? 'bg-rose-600 hover:bg-rose-700'
                  : 'bg-amber-600 hover:bg-amber-700'
              }`}
            >
              {isSubmitting ? 'جاري التنفيذ...' : 'تأكيد الإجراء'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
