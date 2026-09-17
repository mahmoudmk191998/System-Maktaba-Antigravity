import React, { useState, useEffect } from 'react';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
  DialogDescription,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Badge } from '@/components/ui/badge';
import { DollarSign, AlertCircle, Info, CreditCard, Clock, Calendar, CheckCircle2 } from 'lucide-react';
import type { PayrollRecord, PaymentMethod, Advance } from '@/types/payroll';
import { useAuth } from '@/hooks/useAuth';

interface SalaryPaymentModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  payroll: PayrollRecord | null;
  onConfirmPayment: (data: {
    payroll: PayrollRecord;
    amount: number;
    paymentMethod: PaymentMethod;
    referenceNumber?: string;
    notes?: string;
    currentUser?: any;
  }) => Promise<boolean>;
  isSubmitting: boolean;
}

export const SalaryPaymentModal: React.FC<SalaryPaymentModalProps> = ({
  open,
  onOpenChange,
  payroll,
  onConfirmPayment,
  isSubmitting,
}) => {
  const { user } = useAuth();
  const [amount, setAmount] = useState<number>(0);
  const [paymentMethod, setPaymentMethod] = useState<PaymentMethod>('cash');
  const [referenceNumber, setReferenceNumber] = useState('');
  const [notes, setNotes] = useState('');

  useEffect(() => {
    if (payroll) {
      setAmount(payroll.remaining);
      setPaymentMethod('cash');
      setReferenceNumber('');
      setNotes('');
    }
  }, [payroll, open]);

  if (!payroll) return null;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (amount <= 0) return;

    const success = await onConfirmPayment({
      payroll,
      amount: Number(amount),
      paymentMethod,
      referenceNumber: referenceNumber.trim() || undefined,
      notes: notes.trim() || undefined,
      currentUser: user,
    });

    if (success) {
      onOpenChange(false);
    }
  };

  const isPartial = amount < payroll.remaining;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center justify-between gap-2 text-lg">
            <span>صرف الراتب للموظف</span>
            <Badge variant="outline" className="font-mono text-xs">
              {payroll.period}
            </Badge>
          </DialogTitle>
          <DialogDescription className="text-xs">
            {payroll.employeeName} • {payroll.employeeRole}
          </DialogDescription>
        </DialogHeader>

        {/* Financial Breakdown Grid */}
        <div className="space-y-4 py-2">
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 text-xs">
            <div className="p-2.5 bg-slate-900/60 rounded-xl border border-slate-800">
              <p className="text-muted-foreground text-[10px]">الأساسي (Snapshot)</p>
              <p className="font-bold text-slate-100 text-sm">{payroll.basicSalarySnapshot.toLocaleString('ar-EG')} ج.م</p>
            </div>
            <div className="p-2.5 bg-slate-900/60 rounded-xl border border-slate-800">
              <p className="text-muted-foreground text-[10px]">الإضافي والبدلات</p>
              <p className="font-bold text-emerald-400 text-sm">
                +{(payroll.overtime + payroll.bonuses + payroll.allowances).toLocaleString('ar-EG')} ج.م
              </p>
            </div>
            <div className="p-2.5 bg-slate-900/60 rounded-xl border border-slate-800">
              <p className="text-muted-foreground text-[10px]">خصومات الحضور</p>
              <p className="font-bold text-rose-400 text-sm">
                -{payroll.attendanceDeductions.toLocaleString('ar-EG')} ج.م
              </p>
            </div>
            <div className="p-2.5 bg-slate-900/60 rounded-xl border border-slate-800">
              <p className="text-muted-foreground text-[10px]">أقساط السلف</p>
              <p className="font-bold text-amber-400 text-sm">
                -{payroll.advanceDeductions.toLocaleString('ar-EG')} ج.م
              </p>
            </div>
          </div>

          {/* Attendance Detail Note if deductions exist */}
          {payroll.attendanceDeductions > 0 && (
            <div className="p-2.5 bg-rose-500/10 rounded-lg border border-rose-500/20 text-xs text-rose-300 flex items-start gap-2">
              <Info className="w-4 h-4 shrink-0 mt-0.5" />
              <div>
                <p className="font-bold">تفاصيل خصم الحضور:</p>
                <p className="text-[11px] text-rose-200/90">{payroll.attendanceSummary.deductionReason}</p>
              </div>
            </div>
          )}

          {/* Overall Salary Totals Box */}
          <div className="p-3 bg-slate-950/80 rounded-xl border border-slate-800 grid grid-cols-3 gap-2 text-center">
            <div>
              <p className="text-[10px] text-muted-foreground">صافي الراتب المستحق</p>
              <p className="text-base font-bold text-slate-100">{payroll.netSalary.toLocaleString('ar-EG')} ج.م</p>
            </div>
            <div>
              <p className="text-[10px] text-muted-foreground">المدفوع مسبقاً</p>
              <p className="text-base font-bold text-emerald-400">{payroll.totalPaid.toLocaleString('ar-EG')} ج.م</p>
            </div>
            <div>
              <p className="text-[10px] text-muted-foreground">المتبقي للصرف</p>
              <p className="text-base font-bold text-rose-400">{payroll.remaining.toLocaleString('ar-EG')} ج.م</p>
            </div>
          </div>

          {/* Payment Form */}
          <form id="salary-payment-form" onSubmit={handleSubmit} className="space-y-3 pt-2">
            <div className="space-y-1.5">
              <div className="flex justify-between items-center">
                <Label className="text-xs font-bold">المبلغ المراد صرفه الآن *</Label>
                {payroll.remaining > 0 && (
                  <Button
                    type="button"
                    variant="link"
                    className="h-auto p-0 text-[11px] text-primary"
                    onClick={() => setAmount(payroll.remaining)}
                  >
                    دفع كامل المتبقي ({payroll.remaining} ج.م)
                  </Button>
                )}
              </div>
              <Input
                type="number"
                min={0.01}
                max={payroll.remaining}
                step="0.01"
                value={amount || ''}
                onChange={(e) => setAmount(Math.min(payroll.remaining, Math.max(0, Number(e.target.value))))}
                placeholder="أدخل المبلغ..."
                className="text-lg font-bold h-11"
                required
                disabled={isSubmitting}
              />
              {isPartial && amount > 0 && (
                <p className="text-[11px] text-amber-400 flex items-center gap-1">
                  <AlertCircle className="w-3 h-3" />
                  سيتم تسجيل هذه الدفعة كـ "دفع جزئي"، وسيتبقى للموظف {(payroll.remaining - amount).toLocaleString('ar-EG')} ج.م.
                </p>
              )}
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label className="text-xs">طريقة الدفع *</Label>
                <Select
                  value={paymentMethod}
                  onValueChange={(val: PaymentMethod) => setPaymentMethod(val)}
                  disabled={isSubmitting}
                >
                  <SelectTrigger className="h-10 text-xs">
                    <SelectValue placeholder="اختر طريقة الدفع..." />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="cash">نقداً (كاش)</SelectItem>
                    <SelectItem value="bank_transfer">تحويل بنكي</SelectItem>
                    <SelectItem value="vodafone_cash">فودافون كاش</SelectItem>
                    <SelectItem value="instapay">إنستاباي (InstaPay)</SelectItem>
                    <SelectItem value="other">أخرى</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-1.5">
                <Label className="text-xs">رقم المرجع / الإيصال (اختياري)</Label>
                <Input
                  placeholder="رقم التحويل أو الإيصال..."
                  value={referenceNumber}
                  onChange={(e) => setReferenceNumber(e.target.value)}
                  className="h-10 text-xs"
                  disabled={isSubmitting}
                />
              </div>
            </div>

            <div className="space-y-1.5">
              <Label className="text-xs">ملاحظات الصرف (اختياري)</Label>
              <Textarea
                placeholder="أي ملاحظات إضافية بخصوص الدفعة..."
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                rows={2}
                className="text-xs"
                disabled={isSubmitting}
              />
            </div>

            <div className="p-2.5 bg-slate-900/50 rounded-lg border border-slate-800 text-[11px] text-muted-foreground flex items-center gap-2">
              <CheckCircle2 className="w-4 h-4 text-primary shrink-0" />
              <span>
                سيتم تسجيل هذه المعاملة تلقائياً في صفحة <strong>المصروفات</strong> تحت تصنيف "رواتب" بمبلغ {amount.toLocaleString('ar-EG')} ج.م فقط.
              </span>
            </div>
          </form>
        </div>

        <DialogFooter className="gap-2 sm:gap-0">
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={isSubmitting}>
            إلغاء
          </Button>
          <Button
            type="submit"
            form="salary-payment-form"
            disabled={isSubmitting || amount <= 0 || amount > payroll.remaining}
            className="gap-2 bg-primary hover:bg-primary/90"
          >
            {isSubmitting ? (
              <>
                <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
                جاري المعالجة...
              </>
            ) : (
              <>
                <DollarSign className="w-4 h-4" />
                تأكيد صرف {amount.toLocaleString('ar-EG')} ج.م
              </>
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};
