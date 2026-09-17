import React, { useState, useMemo } from 'react';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from '@/components/ui/tooltip';
import {
  HandCoins,
  Search,
  Plus,
  Trash2,
  Ban,
  CheckCircle2,
  Clock,
  Info,
  Calendar,
  Layers,
  ArrowDownLeft,
} from 'lucide-react';
import type { Advance, EmployeeData } from '@/types/payroll';

interface ActiveAdvancesTableProps {
  advances: Advance[];
  employees?: any[];
  onOpenCreateModal: () => void;
  onRequestDelete: (advance: Advance) => void;
  onRequestCancel: (advance: Advance) => void;
  isProcessing?: boolean;
}

export const ActiveAdvancesTable: React.FC<ActiveAdvancesTableProps> = ({
  advances,
  employees = [],
  onOpenCreateModal,
  onRequestDelete,
  onRequestCancel,
  isProcessing = false,
}) => {
  const [searchQuery, setSearchQuery] = useState('');
  const [viewFilter, setViewFilter] = useState<'active' | 'history' | 'all'>('active');

  // Filtered Advances
  const filteredAdvances = useMemo(() => {
    return advances.filter((adv) => {
      // 1. View Filter
      if (viewFilter === 'active') {
        // Active or partially paid only
        if (adv.status !== 'active' && adv.status !== 'partially_paid') {
          return false;
        }
      } else if (viewFilter === 'history') {
        // Completed or cancelled
        if (adv.status !== 'paid' && adv.status !== 'cancelled') {
          return false;
        }
      }

      // 2. Search Query
      if (searchQuery.trim()) {
        const q = searchQuery.toLowerCase().trim();
        const matchName = adv.employeeName?.toLowerCase().includes(q);
        const matchNotes = adv.notes?.toLowerCase().includes(q);
        if (!matchName && !matchNotes) return false;
      }

      return true;
    });
  }, [advances, viewFilter, searchQuery]);

  // Summary Metrics
  const metrics = useMemo(() => {
    const activeList = advances.filter((a) => a.status === 'active' || a.status === 'partially_paid');
    const totalActiveAmount = activeList.reduce((s, a) => s + a.amount, 0);
    const totalRemaining = activeList.reduce((s, a) => s + (a.remainingAmount || 0), 0);
    const totalPaid = activeList.reduce((s, a) => s + (a.paidAmount || 0), 0);

    return {
      activeCount: activeList.length,
      totalActiveAmount,
      totalRemaining,
      totalPaid,
    };
  }, [advances]);

  return (
    <div className="space-y-4">
      {/* 1. Metrics & Header Controls */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
        <div className="p-3 bg-slate-900/60 rounded-xl border border-slate-800 flex items-center justify-between">
          <div>
            <p className="text-[11px] text-muted-foreground">السلف القائمة (النشطة)</p>
            <p className="text-lg font-bold font-mono text-slate-100 mt-0.5">
              {metrics.activeCount} <span className="text-xs font-normal text-muted-foreground">سلفة</span>
            </p>
          </div>
          <div className="w-9 h-9 rounded-lg bg-primary/10 border border-primary/20 flex items-center justify-center text-primary">
            <HandCoins className="w-5 h-5" />
          </div>
        </div>

        <div className="p-3 bg-slate-900/60 rounded-xl border border-slate-800 flex items-center justify-between">
          <div>
            <p className="text-[11px] text-muted-foreground">المتبقي للتحصيل</p>
            <p className="text-lg font-bold font-mono text-amber-400 mt-0.5">
              {metrics.totalRemaining.toLocaleString('ar-EG')} <span className="text-xs font-normal">ج.م</span>
            </p>
          </div>
          <div className="w-9 h-9 rounded-lg bg-amber-500/10 border border-amber-500/20 flex items-center justify-center text-amber-400">
            <Clock className="w-5 h-5" />
          </div>
        </div>

        <div className="p-3 bg-slate-900/60 rounded-xl border border-slate-800 flex items-center justify-between">
          <div>
            <p className="text-[11px] text-muted-foreground">المسدد من السلف القائمة</p>
            <p className="text-lg font-bold font-mono text-emerald-400 mt-0.5">
              {metrics.totalPaid.toLocaleString('ar-EG')} <span className="text-xs font-normal">ج.م</span>
            </p>
          </div>
          <div className="w-9 h-9 rounded-lg bg-emerald-500/10 border border-emerald-500/20 flex items-center justify-center text-emerald-400">
            <CheckCircle2 className="w-5 h-5" />
          </div>
        </div>
      </div>

      {/* 2. Filter & Action Toolbar */}
      <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-3 pt-1">
        <div className="flex flex-col sm:flex-row flex-1 items-stretch sm:items-center gap-2">
          <div className="relative flex-1">
            <Search className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
            <Input
              placeholder="بحث باسم الموظف أو ملاحظات السلفة..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="pr-9 h-9 text-xs bg-slate-900/80 border-slate-700"
            />
          </div>

          <Select
            value={viewFilter}
            onValueChange={(val: any) => setViewFilter(val)}
          >
            <SelectTrigger className="w-full sm:w-[180px] h-9 text-xs bg-slate-900/80 border-slate-700">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="active">السلف القائمة ({metrics.activeCount})</SelectItem>
              <SelectItem value="history">سجل السلف السابق</SelectItem>
              <SelectItem value="all">جميع السلف ({advances.length})</SelectItem>
            </SelectContent>
          </Select>
        </div>

        <Button
          size="sm"
          onClick={onOpenCreateModal}
          className="gap-1.5 text-xs h-9 bg-primary hover:bg-primary/90 text-primary-foreground font-bold shrink-0 w-full sm:w-auto"
        >
          <Plus className="w-4 h-4" />
          <span>إضافة سلفة جديدة</span>
        </Button>
      </div>

      {/* 3. Mobile Cards View (< md) */}
      <div className="md:hidden space-y-3">
        {filteredAdvances.length === 0 ? (
          <div className="text-center py-12 text-muted-foreground p-4 bg-slate-900/30 rounded-xl border border-slate-800">
            <HandCoins className="w-10 h-10 mx-auto mb-2 opacity-30 text-amber-400" />
            <p className="text-sm">لا توجد سلف مطابقة للفلتر الحالي</p>
            <p className="text-xs text-muted-foreground mt-1">
              {viewFilter === 'active' ? 'لا توجد سلف نشطة قيد السداد حالياً' : 'لم يتم تسجيل أي سلف سابقة'}
            </p>
          </div>
        ) : (
          filteredAdvances.map((adv) => {
            const paidAmt = adv.paidAmount || 0;
            const remainingAmt = adv.remainingAmount ?? (adv.amount - paidAmt);
            const isPartiallyPaid = paidAmt > 0;
            const isCancelled = adv.status === 'cancelled';
            const isFullyPaid = adv.status === 'paid' || remainingAmt <= 0;

            return (
              <div
                key={adv.id}
                className={`p-4 rounded-xl border border-slate-800 bg-slate-900/50 space-y-3 ${
                  isCancelled ? 'opacity-70 bg-rose-950/10' : ''
                }`}
              >
                <div className="flex items-start justify-between gap-2">
                  <div className="flex items-center gap-2">
                    <div className="w-8 h-8 rounded-full bg-slate-800 flex items-center justify-center font-bold text-xs text-slate-300 shrink-0">
                      {adv.employeeName?.charAt(0) || 'م'}
                    </div>
                    <div>
                      <p className="font-bold text-slate-100 text-sm">{adv.employeeName}</p>
                      <p className="text-[10px] text-muted-foreground flex items-center gap-1">
                        <Calendar className="w-3 h-3" />
                        {adv.startDate || adv.createdAt?.slice(0, 10)}
                      </p>
                    </div>
                  </div>

                  {isCancelled ? (
                    <Badge variant="destructive" className="text-[10px] gap-1">
                      <Ban className="w-3 h-3" />
                      ملغاة
                    </Badge>
                  ) : isFullyPaid ? (
                    <Badge variant="outline" className="border-emerald-500/30 text-emerald-400 text-[10px] gap-1">
                      <CheckCircle2 className="w-3 h-3" />
                      مسددة بالكامل
                    </Badge>
                  ) : isPartiallyPaid ? (
                    <Badge variant="outline" className="border-amber-500/30 text-amber-400 text-[10px] gap-1">
                      <Clock className="w-3 h-3" />
                      مسددة جزئياً
                    </Badge>
                  ) : (
                    <Badge variant="outline" className="border-sky-500/30 text-sky-400 text-[10px] gap-1">
                      <Layers className="w-3 h-3" />
                      نشطة
                    </Badge>
                  )}
                </div>

                <div className="grid grid-cols-3 gap-2 text-center bg-slate-950/40 p-2.5 rounded-lg border border-slate-800/60">
                  <div>
                    <span className="text-[10px] text-muted-foreground block">مبلغ السلفة</span>
                    <span className="font-mono font-bold text-xs text-slate-200">{adv.amount.toLocaleString('ar-EG')} ج.م</span>
                  </div>
                  <div>
                    <span className="text-[10px] text-muted-foreground block">المسدد</span>
                    <span className="font-mono font-bold text-xs text-emerald-400">{paidAmt.toLocaleString('ar-EG')} ج.م</span>
                  </div>
                  <div>
                    <span className="text-[10px] text-muted-foreground block">المتبقي</span>
                    <span className="font-mono font-bold text-xs text-amber-400">
                      {isCancelled ? '0' : remainingAmt.toLocaleString('ar-EG')} ج.م
                    </span>
                  </div>
                </div>

                <div className="flex items-center justify-between text-xs pt-1">
                  <div className="text-[11px] text-slate-300">
                    {adv.repaymentType === 'installments' ? (
                      <span>{adv.numberOfInstallments} أقساط × {adv.installmentAmount?.toLocaleString('ar-EG')} ج.م</span>
                    ) : (
                      <span>خصم كامل من الراتب</span>
                    )}
                  </div>

                  {!isCancelled && !isFullyPaid && (
                    <div className="flex items-center gap-1.5">
                      {!isPartiallyPaid && (
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => onRequestDelete(adv)}
                          disabled={isProcessing}
                          className="h-7 px-2.5 text-xs text-rose-400 hover:text-rose-300 hover:bg-rose-500/10 gap-1 border border-rose-500/20"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                          <span>حذف</span>
                        </Button>
                      )}
                      {isPartiallyPaid && (
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => onRequestCancel(adv)}
                          disabled={isProcessing}
                          className="h-7 px-2.5 text-xs text-amber-400 hover:text-amber-300 hover:bg-amber-500/10 gap-1 border border-amber-500/20"
                        >
                          <Ban className="w-3.5 h-3.5" />
                          <span>إلغاء</span>
                        </Button>
                      )}
                    </div>
                  )}
                </div>
              </div>
            );
          })
        )}
      </div>

      {/* 4. Desktop Table View (>= md) */}
      <div className="hidden md:block rounded-xl border border-slate-800 overflow-x-auto bg-slate-950/40">
        <Table>
          <TableHeader className="bg-slate-900/70">
            <TableRow className="border-slate-800 hover:bg-transparent text-xs">
              <TableHead className="text-right">الموظف</TableHead>
              <TableHead className="text-center">المبلغ</TableHead>
              <TableHead className="text-center">المدفوع</TableHead>
              <TableHead className="text-center">المتبقي</TableHead>
              <TableHead className="text-center">الأقساط</TableHead>
              <TableHead className="text-center">الحالة</TableHead>
              <TableHead className="text-center">الإجراءات</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {filteredAdvances.length === 0 ? (
              <TableRow>
                <TableCell colSpan={7} className="text-center py-12 text-muted-foreground">
                  <HandCoins className="w-10 h-10 mx-auto mb-2 opacity-30 text-amber-400" />
                  <p className="text-sm">لا توجد سلف مطابقة للفلتر الحالي</p>
                  <p className="text-xs text-muted-foreground mt-1">
                    {viewFilter === 'active' ? 'لا توجد سلف نشطة قيد السداد حالياً' : 'لم يتم تسجيل أي سلف سابقة'}
                  </p>
                </TableCell>
              </TableRow>
            ) : (
              filteredAdvances.map((adv) => {
                const paidAmt = adv.paidAmount || 0;
                const remainingAmt = adv.remainingAmount ?? (adv.amount - paidAmt);
                const isPartiallyPaid = paidAmt > 0;
                const isCancelled = adv.status === 'cancelled';
                const isFullyPaid = adv.status === 'paid' || remainingAmt <= 0;

                return (
                  <TableRow
                    key={adv.id}
                    className={`border-slate-800/80 hover:bg-slate-900/50 transition-colors text-xs ${
                      isCancelled ? 'bg-rose-950/10 text-muted-foreground' : ''
                    }`}
                  >
                    {/* Employee */}
                    <TableCell className="font-semibold text-right">
                      <div className="flex items-center gap-2">
                        <div className="w-7 h-7 rounded-full bg-slate-800 flex items-center justify-center font-bold text-[11px] text-slate-300">
                          {adv.employeeName?.charAt(0) || 'م'}
                        </div>
                        <div>
                          <p className="text-slate-100 font-bold">{adv.employeeName}</p>
                          <p className="text-[10px] text-muted-foreground flex items-center gap-1">
                            <Calendar className="w-3 h-3" />
                            {adv.startDate || adv.createdAt?.slice(0, 10)}
                          </p>
                        </div>
                      </div>
                    </TableCell>

                    {/* Amount */}
                    <TableCell className="text-center font-mono font-bold text-slate-200">
                      <span className={isCancelled ? 'line-through text-slate-500' : ''}>
                        {adv.amount.toLocaleString('ar-EG')} ج.م
                      </span>
                    </TableCell>

                    {/* Paid */}
                    <TableCell className="text-center font-mono font-bold text-emerald-400">
                      {paidAmt > 0 ? (
                        <span className="flex items-center justify-center gap-1">
                          <CheckCircle2 className="w-3 h-3 text-emerald-400" />
                          {paidAmt.toLocaleString('ar-EG')} ج.م
                        </span>
                      ) : (
                        <span className="text-muted-foreground font-normal">0 ج.م</span>
                      )}
                    </TableCell>

                    {/* Remaining */}
                    <TableCell className="text-center font-mono font-bold">
                      {isCancelled ? (
                        <span className="text-muted-foreground line-through">0 ج.م</span>
                      ) : remainingAmt > 0 ? (
                        <span className="text-amber-400">
                          {remainingAmt.toLocaleString('ar-EG')} ج.م
                        </span>
                      ) : (
                        <span className="text-emerald-400">0 ج.م (مكتمل)</span>
                      )}
                    </TableCell>

                    {/* Installments */}
                    <TableCell className="text-center">
                      {adv.repaymentType === 'installments' ? (
                        <div className="flex flex-col items-center">
                          <span className="text-[11px] font-semibold text-slate-200">
                            {adv.numberOfInstallments} أقساط × {adv.installmentAmount?.toLocaleString('ar-EG')} ج.م
                          </span>
                          {!isCancelled && (
                            <span className="text-[10px] text-muted-foreground">
                              متبقي: {adv.remainingInstallments ?? 0} أقساط
                            </span>
                          )}
                        </div>
                      ) : (
                        <span className="text-[11px] text-slate-300">
                          خصم كامل من الراتب القادم
                        </span>
                      )}
                    </TableCell>

                    {/* Status */}
                    <TableCell className="text-center">
                      {isCancelled ? (
                        <Tooltip delayDuration={0}>
                          <TooltipTrigger asChild>
                            <Badge variant="destructive" className="text-[10px] gap-1 cursor-help">
                              <Ban className="w-3 h-3" />
                              ملغاة
                            </Badge>
                          </TooltipTrigger>
                          <TooltipContent side="top" className="text-xs max-w-xs bg-slate-900 border-slate-700">
                            <p className="font-bold text-rose-400">سبب الإلغاء:</p>
                            <p className="text-[11px]">{adv.cancelReason || 'غير محدد'}</p>
                            {adv.cancelledBy && (
                              <p className="text-[10px] text-muted-foreground mt-1">
                                بواسطة: {adv.cancelledBy} ({adv.cancelledAt?.slice(0, 10)})
                              </p>
                            )}
                          </TooltipContent>
                        </Tooltip>
                      ) : isFullyPaid ? (
                        <Badge variant="outline" className="border-emerald-500/30 text-emerald-400 text-[10px] gap-1">
                          <CheckCircle2 className="w-3 h-3" />
                          مسددة بالكامل
                        </Badge>
                      ) : isPartiallyPaid ? (
                        <Badge variant="outline" className="border-amber-500/30 text-amber-400 text-[10px] gap-1">
                          <Clock className="w-3 h-3" />
                          مسددة جزئياً
                        </Badge>
                      ) : (
                        <Badge variant="outline" className="border-sky-500/30 text-sky-400 text-[10px] gap-1">
                          <Layers className="w-3 h-3" />
                          نشطة
                        </Badge>
                      )}
                    </TableCell>

                    {/* Actions */}
                    <TableCell className="text-center">
                      {!isCancelled && !isFullyPaid && (
                        <div className="flex items-center justify-center gap-1.5">
                          {/* Case 1: No financial activity -> Hard Delete Allowed */}
                          {!isPartiallyPaid && (
                            <Button
                              variant="ghost"
                              size="sm"
                              onClick={() => onRequestDelete(adv)}
                              disabled={isProcessing}
                              className="h-7 px-2.5 text-xs text-rose-400 hover:text-rose-300 hover:bg-rose-500/10 gap-1 border border-rose-500/20"
                            >
                              <Trash2 className="w-3.5 h-3.5" />
                              <span>حذف</span>
                            </Button>
                          )}

                          {/* Case 2: Financial activity exists -> Cancel Advance */}
                          {isPartiallyPaid && (
                            <Button
                              variant="ghost"
                              size="sm"
                              onClick={() => onRequestCancel(adv)}
                              disabled={isProcessing}
                              className="h-7 px-2.5 text-xs text-amber-400 hover:text-amber-300 hover:bg-amber-500/10 gap-1 border border-amber-500/20"
                            >
                              <Ban className="w-3.5 h-3.5" />
                              <span>إلغاء السلفة</span>
                            </Button>
                          )}
                        </div>
                      )}

                      {/* Cancelled or fully paid info button */}
                      {(isCancelled || isFullyPaid) && (
                        <span className="text-[11px] text-muted-foreground">
                          {isCancelled ? 'تم الإلغاء' : 'سداد مكتمل'}
                        </span>
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
  );
};
