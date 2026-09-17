import React, { useState, useMemo } from 'react';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
  DropdownMenuSeparator,
} from '@/components/ui/dropdown-menu';
import {
  DollarSign,
  Search,
  Download,
  Plus,
  HandCoins,
  ChevronDown,
  History,
  AlertCircle,
  FileText,
  CheckCircle2,
  Clock,
  Trash2,
  RotateCcw,
} from 'lucide-react';
import type { PayrollRecord, PayrollPeriod, SalaryPayment, Advance } from '@/types/payroll';
import { SalaryPaymentModal } from './SalaryPaymentModal';
import { AdvanceModal } from './AdvanceModal';
import { VoidPaymentModal } from './VoidPaymentModal';
import { CancelAdvanceModal } from './CancelAdvanceModal';
import { DeleteAdvanceModal } from './DeleteAdvanceModal';
import { ActiveAdvancesTable } from './ActiveAdvancesTable';
import { cn } from '@/lib/utils';
import { toast } from 'sonner';

interface PayrollTableProps {
  periodRecords: PayrollRecord[];
  allPayments: SalaryPayment[];
  allAdvances: Advance[];
  employees: Array<{ id: string; name: string; role?: string }>;
  currentPeriod: PayrollPeriod;
  onPeriodChange: (period: PayrollPeriod) => void;
  onDisbursePayment: (data: any) => Promise<boolean>;
  onVoidPayment: (paymentId: string, reason: string) => Promise<boolean>;
  onCreateAdvance: (data: any) => Promise<string | null>;
  onDeleteAdvance?: (advanceId: string, reason: string) => Promise<{ success: boolean; message?: string }>;
  onCancelAdvance?: (advanceId: string, reason: string) => Promise<boolean>;
  isSubmittingPayment: boolean;
}

const statusBadgeStyles: Record<string, string> = {
  unpaid: 'bg-rose-500/10 text-rose-400 border-rose-500/20',
  partial: 'bg-amber-500/10 text-amber-400 border-amber-500/20',
  paid: 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20',
};

const statusLabels: Record<string, string> = {
  unpaid: 'لم يتم الدفع',
  partial: 'مدفوع جزئياً',
  paid: 'مدفوع بالكامل',
};

export const PayrollTable: React.FC<PayrollTableProps> = ({
  periodRecords,
  allPayments,
  allAdvances,
  employees,
  currentPeriod,
  onPeriodChange,
  onDisbursePayment,
  onVoidPayment,
  onCreateAdvance,
  onDeleteAdvance,
  onCancelAdvance,
  isSubmittingPayment,
}) => {
  const [payrollSubTab, setPayrollSubTab] = useState<'payroll' | 'advances'>('payroll');
  const [searchQuery, setSearchQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState('all');

  // Modals
  const [selectedPayrollForPayment, setSelectedPayrollForPayment] = useState<PayrollRecord | null>(null);
  const [isAdvanceModalOpen, setIsAdvanceModalOpen] = useState(false);
  const [viewHistoryRecord, setViewHistoryRecord] = useState<PayrollRecord | null>(null);

  // Void / Cancel / Delete targets
  const [voidPaymentTarget, setVoidPaymentTarget] = useState<SalaryPayment | null>(null);
  const [deleteAdvanceTarget, setDeleteAdvanceTarget] = useState<Advance | null>(null);
  const [cancelAdvanceTarget, setCancelAdvanceTarget] = useState<Advance | null>(null);

  // Active advances count
  const activeAdvancesCount = useMemo(() => {
    return allAdvances.filter((a) => a.status === 'active' || a.status === 'partially_paid').length;
  }, [allAdvances]);

  // Month & Year parsing
  const [year, month] = currentPeriod.split('-');

  const handleMonthChange = (newMonth: string) => {
    onPeriodChange(`${year}-${newMonth}`);
  };

  const handleYearChange = (newYear: string) => {
    onPeriodChange(`${newYear}-${month}`);
  };

  // Filtered records
  const filteredRecords = useMemo(() => {
    return periodRecords.filter((rec) => {
      // 1. Search Query
      if (searchQuery) {
        const q = searchQuery.toLowerCase();
        const matchName = rec.employeeName.toLowerCase().includes(q);
        const matchRole = rec.employeeRole.toLowerCase().includes(q);
        if (!matchName && !matchRole) return false;
      }

      // 2. Status Filter
      if (statusFilter !== 'all' && rec.status !== statusFilter) {
        return false;
      }

      return true;
    });
  }, [periodRecords, searchQuery, statusFilter]);

  // Summary Totals
  const totals = useMemo(() => {
    return filteredRecords.reduce(
      (acc, r) => ({
        basic: acc.basic + r.basicSalarySnapshot,
        additions: acc.additions + r.overtime + r.bonuses + r.allowances,
        attendanceDeductions: acc.attendanceDeductions + r.attendanceDeductions,
        advanceDeductions: acc.advanceDeductions + r.advanceDeductions,
        net: acc.net + r.netSalary,
        paid: acc.paid + r.totalPaid,
        remaining: acc.remaining + r.remaining,
      }),
      { basic: 0, additions: 0, attendanceDeductions: 0, advanceDeductions: 0, net: 0, paid: 0, remaining: 0 }
    );
  }, [filteredRecords]);

  // Export CSV
  const handleExportCSV = () => {
    const headers = [
      'الموظف',
      'الوظيفة',
      'الراتب الأساسي',
      'الإضافي والبدلات',
      'خصومات الحضور',
      'أقساط السلف',
      'صافي المستحق',
      'المدفوع',
      'المتبقي',
      'الحالة',
    ].join(',');

    const rows = filteredRecords.map((r) =>
      [
        `"${r.employeeName}"`,
        `"${r.employeeRole}"`,
        r.basicSalarySnapshot,
        r.overtime + r.bonuses + r.allowances,
        r.attendanceDeductions,
        r.advanceDeductions,
        r.netSalary,
        r.totalPaid,
        r.remaining,
        `"${statusLabels[r.status] || r.status}"`,
      ].join(',')
    );

    const csvContent = '\uFEFF' + [headers, ...rows].join('\n');
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `payroll_${currentPeriod}.csv`;
    link.click();
    URL.revokeObjectURL(url);
    toast.success('تم تصدير مسير الرواتب إلى CSV بنجاح');
  };

  const handleVoidPaymentClick = (payment: SalaryPayment) => {
    setVoidPaymentTarget(payment);
  };

  return (
    <Card className="border-slate-800 bg-slate-950/60">
      <CardHeader className="p-4 md:p-6 pb-4">
        {/* Navigation Sub-Tabs */}
        <div className="flex items-center gap-2 border-b border-slate-800/80 pb-3 mb-4">
          <button
            type="button"
            onClick={() => setPayrollSubTab('payroll')}
            className={cn(
              "flex items-center gap-2 px-3.5 py-1.5 rounded-lg text-xs font-bold transition-all outline-none",
              payrollSubTab === 'payroll'
                ? "bg-primary text-primary-foreground shadow-sm"
                : "text-muted-foreground hover:text-slate-200 hover:bg-slate-900"
            )}
          >
            <DollarSign className="w-3.5 h-3.5" />
            <span>مسير وصرف الرواتب</span>
          </button>

          <button
            type="button"
            onClick={() => setPayrollSubTab('advances')}
            className={cn(
              "flex items-center gap-2 px-3.5 py-1.5 rounded-lg text-xs font-bold transition-all outline-none",
              payrollSubTab === 'advances'
                ? "bg-amber-500 text-slate-950 shadow-sm"
                : "text-muted-foreground hover:text-slate-200 hover:bg-slate-900"
            )}
          >
            <HandCoins className="w-3.5 h-3.5" />
            <span>السلف القائمة والنشطة</span>
            <Badge
              variant="outline"
              className={cn(
                "text-[10px] px-1.5 py-0 h-4 border",
                payrollSubTab === 'advances'
                  ? "border-slate-900/40 bg-black/20 text-slate-950 font-mono"
                  : "border-amber-500/30 text-amber-400 font-mono"
              )}
            >
              {activeAdvancesCount}
            </Badge>
          </button>
        </div>

        {payrollSubTab === 'payroll' ? (
          <>
            <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4">
              <div>
                <CardTitle className="text-lg font-bold flex items-center gap-2">
                  <DollarSign className="w-5 h-5 text-primary" />
                  <span>جدول مسير وصرف الرواتب</span>
                </CardTitle>
                <CardDescription className="text-xs">
                  حساب ومتابعة وصرف مرتبات الموظفين مع الخصومات والسلف للشهر المحدد
                </CardDescription>
              </div>

              {/* Period & Action Controls */}
              <div className="flex flex-wrap items-center gap-2">
                {/* Month Select */}
                <Select value={month} onValueChange={handleMonthChange}>
                  <SelectTrigger className="w-[120px] h-9 text-xs bg-slate-900 border-slate-700">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="01">يناير (01)</SelectItem>
                    <SelectItem value="02">فبراير (02)</SelectItem>
                    <SelectItem value="03">مارس (03)</SelectItem>
                    <SelectItem value="04">أبريل (04)</SelectItem>
                    <SelectItem value="05">مايو (05)</SelectItem>
                    <SelectItem value="06">يونيو (06)</SelectItem>
                    <SelectItem value="07">يوليو (07)</SelectItem>
                    <SelectItem value="08">أغسطس (08)</SelectItem>
                    <SelectItem value="09">سبتمبر (09)</SelectItem>
                    <SelectItem value="10">أكتوبر (10)</SelectItem>
                    <SelectItem value="11">نوفمبر (11)</SelectItem>
                    <SelectItem value="12">ديسمبر (12)</SelectItem>
                  </SelectContent>
                </Select>

                {/* Year Select */}
                <Select value={year} onValueChange={handleYearChange}>
                  <SelectTrigger className="w-[95px] h-9 text-xs bg-slate-900 border-slate-700 font-mono">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="2025">2025</SelectItem>
                    <SelectItem value="2026">2026</SelectItem>
                    <SelectItem value="2027">2027</SelectItem>
                  </SelectContent>
                </Select>

                {/* Advance Button */}
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setIsAdvanceModalOpen(true)}
                  className="gap-1.5 text-xs h-9 border-amber-500/30 hover:bg-amber-500/10 text-amber-400"
                >
                  <HandCoins className="w-4 h-4" />
                  <span>إضافة سلفة</span>
                </Button>

                {/* Export CSV */}
                <Button
                  variant="outline"
                  size="sm"
                  onClick={handleExportCSV}
                  className="gap-1.5 text-xs h-9 border-slate-700"
                >
                  <Download className="w-4 h-4" />
                  <span>تصدير CSV</span>
                </Button>
              </div>
            </div>

            {/* Filter bar */}
            <div className="flex flex-col sm:flex-row gap-2.5 pt-4">
              <div className="relative flex-1">
                <Search className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                <Input
                  placeholder="بحث باسم الموظف أو المسمى الوظيفي..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="pr-9 h-9 text-xs bg-slate-900/80 border-slate-700"
                />
              </div>

              <Select value={statusFilter} onValueChange={setStatusFilter}>
                <SelectTrigger className="w-full sm:w-[140px] h-9 text-xs bg-slate-900/80 border-slate-700">
                  <SelectValue placeholder="حالة الدفع" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">جميع الحالات</SelectItem>
                  <SelectItem value="unpaid">لم يتم الدفع</SelectItem>
                  <SelectItem value="partial">مدفوع جزئياً</SelectItem>
                  <SelectItem value="paid">مدفوع بالكامل</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </>
        ) : (
          <div>
            <CardTitle className="text-lg font-bold flex items-center gap-2 text-amber-400">
              <HandCoins className="w-5 h-5" />
              <span>إدارة السلف القائمة والنشطة</span>
            </CardTitle>
            <CardDescription className="text-xs">
              متابعة السلف والأقساط المستحقة، وإلغاء أو حذف السلف التي لم تبدأ حركتها المالية
            </CardDescription>
          </div>
        )}
      </CardHeader>

      <CardContent className={payrollSubTab === 'payroll' ? 'p-0' : 'p-4 md:p-6 pt-0'}>
        {payrollSubTab === 'advances' ? (
          <ActiveAdvancesTable
            advances={allAdvances}
            employees={employees}
            onOpenCreateModal={() => setIsAdvanceModalOpen(true)}
            onRequestDelete={(adv) => setDeleteAdvanceTarget(adv)}
            onRequestCancel={(adv) => setCancelAdvanceTarget(adv)}
            isProcessing={isSubmittingPayment}
          />
        ) : (
          <>
            {/* Mobile Cards View (< md) */}
            <div className="md:hidden divide-y divide-slate-800 border-t border-slate-800">
              {filteredRecords.length === 0 ? (
                <div className="text-center py-10 text-muted-foreground text-xs p-4">
                  لا يوجد موظفون أو بيانات رواتب تطابق الفترة وشروط البحث
                </div>
              ) : (
                filteredRecords.map((rec) => {
                  const empPayments = allPayments.filter(
                    (p) => p.employeeId === rec.employeeId && p.payrollPeriod === currentPeriod
                  );

                  return (
                    <div key={rec.id} className="p-4 space-y-3 bg-slate-950/20">
                      <div className="flex items-start justify-between gap-2">
                        <div>
                          <p className="font-bold text-slate-100 text-sm">{rec.employeeName}</p>
                          <p className="text-[11px] text-muted-foreground">{rec.employeeRole}</p>
                        </div>
                        <Badge className={`text-[10px] border ${statusBadgeStyles[rec.status] || ''}`}>
                          {statusLabels[rec.status] || rec.status}
                        </Badge>
                      </div>

                      <div className="grid grid-cols-2 gap-2 text-xs bg-slate-900/40 p-2.5 rounded-lg border border-slate-800/60">
                        <div>
                          <span className="text-slate-400 block text-[10px]">الأساسي:</span>
                          <span className="font-mono text-slate-200">{rec.basicSalarySnapshot.toLocaleString('ar-EG')} ج.م</span>
                        </div>
                        <div>
                          <span className="text-slate-400 block text-[10px]">الإضافي:</span>
                          <span className="font-mono text-emerald-400">+{ (rec.overtime + rec.bonuses + rec.allowances).toLocaleString('ar-EG') }</span>
                        </div>
                        <div>
                          <span className="text-slate-400 block text-[10px]">الخصومات والسلف:</span>
                          <span className="font-mono text-rose-400">
                            -{(rec.attendanceDeductions + rec.advanceDeductions).toLocaleString('ar-EG')}
                          </span>
                        </div>
                        <div>
                          <span className="text-slate-400 block text-[10px]">الصافي:</span>
                          <span className="font-mono font-bold text-slate-100">{rec.netSalary.toLocaleString('ar-EG')} ج.م</span>
                        </div>
                      </div>

                      <div className="flex items-center justify-between pt-1 text-xs">
                        <div>
                          <span className="text-muted-foreground text-[11px]">المتبقي: </span>
                          <span className="font-mono font-bold text-rose-400">{rec.remaining.toLocaleString('ar-EG')} ج.م</span>
                          {rec.totalPaid > 0 && (
                            <span className="text-muted-foreground text-[10px] mr-1">
                              (مدفوع: {rec.totalPaid.toLocaleString('ar-EG')})
                            </span>
                          )}
                        </div>

                        <div className="flex items-center gap-1.5">
                          {rec.remaining > 0 ? (
                            <Button
                              size="sm"
                              onClick={() => setSelectedPayrollForPayment(rec)}
                              className="h-8 px-3 text-xs bg-primary hover:bg-primary/90 gap-1"
                            >
                              <DollarSign className="w-3.5 h-3.5" />
                              <span>صرف</span>
                            </Button>
                          ) : (
                            <Button
                              size="sm"
                              variant="outline"
                              disabled
                              className="h-8 px-2.5 text-[11px] border-emerald-500/30 text-emerald-400 opacity-80"
                            >
                              <CheckCircle2 className="w-3 h-3 ml-1" />
                              مسدد
                            </Button>
                          )}

                          {empPayments.length > 0 && (
                            <DropdownMenu>
                              <DropdownMenuTrigger asChild>
                                <Button variant="ghost" size="icon" className="h-8 w-8 text-muted-foreground">
                                  <History className="w-4 h-4" />
                                </Button>
                              </DropdownMenuTrigger>
                              <DropdownMenuContent align="end" className="w-64 max-w-[85vw]">
                                <div className="px-2 py-1.5 text-[11px] font-bold text-muted-foreground">
                                  دفعات شهر {currentPeriod} ({empPayments.length})
                                </div>
                                <DropdownMenuSeparator />
                                {empPayments.map((p) => {
                                  const isVoided = p.status === 'voided';
                                  return (
                                    <div
                                      key={p.id}
                                      className={`px-2 py-1.5 text-xs flex items-center justify-between rounded ${
                                        isVoided ? 'bg-rose-950/20 opacity-70' : 'hover:bg-slate-800/50'
                                      }`}
                                    >
                                      <div className="flex-1 pr-1">
                                        <div className="flex items-center gap-1.5">
                                          <p
                                            className={`font-mono font-bold ${
                                              isVoided
                                                ? 'text-rose-400 line-through text-[11px]'
                                                : 'text-emerald-400'
                                            }`}
                                          >
                                            {p.amount.toLocaleString('ar-EG')} ج.م
                                          </p>
                                          {isVoided && (
                                            <Badge variant="destructive" className="text-[9px] px-1 py-0 h-4">
                                              ملغي
                                            </Badge>
                                          )}
                                        </div>
                                        <p className="text-[10px] text-muted-foreground">
                                          {p.paymentMethod} • {p.createdAt.split('T')[0]}
                                        </p>
                                        {isVoided && p.voidReason && (
                                          <p className="text-[9px] text-rose-300 italic truncate max-w-[150px]" title={p.voidReason}>
                                            سبب: {p.voidReason}
                                          </p>
                                        )}
                                      </div>
                                      {!isVoided && (
                                        <Button
                                          variant="ghost"
                                          size="icon"
                                          onClick={() => handleVoidPaymentClick(p)}
                                          className="h-6 w-6 text-muted-foreground hover:text-rose-400 hover:bg-rose-500/10"
                                          title="إلغاء الدفعة"
                                        >
                                          <RotateCcw className="w-3 h-3" />
                                        </Button>
                                      )}
                                    </div>
                                  );
                                })}
                              </DropdownMenuContent>
                            </DropdownMenu>
                          )}
                        </div>
                      </div>
                    </div>
                  );
                })
              )}
            </div>

            {/* Desktop Table View (>= md) */}
            <div className="hidden md:block border-t border-slate-800 overflow-x-auto">
              <Table>
                <TableHeader className="bg-slate-900/70">
                  <TableRow className="border-slate-800 hover:bg-transparent text-xs">
                    <TableHead className="text-right">الموظف</TableHead>
                    <TableHead className="text-center">الأساسي</TableHead>
                    <TableHead className="text-center">الإضافي والبدلات</TableHead>
                    <TableHead className="text-center">خصم الحضور</TableHead>
                    <TableHead className="text-center">أقساط السلف</TableHead>
                    <TableHead className="text-center">المستحق (الصافي)</TableHead>
                <TableHead className="text-center">المدفوع</TableHead>
                <TableHead className="text-center">المتبقي</TableHead>
                <TableHead className="text-center">الحالة</TableHead>
                <TableHead className="text-left">الإجراء</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {filteredRecords.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={10} className="text-center py-10 text-muted-foreground text-xs">
                    لا يوجد موظفون أو بيانات رواتب تطابق الفترة وشروط البحث
                  </TableCell>
                </TableRow>
              ) : (
                filteredRecords.map((rec) => {
                  const empPayments = allPayments.filter(
                    (p) => p.employeeId === rec.employeeId && p.payrollPeriod === currentPeriod
                  );

                  return (
                    <TableRow key={rec.id} className="border-slate-800/60 hover:bg-slate-900/40 text-xs">
                      {/* Employee */}
                      <TableCell className="font-medium">
                        <div>
                          <p className="font-bold text-slate-100">{rec.employeeName}</p>
                          <p className="text-[10px] text-muted-foreground">{rec.employeeRole}</p>
                        </div>
                      </TableCell>

                      {/* Basic */}
                      <TableCell className="text-center font-mono">
                        {rec.basicSalarySnapshot.toLocaleString('ar-EG')} ج.م
                      </TableCell>

                      {/* Additions */}
                      <TableCell className="text-center font-mono text-emerald-400">
                        +{ (rec.overtime + rec.bonuses + rec.allowances).toLocaleString('ar-EG') }
                      </TableCell>

                      {/* Attendance Deductions */}
                      <TableCell className="text-center">
                        {rec.attendanceDeductions > 0 ? (
                          <span
                            className="font-mono text-rose-400 cursor-help underline decoration-dotted"
                            title={rec.attendanceSummary.deductionReason}
                          >
                            -{rec.attendanceDeductions.toLocaleString('ar-EG')}
                          </span>
                        ) : (
                          <span className="text-muted-foreground font-mono">0</span>
                        )}
                      </TableCell>

                      {/* Advance Installments */}
                      <TableCell className="text-center">
                        {rec.advanceDeductions > 0 ? (
                          <span className="font-mono text-amber-400">
                            -{rec.advanceDeductions.toLocaleString('ar-EG')}
                          </span>
                        ) : (
                          <span className="text-muted-foreground font-mono">0</span>
                        )}
                      </TableCell>

                      {/* Net Due */}
                      <TableCell className="text-center font-mono font-bold text-slate-100 bg-slate-900/30">
                        {rec.netSalary.toLocaleString('ar-EG')} ج.م
                      </TableCell>

                      {/* Paid */}
                      <TableCell className="text-center font-mono text-emerald-400 font-semibold">
                        {rec.totalPaid.toLocaleString('ar-EG')} ج.م
                      </TableCell>

                      {/* Remaining */}
                      <TableCell className="text-center font-mono font-bold text-rose-400">
                        {rec.remaining.toLocaleString('ar-EG')} ج.م
                      </TableCell>

                      {/* Status */}
                      <TableCell className="text-center">
                        <Badge className={`text-[10px] border ${statusBadgeStyles[rec.status] || ''}`}>
                          {statusLabels[rec.status] || rec.status}
                        </Badge>
                      </TableCell>

                      {/* Actions */}
                      <TableCell className="text-left">
                        <div className="flex items-center gap-1 justify-end">
                          {rec.remaining > 0 ? (
                            <Button
                              size="sm"
                              onClick={() => setSelectedPayrollForPayment(rec)}
                              className="h-7 px-2.5 text-xs bg-primary hover:bg-primary/90 gap-1"
                            >
                              <DollarSign className="w-3.5 h-3.5" />
                              <span>صرف</span>
                            </Button>
                          ) : (
                            <Button
                              size="sm"
                              variant="outline"
                              disabled
                              className="h-7 px-2 text-[11px] border-emerald-500/30 text-emerald-400 opacity-80"
                            >
                              <CheckCircle2 className="w-3 h-3 ml-1" />
                              مسدد
                            </Button>
                          )}

                          {empPayments.length > 0 && (
                            <DropdownMenu>
                              <DropdownMenuTrigger asChild>
                                <Button variant="ghost" size="icon" className="h-7 w-7 text-muted-foreground">
                                  <History className="w-3.5 h-3.5" />
                                </Button>
                              </DropdownMenuTrigger>
                              <DropdownMenuContent align="end" className="w-64">
                                <div className="px-2 py-1.5 text-[11px] font-bold text-muted-foreground">
                                  دفعات شهر {currentPeriod} ({empPayments.length})
                                </div>
                                <DropdownMenuSeparator />
                                {empPayments.map((p) => {
                                  const isVoided = p.status === 'voided';
                                  return (
                                    <div
                                      key={p.id}
                                      className={`px-2 py-1.5 text-xs flex items-center justify-between rounded ${
                                        isVoided ? 'bg-rose-950/20 opacity-70' : 'hover:bg-slate-800/50'
                                      }`}
                                    >
                                      <div className="flex-1 pr-1">
                                        <div className="flex items-center gap-1.5">
                                          <p
                                            className={`font-mono font-bold ${
                                              isVoided
                                                ? 'text-rose-400 line-through text-[11px]'
                                                : 'text-emerald-400'
                                            }`}
                                          >
                                            {p.amount.toLocaleString('ar-EG')} ج.م
                                          </p>
                                          {isVoided && (
                                            <Badge variant="destructive" className="text-[9px] px-1 py-0 h-4">
                                              ملغي
                                            </Badge>
                                          )}
                                        </div>
                                        <p className="text-[10px] text-muted-foreground">
                                          {p.paymentMethod} • {p.createdAt.split('T')[0]}
                                        </p>
                                        {isVoided && p.voidReason && (
                                          <p className="text-[9px] text-rose-300 italic truncate max-w-[150px]" title={p.voidReason}>
                                            سبب: {p.voidReason}
                                          </p>
                                        )}
                                      </div>
                                      {!isVoided && (
                                        <Button
                                          variant="ghost"
                                          size="icon"
                                          onClick={() => handleVoidPaymentClick(p)}
                                          className="h-6 w-6 text-muted-foreground hover:text-rose-400 hover:bg-rose-500/10"
                                          title="إلغاء الدفعة"
                                        >
                                          <RotateCcw className="w-3 h-3" />
                                        </Button>
                                      )}
                                    </div>
                                  );
                                })}
                              </DropdownMenuContent>
                            </DropdownMenu>
                          )}
                        </div>
                      </TableCell>
                    </TableRow>
                  );
                })
              )}
            </TableBody>

            {/* Totals Row */}
            {filteredRecords.length > 0 && (
              <tfoot>
                <TableRow className="border-t-2 border-slate-700 bg-slate-900/90 font-bold text-xs">
                  <TableCell>الإجمالي ({filteredRecords.length} موظف)</TableCell>
                  <TableCell className="text-center font-mono">{totals.basic.toLocaleString('ar-EG')} ج.م</TableCell>
                  <TableCell className="text-center font-mono text-emerald-400">+{totals.additions.toLocaleString('ar-EG')}</TableCell>
                  <TableCell className="text-center font-mono text-rose-400">-{totals.attendanceDeductions.toLocaleString('ar-EG')}</TableCell>
                  <TableCell className="text-center font-mono text-amber-400">-{totals.advanceDeductions.toLocaleString('ar-EG')}</TableCell>
                  <TableCell className="text-center font-mono text-slate-100">{totals.net.toLocaleString('ar-EG')} ج.م</TableCell>
                  <TableCell className="text-center font-mono text-emerald-400">{totals.paid.toLocaleString('ar-EG')} ج.م</TableCell>
                  <TableCell className="text-center font-mono text-rose-400">{totals.remaining.toLocaleString('ar-EG')} ج.م</TableCell>
                  <TableCell colSpan={2}></TableCell>
                </TableRow>
              </tfoot>
            )}
          </Table>
        </div>
        </>
        )}
      </CardContent>

      {/* Salary Payment Modal */}
      <SalaryPaymentModal
        open={!!selectedPayrollForPayment}
        onOpenChange={(open) => !open && setSelectedPayrollForPayment(null)}
        payroll={selectedPayrollForPayment}
        onConfirmPayment={onDisbursePayment}
        isSubmitting={isSubmittingPayment}
      />

      {/* Advance Creation Modal */}
      <AdvanceModal
        open={isAdvanceModalOpen}
        onOpenChange={setIsAdvanceModalOpen}
        employees={employees}
        onSaveAdvance={onCreateAdvance}
      />

      {/* Void Payment Modal */}
      <VoidPaymentModal
        open={!!voidPaymentTarget}
        onOpenChange={(open) => !open && setVoidPaymentTarget(null)}
        payment={voidPaymentTarget}
        onConfirmVoid={onVoidPayment}
        isSubmitting={isSubmittingPayment}
      />

      {/* Delete Advance Modal */}
      <DeleteAdvanceModal
        open={!!deleteAdvanceTarget}
        onOpenChange={(open) => !open && setDeleteAdvanceTarget(null)}
        advance={deleteAdvanceTarget}
        onConfirmDelete={onDeleteAdvance || (async () => ({ success: false, message: 'غير مصرح' }))}
        onSwitchToCancel={(adv) => setCancelAdvanceTarget(adv)}
        isSubmitting={isSubmittingPayment}
      />

      {/* Cancel Advance Modal */}
      <CancelAdvanceModal
        open={!!cancelAdvanceTarget}
        onOpenChange={(open) => !open && setCancelAdvanceTarget(null)}
        advance={cancelAdvanceTarget}
        onConfirmCancel={onCancelAdvance || (async () => false)}
        isSubmitting={isSubmittingPayment}
      />
    </Card>
  );
};
