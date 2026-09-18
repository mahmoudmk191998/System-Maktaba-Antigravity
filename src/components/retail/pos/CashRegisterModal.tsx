import React, { useState } from 'react';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Badge } from '@/components/ui/badge';
import { Lock, Unlock, AlertTriangle, CheckCircle2 } from 'lucide-react';
import { useFormatters } from '@/lib/formatters';
import type { CashierShift } from '@/types/retail.types';

interface CashRegisterModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  mode: 'open' | 'close';
  activeShift?: CashierShift | null;
  onConfirmOpen?: (openingCash: number, notes?: string) => Promise<boolean>;
  onConfirmClose?: (actualCash: number, notes?: string) => Promise<boolean>;
}

export const CashRegisterModal: React.FC<CashRegisterModalProps> = ({
  open,
  onOpenChange,
  mode,
  activeShift,
  onConfirmOpen,
  onConfirmClose,
}) => {
  const { number } = useFormatters();
  const [cashAmount, setCashAmount] = useState<string>('0');
  const [notes, setNotes] = useState<string>('');
  const [loading, setLoading] = useState<boolean>(false);

  const expectedCash = activeShift
    ? Number(activeShift.openingCash || 0) +
      Number(activeShift.totalSalesCash || 0) +
      Number(activeShift.cashIn || 0) -
      Number(activeShift.cashOut || 0) -
      Number(activeShift.totalRefunds || 0)
    : 0;

  const actualNum = Number(cashAmount) || 0;
  const difference = Math.round((actualNum - expectedCash) * 100) / 100;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    try {
      if (mode === 'open' && onConfirmOpen) {
        const ok = await onConfirmOpen(actualNum, notes);
        if (ok) onOpenChange(false);
      } else if (mode === 'close' && onConfirmClose) {
        const ok = await onConfirmClose(actualNum, notes);
        if (ok) onOpenChange(false);
      }
    } finally {
      setLoading(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md" dir="rtl">
        <form onSubmit={handleSubmit}>
          <DialogHeader>
            <DialogTitle className="text-lg font-bold flex items-center gap-2">
              {mode === 'open' ? (
                <>
                  <Unlock className="w-5 h-5 text-emerald-600" />
                  <span>فتح وردية وجلسة كاشير جديدة</span>
                </>
              ) : (
                <>
                  <Lock className="w-5 h-5 text-rose-600" />
                  <span>إغلاق وردية الكاشير وجرد الدرج</span>
                </>
              )}
            </DialogTitle>
          </DialogHeader>

          <div className="space-y-4 py-4">
            {mode === 'open' ? (
              <div className="space-y-2">
                <Label htmlFor="opening-cash" className="font-semibold text-sm">
                  مبلغ العهدة النقدية الافتتاحية (ج.م):
                </Label>
                <Input
                  id="opening-cash"
                  type="number"
                  min="0"
                  step="any"
                  value={cashAmount}
                  onChange={(e) => setCashAmount(e.target.value)}
                  placeholder="0.00"
                  className="h-11 font-bold text-center text-lg"
                  required
                  autoFocus
                />
                <p className="text-xs text-muted-foreground">
                  المبلغ النقدي الأولي المتواجد في درج الكاشير قبل بدء المبيعات
                </p>
              </div>
            ) : (
              <div className="space-y-4">
                {/* Expected Summary */}
                <div className="p-3 bg-muted/40 rounded-xl space-y-1.5 border border-border text-xs">
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">العهدة الافتتاحية:</span>
                    <span className="font-semibold">{number(activeShift?.openingCash || 0)} ج.م</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">إجمالي مبيعات الكاش:</span>
                    <span className="font-semibold text-emerald-600">+{number(activeShift?.totalSalesCash || 0)} ج.م</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">مبيعات البطاقات والإلكتروني:</span>
                    <span className="font-semibold text-blue-600">{number(activeShift?.totalSalesCard || 0)} ج.م</span>
                  </div>
                  {Number(activeShift?.totalDiscounts || 0) > 0 && (
                    <div className="flex justify-between">
                      <span className="text-muted-foreground">إجمالي الخصومات الممنوحة بالوردية:</span>
                      <span className="font-semibold text-rose-600">-{number(activeShift?.totalDiscounts || 0)} ج.م</span>
                    </div>
                  )}
                  <div className="flex justify-between pt-1.5 border-t border-border font-bold text-sm">
                    <span>النقدية المتوقعة في الدرج:</span>
                    <span className="text-primary">{number(expectedCash)} ج.م</span>
                  </div>
                </div>

                <div className="space-y-2">
                  <Label htmlFor="closing-cash" className="font-semibold text-sm">
                    النقدية الفعلية المحصورة في الدرج (ج.م):
                  </Label>
                  <Input
                    id="closing-cash"
                    type="number"
                    min="0"
                    step="any"
                    value={cashAmount}
                    onChange={(e) => setCashAmount(e.target.value)}
                    placeholder="0.00"
                    className="h-11 font-bold text-center text-lg"
                    required
                    autoFocus
                  />
                </div>

                {/* Variance Display */}
                <div
                  className={`p-3 rounded-xl border flex items-center justify-between text-sm ${
                    difference === 0
                      ? 'bg-emerald-500/10 border-emerald-500/20 text-emerald-700'
                      : difference > 0
                      ? 'bg-blue-500/10 border-blue-500/20 text-blue-700'
                      : 'bg-destructive/10 border-destructive/20 text-destructive'
                  }`}
                >
                  <div className="flex items-center gap-2">
                    {difference === 0 ? (
                      <CheckCircle2 className="w-4 h-4 text-emerald-600" />
                    ) : (
                      <AlertTriangle className="w-4 h-4 text-destructive" />
                    )}
                    <span className="font-bold">
                      {difference === 0
                        ? 'الدرج متطابق تماماً'
                        : difference > 0
                        ? 'يوجد فائض في الدرج'
                        : 'يوجد عجز في الدرج'}
                    </span>
                  </div>
                  <span className="font-extrabold text-base">
                    {difference > 0 ? `+${number(difference)}` : number(difference)} ج.م
                  </span>
                </div>
              </div>
            )}

            <div className="space-y-1.5">
              <Label htmlFor="shift-notes" className="text-xs text-muted-foreground">
                ملاحظات الوردية (اختياري):
              </Label>
              <Textarea
                id="shift-notes"
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                placeholder="أية ملاحظات خاصة بالجلسة أو فروقات الدرج..."
                rows={2}
                className="text-xs"
              />
            </div>
          </div>

          <DialogFooter className="flex gap-2 sm:justify-between">
            <Button
              type="button"
              variant="outline"
              onClick={() => onOpenChange(false)}
              disabled={loading}
            >
              إلغاء
            </Button>
            <Button
              type="submit"
              disabled={loading}
              className={mode === 'open' ? 'bg-emerald-600 hover:bg-emerald-700' : 'bg-rose-600 hover:bg-rose-700'}
            >
              {loading ? 'جاري المعالجة...' : mode === 'open' ? 'تأكيد فتح الوردية' : 'تأكيد إغلاق الوردية'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
};
