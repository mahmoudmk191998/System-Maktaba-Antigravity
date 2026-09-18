import React from 'react';
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
} from 'lucide-react';
import { useSupplierLedger } from '@/hooks/retail/useSupplierLedger';
import { useFormatters } from '@/lib/formatters';
import type { Supplier } from '@/types/retail.types';

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
  const { entries, loading, reconciliation } = useSupplierLedger(supplier?.id);

  if (!supplier) return null;

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="left" className="w-full sm:max-w-2xl overflow-y-auto" dir="rtl">
        <SheetHeader className="border-b border-border pb-3">
          <div className="flex items-center justify-between">
            <SheetTitle className="text-xl font-bold flex items-center gap-2">
              <FileText className="w-5 h-5 text-primary" />
              <span>كشف حساب المورد: {supplier.name}</span>
            </SheetTitle>
            <Button
              size="sm"
              variant="outline"
              className="gap-1.5 font-semibold text-xs print:hidden"
              onClick={() => window.print()}
            >
              <Printer className="w-3.5 h-3.5" />
              طباعة كشف الحساب
            </Button>
          </div>
          <SheetDescription className="text-xs text-muted-foreground flex flex-wrap gap-x-4 gap-y-1 pt-1">
            <span>كود المورد: <strong className="font-mono text-foreground">{supplier.supplierCode}</strong></span>
            <span>الهاتف: {supplier.phone}</span>
            <span>شروط السداد: {supplier.paymentTermsDays || 30} يوماً</span>
          </SheetDescription>
        </SheetHeader>

        <div className="space-y-6 py-4">
          {/* Summary and Reconciliation Header */}
          <div className="grid grid-cols-2 gap-3 text-xs">
            <div className="p-3 bg-muted/40 border border-border rounded-xl space-y-1">
              <span className="text-muted-foreground block text-[11px]">الرصيد المستحق الحالي للمورد:</span>
              <span className="text-xl font-black text-foreground">{number(supplier.currentBalance || 0)} ج.م</span>
            </div>

            <div className="p-3 bg-muted/40 border border-border rounded-xl space-y-1">
              <span className="text-muted-foreground block text-[11px]">مطابقة القيود الدفترية (Reconciliation):</span>
              {reconciliation?.isReconciled ? (
                <div className="flex items-center gap-1.5 text-emerald-600 font-bold pt-1">
                  <CheckCircle2 className="w-4 h-4" />
                  <span>الدفتر مطابق بنسبة 100% (0.00 فرق)</span>
                </div>
              ) : (
                <div className="flex items-center gap-1.5 text-amber-600 font-bold pt-1">
                  <AlertTriangle className="w-4 h-4" />
                  <span>يوجد فرق في المطابقة: {reconciliation?.difference} ج.م</span>
                </div>
              )}
            </div>
          </div>

          {/* Ledger Table */}
          <div className="border border-border rounded-xl overflow-hidden bg-card">
            <div className="bg-muted/50 p-2.5 border-b border-border text-xs font-bold flex justify-between items-center">
              <span>سجل الحركات المالية المعتمدة ({entries.length} حركة)</span>
              <span className="text-[11px] text-muted-foreground font-mono">العملة: EGP</span>
            </div>

            {loading ? (
              <div className="p-8 text-center text-xs text-muted-foreground">جارِ تحميل حركات الحساب...</div>
            ) : entries.length === 0 ? (
              <div className="p-8 text-center text-xs text-muted-foreground">لا توجد حركات مسجلة في كشف الحساب حتى الآن.</div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-right text-xs">
                  <thead className="bg-muted/30 border-b border-border text-muted-foreground font-semibold">
                    <tr>
                      <th className="p-2.5">التاريخ</th>
                      <th className="p-2.5">نوع الحركة</th>
                      <th className="p-2.5">رقم المرجع</th>
                      <th className="p-2.5 text-left text-emerald-700">مدين (سداد/مرتجع)</th>
                      <th className="p-2.5 text-left text-blue-700">دائن (مشتريات)</th>
                      <th className="p-2.5 text-left font-bold">الرصيد التراكمي</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-border">
                    {entries.map((entry) => {
                      const isPurchase = entry.type === 'purchase_invoice';
                      const isPayment = entry.type === 'payment';
                      const isReturn = entry.type === 'purchase_return';
                      const isOpening = entry.type === 'opening_balance';

                      return (
                        <tr key={entry.id} className="hover:bg-muted/30">
                          <td className="p-2.5 text-muted-foreground text-[11px]">
                            {new Date(entry.createdAt).toLocaleDateString('ar-EG')}
                          </td>
                          <td className="p-2.5">
                            <Badge
                              variant="outline"
                              className={
                                isPurchase
                                  ? 'bg-blue-500/10 text-blue-700 border-blue-300'
                                  : isPayment
                                  ? 'bg-emerald-500/10 text-emerald-700 border-emerald-300'
                                  : isReturn
                                  ? 'bg-amber-500/10 text-amber-700 border-amber-300'
                                  : 'bg-muted'
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
                          <td className="p-2.5 font-mono text-[11px] text-foreground">
                            {entry.referenceNumber || entry.referenceId.substring(0, 8)}
                          </td>
                          <td className="p-2.5 text-left font-bold text-emerald-700">
                            {entry.debit > 0 ? `-${number(entry.debit)}` : '—'}
                          </td>
                          <td className="p-2.5 text-left font-bold text-blue-700">
                            {entry.credit > 0 ? `+${number(entry.credit)}` : '—'}
                          </td>
                          <td className="p-2.5 text-left font-black text-foreground">
                            {number(entry.balanceAfter || 0)} ج.م
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </div>
      </SheetContent>
    </Sheet>
  );
};
