import React, { useState, useRef, useMemo } from 'react';
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
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  ShoppingCart,
  Plus,
  Minus,
  Trash2,
  Barcode,
  Search,
  Truck,
  Building2,
  Calendar,
  FileText,
  DollarSign,
  AlertCircle,
} from 'lucide-react';
import { toast } from 'sonner';
import { useSuppliers } from '@/hooks/retail/useSuppliers';
import { useProducts } from '@/hooks/retail/useProducts';
import { useUnits } from '@/hooks/retail/useUnits';
import { useAppStore } from '@/lib/store';
import { useFormatters } from '@/lib/formatters';
import type { PurchaseOrder, Product } from '@/types/retail.types';
import type { CreatePOItemInput } from '@/services/purchasing/purchaseOrders.service';

interface PurchaseOrderModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSuccess?: (po: PurchaseOrder) => void;
  createPO: (input: any) => Promise<PurchaseOrder>;
}

export const PurchaseOrderModal: React.FC<PurchaseOrderModalProps> = ({
  open,
  onOpenChange,
  onSuccess,
  createPO,
}) => {
  const { number } = useFormatters();
  const currentTenant = useAppStore((state) => state.currentTenant);
  const currentBranch = useAppStore((state) => state.currentBranch);
  const currentUser = useAppStore((state) => state.currentUser);

  const { suppliers } = useSuppliers({ activeOnly: true });
  const { products } = useProducts({ pageSize: 300 });
  const { units } = useUnits();

  // Form states
  const [supplierId, setSupplierId] = useState('');
  const [destinationLocationId, setDestinationLocationId] = useState(currentBranch?.id || '');
  const [orderDate, setOrderDate] = useState(new Date().toISOString().split('T')[0]);
  const [expectedDeliveryDate, setExpectedDeliveryDate] = useState('');
  const [supplierInvoiceNumber, setSupplierInvoiceNumber] = useState('');
  const [shippingCost, setShippingCost] = useState<number>(0);
  const [otherCosts, setOtherCosts] = useState<number>(0);
  const [notes, setNotes] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);

  // Line items
  const [items, setItems] = useState<CreatePOItemInput[]>([]);

  // Search & Barcode
  const [productSearch, setProductSearch] = useState('');
  const [barcodeInput, setBarcodeInput] = useState('');
  const barcodeInputRef = useRef<HTMLInputElement>(null);

  // Filtered product suggestions
  const searchResults = useMemo(() => {
    if (!productSearch.trim()) return [];
    const q = productSearch.toLowerCase().trim();
    return products
      .filter(
        (p) =>
          p.name.toLowerCase().includes(q) ||
          p.sku.toLowerCase().includes(q) ||
          (p.barcode && p.barcode.includes(q))
      )
      .slice(0, 6);
  }, [products, productSearch]);

  const handleAddProduct = (product: Product, variant?: any) => {
    const existingIndex = items.findIndex(
      (i) => i.productId === product.id && (i.variantId || null) === (variant?.id || null)
    );

    if (existingIndex >= 0) {
      setItems((prev) =>
        prev.map((item, idx) =>
          idx === existingIndex ? { ...item, orderedQuantity: item.orderedQuantity + 1 } : item
        )
      );
    } else {
      const defaultCost = variant?.purchasePrice ?? product.purchasePrice ?? 0;
      setItems((prev) => [
        ...prev,
        {
          productId: product.id,
          variantId: variant?.id || null,
          productNameSnapshot: variant ? `${product.name} (${variant.name})` : product.name,
          skuSnapshot: variant?.sku || product.sku,
          orderedQuantity: 1,
          inputUnitId: product.unitId || 'pcs',
          conversionFactor: 1,
          unitCost: defaultCost,
          discountAmount: 0,
          taxAmount: 0,
        },
      ]);
    }
    setProductSearch('');
  };

  const handleBarcodeScan = (e: React.FormEvent) => {
    e.preventDefault();
    if (!barcodeInput.trim()) return;
    const barcode = barcodeInput.trim();

    // Check product or variant barcode
    let matchedProduct: Product | undefined;
    let matchedVariant: any;

    for (const p of products) {
      if (p.barcode === barcode) {
        matchedProduct = p;
        break;
      }
      if (p.variants) {
        const v = p.variants.find((v) => v.barcode === barcode);
        if (v) {
          matchedProduct = p;
          matchedVariant = v;
          break;
        }
      }
    }

    if (matchedProduct) {
      handleAddProduct(matchedProduct, matchedVariant);
      toast.success(`تمت إضافة: ${matchedVariant ? `${matchedProduct.name} (${matchedVariant.name})` : matchedProduct.name}`);
      setBarcodeInput('');
      barcodeInputRef.current?.focus();
    } else {
      toast.error('الصنف غير موجود في الفهرس', { description: `الباركود: ${barcode}` });
    }
  };

  // Computations
  const totals = useMemo(() => {
    let subtotal = 0;
    let discountTotal = 0;
    let taxTotal = 0;

    items.forEach((item) => {
      const lineSub = item.orderedQuantity * item.unitCost;
      subtotal += lineSub;
      discountTotal += item.discountAmount || 0;
      taxTotal += item.taxAmount || 0;
    });

    const grandTotal = Math.max(0, subtotal - discountTotal + taxTotal + Number(shippingCost || 0) + Number(otherCosts || 0));

    return {
      subtotal: Math.round(subtotal * 100) / 100,
      discountTotal: Math.round(discountTotal * 100) / 100,
      taxTotal: Math.round(taxTotal * 100) / 100,
      grandTotal: Math.round(grandTotal * 100) / 100,
    };
  }, [items, shippingCost, otherCosts]);

  const handleSubmit = async () => {
    if (!supplierId) {
      toast.error('يرجى اختيار المورد أولاً');
      return;
    }
    if (items.length === 0) {
      toast.error('يرجى إضافة صنف واحد على الأقل لأمر الشراء');
      return;
    }

    setIsSubmitting(true);
    try {
      const newPO = await createPO({
        destinationLocationId: destinationLocationId || currentBranch?.id,
        supplierId,
        orderDate,
        expectedDeliveryDate: expectedDeliveryDate || undefined,
        supplierInvoiceNumber: supplierInvoiceNumber || undefined,
        items,
        shippingCost: Number(shippingCost) || 0,
        otherCosts: Number(otherCosts) || 0,
        notes,
        createdBy: currentUser?.name || 'مسؤول المشتريات',
      });

      toast.success(`تم إنشاء أمر الشراء بنجاح! رقم: ${newPO.purchaseOrderNumber}`);
      onSuccess?.(newPO);
      onOpenChange(false);
    } catch (err: any) {
      toast.error(err.message || 'فشل إنشاء أمر الشراء');
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-4xl max-h-[92vh] flex flex-col p-0 overflow-hidden" dir="rtl">
        <DialogHeader className="p-4 border-b border-border bg-muted/40">
          <div className="flex items-center gap-3">
            <div className="p-2 rounded-xl bg-primary text-primary-foreground">
              <ShoppingCart className="w-5 h-5" />
            </div>
            <div>
              <DialogTitle className="text-lg font-bold">إنشاء أمر شراء بضاعة (Purchase Order)</DialogTitle>
              <DialogDescription className="text-xs text-muted-foreground mt-0.5">
                إصدار أمر توريد للناشرين وموردي الأدوات المكتبية والمدرسية (لا يؤثر في المخزون إلا عند الاستلام الفعلي)
              </DialogDescription>
            </div>
          </div>
        </DialogHeader>

        <div className="flex-1 overflow-y-auto p-4 space-y-4">
          {/* Header Metadata Grid */}
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 p-3 bg-muted/20 border border-border rounded-xl text-xs">
            {/* Supplier Picker */}
            <div className="space-y-1">
              <Label className="text-xs font-bold flex items-center gap-1">
                <Building2 className="w-3.5 h-3.5 text-primary" />
                <span>المورد / دار النشر *</span>
              </Label>
              <Select value={supplierId} onValueChange={setSupplierId}>
                <SelectTrigger className="h-9 text-xs">
                  <SelectValue placeholder="اختر المورد..." />
                </SelectTrigger>
                <SelectContent dir="rtl">
                  {suppliers.map((s) => (
                    <SelectItem key={s.id} value={s.id}>
                      {s.name} {s.companyName ? `(${s.companyName})` : ''} - {s.supplierCode}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            {/* Order Date */}
            <div className="space-y-1">
              <Label className="text-xs font-bold flex items-center gap-1">
                <Calendar className="w-3.5 h-3.5 text-primary" />
                <span>تاريخ الطلب</span>
              </Label>
              <Input
                type="date"
                value={orderDate}
                onChange={(e) => setOrderDate(e.target.value)}
                className="h-9 text-xs"
              />
            </div>

            {/* Expected Delivery Date */}
            <div className="space-y-1">
              <Label className="text-xs font-bold flex items-center gap-1">
                <Truck className="w-3.5 h-3.5 text-primary" />
                <span>تاريخ التوريد المتوقع</span>
              </Label>
              <Input
                type="date"
                value={expectedDeliveryDate}
                onChange={(e) => setExpectedDeliveryDate(e.target.value)}
                className="h-9 text-xs"
              />
            </div>
          </div>

          {/* Barcode and Search Box */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
            {/* Quick Barcode Scanner */}
            <form onSubmit={handleBarcodeScan} className="relative">
              <Barcode className="w-4 h-4 absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
              <Input
                ref={barcodeInputRef}
                value={barcodeInput}
                onChange={(e) => setBarcodeInput(e.target.value)}
                placeholder="امسح باركود المنتج لإضافته فوراً (اضغط Enter)..."
                className="pr-9 h-9 text-xs"
              />
            </form>

            {/* Product Name Search */}
            <div className="relative">
              <Search className="w-4 h-4 absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
              <Input
                value={productSearch}
                onChange={(e) => setProductSearch(e.target.value)}
                placeholder="ابحث باسم الكتاب، القلم، أو الكشكول أو SKU..."
                className="pr-9 h-9 text-xs"
              />

              {searchResults.length > 0 && (
                <div className="absolute z-20 w-full mt-1 bg-white border border-border rounded-xl shadow-xl max-h-48 overflow-y-auto divide-y divide-border">
                  {searchResults.map((p) => (
                    <div
                      key={p.id}
                      onClick={() => handleAddProduct(p)}
                      className="p-2.5 hover:bg-muted/50 cursor-pointer flex justify-between items-center text-xs"
                    >
                      <div>
                        <div className="font-bold text-foreground">{p.name}</div>
                        <div className="text-[10px] text-muted-foreground font-mono">
                          SKU: {p.sku} | تكلفة الشراء: {number(p.purchasePrice || 0)} ج.م
                        </div>
                      </div>
                      <Button size="sm" variant="ghost" className="h-7 text-xs text-primary gap-1">
                        <Plus className="w-3 h-3" />
                        إضافة
                      </Button>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>

          {/* PO Line Items Table */}
          <div className="border border-border rounded-xl overflow-hidden">
            <div className="bg-muted/50 p-2.5 border-b border-border text-xs font-bold flex justify-between items-center">
              <span>أصناف أمر الشراء ({items.length} صنف)</span>
              <span className="text-[11px] text-muted-foreground">التكلفة والكمية المدخلة بالأسعار التاريخية للمشتريات</span>
            </div>

            {items.length === 0 ? (
              <div className="p-8 text-center text-xs text-muted-foreground">
                لم تتم إضافة أي أصناف حتى الآن. ابحث بالاسم أو امسح الباركود أعلاه.
              </div>
            ) : (
              <div className="divide-y divide-border max-h-60 overflow-y-auto">
                {items.map((item, idx) => (
                  <div key={idx} className="p-3 text-xs flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 hover:bg-muted/20">
                    <div className="flex-1">
                      <div className="font-bold text-sm text-foreground">{item.productNameSnapshot}</div>
                      <div className="text-[10px] text-muted-foreground font-mono mt-0.5">
                        SKU: {item.skuSnapshot}
                      </div>
                    </div>

                    {/* Controls */}
                    <div className="flex flex-wrap items-center gap-3">
                      {/* Quantity */}
                      <div className="space-y-1">
                        <Label className="text-[10px] text-muted-foreground block">الكمية</Label>
                        <Input
                          type="number"
                          min={1}
                          value={item.orderedQuantity}
                          onChange={(e) =>
                            setItems((prev) =>
                              prev.map((i, iIdx) =>
                                iIdx === idx ? { ...i, orderedQuantity: Math.max(1, Number(e.target.value) || 1) } : i
                              )
                            )
                          }
                          className="w-16 h-8 text-center text-xs font-bold"
                        />
                      </div>

                      {/* Unit Cost */}
                      <div className="space-y-1">
                        <Label className="text-[10px] text-muted-foreground block">سعر الشراء (ج.م)</Label>
                        <Input
                          type="number"
                          min={0}
                          step="0.1"
                          value={item.unitCost}
                          onChange={(e) =>
                            setItems((prev) =>
                              prev.map((i, iIdx) =>
                                iIdx === idx ? { ...i, unitCost: Math.max(0, Number(e.target.value) || 0) } : i
                              )
                            )
                          }
                          className="w-24 h-8 text-center text-xs font-bold"
                        />
                      </div>

                      {/* Line Total */}
                      <div className="space-y-1 text-left w-20">
                        <Label className="text-[10px] text-muted-foreground block">الإجمالي</Label>
                        <span className="font-bold text-sm text-foreground block pt-1">
                          {number(item.orderedQuantity * item.unitCost)} ج.م
                        </span>
                      </div>

                      {/* Delete */}
                      <Button
                        size="sm"
                        variant="ghost"
                        className="h-8 w-8 p-0 text-destructive mt-3"
                        onClick={() => setItems((prev) => prev.filter((_, iIdx) => iIdx !== idx))}
                      >
                        <Trash2 className="w-4 h-4" />
                      </Button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Landed Costs & Notes Box */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            {/* Additional Landed Costs & Notes */}
            <div className="p-3 bg-muted/20 border border-border rounded-xl space-y-2 text-xs">
              <div className="font-bold text-foreground">مصاريف الشحن والتكاليف الإضافية (Landed Costs):</div>
              <div className="grid grid-cols-2 gap-2">
                <div className="space-y-1">
                  <Label className="text-[11px] text-muted-foreground">مصاريف الشحن والنقل (ج.م):</Label>
                  <Input
                    type="number"
                    min={0}
                    value={shippingCost}
                    onChange={(e) => setShippingCost(Number(e.target.value) || 0)}
                    className="h-8 text-xs font-semibold"
                  />
                </div>
                <div className="space-y-1">
                  <Label className="text-[11px] text-muted-foreground">مصاريف أخرى (تحميل/تخليص):</Label>
                  <Input
                    type="number"
                    min={0}
                    value={otherCosts}
                    onChange={(e) => setOtherCosts(Number(e.target.value) || 0)}
                    className="h-8 text-xs font-semibold"
                  />
                </div>
              </div>
              <div className="space-y-1 pt-1">
                <Label className="text-[11px] text-muted-foreground">ملاحظات أمر الشراء:</Label>
                <Input
                  value={notes}
                  onChange={(e) => setNotes(e.target.value)}
                  placeholder="تعليمات التوريد، شروط الدفع، موقع التفريغ..."
                  className="h-8 text-xs"
                />
              </div>
            </div>

            {/* Financial Summary */}
            <div className="p-3 bg-muted/40 border border-border rounded-xl space-y-1.5 text-xs">
              <div className="font-bold text-foreground border-b border-border pb-1">ملخص أمر الشراء:</div>
              <div className="flex justify-between text-muted-foreground">
                <span>إجمالي البضاعة الأساسية:</span>
                <span>{number(totals.subtotal)} ج.م</span>
              </div>
              <div className="flex justify-between text-muted-foreground">
                <span>مصاريف الشحن والتكاليف الإضافية:</span>
                <span>+{number(Number(shippingCost || 0) + Number(otherCosts || 0))} ج.م</span>
              </div>
              <div className="flex justify-between items-center pt-2 border-t border-border font-bold text-base text-foreground">
                <span>القيمة الإجمالية للطلب:</span>
                <span className="text-primary font-black">{number(totals.grandTotal)} ج.م</span>
              </div>
              <div className="text-[10px] text-muted-foreground pt-1">
                * يتم توزيع مصاريف الشحن على الأصناف تلقائياً عند الاستلام الفعلي لاحتساب الـ WAC بدقة.
              </div>
            </div>
          </div>
        </div>

        <DialogFooter className="p-4 border-t border-border bg-muted/20 flex items-center justify-between sm:justify-between">
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={() => onOpenChange(false)}
            disabled={isSubmitting}
          >
            إلغاء
          </Button>

          <Button
            type="button"
            size="sm"
            disabled={isSubmitting || items.length === 0 || !supplierId}
            onClick={handleSubmit}
            className="font-bold px-6 gap-2"
          >
            <ShoppingCart className="w-4 h-4" />
            <span>{isSubmitting ? 'جارِ الحفظ...' : 'حفظ كمسودة أمر شراء'}</span>
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};
