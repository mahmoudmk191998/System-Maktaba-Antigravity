import React, { useState, useEffect, useMemo } from 'react';
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
import { Lock, Unlock, AlertTriangle, CheckCircle2, Printer, ShoppingBag, Receipt } from 'lucide-react';
import { useFormatters } from '@/lib/formatters';
import type { CashierShift } from '@/types/retail.types';
import { printShiftReport } from '@/lib/thermalPrinter';
import { useAppStore } from '@/lib/store';
import { db } from '@/lib/firebase';
import { collection, getDocs, query, where } from 'firebase/firestore';
import { parseToDate } from '@/services/analytics/reportingTimezone';

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
  const { settings, currentBranch } = useAppStore();
  const [cashAmount, setCashAmount] = useState<string>('0');
  const [notes, setNotes] = useState<string>('');
  const [loading, setLoading] = useState<boolean>(false);
  const [printReportOnClose, setPrintReportOnClose] = useState<boolean>(true);

  // Live Shift Orders & Expenses State
  const [shiftOrders, setShiftOrders] = useState<any[]>([]);
  const [shiftExpenses, setShiftExpenses] = useState<any[]>([]);

  useEffect(() => {
    if (!open || mode !== 'close' || !activeShift) return;

    let isMounted = true;
    const loadShiftDetails = async () => {
      try {
        const tenantId = activeShift.tenantId;
        const shiftId = activeShift.id;
        const shiftStart = parseToDate(activeShift.openedAt || (activeShift as any).createdAt || (activeShift as any).start_time)?.getTime() || 0;
        const shiftEnd = Date.now();

        // 1. Fetch sales by shiftId
        let ordersList: any[] = [];
        const seen = new Set();
        try {
          const snap1 = await getDocs(query(collection(db, 'sales'), where('shiftId', '==', shiftId)));
          snap1.docs.forEach((d) => {
            seen.add(d.id);
            ordersList.push({ id: d.id, ...d.data() });
          });
        } catch {}

        // Fallback: search sales within shift time window
        if (ordersList.length === 0) {
          let salesDocs: any[] = [];
          if (tenantId) {
            try {
              const snap = await getDocs(query(collection(db, 'sales'), where('tenantId', '==', tenantId)));
              salesDocs.push(...snap.docs);
            } catch {}
          }
          if (salesDocs.length === 0) {
            try {
              const snap = await getDocs(collection(db, 'sales'));
              salesDocs.push(...snap.docs);
            } catch {}
          }

          salesDocs.forEach((d) => {
            if (!seen.has(d.id)) {
              const data = d.data() as any;
              const dDate = parseToDate(data.createdAt || data.created_at || data.completedAt || data.timestamp || data.date);
              if (!dDate) return;
              const dTime = dDate.getTime();
              const sCashierId = activeShift.cashierId || (activeShift as any).cashier_id;
              const sCashierName = activeShift.cashierNameSnapshot || (activeShift as any).cashier_name;
              const matchesCashier = !sCashierId || data.cashierId === sCashierId || data.cashierNameSnapshot === sCashierName;
              const matchesBranch = !activeShift.branchId || data.branchId === activeShift.branchId;

              if (dTime >= shiftStart && dTime <= shiftEnd && (matchesCashier || matchesBranch)) {
                seen.add(d.id);
                ordersList.push({ id: d.id, ...data });
              }
            }
          });
        }

        // 2. Fetch expenses
        let expensesList: any[] = [];
        const expSeen = new Set();
        try {
          const snapExp = await getDocs(query(collection(db, 'expenses'), where('shiftId', '==', shiftId)));
          snapExp.docs.forEach((d) => {
            expSeen.add(d.id);
            expensesList.push({ id: d.id, ...d.data() });
          });
        } catch {}

        if (expensesList.length === 0) {
          let expDocs: any[] = [];
          if (tenantId) {
            try {
              const snap = await getDocs(query(collection(db, 'expenses'), where('tenantId', '==', tenantId)));
              expDocs.push(...snap.docs);
            } catch {}
          }
          if (expDocs.length === 0) {
            try {
              const snap = await getDocs(collection(db, 'expenses'));
              expDocs.push(...snap.docs);
            } catch {}
          }

          expDocs.forEach((d) => {
            if (!expSeen.has(d.id)) {
              const data = d.data() as any;
              const eDate = parseToDate(data.date || data.createdAt || data.created_at || data.timestamp);
              if (!eDate) return;
              const eTime = eDate.getTime();
              if (eTime >= shiftStart && eTime <= shiftEnd) {
                expSeen.add(d.id);
                expensesList.push({ id: d.id, ...data });
              }
            }
          });
        }

        if (isMounted) {
          setShiftOrders(ordersList);
          setShiftExpenses(expensesList);
        }
      } catch (err) {
        console.warn('Could not preload shift details:', err);
      }
    };

    loadShiftDetails();
    return () => { isMounted = false; };
  }, [open, mode, activeShift]);

  // Aggregate Sold Items Breakdown
  const shiftSoldItems = useMemo(() => {
    const map = new Map<string, { name: string; quantity: number; total: number }>();
    shiftOrders.forEach((o) => {
      const items = o.items || o.order_items || [];
      items.forEach((it: any) => {
        const name = it.productNameSnapshot || it.productName || it.name || 'صنف مسجل';
        const qty = Number(it.quantity || it.qty || 1);
        const price = Number(it.unitPrice || it.unitSellingPrice || it.price || 0);
        const lineTotal = Number(it.lineTotal || it.total || (qty * price));
        const cur = map.get(name) || { name, quantity: 0, total: 0 };
        cur.quantity += qty;
        cur.total += lineTotal;
        map.set(name, cur);
      });
    });
    return Array.from(map.values()).sort((a, b) => b.quantity - a.quantity);
  }, [shiftOrders]);

  const totalUniqueItems = shiftSoldItems.length;
  const totalUnitsSold = shiftSoldItems.reduce((sum, it) => sum + it.quantity, 0);

  const expectedCash = activeShift
    ? Number(activeShift.openingCash || 0) +
      Number(activeShift.totalSalesCash || 0) +
      Number(activeShift.cashIn || 0) -
      Number(activeShift.cashOut || 0) -
      Number(activeShift.totalRefunds || 0)
    : 0;

  const actualNum = Number(cashAmount) || 0;
  const difference = Math.round((actualNum - expectedCash) * 100) / 100;

  const handlePrintZReport = () => {
    if (!activeShift) return;
    printShiftReport(
      {
        ...activeShift,
        actual_cash: actualNum,
        closingCash: actualNum,
        discrepancy: difference,
        notes,
        end_time: new Date().toISOString(),
        employee_role: (activeShift as any).employee_role || (activeShift as any).cashierRole || 'كاشير',
        total_unique_items: totalUniqueItems,
        total_units_sold: totalUnitsSold,
        sold_items: shiftSoldItems,
      },
      shiftOrders,
      shiftExpenses,
      settings,
      currentBranch?.name || 'مكتبة ألوان التجارية'
    );
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    try {
      if (mode === 'open' && onConfirmOpen) {
        const ok = await onConfirmOpen(actualNum, notes);
        if (ok) onOpenChange(false);
      } else if (mode === 'close' && onConfirmClose) {
        const ok = await onConfirmClose(actualNum, notes);
        if (ok) {
          if (printReportOnClose && activeShift) {
            handlePrintZReport();
          }
          onOpenChange(false);
        }
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
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">عدد فواتير المبيعات بالوردية:</span>
                    <span className="font-semibold text-foreground">{number(shiftOrders.length || activeShift?.totalSalesCount || 0)} فاتورة</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">إجمالي الأصناف والقطع المباعة:</span>
                    <span className="font-semibold text-emerald-600">{number(totalUniqueItems)} صنف ({number(totalUnitsSold)} قطعة)</span>
                  </div>
                  {shiftExpenses.length > 0 && (
                    <div className="flex justify-between">
                      <span className="text-muted-foreground">المصروفات والسحوبات المسجلة:</span>
                      <span className="font-semibold text-rose-600">
                        -{number(shiftExpenses.reduce((sum, e) => sum + Number(e.amount || 0), 0))} ج.م
                      </span>
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

            {mode === 'close' && (
              <div className="flex items-center justify-between p-2.5 bg-muted/40 rounded-xl border border-border text-xs">
                <label className="flex items-center gap-2 cursor-pointer select-none">
                  <input
                    type="checkbox"
                    checked={printReportOnClose}
                    onChange={(e) => setPrintReportOnClose(e.target.checked)}
                    className="rounded border-border w-4 h-4 text-primary focus:ring-primary"
                  />
                  <span className="font-semibold text-foreground">
                    طباعة تقرير الإغلاق (Z-Report) تلقائياً
                  </span>
                </label>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={handlePrintZReport}
                  className="h-7 text-xs gap-1"
                >
                  <Printer className="w-3.5 h-3.5 text-amber-600" />
                  <span>معاينة وطباعة</span>
                </Button>
              </div>
            )}
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
