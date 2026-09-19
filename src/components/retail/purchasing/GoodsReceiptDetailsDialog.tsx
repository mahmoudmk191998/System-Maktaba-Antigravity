import React from 'react';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { PackageCheck, Printer, Calendar, User, FileText, Building2, Truck, DollarSign } from 'lucide-react';
import type { GoodsReceipt } from '@/types/retail.types';
import { useFormatters } from '@/lib/formatters';

interface GoodsReceiptDetailsDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  goodsReceipt: GoodsReceipt | null;
  onPrint?: () => void;
}

export const GoodsReceiptDetailsDialog: React.FC<GoodsReceiptDetailsDialogProps> = ({
  open,
  onOpenChange,
  goodsReceipt,
  onPrint,
}) => {
  const { number } = useFormatters();

  if (!goodsReceipt) return null;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-3xl max-h-[90vh] flex flex-col p-0 overflow-hidden" dir="rtl">
        <DialogHeader className="p-4 border-b border-border bg-emerald-500/10">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="p-2 rounded-xl bg-emerald-600 text-white shadow-sm">
                <PackageCheck className="w-5 h-5" />
              </div>
              <div>
                <DialogTitle className="text-base sm:text-lg font-bold flex items-center gap-2">
                  <span>إذن استلام بضاعة فعلي</span>
                  <Badge variant="outline" className="font-mono bg-emerald-500/10 text-emerald-700 border-emerald-300">
                    {goodsReceipt.receiptNumber}
                  </Badge>
                </DialogTitle>
                <DialogDescription className="text-xs text-muted-foreground mt-0.5">
                  أمر الشراء: {goodsReceipt.purchaseOrderNumberSnapshot || 'توريد مباشر'} | المورد: {goodsReceipt.supplierNameSnapshot}
                </DialogDescription>
              </div>
            </div>

            {onPrint && (
              <Button
                size="sm"
                variant="outline"
                onClick={onPrint}
                className="gap-1.5 text-xs h-8 border-emerald-300 text-emerald-700 hover:bg-emerald-50"
              >
                <Printer className="w-3.5 h-3.5" />
                <span>طباعة السند</span>
              </Button>
            )}
          </div>
        </DialogHeader>

        <div className="flex-1 overflow-y-auto p-4 space-y-4 text-xs">
          {/* Metadata Cards */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5 p-3 rounded-xl bg-muted/30 border border-border">
            <div>
              <span className="text-muted-foreground block text-[10px]">تاريخ ووقت الاستلام</span>
              <span className="font-bold flex items-center gap-1 mt-0.5">
                <Calendar className="w-3.5 h-3.5 text-muted-foreground" />
                {new Date(goodsReceipt.receivedAt || goodsReceipt.createdAt).toLocaleDateString('ar-EG', {
                  year: 'numeric',
                  month: 'short',
                  day: 'numeric',
                  hour: '2-digit',
                  minute: '2-digit',
                })}
              </span>
            </div>

            <div>
              <span className="text-muted-foreground block text-[10px]">المستلم المسؤول</span>
              <span className="font-bold flex items-center gap-1 mt-0.5">
                <User className="w-3.5 h-3.5 text-muted-foreground" />
                {goodsReceipt.receivedBy || 'أمين المستودع'}
              </span>
            </div>

            <div>
              <span className="text-muted-foreground block text-[10px]">فاتورة المورد</span>
              <span className="font-bold font-mono text-foreground mt-0.5 block">
                {goodsReceipt.supplierInvoiceNumber || 'غير محددة'}
              </span>
            </div>

            <div>
              <span className="text-muted-foreground block text-[10px]">بوليصة التسليم</span>
              <span className="font-bold font-mono text-foreground mt-0.5 block">
                {goodsReceipt.supplierDeliveryNote || 'غير محددة'}
              </span>
            </div>
          </div>

          {/* Items Table */}
          <div className="border border-border rounded-xl overflow-hidden">
            <table className="w-full text-right text-xs">
              <thead className="bg-muted/60 border-b border-border text-muted-foreground font-bold">
                <tr>
                  <th className="p-3">الصنف / الكتاب</th>
                  <th className="p-3 text-center">الكمية المقبولة</th>
                  <th className="p-3 text-center">المرفوض</th>
                  <th className="p-3 text-left">سعر الشراء</th>
                  <th className="p-3 text-left">التكلفة الفعلية</th>
                  <th className="p-3 text-left">الإجمالي</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border bg-card">
                {goodsReceipt.items.map((item, idx) => (
                  <tr key={idx} className="hover:bg-muted/30">
                    <td className="p-3">
                      <div className="font-bold text-foreground">{item.productNameSnapshot}</div>
                      {item.skuSnapshot && (
                        <div className="text-[10px] text-muted-foreground font-mono">{item.skuSnapshot}</div>
                      )}
                    </td>
                    <td className="p-3 text-center font-bold text-emerald-600">
                      {number(item.acceptedQuantity)}
                    </td>
                    <td className="p-3 text-center">
                      {item.rejectedQuantity > 0 ? (
                        <span className="text-destructive font-bold">
                          {number(item.rejectedQuantity)}
                          {item.rejectionReason && (
                            <span className="block text-[9px] text-muted-foreground font-normal">
                              ({item.rejectionReason})
                            </span>
                          )}
                        </span>
                      ) : (
                        <span className="text-muted-foreground/60">-</span>
                      )}
                    </td>
                    <td className="p-3 text-left font-mono">{number(item.unitPurchaseCost)} ج.م</td>
                    <td className="p-3 text-left font-mono font-bold text-foreground">
                      {number(item.effectiveUnitCost || item.unitPurchaseCost)} ج.م
                    </td>
                    <td className="p-3 text-left font-mono font-bold text-foreground">
                      {number(item.lineTotal)} ج.م
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {/* Totals Summary */}
          <div className="p-3.5 rounded-xl bg-card border border-border flex flex-wrap justify-between items-center gap-3">
            <div className="text-xs text-muted-foreground space-y-1">
              {goodsReceipt.extraCosts ? (
                <div>مصاريف شحن وتخليص موزعة: <strong className="text-foreground">{number(goodsReceipt.extraCosts)} ج.م</strong></div>
              ) : null}
              {goodsReceipt.notes ? (
                <div>ملاحظات: <span className="text-foreground">{goodsReceipt.notes}</span></div>
              ) : null}
            </div>

            <div className="text-left space-y-1">
              <div className="text-xs text-muted-foreground">إجمالي قيمة الفاتورة الفعلية (GRN Total)</div>
              <div className="text-xl font-black text-emerald-600 font-mono">
                {number(goodsReceipt.grandTotal)} ج.م
              </div>
            </div>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
};
