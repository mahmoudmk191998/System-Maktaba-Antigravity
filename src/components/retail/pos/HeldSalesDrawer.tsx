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
import { fetchHeldSales, removeHeldSale, subscribeToHeldSales } from '@/services/sales/heldSales.service';
import type { HeldSale } from '@/types/retail.types';
import { useFormatters } from '@/lib/formatters';
import { toast } from 'sonner';

interface HeldSalesDrawerProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  tenantId: string;
  branchId: string;
  onResumeSale: (heldSale: HeldSale) => void;
  onCountChange?: (count: number) => void;
}

export const HeldSalesDrawer: React.FC<HeldSalesDrawerProps> = ({
  open,
  onOpenChange,
  tenantId,
  branchId,
  onResumeSale,
  onCountChange,
}) => {
  const { number } = useFormatters();
  const [heldSales, setHeldSales] = useState<HeldSale[]>([]);
  const [loading, setLoading] = useState(false);

  const loadHeldSales = async () => {
    const effTenant = tenantId || 'default-tenant';
    const effBranch = branchId || 'main';
    setLoading(true);
    try {
      const data = await fetchHeldSales(effTenant, effBranch);
      setHeldSales(data);
      onCountChange?.(data.length);
    } catch {
      toast.error('تعذر جلب السلات المعلقة');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (!open) return;
    const effTenant = tenantId || 'default-tenant';
    const effBranch = branchId || 'main';
    setLoading(true);

    const unsubscribe = subscribeToHeldSales(effTenant, effBranch, (data) => {
      setHeldSales(data);
      onCountChange?.(data.length);
      setLoading(false);
    });

    return () => {
      unsubscribe();
    };
  }, [open, tenantId, branchId]);

  const handleResume = async (sale: HeldSale) => {
    const effTenant = tenantId || 'default-tenant';
    await removeHeldSale(sale.id, effTenant);
    onResumeSale(sale);
    onOpenChange(false);
    const updated = heldSales.filter((s) => s.id !== sale.id);
    setHeldSales(updated);
    onCountChange?.(updated.length);
    toast.success('تمت استعادة السلة بنجاح');
  };

  const handleDiscard = async (saleId: string) => {
    const effTenant = tenantId || 'default-tenant';
    const ok = await removeHeldSale(saleId, effTenant);
    if (ok) {
      const updated = heldSales.filter((s) => s.id !== saleId);
      setHeldSales(updated);
      onCountChange?.(updated.length);
      toast.info('تم إلغاء السلة المعلقة');
    }
  };

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="left" className="w-full sm:max-w-lg overflow-y-auto" dir="rtl">
        <SheetHeader>
          <SheetTitle className="text-lg font-black flex items-center gap-2">
            <Clock className="w-5 h-5 text-amber-500" />
            <span>السلات المعلقة (Held Carts)</span>
            <Badge variant="secondary" className="font-bold text-xs bg-amber-500/10 text-amber-600 border border-amber-500/30">
              {heldSales.length} سلة
            </Badge>
          </SheetTitle>
          <SheetDescription className="text-xs">
            سلات البيع المحفوظة مؤقتاً لخدمة عملاء آخرين دون فقدان أصناف الفاتورة.
          </SheetDescription>
        </SheetHeader>

        <div className="mt-5 space-y-3">
          {loading ? (
            <div className="text-center py-10 text-muted-foreground text-sm">جاري تحميل السلات المعلقة...</div>
          ) : heldSales.length === 0 ? (
            <div className="text-center py-16 text-muted-foreground space-y-3">
              <div className="w-16 h-16 rounded-full bg-muted/60 flex items-center justify-center mx-auto">
                <ShoppingBag className="w-8 h-8 opacity-40" />
              </div>
              <p className="text-base font-bold">لا توجد سلات معلقة حالياً</p>
              <p className="text-xs text-muted-foreground">يمكنك تعليق أي سلة نشطة عبر زر تعليق السلة (F6) في شاشة البيع</p>
            </div>
          ) : (
            heldSales.map((sale) => (
              <div
                key={sale.id}
                className="p-4 rounded-2xl border border-border bg-card/90 shadow-sm hover:border-primary/40 transition-all space-y-3"
              >
                {/* Header: Customer & Time */}
                <div className="flex items-center justify-between pb-2 border-b border-border/50">
                  <div>
                    <span className="font-black text-sm text-foreground">
                      {sale.customerSnapshot?.name || 'عميل نقدي (Walk-in)'}
                    </span>
                    {sale.customerSnapshot?.phone && (
                      <span className="text-xs text-muted-foreground mr-2 font-mono" dir="ltr">
                        {sale.customerSnapshot.phone}
                      </span>
                    )}
                  </div>
                  <Badge variant="outline" className="text-xs bg-amber-500/10 text-amber-600 border-amber-500/30 font-mono">
                    {new Date(sale.heldAt).toLocaleTimeString('ar-EG', { hour: '2-digit', minute: '2-digit' })}
                  </Badge>
                </div>

                {/* Detailed Item List: Names, quantities and prices */}
                <div className="bg-muted/40 rounded-xl p-2.5 space-y-1.5 border border-border/50 text-xs">
                  <div className="font-bold text-foreground flex items-center justify-between border-b border-border/40 pb-1">
                    <span className="flex items-center gap-1.5">
                      <ShoppingBag className="w-3.5 h-3.5 text-primary" />
                      <span>محتويات السلة ({sale.items?.length || 0} صنف):</span>
                    </span>
                    <span className="text-[11px] text-muted-foreground">
                      {new Date(sale.heldAt).toLocaleDateString('ar-EG')}
                    </span>
                  </div>

                  <div className="max-h-40 overflow-y-auto space-y-1.5 pr-1 divide-y divide-border/20">
                    {sale.items?.map((item: any, idx: number) => {
                      const itemName = item.productName || item.productNameSnapshot || item.name || 'صنف';
                      const variantName = item.variantName || item.variantNameSnapshot;
                      const itemPrice = item.unitSellingPrice || item.unitPrice || 0;
                      const itemTotal = item.lineTotal || (itemPrice * (item.quantity || 1));

                      return (
                        <div key={idx} className="flex items-center justify-between py-1 text-xs first:pt-0">
                          <div className="flex items-center gap-2 min-w-0 flex-1">
                            <Badge variant="secondary" className="px-1.5 py-0 text-[11px] font-black h-5 shrink-0 bg-primary/10 text-primary">
                              ×{item.quantity || 1}
                            </Badge>
                            <div className="truncate min-w-0">
                              <span className="font-bold text-foreground" title={itemName}>
                                {itemName}
                              </span>
                              {variantName && (
                                <span className="text-[10px] text-muted-foreground mr-1">
                                  ({variantName})
                                </span>
                              )}
                            </div>
                          </div>
                          <span className="font-mono font-bold text-foreground shrink-0 mr-2">
                            {number(itemTotal)} ج.م
                          </span>
                        </div>
                      );
                    })}
                  </div>

                  {sale.notes && (
                    <div className="text-[11px] text-amber-700 dark:text-amber-400 bg-amber-500/10 p-1.5 rounded-lg border border-amber-500/20 font-medium">
                      ملاحظة: {sale.notes}
                    </div>
                  )}
                </div>

                {/* Total & Action Buttons */}
                <div className="flex items-center justify-between pt-1">
                  <div>
                    <div className="text-[10px] text-muted-foreground">إجمالي السلة:</div>
                    <div className="font-black text-lg text-primary font-mono">
                      {number(sale.total)} ج.م
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    <Button
                      size="sm"
                      variant="outline"
                      className="text-destructive hover:bg-destructive/10 h-9 px-3 gap-1 rounded-xl"
                      onClick={() => handleDiscard(sale.id)}
                      title="إلغاء وحذف هذه السلة المعلقة"
                    >
                      <Trash2 className="w-4 h-4" />
                      <span className="hidden sm:inline text-xs">إلغاء</span>
                    </Button>
                    <Button
                      size="sm"
                      className="gap-2 h-9 px-4 font-bold bg-primary hover:bg-primary/90 text-primary-foreground rounded-xl shadow-sm"
                      onClick={() => handleResume(sale)}
                    >
                      <Play className="w-4 h-4 fill-current" />
                      <span>استعادة ومتابعة البيع</span>
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
