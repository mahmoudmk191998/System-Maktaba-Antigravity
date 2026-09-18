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
import { Textarea } from '@/components/ui/textarea';
import { toast } from 'sonner';
import { Layers, CheckCircle2 } from 'lucide-react';
import type { Product } from '@/types/retail.types';

interface OpeningBalanceDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  products: Product[];
  selectedLocationName?: string;
  onSubmitBalance: (
    productId: string,
    variantId: string | null | undefined,
    quantity: number,
    unitCost: number,
    notes?: string
  ) => Promise<{ success: boolean; error?: string }>;
}

export const OpeningBalanceDialog: React.FC<OpeningBalanceDialogProps> = ({
  open,
  onOpenChange,
  products,
  selectedLocationName,
  onSubmitBalance,
}) => {
  const [selectedProductId, setSelectedProductId] = useState<string>('');
  const [selectedVariantId, setSelectedVariantId] = useState<string>('base');
  const [quantity, setQuantity] = useState<string>('');
  const [unitCost, setUnitCost] = useState<string>('');
  const [notes, setNotes] = useState<string>('');
  const [submitting, setSubmitting] = useState(false);

  const selectedProduct = products.find((p) => p.id === selectedProductId);

  const handleProductSelect = (pId: string) => {
    setSelectedProductId(pId);
    setSelectedVariantId('base');
    const prod = products.find((p) => p.id === pId);
    if (prod) {
      setUnitCost(String(prod.purchasePrice || 0));
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedProductId) {
      toast.error('يرجى اختيار الصنف');
      return;
    }

    const qty = parseFloat(quantity);
    const cost = parseFloat(unitCost);

    if (isNaN(qty) || qty <= 0) {
      toast.error('يرجى إدخال كمية صحيحة أكبر من صفر');
      return;
    }
    if (isNaN(cost) || cost < 0) {
      toast.error('يرجى إدخال تكلفة شراء صالحة');
      return;
    }

    setSubmitting(true);
    try {
      const vId = selectedVariantId === 'base' ? null : selectedVariantId;
      const res = await onSubmitBalance(selectedProductId, vId, qty, cost, notes);

      if (res.success) {
        toast.success('تم تسجيل الرصيد الافتتاحي بنجاح');
        onOpenChange(false);
        setSelectedProductId('');
        setQuantity('');
        setUnitCost('');
        setNotes('');
      } else {
        toast.error(res.error || 'فشل في تسجيل الرصيد الافتتاحي');
      }
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[500px]">
        <DialogHeader>
          <div className="flex items-center gap-2">
            <div className="p-2 rounded-lg bg-primary/10 text-primary">
              <Layers className="w-5 h-5" />
            </div>
            <div>
              <DialogTitle>تسجيل رصيد افتتاحي أولي</DialogTitle>
              <DialogDescription>
                الموقع: <span className="font-semibold text-foreground">{selectedLocationName || 'الموقع الحالي'}</span>
              </DialogDescription>
            </div>
          </div>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="space-y-4 py-2">
          {/* Product Selector */}
          <div>
            <Label className="text-xs">اختر المنتج أو الكتاب *</Label>
            <select
              required
              value={selectedProductId}
              onChange={(e) => handleProductSelect(e.target.value)}
              className="mt-1 flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
            >
              <option value="">-- اضغط لاختيار منتج من الفهرس --</option>
              {products.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name} ({p.sku})
                </option>
              ))}
            </select>
          </div>

          {/* Variant Selector if applicable */}
          {selectedProduct?.hasVariants && selectedProduct.variants && selectedProduct.variants.length > 0 && (
            <div>
              <Label className="text-xs">المتغير / الخاصية *</Label>
              <select
                required
                value={selectedVariantId}
                onChange={(e) => {
                  setSelectedVariantId(e.target.value);
                  const v = selectedProduct.variants?.find((x) => x.id === e.target.value);
                  if (v && v.cost) setUnitCost(String(v.cost));
                }}
                className="mt-1 flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
              >
                <option value="base">-- المنتج ككل بدون خصائص --</option>
                {selectedProduct.variants.map((v) => (
                  <option key={v.id} value={v.id}>
                    {v.name} ({v.sku})
                  </option>
                ))}
              </select>
            </div>
          )}

          {/* Quantity & Unit Cost */}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label htmlFor="op_qty" className="text-xs">
                الكمية الافتتاحية *
              </Label>
              <Input
                id="op_qty"
                type="number"
                min="1"
                step="any"
                required
                placeholder="100"
                value={quantity}
                onChange={(e) => setQuantity(e.target.value)}
                className="mt-1 font-bold text-base"
              />
            </div>
            <div>
              <Label htmlFor="op_cost" className="text-xs">
                تكلفة القطعة (ج.م) *
              </Label>
              <Input
                id="op_cost"
                type="number"
                min="0"
                step="any"
                required
                placeholder="15.00"
                value={unitCost}
                onChange={(e) => setUnitCost(e.target.value)}
                className="mt-1 font-bold text-base"
              />
            </div>
          </div>

          {/* Notes */}
          <div>
            <Label htmlFor="op_notes" className="text-xs">
              ملاحظات مرجعية
            </Label>
            <Textarea
              id="op_notes"
              placeholder="مثال: رصيد افتتاحي عند تدشين فرع المعادي..."
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
              {submitting ? 'جاري الإدراج...' : 'اعتماد الرصيد الافتتاحي'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
};
