import React, { useState, useEffect } from 'react';
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetDescription,
} from '@/components/ui/sheet';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Clock, Play, Trash2, ShoppingBag } from 'lucide-react';
import { fetchHeldSales, removeHeldSale } from '@/services/sales/heldSales.service';
import type { HeldSale } from '@/types/retail.types';
import { useFormatters } from '@/lib/formatters';
import { toast } from 'sonner';

interface HeldSalesDrawerProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  tenantId: string;
  branchId: string;
  onResumeSale: (heldSale: HeldSale) => void;
}

export const HeldSalesDrawer: React.FC<HeldSalesDrawerProps> = ({
  open,
  onOpenChange,
  tenantId,
  branchId,
  onResumeSale,
}) => {
  const { number } = useFormatters();
  const [heldSales, setHeldSales] = useState<HeldSale[]>([]);
  const [loading, setLoading] = useState(false);

  const loadHeldSales = async () => {
    if (!tenantId || !branchId) return;
    setLoading(true);
    try {
      const data = await fetchHeldSales(tenantId, branchId);
      setHeldSales(data);
    } catch {
      toast.error('تعذر جلب السلات المعلقة');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (open) {
      loadHeldSales();
    }
  }, [open, tenantId, branchId]);

  const handleResume = async (sale: HeldSale) => {
    await removeHeldSale(sale.id);
    onResumeSale(sale);
    onOpenChange(false);
    toast.success('تمت استعادة السلة بنجاح');
  };

  const handleDiscard = async (saleId: string) => {
    const ok = await removeHeldSale(saleId);
    if (ok) {
      setHeldSales((prev) => prev.filter((s) => s.id !== saleId));
      toast.info('تم إلغاء السلة المعلقة');
    }
  };

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="left" className="w-full sm:max-w-md overflow-y-auto" dir="rtl">
        <SheetHeader>
          <SheetTitle className="text-lg font-bold flex items-center gap-2">
            <Clock className="w-5 h-5 text-amber-500" />
            <span>السلات المعلقة (Held Carts)</span>
            <Badge variant="secondary">{heldSales.length}</Badge>
          </SheetTitle>
          <SheetDescription className="text-xs">
            سلات البيع المحفوظة مؤقتاً لخدمة عملاء آخرين. لا تحجز المخزون لحين إتمام البيع.
          </SheetDescription>
        </SheetHeader>

        <div className="mt-6 space-y-3">
          {loading ? (
            <div className="text-center py-8 text-muted-foreground text-sm">جاري التحميل...</div>
          ) : heldSales.length === 0 ? (
            <div className="text-center py-12 text-muted-foreground space-y-2">
              <ShoppingBag className="w-10 h-10 mx-auto opacity-30" />
              <p className="text-sm font-semibold">لا توجد سلات معلقة حالياً</p>
            </div>
          ) : (
            heldSales.map((sale) => (
              <div
                key={sale.id}
                className="p-4 rounded-xl border border-border bg-card/60 hover:bg-muted/40 transition-colors space-y-3"
              >
                <div className="flex items-center justify-between">
                  <span className="font-bold text-sm">
                    {sale.customerSnapshot?.name || 'عميل نقدي'}
                  </span>
                  <Badge variant="outline" className="text-xs bg-amber-500/10 text-amber-600 border-amber-500/20">
                    {new Date(sale.heldAt).toLocaleTimeString('ar-EG', { hour: '2-digit', minute: '2-digit' })}
                  </Badge>
                </div>

                <div className="text-xs text-muted-foreground space-y-1">
                  <div>عدد الأصناف: {sale.items?.length || 0} صنف</div>
                  {sale.notes && <div className="italic">ملاحظة: {sale.notes}</div>}
                </div>

                <div className="flex items-center justify-between pt-2 border-t border-border">
                  <span className="font-bold text-base text-primary">
                    {number(sale.total)} ج.م
                  </span>
                  <div className="flex gap-1.5">
                    <Button
                      size="sm"
                      variant="outline"
                      className="text-destructive hover:bg-destructive/10 h-8 px-2.5"
                      onClick={() => handleDiscard(sale.id)}
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </Button>
                    <Button
                      size="sm"
                      className="gap-1.5 h-8 px-3 font-semibold bg-primary hover:bg-primary/90"
                      onClick={() => handleResume(sale)}
                    >
                      <Play className="w-3.5 h-3.5" />
                      استعادة السلة
                    </Button>
                  </div>
                </div>
              </div>
            ))
          )}
        </div>
      </SheetContent>
    </Sheet>
  );
};
