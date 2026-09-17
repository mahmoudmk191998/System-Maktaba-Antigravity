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
import { Trash2, AlertTriangle, AlertCircle, HandCoins, User, Clock, Loader2, Ban } from 'lucide-react';
import type { Advance } from '@/types/payroll';

interface DeleteAdvanceModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  advance: Advance | null;
  onConfirmDelete: (advanceId: string, reason: string) => Promise<{ success: boolean; message?: string }>;
  onSwitchToCancel?: (advance: Advance) => void;
  isSubmitting?: boolean;
}

export const DeleteAdvanceModal: React.FC<DeleteAdvanceModalProps> = ({
  open,
  onOpenChange,
  advance,
  onConfirmDelete,
  onSwitchToCancel,
  isSubmitting = false,
}) => {
  const [reason, setReason] = useState('');
  const [error, setError] = useState('');

  if (!advance) return null;

  const hasFinancialActivity = (advance.paidAmount || 0) > 0 || (advance.deductedPeriods || []).length > 0;

  const handleConfirm = async () => {
    if (hasFinancialActivity) {
      setError('لا يمكن حذف هذه السلفة نهائيًا لأنها تحتوي على عمليات مالية سابقة. يمكنك إلغاؤها بدلاً من ذلك.');
      return;
    }

    if (!reason.trim()) {
      setError('سبب الحذف إجباري للمتابعة (مثال: تم تسجيل السلفة بالخطأ)');
      return;
    }

    setError('');

    const res = await onConfirmDelete(advance.id, reason.trim());
    if (res.success) {
      setReason('');
      onOpenChange(false);
    } else if (res.message) {
      setError(res.message);
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
            <Trash2 className="w-5 h-5" />
          </div>
          <DialogTitle className="text-base font-bold text-rose-400">
            حذف السلفة
          </DialogTitle>
          <DialogDescription className="text-xs text-muted-foreground leading-relaxed">
            {hasFinancialActivity
              ? 'تنبيه: لا يمكن حذف هذه السلفة نهائيًا لأنها تحتوي على عمليات مالية سابقة.'
              : 'هل أنت متأكد من حذف هذه السلفة؟ سيتم حذف السلفة نهائياً من السلف القائمة.'}
          </DialogDescription>
        </DialogHeader>

        {/* Advance Financial Details Card */}
        <div className="my-3 p-3.5 bg-slate-900/80 rounded-lg border border-slate-800/80 space-y-2 text-xs">
          <div className="flex justify-between items-center py-0.5 border-b border-slate-800">
            <span className="text-muted-foreground flex items-center gap-1.5">
              <User className="w-3.5 h-3.5" />
              الموظف:
            </span>
            <span className="font-bold text-slate-200">
              {advance.employeeName}
            </span>
          </div>

          <div className="flex justify-between items-center py-0.5 border-b border-slate-800">
            <span className="text-muted-foreground flex items-center gap-1.5">
              <HandCoins className="w-3.5 h-3.5" />
              المبلغ:
            </span>
            <span className="font-mono font-bold text-slate-200">
              {advance.amount.toLocaleString('ar-EG')} ج.م
            </span>
          </div>

          <div className="flex justify-between items-center py-0.5">
            <span className="text-muted-foreground flex items-center gap-1.5">
              <Clock className="w-3.5 h-3.5 text-amber-400" />
              المتبقي:
            </span>
            <span className="font-mono font-bold text-amber-400 text-sm">
              {(advance.remainingAmount || 0).toLocaleString('ar-EG')} ج.م
            </span>
          </div>
        </div>

        {/* Guard Callout for Financial Activity */}
        {hasFinancialActivity ? (
          <div className="p-3 rounded-lg bg-amber-500/10 border border-amber-500/30 text-amber-300 text-xs space-y-2">
            <div className="flex items-start gap-2">
              <AlertTriangle className="w-4 h-4 text-amber-400 shrink-0 mt-0.5" />
              <div className="space-y-1">
                <p className="font-bold">لا يمكن حذف هذه السلفة نهائيًا</p>
                <p className="text-[11px] leading-relaxed text-amber-200/90">
                  تم خصم جزء من هذه السلفة بالفعل ({advance.paidAmount?.toLocaleString('ar-EG')} ج.م). لمنع التلاعب في الحسابات المالية السابقة، يمكنك إلغاء السلفة بدلاً من ذلك مع إيقاف الأقساط المستقبلية.
                </p>
              </div>
            </div>
            {onSwitchToCancel && (
              <Button
                size="sm"
                variant="outline"
                onClick={() => {
                  onOpenChange(false);
                  onSwitchToCancel(advance);
                }}
                className="w-full mt-2 h-8 text-xs border-amber-500/40 text-amber-300 hover:bg-amber-500/20 gap-1.5"
              >
                <Ban className="w-3.5 h-3.5" />
                <span>إلغاء السلفة بدلاً من ذلك</span>
              </Button>
            )}
          </div>
        ) : (
          <div className="p-2.5 rounded-md bg-slate-900 border border-slate-800 text-slate-300 text-[11px] leading-relaxed flex items-center gap-2">
            <AlertCircle className="w-4 h-4 text-slate-400 shrink-0" />
            <span>سيتم حذف السلفة من السلف القائمة ولن تؤثر على أي مسير رواتب قادم.</span>
          </div>
        )}

        {/* Mandatory Reason */}
        {!hasFinancialActivity && (
          <div className="space-y-1.5 pt-1">
            <Label className="text-xs font-bold text-slate-200 flex items-center justify-between">
              <span>سبب الحذف <span className="text-rose-400">* (إجباري)</span></span>
            </Label>
            <Textarea
              value={reason}
              onChange={(e) => {
                setReason(e.target.value);
                if (e.target.value.trim()) setError('');
              }}
              placeholder="مثال: تم تسجيل السلفة بالخطأ..."
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
            className="flex-1 border-slate-700"
          >
            إلغاء
          </Button>

          {!hasFinancialActivity && (
            <Button
              type="button"
              variant="destructive"
              size="sm"
              onClick={handleConfirm}
              disabled={isSubmitting || !reason.trim()}
              className="flex-1 gap-1.5 bg-rose-600 hover:bg-rose-700 text-white"
            >
              {isSubmitting ? (
                <>
                  <Loader2 className="w-3.5 h-3.5 animate-spin" />
                  <span>جاري الحذف...</span>
                </>
              ) : (
                <>
                  <Trash2 className="w-3.5 h-3.5" />
                  <span>حذف السلفة</span>
                </>
              )}
            </Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};
