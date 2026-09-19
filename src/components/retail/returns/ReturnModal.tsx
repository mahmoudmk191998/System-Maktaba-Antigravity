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
import { Checkbox } from '@/components/ui/checkbox';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  RotateCcw,
  RefreshCw,
  Barcode,
  Search,
  Plus,
  Minus,
  Trash2,
  AlertTriangle,
  CheckCircle2,
  Printer,
  ShoppingBag,
  DollarSign,
  PackageCheck,
  ShieldAlert,
} from 'lucide-react';
import { toast } from 'sonner';
import { db } from '@/lib/firebase';
import { collection, query, where, getDocs } from 'firebase/firestore';
import type {
  Sale,
  SaleItem,
  SaleReturn,
  SaleExchange,
  SaleReturnCondition,
  PaymentMethodType,
} from '@/types/retail.types';
import { useSaleReturns } from '@/hooks/retail/useSaleReturns';
import { useProducts } from '@/hooks/retail/useProducts';
import { useAppStore } from '@/lib/store';
import { useFormatters } from '@/lib/formatters';
import { ReturnReceiptDialog } from './ReturnReceiptDialog';

interface ReturnModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  sale: Sale | null;
  onSuccess?: (saleReturn: SaleReturn) => void;
}

const RETURN_REASONS = [
  { id: 'customer_changed_mind', label: 'تراجع العميل عن الشراء' },
  { id: 'wrong_item', label: 'صنف غير مطلوب' },
  { id: 'defective', label: 'عيب صناعة / غير صالح' },
  { id: 'damaged', label: 'تالف أو مكسور' },
  { id: 'wrong_variant', label: 'مقاس أو طبعة أو لون غير مطابق' },
  { id: 'duplicate_purchase', label: 'شراء مكرر بالخطأ' },
  { id: 'quality_issue', label: 'ملاحظات على جودة الخامة أو الورق' },
  { id: 'other', label: 'سبب آخر' },
];

export const ReturnModal: React.FC<ReturnModalProps> = ({
  open,
  onOpenChange,
  sale,
  onSuccess,
}) => {
  const { number } = useFormatters();
  const currentTenant = useAppStore((state) => state.currentTenant);
  const currentBranch = useAppStore((state) => state.currentBranch);
  const activeCashierShift = useAppStore((state) => state.activeCashierShift);
  const currentUser = useAppStore((state) => state.currentUser);

  const { processReturn, processExchange, loading } = useSaleReturns();
  const { products } = useProducts();

  // Mode: 'return' or 'exchange'
  const [mode, setMode] = useState<'return' | 'exchange'>('return');

  // Concurrency tracking: already returned base quantities from previous returns
  const [alreadyReturnedMap, setAlreadyReturnedMap] = useState<Map<string, number>>(new Map());
  const [fetchingHistory, setFetchingHistory] = useState(false);

  // Selected items to return: saleItemId -> state
  const [selectedItems, setSelectedItems] = useState<
    Map<
      string,
      {
        selected: boolean;
        quantity: number;
        condition: SaleReturnCondition;
        restock: boolean;
        reason: string;
      }
    >
  >(new Map());

  // Exchange items (new products selected from catalog)
  const [exchangeCart, setExchangeCart] = useState<
    Array<{
      productId: string;
      productName: string;
      sku: string;
      barcode?: string;
      unitPrice: number;
      quantity: number;
      unitId: string;
      conversionFactor: number;
    }>
  >([]);

  // Search input for exchange catalog
  const [catalogSearch, setCatalogSearch] = useState('');

  // Barcode input for quick return scan
  const [barcodeInput, setBarcodeInput] = useState('');
  const barcodeInputRef = useRef<HTMLInputElement>(null);

  // Payment methods
  const [refundMethod, setRefundMethod] = useState<PaymentMethodType>('cash');
  const [differencePaymentMethod, setDifferencePaymentMethod] = useState<PaymentMethodType>('cash');
  const [notes, setNotes] = useState('');
  const [allowPolicyOverride, setAllowPolicyOverride] = useState(false);

  // Completed return for printing
  const [completedReturn, setCompletedReturn] = useState<SaleReturn | null>(null);
  const [showReceiptDialog, setShowReceiptDialog] = useState(false);

  // Load existing returns for this sale to compute remaining returnable quantity accurately
  useEffect(() => {
    if (!open || !sale || !currentTenant?.id) return;

    let isMounted = true;
    setFetchingHistory(true);

    const loadHistory = async () => {
      try {
        const q = query(
          collection(db, 'sale_returns'),
          where('tenantId', '==', currentTenant.id),
          where('saleId', '==', sale.id)
        );
        const snap = await getDocs(q);
        const map = new Map<string, number>();

        snap.docs.forEach((d) => {
          const ret = d.data() as SaleReturn;
          if (ret.status !== 'cancelled') {
            ret.items?.forEach((ri) => {
              const prev = map.get(ri.saleItemId) || 0;
              map.set(ri.saleItemId, prev + (ri.baseQuantity || ri.returnBaseQuantity || 0));
            });
          }
        });

        if (isMounted) {
          setAlreadyReturnedMap(map);

          // Initialize selected items state
          const initialMap = new Map();
          sale.items?.forEach((item) => {
            initialMap.set(item.id, {
              selected: false,
              quantity: 1,
              condition: 'resellable' as SaleReturnCondition,
              restock: true,
              reason: 'customer_changed_mind',
            });
          });
          setSelectedItems(initialMap);
        }
      } catch (err) {
        console.error('Failed to load sale returns history:', err);
      } finally {
        if (isMounted) setFetchingHistory(false);
      }
    };

    loadHistory();

    return () => {
      isMounted = false;
    };
  }, [open, sale, currentTenant?.id]);

  // Check if return window (14 days) is exceeded
  const isReturnWindowExceeded = useMemo(() => {
    if (!sale) return false;
    const saleDate = new Date(sale.completedAt || sale.createdAt).getTime();
    const daysElapsed = (Date.now() - saleDate) / (1000 * 60 * 60 * 24);
    return daysElapsed > 14;
  }, [sale]);

  // Barcode scanner handler: scans barcode against original sale items
  const handleBarcodeScan = (e: React.FormEvent) => {
    e.preventDefault();
    if (!barcodeInput.trim() || !sale) return;

    const trimmed = barcodeInput.trim();
    const matchedItem = sale.items?.find(
      (item) => item.barcodeSnapshot === trimmed || item.skuSnapshot === trimmed
    );

    if (!matchedItem) {
      toast.error('هذا الصنف غير موجود في الفاتورة الأصلية!', {
        description: `الباركود أو الـ SKU: ${trimmed}`,
      });
      setBarcodeInput('');
      return;
    }

    const conv = Math.max(1, matchedItem.conversionFactor || 1);
    const alreadyReturnedBase = alreadyReturnedMap.get(matchedItem.id) || 0;
    const remainingReturnable = Math.max(0, (matchedItem.baseQuantity - alreadyReturnedBase) / conv);

    if (remainingReturnable <= 0) {
      toast.error('تم إرجاع هذا الصنف بالكامل سابقاً');
      setBarcodeInput('');
      return;
    }

    // Toggle or increment
    setSelectedItems((prev) => {
      const next = new Map(prev);
      const current = next.get(matchedItem.id) || {
        selected: false,
        quantity: 0,
        condition: 'resellable' as SaleReturnCondition,
        restock: true,
        reason: 'customer_changed_mind',
      };

      const newQty = current.selected ? Math.min(current.quantity + 1, remainingReturnable) : 1;
      next.set(matchedItem.id, {
        ...current,
        selected: true,
        quantity: newQty,
      });
      return next;
    });

    toast.success(`تم تحديد الصنف: ${matchedItem.productNameSnapshot}`);
    setBarcodeInput('');
    barcodeInputRef.current?.focus();
  };

  // Toggle item selection
  const handleToggleSelect = (itemId: string) => {
    setSelectedItems((prev) => {
      const next = new Map(prev);
      const cur = next.get(itemId);
      if (cur) {
        next.set(itemId, { ...cur, selected: !cur.selected });
      }
      return next;
    });
  };

  // Update item return attributes
  const handleUpdateItem = (
    itemId: string,
    updates: Partial<{
      quantity: number;
      condition: SaleReturnCondition;
      restock: boolean;
      reason: string;
    }>
  ) => {
    setSelectedItems((prev) => {
      const next = new Map(prev);
      const cur = next.get(itemId);
      if (cur) {
        const updated = { ...cur, ...updates };
        // Auto restock logic based on condition
        if (updates.condition) {
          if (updates.condition === 'damaged' || updates.condition === 'defective') {
            updated.restock = false;
          } else if (updates.condition === 'resellable' || updates.condition === 'opened') {
            updated.restock = true;
          }
        }
        next.set(itemId, updated);
      }
      return next;
    });
  };

  // Live Financial Computations
  const returnTotals = useMemo(() => {
    if (!sale) {
      return { subtotalReturned: 0, discountReversed: 0, taxReversed: 0, totalRefund: 0, count: 0 };
    }

    let subtotalReturned = 0;
    let discountReversed = 0;
    let taxReversed = 0;
    let totalRefund = 0;
    let count = 0;

    sale.items?.forEach((item) => {
      const config = selectedItems.get(item.id);
      if (config?.selected && config.quantity > 0) {
        count++;
        const conv = Math.max(1, item.conversionFactor || 1);
        const reqBaseQty = config.quantity * conv;
        const proportion = Math.min(1, reqBaseQty / item.baseQuantity);

        const lineSubtotal = Math.round(item.unitSellingPrice * config.quantity * 100) / 100;
        const lineDiscount = Math.round(item.discountAmount * proportion * 100) / 100;
        const lineTax = Math.round(item.taxAmount * proportion * 100) / 100;
        const lineRefund = Math.max(0, Math.round((lineSubtotal - lineDiscount + lineTax) * 100) / 100);

        subtotalReturned += lineSubtotal;
        discountReversed += lineDiscount;
        taxReversed += lineTax;
        totalRefund += lineRefund;
      }
    });

    return {
      subtotalReturned: Math.round(subtotalReturned * 100) / 100,
      discountReversed: Math.round(discountReversed * 100) / 100,
      taxReversed: Math.round(taxReversed * 100) / 100,
      totalRefund: Math.round(totalRefund * 100) / 100,
      count,
    };
  }, [sale, selectedItems]);

  // Exchange financials
  const exchangeTotals = useMemo(() => {
    const newItemsTotal = exchangeCart.reduce((sum, item) => sum + item.unitPrice * item.quantity, 0);
    const returnCredit = returnTotals.totalRefund;
    const difference = Math.round((newItemsTotal - returnCredit) * 100) / 100;

    return {
      newItemsTotal: Math.round(newItemsTotal * 100) / 100,
      returnCredit,
      difference,
      settlementType: difference > 0 ? 'customer_pays' : difference < 0 ? 'customer_refunded' : 'even',
    };
  }, [exchangeCart, returnTotals.totalRefund]);

  // Add product to exchange cart
  const handleAddToExchange = (product: any) => {
    setExchangeCart((prev) => {
      const existing = prev.find((i) => i.productId === product.id);
      if (existing) {
        return prev.map((i) => (i.productId === product.id ? { ...i, quantity: i.quantity + 1 } : i));
      }
      return [
        ...prev,
        {
          productId: product.id,
          productName: product.name,
          sku: product.sku || '',
          barcode: product.barcode || '',
          unitPrice: product.retailPrice || product.price || 0,
          quantity: 1,
          unitId: product.baseUnitId || 'pcs',
          conversionFactor: 1,
        },
      ];
    });
    setCatalogSearch('');
  };

  // Submit Handler
  const handleSubmit = async () => {
    if (!sale || !currentTenant?.id || !currentBranch?.id) return;

    if (returnTotals.count === 0) {
      toast.error('يرجى تحديد صنف واحد على الأقل للإرجاع');
      return;
    }

    if (isReturnWindowExceeded && !allowPolicyOverride) {
      toast.error('الفاتورة خارج فترة الاسترجاع المسموحة (14 يوماً). يتطلب تفعيل استثناء الإدارة.');
      return;
    }

    // Build return items array
    const itemsToSubmit = Array.from(selectedItems.entries())
      .filter(([_, config]) => config.selected && config.quantity > 0)
      .map(([saleItemId, config]) => ({
        saleItemId,
        quantity: config.quantity,
        condition: config.condition,
        restock: config.restock,
        reason: config.reason,
      }));

    const clientOpId = `op_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`;

    if (mode === 'return') {
      const res = await processReturn({
        saleId: sale.id,
        cashierId: currentUser?.id || 'cashier',
        processedBy: currentUser?.name || 'كاشير المبيعات',
        items: itemsToSubmit,
        refundMethod,
        shiftId: activeCashierShift?.id || null,
        notes,
        clientReturnId: clientOpId,
        allowPolicyOverride,
      });

      if (res.success && res.saleReturn) {
        toast.success(`تم تسجيل المرتجع بنجاح! رقم: ${res.saleReturn.returnNumber}`);
        setCompletedReturn(res.saleReturn);
        setShowReceiptDialog(true);
        onSuccess?.(res.saleReturn);
        onOpenChange(false);
      } else {
        toast.error(`فشل تسجيل المرتجع: ${res.error}`);
      }
    } else {
      // Exchange mode
      if (exchangeCart.length === 0) {
        toast.error('يرجى إضافة أصناف جديدة في سلة الاستبدال');
        return;
      }

      const newItemsInput = exchangeCart.map((item) => ({
        productId: item.productId,
        quantity: item.quantity,
        unitPrice: item.unitPrice,
        unitSellingPrice: item.unitPrice,
        lineTotal: item.unitPrice * item.quantity,
        inputUnitId: item.unitId,
        conversionFactor: item.conversionFactor,
      }));

      const res = await processExchange({
        saleId: sale.id,
        cashierId: currentUser?.id || 'cashier',
        processedBy: currentUser?.name || 'كاشير المبيعات',
        returnItems: itemsToSubmit,
        newItems: newItemsInput,
        differencePaymentMethod,
        shiftId: activeCashierShift?.id || null,
        notes,
        clientExchangeId: clientOpId,
      });

      if (res.success && res.saleReturn) {
        toast.success(`تمت عملية الاستبدال بنجاح! رقم المرتجع: ${res.saleReturn.returnNumber}`);
        setCompletedReturn(res.saleReturn);
        setShowReceiptDialog(true);
        onSuccess?.(res.saleReturn);
        onOpenChange(false);
      } else {
        toast.error(`فشل عملية الاستبدال: ${res.error}`);
      }
    }
  };

  if (!sale) return null;

  return (
    <>
      <Dialog open={open} onOpenChange={onOpenChange}>
        <DialogContent className="max-w-4xl max-h-[92vh] flex flex-col p-0 overflow-hidden" dir="rtl">
          {/* Header with Visual Mode Safety Indicator */}
          <DialogHeader
            className={`p-4 border-b ${
              mode === 'return' ? 'bg-amber-500/10 border-amber-500/20' : 'bg-blue-500/10 border-blue-500/20'
            }`}
          >
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div
                  className={`p-2 rounded-xl text-white ${
                    mode === 'return' ? 'bg-amber-600' : 'bg-blue-600'
                  }`}
                >
                  {mode === 'return' ? <RotateCcw className="w-5 h-5" /> : <RefreshCw className="w-5 h-5" />}
                </div>
                <div>
                  <DialogTitle className="text-lg font-bold flex items-center gap-2">
                    <span>
                      {mode === 'return' ? 'معالجة مرتجع مبيعات' : 'معالجة استبدال مبيعات (Exchange)'}
                    </span>
                    <Badge
                      variant="outline"
                      className={`font-semibold ${
                        mode === 'return'
                          ? 'bg-amber-100 text-amber-900 border-amber-300'
                          : 'bg-blue-100 text-blue-900 border-blue-300'
                      }`}
                    >
                      {mode === 'return' ? 'وضع المرتجع' : 'وضع الاستبدال'}
                    </Badge>
                  </DialogTitle>
                  <DialogDescription className="text-xs text-muted-foreground mt-0.5">
                    الفاتورة: <strong className="text-foreground">{sale.invoiceNumber}</strong> | التاريخ:{' '}
                    {new Date(sale.createdAt).toLocaleDateString('ar-EG')} | العميل:{' '}
                    {sale.customerNameSnapshot || 'نقدي'}
                  </DialogDescription>
                </div>
              </div>

              {/* Mode Switcher Toggle */}
              <div className="flex items-center bg-background rounded-lg border border-border p-1 shadow-sm">
                <Button
                  type="button"
                  size="sm"
                  variant={mode === 'return' ? 'default' : 'ghost'}
                  className={`h-7 px-3 text-xs gap-1.5 ${
                    mode === 'return' ? 'bg-amber-600 hover:bg-amber-700 text-white' : ''
                  }`}
                  onClick={() => setMode('return')}
                >
                  <RotateCcw className="w-3.5 h-3.5" />
                  مرتجع فقط
                </Button>
                <Button
                  type="button"
                  size="sm"
                  variant={mode === 'exchange' ? 'default' : 'ghost'}
                  className={`h-7 px-3 text-xs gap-1.5 ${
                    mode === 'exchange' ? 'bg-blue-600 hover:bg-blue-700 text-white' : ''
                  }`}
                  onClick={() => setMode('exchange')}
                >
                  <RefreshCw className="w-3.5 h-3.5" />
                  استبدال بضاعة
                </Button>
              </div>
            </div>
          </DialogHeader>

          {/* Body Content */}
          <div className="flex-1 overflow-y-auto p-4 space-y-4">
            {/* Warning if return window is exceeded */}
            {isReturnWindowExceeded && (
              <div className="p-3 bg-destructive/10 border border-destructive/20 rounded-xl flex items-center justify-between text-xs text-destructive">
                <div className="flex items-center gap-2">
                  <AlertTriangle className="w-4 h-4 shrink-0" />
                  <span>
                    <strong>تنبيه:</strong> تجاوزت الفاتورة مهلة الـ 14 يوماً للاسترجاع. يتطلب إتمام العملية استثناء
                    الإدارة.
                  </span>
                </div>
                <div className="flex items-center gap-1.5">
                  <Checkbox
                    id="overridePolicy"
                    checked={allowPolicyOverride}
                    onCheckedChange={(c) => setAllowPolicyOverride(!!c)}
                  />
                  <Label htmlFor="overridePolicy" className="text-xs font-semibold cursor-pointer">
                    استثناء الإدارة (Override)
                  </Label>
                </div>
              </div>
            )}

            {/* Quick Barcode Scanner Bar */}
            <form onSubmit={handleBarcodeScan} className="flex gap-2">
              <div className="relative flex-1">
                <Barcode className="w-4 h-4 absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
                <Input
                  ref={barcodeInputRef}
                  value={barcodeInput}
                  onChange={(e) => setBarcodeInput(e.target.value)}
                  placeholder="امسح باركود الصنف لتحديده وزيادة كمية المرتجع تلقائياً..."
                  className="pr-9 h-9 text-xs"
                />
              </div>
              <Button type="submit" size="sm" variant="secondary" className="h-9 px-4 text-xs gap-1">
                <Search className="w-3.5 h-3.5" />
                تحديد
              </Button>
            </form>

            {/* Sale Items Table */}
            <div className="border border-border rounded-xl overflow-hidden">
              <div className="bg-muted/50 p-2.5 border-b border-border text-xs font-bold flex justify-between items-center">
                <span className="flex items-center gap-1.5">
                  <ShoppingBag className="w-4 h-4 text-primary" />
                  <span>أصناف الفاتورة الأصلية والكميات القابلة للإرجاع</span>
                </span>
                <span className="text-[11px] text-muted-foreground">
                  (يتم حفظ السعر والخصم والتكلفة التاريخية بدقة)
                </span>
              </div>

              <div className="divide-y divide-border max-h-56 overflow-y-auto">
                {sale.items?.map((item) => {
                  const conv = Math.max(1, item.conversionFactor || 1);
                  const alreadyReturnedBase = alreadyReturnedMap.get(item.id) || 0;
                  const remainingReturnable = Math.max(
                    0,
                    (item.baseQuantity - alreadyReturnedBase) / conv
                  );
                  const config = selectedItems.get(item.id) || {
                    selected: false,
                    quantity: 1,
                    condition: 'resellable',
                    restock: true,
                    reason: 'customer_changed_mind',
                  };

                  const isFullyReturned = remainingReturnable <= 0;

                  return (
                    <div
                      key={item.id}
                      className={`p-3 text-xs transition-colors ${
                        config.selected ? 'bg-amber-500/5' : isFullyReturned ? 'bg-muted/40 opacity-60' : ''
                      }`}
                    >
                      <div className="flex items-start justify-between gap-3">
                        {/* Checkbox and Item info */}
                        <div className="flex items-start gap-2.5 flex-1">
                          <Checkbox
                            checked={config.selected}
                            disabled={isFullyReturned}
                            onCheckedChange={() => handleToggleSelect(item.id)}
                            className="mt-1"
                          />
                          <div>
                            <div className="font-bold text-sm text-foreground flex items-center gap-2">
                              <span>{item.productNameSnapshot}</span>
                              {isFullyReturned && (
                                <Badge variant="secondary" className="text-[10px] text-muted-foreground">
                                  مرتجع بالكامل
                                </Badge>
                              )}
                            </div>
                            <div className="text-[11px] text-muted-foreground font-mono mt-0.5">
                              SKU: {item.skuSnapshot}{' '}
                              {item.barcodeSnapshot ? `| باركود: ${item.barcodeSnapshot}` : ''}
                            </div>
                            <div className="flex items-center gap-3 text-[11px] mt-1 text-muted-foreground">
                              <span>
                                الكمية المباعة: <strong className="text-foreground">{item.quantity}</strong>
                              </span>
                              <span>
                                أُرجع سابقاً: <strong className="text-amber-600">{alreadyReturnedBase / conv}</strong>
                              </span>
                              <span>
                                المتبقي للإرجاع:{' '}
                                <strong className="text-emerald-600 font-bold">{remainingReturnable}</strong>
                              </span>
                              <span>
                                سعر الشراء الأصلي: <strong>{number(item.unitSellingPrice)} ج.م</strong>
                              </span>
                            </div>
                          </div>
                        </div>

                        {/* Return Controls (shown if selected) */}
                        {config.selected && (
                          <div className="flex flex-wrap items-center gap-2 shrink-0">
                            {/* Quantity */}
                            <div className="space-y-1">
                              <label className="text-[10px] text-muted-foreground block">الكمية</label>
                              <Input
                                type="number"
                                min={1}
                                max={remainingReturnable}
                                value={config.quantity}
                                onChange={(e) =>
                                  handleUpdateItem(item.id, {
                                    quantity: Math.min(
                                      remainingReturnable,
                                      Math.max(1, Number(e.target.value) || 1)
                                    ),
                                  })
                                }
                                className="w-16 h-8 text-center text-xs font-bold"
                              />
                            </div>

                            {/* Condition */}
                            <div className="space-y-1">
                              <label className="text-[10px] text-muted-foreground block">الحالة</label>
                              <Select
                                value={config.condition}
                                onValueChange={(val: any) =>
                                  handleUpdateItem(item.id, { condition: val })
                                }
                              >
                                <SelectTrigger className="h-8 text-xs w-28">
                                  <SelectValue />
                                </SelectTrigger>
                                <SelectContent dir="rtl">
                                  <SelectItem value="resellable">صالح للبيع</SelectItem>
                                  <SelectItem value="opened">مفتوح / سليم</SelectItem>
                                  <SelectItem value="damaged">تالف / مكسور</SelectItem>
                                  <SelectItem value="defective">معيب مصنعياً</SelectItem>
                                  <SelectItem value="incomplete">ناقص الملحقات</SelectItem>
                                </SelectContent>
                              </Select>
                            </div>

                            {/* Restock checkbox */}
                            <div className="space-y-1 text-center">
                              <label className="text-[10px] text-muted-foreground block">إعادة للمخزن</label>
                              <div className="pt-1.5 flex justify-center">
                                <Checkbox
                                  checked={config.restock}
                                  onCheckedChange={(c) =>
                                    handleUpdateItem(item.id, { restock: !!c })
                                  }
                                />
                              </div>
                            </div>

                            {/* Reason */}
                            <div className="space-y-1">
                              <label className="text-[10px] text-muted-foreground block">السبب</label>
                              <Select
                                value={config.reason}
                                onValueChange={(val) => handleUpdateItem(item.id, { reason: val })}
                              >
                                <SelectTrigger className="h-8 text-xs w-36">
                                  <SelectValue />
                                </SelectTrigger>
                                <SelectContent dir="rtl">
                                  {RETURN_REASONS.map((r) => (
                                    <SelectItem key={r.id} value={r.id}>
                                      {r.label}
                                    </SelectItem>
                                  ))}
                                </SelectContent>
                              </Select>
                            </div>
                          </div>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>

            {/* Exchange Section (Only in Exchange Mode) */}
            {mode === 'exchange' && (
              <div className="border border-blue-200 dark:border-slate-800 bg-blue-50/50 dark:bg-slate-900/80 rounded-xl p-3 space-y-3">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-bold text-blue-900 dark:text-blue-300 flex items-center gap-1.5">
                    <RefreshCw className="w-4 h-4 text-blue-600 dark:text-blue-400" />
                    <span>سلة المنتجات البديلة (الاستبدال)</span>
                  </span>
                  <span className="text-xs font-bold text-blue-800 dark:text-blue-300">
                    إجمالي المنتجات الجديدة: {number(exchangeTotals.newItemsTotal)} ج.م
                  </span>
                </div>

                {/* Search & Add New Product from Catalog */}
                <div className="relative">
                  <Search className="w-4 h-4 absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
                  <Input
                    value={catalogSearch}
                    onChange={(e) => setCatalogSearch(e.target.value)}
                    placeholder="ابحث بالاسم أو الباركود لإضافة صنف بديل للعميل..."
                    className="pr-9 h-8 text-xs bg-background text-foreground dark:bg-slate-950 dark:border-slate-800"
                  />

                  {/* Dropdown search results */}
                  {catalogSearch.trim() && (
                    <div className="absolute z-10 w-full mt-1 bg-popover text-popover-foreground dark:bg-slate-900 dark:text-slate-100 border border-border dark:border-slate-800 rounded-lg shadow-lg max-h-48 overflow-y-auto divide-y divide-border dark:divide-slate-800">
                      {products
                        .filter(
                          (p) =>
                            p.name.toLowerCase().includes(catalogSearch.toLowerCase()) ||
                            (p.barcode && p.barcode.includes(catalogSearch)) ||
                            (p.sku && p.sku.toLowerCase().includes(catalogSearch.toLowerCase()))
                        )
                        .slice(0, 5)
                        .map((p) => (
                          <div
                            key={p.id}
                            onClick={() => handleAddToExchange(p)}
                            className="p-2 text-xs flex justify-between items-center hover:bg-muted/50 dark:hover:bg-slate-800/60 cursor-pointer"
                          >
                            <div>
                              <div className="font-bold text-foreground dark:text-slate-100">{p.name}</div>
                              <div className="text-[10px] text-muted-foreground dark:text-slate-400 font-mono">
                                SKU: {p.sku} | السعر: {number(p.retailPrice || 0)} ج.م
                              </div>
                            </div>
                            <Button size="sm" variant="ghost" className="h-7 text-xs gap-1 text-blue-600 dark:text-blue-400">
                              <Plus className="w-3 h-3" />
                              إضافة
                            </Button>
                          </div>
                        ))}
                    </div>
                  )}
                </div>

                {/* Exchange Cart Items */}
                {exchangeCart.length > 0 ? (
                  <div className="border border-border dark:border-slate-800 rounded-lg bg-card dark:bg-slate-950 text-card-foreground dark:text-slate-100 overflow-hidden divide-y divide-border dark:divide-slate-800 text-xs">
                    {exchangeCart.map((item, idx) => (
                      <div key={idx} className="p-2.5 flex items-center justify-between bg-card dark:bg-slate-950">
                        <div>
                          <span className="font-bold text-foreground dark:text-slate-100">{item.productName}</span>
                          <div className="text-[10px] text-muted-foreground dark:text-slate-400 font-mono">
                            {item.sku} | {number(item.unitPrice)} ج.م للوحدة
                          </div>
                        </div>
                        <div className="flex items-center gap-3">
                          <div className="flex items-center gap-1">
                            <Button
                              size="sm"
                              variant="outline"
                              className="h-6 w-6 p-0 dark:border-slate-700 dark:bg-slate-900"
                              onClick={() =>
                                setExchangeCart((prev) =>
                                  prev.map((i, iIdx) =>
                                    iIdx === idx ? { ...i, quantity: Math.max(1, i.quantity - 1) } : i
                                  )
                                )
                              }
                            >
                              <Minus className="w-3 h-3" />
                            </Button>
                            <span className="font-bold w-6 text-center text-foreground dark:text-slate-100">{item.quantity}</span>
                            <Button
                              size="sm"
                              variant="outline"
                              className="h-6 w-6 p-0 dark:border-slate-700 dark:bg-slate-900"
                              onClick={() =>
                                setExchangeCart((prev) =>
                                  prev.map((i, iIdx) =>
                                    iIdx === idx ? { ...i, quantity: i.quantity + 1 } : i
                                  )
                                )
                              }
                            >
                              <Plus className="w-3 h-3" />
                            </Button>
                          </div>
                          <span className="font-bold w-16 text-left text-foreground dark:text-slate-100">
                            {number(item.unitPrice * item.quantity)} ج.م
                          </span>
                          <Button
                            size="sm"
                            variant="ghost"
                            className="h-6 w-6 p-0 text-destructive hover:bg-destructive/10"
                            onClick={() => setExchangeCart((prev) => prev.filter((_, iIdx) => iIdx !== idx))}
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </Button>
                        </div>
                      </div>
                    ))}
                  </div>
                ) : (
                  <div className="p-4 text-center text-xs text-muted-foreground border border-dashed border-border dark:border-slate-800 rounded-lg bg-muted/30 dark:bg-slate-950/60">
                    لم تقم بإضافة أي أصناف جديدة للاستبدال بعد. ابحث في الصندوق أعلاه.
                  </div>
                )}
              </div>
            )}

            {/* Financial Summary & Settlement Box */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-2">
              {/* Financial Snapshot */}
              <div className="p-3 bg-muted/40 rounded-xl border border-border space-y-1.5 text-xs">
                <div className="font-bold text-foreground border-b border-border pb-1 mb-1 flex items-center justify-between">
                  <span>المحاسبة التاريخية للمرتجع:</span>
                  <Badge variant="outline" className="text-[10px]">
                    {returnTotals.count} صنف محدد
                  </Badge>
                </div>
                <div className="flex justify-between text-muted-foreground">
                  <span>إجمالي سعر الأصناف المرتجعة:</span>
                  <span>{number(returnTotals.subtotalReturned)} ج.م</span>
                </div>
                <div className="flex justify-between text-amber-600">
                  <span>الخصم التاريخي المسترجع:</span>
                  <span>-{number(returnTotals.discountReversed)} ج.م</span>
                </div>
                <div className="flex justify-between text-muted-foreground">
                  <span>الضريبة المسترجعة:</span>
                  <span>+{number(returnTotals.taxReversed)} ج.م</span>
                </div>
                <div className="flex justify-between items-center pt-1 border-t border-border font-bold text-sm text-foreground">
                  <span>صافي المبلغ القابل للرد (Credit):</span>
                  <span className="text-amber-600">{number(returnTotals.totalRefund)} ج.م</span>
                </div>
              </div>

              {/* Settlement / Refund Method */}
              <div className="p-3 bg-muted/40 rounded-xl border border-border space-y-2 text-xs">
                {mode === 'return' ? (
                  <>
                    <Label className="text-xs font-bold block">وسيلة رد المبلغ للعميل:</Label>
                    <Select value={refundMethod} onValueChange={(val: any) => setRefundMethod(val)}>
                      <SelectTrigger className="h-9 text-xs">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent dir="rtl">
                        <SelectItem value="cash">نقداً من الدرج (Cash Drawer)</SelectItem>
                        <SelectItem value="card">بطاقة بنكية / شبكة (Card Refund)</SelectItem>
                        <SelectItem value="wallet">محفظة إلكترونية (Wallet)</SelectItem>
                        <SelectItem value="instapay">إنستاباي (InstaPay)</SelectItem>
                        <SelectItem value="other">أخرى / رصيد عميل</SelectItem>
                      </SelectContent>
                    </Select>
                    <div className="text-[11px] text-muted-foreground">
                      {refundMethod === 'cash' &&
                        'سيتم تسجيل حركة خروج نقدي من الدرج للوردية الحالية تلقائياً.'}
                    </div>
                  </>
                ) : (
                  <>
                    <div className="font-bold text-foreground border-b border-border pb-1">
                      تسوية فرق الاستبدال:
                    </div>
                    <div className="flex justify-between text-xs">
                      <span>رصيد المرتجع:</span>
                      <span className="font-semibold">{number(exchangeTotals.returnCredit)} ج.م</span>
                    </div>
                    <div className="flex justify-between text-xs">
                      <span>قيمة البضاعة الجديدة:</span>
                      <span className="font-semibold">{number(exchangeTotals.newItemsTotal)} ج.م</span>
                    </div>
                    <div
                      className={`flex justify-between items-center p-2 rounded-lg font-bold text-sm ${
                        exchangeTotals.difference > 0
                          ? 'bg-blue-500/10 text-blue-700'
                          : exchangeTotals.difference < 0
                          ? 'bg-emerald-500/10 text-emerald-700'
                          : 'bg-muted text-muted-foreground'
                      }`}
                    >
                      <span>
                        {exchangeTotals.difference > 0
                          ? 'الفرق مستحق على العميل (يدفع):'
                          : exchangeTotals.difference < 0
                          ? 'الفرق مسترد للعميل (يسترجع):'
                          : 'استبدال متكافئ تماماً (0 فرق):'}
                      </span>
                      <span>{number(Math.abs(exchangeTotals.difference))} ج.م</span>
                    </div>

                    {exchangeTotals.difference !== 0 && (
                      <div className="space-y-1">
                        <label className="text-[10px] text-muted-foreground block">طريقة التسوية:</label>
                        <Select
                          value={differencePaymentMethod}
                          onValueChange={(val: any) => setDifferencePaymentMethod(val)}
                        >
                          <SelectTrigger className="h-8 text-xs">
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent dir="rtl">
                            <SelectItem value="cash">نقداً (Cash)</SelectItem>
                            <SelectItem value="card">بطاقة بنكية (Card)</SelectItem>
                            <SelectItem value="instapay">إنستاباي (InstaPay)</SelectItem>
                          </SelectContent>
                        </Select>
                      </div>
                    )}
                  </>
                )}
              </div>
            </div>

            {/* Notes */}
            <div className="space-y-1">
              <label className="text-xs text-muted-foreground block">ملاحظات العملية (اختياري):</label>
              <Input
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                placeholder="أية تفاصيل إضافية بشأن المرتجع أو حالة المنتجات..."
                className="h-8 text-xs"
              />
            </div>
          </div>

          {/* Footer Actions */}
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
              disabled={loading || returnTotals.count === 0}
              onClick={handleSubmit}
              className={`font-bold px-6 gap-2 text-white ${
                mode === 'return' ? 'bg-amber-600 hover:bg-amber-700' : 'bg-blue-600 hover:bg-blue-700'
              }`}
            >
              {loading ? (
                'جارِ المعالجة في قاعدة البيانات...'
              ) : mode === 'return' ? (
                <>
                  <RotateCcw className="w-4 h-4" />
                  <span>تأكيد المرتجع وصرف {number(returnTotals.totalRefund)} ج.م</span>
                </>
              ) : (
                <>
                  <RefreshCw className="w-4 h-4" />
                  <span>تأكيد الاستبدال وإصدار الفاتورة البديلة</span>
                </>
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Return Thermal Receipt Modal */}
      {completedReturn && (
        <ReturnReceiptDialog
          open={showReceiptDialog}
          onOpenChange={setShowReceiptDialog}
          saleReturn={completedReturn}
        />
      )}
    </>
  );
};
