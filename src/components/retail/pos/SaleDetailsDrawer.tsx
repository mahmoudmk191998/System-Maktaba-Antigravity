import React, { useState } from 'react';
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetDescription,
} from '@/components/ui/sheet';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Printer, TrendingUp, ShieldCheck, DollarSign, Calendar, User, ShoppingBag, RotateCcw, Tag } from 'lucide-react';
import type { Sale } from '@/types/retail.types';
import { useFormatters } from '@/lib/formatters';
import { ReceiptDialog } from './ReceiptDialog';
import { ReturnModal } from '../returns/ReturnModal';

interface SaleDetailsDrawerProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  sale: Sale | null;
}

export const SaleDetailsDrawer: React.FC<SaleDetailsDrawerProps> = ({
  open,
  onOpenChange,
  sale,
}) => {
  const { number } = useFormatters();
  const [showReceipt, setShowReceipt] = useState(false);
  const [showReturnModal, setShowReturnModal] = useState(false);

  if (!sale) return null;

  return (
    <>
      <Sheet open={open} onOpenChange={onOpenChange}>
        <SheetContent side="left" className="w-full sm:max-w-xl overflow-y-auto" dir="rtl">
          <SheetHeader className="border-b border-border pb-3">
            <div className="flex items-center justify-between">
              <SheetTitle className="text-xl font-bold flex items-center gap-2">
                <span>تفاصيل الفاتورة: {sale.invoiceNumber}</span>
              </SheetTitle>
              <div className="flex items-center gap-2">
                <Button
                  size="sm"
                  variant="outline"
                  className="gap-1.5 font-semibold text-xs"
                  onClick={() => setShowReceipt(true)}
                >
                  <Printer className="w-3.5 h-3.5" />
                  طباعة إيصال
                </Button>
                <Button
                  size="sm"
                  className={`gap-1.5 font-bold text-xs text-white ${
                    sale.returnStatus === 'full'
                      ? 'bg-muted-foreground cursor-not-allowed'
                      : 'bg-amber-600 hover:bg-amber-700'
                  }`}
                  disabled={sale.returnStatus === 'full'}
                  onClick={() => setShowReturnModal(true)}
                >
                  <RotateCcw className="w-3.5 h-3.5" />
                  {sale.returnStatus === 'full' ? 'مسترجعة بالكامل' : 'مرتجع / استبدال'}
                </Button>
              </div>
            </div>
            <SheetDescription className="text-xs text-muted-foreground flex flex-wrap gap-x-4 gap-y-1 pt-1">
              <span className="flex items-center gap-1">
                <Calendar className="w-3.5 h-3.5" />
                {new Date(sale.createdAt).toLocaleString('ar-EG')}
              </span>
              <span className="flex items-center gap-1">
                <User className="w-3.5 h-3.5" />
                الكاشير: {sale.cashierNameSnapshot || 'كاشير'}
              </span>
              <span className="flex items-center gap-1">
                العميل: {sale.customerNameSnapshot || 'نقدي'}
              </span>
            </SheetDescription>
          </SheetHeader>

          <div className="space-y-6 py-4">
            {/* Badges Bar */}
            <div className="flex flex-wrap gap-2">
              <Badge variant="outline" className="bg-emerald-500/10 text-emerald-600 border-emerald-500/30">
                الحالة: مكتملة ومرحلة
              </Badge>
              {sale.returnStatus === 'full' && (
                <Badge variant="outline" className="bg-destructive/10 text-destructive border-destructive/30 font-bold">
                  مرتجعة بالكامل (Fully Returned)
                </Badge>
              )}
              {sale.returnStatus === 'partial' && (
                <Badge variant="outline" className="bg-amber-500/10 text-amber-600 border-amber-500/30 font-bold">
                  مرتجعة جزئياً (Partially Returned)
                </Badge>
              )}
              <Badge variant="outline" className={sale.saleType === 'wholesale' ? 'bg-indigo-500/10 text-indigo-600 border-indigo-500/30' : 'bg-muted'}>
                {sale.saleType === 'wholesale' ? 'بيع جملة' : 'بيع تجزئة'}
              </Badge>
              {sale.idempotencyKey && (
                <Badge variant="outline" className="text-[10px] text-muted-foreground bg-muted/40">
                  <ShieldCheck className="w-3 h-3 mr-1 inline text-blue-500" />
                  معاملة ذرية آمنة (Idempotent)
                </Badge>
              )}
            </div>

            {/* Returned summary banner if applicable */}
            {Number(sale.returnedAmount || 0) > 0 && (
              <div className="p-3 bg-amber-500/10 border border-amber-500/30 rounded-xl flex items-center justify-between text-xs text-amber-900">
                <span className="flex items-center gap-2 font-bold">
                  <RotateCcw className="w-4 h-4 text-amber-600" />
                  <span>إجمالي المبالغ المستردة من هذه الفاتورة:</span>
                </span>
                <span className="font-extrabold text-sm text-destructive">
                  {number(sale.returnedAmount || 0)} ج.م
                </span>
              </div>
            )}

            {/* Financial Overview Cards */}
            <div className="grid grid-cols-3 gap-2">
              <div className="p-3 bg-muted/40 rounded-xl border border-border text-center space-y-1">
                <span className="text-[11px] text-muted-foreground block">إجمالي الإيراد</span>
                <span className="text-base font-bold text-foreground">{number(sale.total)} ج.م</span>
              </div>
              <div className="p-3 bg-muted/40 rounded-xl border border-border text-center space-y-1">
                <span className="text-[11px] text-muted-foreground block">تكلفة البضاعة المباعة</span>
                <span className="text-base font-bold text-muted-foreground">{number(sale.costTotal || 0)} ج.م</span>
              </div>
              <div className="p-3 bg-emerald-500/10 rounded-xl border border-emerald-500/20 text-center space-y-1">
                <span className="text-[11px] text-emerald-600 block font-semibold flex items-center justify-center gap-1">
                  <TrendingUp className="w-3.5 h-3.5" />
                  مجمل الربح
                </span>
                <span className="text-base font-extrabold text-emerald-600">{number(sale.grossProfit || 0)} ج.م</span>
              </div>
            </div>

            {/* Invoice Financial Breakdown (Subtotal, Discount, Taxes, Grand Total) */}
            <div className="p-3 bg-card rounded-xl border border-border space-y-2 text-xs">
              <div className="flex justify-between items-center text-muted-foreground">
                <span>المجموع الفرعي للأصناف:</span>
                <span className="font-semibold text-foreground">{number(sale.subtotal)} ج.م</span>
              </div>
              {Number(sale.discountTotal || sale.discount || 0) > 0 && (
                <div className="flex justify-between items-center text-red-600 font-semibold">
                  <span className="flex items-center gap-1.5">
                    <Tag className="w-3.5 h-3.5" />
                    <span>إجمالي الخصم الممنوح:</span>
                    {sale.discountType === 'percentage' && sale.discountValue && (
                      <Badge variant="outline" className="text-[10px] px-1 py-0 h-4 border-red-300 text-red-600">
                        {sale.discountValue}%
                      </Badge>
                    )}
                  </span>
                  <span>-{number(sale.discountTotal || sale.discount || 0)} ج.م</span>
                </div>
              )}
              {Number(sale.serviceChargeTotal || sale.serviceCharge || 0) > 0 && (
                <div className="flex justify-between items-center text-muted-foreground">
                  <span>رسوم الخدمة ({sale.serviceChargeRate || 0}%):</span>
                  <span>+{number(sale.serviceChargeTotal || sale.serviceCharge || 0)} ج.م</span>
                </div>
              )}
              {Number(sale.taxTotal || sale.tax || 0) > 0 && (
                <div className="flex justify-between items-center text-muted-foreground">
                  <span>ضريبة القيمة المضافة:</span>
                  <span>+{number(sale.taxTotal || sale.tax || 0)} ج.م</span>
                </div>
              )}
              <div className="flex justify-between items-center pt-2 border-t border-border font-bold text-sm text-foreground">
                <span>المبلغ النهائي المطلوب:</span>
                <span className="text-primary font-black">{number(sale.total)} ج.م</span>
              </div>
            </div>

            {/* Line Items Historical Snapshot */}
            <div className="space-y-2">
              <h4 className="text-sm font-bold flex items-center gap-1.5">
                <ShoppingBag className="w-4 h-4 text-primary" />
                <span>أصناف الفاتورة (لقطة تاريخية غير قابلة للتغيير)</span>
              </h4>
              <div className="border border-border rounded-xl overflow-hidden divide-y divide-border">
                {sale.items?.map((item, idx) => (
                  <div key={idx} className="p-3 bg-card/50 text-xs space-y-1.5">
                    <div className="flex justify-between items-start">
                      <div>
                        <span className="font-bold text-sm text-foreground">{item.productNameSnapshot}</span>
                        {item.variantNameSnapshot && (
                          <span className="mr-1.5 text-muted-foreground">({item.variantNameSnapshot})</span>
                        )}
                        <div className="text-[10px] text-muted-foreground font-mono mt-0.5">
                          SKU: {item.skuSnapshot} {item.barcodeSnapshot ? `| Barcode: ${item.barcodeSnapshot}` : ''}
                        </div>
                      </div>
                      <div className="text-left font-bold text-sm text-foreground">
                        {number(item.lineTotal)} ج.م
                      </div>
                    </div>

                    <div className="grid grid-cols-4 gap-2 pt-1 border-t border-border/50 text-[11px] text-muted-foreground">
                      <div>الكمية: <strong className="text-foreground">{item.quantity}</strong></div>
                      <div>سعر البيع: <strong className="text-foreground">{number(item.unitSellingPrice)}</strong></div>
                      <div>التكلفة للوحدة: <strong className="text-foreground">{number(item.unitCostSnapshot || 0)}</strong></div>
                      <div>ربح السطر: <strong className="text-emerald-600">+{number(item.grossProfit || 0)}</strong></div>
                    </div>
                  </div>
                ))}
              </div>
            </div>

            {/* Payments Summary */}
            <div className="space-y-2">
              <h4 className="text-sm font-bold flex items-center gap-1.5">
                <DollarSign className="w-4 h-4 text-primary" />
                <span>المدفوعات والمتحصلات</span>
              </h4>
              <div className="p-3 bg-muted/40 rounded-xl border border-border space-y-2 text-xs">
                {sale.paymentMethods?.map((pm, pIdx) => (
                  <div key={pIdx} className="flex justify-between items-center">
                    <Badge variant="secondary" className="text-xs">
                      {pm.method === 'cash' ? 'نقداً (Cash)' : pm.method === 'visa' ? 'بطاقة ائتمان' : pm.method}
                    </Badge>
                    <span className="font-bold">{number(pm.amount)} ج.م</span>
                  </div>
                ))}
                {sale.changeAmount > 0 && (
                  <div className="flex justify-between items-center pt-2 border-t border-border text-emerald-600 font-bold">
                    <span>الباقي المنصرف للعميل:</span>
                    <span>{number(sale.changeAmount)} ج.م</span>
                  </div>
                )}
              </div>
            </div>
          </div>
        </SheetContent>
      </Sheet>

      {/* Printable Receipt Preview */}
      <ReceiptDialog
        open={showReceipt}
        onOpenChange={setShowReceipt}
        sale={sale}
      />

      {/* Return & Exchange Processing Modal */}
      <ReturnModal
        open={showReturnModal}
        onOpenChange={setShowReturnModal}
        sale={sale}
      />
    </>
  );
};
