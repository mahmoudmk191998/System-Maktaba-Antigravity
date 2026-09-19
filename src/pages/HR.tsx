import { useState, useMemo, useRef, useEffect, useCallback } from 'react';
import { useSearchParams } from 'react-router-dom';
import { MainLayout } from '@/components/layout';
import { useFormatters } from '@/lib/formatters';
import { cn } from '@/lib/utils';
import {
  UserCog, Plus, Search, Calendar, Clock, CheckCircle, Users,
  Briefcase, DollarSign, Timer, Edit, Trash2, Eye, Shield,
  QrCode, Printer, Download, Copy, RefreshCw, KeyRound, MapPin,
  AlertTriangle, Sliders, FileText, CheckCircle2, XCircle, ArrowUpDown,
  Lock, Phone, ChevronRight, UserMinus, UserCheck, Calculator,
  ChevronDown, FileDown, Image as ImageIcon, CalendarOff,
  CreditCard, Mail
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription } from '@/components/ui/dialog';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
  DropdownMenuSeparator,
} from '@/components/ui/dropdown-menu';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { Slider } from '@/components/ui/slider';
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from '@/components/ui/table';
import { Checkbox } from '@/components/ui/checkbox';
import { useHR, useTenantBranch } from '@/hooks/useDatabase';
import { usePayroll } from '@/hooks/usePayroll';
import { useAuth } from '@/hooks/useAuth';
import { PayrollOverviewCards } from '@/components/payroll/PayrollOverviewCards';
import { PayrollTable } from '@/components/payroll/PayrollTable';
import { EmployeeFinancialTab } from '@/components/payroll/EmployeeFinancialTab';
import { LeavesTab } from '@/components/hr/LeavesTab';
import { calculateEmployeeLeaveBalance } from '@/services/leave.service';
import { LEAVE_TYPE_CONFIG, LEAVE_STATUS_CONFIG } from '@/types/leave';
import { db } from '@/lib/firebase';
import { collection, query, where, getDocs } from 'firebase/firestore';
import { firestoreLogger } from '@/lib/firestoreLogger';
import { QRCodeSVG } from 'qrcode.react';
import { toast } from 'sonner';
import { formatWorkedHours, calculateLateMinutes, timeStringToMinutes } from '@/lib/attendanceSecurity';

const statusColors: Record<string, string> = {
  active: 'bg-emerald-500/10 text-emerald-500 border-emerald-500/20',
  inactive: 'bg-rose-500/10 text-rose-500 border-rose-500/20',
  on_leave: 'bg-amber-500/10 text-amber-500 border-amber-500/20',
  present: 'bg-emerald-500/10 text-emerald-500 border-emerald-500/20',
  late: 'bg-amber-500/10 text-amber-500 border-amber-500/20',
  absent: 'bg-rose-500/10 text-rose-500 border-rose-500/20',
  early_leave: 'bg-orange-500/10 text-orange-500 border-orange-500/20',
  incomplete: 'bg-slate-500/10 text-slate-400 border-slate-500/20',
};

const statusLabels: Record<string, string> = {
  active: 'نشط',
  inactive: 'غير نشط',
  on_leave: 'إجازة',
  present: 'حاضر',
  late: 'متأخر',
  absent: 'غائب',
  early_leave: 'انصراف مبكر',
  incomplete: 'غير مكتمل',
};

export default function HR() {
  const { tenantId, branchId } = useTenantBranch();
  const {
    employees: dbEmployees,
    shifts: dbShifts,
    attendance: dbAttendance,
    hrSettings,
    loading,
    addEmployee,
    updateEmployee,
    changeEmployeePin,
    deleteEmployee,
    deleteAttendance,
    manualCorrectAttendance,
    addShift,
    updateShift,
    deleteShift,
    updateHrSettings,
    rotateQrToken,
  } = useHR(tenantId);

  const {
    payrolls,
    salaryPayments,
    advances,
    advanceInstallments,
    isSubmittingPayment,
    isProcessingCancellation,
    getPayrollForPeriod,
    disburseSalaryPayment,
    voidSalaryPayment,
    createAdvance,
    cancelAdvance,
    deleteAdvance,
    reverseAdvanceInstallment,
    getKPIs,
  } = usePayroll(tenantId, branchId);

  const [payrollPeriod, setPayrollPeriod] = useState<string>(() => {
    const d = new Date();
    const m = String(d.getMonth() + 1).padStart(2, '0');
    return `${d.getFullYear()}-${m}`;
  });

  const { currency, number } = useFormatters();
  const { user } = useAuth();
  const [searchParams] = useSearchParams();

  const [preselectedLeaveEmployeeId, setPreselectedLeaveEmployeeId] = useState<string | null>(null);

  // On-demand Leaves Fetch with event synchronization
  const [leaves, setLeaves] = useState<any[]>([]);
  const loadLeaves = useCallback(async () => {
    if (!tenantId) return;
    try {
      const snap = await getDocs(query(collection(db, 'employee_leaves'), where('tenant_id', '==', tenantId)));
      firestoreLogger.logOperation('HR.loadLeaves', 'employee_leaves', 'getDocs', snap.docs.length);
      setLeaves(snap.docs.map((d) => ({ id: d.id, ...d.data() })));
    } catch (err) {
      console.warn('Leaves fetch warning:', err);
    }
  }, [tenantId]);

  useEffect(() => {
    loadLeaves();
    const handleSync = () => loadLeaves();
    window.addEventListener('alwan_leaves_synced', handleSync);
    return () => window.removeEventListener('alwan_leaves_synced', handleSync);
  }, [loadLeaves]);

  // Active Tab: initializes from URL search param (e.g. /hr?tab=reports or /hr?tab=leaves)
  const [activeTab, setActiveTab] = useState(() => {
    const tabParam = searchParams.get('tab');
    if (tabParam === 'reports' || tabParam === 'payroll') return 'reports';
    if (tabParam === 'attendance') return 'attendance';
    if (tabParam === 'qr') return 'qr';
    if (tabParam === 'shifts') return 'shifts';
    if (tabParam === 'leaves') return 'leaves';
    if (tabParam === 'settings') return 'settings';
    return 'employees';
  });

  // Sync activeTab if searchParams change dynamically without full page reload
  useEffect(() => {
    const tabParam = searchParams.get('tab');
    if (tabParam === 'reports' || tabParam === 'payroll') {
      setActiveTab('reports');
    } else if (tabParam === 'attendance') {
      setActiveTab('attendance');
    } else if (tabParam === 'qr') {
      setActiveTab('qr');
    } else if (tabParam === 'shifts') {
      setActiveTab('shifts');
    } else if (tabParam === 'leaves') {
      setActiveTab('leaves');
    } else if (tabParam === 'settings') {
      setActiveTab('settings');
    } else if (tabParam === 'employees') {
      setActiveTab('employees');
    }
  }, [searchParams]);

  // Search & Filters for Employees
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedEmployees, setSelectedEmployees] = useState<string[]>([]);
  const [roleFilter, setRoleFilter] = useState('all');
  const [statusFilter, setStatusFilter] = useState('all');

  // Add / Edit Employee Modals
  const [isAddEmployeeOpen, setIsAddEmployeeOpen] = useState(false);
  const [editingEmployee, setEditingEmployee] = useState<any>(null);
  const [newEmployee, setNewEmployee] = useState({
    name: '',
    phone: '',
    role: '',
    department: '',
    salary: '',
    employee_type: 'full_time',
    status: 'active',
    pin: '',
    shift_id: '',
    national_id: '',
    address: '',
    photo_url: '',
    emergency_contact: '',
    email: '',
    hire_date: new Date().toISOString().split('T')[0],
    notes: '',
  });

  // Change PIN Modal
  const [pinChangeEmployee, setPinChangeEmployee] = useState<any>(null);
  const [newPinValue, setNewPinValue] = useState('');
  const [confirmPinValue, setConfirmPinValue] = useState('');

  // Employee Profile Modal (View Details)
  const [profileEmployee, setProfileEmployee] = useState<any>(null);

  // Shifts Modals
  const [isAddShiftOpen, setIsAddShiftOpen] = useState(false);
  const [editingShift, setEditingShift] = useState<any>(null);
  const [shiftForm, setShiftForm] = useState({
    name: '',
    startTime: '09:00',
    endTime: '17:00',
    gracePeriod: 10,
    breakMinutes: 0,
    days: ['السبت', 'الأحد', 'الاثنين', 'الثلاثاء', 'الأربعاء', 'الخميس'],
  });

  // Attendance Filters & Manual Correction Modal
  const [attDateFilter, setAttDateFilter] = useState(new Date().toISOString().split('T')[0]);
  const [attStatusFilter, setAttStatusFilter] = useState('all');
  const [attSearchQuery, setAttSearchQuery] = useState('');
  const [correctionModalOpen, setCorrectionModalOpen] = useState(false);
  const [correctionRecord, setCorrectionRecord] = useState<any>(null);
  const [correctionForm, setCorrectionForm] = useState({
    employee_id: '',
    date: new Date().toISOString().split('T')[0],
    checkIn: '09:00',
    checkOut: '17:00',
    status: 'present',
    reason: '',
  });

  // Delete Attendance Record Modal State
  const [deleteAttendanceRecord, setDeleteAttendanceRecord] = useState<any>(null);
  const [isDeletingAttendance, setIsDeletingAttendance] = useState(false);

  // Reports & Payroll Filter
  const [reportDateFrom, setReportDateFrom] = useState(() => {
    const d = new Date();
    d.setDate(1);
    return d.toISOString().split('T')[0];
  });
  const [reportDateTo, setReportDateTo] = useState(new Date().toISOString().split('T')[0]);
  const [reportEmployeeId, setReportEmployeeId] = useState('all');

  // Print ref for QR Code
  const qrPrintRef = useRef<HTMLDivElement>(null);

  // Normalized Employees List
  const employees = useMemo(() => {
    return dbEmployees.map((e) => ({
      ...e,
      id: e.id,
      name: e.name || '',
      role: e.role || '',
      department: e.department || '',
      phone: e.phone || '',
      salary: Number(e.salary) || 0,
      hireDate: e.hire_date || e.hireDate || '',
      hire_date: e.hire_date || e.hireDate || '',
      employeeType: e.employee_type || e.employeeType || 'full_time',
      employee_type: e.employee_type || e.employeeType || 'full_time',
      status: e.status || 'active',
      pinSet: Boolean(e.pin_set || e.pin_hash || e.pin),
      shiftId: e.default_shift_id || e.shift_id || null,
      shift_id: e.shift_id || e.default_shift_id || null,
      default_shift_id: e.default_shift_id || e.shift_id || null,
      annual_leave_entitlement: e.annual_leave_entitlement ?? null,
      national_id: e.national_id || '',
      address: e.address || '',
      photo_url: e.photo_url || e.avatar || '',
      avatar: e.photo_url || e.avatar || '',
      emergency_contact: e.emergency_contact || '',
      email: e.email || '',
      notes: e.notes || '',
      createdAt: e.created_at || '',
    }));
  }, [dbEmployees]);

  // Roles list for filter
  const allRoles = useMemo(() => {
    const set = new Set<string>();
    employees.forEach((e) => {
      if (e.role) set.add(e.role);
    });
    return Array.from(set);
  }, [employees]);

  // Attendance list normalized
  const attendance = useMemo(() => {
    return dbAttendance.map((a) => ({
      id: a.id,
      employeeId: a.employee_id,
      employeeName: a.employee_name || employees.find((e) => e.id === a.employee_id)?.name || 'موظف',
      employeeRole: a.employee_role || employees.find((e) => e.id === a.employee_id)?.role || '',
      date: a.date || '',
      checkIn: a.checkIn || '',
      checkInAt: a.checkInAt || '',
      checkOut: a.checkOut || '',
      checkOutAt: a.checkOutAt || '',
      hours: Number(a.hours) || 0,
      workedMinutes: Number(a.workedMinutes) || 0,
      lateMinutes: Number(a.lateMinutes) || 0,
      earlyLeaveMinutes: Number(a.earlyLeaveMinutes) || 0,
      status: a.status || 'present',
      isManualCorrection: Boolean(a.isManualCorrection),
      correctionReason: a.correctionReason || null,
      shiftName: a.shift_name || null,
    }));
  }, [dbAttendance, employees]);

  // Today's stats
  const todayStr = new Date().toISOString().split('T')[0];
  const todayAttendance = useMemo(() => attendance.filter((a) => a.date === todayStr), [attendance, todayStr]);

  const activeEmployeesCount = useMemo(() => employees.filter((e) => e.status === 'active').length, [employees]);
  const presentTodayCount = useMemo(() => todayAttendance.filter((a) => a.status === 'present' || a.status === 'late').length, [todayAttendance]);
  const lateTodayCount = useMemo(() => todayAttendance.filter((a) => a.status === 'late').length, [todayAttendance]);
  const absentTodayCount = Math.max(0, activeEmployeesCount - presentTodayCount);
  const onLeaveTodayCount = useMemo(() => employees.filter((e) => e.status === 'on_leave').length, [employees]);
  const totalWorkedHoursToday = useMemo(() => todayAttendance.reduce((acc, curr) => acc + curr.hours, 0), [todayAttendance]);

  // Filtered employees
  const filteredEmployees = useMemo(() => {
    return employees.filter((e) => {
      const matchesSearch = e.name.includes(searchQuery) || e.phone.includes(searchQuery) || e.role.includes(searchQuery);
      const matchesRole = roleFilter === 'all' || e.role === roleFilter;
      const matchesStatus = statusFilter === 'all' || e.status === statusFilter;
      return matchesSearch && matchesRole && matchesStatus;
    });
  }, [employees, searchQuery, roleFilter, statusFilter]);

  // Attendance Records Filtered for the Table
  const filteredAttendance = useMemo(() => {
    return attendance.filter((a) => {
      const matchesDate = !attDateFilter || a.date === attDateFilter;
      const matchesStatus = attStatusFilter === 'all' || a.status === attStatusFilter;
      const matchesSearch = !attSearchQuery || a.employeeName.includes(attSearchQuery);
      return matchesDate && matchesStatus && matchesSearch;
    });
  }, [attendance, attDateFilter, attStatusFilter, attSearchQuery]);

  // Public QR attendance URL (Ensures real production domain is used even during local development)
  const attendanceUrl = useMemo(() => {
    let baseUrl = window.location.origin;
    const isLocalhost =
      window.location.hostname === 'localhost' ||
      window.location.hostname === '127.0.0.1' ||
      window.location.hostname === '0.0.0.0';

    if (isLocalhost) {
      baseUrl =
        (import.meta as any).env?.VITE_PUBLIC_APP_URL ||
        (hrSettings as any)?.public_app_url ||
        'https://mksystem-rose.vercel.app';
    }
    return `${baseUrl}/attendance?token=${encodeURIComponent(hrSettings.attendance_token || '')}`;
  }, [hrSettings.attendance_token, (hrSettings as any)?.public_app_url]);

  // Handle Add Employee
  const handleSaveEmployee = async () => {
    if (!newEmployee.name || !newEmployee.role) {
      toast.error('الاسم والمسمى الوظيفي مطلوبان');
      return;
    }
    if (newEmployee.pin && !/^\d{4}$/.test(newEmployee.pin)) {
      toast.error('رمز PIN يجب أن يتكون من 4 أرقام بالضبط');
      return;
    }

    const success = await addEmployee({
      name: newEmployee.name,
      phone: newEmployee.phone,
      role: newEmployee.role,
      department: newEmployee.department,
      salary: Number(newEmployee.salary) || 0,
      employee_type: newEmployee.employee_type,
      status: newEmployee.status,
      default_shift_id: newEmployee.shift_id || null,
      hire_date: newEmployee.hire_date || new Date().toISOString().split('T')[0],
      pin: newEmployee.pin || null,
      national_id: newEmployee.national_id || '',
      address: newEmployee.address || '',
      photo_url: newEmployee.photo_url || '',
      avatar: newEmployee.photo_url || '',
      emergency_contact: newEmployee.emergency_contact || '',
      email: newEmployee.email || '',
      notes: newEmployee.notes || '',
    });

    if (success) {
      setIsAddEmployeeOpen(false);
      setNewEmployee({
        name: '',
        phone: '',
        role: '',
        department: '',
        salary: '',
        employee_type: 'full_time',
        status: 'active',
        pin: '',
        shift_id: '',
        national_id: '',
        address: '',
        photo_url: '',
        emergency_contact: '',
        email: '',
        hire_date: new Date().toISOString().split('T')[0],
        notes: '',
      });
    }
  };

  // Handle Update Employee
  const handleUpdateEmployee = async () => {
    if (!editingEmployee) return;
    const success = await updateEmployee(editingEmployee.id, {
      name: editingEmployee.name,
      phone: editingEmployee.phone,
      role: editingEmployee.role,
      department: editingEmployee.department,
      salary: Number(editingEmployee.salary) || 0,
      employee_type: editingEmployee.employeeType || editingEmployee.employee_type,
      status: editingEmployee.status,
      default_shift_id: editingEmployee.shiftId || editingEmployee.default_shift_id || null,
      national_id: editingEmployee.national_id || '',
      address: editingEmployee.address || '',
      photo_url: editingEmployee.photo_url || editingEmployee.avatar || '',
      avatar: editingEmployee.photo_url || editingEmployee.avatar || '',
      emergency_contact: editingEmployee.emergency_contact || '',
      email: editingEmployee.email || '',
      hire_date: editingEmployee.hire_date || editingEmployee.hireDate || '',
      notes: editingEmployee.notes || '',
    });

    if (success) {
      setEditingEmployee(null);
    }
  };

  // Handle Change PIN
  const handleSavePin = async () => {
    if (!pinChangeEmployee) return;
    if (!/^\d{4}$/.test(newPinValue)) {
      toast.error('يجب أن يتكون رمز PIN من 4 أرقام بالضبط');
      return;
    }
    if (newPinValue !== confirmPinValue) {
      toast.error('الرمز السري وتأكيد الرمز غير متطابقين');
      return;
    }

    const success = await changeEmployeePin(pinChangeEmployee.id, newPinValue);
    if (success) {
      setPinChangeEmployee(null);
      setNewPinValue('');
      setConfirmPinValue('');
    }
  };

  // Handle Manual Attendance Correction
  const handleSaveCorrection = async () => {
    if (!correctionForm.employee_id || !correctionForm.date || !correctionForm.checkIn) {
      toast.error('بيانات الحضور الأساسية مطلوبة');
      return;
    }
    if (!correctionForm.reason.trim()) {
      toast.error('يجب كتابة سبب التعديل اليدوي لتوثيقه في سجل التدقيق');
      return;
    }

    const selectedEmp = employees.find((e) => e.id === correctionForm.employee_id);

    let workedMinutes = 0;
    let hours = 0;
    if (correctionForm.checkIn && correctionForm.checkOut) {
      const inMins = timeStringToMinutes(correctionForm.checkIn);
      const outMins = timeStringToMinutes(correctionForm.checkOut);
      workedMinutes = Math.max(0, outMins - inMins);
      hours = Math.round((workedMinutes / 60) * 10) / 10;
    }

    const payload = {
      employee_id: correctionForm.employee_id,
      employee_name: selectedEmp?.name || 'موظف',
      employee_role: selectedEmp?.role || '',
      date: correctionForm.date,
      checkIn: correctionForm.checkIn,
      checkInAt: `${correctionForm.date}T${correctionForm.checkIn}:00.000Z`,
      checkOut: correctionForm.checkOut || null,
      checkOutAt: correctionForm.checkOut ? `${correctionForm.date}T${correctionForm.checkOut}:00.000Z` : null,
      status: correctionForm.status,
      workedMinutes,
      hours,
      correctionReason: correctionForm.reason,
    };

    const success = await manualCorrectAttendance(correctionRecord ? correctionRecord.id : null, payload);
    if (success) {
      setCorrectionModalOpen(false);
      setCorrectionRecord(null);
      setCorrectionForm({
        employee_id: '',
        date: new Date().toISOString().split('T')[0],
        checkIn: '09:00',
        checkOut: '17:00',
        status: 'present',
        reason: '',
      });
    }
  };

  // Handle Shifts Save
  const handleSaveShift = async () => {
    if (!shiftForm.name || !shiftForm.startTime || !shiftForm.endTime) {
      toast.error('اسم ومواعيد الوردية مطلوبة');
      return;
    }

    if (editingShift) {
      const success = await updateShift(editingShift.id, shiftForm);
      if (success) {
        setEditingShift(null);
        setIsAddShiftOpen(false);
      }
    } else {
      const id = await addShift(shiftForm);
      if (id) {
        setIsAddShiftOpen(false);
        setShiftForm({
          name: '',
          startTime: '09:00',
          endTime: '17:00',
          gracePeriod: 10,
          breakMinutes: 0,
          days: ['السبت', 'الأحد', 'الاثنين', 'الثلاثاء', 'الأربعاء', 'الخميس'],
        });
      }
    }
  };

  // Copy Link to Clipboard
  const handleCopyLink = () => {
    navigator.clipboard.writeText(attendanceUrl);
    toast.success('تم نسخ رابط صفحة الحضور إلى الحافظة');
  };

  // Print or Save as PDF formatted for A4
  const handlePrintOrPDF = () => {
    const printWindow = window.open('', '_blank');
    if (!printWindow) {
      toast.error('يرجى السماح بفتح النوافذ المنبثقة للطباعة وتصدير PDF');
      return;
    }

    printWindow.document.write(`
      <!DOCTYPE html>
      <html dir="rtl" lang="ar">
        <head>
          <meta charset="utf-8">
          <title>رمز QR لتسجيل الحضور والانصراف - نظام المكتبة</title>
          <style>
            @page {
              size: A4 portrait;
              margin: 15mm;
            }
            * { box-sizing: border-box; }
            body {
              font-family: system-ui, -apple-system, "Segoe UI", Roboto, "Cairo", sans-serif;
              margin: 0;
              padding: 20px;
              color: #0f172a;
              background: #ffffff;
              display: flex;
              flex-direction: column;
              align-items: center;
              justify-content: center;
              min-height: 90vh;
            }
            .poster {
              border: 3px solid #0f172a;
              border-radius: 20px;
              padding: 36px 30px;
              width: 100%;
              max-width: 650px;
              text-align: center;
              background: #ffffff;
              box-shadow: 0 4px 12px rgba(0,0,0,0.06);
            }
            .badge {
              display: inline-block;
              background: #0f172a;
              color: #ffffff;
              font-size: 13px;
              font-weight: bold;
              padding: 6px 18px;
              border-radius: 9999px;
              margin-bottom: 16px;
              letter-spacing: 0.5px;
            }
            h1 {
              font-size: 26px;
              font-weight: 800;
              margin: 0 0 8px 0;
              color: #0f172a;
            }
            .subtitle {
              font-size: 15px;
              color: #475569;
              margin-bottom: 24px;
            }
            .qr-box {
              background: #ffffff;
              border: 2px solid #e2e8f0;
              border-radius: 16px;
              padding: 24px;
              display: inline-block;
              margin: 0 auto 20px auto;
            }
            .qr-box svg {
              display: block;
              width: 240px;
              height: 240px;
            }
            .token-info {
              font-size: 11px;
              color: #64748b;
              font-family: monospace;
              margin-bottom: 20px;
            }
            .instructions {
              text-align: right;
              background: #f8fafc;
              border: 1px solid #e2e8f0;
              border-radius: 12px;
              padding: 16px 20px;
              margin-top: 10px;
            }
            .instructions h3 {
              margin: 0 0 10px 0;
              font-size: 14px;
              color: #1e293b;
            }
            .instructions ol {
              margin: 0;
              padding-right: 22px;
              color: #334155;
              font-size: 13px;
              line-height: 1.8;
            }
            .footer-note {
              margin-top: 20px;
              font-size: 11px;
              color: #94a3b8;
            }
            @media print {
              body { padding: 0; }
              .poster { border-width: 2px; }
            }
          </style>
        </head>
        <body>
          <div class="poster">
            <div class="badge">نظام الحضور والانصراف الذكي</div>
            <h1>تسجيل الحضور والانصراف</h1>
            <p class="subtitle">امسح رمز الاستجابة السريعة بكاميرا الهاتف لتسجيل الحضور أو الانصراف فوراً</p>
            <div class="qr-box">
              ${qrPrintRef.current?.innerHTML || ''}
            </div>
            <div class="token-info">رمز التحقق: ${hrSettings.attendance_token ? hrSettings.attendance_token.slice(0, 8) + '...' + hrSettings.attendance_token.slice(-4) : 'مفعل'}</div>
            <div class="instructions">
              <h3>خطوات الاستخدام للموظف:</h3>
              <ol>
                <li>افتح تطبيق الكاميرا على هاتفك ووجّهه نحو الرمز.</li>
                <li>اضغط على الرابط المنبثق لفتح صفحة الحضور.</li>
                <li>اختر اسمك من قائمة موظفي المكتبة.</li>
                <li>أدخل الرمز السري الخاص بك (PIN المكون من 4 أرقام).</li>
                <li>سيتم تسجيل حضورك أو انصرافك وحساب ساعات العمل تلقائياً.</li>
              </ol>
            </div>
            <div class="footer-note">
              تم إصدار هذا الرمز بواسطة لوحة تحكم إدارة المكتبة • للاستخدام المكتبي فقط
            </div>
          </div>
          <script>
            window.onload = function() {
              window.print();
            };
          </script>
        </body>
      </html>
    `);
    printWindow.document.close();
  };

  // Download QR Code as raster image (PNG 1024x1024 or JPEG 1024x1024)
  const handleDownloadRaster = (format: 'png' | 'jpeg') => {
    const svgElement = qrPrintRef.current?.querySelector('svg');
    if (!svgElement) {
      toast.error('تعذر العثور على رمز الـ QR');
      return;
    }

    const svgData = new XMLSerializer().serializeToString(svgElement);
    const canvas = document.createElement('canvas');
    const size = 1024;
    canvas.width = size;
    canvas.height = size;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const img = new Image();
    const svgBlob = new Blob([svgData], { type: 'image/svg+xml;charset=utf-8' });
    const url = URL.createObjectURL(svgBlob);

    img.onload = () => {
      // Solid white background with quiet zone
      ctx.fillStyle = '#FFFFFF';
      ctx.fillRect(0, 0, size, size);
      const padding = 80;
      ctx.drawImage(img, padding, padding, size - padding * 2, size - padding * 2);
      URL.revokeObjectURL(url);

      const mimeType = format === 'jpeg' ? 'image/jpeg' : 'image/png';
      const dataUrl = canvas.toDataURL(mimeType, 0.95);
      const ext = format === 'jpeg' ? 'jpg' : 'png';
      const downloadLink = document.createElement('a');
      downloadLink.href = dataUrl;
      downloadLink.download = `attendance_qr_${size}x${size}_${new Date().toISOString().split('T')[0]}.${ext}`;
      document.body.appendChild(downloadLink);
      downloadLink.click();
      document.body.removeChild(downloadLink);
      toast.success(`تم تنزيل رمز QR بدقة فائقة (${ext.toUpperCase()} 1024px)`);
    };
    img.src = url;
  };

  // Download QR Code as SVG vector
  const handleDownloadSVG = () => {
    const svgElement = qrPrintRef.current?.querySelector('svg');
    if (!svgElement) {
      toast.error('تعذر العثور على رمز الـ QR');
      return;
    }

    const svgData = new XMLSerializer().serializeToString(svgElement);
    const svgBlob = new Blob([svgData], { type: 'image/svg+xml;charset=utf-8' });
    const svgUrl = URL.createObjectURL(svgBlob);
    const downloadLink = document.createElement('a');
    downloadLink.href = svgUrl;
    downloadLink.download = `attendance_qr_vector_${new Date().toISOString().split('T')[0]}.svg`;
    document.body.appendChild(downloadLink);
    downloadLink.click();
    document.body.removeChild(downloadLink);
    toast.success('تم تنزيل رمز QR كملف متجهي (SVG)');
  };

  // Get Current Location for Restaurant Coordinates
  const handleCaptureCurrentGps = () => {
    if (!navigator.geolocation) {
      toast.error('المتصفح لا يدعم تحديد الموقع');
      return;
    }
    toast.loading('جاري قراءة إحداثيات موقع المكتبة...');
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        toast.dismiss();
        updateHrSettings({
          latitude: pos.coords.latitude,
          longitude: pos.coords.longitude,
        });
        toast.success(`تم حفظ إحداثيات المكتبة بدقة (${pos.coords.latitude.toFixed(5)}, ${pos.coords.longitude.toFixed(5)})`);
      },
      (err) => {
        toast.dismiss();
        toast.error('تعذر تحديد الموقع. يرجى إعطاء الإذن للمتصفح.');
      },
      { enableHighAccuracy: true }
    );
  };

  // Payroll Calculation Report Data
  const payrollReportData = useMemo(() => {
    return employees.map((emp) => {
      // Find employee attendance records in range
      const empAtt = attendance.filter((a) => {
        const matchesEmp = a.employeeId === emp.id;
        const matchesRange = (!reportDateFrom || a.date >= reportDateFrom) && (!reportDateTo || a.date <= reportDateTo);
        return matchesEmp && matchesRange;
      });

      const attendedDays = empAtt.filter((a) => a.status === 'present' || a.status === 'late').length;
      const lateDays = empAtt.filter((a) => a.status === 'late').length;
      const totalLateMinutes = empAtt.reduce((sum, a) => sum + a.lateMinutes, 0);
      const totalHours = empAtt.reduce((sum, a) => sum + a.hours, 0);

      // Estimate salary & deductions
      const baseSalary = emp.salary;
      const dailyRate = baseSalary > 0 ? baseSalary / 30 : 0;
      const hourlyRate = dailyRate / 8;

      let lateDeductions = 0;
      if (hrSettings.late_deduction_enabled && totalLateMinutes > 0) {
        // Late deduction: hourly rate proportional to late minutes
        lateDeductions = Math.round((totalLateMinutes / 60) * hourlyRate);
      }

      let overtimeBonus = 0;
      if (hrSettings.overtime_enabled && totalHours > attendedDays * 8) {
        const overtimeHours = totalHours - attendedDays * 8;
        overtimeBonus = Math.round(overtimeHours * hourlyRate * 1.5);
      }

      const estimatedNet = Math.max(0, baseSalary - lateDeductions + overtimeBonus);

      return {
        ...emp,
        attendedDays,
        lateDays,
        totalLateMinutes,
        totalHours: Math.round(totalHours * 10) / 10,
        lateDeductions,
        overtimeBonus,
        estimatedNet: Math.round(estimatedNet),
      };
    });
  }, [employees, attendance, reportDateFrom, reportDateTo, hrSettings]);

  // Export CSV for Payroll / Attendance
  const handleExportCSV = () => {
    const headers = ['اسم الموظف', 'الوظيفة', 'الراتب الأساسي', 'أيام الحضور', 'مرات التأخير', 'دقائق التأخير', 'ساعات العمل', 'الخصومات', 'الإضافي', 'صافي الراتب المتوقع'];
    const rows = payrollReportData.map((d) => [
      `"${d.name}"`,
      `"${d.role}"`,
      d.salary,
      d.attendedDays,
      d.lateDays,
      d.totalLateMinutes,
      d.totalHours,
      d.lateDeductions,
      d.overtimeBonus,
      d.estimatedNet,
    ]);

    const csvContent = '\uFEFF' + [headers.join(','), ...rows.map((r) => r.join(','))].join('\n');
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `payroll_report_${reportDateFrom}_to_${reportDateTo}.csv`;
    link.click();
    URL.revokeObjectURL(url);
    toast.success('تم تصدير التقرير بتنسيق CSV بنجاح');
  };

  return (
    <MainLayout
      title="الموارد البشرية ونظام الحضور"
      subtitle="إدارة الموظفين والورديات، تسجيل الحضور بـ QR و PIN، والرواتب"
      actions={
        <div className="flex items-center gap-2">
          <Button
            variant="outline"
            onClick={() => setActiveTab('qr')}
            className="gap-2 text-xs md:text-sm border-primary/30 hover:bg-primary/10"
          >
            <QrCode className="w-4 h-4 text-primary" />
            <span className="hidden sm:inline">QR الحضور</span>
          </Button>
          <Button onClick={() => setIsAddEmployeeOpen(true)} className="gap-2 text-xs md:text-sm">
            <Plus className="w-4 h-4" />
            <span className="hidden sm:inline">موظف جديد</span>
          </Button>
        </div>
      }
    >
      {/* 1. Top KPI Cards */}
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-2.5 sm:gap-3 mb-6">
        <Card className="bg-slate-900/50 border-slate-800">
          <CardContent className="p-3">
            <div className="flex items-center gap-2.5">
              <div className="w-10 h-10 rounded-xl bg-primary/10 text-primary flex items-center justify-center shrink-0">
                <Users className="w-5 h-5" />
              </div>
              <div>
                <p className="text-xl font-bold text-slate-100">{number(employees.length)}</p>
                <p className="text-[11px] text-muted-foreground">إجمالي الموظفين</p>
              </div>
            </div>
          </CardContent>
        </Card>

        <Card className="bg-slate-900/50 border-slate-800">
          <CardContent className="p-3">
            <div className="flex items-center gap-2.5">
              <div className="w-10 h-10 rounded-xl bg-emerald-500/10 text-emerald-400 flex items-center justify-center shrink-0">
                <CheckCircle className="w-5 h-5" />
              </div>
              <div>
                <p className="text-xl font-bold text-emerald-400">{number(presentTodayCount)}</p>
                <p className="text-[11px] text-muted-foreground">حاضرين اليوم</p>
              </div>
            </div>
          </CardContent>
        </Card>

        <Card className="bg-slate-900/50 border-slate-800">
          <CardContent className="p-3">
            <div className="flex items-center gap-2.5">
              <div className="w-10 h-10 rounded-xl bg-rose-500/10 text-rose-400 flex items-center justify-center shrink-0">
                <UserMinus className="w-5 h-5" />
              </div>
              <div>
                <p className="text-xl font-bold text-rose-400">{number(absentTodayCount)}</p>
                <p className="text-[11px] text-muted-foreground">غائبين اليوم</p>
              </div>
            </div>
          </CardContent>
        </Card>

        <Card className="bg-slate-900/50 border-slate-800">
          <CardContent className="p-3">
            <div className="flex items-center gap-2.5">
              <div className="w-10 h-10 rounded-xl bg-amber-500/10 text-amber-400 flex items-center justify-center shrink-0">
                <AlertTriangle className="w-5 h-5" />
              </div>
              <div>
                <p className="text-xl font-bold text-amber-400">{number(lateTodayCount)}</p>
                <p className="text-[11px] text-muted-foreground">متأخرين اليوم</p>
              </div>
            </div>
          </CardContent>
        </Card>

        <Card className="bg-slate-900/50 border-slate-800">
          <CardContent className="p-3">
            <div className="flex items-center gap-2.5">
              <div className="w-10 h-10 rounded-xl bg-indigo-500/10 text-indigo-400 flex items-center justify-center shrink-0">
                <Calendar className="w-5 h-5" />
              </div>
              <div>
                <p className="text-xl font-bold text-indigo-400">{number(onLeaveTodayCount)}</p>
                <p className="text-[11px] text-muted-foreground">في إجازة</p>
              </div>
            </div>
          </CardContent>
        </Card>

        <Card className="bg-slate-900/50 border-slate-800">
          <CardContent className="p-3">
            <div className="flex items-center gap-2.5">
              <div className="w-10 h-10 rounded-xl bg-sky-500/10 text-sky-400 flex items-center justify-center shrink-0">
                <Timer className="w-5 h-5" />
              </div>
              <div>
                <p className="text-xl font-bold text-sky-400">{totalWorkedHoursToday} س</p>
                <p className="text-[11px] text-muted-foreground">ساعات العمل اليوم</p>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Main Tabs */}
      <Tabs value={activeTab} onValueChange={setActiveTab} className="space-y-4">
        <TabsList className="flex-wrap h-auto bg-slate-900/80 border border-slate-800 p-1 rounded-xl">
          <TabsTrigger value="employees" className="gap-2">
            <Users className="w-4 h-4" />
            الموظفون
          </TabsTrigger>
          <TabsTrigger value="attendance" className="gap-2">
            <Clock className="w-4 h-4" />
            حضور اليوم والسجل
          </TabsTrigger>
          <TabsTrigger value="qr" className="gap-2">
            <QrCode className="w-4 h-4" />
            QR Code الحضور
          </TabsTrigger>
          <TabsTrigger value="shifts" className="gap-2">
            <Calendar className="w-4 h-4" />
            الشيفتات ومواعيد العمل
          </TabsTrigger>
          <TabsTrigger value="reports" className="gap-2">
            <Calculator className="w-4 h-4" />
            التقارير ومسير الرواتب
          </TabsTrigger>
          <TabsTrigger value="leaves" className="gap-2">
            <CalendarOff className="w-4 h-4" />
            الإجازات
          </TabsTrigger>
          <TabsTrigger value="settings" className="gap-2">
            <Sliders className="w-4 h-4" />
            إعدادات الموارد البشرية
          </TabsTrigger>
        </TabsList>

        {/* ========================================================================= */}
        {/* TAB 1: EMPLOYEES                                                          */}
        {/* ========================================================================= */}
        <TabsContent value="employees" className="space-y-4">
          {/* Filter Bar */}
          <div className="flex flex-col md:flex-row gap-2 items-center justify-between">
            <div className="relative flex-1 w-full">
              <Search className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
              <Input
                placeholder="بحث بالاسم، الوظيفة، أو رقم الهاتف..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="pr-10"
              />
            </div>
            <div className="flex items-center gap-2 w-full md:w-auto">
              <select
                value={roleFilter}
                onChange={(e) => setRoleFilter(e.target.value)}
                className="h-10 rounded-md border border-input bg-background px-3 text-xs md:text-sm"
              >
                <option value="all">جميع الوظائف</option>
                {allRoles.map((r) => (
                  <option key={r} value={r}>
                    {r}
                  </option>
                ))}
              </select>
              <select
                value={statusFilter}
                onChange={(e) => setStatusFilter(e.target.value)}
                className="h-10 rounded-md border border-input bg-background px-3 text-xs md:text-sm"
              >
                <option value="all">جميع الحالات</option>
                <option value="active">نشط</option>
                <option value="inactive">غير نشط</option>
                <option value="on_leave">إجازة</option>
              </select>
            </div>
          </div>

          {/* Employees Cards Grid */}
          <div className="grid gap-3">
            {filteredEmployees.map((emp) => {
              const todayRec = todayAttendance.find((a) => a.employeeId === emp.id);
              return (
                <Card key={emp.id} className="bg-card hover:border-primary/40 transition-colors">
                  <CardContent className="p-3.5 md:p-4">
                    <div className="flex flex-col md:flex-row md:items-center justify-between gap-3">
                      {/* Avatar & Main Info */}
                      <div className="flex items-center gap-3">
                        <Avatar className="w-12 h-12 border border-slate-800">
                          {emp.photo_url && (
                            <AvatarImage src={emp.photo_url} alt={emp.name} className="object-cover" />
                          )}
                          <AvatarFallback className="bg-primary/10 text-primary font-bold text-lg">
                            {emp.name.charAt(0)}
                          </AvatarFallback>
                        </Avatar>
                        <div>
                          <div className="flex items-center gap-2 flex-wrap">
                            <h3 className="font-bold text-base text-slate-100">{emp.name}</h3>
                            <Badge className={cn('text-[10px] border', statusColors[emp.status])}>
                              {statusLabels[emp.status] || emp.status}
                            </Badge>
                            {!emp.pinSet && (
                              <Badge variant="outline" className="text-[10px] text-amber-400 border-amber-500/30 gap-1 bg-amber-500/10">
                                <KeyRound className="w-3 h-3" />
                                بدون PIN
                              </Badge>
                            )}
                          </div>
                          <p className="text-xs text-primary font-medium">{emp.role}</p>
                          <div className="flex items-center gap-3 text-[11px] text-muted-foreground mt-0.5 flex-wrap">
                            <span className="flex items-center gap-1 font-mono" dir="ltr">
                              <Phone className="w-3 h-3" />
                              {emp.phone || 'بدون هاتف'}
                            </span>
                            {emp.department && <span>• {emp.department}</span>}
                            {emp.national_id && (
                              <span className="flex items-center gap-1 font-mono text-slate-300">
                                <CreditCard className="w-3 h-3 text-slate-400" />
                                {emp.national_id}
                              </span>
                            )}
                            {emp.address && (
                              <span className="flex items-center gap-1 text-slate-300">
                                <MapPin className="w-3 h-3 text-slate-400" />
                                {emp.address}
                              </span>
                            )}
                          </div>
                        </div>
                      </div>

                      {/* Financial & Attendance Snapshot */}
                      <div className="flex items-center gap-4 md:gap-6 border-t md:border-t-0 pt-2 md:pt-0">
                        <div className="text-center">
                          <p className="text-sm font-bold text-slate-100">{currency(emp.salary)}</p>
                          <p className="text-[10px] text-muted-foreground">الراتب الأساسي</p>
                        </div>
                        <div className="text-center">
                          <p className="text-sm font-mono font-medium text-slate-200">
                            {todayRec ? todayRec.checkIn : '--:--'}
                          </p>
                          <p className="text-[10px] text-muted-foreground">حضور اليوم</p>
                        </div>
                        <div className="text-center">
                          <p className="text-sm font-mono font-medium text-slate-200">
                            {todayRec?.checkOut ? todayRec.checkOut : '--:--'}
                          </p>
                          <p className="text-[10px] text-muted-foreground">انصراف اليوم</p>
                        </div>
                      </div>

                      {/* Action Buttons */}
                      <div className="flex items-center gap-1 self-end md:self-center">
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => setProfileEmployee(emp)}
                          className="h-8 gap-1 text-xs"
                          title="عرض ملف الموظف"
                        >
                          <Eye className="w-4 h-4" />
                          <span className="hidden lg:inline">الملف</span>
                        </Button>
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => setPinChangeEmployee(emp)}
                          className="h-8 gap-1 text-xs text-amber-400 hover:text-amber-300"
                          title="تعيين أو تغيير PIN"
                        >
                          <KeyRound className="w-4 h-4" />
                          <span className="hidden lg:inline">PIN</span>
                        </Button>
                        <Button
                          variant="ghost"
                          size="icon"
                          onClick={() => setEditingEmployee(emp)}
                          className="h-8 w-8 text-muted-foreground hover:text-primary"
                          title="تعديل"
                        >
                          <Edit className="w-4 h-4" />
                        </Button>
                        <Button
                          variant="ghost"
                          size="icon"
                          onClick={async () => {
                            if (window.confirm(`هل أنت متأكد من حذف الموظف "${emp.name}"؟`)) {
                              await deleteEmployee(emp.id);
                            }
                          }}
                          className="h-8 w-8 text-muted-foreground hover:text-rose-400"
                          title="حذف"
                        >
                          <Trash2 className="w-4 h-4" />
                        </Button>
                      </div>
                    </div>
                  </CardContent>
                </Card>
              );
            })}

            {filteredEmployees.length === 0 && (
              <div className="text-center py-16 text-muted-foreground">
                <Users className="w-12 h-12 mx-auto mb-3 opacity-30" />
                <p>لم يتم العثور على أي موظف مطابق</p>
              </div>
            )}
          </div>
        </TabsContent>

        {/* ========================================================================= */}
        {/* TAB 2: ATTENDANCE & MANUAL CORRECTION                                     */}
        {/* ========================================================================= */}
        <TabsContent value="attendance" className="space-y-4">
          <Card>
            <CardHeader className="pb-3">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                <div>
                  <CardTitle className="text-lg">سجل الحضور والانصراف</CardTitle>
                  <CardDescription className="text-xs">
                    متابعة حضور وانصراف الموظفين وإجراء التصحيحات اليدوية عند الضرورة
                  </CardDescription>
                </div>
                <div className="flex items-center gap-2">
                  <Input
                    type="date"
                    value={attDateFilter}
                    onChange={(e) => setAttDateFilter(e.target.value)}
                    className="w-auto h-9 text-xs"
                  />
                  <Button
                    size="sm"
                    onClick={() => {
                      setCorrectionRecord(null);
                      setCorrectionForm({
                        employee_id: employees[0]?.id || '',
                        date: attDateFilter || new Date().toISOString().split('T')[0],
                        checkIn: '09:00',
                        checkOut: '17:00',
                        status: 'present',
                        reason: '',
                      });
                      setCorrectionModalOpen(true);
                    }}
                    className="gap-1.5 h-9 text-xs"
                  >
                    <Plus className="w-4 h-4" />
                    تسجيل/تصحيح يدوي
                  </Button>
                </div>
              </div>
            </CardHeader>
            <CardContent>
              {/* Filter Row */}
              <div className="flex gap-2 mb-4">
                <div className="relative flex-1">
                  <Search className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                  <Input
                    placeholder="ابحث باسم الموظف..."
                    value={attSearchQuery}
                    onChange={(e) => setAttSearchQuery(e.target.value)}
                    className="pr-10 h-9 text-xs"
                  />
                </div>
                <select
                  value={attStatusFilter}
                  onChange={(e) => setAttStatusFilter(e.target.value)}
                  className="h-9 rounded-md border border-input bg-background px-3 text-xs"
                >
                  <option value="all">جميع الحالات</option>
                  <option value="present">حاضر</option>
                  <option value="late">متأخر</option>
                  <option value="early_leave">انصراف مبكر</option>
                  <option value="on_leave">إجازة</option>
                  <option value="absent">غائب</option>
                </select>
              </div>

              {/* Mobile Attendance Cards (< md) */}
              <div className="md:hidden divide-y divide-border border rounded-lg bg-slate-950/20">
                {filteredAttendance.length === 0 ? (
                  <div className="text-center py-10 text-muted-foreground text-xs p-4">
                    لا توجد سجلات حضور مسجلة لهذا التاريخ
                  </div>
                ) : (
                  filteredAttendance.map((rec) => (
                    <div key={rec.id} className="p-3.5 space-y-2.5">
                      <div className="flex items-start justify-between gap-2">
                        <div>
                          <p className="font-bold text-slate-100 text-sm">{rec.employeeName}</p>
                          <p className="text-[11px] text-muted-foreground">
                            {rec.employeeRole} • <span className="font-mono">{rec.date}</span>
                          </p>
                        </div>
                        <div className="text-left">
                          <Badge className={cn('text-[10px] border', statusColors[rec.status])}>
                            {statusLabels[rec.status] || rec.status}
                          </Badge>
                          {rec.isManualCorrection && (
                            <span className="block text-[9px] text-amber-400 mt-0.5 text-center">تعديل يدوي</span>
                          )}
                        </div>
                      </div>

                      <div className="grid grid-cols-4 gap-1.5 text-center bg-slate-900/40 p-2 rounded-lg border border-slate-800/60 text-xs">
                        <div>
                          <span className="text-[10px] text-muted-foreground block">حضور</span>
                          <span className="font-mono text-emerald-400 font-medium">{rec.checkIn || '-'}</span>
                        </div>
                        <div>
                          <span className="text-[10px] text-muted-foreground block">انصراف</span>
                          <span className="font-mono text-indigo-400 font-medium">{rec.checkOut || '-'}</span>
                        </div>
                        <div>
                          <span className="text-[10px] text-muted-foreground block">ساعات</span>
                          <span className="font-mono">{rec.hours > 0 ? `${rec.hours}س` : '-'}</span>
                        </div>
                        <div>
                          <span className="text-[10px] text-muted-foreground block">تأخير</span>
                          <span className="font-mono text-amber-400 font-bold">{rec.lateMinutes > 0 ? `${rec.lateMinutes}د` : '-'}</span>
                        </div>
                      </div>

                      <div className="flex items-center justify-end gap-1.5 pt-1">
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => {
                            setCorrectionRecord(rec);
                            setCorrectionForm({
                              employee_id: rec.employeeId,
                              date: rec.date,
                              checkIn: rec.checkIn || '09:00',
                              checkOut: rec.checkOut || '17:00',
                              status: rec.status || 'present',
                              reason: rec.correctionReason || '',
                            });
                            setCorrectionModalOpen(true);
                          }}
                          className="h-8 text-xs gap-1"
                        >
                          <Edit className="w-3.5 h-3.5" />
                          تعديل
                        </Button>
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => setDeleteAttendanceRecord(rec)}
                          className="h-8 text-xs text-rose-400 hover:text-rose-300 hover:bg-rose-500/10 gap-1"
                          title="حذف سجل الحضور"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                          حذف
                        </Button>
                      </div>
                    </div>
                  ))
                )}
              </div>

              {/* Desktop Attendance Table (>= md) */}
              <div className="hidden md:block overflow-x-auto rounded-lg border">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>الموظف</TableHead>
                      <TableHead>التاريخ</TableHead>
                      <TableHead>الحضور</TableHead>
                      <TableHead>الانصراف</TableHead>
                      <TableHead>ساعات العمل</TableHead>
                      <TableHead>التأخير</TableHead>
                      <TableHead>الحالة</TableHead>
                      <TableHead className="text-left">الإجراءات</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {filteredAttendance.map((rec) => (
                      <TableRow key={rec.id}>
                        <TableCell>
                          <div>
                            <p className="font-bold text-slate-100 text-sm">{rec.employeeName}</p>
                            <p className="text-[11px] text-muted-foreground">{rec.employeeRole}</p>
                          </div>
                        </TableCell>
                        <TableCell className="font-mono text-xs">{rec.date}</TableCell>
                        <TableCell className="font-mono text-sm font-medium text-emerald-400">
                          {rec.checkIn || '-'}
                        </TableCell>
                        <TableCell className="font-mono text-sm font-medium text-indigo-400">
                          {rec.checkOut || '-'}
                        </TableCell>
                        <TableCell className="text-xs">
                          {rec.hours > 0 ? `${rec.hours} ساعة` : '-'}
                        </TableCell>
                        <TableCell className="text-xs">
                          {rec.lateMinutes > 0 ? (
                            <span className="text-amber-400 font-bold">{rec.lateMinutes} دقيقة</span>
                          ) : (
                            '-'
                          )}
                        </TableCell>
                        <TableCell>
                          <Badge className={cn('text-[10px] border', statusColors[rec.status])}>
                            {statusLabels[rec.status] || rec.status}
                          </Badge>
                          {rec.isManualCorrection && (
                            <span className="block text-[9px] text-amber-400 mt-0.5">تعديل يدوي</span>
                          )}
                        </TableCell>
                        <TableCell className="text-left">
                          <div className="flex items-center gap-1 justify-end">
                            <Button
                              variant="ghost"
                              size="sm"
                              onClick={() => {
                                setCorrectionRecord(rec);
                                setCorrectionForm({
                                  employee_id: rec.employeeId,
                                  date: rec.date,
                                  checkIn: rec.checkIn || '09:00',
                                  checkOut: rec.checkOut || '17:00',
                                  status: rec.status || 'present',
                                  reason: rec.correctionReason || '',
                                });
                                setCorrectionModalOpen(true);
                              }}
                              className="h-8 text-xs gap-1"
                            >
                              <Edit className="w-3.5 h-3.5" />
                              تعديل
                            </Button>
                            <Button
                              variant="ghost"
                              size="sm"
                              onClick={() => setDeleteAttendanceRecord(rec)}
                              className="h-8 text-xs text-rose-400 hover:text-rose-300 hover:bg-rose-500/10 gap-1"
                              title="حذف سجل الحضور"
                            >
                              <Trash2 className="w-3.5 h-3.5" />
                              حذف
                            </Button>
                          </div>
                        </TableCell>
                      </TableRow>
                    ))}
                    {filteredAttendance.length === 0 && (
                      <TableRow>
                        <TableCell colSpan={8} className="text-center py-8 text-muted-foreground">
                          لا توجد سجلات حضور مسجلة لهذا التاريخ
                        </TableCell>
                      </TableRow>
                    )}
                  </TableBody>
                </Table>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        {/* ========================================================================= */}
        {/* TAB 3: QR CODE ATTENDANCE                                                 */}
        {/* ========================================================================= */}
        <TabsContent value="qr" className="space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6 items-start">
            {/* QR Visual Card */}
            <Card className="md:col-span-1 border-primary/30 text-center p-6 bg-slate-900/50">
              <CardTitle className="text-base mb-1">رمز QR الحضور والانصراف</CardTitle>
              <CardDescription className="text-xs mb-4">
                يتم وضعه في مدخل المكتبة أو لوحة الموظفين
              </CardDescription>

              <div
                ref={qrPrintRef}
                className="bg-white p-3 sm:p-4 rounded-2xl inline-block shadow-xl border border-slate-200 mb-4 max-w-full"
              >
                <div className="w-[180px] sm:w-[220px] aspect-square mx-auto flex items-center justify-center">
                  <QRCodeSVG
                    value={attendanceUrl}
                    size={undefined}
                    className="w-full h-full"
                    level="H"
                    includeMargin={true}
                  />
                </div>
              </div>

              <p className="text-xs text-muted-foreground mb-4">
                امسح الرمز بواسطة كاميرا الهاتف لفتح شاشة الحضور
              </p>

              <div className="flex flex-col gap-2">
                <Button onClick={handlePrintOrPDF} className="w-full gap-2 text-xs">
                  <Printer className="w-4 h-4" />
                  طباعة / تصدير PDF (A4)
                </Button>

                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <Button variant="outline" className="w-full gap-2 text-xs justify-between">
                      <span className="flex items-center gap-1.5">
                        <Download className="w-4 h-4" />
                        خيارات تنزيل الرمز
                      </span>
                      <ChevronDown className="w-3.5 h-3.5 opacity-70" />
                    </Button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="center" className="w-60 text-xs">
                    <DropdownMenuItem onClick={() => handleDownloadRaster('png')} className="gap-2 cursor-pointer py-2">
                      <ImageIcon className="w-4 h-4 text-emerald-400" />
                      <div>
                        <div className="font-medium">تحميل عالي الدقة (PNG)</div>
                        <div className="text-[10px] text-muted-foreground">1024x1024 بكسل بجودة فائقة</div>
                      </div>
                    </DropdownMenuItem>
                    <DropdownMenuItem onClick={() => handleDownloadRaster('jpeg')} className="gap-2 cursor-pointer py-2">
                      <ImageIcon className="w-4 h-4 text-blue-400" />
                      <div>
                        <div className="font-medium">تحميل صورة (JPG)</div>
                        <div className="text-[10px] text-muted-foreground">1024x1024 بكسل للمشاركة</div>
                      </div>
                    </DropdownMenuItem>
                    <DropdownMenuItem onClick={handleDownloadSVG} className="gap-2 cursor-pointer py-2">
                      <FileDown className="w-4 h-4 text-amber-400" />
                      <div>
                        <div className="font-medium">تحميل ملف متجهي (SVG)</div>
                        <div className="text-[10px] text-muted-foreground">قابل للتكبير دون فقدان الجودة</div>
                      </div>
                    </DropdownMenuItem>
                    <DropdownMenuSeparator />
                    <DropdownMenuItem onClick={handlePrintOrPDF} className="gap-2 cursor-pointer py-2">
                      <Printer className="w-4 h-4 text-indigo-400" />
                      <div>
                        <div className="font-medium">مستند A4 جاهز (PDF)</div>
                        <div className="text-[10px] text-muted-foreground">مع تعليمات الاستخدام للموظفين</div>
                      </div>
                    </DropdownMenuItem>
                  </DropdownMenuContent>
                </DropdownMenu>
              </div>
            </Card>

            {/* QR Security & Settings Card */}
            <Card className="md:col-span-2 border-slate-800">
              <CardHeader>
                <CardTitle className="text-base flex items-center justify-between">
                  <span>أمان رمز الحضور والرابط المباشر</span>
                  <Badge variant="outline" className="text-emerald-400 border-emerald-500/30 bg-emerald-500/10">
                    نشط وآمن
                  </Badge>
                </CardTitle>
                <CardDescription className="text-xs">
                  الرابط مشفر برمز فريد خاص بفرع المكتبة لمنع التخمين أو التلاعب
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                {/* Attendance URL Input & Copy */}
                <div className="space-y-1.5">
                  <Label className="text-xs font-medium">رابط صفحة الحضور العامة</Label>
                  <div className="flex gap-2">
                    <Input value={attendanceUrl} readOnly dir="ltr" className="font-mono text-xs" />
                    <Button onClick={handleCopyLink} variant="outline" className="gap-1.5 shrink-0 text-xs">
                      <Copy className="w-4 h-4" />
                      نسخ
                    </Button>
                  </div>
                </div>

                {/* Token Rotation Section */}
                <div className="p-4 rounded-xl bg-slate-950/60 border border-slate-800 space-y-3">
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <h4 className="text-sm font-bold text-slate-100 flex items-center gap-1.5">
                        <RefreshCw className="w-4 h-4 text-primary" />
                        تدوير وإعادة إنشاء رمز الحضور (Token Rotation)
                      </h4>
                      <p className="text-xs text-muted-foreground mt-1 leading-relaxed">
                        في حال شعرت بتسريب رمز الـ QR أو أردت إلغاء الرمز القديم وطباعة رمز جديد للمكتبة، يمكنك إعادة
                        التدوير فوراً. ستتوقف جميع الروابط القديمة ولن تؤثر على السجلات السابقة.
                      </p>
                    </div>
                    <Button
                      onClick={async () => {
                        if (
                          window.confirm(
                            'هل أنت متأكد من إعادة إنشاء رمز الحضور؟ سيتم إبطال رمز QR الحالي فوراً وتوليد رمز جديد.'
                          )
                        ) {
                          await rotateQrToken();
                        }
                      }}
                      variant="destructive"
                      size="sm"
                      className="shrink-0 gap-1.5 text-xs"
                    >
                      <RefreshCw className="w-3.5 h-3.5" />
                      إعادة تدوير الرمز
                    </Button>
                  </div>
                </div>

                {/* Security Guarantees Checklist */}
                <div className="space-y-2 pt-2 border-t border-slate-800">
                  <h4 className="text-xs font-bold text-slate-300">معايير الأمان المطبقة:</h4>
                  <ul className="text-xs text-muted-foreground space-y-1.5">
                    <li className="flex items-center gap-2">
                      <CheckCircle2 className="w-4 h-4 text-emerald-400" />
                      الرمز لا يحتوي على أي أرقام PIN أو بيانات حساسة للموظفين.
                    </li>
                    <li className="flex items-center gap-2">
                      <CheckCircle2 className="w-4 h-4 text-emerald-400" />
                      التحقق بالـ PIN محمي ضد التخمين (Rate Limiting) بحظر بعد 5 محاولات خاطئة.
                    </li>
                    <li className="flex items-center gap-2">
                      <CheckCircle2 className="w-4 h-4 text-emerald-400" />
                      منع الحضور المزدوج وتكرار العمليات عبر المعاملات الذرية (Transactions & Idempotency).
                    </li>
                  </ul>
                </div>
              </CardContent>
            </Card>
          </div>
        </TabsContent>

        {/* ========================================================================= */}
        {/* TAB 4: SHIFTS MANAGEMENT                                                  */}
        {/* ========================================================================= */}
        <TabsContent value="shifts" className="space-y-4">
          <div className="flex justify-between items-center">
            <div>
              <h3 className="text-base font-bold text-slate-100">الورديات ومواعيد العمل</h3>
              <p className="text-xs text-muted-foreground">تحديد مواعيد العمل وفترات السماح لحساب التأخير بدقة</p>
            </div>
            <Button
              onClick={() => {
                setEditingShift(null);
                setShiftForm({
                  name: '',
                  startTime: '09:00',
                  endTime: '17:00',
                  gracePeriod: 10,
                  breakMinutes: 0,
                  days: ['السبت', 'الأحد', 'الاثنين', 'الثلاثاء', 'الأربعاء', 'الخميس'],
                });
                setIsAddShiftOpen(true);
              }}
              size="sm"
              className="gap-2 text-xs"
            >
              <Plus className="w-4 h-4" />
              وردية جديدة
            </Button>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            {dbShifts.map((s) => (
              <Card key={s.id} className="relative group bg-card">
                <CardContent className="p-4">
                  <div className="flex items-center justify-between mb-2">
                    <h4 className="font-bold text-base text-slate-100">{s.name}</h4>
                    <Badge variant="outline" className="text-xs">
                      سماح {s.gracePeriod ?? 10} دقيقة
                    </Badge>
                  </div>
                  <div className="flex items-center gap-2 mb-3 text-sm text-primary font-medium">
                    <Clock className="w-4 h-4 text-muted-foreground" />
                    <span>{s.startTime}</span>
                    <span className="text-muted-foreground">-</span>
                    <span>{s.endTime}</span>
                  </div>
                  <div className="flex flex-wrap gap-1 mb-4">
                    {(s.days || []).map((day: string) => (
                      <Badge key={day} variant="secondary" className="text-[10px]">
                        {day}
                      </Badge>
                    ))}
                  </div>
                  <div className="flex items-center justify-end gap-1 border-t pt-3">
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => {
                        setEditingShift(s);
                        setShiftForm({
                          name: s.name,
                          startTime: s.startTime,
                          endTime: s.endTime,
                          gracePeriod: s.gracePeriod ?? 10,
                          breakMinutes: s.breakMinutes ?? 0,
                          days: s.days || [],
                        });
                        setIsAddShiftOpen(true);
                      }}
                      className="h-7 text-xs gap-1"
                    >
                      <Edit className="w-3.5 h-3.5" />
                      تعديل
                    </Button>
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={async () => {
                        if (window.confirm('هل أنت متأكد من حذف هذه الوردية؟')) {
                          await deleteShift(s.id);
                        }
                      }}
                      className="h-7 text-xs text-rose-400 hover:text-rose-300 gap-1"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                      حذف
                    </Button>
                  </div>
                </CardContent>
              </Card>
            ))}

            {dbShifts.length === 0 && (
              <div className="col-span-full py-12 text-center text-muted-foreground">
                <Clock className="w-12 h-12 mx-auto mb-2 opacity-30" />
                <p>لم يتم إنشاء أي وردية بعد</p>
              </div>
            )}
          </div>
        </TabsContent>

        {/* ========================================================================= */}
        {/* TAB 5: REPORTS & PAYROLL INTEGRATION                                      */}
        {/* ========================================================================= */}
        <TabsContent value="reports" className="space-y-6">
          <PayrollOverviewCards kpis={getKPIs(getPayrollForPeriod(payrollPeriod, employees, attendance, hrSettings, leaves))} />
          <PayrollTable
            periodRecords={getPayrollForPeriod(payrollPeriod, employees, attendance, hrSettings, leaves)}
            allPayments={salaryPayments}
            allAdvances={advances}
            employees={employees}
            currentPeriod={payrollPeriod}
            onPeriodChange={setPayrollPeriod}
            onDisbursePayment={disburseSalaryPayment}
            onVoidPayment={voidSalaryPayment}
            onCreateAdvance={createAdvance}
            onDeleteAdvance={deleteAdvance}
            onCancelAdvance={cancelAdvance}
            isSubmittingPayment={isSubmittingPayment}
          />
        </TabsContent>

        {/* ========================================================================= */}
        {/* TAB 6: LEAVES MANAGEMENT                                                  */}
        {/* ========================================================================= */}
        <TabsContent value="leaves" className="space-y-4">
          <LeavesTab
            tenantId={tenantId || 'tenant_main'}
            branchId={branchId}
            employees={employees}
            shifts={dbShifts || []}
            user={user}
            preselectedEmployeeId={preselectedLeaveEmployeeId}
            onClearPreselectedEmployee={() => setPreselectedLeaveEmployeeId(null)}
          />
        </TabsContent>

        {/* ========================================================================= */}
        {/* TAB 6: HR SETTINGS                                                        */}
        {/* ========================================================================= */}
        <TabsContent value="settings" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle className="text-base">إعدادات وقواعد الموارد البشرية والحضور</CardTitle>
              <CardDescription className="text-xs">
                تخصيص قواعد الحضور، التقييد الجغرافي، وفترات السماح والخصومات
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-6">
              {/* Feature Toggles */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="flex items-center justify-between p-3.5 rounded-xl border bg-card">
                  <div>
                    <h4 className="font-bold text-sm text-slate-100">تفعيل نظام الحضور</h4>
                    <p className="text-xs text-muted-foreground">السماح بتسجيل الحضور والانصراف في النظام</p>
                  </div>
                  <Switch
                    checked={hrSettings.attendance_enabled}
                    onCheckedChange={(c) => updateHrSettings({ attendance_enabled: c })}
                  />
                </div>

                <div className="flex items-center justify-between p-3.5 rounded-xl border bg-card">
                  <div>
                    <h4 className="font-bold text-sm text-slate-100">تسجيل الحضور عبر QR</h4>
                    <p className="text-xs text-muted-foreground">تمكين مسح رمز QR بواسطة أجهزة الموظفين</p>
                  </div>
                  <Switch
                    checked={hrSettings.qr_attendance_enabled}
                    onCheckedChange={(c) => updateHrSettings({ qr_attendance_enabled: c })}
                  />
                </div>
              </div>

              {/* Geofence & Location Restriction */}
              <div className="p-4 rounded-xl border bg-slate-950/40 space-y-4">
                <div className="flex items-center justify-between">
                  <div>
                    <h4 className="font-bold text-sm text-slate-100 flex items-center gap-2">
                      <MapPin className="w-4 h-4 text-primary" />
                      تقييد الحضور داخل نطاق المكتبة (Geofencing)
                    </h4>
                    <p className="text-xs text-muted-foreground mt-0.5">
                      إلزام الموظف بأن يكون متواجداً جغرافياً داخل مسافة محددة من المكتبة
                    </p>
                  </div>
                  <Switch
                    checked={hrSettings.location_restriction}
                    onCheckedChange={(c) => updateHrSettings({ location_restriction: c })}
                  />
                </div>

                {hrSettings.location_restriction && (
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4 pt-3 border-t border-slate-800">
                    <div className="space-y-2">
                      <Label className="text-xs">إحداثيات المكتبة (Latitude & Longitude)</Label>
                      <div className="flex gap-2">
                        <Input
                          placeholder="Latitude"
                          value={hrSettings.latitude ?? ''}
                          onChange={(e) => updateHrSettings({ latitude: parseFloat(e.target.value) || null })}
                          className="h-9 text-xs font-mono"
                          dir="ltr"
                        />
                        <Input
                          placeholder="Longitude"
                          value={hrSettings.longitude ?? ''}
                          onChange={(e) => updateHrSettings({ longitude: parseFloat(e.target.value) || null })}
                          className="h-9 text-xs font-mono"
                          dir="ltr"
                        />
                      </div>
                      <Button
                        type="button"
                        onClick={handleCaptureCurrentGps}
                        variant="secondary"
                        size="sm"
                        className="w-full gap-1.5 text-xs h-8"
                      >
                        <MapPin className="w-3.5 h-3.5 text-primary" />
                        حفظ الموقع الحالي للمكتبة تلقائياً
                      </Button>
                    </div>

                    <div className="space-y-2">
                      <div className="flex justify-between items-center text-xs">
                        <Label>نصف القطر المسموح به (بالمتر):</Label>
                        <span className="font-bold text-primary">{hrSettings.geofence_radius} متر</span>
                      </div>
                      <Slider
                        value={[hrSettings.geofence_radius]}
                        min={30}
                        max={500}
                        step={10}
                        onValueChange={([val]) => updateHrSettings({ geofence_radius: val })}
                      />
                      <p className="text-[11px] text-muted-foreground">
                        نوصي بقيمة بين 50 إلى 150 متراً لتغطية مساحة المكتبة بدقة
                      </p>
                    </div>
                  </div>
                )}
              </div>

              {/* Payroll Rules Toggles */}
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                <div className="flex items-center justify-between p-3.5 rounded-xl border bg-card">
                  <div>
                    <h4 className="font-bold text-sm text-slate-100">تطبيق خصم التأخير</h4>
                    <p className="text-[11px] text-muted-foreground">خصم مالي تناسبي مع دقائق التأخير</p>
                  </div>
                  <Switch
                    checked={hrSettings.late_deduction_enabled}
                    onCheckedChange={(c) => updateHrSettings({ late_deduction_enabled: c })}
                  />
                </div>

                <div className="flex items-center justify-between p-3.5 rounded-xl border bg-card">
                  <div>
                    <h4 className="font-bold text-sm text-slate-100">خصم الانصراف المبكر</h4>
                    <p className="text-[11px] text-muted-foreground">خصم عند الانصراف قبل نهاية الوردية</p>
                  </div>
                  <Switch
                    checked={hrSettings.early_leave_deduction_enabled}
                    onCheckedChange={(c) => updateHrSettings({ early_leave_deduction_enabled: c })}
                  />
                </div>

                <div className="flex items-center justify-between p-3.5 rounded-xl border bg-card">
                  <div>
                    <h4 className="font-bold text-sm text-slate-100">حساب الساعات الإضافية</h4>
                    <p className="text-[11px] text-muted-foreground">مكافأة لساعات العمل الزائدة عن الوردية</p>
                  </div>
                  <Switch
                    checked={hrSettings.overtime_enabled}
                    onCheckedChange={(c) => updateHrSettings({ overtime_enabled: c })}
                  />
                </div>
              </div>

              {/* Public Application URL */}
              <div className="p-4 rounded-xl border bg-slate-950/40 space-y-2">
                <Label className="text-xs font-bold text-slate-200">
                  رابط النطاق الفعلي لصفحة الحضور (Production Base URL)
                </Label>
                <p className="text-[11px] text-muted-foreground">
                  النطاق المستخدم لإنشاء روابط ورموز QR لضمان عملها عند المسح من هواتف الموظفين الخارجية.
                </p>
                <div className="flex gap-2 pt-1">
                  <Input
                    placeholder="https://mksystem-rose.vercel.app"
                    value={hrSettings.public_app_url || ''}
                    onChange={(e) => updateHrSettings({ public_app_url: e.target.value })}
                    className="h-9 text-xs font-mono"
                    dir="ltr"
                  />
                </div>
              </div>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>

      {/* ========================================================================= */}
      {/* MODAL: ADD EMPLOYEE                                                       */}
      {/* ========================================================================= */}
      <Dialog open={isAddEmployeeOpen} onOpenChange={setIsAddEmployeeOpen}>
        <DialogContent className="max-w-md max-h-[90dvh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>إضافة موظف جديد</DialogTitle>
            <DialogDescription className="text-xs">
              أدخل بيانات الموظف ورقم PIN السري الخاص به لتسجيل الحضور
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-3.5 py-2">
            {/* Photo & Live Avatar Preview */}
            <div className="flex items-center gap-3 p-3 bg-muted/20 border border-border rounded-xl">
              <Avatar className="w-16 h-16 border-2 border-primary/20 shrink-0 bg-background shadow-sm">
                {newEmployee.photo_url && (
                  <AvatarImage src={newEmployee.photo_url} alt="معاينة" className="object-cover" />
                )}
                <AvatarFallback className="bg-primary/10 text-primary font-bold text-xl">
                  {newEmployee.name?.charAt(0) || <ImageIcon className="w-6 h-6 opacity-40" />}
                </AvatarFallback>
              </Avatar>
              <div className="flex-1 space-y-1">
                <Label className="text-xs font-semibold">رابط الصورة الشخصية (Direct Image URL)</Label>
                <Input
                  placeholder="https://example.com/photo.jpg"
                  value={newEmployee.photo_url}
                  onChange={(e) => setNewEmployee({ ...newEmployee, photo_url: e.target.value })}
                  dir="ltr"
                  className="h-9 text-xs font-mono"
                />
              </div>
            </div>

            {/* Name & Role */}
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1">
                <Label className="text-xs">الاسم الكامل *</Label>
                <Input
                  placeholder="مثال: أحمد محمد علي"
                  value={newEmployee.name}
                  onChange={(e) => setNewEmployee({ ...newEmployee, name: e.target.value })}
                />
              </div>
              <div className="space-y-1">
                <Label className="text-xs">المسمى الوظيفي *</Label>
                <Input
                  placeholder="مثال: كاشير، أمين مكتبة"
                  value={newEmployee.role}
                  onChange={(e) => setNewEmployee({ ...newEmployee, role: e.target.value })}
                />
              </div>
            </div>

            {/* National ID & Phone */}
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1">
                <Label className="text-xs flex items-center gap-1">
                  <CreditCard className="w-3.5 h-3.5 text-muted-foreground" />
                  رقم البطاقة / الرقم القومي
                </Label>
                <Input
                  placeholder="الرقم القومي (14 رقم)"
                  value={newEmployee.national_id}
                  onChange={(e) => setNewEmployee({ ...newEmployee, national_id: e.target.value })}
                  dir="ltr"
                  className="font-mono text-xs"
                />
              </div>
              <div className="space-y-1">
                <Label className="text-xs flex items-center gap-1">
                  <Phone className="w-3.5 h-3.5 text-muted-foreground" />
                  رقم الهاتف الأساسي *
                </Label>
                <Input
                  placeholder="01XXXXXXXXX"
                  value={newEmployee.phone}
                  onChange={(e) => setNewEmployee({ ...newEmployee, phone: e.target.value })}
                  dir="ltr"
                  className="font-mono text-xs"
                />
              </div>
            </div>

            {/* Address & Emergency Phone */}
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1">
                <Label className="text-xs flex items-center gap-1">
                  <MapPin className="w-3.5 h-3.5 text-muted-foreground" />
                  العنوان بالتفصيل
                </Label>
                <Input
                  placeholder="المدينة، الشارع، رقم العقار"
                  value={newEmployee.address}
                  onChange={(e) => setNewEmployee({ ...newEmployee, address: e.target.value })}
                />
              </div>
              <div className="space-y-1">
                <Label className="text-xs flex items-center gap-1">
                  <Phone className="w-3.5 h-3.5 text-rose-500" />
                  هاتف الطوارئ / صلة القرابة
                </Label>
                <Input
                  placeholder="رقم الطوارئ"
                  value={newEmployee.emergency_contact}
                  onChange={(e) => setNewEmployee({ ...newEmployee, emergency_contact: e.target.value })}
                  dir="ltr"
                  className="font-mono text-xs"
                />
              </div>
            </div>

            {/* Department & Base Salary */}
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1">
                <Label className="text-xs">القسم / الإدارة</Label>
                <Input
                  placeholder="مثال: المبيعات، المستودع"
                  value={newEmployee.department}
                  onChange={(e) => setNewEmployee({ ...newEmployee, department: e.target.value })}
                />
              </div>
              <div className="space-y-1">
                <Label className="text-xs">الراتب الأساسي</Label>
                <Input
                  type="number"
                  placeholder="0"
                  value={newEmployee.salary}
                  onChange={(e) => setNewEmployee({ ...newEmployee, salary: e.target.value })}
                />
              </div>
            </div>

            {/* Shift & Employment Type */}
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1">
                <Label className="text-xs">الوردية الافتراضية</Label>
                <select
                  value={newEmployee.shift_id}
                  onChange={(e) => setNewEmployee({ ...newEmployee, shift_id: e.target.value })}
                  className="w-full h-10 rounded-md border border-input bg-background px-3 text-xs"
                >
                  <option value="">بدون وردية محددة</option>
                  {dbShifts.map((s) => (
                    <option key={s.id} value={s.id}>
                      {s.name} ({s.startTime} - {s.endTime})
                    </option>
                  ))}
                </select>
              </div>
              <div className="space-y-1">
                <Label className="text-xs">نوع التوظيف</Label>
                <select
                  value={newEmployee.employee_type}
                  onChange={(e) => setNewEmployee({ ...newEmployee, employee_type: e.target.value })}
                  className="w-full h-10 rounded-md border border-input bg-background px-3 text-xs"
                >
                  <option value="full_time">دوام كامل</option>
                  <option value="part_time">دوام جزئي</option>
                  <option value="contract">عقد</option>
                  <option value="daily">يومية</option>
                </select>
              </div>
            </div>

            {/* Email & Hire Date */}
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1">
                <Label className="text-xs flex items-center gap-1">
                  <Mail className="w-3.5 h-3.5 text-muted-foreground" />
                  البريد الإلكتروني
                </Label>
                <Input
                  type="email"
                  placeholder="name@example.com"
                  value={newEmployee.email}
                  onChange={(e) => setNewEmployee({ ...newEmployee, email: e.target.value })}
                  dir="ltr"
                  className="text-xs"
                />
              </div>
              <div className="space-y-1">
                <Label className="text-xs flex items-center gap-1">
                  <Calendar className="w-3.5 h-3.5 text-muted-foreground" />
                  تاريخ بدء العمل
                </Label>
                <Input
                  type="date"
                  value={newEmployee.hire_date}
                  onChange={(e) => setNewEmployee({ ...newEmployee, hire_date: e.target.value })}
                  className="text-xs"
                />
              </div>
            </div>

            {/* Notes */}
            <div className="space-y-1">
              <Label className="text-xs flex items-center gap-1">
                <FileText className="w-3.5 h-3.5 text-muted-foreground" />
                ملاحظات وتفاصيل إضافية
              </Label>
              <Input
                placeholder="أي ملاحظات أو شروط أو تفاصيل تخص الموظف..."
                value={newEmployee.notes}
                onChange={(e) => setNewEmployee({ ...newEmployee, notes: e.target.value })}
                className="text-xs"
              />
            </div>

            {/* PIN Input */}
            <div className="p-3 bg-slate-950/60 rounded-xl border border-slate-800 space-y-1.5">
              <Label className="text-xs font-bold text-primary flex items-center gap-1.5">
                <Lock className="w-3.5 h-3.5" />
                رمز PIN السري (4 أرقام لتسجيل الحضور)
              </Label>
              <Input
                type="password"
                maxLength={4}
                placeholder="••••"
                value={newEmployee.pin}
                onChange={(e) => setNewEmployee({ ...newEmployee, pin: e.target.value.replace(/\D/g, '').slice(0, 4) })}
                className="text-center font-mono text-xl tracking-widest h-11"
                dir="ltr"
              />
              <p className="text-[11px] text-muted-foreground">
                يستخدمه الموظف لتأكيد هويته عند مسح QR Code الحضور والانصراف
              </p>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setIsAddEmployeeOpen(false)}>
              إلغاء
            </Button>
            <Button onClick={handleSaveEmployee} disabled={!newEmployee.name || !newEmployee.role}>
              حفظ الموظف
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ========================================================================= */}
      {/* MODAL: EDIT EMPLOYEE                                                      */}
      {/* ========================================================================= */}
      <Dialog open={!!editingEmployee} onOpenChange={(open) => !open && setEditingEmployee(null)}>
        <DialogContent className="max-w-md max-h-[90dvh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>تعديل بيانات الموظف</DialogTitle>
          </DialogHeader>
          {editingEmployee && (
            <div className="space-y-3.5 py-2">
              {/* Photo & Live Avatar Preview */}
              <div className="flex items-center gap-3 p-3 bg-muted/20 border border-border rounded-xl">
                <Avatar className="w-16 h-16 border-2 border-primary/20 shrink-0 bg-background shadow-sm">
                  {editingEmployee.photo_url && (
                    <AvatarImage src={editingEmployee.photo_url} alt="معاينة" className="object-cover" />
                  )}
                  <AvatarFallback className="bg-primary/10 text-primary font-bold text-xl">
                    {editingEmployee.name?.charAt(0) || <ImageIcon className="w-6 h-6 opacity-40" />}
                  </AvatarFallback>
                </Avatar>
                <div className="flex-1 space-y-1">
                  <Label className="text-xs font-semibold">رابط الصورة الشخصية (Direct Image URL)</Label>
                  <Input
                    placeholder="https://example.com/photo.jpg"
                    value={editingEmployee.photo_url || ''}
                    onChange={(e) => setEditingEmployee({ ...editingEmployee, photo_url: e.target.value })}
                    dir="ltr"
                    className="h-9 text-xs font-mono"
                  />
                </div>
              </div>

              {/* Name & Role */}
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1">
                  <Label className="text-xs">الاسم الكامل *</Label>
                  <Input
                    value={editingEmployee.name || ''}
                    onChange={(e) => setEditingEmployee({ ...editingEmployee, name: e.target.value })}
                  />
                </div>
                <div className="space-y-1">
                  <Label className="text-xs">المسمى الوظيفي *</Label>
                  <Input
                    value={editingEmployee.role || ''}
                    onChange={(e) => setEditingEmployee({ ...editingEmployee, role: e.target.value })}
                  />
                </div>
              </div>

              {/* National ID & Phone */}
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1">
                  <Label className="text-xs flex items-center gap-1">
                    <CreditCard className="w-3.5 h-3.5 text-muted-foreground" />
                    رقم البطاقة / الرقم القومي
                  </Label>
                  <Input
                    placeholder="الرقم القومي (14 رقم)"
                    value={editingEmployee.national_id || ''}
                    onChange={(e) => setEditingEmployee({ ...editingEmployee, national_id: e.target.value })}
                    dir="ltr"
                    className="font-mono text-xs"
                  />
                </div>
                <div className="space-y-1">
                  <Label className="text-xs flex items-center gap-1">
                    <Phone className="w-3.5 h-3.5 text-muted-foreground" />
                    رقم الهاتف الأساسي *
                  </Label>
                  <Input
                    value={editingEmployee.phone || ''}
                    onChange={(e) => setEditingEmployee({ ...editingEmployee, phone: e.target.value })}
                    dir="ltr"
                    className="font-mono text-xs"
                  />
                </div>
              </div>

              {/* Address & Emergency Phone */}
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1">
                  <Label className="text-xs flex items-center gap-1">
                    <MapPin className="w-3.5 h-3.5 text-muted-foreground" />
                    العنوان بالتفصيل
                  </Label>
                  <Input
                    placeholder="المدينة، الشارع، رقم العقار"
                    value={editingEmployee.address || ''}
                    onChange={(e) => setEditingEmployee({ ...editingEmployee, address: e.target.value })}
                  />
                </div>
                <div className="space-y-1">
                  <Label className="text-xs flex items-center gap-1">
                    <Phone className="w-3.5 h-3.5 text-rose-500" />
                    هاتف الطوارئ / صلة القرابة
                  </Label>
                  <Input
                    placeholder="رقم الطوارئ"
                    value={editingEmployee.emergency_contact || ''}
                    onChange={(e) => setEditingEmployee({ ...editingEmployee, emergency_contact: e.target.value })}
                    dir="ltr"
                    className="font-mono text-xs"
                  />
                </div>
              </div>

              {/* Department & Base Salary */}
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1">
                  <Label className="text-xs">القسم</Label>
                  <Input
                    value={editingEmployee.department || ''}
                    onChange={(e) => setEditingEmployee({ ...editingEmployee, department: e.target.value })}
                  />
                </div>
                <div className="space-y-1">
                  <Label className="text-xs">الراتب الأساسي</Label>
                  <Input
                    type="number"
                    value={editingEmployee.salary ?? ''}
                    onChange={(e) => setEditingEmployee({ ...editingEmployee, salary: e.target.value })}
                  />
                </div>
              </div>

              {/* Status & Shift */}
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1">
                  <Label className="text-xs">حالة الموظف</Label>
                  <select
                    value={editingEmployee.status || 'active'}
                    onChange={(e) => setEditingEmployee({ ...editingEmployee, status: e.target.value })}
                    className="w-full h-10 rounded-md border border-input bg-background px-3 text-xs"
                  >
                    <option value="active">نشط</option>
                    <option value="inactive">غير نشط</option>
                    <option value="on_leave">إجازة</option>
                  </select>
                </div>
                <div className="space-y-1">
                  <Label className="text-xs">الوردية</Label>
                  <select
                    value={editingEmployee.shiftId || editingEmployee.default_shift_id || ''}
                    onChange={(e) => setEditingEmployee({ ...editingEmployee, shiftId: e.target.value, default_shift_id: e.target.value })}
                    className="w-full h-10 rounded-md border border-input bg-background px-3 text-xs"
                  >
                    <option value="">بدون وردية محددة</option>
                    {dbShifts.map((s) => (
                      <option key={s.id} value={s.id}>
                        {s.name} ({s.startTime} - {s.endTime})
                      </option>
                    ))}
                  </select>
                </div>
              </div>

              {/* Email & Hire Date */}
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1">
                  <Label className="text-xs flex items-center gap-1">
                    <Mail className="w-3.5 h-3.5 text-muted-foreground" />
                    البريد الإلكتروني
                  </Label>
                  <Input
                    type="email"
                    placeholder="name@example.com"
                    value={editingEmployee.email || ''}
                    onChange={(e) => setEditingEmployee({ ...editingEmployee, email: e.target.value })}
                    dir="ltr"
                    className="text-xs"
                  />
                </div>
                <div className="space-y-1">
                  <Label className="text-xs flex items-center gap-1">
                    <Calendar className="w-3.5 h-3.5 text-muted-foreground" />
                    تاريخ بدء العمل
                  </Label>
                  <Input
                    type="date"
                    value={editingEmployee.hire_date || ''}
                    onChange={(e) => setEditingEmployee({ ...editingEmployee, hire_date: e.target.value })}
                    className="text-xs"
                  />
                </div>
              </div>

              {/* Notes */}
              <div className="space-y-1">
                <Label className="text-xs flex items-center gap-1">
                  <FileText className="w-3.5 h-3.5 text-muted-foreground" />
                  ملاحظات وتفاصيل إضافية
                </Label>
                <Input
                  placeholder="أي ملاحظات أو شروط أو تفاصيل تخص الموظف..."
                  value={editingEmployee.notes || ''}
                  onChange={(e) => setEditingEmployee({ ...editingEmployee, notes: e.target.value })}
                  className="text-xs"
                />
              </div>
            </div>
          )}
          <DialogFooter>
            <Button variant="outline" onClick={() => setEditingEmployee(null)}>
              إلغاء
            </Button>
            <Button onClick={handleUpdateEmployee}>حفظ التعديلات</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ========================================================================= */}
      {/* MODAL: CHANGE PIN                                                         */}
      {/* ========================================================================= */}
      <Dialog open={!!pinChangeEmployee} onOpenChange={(open) => !open && setPinChangeEmployee(null)}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <KeyRound className="w-5 h-5 text-amber-400" />
              تعيين رقم PIN السري
            </DialogTitle>
            <DialogDescription className="text-xs">
              للموظف: <span className="font-bold text-slate-100">{pinChangeEmployee?.name}</span>
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-3 py-3">
            <div className="space-y-1.5">
              <Label className="text-xs">أدخل PIN الجديد (4 أرقام)</Label>
              <Input
                type="password"
                maxLength={4}
                placeholder="••••"
                value={newPinValue}
                onChange={(e) => setNewPinValue(e.target.value.replace(/\D/g, '').slice(0, 4))}
                className="text-center font-mono text-2xl tracking-widest h-12"
                dir="ltr"
                autoFocus
              />
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs">تأكيد PIN الجديد</Label>
              <Input
                type="password"
                maxLength={4}
                placeholder="••••"
                value={confirmPinValue}
                onChange={(e) => setConfirmPinValue(e.target.value.replace(/\D/g, '').slice(0, 4))}
                className="text-center font-mono text-2xl tracking-widest h-12"
                dir="ltr"
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setPinChangeEmployee(null)}>
              إلغاء
            </Button>
            <Button onClick={handleSavePin} disabled={newPinValue.length !== 4 || newPinValue !== confirmPinValue}>
              تأكيد وحفظ PIN
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ========================================================================= */}
      {/* MODAL: EMPLOYEE PROFILE & ATTENDANCE HISTORY                              */}
      {/* ========================================================================= */}
      <Dialog open={!!profileEmployee} onOpenChange={(open) => !open && setProfileEmployee(null)}>
        <DialogContent className="max-w-2xl max-h-[90dvh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-3">
              <Avatar className="w-12 h-12 border-2 border-primary/30 shrink-0">
                {profileEmployee?.photo_url && (
                  <AvatarImage src={profileEmployee.photo_url} alt={profileEmployee.name} className="object-cover" />
                )}
                <AvatarFallback className="bg-primary/20 text-primary font-bold text-lg">
                  {profileEmployee?.name?.charAt(0)}
                </AvatarFallback>
              </Avatar>
              <div>
                <span className="text-lg font-bold">{profileEmployee?.name}</span>
                <span className="block text-xs text-muted-foreground font-normal">
                  {profileEmployee?.role} • {profileEmployee?.department || 'بدون قسم'}
                </span>
              </div>
            </DialogTitle>
          </DialogHeader>

          {profileEmployee && (
            <div className="space-y-4 py-2">
              {/* Comprehensive Personal Info Card */}
              <div className="p-3.5 bg-muted/20 border border-border rounded-xl space-y-2 text-xs">
                <div className="grid grid-cols-2 sm:grid-cols-3 gap-2.5">
                  <div>
                    <span className="text-[10px] text-muted-foreground block">رقم البطاقة / القومي:</span>
                    <span className="font-mono font-medium">{profileEmployee.national_id || '—'}</span>
                  </div>
                  <div>
                    <span className="text-[10px] text-muted-foreground block">الهاتف الأساسي:</span>
                    <span className="font-mono font-medium" dir="ltr">{profileEmployee.phone || '—'}</span>
                  </div>
                  <div>
                    <span className="text-[10px] text-muted-foreground block">هاتف الطوارئ:</span>
                    <span className="font-mono font-medium text-rose-500" dir="ltr">{profileEmployee.emergency_contact || '—'}</span>
                  </div>
                  <div className="sm:col-span-2">
                    <span className="text-[10px] text-muted-foreground block">العنوان:</span>
                    <span className="font-medium">{profileEmployee.address || '—'}</span>
                  </div>
                  <div>
                    <span className="text-[10px] text-muted-foreground block">تاريخ التعيين:</span>
                    <span className="font-mono font-medium">{profileEmployee.hire_date || '—'}</span>
                  </div>
                  {profileEmployee.email && (
                    <div className="sm:col-span-2">
                      <span className="text-[10px] text-muted-foreground block">البريد الإلكتروني:</span>
                      <span className="font-mono">{profileEmployee.email}</span>
                    </div>
                  )}
                  {profileEmployee.notes && (
                    <div className="col-span-full pt-1 border-t border-border/40">
                      <span className="text-[10px] text-muted-foreground block">ملاحظات:</span>
                      <p className="text-slate-300 text-[11px] leading-relaxed">{profileEmployee.notes}</p>
                    </div>
                  )}
                </div>
              </div>
              <Tabs defaultValue="financial" className="w-full">
                <TabsList className="grid grid-cols-3 bg-slate-900 border border-slate-800 mb-3">
                  <TabsTrigger value="financial" className="text-xs font-bold">
                    البيانات المالية والسلف
                  </TabsTrigger>
                  <TabsTrigger value="attendance" className="text-xs font-bold">
                    سجل الحضور والغياب
                  </TabsTrigger>
                  <TabsTrigger value="leaves" className="text-xs font-bold">
                    الإجازات والأرصدة
                  </TabsTrigger>
                </TabsList>

                {/* TAB 1: FINANCIAL & ADVANCES */}
                <TabsContent value="financial" className="space-y-3">
                  <EmployeeFinancialTab
                    employee={profileEmployee}
                    payrolls={payrolls}
                    payments={salaryPayments}
                    advances={advances}
                    installments={advanceInstallments}
                    onCreateAdvance={createAdvance}
                    onCancelAdvance={cancelAdvance}
                    onDeleteAdvance={deleteAdvance}
                    onVoidPayment={voidSalaryPayment}
                    onReverseInstallment={reverseAdvanceInstallment}
                    isProcessing={isProcessingCancellation}
                  />
                </TabsContent>

                {/* TAB 2: ATTENDANCE HISTORY */}
                <TabsContent value="attendance" className="space-y-3">
                  {(() => {
                    const empRecords = attendance.filter((a) => a.employeeId === profileEmployee.id);
                    const attended = empRecords.filter((a) => a.status === 'present' || a.status === 'late').length;
                    const late = empRecords.filter((a) => a.status === 'late').length;
                    const lateMins = empRecords.reduce((s, a) => s + a.lateMinutes, 0);
                    const totalHours = empRecords.reduce((s, a) => s + a.hours, 0);

                    return (
                      <>
                        <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                          <div className="p-3 bg-slate-900/60 rounded-xl border border-slate-800 text-center">
                            <p className="text-lg font-bold text-emerald-400">{attended} يوم</p>
                            <p className="text-[10px] text-muted-foreground">أيام الحضور</p>
                          </div>
                          <div className="p-3 bg-slate-900/60 rounded-xl border border-slate-800 text-center">
                            <p className="text-lg font-bold text-amber-400">{late} مرة</p>
                            <p className="text-[10px] text-muted-foreground">مرات التأخير</p>
                          </div>
                          <div className="p-3 bg-slate-900/60 rounded-xl border border-slate-800 text-center">
                            <p className="text-lg font-bold text-amber-400">{lateMins} د</p>
                            <p className="text-[10px] text-muted-foreground">إجمالي التأخير</p>
                          </div>
                          <div className="p-3 bg-slate-900/60 rounded-xl border border-slate-800 text-center">
                            <p className="text-lg font-bold text-primary">{Math.round(totalHours * 10) / 10} س</p>
                            <p className="text-[10px] text-muted-foreground">ساعات العمل</p>
                          </div>
                        </div>

                        <div className="space-y-2 pt-2">
                          <h4 className="text-xs font-bold text-slate-300">سجل الحضور التاريخي للموظف</h4>
                          <div className="max-h-60 overflow-y-auto rounded-lg border">
                            <Table>
                              <TableHeader>
                                <TableRow>
                                  <TableHead>التاريخ</TableHead>
                                  <TableHead>الحضور</TableHead>
                                  <TableHead>الانصراف</TableHead>
                                  <TableHead>الساعات</TableHead>
                                  <TableHead>التأخير</TableHead>
                                  <TableHead>الحالة</TableHead>
                                  <TableHead className="text-left">حذف</TableHead>
                                </TableRow>
                              </TableHeader>
                              <TableBody>
                                {empRecords.map((r) => (
                                  <TableRow key={r.id}>
                                    <TableCell className="font-mono text-xs">{r.date}</TableCell>
                                    <TableCell className="font-mono text-xs">{r.checkIn || '-'}</TableCell>
                                    <TableCell className="font-mono text-xs">{r.checkOut || '-'}</TableCell>
                                    <TableCell className="text-xs">{r.hours > 0 ? `${r.hours} س` : '-'}</TableCell>
                                    <TableCell className="text-xs">
                                      {r.lateMinutes > 0 ? `${r.lateMinutes} د` : '-'}
                                    </TableCell>
                                    <TableCell>
                                      <Badge className={cn('text-[9px] border', statusColors[r.status])}>
                                        {statusLabels[r.status] || r.status}
                                      </Badge>
                                    </TableCell>
                                    <TableCell className="text-left">
                                      <Button
                                        variant="ghost"
                                        size="icon"
                                        onClick={() => setDeleteAttendanceRecord(r)}
                                        className="h-7 w-7 text-muted-foreground hover:text-rose-400"
                                        title="حذف سجل الحضور"
                                      >
                                        <Trash2 className="w-3.5 h-3.5" />
                                      </Button>
                                    </TableCell>
                                  </TableRow>
                                ))}
                                {empRecords.length === 0 && (
                                  <TableRow>
                                    <TableCell colSpan={7} className="text-center py-6 text-muted-foreground">
                                      لا توجد سجلات حضور لهذا الموظف حتى الآن
                                    </TableCell>
                                  </TableRow>
                                )}
                              </TableBody>
                            </Table>
                          </div>
                        </div>
                      </>
                    );
                  })()}
                </TabsContent>

                {/* TAB 3: LEAVES & BALANCE */}
                <TabsContent value="leaves" className="space-y-3">
                  {(() => {
                    const empLeaves = leaves.filter((l) => l.employee_id === profileEmployee.id);
                    const bal = calculateEmployeeLeaveBalance(empLeaves, profileEmployee.annual_leave_entitlement);

                    return (
                      <>
                        <div className="flex items-center justify-between pb-1">
                          <h4 className="text-xs font-bold text-slate-300">سجل ورصيد الإجازات</h4>
                          <Button
                            size="sm"
                            onClick={() => {
                              setPreselectedLeaveEmployeeId(profileEmployee.id);
                              setProfileEmployee(null);
                              setActiveTab('leaves');
                            }}
                            className="h-8 text-xs gap-1.5"
                          >
                            <Plus className="w-3.5 h-3.5" />
                            منح إجازة لهذا الموظف
                          </Button>
                        </div>

                        <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                          <div className="p-2.5 bg-slate-900/60 rounded-xl border border-slate-800 text-center">
                            <p className="text-base font-bold text-foreground">
                              {bal.entitlement !== null ? `${bal.entitlement} يوم` : 'غير محدد'}
                            </p>
                            <p className="text-[10px] text-muted-foreground">الرصيد السنوي المستحق</p>
                          </div>
                          <div className="p-2.5 bg-slate-900/60 rounded-xl border border-slate-800 text-center">
                            <p className="text-base font-bold text-emerald-400">{bal.usedPaidDays} يوم</p>
                            <p className="text-[10px] text-muted-foreground">إجازات مدفوعة مستخدمة</p>
                          </div>
                          <div className="p-2.5 bg-slate-900/60 rounded-xl border border-slate-800 text-center">
                            <p className="text-base font-bold text-rose-400">{bal.usedUnpaidDays} يوم</p>
                            <p className="text-[10px] text-muted-foreground">إجازات بدون مرتب</p>
                          </div>
                          <div className="p-2.5 bg-slate-900/60 rounded-xl border border-slate-800 text-center">
                            <p className="text-base font-bold text-primary">
                              {bal.remainingDays !== null ? `${bal.remainingDays} يوم` : '-'}
                            </p>
                            <p className="text-[10px] text-muted-foreground">الرصيد المتبقي</p>
                          </div>
                        </div>

                        <div className="space-y-2 pt-2">
                          <h4 className="text-xs font-bold text-slate-300">السجل التاريخي لإجازات الموظف</h4>
                          <div className="max-h-60 overflow-y-auto rounded-lg border border-slate-800">
                            <Table>
                              <TableHeader>
                                <TableRow>
                                  <TableHead>النوع</TableHead>
                                  <TableHead>من</TableHead>
                                  <TableHead>إلى</TableHead>
                                  <TableHead>الأيام الفعلية</TableHead>
                                  <TableHead>النوع المالي</TableHead>
                                  <TableHead>الحالة</TableHead>
                                </TableRow>
                              </TableHeader>
                              <TableBody>
                                {empLeaves.map((l) => {
                                  const typeCfg = LEAVE_TYPE_CONFIG[l.leave_type] || LEAVE_TYPE_CONFIG.other;
                                  const statusCfg = LEAVE_STATUS_CONFIG[l.status] || LEAVE_STATUS_CONFIG.pending;
                                  return (
                                    <TableRow key={l.id}>
                                      <TableCell className="text-xs font-medium">
                                        {typeCfg?.labelAr || l.leave_type || '—'}
                                      </TableCell>
                                      <TableCell className="font-mono text-xs">{l.start_date || '—'}</TableCell>
                                      <TableCell className="font-mono text-xs">{l.end_date || '—'}</TableCell>
                                      <TableCell className="text-xs font-bold text-primary">{l.working_days_count ?? 0} يوم</TableCell>
                                      <TableCell className="text-xs">
                                        <Badge variant="outline" className={l.is_paid ? 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20 text-[10px]' : 'bg-rose-500/10 text-rose-400 border-rose-500/20 text-[10px]'}>
                                          {l.is_paid ? 'مدفوعة' : 'بدون مرتب'}
                                        </Badge>
                                      </TableCell>
                                      <TableCell>
                                        <Badge variant="outline" className={`text-[10px] ${statusCfg?.bg || ''} ${statusCfg?.color || ''}`}>
                                          {statusCfg?.labelAr || l.status || '—'}
                                        </Badge>
                                      </TableCell>
                                    </TableRow>
                                  );
                                })}
                                {empLeaves.length === 0 && (
                                  <TableRow>
                                    <TableCell colSpan={6} className="text-center py-6 text-muted-foreground text-xs">
                                      لا توجد إجازات مسجلة لهذا الموظف
                                    </TableCell>
                                  </TableRow>
                                )}
                              </TableBody>
                            </Table>
                          </div>
                        </div>
                      </>
                    );
                  })()}
                </TabsContent>
              </Tabs>
            </div>
          )}
        </DialogContent>
      </Dialog>

      {/* ========================================================================= */}
      {/* MODAL: MANUAL ATTENDANCE CORRECTION                                       */}
      {/* ========================================================================= */}
      <Dialog open={correctionModalOpen} onOpenChange={setCorrectionModalOpen}>
        <DialogContent className="max-w-md max-h-[90dvh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>
              {correctionRecord ? 'تصحيح وتعديل سجل الحضور' : 'إضافة حضور يدوي'}
            </DialogTitle>
            <DialogDescription className="text-xs">
              سيتم توثيق هذا الإجراء وسببه في سجل التدقيق (Audit Log) الخاص بالنظام
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-3 py-2">
            <div className="space-y-1">
              <Label className="text-xs">الموظف *</Label>
              <select
                value={correctionForm.employee_id}
                onChange={(e) => setCorrectionForm({ ...correctionForm, employee_id: e.target.value })}
                className="w-full h-10 rounded-md border border-input bg-background px-3 text-xs"
              >
                {employees.map((e) => (
                  <option key={e.id} value={e.id}>
                    {e.name} ({e.role})
                  </option>
                ))}
              </select>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1">
                <Label className="text-xs">التاريخ *</Label>
                <Input
                  type="date"
                  value={correctionForm.date}
                  onChange={(e) => setCorrectionForm({ ...correctionForm, date: e.target.value })}
                  className="h-10 text-xs"
                />
              </div>
              <div className="space-y-1">
                <Label className="text-xs">الحالة</Label>
                <select
                  value={correctionForm.status}
                  onChange={(e) => setCorrectionForm({ ...correctionForm, status: e.target.value })}
                  className="w-full h-10 rounded-md border border-input bg-background px-3 text-xs"
                >
                  <option value="present">حاضر</option>
                  <option value="late">متأخر</option>
                  <option value="early_leave">انصراف مبكر</option>
                  <option value="on_leave">إجازة</option>
                  <option value="absent">غائب</option>
                </select>
              </div>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1">
                <Label className="text-xs">وقت الحضور (HH:mm)</Label>
                <Input
                  type="time"
                  value={correctionForm.checkIn}
                  onChange={(e) => setCorrectionForm({ ...correctionForm, checkIn: e.target.value })}
                  className="h-10 text-xs"
                />
              </div>
              <div className="space-y-1">
                <Label className="text-xs">وقت الانصراف (HH:mm)</Label>
                <Input
                  type="time"
                  value={correctionForm.checkOut}
                  onChange={(e) => setCorrectionForm({ ...correctionForm, checkOut: e.target.value })}
                  className="h-10 text-xs"
                />
              </div>
            </div>

            <div className="space-y-1">
              <Label className="text-xs text-rose-400 font-bold">سبب التعديل اليدوي (إجباري للتسجيل) *</Label>
              <Input
                placeholder="مثال: نسي تسجيل الانصراف أثناء ضغط العمل"
                value={correctionForm.reason}
                onChange={(e) => setCorrectionForm({ ...correctionForm, reason: e.target.value })}
                className="h-10 text-xs"
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setCorrectionModalOpen(false)}>
              إلغاء
            </Button>
            <Button onClick={handleSaveCorrection} disabled={!correctionForm.reason.trim()}>
              حفظ وتوثيق
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ========================================================================= */}
      {/* MODAL: ADD / EDIT SHIFT                                                   */}
      {/* ========================================================================= */}
      <Dialog open={isAddShiftOpen} onOpenChange={setIsAddShiftOpen}>
        <DialogContent className="max-w-md max-h-[90dvh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{editingShift ? 'تعديل الوردية' : 'إضافة وردية جديدة'}</DialogTitle>
          </DialogHeader>
          <div className="space-y-3 py-2">
            <div className="space-y-1">
              <Label className="text-xs">اسم الوردية *</Label>
              <Input
                placeholder="مثال: الوردية الصباحية"
                value={shiftForm.name}
                onChange={(e) => setShiftForm({ ...shiftForm, name: e.target.value })}
              />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1">
                <Label className="text-xs">وقت البداية *</Label>
                <Input
                  type="time"
                  value={shiftForm.startTime}
                  onChange={(e) => setShiftForm({ ...shiftForm, startTime: e.target.value })}
                />
              </div>
              <div className="space-y-1">
                <Label className="text-xs">وقت النهاية *</Label>
                <Input
                  type="time"
                  value={shiftForm.endTime}
                  onChange={(e) => setShiftForm({ ...shiftForm, endTime: e.target.value })}
                />
              </div>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1">
                <Label className="text-xs">فترة السماح بالدقائق (Grace Period)</Label>
                <Input
                  type="number"
                  value={shiftForm.gracePeriod}
                  onChange={(e) => setShiftForm({ ...shiftForm, gracePeriod: parseInt(e.target.value) || 0 })}
                />
              </div>
              <div className="space-y-1">
                <Label className="text-xs">مدة الراحة (دقائق)</Label>
                <Input
                  type="number"
                  value={shiftForm.breakMinutes}
                  onChange={(e) => setShiftForm({ ...shiftForm, breakMinutes: parseInt(e.target.value) || 0 })}
                />
              </div>
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs">أيام عمل الوردية</Label>
              <div className="flex flex-wrap gap-2 pt-1">
                {['السبت', 'الأحد', 'الاثنين', 'الثلاثاء', 'الأربعاء', 'الخميس', 'الجمعة'].map((day) => {
                  const isChecked = shiftForm.days.includes(day);
                  return (
                    <Badge
                      key={day}
                      variant={isChecked ? 'default' : 'outline'}
                      onClick={() => {
                        const nextDays = isChecked
                          ? shiftForm.days.filter((d) => d !== day)
                          : [...shiftForm.days, day];
                        setShiftForm({ ...shiftForm, days: nextDays });
                      }}
                      className="cursor-pointer text-xs"
                    >
                      {day}
                    </Badge>
                  );
                })}
              </div>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setIsAddShiftOpen(false)}>
              إلغاء
            </Button>
            <Button onClick={handleSaveShift}>حفظ الوردية</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ========================================================================= */}
      {/* MODAL: DELETE ATTENDANCE RECORD CONFIRMATION                             */}
      {/* ========================================================================= */}
      <Dialog open={!!deleteAttendanceRecord} onOpenChange={(open) => !open && setDeleteAttendanceRecord(null)}>
        <DialogContent className="max-w-md max-h-[90dvh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-rose-500">
              <AlertTriangle className="w-5 h-5 text-rose-500" />
              تأكيد حذف سجل الحضور
            </DialogTitle>
            <DialogDescription className="text-xs text-muted-foreground">
              هل أنت متأكد من رغبتك في حذف سجل الحضور المحدد أدناه؟ هذا الإجراء فردي ولن يؤثر على باقي سجلات اليوم أو الموظفين الآخرين.
            </DialogDescription>
          </DialogHeader>

          {deleteAttendanceRecord && (
            <div className="p-4 rounded-xl bg-rose-500/10 border border-rose-500/20 space-y-2.5 text-sm my-2">
              <div className="flex justify-between items-center text-xs">
                <span className="text-muted-foreground">اسم الموظف:</span>
                <span className="font-bold text-slate-100">{deleteAttendanceRecord.employeeName}</span>
              </div>
              <div className="flex justify-between items-center text-xs">
                <span className="text-muted-foreground">التاريخ:</span>
                <span className="font-mono font-bold text-slate-100">{deleteAttendanceRecord.date}</span>
              </div>
              <div className="flex justify-between items-center text-xs">
                <span className="text-muted-foreground">وقت الحضور (Check-In):</span>
                <span className="font-mono text-emerald-400 font-bold">{deleteAttendanceRecord.checkIn || 'غير مسجل'}</span>
              </div>
              <div className="flex justify-between items-center text-xs">
                <span className="text-muted-foreground">وقت الانصراف (Check-Out):</span>
                <span className="font-mono text-indigo-400 font-bold">{deleteAttendanceRecord.checkOut || 'غير مسجل'}</span>
              </div>
              <div className="flex justify-between items-center text-xs">
                <span className="text-muted-foreground">الحالة الحالية:</span>
                <Badge className={cn('text-[10px] border', statusColors[deleteAttendanceRecord.status])}>
                  {statusLabels[deleteAttendanceRecord.status] || deleteAttendanceRecord.status}
                </Badge>
              </div>
            </div>
          )}

          <DialogFooter className="gap-2 sm:gap-0">
            <Button
              variant="outline"
              onClick={() => setDeleteAttendanceRecord(null)}
              disabled={isDeletingAttendance}
            >
              إلغاء
            </Button>
            <Button
              variant="destructive"
              onClick={async () => {
                if (!deleteAttendanceRecord) return;
                setIsDeletingAttendance(true);
                try {
                  await deleteAttendance(deleteAttendanceRecord.id);
                  setDeleteAttendanceRecord(null);
                } finally {
                  setIsDeletingAttendance(false);
                }
              }}
              disabled={isDeletingAttendance}
              className="gap-1.5"
            >
              <Trash2 className="w-4 h-4" />
              {isDeletingAttendance ? 'جاري الحذف...' : 'تأكيد الحذف نهائياً'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </MainLayout>
  );
}
