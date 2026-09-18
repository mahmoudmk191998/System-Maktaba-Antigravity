import React, { useState, useEffect, useMemo } from 'react';
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
  RotateCcw,
  Package,
  AlertTriangle,
  Building2,
  DollarSign,
  FileText,
} from 'lucide-react';
import { toast } from 'sonner';
import { db } from '@/lib/firebase';
import { collection, query, where, getDocs, doc, getDoc } from 'firebase/firestore';
import { usePurchaseReturns } from '@/hooks/retail/usePurchaseReturns';
import { useAppStore } from '@/lib/store';
import { useFormatters } from '@/lib/formatters';
import { getBranchStockDocId } from '@/services/inventory/retailInventory.service';
import type { GoodsReceipt, PurchaseReturn } from '@/types/retail.types';
import type { PurchaseReturnLineInput } from '@/services/purchasing/purchaseReturns.service';

interface PurchaseReturnModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  goodsReceipt: GoodsReceipt | null;
  onSuccess?: (pr: PurchaseReturn) => void;
}

const PURCHASE_RETURN_REASONS = [
  { id: 'damaged_delivery', label: 'بضاعة تالفة أو معيبة بعد الفتح' },
  { id: 'wrong_specification', label: 'مخالفة للمواصفات أو الطبعة المطلوبة' },
  { id: 'excess_stock', label: 'فائض عن حاجة المخزن متفق على إرجاعه' },
  { id: 'near_expiry', label: 'قرب انتهاء الصلاحية أو انتهاء الموسم الدراسي' },
  { id: 'pricing_dispute', label: 'خلاف على سعر الفاتورة أو الخصم المتفق عليه' },
  { id: 'other', label: 'سبب آخر' },
];

export const PurchaseReturnModal: React.FC<PurchaseReturnModalProps> = ({
  open,
  onOpenChange,
  goodsReceipt,
  onSuccess,
}) => {
  const { number } = useFormatters();
  const currentTenant = useAppStore((state) => state.currentTenant);
  const currentUser = useAppStore((state) => state.currentUser);
  const { processReturn, loading } = usePurchaseReturns();

  const [generalReason, setGeneralReason] = useState('damaged_delivery');
  const [notes, setNotes] = useState('');

  // Already returned mapping: productId -> baseQty
  const [alreadyReturnedMap, setAlreadyReturnedMap] = useState<Map<string, number>>(new Map());
  // On hand stock mapping: productId -> onHandQty
  const [onHandStockMap, setOnHandStockMap] = useState<Map<string, number>>(new Map());
  const [fetchingStock, setFetchingStock] = useState(false);

  // Line return selections: goodsReceiptItemId -> quantity
  const [returnLines, setReturnLines] = useState<
    Map<string, { quantity: number; reason: string }>
  >(new Map());

  // Load previous returns and current on-hand stock
  useEffect(() => {
    if (!open || !goodsReceipt || !currentTenant?.id) return;

    let isMounted = true;
    setFetchingStock(true);

    const loadData = async () => {
      try {
        // 1. Query previous returns for this GRN
        const qReturns = query(
          collection(db, 'purchase_returns'),
          where('tenantId', '==', currentTenant.id),
          where('goodsReceiptId', '==', goodsReceipt.id)
        );
        const snapReturns = await getDocs(qReturns);
        const retMap = new Map<string, number>();

        snapReturns.docs.forEach((d) => {
          const ret = d.data() as PurchaseReturn;
          if (ret.status !== 'cancelled') {
            ret.items?.forEach((ri) => {
              const key = ri.productId + (ri.variantId ? `_${ri.variantId}` : '');
              const prev = retMap.get(key) || 0;
              retMap.set(key, prev + (ri.returnBaseQuantity || 0));
            });
          }
        });

        // 2. Query current on-hand stock for all items
        const stockMap = new Map<string, number>();
        for (const item of goodsReceipt.items) {
          const stockDocId = getBranchStockDocId(
            currentTenant.id,
            goodsReceipt.destinationLocationId,
            item.productId,
            item.variantId || null
          );
          const stockSnap = await getDoc(doc(db, 'branch_stock', stockDocId));
          const key = item.productId + (item.variantId ? `_${item.variantId}` : '');
          if (stockSnap.exists()) {
            const data = stockSnap.data();
            stockMap.set(key, Number(data.onHandQuantity ?? data.quantity ?? 0));
          } else {
            stockMap.set(key, 0);
          }
        }

        if (isMounted) {
          setAlreadyReturnedMap(retMap);
          setOnHandStockMap(stockMap);

          // Initialize return lines with 0
          const initialMap = new Map();
          goodsReceipt.items.forEach((i) => {
            initialMap.set(i.purchaseOrderItemId, {
              quantity: 0,
              reason: 'damaged_delivery',
            });
          });
          setReturnLines(initialMap);
        }
      } catch (err) {
        console.error('Error loading purchase return data:', err);
      } finally {
        if (isMounted) setFetchingStock(false);
      }
    };

    loadData();
    return () => {
      isMounted = false;
    };
  }, [open, goodsReceipt, currentTenant?.id]);

  // Live financial preview
  const totals = useMemo(() => {
    if (!goodsReceipt) return { totalCredit: 0, totalReturnUnits: 0 };

    let totalCredit = 0;
    let totalReturnUnits = 0;

    goodsReceipt.items.forEach((item) => {
      const line = returnLines.get(item.purchaseOrderItemId);
      const qty = Number(line?.quantity || 0);
      if (qty > 0) {
        totalReturnUnits += qty;
        const conv = Math.max(1, item.conversionFactor || 1);
        const reqBase = qty * conv;
        const effectiveCost = item.effectiveUnitCost || item.unitPurchaseCost / conv;
        totalCredit += reqBase * effectiveCost;
      }
    });

    return {
      totalCredit: Math.round(totalCredit * 100) / 100,
      totalReturnUnits,
    };
  }, [goodsReceipt, returnLines]);

  const handleSubmit = async () => {
    if (!goodsReceipt) return;
    if (totals.totalReturnUnits <= 0) {
      toast.error('يرجى تحديد كمية مرتجعة واحدة على الأقل');
      return;
    }

    const itemsToSubmit: PurchaseReturnLineInput[] = [];
    goodsReceipt.items.forEach((item) => {
      const line = returnLines.get(item.purchaseOrderItemId);
      if (line && line.quantity > 0) {
        itemsToSubmit.push({
          goodsReceiptItemId: item.purchaseOrderItemId,
          productId: item.productId,
          variantId: item.variantId || null,
          returnQuantity: line.quantity,
          reason: line.reason || generalReason,
        });
      }
    });

    const clientReturnId = `pret_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`;

    const res = await processReturn({
      sourceLocationId: goodsReceipt.destinationLocationId,
      goodsReceiptId: goodsReceipt.id,
      items: itemsToSubmit,
      reason: generalReason,
      notes,
      processedBy: currentUser?.name || 'مسؤول المشتريات',
      clientReturnId,
    });

    if (res.success && res.purchaseReturn) {
      toast.success(`تم تسجيل مرتجع المشتريات بنجاح! رقم: ${res.purchaseReturn.returnNumber}`);
      onSuccess?.(res.purchaseReturn);
      onOpenChange(false);
    } else {
      toast.error(res.error || 'فشلت عملية إرجاع المشتريات للمورد');
    }
  };

  if (!goodsReceipt) return null;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-4xl max-h-[92vh] flex flex-col p-0 overflow-hidden" dir="rtl">
        <DialogHeader className="p-4 border-b border-border bg-amber-500/10">
          <div className="flex items-center gap-3">
            <div className="p-2 rounded-xl bg-amber-600 text-white shadow-sm">
              <RotateCcw className="w-5 h-5" />
            </div>
            <div>
              <DialogTitle className="text-lg font-bold flex items-center gap-2">
                <span>إنشاء مرتجع مشتريات للمورد (Purchase Return)</span>
                <Badge variant="outline" className="bg-amber-100 text-amber-900 border-amber-300 font-bold">
                  من الإذن: {goodsReceipt.receiptNumber}
                </Badge>
              </DialogTitle>
              <DialogDescription className="text-xs text-muted-foreground mt-0.5">
                المورد: <strong className="text-foreground">{goodsReceipt.supplierNameSnapshot}</strong> | يخفض رصيد
                المورد بالقيمة الصافية الأصلية ويخصم الكمية من المخزون
              </DialogDescription>
            </div>
          </div>
        </DialogHeader>

        <div className="flex-1 overflow-y-auto p-4 space-y-4">
          {/* General Reason Picker */}
          <div className="p-3 bg-muted/20 border border-border rounded-xl flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 text-xs">
            <div className="space-y-1 flex-1">
              <Label className="text-xs font-bold block">سبب الإرجاع الرئيسي:</Label>
              <Select value={generalReason} onValueChange={setGeneralReason}>
                <SelectTrigger className="h-8 text-xs">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent dir="rtl">
                  {PURCHASE_RETURN_REASONS.map((r) => (
                    <SelectItem key={r.id} value={r.id}>
                      {r.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-1 flex-1">
              <Label className="text-xs font-bold block">ملاحظات إضافية للمرتجع:</Label>
              <Input
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                placeholder="رقم محضر الفحص، اسم مندوب المورد..."
                className="h-8 text-xs"
              />
            </div>
          </div>

          {/* Items Table with Available Stock Safety Protection */}
          <div className="border border-border rounded-xl overflow-hidden">
            <div className="bg-muted/50 p-2.5 border-b border-border text-xs font-bold flex justify-between items-center">
              <span>الأصناف المستلمة والكميات المتاحة للإرجاع</span>
              <span className="text-[11px] text-muted-foreground">
                (يتم فحص الرصيد الفعلي الحالي في المستودع لمنع الرصيد السالب)
              </span>
            </div>

            <div className="divide-y divide-border max-h-60 overflow-y-auto">
              {goodsReceipt.items.map((item) => {
                const conv = Math.max(1, item.conversionFactor || 1);
                const itemKey = item.productId + (item.variantId ? `_${item.variantId}` : '');
                const acceptedUnits = item.acceptedQuantity;
                const alreadyReturnedUnits = (alreadyReturnedMap.get(itemKey) || 0) / conv;
                const remainingReceivableUnits = Math.max(0, acceptedUnits - alreadyReturnedUnits);

                const currentOnHandUnits = (onOnHandStockMap.get(itemKey) || 0) / conv;

                // Max allowed return is capped by both: remaining returnable from GRN, and actual on-hand stock!
                const maxSafeReturnUnits = Math.max(0, Math.min(remainingReceivableUnits, currentOnHandUnits));

                const line = returnLines.get(item.purchaseOrderItemId) || {
                  quantity: 0,
                  reason: generalReason,
                };

                const isStockConstrained = currentOnHandUnits < remainingReceivableUnits;

                return (
                  <div
                    key={item.purchaseOrderItemId}
                    className="p-3 text-xs flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 hover:bg-muted/20"
                  >
                    <div className="flex-1">
                      <div className="font-bold text-sm text-foreground">{item.productNameSnapshot}</div>
                      <div className="text-[10px] text-muted-foreground font-mono mt-0.5">
                        SKU: {item.skuSnapshot} | التكلفة الفعالة للوحدة: {number(item.effectiveUnitCost * conv)} ج.م
                      </div>

                      <div className="flex flex-wrap items-center gap-3 text-[11px] mt-1 text-muted-foreground">
                        <span>
                          استلم سليم: <strong className="text-foreground">{acceptedUnits}</strong>
                        </span>
                        <span>
                          أُرجع سابقاً: <strong className="text-amber-600">{alreadyReturnedUnits}</strong>
                        </span>
                        <span>
                          المخزون الحالي بالمستودع:{' '}
                          <strong className={currentOnHandUnits <= 0 ? 'text-destructive font-bold' : 'text-foreground'}>
                            {currentOnHandUnits}
                          </strong>
                        </span>
                        <span>
                          أقصى كمية مسموح إرجاعها:{' '}
                          <strong className="text-emerald-600 font-bold">{maxSafeReturnUnits}</strong>
                        </span>
                      </div>

                      {isStockConstrained && (
                        <div className="text-[10px] text-amber-700 flex items-center gap-1 mt-1">
                          <AlertTriangle className="w-3 h-3 text-amber-600" />
                          <span>
                            تم تقييد الإرجاع بالرصيد المتاح حالياً ({currentOnHandUnits}) بسبب بيع جزء من الشحنة.
                          </span>
                        </div>
                      )}
                    </div>

                    {/* Return Quantity Controls */}
                    <div className="flex items-center gap-3 shrink-0">
                      <div className="space-y-1">
                        <Label className="text-[10px] text-amber-800 block font-semibold">كمية المرتجع</Label>
                        <Input
                          type="number"
                          min={0}
                          max={maxSafeReturnUnits}
                          value={line.quantity}
                          disabled={maxSafeReturnUnits <= 0}
                          onChange={(e) => {
                            const val = Math.max(0, Number(e.target.value) || 0);
                            const safe = Math.min(val, maxSafeReturnUnits);
                            setReturnLines((prev) => {
                              const next = new Map(prev);
                              next.set(item.purchaseOrderItemId, {
                                ...line,
                                quantity: safe,
                              });
                              return next;
                            });
                          }}
                          className="w-20 h-8 text-center text-xs font-bold border-amber-500/40 bg-amber-500/5 text-amber-800"
                        />
                      </div>

                      <div className="space-y-1 text-left w-24">
                        <Label className="text-[10px] text-muted-foreground block">قيمة الخصم</Label>
                        <span className="font-bold text-sm text-destructive block pt-1">
                          -{number(line.quantity * (item.effectiveUnitCost * conv))} ج.م
                        </span>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>

          {/* Financial Summary */}
          <div className="p-3 bg-muted/40 border border-border rounded-xl flex items-center justify-between text-xs">
            <div>
              <span className="text-muted-foreground block">إجمالي القطع المرتجعة:</span>
              <span className="font-bold text-foreground text-sm">{totals.totalReturnUnits} قطعة</span>
            </div>
            <div className="text-left">
              <span className="text-muted-foreground block">إجمالي إشعار الخصم من حساب المورد (Supplier Credit):</span>
              <span className="font-black text-destructive text-lg">-{number(totals.totalCredit)} ج.م</span>
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
            disabled={loading || totals.totalReturnUnits <= 0}
            onClick={handleSubmit}
            className="font-bold px-6 gap-2 bg-amber-600 hover:bg-amber-700 text-white"
          >
            <RotateCcw className="w-4 h-4" />
            <span>{loading ? 'جارِ معالجة المرتجع...' : `تأكيد إرجاع ${totals.totalReturnUnits} قطعة للمورد`}</span>
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};
