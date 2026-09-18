import React, { useState, useRef, useEffect } from 'react';
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
import { Barcode, CheckCircle2, AlertTriangle, Play, RefreshCw, Send } from 'lucide-react';
import type { InventoryCountSession } from '@/types/retail.types';

interface InventoryCountModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  session: InventoryCountSession | null;
  onScanBarcode: (sessionId: string, barcode: string, qty: number) => Promise<{ success: boolean; error?: string }>;
  onUpdateQty: (sessionId: string, productId: string, variantId: string | null | undefined, qty: number) => Promise<{ success: boolean; error?: string }>;
  onPostSession: (sessionId: string) => Promise<{ success: boolean; error?: string }>;
}

export const InventoryCountModal: React.FC<InventoryCountModalProps> = ({
  open,
  onOpenChange,
  session,
  onScanBarcode,
  onUpdateQty,
  onPostSession,
}) => {
  const [barcodeInput, setBarcodeInput] = useState('');
  const [posting, setPosting] = useState(false);
  const [scanQty, setScanQty] = useState(1);
  const barcodeInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (open && barcodeInputRef.current) {
      setTimeout(() => barcodeInputRef.current?.focus(), 150);
    }
  }, [open]);

  if (!session) return null;

  const handleScanSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const cleanCode = barcodeInput.trim();
    if (!cleanCode) return;

    try {
      const res = await onScanBarcode(session.id, cleanCode, scanQty);
      if (res.success) {
        toast.success(`تم جرد الباركود: ${cleanCode}`);
        setBarcodeInput('');
      } else {
        toast.error(res.error || 'الباركود غير مسجل في الفهرس');
      }
    } finally {
      barcodeInputRef.current?.focus();
    }
  };

  const handlePost = async () => {
    if (
      !window.confirm(
        'هل أنت متأكد من ترحيل الجرد الفعلي للمخزون؟ سيتم إنشاء حركات تسوية ذرية لجميع الفروقات وتحديث الأرصدة.'
      )
    ) {
      return;
    }

    setPosting(true);
    try {
      const res = await onPostSession(session.id);
      if (res.success) {
        toast.success('تم ترحيل الجرد الفعلي للمخزون بنجاح!');
        onOpenChange(false);
      } else {
        toast.error(res.error || 'فشل في ترحيل الجرد');
      }
    } finally {
      setPosting(false);
    }
  };

  const matchedCount = session.items.filter((i) => i.status === 'matched').length;
  const shortageCount = session.items.filter((i) => i.status === 'shortage').length;
  const overageCount = session.items.filter((i) => i.status === 'overage').length;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[720px] max-h-[90vh] flex flex-col">
        <DialogHeader>
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <div className="p-2 rounded-lg bg-emerald-500/10 text-emerald-600">
                <Barcode className="w-5 h-5" />
              </div>
              <div>
                <DialogTitle>جلسة الجرد الفعلي: {session.sessionNumber}</DialogTitle>
                <DialogDescription>
                  امسح باركود المنتجات أو عدّل الكميات الفعلية المحصورة
                </DialogDescription>
              </div>
            </div>
            <Badge variant={session.status === 'posted' ? 'default' : 'secondary'}>
              {session.status === 'posted' ? 'مرحّل للمخزون' : 'قيد الجرد والتسجيل'}
            </Badge>
          </div>
        </DialogHeader>

        {/* Quick Scan Bar (Mobile-first design) */}
        {session.status === 'in_progress' && (
          <form onSubmit={handleScanSubmit} className="p-3 bg-muted/40 rounded-lg border flex gap-2 items-center">
            <div className="relative flex-1">
              <Input
                ref={barcodeInputRef}
                value={barcodeInput}
                onChange={(e) => setBarcodeInput(e.target.value)}
                placeholder="امسح الباركود بقارئ الـ USB أو Bluetooth..."
                className="h-11 font-mono text-base pr-4"
              />
            </div>
            <Input
              type="number"
              min="1"
              value={scanQty}
              onChange={(e) => setScanQty(Math.max(1, parseInt(e.target.value) || 1))}
              className="w-20 h-11 text-center font-bold"
              title="الكمية لكل مسحة"
            />
            <Button type="submit" className="h-11 px-5 gap-2 font-bold">
              <Barcode className="w-4 h-4" />
              إدخال
            </Button>
          </form>
        )}

        {/* Counters & Variance Overview */}
        <div className="grid grid-cols-4 gap-2 text-center text-xs">
          <div className="p-2 rounded bg-card border">
            <p className="text-muted-foreground">متطابق</p>
            <p className="text-lg font-bold text-emerald-600">{matchedCount}</p>
          </div>
          <div className="p-2 rounded bg-card border">
            <p className="text-muted-foreground">عجز (نقص)</p>
            <p className="text-lg font-bold text-rose-600">{shortageCount}</p>
          </div>
          <div className="p-2 rounded bg-card border">
            <p className="text-muted-foreground">فائض (زيادة)</p>
            <p className="text-lg font-bold text-amber-600">{overageCount}</p>
          </div>
          <div className="p-2 rounded bg-card border">
            <p className="text-muted-foreground">إجمالي الفارق المالي</p>
            <p
              className={`text-lg font-bold ${
                session.totalDifferenceValue < 0
                  ? 'text-rose-600'
                  : session.totalDifferenceValue > 0
                  ? 'text-emerald-600'
                  : 'text-muted-foreground'
              }`}
            >
              {session.totalDifferenceValue.toLocaleString()} ج.م
            </p>
          </div>
        </div>

        {/* Count Items List */}
        <div className="flex-1 overflow-y-auto border rounded-lg max-h-72">
          <table className="w-full text-xs text-right">
            <thead className="bg-muted text-muted-foreground sticky top-0">
              <tr>
                <th className="p-2.5">الصنف</th>
                <th className="p-2.5 text-center">المتوقع الدفتري</th>
                <th className="p-2.5 text-center">المحصور الفعلي</th>
                <th className="p-2.5 text-center">الفارق</th>
                <th className="p-2.5 text-center">قيمة الفارق</th>
              </tr>
            </thead>
            <tbody className="divide-y">
              {session.items.length === 0 ? (
                <tr>
                  <td colSpan={5} className="p-6 text-center text-muted-foreground">
                    لا توجد أصناف مسجلة في هذا الموقع للجرد
                  </td>
                </tr>
              ) : (
                session.items.map((item, idx) => (
                  <tr key={idx} className="hover:bg-muted/20">
                    <td className="p-2.5">
                      <p className="font-semibold text-foreground">
                        {item.productNameSnapshot || item.productId}
                      </p>
                      <p className="font-mono text-[11px] text-muted-foreground">{item.skuSnapshot}</p>
                    </td>
                    <td className="p-2.5 text-center font-bold text-muted-foreground">
                      {item.expectedQuantity}
                    </td>
                    <td className="p-2.5 text-center">
                      {session.status === 'in_progress' ? (
                        <Input
                          type="number"
                          min="0"
                          value={item.countedQuantity}
                          onChange={(e) =>
                            onUpdateQty(
                              session.id,
                              item.productId,
                              item.variantId,
                              parseFloat(e.target.value) || 0
                            )
                          }
                          className="h-7 w-20 text-center font-bold mx-auto text-xs"
                        />
                      ) : (
                        <span className="font-bold">{item.countedQuantity}</span>
                      )}
                    </td>
                    <td className="p-2.5 text-center font-bold">
                      <span
                        className={
                          item.difference < 0
                            ? 'text-rose-600'
                            : item.difference > 0
                            ? 'text-emerald-600'
                            : 'text-muted-foreground'
                        }
                      >
                        {item.difference > 0 ? `+${item.difference}` : item.difference}
                      </span>
                    </td>
                    <td className="p-2.5 text-center font-mono">
                      {(item.financialVariance || 0).toLocaleString()} ج.م
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>

        <DialogFooter className="gap-2 sm:gap-0 pt-2">
          <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
            إغلاق
          </Button>
          {session.status === 'in_progress' && (
            <Button
              type="button"
              variant="default"
              onClick={handlePost}
              disabled={posting}
              className="gap-2 bg-emerald-600 hover:bg-emerald-700 font-bold"
            >
              <Send className="w-4 h-4" />
              {posting ? 'جاري الترحيل...' : 'ترحيل واعتماد الجرد للمخزون'}
            </Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};
