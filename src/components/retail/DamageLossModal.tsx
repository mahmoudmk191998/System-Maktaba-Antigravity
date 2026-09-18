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
import { AlertOctagon, Trash2 } from 'lucide-react';
import type { Product, DamageLossType } from '@/types/retail.types';

interface DamageLossModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  products: Product[];
  currentLocationId: string;
  onRecordDamage: (input: {
    locationId: string;
    productId: string;
    variantId?: string | null;
    productNameSnapshot?: string;
    quantity: number;
    unitCost: number;
    type: DamageLossType;
    reason: string;
    notes?: string;
  }) => Promise<{ success: boolean; error?: string }>;
}

export const DamageLossModal: React.FC<DamageLossModalProps> = ({
  open,
  onOpenChange,
  products,
  currentLocationId,
  onRecordDamage,
}) => {
  const [selectedProductId, setSelectedProductId] = useState('');
  const [selectedVariantId, setSelectedVariantId] = useState('base');
  const [quantity, setQuantity] = useState('');
  const [damageType, setDamageType] = useState<DamageLossType>('damaged');
  const [reason, setReason] = useState('');
  const [notes, setNotes] = useState('');
  const [submitting, setSubmitting] = useState(false);

  const selectedProduct = products.find((p) => p.id === selectedProductId);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedProductId) {
      toast.error('يرجى اختيار الصنف');
      return;
    }
    const qty = parseFloat(quantity);
    if (isNaN(qty) || qty <= 0) {
      toast.error('يرجى إدخال كمية صحيحة أكبر من صفر');
      return;
    }
    if (!reason.trim()) {
      toast.error('يرجى كتابة سبب التلف أو الفقد');
      return;
    }

    const vId = selectedVariantId === 'base' ? null : selectedVariantId;
    const vObj = selectedProduct?.variants?.find((v) => v.id === vId);
    const pName = vObj ? `${selectedProduct?.name} (${vObj.name})` : selectedProduct?.name;
    const cost = vObj?.cost ?? selectedProduct?.purchasePrice ?? 0;

    setSubmitting(true);
    try {
      const res = await onRecordDamage({
        locationId: currentLocationId,
        productId: selectedProductId,
        variantId: vId,
        productNameSnapshot: pName,
        quantity: qty,
        unitCost: cost,
        type: damageType,
        reason,
        notes,
      });

      if (res.success) {
        toast.success('تم تسجيل الهالك وخصم المخزون بنجاح');
        onOpenChange(false);
        setSelectedProductId('');
        setQuantity('');
        setReason('');
        setNotes('');
      } else {
        toast.error(res.error || 'فشل في تسجيل الهالك');
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
            <div className="p-2 rounded-lg bg-rose-500/10 text-rose-600">
              <AlertOctagon className="w-5 h-5" />
            </div>
            <div>
              <DialogTitle>تسجيل توالف أو فقد بالمخزون</DialogTitle>
              <DialogDescription>
                سيتم خصم الكمية تلقائياً من رصيد المخزن المتاح وإنشاء حركة خروج هالك
              </DialogDescription>
            </div>
          </div>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="space-y-3.5 py-2">
          {/* Product Select */}
          <div>
            <Label className="text-xs">الصنف المتضرر *</Label>
            <select
              required
              value={selectedProductId}
              onChange={(e) => {
                setSelectedProductId(e.target.value);
                setSelectedVariantId('base');
              }}
              className="mt-1 flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
            >
              <option value="">-- اضغط لاختيار الصنف --</option>
              {products.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name} ({p.sku})
                </option>
              ))}
            </select>
          </div>

          {/* Variant Select */}
          {selectedProduct?.hasVariants && (
            <div>
              <Label className="text-xs">الخاصية / اللون</Label>
              <select
                value={selectedVariantId}
                onChange={(e) => setSelectedVariantId(e.target.value)}
                className="mt-1 flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
              >
                <option value="base">الأساسي</option>
                {selectedProduct.variants?.map((v) => (
                  <option key={v.id} value={v.id}>
                    {v.name} ({v.sku})
                  </option>
                ))}
              </select>
            </div>
          )}

          {/* Type and Quantity */}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label className="text-xs">نوع السجل *</Label>
              <Select value={damageType} onValueChange={(val) => setDamageType(val as DamageLossType)}>
                <SelectTrigger className="mt-1">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="damaged">تالف / عيب تصنيع</SelectItem>
                  <SelectItem value="lost">مفقود / عجز</SelectItem>
                  <SelectItem value="broken">مكسور (أدوات هندسية/أقلام)</SelectItem>
                  <SelectItem value="expired">منتهي الصلاحية (ألوان/صمغ)</SelectItem>
                  <SelectItem value="other">أسباب أخرى</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div>
              <Label className="text-xs">الكمية التالفة *</Label>
              <Input
                type="number"
                min="1"
                step="any"
                required
                placeholder="مثال: 3"
                value={quantity}
                onChange={(e) => setQuantity(e.target.value)}
                className="mt-1 font-bold text-base"
              />
            </div>
          </div>

          {/* Reason */}
          <div>
            <Label className="text-xs">سبب التلف أو الواقعة *</Label>
            <Input
              required
              placeholder="مثال: تسريب حبر أدى لتلف الغلاف، كسر مسطرة أثناء الترتيب..."
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              className="mt-1 text-xs"
            />
          </div>

          {/* Notes */}
          <div>
            <Label className="text-xs">ملاحظات وتوصيات</Label>
            <Textarea
              placeholder="هل يمكن المطالبة بالتعويض من المورد؟..."
              rows={2}
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              className="mt-1 text-xs"
            />
          </div>

          <DialogFooter className="gap-2 sm:gap-0 pt-2">
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)} disabled={submitting}>
              إلغاء
            </Button>
            <Button type="submit" variant="destructive" disabled={submitting}>
              {submitting ? 'جاري الحفظ...' : 'تأكيد تسجيل الهالك'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
};
