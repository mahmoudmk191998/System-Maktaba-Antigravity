import React, { useState, useMemo } from 'react';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
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
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
  DropdownMenuSeparator,
} from '@/components/ui/dropdown-menu';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  DollarSign,
  HandCoins,
  Receipt,
  Plus,
  ArrowUpRight,
  ArrowDownLeft,
  Calendar,
  CheckCircle2,
  Clock,
  Ban,
  RotateCcw,
  MoreVertical,
  Info,
  AlertTriangle,
  FileText,
  Trash2,
} from 'lucide-react';
import type { PayrollRecord, SalaryPayment, Advance, AdvanceInstallment } from '@/types/payroll';
import { AdvanceModal } from './AdvanceModal';
import { VoidPaymentModal } from './VoidPaymentModal';
import { CancelAdvanceModal } from './CancelAdvanceModal';
import { ReverseInstallmentModal } from './ReverseInstallmentModal';
import { DeleteAdvanceModal } from './DeleteAdvanceModal';

interface EmployeeFinancialTabProps {
  employee: any;
  payrolls: PayrollRecord[];
  payments: SalaryPayment[];
  advances: Advance[];
  installments: AdvanceInstallment[];
  onCreateAdvance: (data: any) => Promise<string | null>;
  onCancelAdvance: (advanceId: string, reason: string) => Promise<boolean>;
  onDeleteAdvance?: (advanceId: string, reason: string) => Promise<{ success: boolean; message?: string }>;
  onVoidPayment?: (paymentId: string, reason: string) => Promise<boolean>;
  onReverseInstallment?: (installmentId: string, reason: string) => Promise<boolean>;
  isProcessing?: boolean;
}

export const EmployeeFinancialTab: React.FC<EmployeeFinancialTabProps> = ({
  employee,
  payrolls,
  payments,
  advances,
  installments,
  onCreateAdvance,
  onCancelAdvance,
  onDeleteAdvance,
  onVoidPayment,
  onReverseInstallment,
  isProcessing = false,
}) => {
  const [isAdvanceModalOpen, setIsAdvanceModalOpen] = useState(false);
  const [statusFilter, setStatusFilter] = useState('all');

  // Modal Targets
  const [deleteAdvanceTarget, setDeleteAdvanceTarget] = useState<Advance | null>(null);
  const [cancelAdvanceTarget, setCancelAdvanceTarget] = useState<Advance | null>(null);
  const [voidPaymentTarget, setVoidPaymentTarget] = useState<SalaryPayment | null>(null);
  const [reverseInstallmentTarget, setReverseInstallmentTarget] = useState<{
    installment: AdvanceInstallment;
    payroll?: PayrollRecord | null;
  } | null>(null);

  // Filter for this employee
  const empPayrolls = useMemo(
    () => payrolls.filter((p) => p.employeeId === employee.id),
    [payrolls, employee.id]
  );

  const empPayments = useMemo(
    () => payments.filter((p) => p.employeeId === employee.id),
    [payments, employee.id]
  );

  const empAdvances = useMemo(
    () => advances.filter((a) => a.employeeId === employee.id),
    [advances, employee.id]
  );

  const empInstallments = useMemo(
    () => installments.filter((i) => i.employeeId === employee.id),
    [installments, employee.id]
  );

  // Financial Summaries - Strict exclusion of voided / cancelled records
  const basicSalary = Number(employee.salary) || 0;

  // Active Advances summary
  const nonCancelledAdvances = empAdvances.filter((a) => a.status !== 'cancelled');
  const totalAdvances = nonCancelledAdvances.reduce((s, a) => s + a.amount, 0);
  const paidAdvances = nonCancelledAdvances.reduce((s, a) => s + (a.paidAmount || 0), 0);
  const remainingAdvances = nonCancelledAdvances.reduce((s, a) => s + (a.remainingAmount || 0), 0);
  const activeAdvances = empAdvances.filter((a) => a.status === 'active' || a.status === 'partially_paid');

  // Payrolls summary (Only completed payments counted towards total paid!)
  const totalDuePayrolls = empPayrolls.reduce((s, p) => s + p.netSalary, 0);
  const totalPaidPayrolls = empPayrolls.reduce((s, p) => s + p.totalPaid, 0);
  const totalRemainingPayrolls = empPayrolls.reduce((s, p) => s + p.remaining, 0);

  // Unified Transactions Timeline
  const transactions = useMemo(() => {
    const list: Array<{
      id: string;
      rawId: string;
      date: string;
      type: 'salary_payment' | 'advance' | 'advance_installment';
      typeName: string;
      amount: number;
      period?: string;
      status: string;
      statusLabel: string;
      notes?: string;
      voidReason?: string;
      operator?: string;
      isCredit: boolean;
      originalItem: any;
    }> = [];

    // 1. Salary Payments
    empPayments.forEach((p) => {
      const isVoided = p.status === 'voided';
      list.push({
        id: `pay_${p.id}`,
        rawId: p.id,
        date: p.createdAt?.split('T')[0] || '',
        type: 'salary_payment',
        typeName: 'صرف راتب',
        amount: p.amount,
        period: p.payrollPeriod,
        status: isVoided ? 'voided' : 'paid',
        statusLabel: isVoided ? 'ملغي' : 'مكتمل',
        notes: p.notes,
        voidReason: p.voidReason,
        operator: isVoided ? p.voidedBy : p.createdBy,
        isCredit: false,
        originalItem: p,
      });
    });

    // 2. Advances
    empAdvances.forEach((a) => {
      const isCancelled = a.status === 'cancelled';
      let statusLabel = 'نشطة';
      if (a.status === 'fully_paid') statusLabel = 'مسددة بالكامل';
      if (a.status === 'partially_paid') statusLabel = 'مسددة جزئياً';
      if (isCancelled) statusLabel = 'ملغاة';

      list.push({
        id: `adv_${a.id}`,
        rawId: a.id,
        date: a.createdAt?.split('T')[0] || '',
        type: 'advance',
        typeName: 'سلفة نقدية',
        amount: a.amount,
        status: a.status,
        statusLabel,
        notes: a.notes,
        voidReason: a.cancelReason,
        operator: isCancelled ? a.cancelledBy : a.createdBy,
        isCredit: true,
        originalItem: a,
      });
    });

    // 3. Advance Installments
    empInstallments.forEach((i) => {
      const isVoided = i.status === 'voided';
      list.push({
        id: `inst_${i.id}`,
        rawId: i.id,
        date: i.paidAt?.split('T')[0] || i.createdAt?.split('T')[0] || '',
        type: 'advance_installment',
        typeName: 'سداد قسط سلفة',
        amount: i.amount,
        period: i.period,
        status: isVoided ? 'voided' : 'paid',
        statusLabel: isVoided ? 'ملغي' : 'مستقطع',
        notes: `استقطاع من راتب شهر ${i.period}`,
        voidReason: i.voidReason,
        operator: isVoided ? i.voidedBy : 'النظام',
        isCredit: false,
        originalItem: i,
      });
    });

    // Sort descending by date
    return list.sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());
  }, [empPayments, empAdvances, empInstallments]);

  // Filtered transactions by Status Filter
  const filteredTransactions = useMemo(() => {
    if (statusFilter === 'all') return transactions;
    if (statusFilter === 'active') {
      return transactions.filter((t) => t.status === 'active' || t.status === 'partially_paid');
    }
    if (statusFilter === 'paid') {
      return transactions.filter((t) => t.status === 'paid' || t.status === 'fully_paid');
    }
    if (statusFilter === 'cancelled') {
      return transactions.filter((t) => t.status === 'cancelled');
    }
    if (statusFilter === 'voided') {
      return transactions.filter((t) => t.status === 'voided');
    }
    return transactions;
  }, [transactions, statusFilter]);

  return (
    <div className="space-y-4 py-1 text-xs">
      {/* 1. Top Three Summary Blocks */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
        {/* Block A: Current Salary Package */}
        <div className="p-3 bg-slate-900/70 rounded-xl border border-slate-800 space-y-2">
          <div className="flex items-center justify-between">
            <span className="font-bold text-slate-200 flex items-center gap-1.5">
              <DollarSign className="w-4 h-4 text-primary" />
              الراتب الحالي
            </span>
            <span className="font-bold font-mono text-sm text-primary">
              {basicSalary.toLocaleString('ar-EG')} ج.م
            </span>
          </div>
          <div className="space-y-1 text-[11px] text-muted-foreground pt-1 border-t border-slate-800/80">
            <div className="flex justify-between">
              <span>الراتب الأساسي:</span>
              <span className="font-mono">{basicSalary.toLocaleString('ar-EG')} ج.م</span>
            </div>
            <div className="flex justify-between">
              <span>اليومية التقريبية (30 يوم):</span>
              <span className="font-mono">{(basicSalary / 30).toFixed(1)} ج.م</span>
            </div>
            <div className="flex justify-between">
              <span>ساعة العمل التقريبية (8 س):</span>
              <span className="font-mono">{(basicSalary / 240).toFixed(1)} ج.م</span>
            </div>
          </div>
        </div>

        {/* Block B: Advances Summary */}
        <div className="p-3 bg-slate-900/70 rounded-xl border border-slate-800 space-y-2">
          <div className="flex items-center justify-between">
            <span className="font-bold text-slate-200 flex items-center gap-1.5">
              <HandCoins className="w-4 h-4 text-amber-400" />
              السلف والأقساط
            </span>
            <Button
              size="sm"
              variant="outline"
              onClick={() => setIsAdvanceModalOpen(true)}
              className="h-6 px-2 text-[10px] border-amber-500/30 text-amber-400 hover:bg-amber-500/10 gap-1"
            >
              <Plus className="w-3 h-3" />
              سلفة
            </Button>
          </div>
          <div className="space-y-1 text-[11px] text-muted-foreground pt-1 border-t border-slate-800/80">
            <div className="flex justify-between">
              <span>إجمالي السلف النشطة:</span>
              <span className="font-mono font-bold text-slate-200">{totalAdvances.toLocaleString('ar-EG')} ج.م</span>
            </div>
            <div className="flex justify-between">
              <span>المسدد منها:</span>
              <span className="font-mono text-emerald-400">{paidAdvances.toLocaleString('ar-EG')} ج.م</span>
            </div>
            <div className="flex justify-between">
              <span>المتبقي للسداد:</span>
              <span className="font-mono font-bold text-amber-400">{remainingAdvances.toLocaleString('ar-EG')} ج.م</span>
            </div>
          </div>
        </div>

        {/* Block C: Payrolls Overview */}
        <div className="p-3 bg-slate-900/70 rounded-xl border border-slate-800 space-y-2">
          <div className="flex items-center justify-between">
            <span className="font-bold text-slate-200 flex items-center gap-1.5">
              <Receipt className="w-4 h-4 text-sky-400" />
              المرتبات (كافة الفترات)
            </span>
            <Badge variant="outline" className="text-[10px]">
              {empPayrolls.length} مسير
            </Badge>
          </div>
          <div className="space-y-1 text-[11px] text-muted-foreground pt-1 border-t border-slate-800/80">
            <div className="flex justify-between">
              <span>إجمالي المستحق:</span>
              <span className="font-mono font-bold text-slate-200">{totalDuePayrolls.toLocaleString('ar-EG')} ج.م</span>
            </div>
            <div className="flex justify-between">
              <span>إجمالي المدفوع:</span>
              <span className="font-mono text-emerald-400">{totalPaidPayrolls.toLocaleString('ar-EG')} ج.م</span>
            </div>
            <div className="flex justify-between">
              <span>إجمالي المتبقي:</span>
              <span className="font-mono font-bold text-rose-400">{totalRemainingPayrolls.toLocaleString('ar-EG')} ج.م</span>
            </div>
          </div>
        </div>
      </div>

      {/* 2. Active Advances List if any */}
      {activeAdvances.length > 0 && (
        <div className="space-y-2 pt-1">
          <h4 className="text-xs font-bold text-slate-300 flex items-center gap-1.5">
            <Clock className="w-3.5 h-3.5 text-amber-400" />
            السلف النشطة قيد السداد ({activeAdvances.length})
          </h4>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
            {activeAdvances.map((adv) => (
              <div
                key={adv.id}
                className="p-3 bg-slate-950/60 rounded-lg border border-slate-800 flex items-center justify-between"
              >
                <div>
                  <div className="flex items-center gap-2">
                    <span className="font-bold font-mono text-slate-100">{adv.amount.toLocaleString('ar-EG')} ج.م</span>
                    <Badge variant="secondary" className="text-[9px]">
                      {adv.repaymentType === 'installments' ? `${adv.numberOfInstallments} أقساط` : 'خصم كامل'}
                    </Badge>
                    <Badge variant="outline" className="text-[9px] border-amber-500/30 text-amber-400">
                      {adv.status === 'partially_paid' ? 'مسدد جزئياً' : 'نشط'}
                    </Badge>
                  </div>
                  <p className="text-[10px] text-muted-foreground pt-1">
                    المتبقي: <span className="font-mono text-amber-400 font-bold">{adv.remainingAmount.toLocaleString('ar-EG')} ج.م</span> • المسدد: <span className="font-mono text-emerald-400">{adv.paidAmount.toLocaleString('ar-EG')} ج.م</span>
                  </p>
                  <p className="text-[10px] text-slate-400 pt-0.5">
                    تاريخ البدء: {adv.startDate}
                  </p>
                </div>

                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <Button variant="ghost" size="icon" className="h-7 w-7 text-muted-foreground">
                      <MoreVertical className="w-3.5 h-3.5" />
                    </Button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="end" className="w-36 text-xs">
                    <DropdownMenuItem
                      onClick={() => setCancelAdvanceTarget(adv)}
                      className="text-rose-400 focus:text-rose-400 cursor-pointer"
                    >
                      <Ban className="w-3.5 h-3.5 ml-1.5" />
                      إلغاء السلفة
                    </DropdownMenuItem>
                  </DropdownMenuContent>
                </DropdownMenu>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* 3. Financial Transactions History / Timeline */}
      <div className="space-y-2.5 pt-2">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
          <h4 className="text-xs font-bold text-slate-200 flex items-center gap-1.5">
            <FileText className="w-3.5 h-3.5 text-primary" />
            سجل العمليات المالية والرقابية
          </h4>

          {/* Filter Bar */}
          <div className="flex items-center gap-2">
            <span className="text-[11px] text-muted-foreground">تصفية حسب الحالة:</span>
            <Select value={statusFilter} onValueChange={setStatusFilter}>
              <SelectTrigger className="w-[130px] h-7 text-[11px] bg-slate-900 border-slate-700">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">الكل ({transactions.length})</SelectItem>
                <SelectItem value="paid">المكتمل والمسدد</SelectItem>
                <SelectItem value="active">النشط / قيد السداد</SelectItem>
                <SelectItem value="cancelled">الملغى (سلف)</SelectItem>
                <SelectItem value="voided">المعكوس (دفعات/أقساط)</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </div>

        <div className="max-h-72 overflow-y-auto rounded-lg border border-slate-800">
          <Table>
            <TableHeader className="bg-slate-900/60 sticky top-0 z-10">
              <TableRow className="border-slate-800 text-[11px]">
                <TableHead className="text-right">التاريخ</TableHead>
                <TableHead className="text-right">العملية</TableHead>
                <TableHead className="text-center">الفترة</TableHead>
                <TableHead className="text-left">المبلغ</TableHead>
                <TableHead className="text-center">الحالة</TableHead>
                <TableHead className="text-right">البيان / سبب الإلغاء</TableHead>
                <TableHead className="text-center">إجراءات</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {filteredTransactions.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={7} className="text-center py-6 text-muted-foreground">
                    لا توجد معاملات مطابقة للفلتر المحدد
                  </TableCell>
                </TableRow>
              ) : (
                filteredTransactions.map((tx) => {
                  const isVoidedOrCancelled = tx.status === 'voided' || tx.status === 'cancelled';

                  return (
                    <TableRow
                      key={tx.id}
                      className={`border-slate-800/60 text-xs ${
                        isVoidedOrCancelled ? 'bg-rose-950/15 text-muted-foreground' : ''
                      }`}
                    >
                      <TableCell className="font-mono text-[11px]">{tx.date}</TableCell>
                      <TableCell className="font-semibold">{tx.typeName}</TableCell>
                      <TableCell className="text-center font-mono text-[11px]">
                        {tx.period || '-'}
                      </TableCell>
                      <TableCell className="text-left font-mono font-bold">
                        <span
                          className={
                            isVoidedOrCancelled
                              ? 'line-through text-slate-500'
                              : tx.isCredit
                              ? 'text-amber-400'
                              : 'text-emerald-400'
                          }
                        >
                          {tx.isCredit ? '+' : '-'}{tx.amount.toLocaleString('ar-EG')} ج.م
                        </span>
                      </TableCell>
                      <TableCell className="text-center">
                        <Badge
                          variant={isVoidedOrCancelled ? 'destructive' : 'outline'}
                          className={`text-[9px] ${
                            tx.status === 'paid'
                              ? 'border-emerald-500/30 text-emerald-400'
                              : tx.status === 'active' || tx.status === 'partially_paid'
                              ? 'border-amber-500/30 text-amber-400'
                              : ''
                          }`}
                        >
                          {tx.statusLabel}
                        </Badge>
                      </TableCell>
                      <TableCell className="text-[11px] max-w-[200px]">
                        {isVoidedOrCancelled ? (
                          <div className="space-y-0.5">
                            <span className="text-rose-300 font-medium">
                              السبب: {tx.voidReason || tx.notes || 'تم الإلغاء'}
                            </span>
                            {tx.operator && (
                              <p className="text-[10px] text-muted-foreground">
                                بواسطة: {tx.operator}
                              </p>
                            )}
                          </div>
                        ) : (
                          <span>{tx.notes || '-'}</span>
                        )}
                      </TableCell>
                      <TableCell className="text-center">
                        {!isVoidedOrCancelled && (
                          <DropdownMenu>
                            <DropdownMenuTrigger asChild>
                              <Button variant="ghost" size="icon" className="h-6 w-6 text-muted-foreground hover:text-slate-100">
                                <MoreVertical className="w-3.5 h-3.5" />
                              </Button>
                            </DropdownMenuTrigger>
                            <DropdownMenuContent align="end" className="w-40 text-xs">
                              {/* 1. Salary Payment Action */}
                              {tx.type === 'salary_payment' && onVoidPayment && (
                                <DropdownMenuItem
                                  onClick={() => setVoidPaymentTarget(tx.originalItem)}
                                  className="text-rose-400 focus:text-rose-400 cursor-pointer"
                                >
                                  <RotateCcw className="w-3.5 h-3.5 ml-1.5" />
                                  إلغاء الدفعة
                                </DropdownMenuItem>
                              )}

                              {/* 2. Advance Action */}
                              {tx.type === 'advance' && (
                                <>
                                  {(tx.originalItem.paidAmount || 0) === 0 && onDeleteAdvance && (
                                    <DropdownMenuItem
                                      onClick={() => setDeleteAdvanceTarget(tx.originalItem)}
                                      className="text-rose-400 focus:text-rose-400 cursor-pointer"
                                    >
                                      <Trash2 className="w-3.5 h-3.5 ml-1.5" />
                                      حذف السلفة
                                    </DropdownMenuItem>
                                  )}
                                  <DropdownMenuItem
                                    onClick={() => setCancelAdvanceTarget(tx.originalItem)}
                                    className="text-amber-400 focus:text-amber-400 cursor-pointer"
                                  >
                                    <Ban className="w-3.5 h-3.5 ml-1.5" />
                                    إلغاء السلفة
                                  </DropdownMenuItem>
                                </>
                              )}

                              {/* 3. Installment Action */}
                              {tx.type === 'advance_installment' && onReverseInstallment && (
                                <DropdownMenuItem
                                  onClick={() => {
                                    const linkedPayroll = payrolls.find(
                                      (p) => p.id === tx.originalItem.payrollId
                                    );
                                    setReverseInstallmentTarget({
                                      installment: tx.originalItem,
                                      payroll: linkedPayroll,
                                    });
                                  }}
                                  className="text-rose-400 focus:text-rose-400 cursor-pointer"
                                >
                                  <RotateCcw className="w-3.5 h-3.5 ml-1.5" />
                                  إلغاء القسط
                                </DropdownMenuItem>
                              )}
                            </DropdownMenuContent>
                          </DropdownMenu>
                        )}
                      </TableCell>
                    </TableRow>
                  );
                })
              )}
            </TableBody>
          </Table>
        </div>
      </div>

      {/* Advance Modal */}
      <AdvanceModal
        open={isAdvanceModalOpen}
        onOpenChange={setIsAdvanceModalOpen}
        employees={[{ id: employee.id, name: employee.name, role: employee.role }]}
        defaultEmployeeId={employee.id}
        onSaveAdvance={onCreateAdvance}
      />

      {/* Delete Advance Modal */}
      {onDeleteAdvance && (
        <DeleteAdvanceModal
          open={!!deleteAdvanceTarget}
          onOpenChange={(open) => !open && setDeleteAdvanceTarget(null)}
          advance={deleteAdvanceTarget}
          onConfirmDelete={onDeleteAdvance}
          onSwitchToCancel={(adv) => setCancelAdvanceTarget(adv)}
          isSubmitting={isProcessing}
        />
      )}

      {/* Cancel Advance Modal */}
      <CancelAdvanceModal
        open={!!cancelAdvanceTarget}
        onOpenChange={(open) => !open && setCancelAdvanceTarget(null)}
        advance={cancelAdvanceTarget}
        onConfirmCancel={onCancelAdvance}
        isSubmitting={isProcessing}
      />

      {/* Void Salary Payment Modal */}
      {onVoidPayment && (
        <VoidPaymentModal
          open={!!voidPaymentTarget}
          onOpenChange={(open) => !open && setVoidPaymentTarget(null)}
          payment={voidPaymentTarget}
          onConfirmVoid={onVoidPayment}
          isSubmitting={isProcessing}
        />
      )}

      {/* Reverse Installment Modal */}
      {onReverseInstallment && (
        <ReverseInstallmentModal
          open={!!reverseInstallmentTarget}
          onOpenChange={(open) => !open && setReverseInstallmentTarget(null)}
          installment={reverseInstallmentTarget?.installment || null}
          payroll={reverseInstallmentTarget?.payroll || null}
          onConfirmReverse={onReverseInstallment}
          isSubmitting={isProcessing}
        />
      )}
    </div>
  );
};
