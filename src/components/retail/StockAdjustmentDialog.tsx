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
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Textarea } from '@/components/ui/textarea';
import { toast } from 'sonner';
import { Scale, ArrowUpRight, ArrowDownRight } from 'lucide-react';
import type { StockBalance } from '@/types/retail.types';

interface StockAdjustmentDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  balanceItem?: StockBalance | null;
  productName?: string;
  onAdjust: (
    productId: string,
    variantId: string | null | undefined,
    quantity: number,
    direction: 'in' | 'out',
    reason: string,
    unitCost?: number
  ) => Promise<{ success: boolean; error?: string }>;
}

export const StockAdjustmentDialog: React.FC<StockAdjustmentDialogProps> = ({
  open,
  onOpenChange,
  balanceItem,
  productName,
  onAdjust,
}) => {
  const [direction, setDirection] = useState<'in' | 'out'>('out');
  const [quantity, setQuantity] = useState<string>('');
  const [reason, setReason] = useState<string>('count_difference');
  const [notes, setNotes] = useState<string>('');
  const [submitting, setSubmitting] = useState(false);

  if (!balanceItem) return null;

  const currentOnHand = balanceItem.onHandQuantity ?? balanceItem.quantity ?? 0;
  const currentCost = balanceItem.averageCost ?? balanceItem.unitCost ?? 0;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const qtyNum = parseFloat(quantity);
    if (isNaN(qtyNum) || qtyNum <= 0) {
      toast.error('يرجى إدخال كمية تسوية صحيحة أكبر من صفر');
      return;
    }

    if (direction === 'out' && qtyNum > currentOnHand) {
      toast.error(`لا يمكن تسوية بالخصم لأكثر من الرصيد المتاح (${currentOnHand})`);
      return;
    }

    setSubmitting(true);
    try {
      const fullReason = `${reason}: ${notes}`.trim();
      const res = await onAdjust(
        balanceItem.productId,
        balanceItem.variantId,
        qtyNum,
        direction,
        fullReason,
        currentCost
      );

      if (res.success) {
        toast.success('تمت تسوية رصيد المخزون بنجاح');
        onOpenChange(false);
        setQuantity('');
        setNotes('');
      } else {
        toast.error(res.error || 'فشلت عملية التسوية');
      }
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[480px]">
        <DialogHeader>
          <div className="flex items-center gap-2">
            <div className="p-2 rounded-lg bg-amber-500/10 text-amber-600">
              <Scale className="w-5 h-5" />
            </div>
            <div>
              <DialogTitle>تسوية رصيد مخزني</DialogTitle>
              <DialogDescription>
                {productName || balanceItem.productId} - الرصيد الحالي: {currentOnHand} قطعة
              </DialogDescription>
            </div>
          </div>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="space-y-4 py-2">
          {/* Direction Selector */}
          <div>
            <Label className="text-xs mb-2 block">نوع التسوية</Label>
            <div className="grid grid-cols-2 gap-2">
              <Button
                type="button"
                variant={direction === 'in' ? 'default' : 'outline'}
                onClick={() => setDirection('in')}
                className="flex items-center justify-center gap-2 font-bold"
              >
                <ArrowUpRight className="w-4 h-4 text-emerald-500" />
                إضافة رصيد (فائض)
              </Button>
              <Button
                type="button"
                variant={direction === 'out' ? 'default' : 'outline'}
                onClick={() => setDirection('out')}
                className="flex items-center justify-center gap-2 font-bold"
              >
                <ArrowDownRight className="w-4 h-4 text-rose-500" />
                خصم رصيد (عجز)
              </Button>
            </div>
          </div>

          {/* Quantity */}
          <div>
            <Label htmlFor="qty" className="text-xs">
              كمية التسوية (بالقطعة / الوحدة الأساسية) *
            </Label>
            <Input
              id="qty"
              type="number"
              min="0.01"
              step="any"
              required
              placeholder="مثال: 5"
              value={quantity}
              onChange={(e) => setQuantity(e.target.value)}
              className="mt-1 font-bold text-base"
            />
          </div>

          {/* Reason */}
          <div>
            <Label htmlFor="reason" className="text-xs">
              سبب التسوية *
            </Label>
            <Select value={reason} onValueChange={setReason}>
              <SelectTrigger id="reason" className="mt-1">
                <SelectValue placeholder="اختر سبب التسوية" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="count_difference">فروق جرد دوري</SelectItem>
                <SelectItem value="damaged">تالف أو عيب تصنيع</SelectItem>
                <SelectItem value="lost">مفقود أو عجز مبيعات</SelectItem>
                <SelectItem value="data_correction">تصحيح خطأ مدخلات سابقة</SelectItem>
                <SelectItem value="found">بضاعة تم العثور عليها</SelectItem>
                <SelectItem value="other">أسباب أخرى</SelectItem>
              </SelectContent>
            </Select>
          </div>

          {/* Notes */}
          <div>
            <Label htmlFor="notes" className="text-xs">
              ملاحظات وتفاصيل إضافية
            </Label>
            <Textarea
              id="notes"
              placeholder="اكتب توضيحاً لسبب إجراء هذه التسوية..."
              rows={2}
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              className="mt-1"
            />
          </div>

          <DialogFooter className="pt-3 gap-2 sm:gap-0">
            <Button
              type="button"
              variant="outline"
              onClick={() => onOpenChange(false)}
              disabled={submitting}
            >
              إلغاء
            </Button>
            <Button type="submit" disabled={submitting}>
              {submitting ? 'جاري الحفظ...' : 'تأكيد التسوية الذرية'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
};
