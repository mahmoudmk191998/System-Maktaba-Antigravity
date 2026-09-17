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
import { AlertTriangle, Ban, AlertCircle, HandCoins, CheckCircle, Clock } from 'lucide-react';
import type { Advance } from '@/types/payroll';

interface CancelAdvanceModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  advance: Advance | null;
  onConfirmCancel: (advanceId: string, reason: string) => Promise<boolean>;
  isSubmitting?: boolean;
}

export const CancelAdvanceModal: React.FC<CancelAdvanceModalProps> = ({
  open,
  onOpenChange,
  advance,
  onConfirmCancel,
  isSubmitting = false,
}) => {
  const [reason, setReason] = useState('');
  const [error, setError] = useState('');

  if (!advance) return null;

  const isPartiallyPaid = (advance.paidAmount || 0) > 0;

  const handleConfirm = async () => {
    if (!reason.trim()) {
      setError('سبب الإلغاء إجباري للمتابعة');
      return;
    }
    setError('');

    const success = await onConfirmCancel(advance.id, reason.trim());
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
          <div className="w-10 h-10 rounded-full bg-amber-500/10 border border-amber-500/20 flex items-center justify-center text-amber-400 mb-1">
            <AlertTriangle className="w-5 h-5" />
          </div>
          <DialogTitle className="text-base font-bold text-amber-400">
            تأكيد إلغاء السلفة
          </DialogTitle>
          <DialogDescription className="text-xs text-muted-foreground leading-relaxed">
            {isPartiallyPaid
              ? 'تنبيه: هذه السلفة تم خصم جزء منها بالفعل. سيتم إلغاء السلفة وإيقاف الأقساط المستقبلية، مع الاحتفاظ بالسجل المالي والأقساط المسددة السابقة.'
              : 'سيتم إلغاء السلفة بالكامل وإزالة أي التزام مالي مترتب عليها على الموظف.'}
          </DialogDescription>
        </DialogHeader>

        {/* Advance Financial Details */}
        <div className="my-3 p-3.5 bg-slate-900/80 rounded-lg border border-slate-800/80 space-y-2 text-xs">
          <div className="flex justify-between items-center py-0.5 border-b border-slate-800">
            <span className="text-muted-foreground flex items-center gap-1.5">
              <HandCoins className="w-3.5 h-3.5" />
              إجمالي مبلغ السلفة:
            </span>
            <span className="font-mono font-bold text-slate-200">
              {advance.amount.toLocaleString('ar-EG')} ج.م
            </span>
          </div>

          <div className="flex justify-between items-center py-0.5 border-b border-slate-800">
            <span className="text-muted-foreground flex items-center gap-1.5">
              <CheckCircle className="w-3.5 h-3.5 text-emerald-400" />
              المدفوع / المسدد:
            </span>
            <span className="font-mono font-bold text-emerald-400">
              {(advance.paidAmount || 0).toLocaleString('ar-EG')} ج.م
            </span>
          </div>

          <div className="flex justify-between items-center py-0.5">
            <span className="text-muted-foreground flex items-center gap-1.5">
              <Clock className="w-3.5 h-3.5 text-amber-400" />
              المتبقي للسداد:
            </span>
            <span className="font-mono font-bold text-amber-400 text-sm">
              {(advance.remainingAmount || 0).toLocaleString('ar-EG')} ج.م
            </span>
          </div>
        </div>

        {/* Warning Callout for partially paid */}
        {isPartiallyPaid && (
          <div className="p-2.5 rounded-md bg-amber-500/10 border border-amber-500/30 text-amber-300 text-[11px] leading-relaxed">
            ⚠️ <strong>ملاحظة هامة:</strong> لن يتم حذف سجل السلفة أو استرداد الأقساط المسددة السابقة بصمت. ستبقى الأقساط المحصلة مسجلة في التاريخ المالي وسيتم إعفاء المتبقي.
          </div>
        )}

        {/* Mandatory Reason */}
        <div className="space-y-1.5 pt-1">
          <Label className="text-xs font-bold text-slate-200 flex items-center justify-between">
            <span>سبب الإلغاء <span className="text-rose-400">* (إجباري)</span></span>
          </Label>
          <Textarea
            value={reason}
            onChange={(e) => {
              setReason(e.target.value);
              if (e.target.value.trim()) setError('');
            }}
            placeholder="يرجى كتابة سبب إلغاء السلفة (مثال: طلب الموظف أو موافقة الإدارة على الإعفاء)..."
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
            className="flex-1 gap-1.5 text-xs bg-amber-600 hover:bg-amber-700 text-white"
          >
            <Ban className="w-3.5 h-3.5" />
            <span>{isSubmitting ? 'جاري الإلغاء...' : 'تأكيد إلغاء السلفة'}</span>
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};
