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
import { Badge } from '@/components/ui/badge';
import { toast } from 'sonner';
import { Truck, Plus, Trash2, ArrowRight } from 'lucide-react';
import type { Product, InventoryLocation } from '@/types/retail.types';

interface TransferManageDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  locations: InventoryLocation[];
  currentLocationId: string;
  products: Product[];
  onCreateTransfer: (
    input: {
      fromLocationId: string;
      toLocationId: string;
      items: Array<{
        productId: string;
        variantId?: string | null;
        productNameSnapshot: string;
        skuSnapshot: string;
        quantity: number;
        unitCostSnapshot: number;
      }>;
      notes?: string;
    },
    status: 'draft' | 'requested'
  ) => Promise<{ success: boolean; error?: string }>;
}

export const TransferManageDialog: React.FC<TransferManageDialogProps> = ({
  open,
  onOpenChange,
  locations,
  currentLocationId,
  products,
  onCreateTransfer,
}) => {
  const [fromLocId, setFromLocId] = useState<string>(currentLocationId || '');
  const [toLocId, setToLocId] = useState<string>('');
  const [notes, setNotes] = useState<string>('');
  const [transferItems, setTransferItems] = useState<
    Array<{
      productId: string;
      variantId?: string | null;
      productName: string;
      sku: string;
      quantity: number;
      unitCost: number;
    }>
  >([]);

  // Item selection state
  const [selectedProductId, setSelectedProductId] = useState<string>('');
  const [selectedVariantId, setSelectedVariantId] = useState<string>('base');
  const [itemQty, setItemQty] = useState<string>('10');
  const [submitting, setSubmitting] = useState(false);

  const selectedProduct = products.find((p) => p.id === selectedProductId);

  const handleAddItem = () => {
    if (!selectedProduct) {
      toast.error('يرجى اختيار صنف أولاً');
      return;
    }
    const qty = parseFloat(itemQty);
    if (isNaN(qty) || qty <= 0) {
      toast.error('يرجى إدخال كمية صحيحة');
      return;
    }

    const vId = selectedVariantId === 'base' ? null : selectedVariantId;
    const vObj = selectedProduct.variants?.find((v) => v.id === vId);
    const pName = vObj ? `${selectedProduct.name} - ${vObj.name}` : selectedProduct.name;
    const sku = vObj ? vObj.sku : selectedProduct.sku;
    const cost = vObj?.cost ?? selectedProduct.purchasePrice ?? 0;

    // Check if already in list
    const existingIndex = transferItems.findIndex(
      (i) => i.productId === selectedProduct.id && (i.variantId || null) === (vId || null)
    );

    if (existingIndex >= 0) {
      const updated = [...transferItems];
      updated[existingIndex].quantity += qty;
      setTransferItems(updated);
    } else {
      setTransferItems([
        ...transferItems,
        {
          productId: selectedProduct.id,
          variantId: vId,
          productName: pName,
          sku,
          quantity: qty,
          unitCost: cost,
        },
      ]);
    }

    setSelectedProductId('');
    setItemQty('10');
  };

  const handleRemoveItem = (index: number) => {
    setTransferItems(transferItems.filter((_, i) => i !== index));
  };

  const handleSubmit = async (status: 'draft' | 'requested') => {
    if (!fromLocId || !toLocId) {
      toast.error('يرجى اختيار موقع المصدر وموقع المستلم');
      return;
    }
    if (fromLocId === toLocId) {
      toast.error('لا يمكن المناقلة بين نفس الموقع');
      return;
    }
    if (transferItems.length === 0) {
      toast.error('يرجى إضافة صنف واحد على الأقل للمناقلة');
      return;
    }

    setSubmitting(true);
    try {
      const res = await onCreateTransfer(
        {
          fromLocationId: fromLocId,
          toLocationId: toLocId,
          items: transferItems.map((i) => ({
            productId: i.productId,
            variantId: i.variantId,
            productNameSnapshot: i.productName,
            skuSnapshot: i.sku,
            quantity: i.quantity,
            unitCostSnapshot: i.unitCost,
          })),
          notes,
        },
        status
      );

      if (res.success) {
        toast.success(`تم إنشاء أمر المناقلة بنجاح (${status === 'draft' ? 'مسودة' : 'طلب قيد الاعتماد'})`);
        onOpenChange(false);
        setTransferItems([]);
        setNotes('');
      } else {
        toast.error(res.error || 'فشل في إنشاء المناقلة');
      }
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[650px]">
        <DialogHeader>
          <div className="flex items-center gap-2">
            <div className="p-2 rounded-lg bg-indigo-500/10 text-indigo-600">
              <Truck className="w-5 h-5" />
            </div>
            <div>
              <DialogTitle>إنشاء مناقلة بضاعة بين المخازن والفروع</DialogTitle>
              <DialogDescription>
                المخزون لن يخصم من الفرع المصدر إلا عند تنفيذ الشحن الفعلي (Dispatch)
              </DialogDescription>
            </div>
          </div>
        </DialogHeader>

        <div className="space-y-4 py-2">
          {/* Source and Destination Locations */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 p-3 bg-muted/40 rounded-lg border">
            <div>
              <Label className="text-xs font-semibold">من موقع (المصدر) *</Label>
              <select
                value={fromLocId}
                onChange={(e) => setFromLocId(e.target.value)}
                className="mt-1 flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
              >
                <option value="">-- اختر المصدر --</option>
                {locations.map((loc) => (
                  <option key={loc.id} value={loc.id}>
                    {loc.name} {loc.isCentralWarehouse ? '(مخزن رئيسي)' : ''}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <Label className="text-xs font-semibold">إلى موقع (المستلم) *</Label>
              <select
                value={toLocId}
                onChange={(e) => setToLocId(e.target.value)}
                className="mt-1 flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
              >
                <option value="">-- اختر المستلم --</option>
                {locations
                  .filter((loc) => loc.id !== fromLocId)
                  .map((loc) => (
                    <option key={loc.id} value={loc.id}>
                      {loc.name}
                    </option>
                  ))}
              </select>
            </div>
          </div>

          {/* Add Item Form */}
          <div className="p-3 border rounded-lg space-y-3 bg-card">
            <Label className="text-xs font-bold text-primary">إضافة أصناف للمناقلة</Label>
            <div className="grid grid-cols-1 sm:grid-cols-12 gap-2 items-end">
              <div className="sm:col-span-6">
                <Label className="text-[11px] text-muted-foreground">اختر الصنف</Label>
                <select
                  value={selectedProductId}
                  onChange={(e) => setSelectedProductId(e.target.value)}
                  className="mt-1 flex h-9 w-full rounded-md border border-input bg-background px-2 py-1 text-xs"
                >
                  <option value="">-- اختر منتج --</option>
                  {products.map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.name} ({p.sku})
                    </option>
                  ))}
                </select>
              </div>

              {selectedProduct?.hasVariants && (
                <div className="sm:col-span-3">
                  <Label className="text-[11px] text-muted-foreground">الخاصية/اللون</Label>
                  <select
                    value={selectedVariantId}
                    onChange={(e) => setSelectedVariantId(e.target.value)}
                    className="mt-1 flex h-9 w-full rounded-md border border-input bg-background px-2 py-1 text-xs"
                  >
                    <option value="base">الأساسي</option>
                    {selectedProduct.variants?.map((v) => (
                      <option key={v.id} value={v.id}>
                        {v.name}
                      </option>
                    ))}
                  </select>
                </div>
              )}

              <div className={selectedProduct?.hasVariants ? 'sm:col-span-2' : 'sm:col-span-4'}>
                <Label className="text-[11px] text-muted-foreground">الكمية</Label>
                <Input
                  type="number"
                  min="1"
                  step="any"
                  value={itemQty}
                  onChange={(e) => setItemQty(e.target.value)}
                  className="mt-1 h-9 text-xs font-bold"
                />
              </div>

              <div className={selectedProduct?.hasVariants ? 'sm:col-span-1' : 'sm:col-span-2'}>
                <Button type="button" size="sm" onClick={handleAddItem} className="w-full h-9">
                  <Plus className="w-4 h-4" />
                </Button>
              </div>
            </div>
          </div>

          {/* Items Table */}
          <div className="max-h-48 overflow-y-auto border rounded-lg">
            <table className="w-full text-xs text-right">
              <thead className="bg-muted text-muted-foreground sticky top-0">
                <tr>
                  <th className="p-2">الصنف</th>
                  <th className="p-2">الرمز (SKU)</th>
                  <th className="p-2">الكمية</th>
                  <th className="p-2 text-center">إجراء</th>
                </tr>
              </thead>
              <tbody className="divide-y">
                {transferItems.length === 0 ? (
                  <tr>
                    <td colSpan={4} className="p-4 text-center text-muted-foreground">
                      لم يتم إضافة أصناف بعد
                    </td>
                  </tr>
                ) : (
                  transferItems.map((item, idx) => (
                    <tr key={idx} className="hover:bg-muted/30">
                      <td className="p-2 font-medium">{item.productName}</td>
                      <td className="p-2 font-mono text-muted-foreground">{item.sku}</td>
                      <td className="p-2 font-bold">{item.quantity}</td>
                      <td className="p-2 text-center">
                        <Button
                          type="button"
                          variant="ghost"
                          size="icon"
                          onClick={() => handleRemoveItem(idx)}
                          className="h-6 w-6 text-rose-500 hover:text-rose-700"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </Button>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>

          {/* Notes */}
          <div>
            <Label className="text-xs">ملاحظات المناقلة</Label>
            <Input
              placeholder="مثال: تعزيز رصيد الأدوات المدرسية لموسم العودة للمدارس..."
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              className="mt-1 text-xs"
            />
          </div>
        </div>

        <DialogFooter className="gap-2 sm:gap-0 pt-2">
          <Button type="button" variant="outline" onClick={() => onOpenChange(false)} disabled={submitting}>
            إلغاء
          </Button>
          <Button
            type="button"
            variant="secondary"
            onClick={() => handleSubmit('draft')}
            disabled={submitting || transferItems.length === 0}
          >
            حفظ كمسودة
          </Button>
          <Button
            type="button"
            onClick={() => handleSubmit('requested')}
            disabled={submitting || transferItems.length === 0}
          >
            إرسال للاعتماد
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};
