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
import { AlertTriangle, RotateCcw, AlertCircle, ShieldAlert, Calendar, DollarSign } from 'lucide-react';
import type { AdvanceInstallment, PayrollRecord } from '@/types/payroll';

interface ReverseInstallmentModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  installment: AdvanceInstallment | null;
  payroll?: PayrollRecord | null;
  onConfirmReverse: (installmentId: string, reason: string) => Promise<boolean>;
  isSubmitting?: boolean;
}

export const ReverseInstallmentModal: React.FC<ReverseInstallmentModalProps> = ({
  open,
  onOpenChange,
  installment,
  payroll,
  onConfirmReverse,
  isSubmitting = false,
}) => {
  const [reason, setReason] = useState('');
  const [error, setError] = useState('');

  if (!installment) return null;

  // Guard: if the payroll has already been paid, block reversal!
  const isSalaryPaid = payroll && (payroll.totalPaid || 0) > 0;

  const handleConfirm = async () => {
    if (isSalaryPaid) {
      setError('هذا القسط مرتبط بمرتب تم دفعه بالفعل. يجب أولاً عكس/تعديل دفعة المرتب.');
      return;
    }
    if (!reason.trim()) {
      setError('سبب الإلغاء إجباري للمتابعة');
      return;
    }
    setError('');

    const success = await onConfirmReverse(installment.id, reason.trim());
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
            إلغاء قسط السلفة المستقطع
          </DialogTitle>
          <DialogDescription className="text-xs text-muted-foreground leading-relaxed">
            عند إلغاء القسط، سيتم إعادة المبلغ إلى رصيد السلفة المتبقي على الموظف وإعادته لمستحقات مسير الرواتب.
          </DialogDescription>
        </DialogHeader>

        {/* Installment Details */}
        <div className="my-3 p-3.5 bg-slate-900/80 rounded-lg border border-slate-800/80 space-y-2 text-xs">
          <div className="flex justify-between items-center py-0.5 border-b border-slate-800">
            <span className="text-muted-foreground flex items-center gap-1.5">
              <Calendar className="w-3.5 h-3.5" />
              شهر الاستقطاع:
            </span>
            <span className="font-mono text-slate-200">{installment.period}</span>
          </div>

          <div className="flex justify-between items-center py-0.5 border-b border-slate-800">
            <span className="text-muted-foreground flex items-center gap-1.5">
              <DollarSign className="w-3.5 h-3.5" />
              مبلغ القسط:
            </span>
            <span className="font-mono font-bold text-amber-400 text-sm">
              {installment.amount.toLocaleString('ar-EG')} ج.م
            </span>
          </div>

          <div className="flex justify-between items-center py-0.5">
            <span className="text-muted-foreground">حالة راتب الشهر:</span>
            <span className={`font-bold ${isSalaryPaid ? 'text-emerald-400' : 'text-slate-300'}`}>
              {isSalaryPaid ? `مدفوع منه ${(payroll?.totalPaid || 0).toLocaleString('ar-EG')} ج.م` : 'غير مدفوع'}
            </span>
          </div>
        </div>

        {/* Blocking Warning if salary was paid */}
        {isSalaryPaid ? (
          <div className="p-3 rounded-lg bg-rose-500/15 border border-rose-500/30 text-rose-300 text-xs space-y-1.5">
            <div className="flex items-center gap-1.5 font-bold">
              <ShieldAlert className="w-4 h-4 text-rose-400 flex-shrink-0" />
              <span>لا يمكن عكس هذا القسط الآن</span>
            </div>
            <p className="text-[11px] leading-relaxed">
              هذا القسط مرتبط بمرتب تم صرف دفعة منه بالفعل. لتجنب إحداث فروقات مالية غير صحيحة، يجب أولاً إلغاء / عكس دفعة الراتب لشهر {installment.period}، ثم إعادة إلغاء قسط السلفة.
            </p>
          </div>
        ) : (
          <div className="space-y-1.5">
            <Label className="text-xs font-bold text-slate-200 flex items-center justify-between">
              <span>سبب إلغاء القسط <span className="text-rose-400">* (إجباري)</span></span>
            </Label>
            <Textarea
              value={reason}
              onChange={(e) => {
                setReason(e.target.value);
                if (e.target.value.trim()) setError('');
              }}
              placeholder="مثال: تم خصم القسط مرتين أو اتفاق على تأجيل القسط..."
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
        )}

        <DialogFooter className="mt-4 flex sm:flex-row gap-2">
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={() => onOpenChange(false)}
            disabled={isSubmitting}
            className="flex-1 border-slate-700 text-xs"
          >
            إغلاق
          </Button>
          {!isSalaryPaid && (
            <Button
              type="button"
              size="sm"
              variant="destructive"
              onClick={handleConfirm}
              disabled={isSubmitting || !reason.trim()}
              className="flex-1 gap-1.5 text-xs bg-rose-600 hover:bg-rose-700"
            >
              <RotateCcw className="w-3.5 h-3.5" />
              <span>{isSubmitting ? 'جاري الإلغاء...' : 'تأكيد إلغاء القسط'}</span>
            </Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};
