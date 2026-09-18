import React, { useState, useEffect, useMemo, useRef } from 'react';
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
  PackageCheck,
  Barcode,
  Search,
  Truck,
  Building2,
  Calendar,
  AlertTriangle,
  AlertOctagon,
  CheckCircle2,
  DollarSign,
  TrendingUp,
} from 'lucide-react';
import { toast } from 'sonner';
import { useGoodsReceiving } from '@/hooks/retail/useGoodsReceiving';
import { useAppStore } from '@/lib/store';
import { useFormatters } from '@/lib/formatters';
import type { PurchaseOrder, GoodsReceipt } from '@/types/retail.types';
import type { ReceiveLineItemInput } from '@/services/purchasing/goodsReceiving.service';

interface GoodsReceiptModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  purchaseOrder: PurchaseOrder | null;
  onSuccess?: (grn: GoodsReceipt) => void;
}

export const GoodsReceiptModal: React.FC<GoodsReceiptModalProps> = ({
  open,
  onOpenChange,
  purchaseOrder,
  onSuccess,
}) => {
  const { number } = useFormatters();
  const currentUser = useAppStore((state) => state.currentUser);
  const { processReceipt, loading } = useGoodsReceiving();

  // Receipt details
  const [supplierInvoiceNumber, setSupplierInvoiceNumber] = useState('');
  const [supplierDeliveryNote, setSupplierDeliveryNote] = useState('');
  const [extraCosts, setExtraCosts] = useState<number>(0);
  const [notes, setNotes] = useState('');

  // Line receiving state: poItemId -> ReceiveLineItemInput
  const [receiptLines, setReceiptLines] = useState<Map<string, ReceiveLineItemInput>>(new Map());

  // Barcode scanner input
  const [barcodeInput, setBarcodeInput] = useState('');
  const barcodeInputRef = useRef<HTMLInputElement>(null);

  // Initialize lines based on remaining receivable quantity
  useEffect(() => {
    if (!open || !purchaseOrder) return;

    setSupplierInvoiceNumber(purchaseOrder.supplierInvoiceNumber || '');
    setExtraCosts(Number(purchaseOrder.shippingCost || 0) + Number(purchaseOrder.otherCosts || 0));

    const initialMap = new Map<string, ReceiveLineItemInput>();
    purchaseOrder.items.forEach((item) => {
      const conv = Math.max(1, item.conversionFactor || 1);
      const remainingBase = item.orderedBaseQuantity - (item.receivedBaseQuantity || 0);
      const remainingUnits = Math.max(0, remainingBase / conv);

      initialMap.set(item.id, {
        purchaseOrderItemId: item.id,
        receivedQuantity: remainingUnits,
        acceptedQuantity: remainingUnits, // Default to receiving sound goods
        rejectedQuantity: 0,
        rejectionReason: '',
        unitPurchaseCost: item.unitCost,
      });
    });

    setReceiptLines(initialMap);
  }, [open, purchaseOrder]);

  // Barcode scanning handler
  const handleBarcodeScan = (e: React.FormEvent) => {
    e.preventDefault();
    if (!barcodeInput.trim() || !purchaseOrder) return;
    const barcode = barcodeInput.trim();

    const matchedItem = purchaseOrder.items.find(
      (item) => item.skuSnapshot === barcode || (item as any).barcode === barcode || item.supplierSku === barcode
    );

    if (!matchedItem) {
      toast.error('هذا الصنف غير موجود في أمر الشراء الحالي!', {
        description: `الباركود: ${barcode}`,
      });
      setBarcodeInput('');
      return;
    }

    const conv = Math.max(1, matchedItem.conversionFactor || 1);
    const remainingBase = matchedItem.orderedBaseQuantity - (matchedItem.receivedBaseQuantity || 0);
    const maxRemaining = Math.max(0, remainingBase / conv);

    setReceiptLines((prev) => {
      const next = new Map(prev);
      const current = next.get(matchedItem.id) || {
        purchaseOrderItemId: matchedItem.id,
        receivedQuantity: 0,
        acceptedQuantity: 0,
        rejectedQuantity: 0,
        rejectionReason: '',
        unitPurchaseCost: matchedItem.unitCost,
      };

      const newAccepted = Math.min(current.acceptedQuantity + 1, maxRemaining);
      next.set(matchedItem.id, {
        ...current,
        acceptedQuantity: newAccepted,
        receivedQuantity: newAccepted + (current.rejectedQuantity || 0),
      });
      return next;
    });

    toast.success(`تم اختيار: ${matchedItem.productNameSnapshot}`);
    setBarcodeInput('');
    barcodeInputRef.current?.focus();
  };

  // Live calculations
  const totals = useMemo(() => {
    if (!purchaseOrder) return { subtotal: 0, totalLiability: 0, totalAcceptedQty: 0, totalRejectedQty: 0 };

    let subtotal = 0;
    let totalAcceptedQty = 0;
    let totalRejectedQty = 0;

    receiptLines.forEach((line) => {
      const accepted = Number(line.acceptedQuantity || 0);
      const rejected = Number(line.rejectedQuantity || 0);
      const cost = Number(line.unitPurchaseCost || 0);

      subtotal += accepted * cost;
      totalAcceptedQty += accepted;
      totalRejectedQty += rejected;
    });

    const totalLiability = subtotal + Number(extraCosts || 0);

    return {
      subtotal: Math.round(subtotal * 100) / 100,
      totalLiability: Math.round(totalLiability * 100) / 100,
      totalAcceptedQty,
      totalRejectedQty,
    };
  }, [purchaseOrder, receiptLines, extraCosts]);

  const handleSubmit = async () => {
    if (!purchaseOrder) return;
    if (totals.totalAcceptedQty <= 0 && totals.totalRejectedQty <= 0) {
      toast.error('يرجى تحديد كمية مستلمة واحدة على الأقل');
      return;
    }

    const itemsToSubmit: ReceiveLineItemInput[] = Array.from(receiptLines.values()).filter(
      (line) => (line.acceptedQuantity || 0) > 0 || (line.rejectedQuantity || 0) > 0
    );

    const clientReceiptId = `grn_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`;

    const res = await processReceipt({
      destinationLocationId: purchaseOrder.destinationLocationId,
      purchaseOrderId: purchaseOrder.id,
      supplierInvoiceNumber,
      supplierDeliveryNote,
      receivedBy: currentUser?.name || 'أمين المستودع',
      items: itemsToSubmit,
      extraCosts: Number(extraCosts) || 0,
      notes,
      clientReceiptId,
    });

    if (res.success && res.goodsReceipt) {
      toast.success(`تم استلام البضاعة وتحديث المخزون بنجاح! رقم الإذن: ${res.goodsReceipt.receiptNumber}`);
      onSuccess?.(res.goodsReceipt);
      onOpenChange(false);
    } else {
      toast.error(res.error || 'فشلت عملية استلام البضاعة');
    }
  };

  if (!purchaseOrder) return null;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-4xl max-h-[92vh] flex flex-col p-0 overflow-hidden" dir="rtl">
        <DialogHeader className="p-4 border-b border-border bg-emerald-500/10">
          <div className="flex items-center gap-3">
            <div className="p-2 rounded-xl bg-emerald-600 text-white shadow-sm">
              <PackageCheck className="w-5 h-5" />
            </div>
            <div>
              <DialogTitle className="text-lg font-bold flex items-center gap-2">
                <span>فحص واستلام بضاعة (Goods Receiving - GRN)</span>
                <Badge variant="outline" className="bg-emerald-100 text-emerald-900 border-emerald-300 font-bold">
                  {purchaseOrder.purchaseOrderNumber}
                </Badge>
              </DialogTitle>
              <DialogDescription className="text-xs text-muted-foreground mt-0.5">
                المورد: <strong className="text-foreground">{purchaseOrder.supplierNameSnapshot}</strong> | الوجهة:{' '}
                {purchaseOrder.destinationLocationId} | البضاعة السليمة تزيد المخزون وتعيد احتساب الـ WAC
              </DialogDescription>
            </div>
          </div>
        </DialogHeader>

        <div className="flex-1 overflow-y-auto p-4 space-y-4">
          {/* Metadata & Supplier Invoices */}
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 p-3 bg-muted/20 border border-border rounded-xl text-xs">
            <div className="space-y-1">
              <Label className="text-xs font-bold block">رقم فاتورة المورد (Supplier Invoice):</Label>
              <Input
                value={supplierInvoiceNumber}
                onChange={(e) => setSupplierInvoiceNumber(e.target.value)}
                placeholder="رقم الفاتورة الورقية..."
                className="h-8 text-xs font-mono"
              />
            </div>

            <div className="space-y-1">
              <Label className="text-xs font-bold block">رقم إذن تسليم المورد (Delivery Note):</Label>
              <Input
                value={supplierDeliveryNote}
                onChange={(e) => setSupplierDeliveryNote(e.target.value)}
                placeholder="رقم بوليصة الشحن/التسليم..."
                className="h-8 text-xs font-mono"
              />
            </div>

            <div className="space-y-1">
              <Label className="text-xs font-bold block">تكاليف الشحن الإضافية (Landed Cost):</Label>
              <Input
                type="number"
                min={0}
                value={extraCosts}
                onChange={(e) => setExtraCosts(Number(e.target.value) || 0)}
                className="h-8 text-xs font-semibold"
              />
            </div>
          </div>

          {/* Quick Barcode Scanner */}
          <form onSubmit={handleBarcodeScan} className="relative">
            <Barcode className="w-4 h-4 absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
            <Input
              ref={barcodeInputRef}
              value={barcodeInput}
              onChange={(e) => setBarcodeInput(e.target.value)}
              placeholder="امسح باركود المنتج لزيادة الكمية السليمة المقبولة تلقائياً..."
              className="pr-9 h-9 text-xs"
            />
          </form>

          {/* PO Items Table */}
          <div className="border border-border rounded-xl overflow-hidden">
            <div className="bg-muted/50 p-2.5 border-b border-border text-xs font-bold flex justify-between items-center">
              <span>أصناف أمر الشراء والكميات المتبقية للاستلام</span>
              <span className="text-[11px] text-muted-foreground">
                (البضاعة التالفة لا تدخل المخزون وتسجل كعجز مورد)
              </span>
            </div>

            <div className="divide-y divide-border max-h-60 overflow-y-auto">
              {purchaseOrder.items.map((item) => {
                const conv = Math.max(1, item.conversionFactor || 1);
                const orderedUnits = item.orderedQuantity;
                const receivedUnits = (item.receivedBaseQuantity || 0) / conv;
                const remainingUnits = Math.max(0, orderedUnits - receivedUnits);

                const lineState = receiptLines.get(item.id) || {
                  purchaseOrderItemId: item.id,
                  receivedQuantity: 0,
                  acceptedQuantity: 0,
                  rejectedQuantity: 0,
                  rejectionReason: '',
                  unitPurchaseCost: item.unitCost,
                };

                const isFullyReceived = remainingUnits <= 0;

                return (
                  <div
                    key={item.id}
                    className={`p-3 text-xs flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 ${
                      isFullyReceived ? 'bg-muted/40 opacity-60' : 'hover:bg-muted/20'
                    }`}
                  >
                    <div className="flex-1">
                      <div className="font-bold text-sm text-foreground flex items-center gap-2">
                        <span>{item.productNameSnapshot}</span>
                        {isFullyReceived && (
                          <Badge variant="secondary" className="text-[10px]">
                            مستلم بالكامل
                          </Badge>
                        )}
                      </div>
                      <div className="text-[10px] text-muted-foreground font-mono mt-0.5">
                        SKU: {item.skuSnapshot} | سعر الوحدة: {number(item.unitCost)} ج.م
                      </div>
                      <div className="flex items-center gap-3 text-[11px] mt-1 text-muted-foreground">
                        <span>
                          مطلوب: <strong className="text-foreground">{orderedUnits}</strong>
                        </span>
                        <span>
                          مستلم سابقاً: <strong className="text-emerald-600">{receivedUnits}</strong>
                        </span>
                        <span>
                          متبقي: <strong className="text-primary font-bold">{remainingUnits}</strong>
                        </span>
                      </div>
                    </div>

                    {!isFullyReceived && (
                      <div className="flex flex-wrap items-center gap-3 shrink-0">
                        {/* Accepted Sound Qty */}
                        <div className="space-y-1">
                          <Label className="text-[10px] text-emerald-700 block font-semibold">
                            السليم المقبول (يدخل المخزن)
                          </Label>
                          <Input
                            type="number"
                            min={0}
                            max={remainingUnits}
                            value={lineState.acceptedQuantity}
                            onChange={(e) => {
                              const val = Math.max(0, Number(e.target.value) || 0);
                              setReceiptLines((prev) => {
                                const next = new Map(prev);
                                next.set(item.id, {
                                  ...lineState,
                                  acceptedQuantity: Math.min(val, remainingUnits),
                                  receivedQuantity: Math.min(val, remainingUnits) + (lineState.rejectedQuantity || 0),
                                });
                                return next;
                              });
                            }}
                            className="w-20 h-8 text-center text-xs font-bold border-emerald-500/40 bg-emerald-500/5 text-emerald-700"
                          />
                        </div>

                        {/* Damaged / Rejected Qty */}
                        <div className="space-y-1">
                          <Label className="text-[10px] text-red-700 block font-semibold">
                            تالف / مرفوض (لا يدخل)
                          </Label>
                          <Input
                            type="number"
                            min={0}
                            value={lineState.rejectedQuantity}
                            onChange={(e) => {
                              const val = Math.max(0, Number(e.target.value) || 0);
                              setReceiptLines((prev) => {
                                const next = new Map(prev);
                                next.set(item.id, {
                                  ...lineState,
                                  rejectedQuantity: val,
                                  receivedQuantity: (lineState.acceptedQuantity || 0) + val,
                                });
                                return next;
                              });
                            }}
                            className="w-20 h-8 text-center text-xs font-bold border-red-500/40 bg-red-500/5 text-red-700"
                          />
                        </div>

                        {/* Rejection Reason (if rejected > 0) */}
                        {Number(lineState.rejectedQuantity || 0) > 0 && (
                          <div className="space-y-1">
                            <Label className="text-[10px] text-red-700 block">سبب التلف / الرفض</Label>
                            <Input
                              value={lineState.rejectionReason}
                              onChange={(e) => {
                                const val = e.target.value;
                                setReceiptLines((prev) => {
                                  const next = new Map(prev);
                                  next.set(item.id, { ...lineState, rejectionReason: val });
                                  return next;
                                });
                              }}
                              placeholder="كسر، بلل، طبعة باهتة..."
                              className="w-32 h-8 text-xs border-red-300"
                            />
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          </div>

          {/* Notes & Summary */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div className="p-3 bg-muted/20 border border-border rounded-xl space-y-2 text-xs">
              <Label className="text-xs font-bold block">ملاحظات الاستلام والفحص:</Label>
              <Input
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                placeholder="حالة الطرود، اسم السائق، ملاحظات التغليف..."
                className="h-8 text-xs"
              />
              <div className="text-[11px] text-muted-foreground pt-1">
                * يتم تسجيل حركة المخزون بنوع <code>purchase_receive</code> وتحديث التكلفة المتوسطة WAC فوراً.
              </div>
            </div>

            <div className="p-3 bg-muted/40 border border-border rounded-xl space-y-1.5 text-xs">
              <div className="font-bold text-foreground border-b border-border pb-1">ملخص الاستلام المالي:</div>
              <div className="flex justify-between text-muted-foreground">
                <span>قيمة البضاعة السليمة المقبولة:</span>
                <span>{number(totals.subtotal)} ج.م</span>
              </div>
              <div className="flex justify-between text-muted-foreground">
                <span>مصاريف الشحن والتكاليف المضافة:</span>
                <span>+{number(extraCosts)} ج.م</span>
              </div>
              <div className="flex justify-between items-center pt-2 border-t border-border font-bold text-base text-foreground">
                <span>إجمالي التزام المورد المالي (Payable):</span>
                <span className="text-emerald-600 font-black">{number(totals.totalLiability)} ج.م</span>
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
            disabled={loading}
          >
            إلغاء
          </Button>

          <Button
            type="button"
            size="sm"
            disabled={loading || (totals.totalAcceptedQty <= 0 && totals.totalRejectedQty <= 0)}
            onClick={handleSubmit}
            className="font-bold px-6 gap-2 bg-emerald-600 hover:bg-emerald-700 text-white"
          >
            <PackageCheck className="w-4 h-4" />
            <span>{loading ? 'جارِ معالجة وتحديث المخزون...' : `تأكيد استلام ${totals.totalAcceptedQty} قطعة وتحديث المخزون`}</span>
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};
