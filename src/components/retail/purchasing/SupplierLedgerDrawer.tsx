import React, { useState } from 'react';
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetDescription,
} from '@/components/ui/sheet';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import {
  FileText,
  DollarSign,
  TrendingDown,
  TrendingUp,
  RotateCcw,
  CheckCircle2,
  AlertTriangle,
  Printer,
  Calendar,
  RefreshCw,
  BookOpen,
  ArrowDownLeft,
  ArrowUpRight,
  ShieldCheck,
} from 'lucide-react';
import { useSupplierLedger } from '@/hooks/retail/useSupplierLedger';
import { useFormatters } from '@/lib/formatters';
import type { Supplier } from '@/types/retail.types';
import { toast } from 'sonner';

interface SupplierLedgerDrawerProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  supplier: Supplier | null;
}

export const SupplierLedgerDrawer: React.FC<SupplierLedgerDrawerProps> = ({
  open,
  onOpenChange,
  supplier,
}) => {
  const { number } = useFormatters();
  const {
    entries,
    journalEntries,
    loading,
    syncing,
    reconciliation,
    refresh,
    reconcileAndSync,
  } = useSupplierLedger(supplier?.id);

  const [activeTab, setActiveTab] = useState<'statement' | 'journals'>('statement');

  if (!supplier) return null;

  const handleSyncAndReconcile = async () => {
    try {
      const res = await reconcileAndSync();
      if (res) {
        toast.success(
          `تمت مطابقة قيود المورد وتحديث الرصيد الدفتري بنجاح! تم مزامنة ${res.syncedCount} حركة مالية.`
        );
      }
    } catch (err: any) {
      toast.error(err.message || 'حدث خطأ أثناء مزامنة ومطابقة القيود');
    }
  };

  const purchasesTotal = reconciliation?.purchasesTotal ?? entries
    .filter((e) => e.type === 'purchase_invoice')
    .reduce((acc, curr) => acc + (Number(curr.credit) || 0), 0);

  const paymentsTotal = reconciliation?.paymentsTotal ?? entries
    .filter((e) => e.type === 'payment' || e.type === 'purchase_return')
    .reduce((acc, curr) => acc + (Number(curr.debit) || 0), 0);

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="left" className="w-full sm:max-w-3xl overflow-y-auto bg-background text-foreground" dir="rtl">
        <SheetHeader className="border-b border-border pb-3">
          <div className="flex items-center justify-between gap-2 flex-wrap">
            <SheetTitle className="text-lg sm:text-xl font-bold flex items-center gap-2 text-foreground">
              <FileText className="w-5 h-5 text-primary" />
              <span>كشف حساب المورد: {supplier.name}</span>
            </SheetTitle>
            <div className="flex items-center gap-2">
              <Button
                size="sm"
                variant="outline"
                className="gap-1.5 font-semibold text-xs border-primary/40 hover:bg-primary/10 text-foreground"
                disabled={syncing || loading}
                onClick={handleSyncAndReconcile}
                title="مزامنة ومطابقة كافة الحركات والقيود الدفترية"
              >
                <RefreshCw className={`w-3.5 h-3.5 text-primary ${syncing ? 'animate-spin' : ''}`} />
                <span>{syncing ? 'جارِ المطابقة...' : 'مطابقة وتحديث القيود'}</span>
              </Button>
              <Button
                size="sm"
                variant="outline"
                className="gap-1.5 font-semibold text-xs print:hidden text-foreground"
                onClick={() => window.print()}
              >
                <Printer className="w-3.5 h-3.5" />
                طباعة
              </Button>
            </div>
          </div>
          <SheetDescription className="text-xs text-muted-foreground flex flex-wrap gap-x-4 gap-y-1 pt-1">
            <span>
              كود المورد: <strong className="font-mono text-foreground">{supplier.supplierCode || '—'}</strong>
            </span>
            <span>الهاتف: {supplier.phone || '—'}</span>
            <span>شروط السداد: {supplier.paymentTermsDays || 30} يوماً</span>
            {supplier.taxNumber && <span>الرقم الضريبي: {supplier.taxNumber}</span>}
          </SheetDescription>
        </SheetHeader>

        <div className="space-y-5 py-4">
          {/* Summary and Reconciliation Header Cards */}
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 text-xs">
            <div className="p-3.5 bg-card border border-border rounded-xl space-y-1 shadow-sm">
              <div className="flex items-center justify-between text-muted-foreground">
                <span className="text-[11px] font-medium">الرصيد الدفتري الحالي المستحق:</span>
                <DollarSign className="w-4 h-4 text-primary" />
              </div>
              <div className="text-xl font-black text-foreground">
                {number(reconciliation?.cachedBalance ?? supplier.currentBalance ?? 0)} ج.م
              </div>
              <div className="text-[10px] text-muted-foreground">
                {Number(supplier.openingBalance || 0) !== 0 && (
                  <span>يتضمن رصيد افتتاحي: {number(supplier.openingBalance || 0)} ج.م</span>
                )}
              </div>
            </div>

            <div className="p-3.5 bg-card border border-border rounded-xl space-y-1 shadow-sm">
              <div className="flex items-center justify-between text-muted-foreground">
                <span className="text-[11px] font-medium">إجمالي المشتريات (دائن):</span>
                <ArrowDownLeft className="w-4 h-4 text-blue-500" />
              </div>
              <div className="text-xl font-black text-blue-600 dark:text-blue-400">
                {number(purchasesTotal)} ج.م
              </div>
              <div className="text-[10px] text-muted-foreground">
                فواتير واستلامات بضاعة معتمدة
              </div>
            </div>

            <div className="p-3.5 bg-card border border-border rounded-xl space-y-1 shadow-sm">
              <div className="flex items-center justify-between text-muted-foreground">
                <span className="text-[11px] font-medium">إجمالي المسدد والمرتجع (مدين):</span>
                <ArrowUpRight className="w-4 h-4 text-emerald-500" />
              </div>
              <div className="text-xl font-black text-emerald-600 dark:text-emerald-400">
                {number(paymentsTotal)} ج.م
              </div>
              <div className="text-[10px] text-muted-foreground">
                سندات صرف دفعات ومرتجعات مشتريات
              </div>
            </div>
          </div>

          {/* Audit / Reconciliation Banner */}
          <div className="p-3 bg-muted/40 border border-border rounded-xl flex items-center justify-between gap-3 text-xs flex-wrap">
            <div className="flex items-center gap-2">
              {reconciliation?.isReconciled ? (
                <>
                  <ShieldCheck className="w-5 h-5 text-emerald-500 shrink-0" />
                  <div>
                    <span className="font-bold text-emerald-600 dark:text-emerald-400 block">
                      مطابقة القيود الدفترية معتمدة بنسبة 100%
                    </span>
                    <span className="text-[11px] text-muted-foreground">
                      مجموع حركات الأستاذ المساعد تتطابق تماماً مع رصيد حساب المورد (فرق 0.00 ج.م)
                    </span>
                  </div>
                </>
              ) : (
                <>
                  <AlertTriangle className="w-5 h-5 text-amber-500 shrink-0" />
                  <div>
                    <span className="font-bold text-amber-600 dark:text-amber-400 block">
                      تنبيه مطابقة القيود: يوجد فرق {reconciliation?.difference ?? 0} ج.م
                    </span>
                    <span className="text-[11px] text-muted-foreground">
                      اضغط على زر "مطابقة وتحديث القيود" لمزامنة الفواتير والسندات تلقائياً.
                    </span>
                  </div>
                </>
              )}
            </div>
            {!reconciliation?.isReconciled && (
              <Button
                size="sm"
                variant="default"
                onClick={handleSyncAndReconcile}
                disabled={syncing}
                className="text-xs gap-1.5 h-8 font-bold"
              >
                <RefreshCw className={`w-3.5 h-3.5 ${syncing ? 'animate-spin' : ''}`} />
                تسوية ومزامنة الآن
              </Button>
            )}
          </div>

          {/* Navigation View Switcher */}
          <div className="flex border-b border-border gap-2">
            <button
              onClick={() => setActiveTab('statement')}
              className={`pb-2 px-3 text-xs font-bold border-b-2 transition-colors flex items-center gap-1.5 ${
                activeTab === 'statement'
                  ? 'border-primary text-primary'
                  : 'border-transparent text-muted-foreground hover:text-foreground'
              }`}
            >
              <FileText className="w-4 h-4" />
              <span>كشف الحساب وحركات الأستاذ ({entries.length})</span>
            </button>
            <button
              onClick={() => setActiveTab('journals')}
              className={`pb-2 px-3 text-xs font-bold border-b-2 transition-colors flex items-center gap-1.5 ${
                activeTab === 'journals'
                  ? 'border-primary text-primary'
                  : 'border-transparent text-muted-foreground hover:text-foreground'
              }`}
            >
              <BookOpen className="w-4 h-4" />
              <span>القيود الدفترية المحاسبية ({journalEntries.length})</span>
            </button>
          </div>

          {/* Tab 1: Supplier Statement & Movements */}
          {activeTab === 'statement' && (
            <div className="border border-border rounded-xl overflow-hidden bg-card shadow-sm">
              <div className="bg-muted/50 p-2.5 border-b border-border text-xs font-bold flex justify-between items-center text-foreground">
                <span>سجل الحركات المالية المعتمدة ({entries.length} حركة)</span>
                <span className="text-[11px] text-muted-foreground font-mono">العملة: EGP</span>
              </div>

              {loading ? (
                <div className="p-8 text-center text-xs text-muted-foreground flex flex-col items-center gap-2">
                  <RefreshCw className="w-5 h-5 animate-spin text-primary" />
                  <span>جارِ تحميل وتدقيق حركات الحساب...</span>
                </div>
              ) : entries.length === 0 ? (
                <div className="p-8 text-center text-xs text-muted-foreground space-y-3">
                  <p>لا توجد حركات مسجلة في كشف حساب المورد حتى الآن.</p>
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={handleSyncAndReconcile}
                    disabled={syncing}
                    className="text-xs gap-1.5 font-bold"
                  >
                    <RefreshCw className="w-3.5 h-3.5 text-primary" />
                    فحص ومزامنة استلامات المورد تلقائياً
                  </Button>
                </div>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full text-right text-xs">
                    <thead className="bg-muted/40 border-b border-border text-muted-foreground font-semibold">
                      <tr>
                        <th className="p-2.5">التاريخ</th>
                        <th className="p-2.5">نوع الحركة</th>
                        <th className="p-2.5">رقم المرجع / الإذن</th>
                        <th className="p-2.5 text-left text-emerald-600 dark:text-emerald-400">مدين (سداد/مرتجع)</th>
                        <th className="p-2.5 text-left text-blue-600 dark:text-blue-400">دائن (مشتريات)</th>
                        <th className="p-2.5 text-left font-bold text-foreground">الرصيد التراكمي</th>
                        <th className="p-2.5 text-muted-foreground">البيان / ملاحظات</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-border">
                      {entries.map((entry) => {
                        const isPurchase = entry.type === 'purchase_invoice';
                        const isPayment = entry.type === 'payment';
                        const isReturn = entry.type === 'purchase_return';
                        const isOpening = entry.type === 'opening_balance';

                        return (
                          <tr key={entry.id} className="hover:bg-muted/30 transition-colors">
                            <td className="p-2.5 text-muted-foreground text-[11px] whitespace-nowrap">
                              {new Date(entry.createdAt).toLocaleDateString('ar-EG', {
                                year: 'numeric',
                                month: 'short',
                                day: 'numeric',
                              })}
                            </td>
                            <td className="p-2.5 whitespace-nowrap">
                              <Badge
                                variant="outline"
                                className={
                                  isPurchase
                                    ? 'bg-blue-500/10 text-blue-700 dark:text-blue-300 border-blue-300 dark:border-blue-800'
                                    : isPayment
                                    ? 'bg-emerald-500/10 text-emerald-700 dark:text-emerald-300 border-emerald-300 dark:border-emerald-800'
                                    : isReturn
                                    ? 'bg-amber-500/10 text-amber-700 dark:text-amber-300 border-amber-300 dark:border-amber-800'
                                    : 'bg-muted text-foreground'
                                }
                              >
                                {isPurchase
                                  ? 'فاتورة استلام بضاعة'
                                  : isPayment
                                  ? 'سند صرف دفعة'
                                  : isReturn
                                  ? 'مرتجع مشتريات'
                                  : isOpening
                                  ? 'رصيد افتتاحي'
                                  : entry.type}
                              </Badge>
                            </td>
                            <td className="p-2.5 font-mono text-[11px] text-foreground whitespace-nowrap">
                              {entry.referenceNumber || entry.referenceId?.substring(0, 8) || '—'}
                            </td>
                            <td className="p-2.5 text-left font-bold text-emerald-600 dark:text-emerald-400 whitespace-nowrap">
                              {Number(entry.debit) > 0 ? `-${number(entry.debit)}` : '—'}
                            </td>
                            <td className="p-2.5 text-left font-bold text-blue-600 dark:text-blue-400 whitespace-nowrap">
                              {Number(entry.credit) > 0 ? `+${number(entry.credit)}` : '—'}
                            </td>
                            <td className="p-2.5 text-left font-black text-foreground whitespace-nowrap">
                              {number(entry.balanceAfter || 0)} ج.م
                            </td>
                            <td className="p-2.5 text-muted-foreground text-[11px] max-w-xs truncate" title={entry.notes || ''}>
                              {entry.notes || '—'}
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          )}

          {/* Tab 2: Matched General Accounting Journal Entries */}
          {activeTab === 'journals' && (
            <div className="border border-border rounded-xl overflow-hidden bg-card shadow-sm">
              <div className="bg-muted/50 p-2.5 border-b border-border text-xs font-bold flex justify-between items-center text-foreground">
                <span>قيود اليومية العامة المطابقة ({journalEntries.length} قيد محاسبي)</span>
                <span className="text-[11px] text-muted-foreground">دفتر اليومية المعتمد</span>
              </div>

              {journalEntries.length === 0 ? (
                <div className="p-8 text-center text-xs text-muted-foreground space-y-3">
                  <p>لا توجد قيود يومية عامة مسجلة في شجرة الحسابات لهذا المورد حالياً.</p>
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={handleSyncAndReconcile}
                    disabled={syncing}
                    className="text-xs gap-1.5 font-bold"
                  >
                    <RefreshCw className="w-3.5 h-3.5 text-primary" />
                    توليد ومطابقة القيود الدفترية تلقائياً
                  </Button>
                </div>
              ) : (
                <div className="divide-y divide-border">
                  {journalEntries.map((je) => (
                    <div key={je.id} className="p-3.5 space-y-2 hover:bg-muted/20 transition-colors">
                      <div className="flex items-center justify-between text-xs flex-wrap gap-2">
                        <div className="flex items-center gap-2">
                          <span className="font-mono font-bold text-foreground bg-muted px-2 py-0.5 rounded text-[11px]">
                            {je.entryNumber || je.id.substring(0, 8)}
                          </span>
                          <span className="font-semibold text-foreground">{je.description}</span>
                        </div>
                        <div className="flex items-center gap-2 text-muted-foreground text-[11px]">
                          <span>{new Date(je.date).toLocaleDateString('ar-EG')}</span>
                          <Badge
                            variant="outline"
                            className={
                              je.status === 'posted'
                                ? 'bg-emerald-500/10 text-emerald-600 border-emerald-300'
                                : 'bg-muted text-muted-foreground'
                            }
                          >
                            {je.status === 'posted' ? 'مرحل ومعتمد' : je.status || 'مسودة'}
                          </Badge>
                        </div>
                      </div>

                      {/* Line items of this journal */}
                      {je.lines && je.lines.length > 0 && (
                        <div className="bg-muted/30 rounded-lg p-2 overflow-x-auto text-[11px]">
                          <table className="w-full text-right">
                            <thead>
                              <tr className="text-muted-foreground border-b border-border/50">
                                <th className="pb-1">الحساب</th>
                                <th className="pb-1 text-left">مدين (Debit)</th>
                                <th className="pb-1 text-left">دائن (Credit)</th>
                                <th className="pb-1">البيان</th>
                              </tr>
                            </thead>
                            <tbody className="divide-y divide-border/30">
                              {je.lines.map((line, idx) => (
                                <tr key={idx} className="hover:bg-muted/40">
                                  <td className="py-1 font-medium text-foreground">
                                    {line.accountName || line.accountCode || line.accountId}
                                  </td>
                                  <td className="py-1 text-left font-mono font-bold text-emerald-600 dark:text-emerald-400">
                                    {line.debit > 0 ? number(line.debit) : '—'}
                                  </td>
                                  <td className="py-1 text-left font-mono font-bold text-blue-600 dark:text-blue-400">
                                    {line.credit > 0 ? number(line.credit) : '—'}
                                  </td>
                                  <td className="py-1 text-muted-foreground truncate max-w-xs">
                                    {line.description || '—'}
                                  </td>
                                </tr>
                              ))}
                            </tbody>
                          </table>
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}
        </div>
      </SheetContent>
    </Sheet>
  );
};
