import React, { useState } from 'react';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { AlertTriangle, RotateCcw, AlertCircle, User, Calendar, DollarSign, CreditCard, Hash } from 'lucide-react';
import type { SalaryPayment } from '@/types/payroll';

interface VoidPaymentModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  payment: SalaryPayment | null;
  onConfirmVoid: (paymentId: string, reason: string) => Promise<boolean>;
  isSubmitting?: boolean;
}

export const VoidPaymentModal: React.FC<VoidPaymentModalProps> = ({
  open,
  onOpenChange,
  payment,
  onConfirmVoid,
  isSubmitting = false,
}) => {
  const [reason, setReason] = useState('');
  const [error, setError] = useState('');

  if (!payment) return null;

  const paymentMethodLabels: Record<string, string> = {
    cash: 'نقداً',
    bank_transfer: 'تحويل بنكي',
    vodafone_cash: 'فودافون كاش',
    instapay: 'انستاباي',
    other: 'أخرى',
  };

  const handleConfirm = async () => {
    if (!reason.trim()) {
      setError('سبب الإلغاء إجباري للمتابعة');
      return;
    }
    setError('');

    const success = await onConfirmVoid(payment.id, reason.trim());
    if (success) {
      setReason('');
      onOpenChange(false);
    }
  };

  return (
    <Dialog
      open={open}
      onOpenChange={(v) => {
        if (!isSubmitting) {
          setError('');
          onOpenChange(v);
        }
      }}
    >
      <DialogContent className="max-w-md bg-slate-950 border-slate-800 text-slate-100 p-5">
        <DialogHeader className="space-y-2">
          <div className="w-10 h-10 rounded-full bg-rose-500/10 border border-rose-500/20 flex items-center justify-center text-rose-400 mb-1">
            <AlertTriangle className="w-5 h-5" />
          </div>
          <DialogTitle className="text-base font-bold text-rose-400">
            هل أنت متأكد من إلغاء دفعة الراتب؟
          </DialogTitle>
          <DialogDescription className="text-xs text-muted-foreground leading-relaxed">
            سيتم إلغاء الدفعة وإعادة حساب المتبقي في مسير الرواتب تلقائياً، وتحديث قيد المصروف المرتبط بها إلى «ملغي» للاحتفاظ بالأثر الرقابي.
          </DialogDescription>
        </DialogHeader>

        {/* Payment Details Card */}
        <div className="my-3 p-3.5 bg-slate-900/80 rounded-lg border border-slate-800/80 space-y-2 text-xs">
          <div className="flex justify-between items-center py-0.5 border-b border-slate-800">
            <span className="text-muted-foreground flex items-center gap-1.5">
              <User className="w-3.5 h-3.5" />
              الموظف:
            </span>
            <span className="font-bold text-slate-200">{payment.employeeName}</span>
          </div>

          <div className="flex justify-between items-center py-0.5 border-b border-slate-800">
            <span className="text-muted-foreground flex items-center gap-1.5">
              <Calendar className="w-3.5 h-3.5" />
              فترة الراتب:
            </span>
            <span className="font-mono text-slate-300">{payment.payrollPeriod}</span>
          </div>

          <div className="flex justify-between items-center py-0.5 border-b border-slate-800">
            <span className="text-muted-foreground flex items-center gap-1.5">
              <DollarSign className="w-3.5 h-3.5" />
              مبلغ الدفعة:
            </span>
            <span className="font-mono font-bold text-rose-400 text-sm">
              {payment.amount.toLocaleString('ar-EG')} ج.م
            </span>
          </div>

          <div className="flex justify-between items-center py-0.5 border-b border-slate-800">
            <span className="text-muted-foreground flex items-center gap-1.5">
              <Calendar className="w-3.5 h-3.5" />
              تاريخ الدفع:
            </span>
            <span className="font-mono text-slate-300">{payment.createdAt?.split('T')[0]}</span>
          </div>

          <div className="flex justify-between items-center py-0.5">
            <span className="text-muted-foreground flex items-center gap-1.5">
              <CreditCard className="w-3.5 h-3.5" />
              طريقة الدفع:
            </span>
            <span className="text-slate-300">
              {paymentMethodLabels[payment.paymentMethod] || payment.paymentMethod}
            </span>
          </div>

          {payment.referenceNumber && (
            <div className="flex justify-between items-center pt-1 border-t border-slate-800">
              <span className="text-muted-foreground flex items-center gap-1.5">
                <Hash className="w-3.5 h-3.5" />
                رقم المرجع:
              </span>
              <span className="font-mono text-slate-300">{payment.referenceNumber}</span>
            </div>
          )}
        </div>

        {/* Mandatory Reason */}
        <div className="space-y-1.5">
          <Label className="text-xs font-bold text-slate-200 flex items-center justify-between">
            <span>سبب الإلغاء <span className="text-rose-400">* (إجباري)</span></span>
          </Label>
          <Textarea
            value={reason}
            onChange={(e) => {
              setReason(e.target.value);
              if (e.target.value.trim()) setError('');
            }}
            placeholder="مثال: تم إدخال المبلغ بالخطأ أو تم إلغاء التحويل البنكي..."
            className="text-xs bg-slate-900 border-slate-700 min-h-[75px] resize-none"
            disabled={isSubmitting}
          />
          {error && (
            <p className="text-[11px] text-rose-400 flex items-center gap-1">
              <AlertCircle className="w-3 h-3" />
              {error}
            </p>
          )}
        </div>

        <DialogFooter className="mt-4 flex sm:flex-row gap-2">
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={() => onOpenChange(false)}
            disabled={isSubmitting}
            className="flex-1 border-slate-700 text-xs"
          >
            تراجع
          </Button>
          <Button
            type="button"
            size="sm"
            variant="destructive"
            onClick={handleConfirm}
            disabled={isSubmitting || !reason.trim()}
            className="flex-1 gap-1.5 text-xs bg-rose-600 hover:bg-rose-700"
          >
            <RotateCcw className="w-3.5 h-3.5" />
            <span>{isSubmitting ? 'جاري الإلغاء...' : 'تأكيد إلغاء الدفعة'}</span>
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};
