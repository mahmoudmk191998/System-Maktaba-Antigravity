import React, { useRef } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Printer, PackageCheck } from 'lucide-react';
import type { GoodsReceipt } from '@/types/retail.types';
import { useFormatters } from '@/lib/formatters';

interface GoodsReceiptPrintDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  goodsReceipt: GoodsReceipt | null;
  storeName?: string;
}

export const GoodsReceiptPrintDialog: React.FC<GoodsReceiptPrintDialogProps> = ({
  open,
  onOpenChange,
  goodsReceipt,
  storeName = 'مكتبة ألوان التجارية',
}) => {
  const { number } = useFormatters();
  const printRef = useRef<HTMLDivElement>(null);

  if (!goodsReceipt) return null;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto" dir="rtl">
        <DialogHeader>
          <DialogTitle className="flex items-center justify-between text-base">
            <span className="flex items-center gap-2">
              <PackageCheck className="w-4 h-4 text-emerald-600" />
              <span>معاينة وطباعة إذن استلام بضاعة (GRN)</span>
            </span>
            <Button size="sm" onClick={() => window.print()} className="gap-1.5 print:hidden">
              <Printer className="w-4 h-4" />
              طباعة (Print)
            </Button>
          </DialogTitle>
        </DialogHeader>

        <div
          ref={printRef}
          id="printable-grn"
          className="p-6 bg-white text-black font-sans text-xs rounded border border-gray-200 shadow-sm leading-relaxed"
        >
          {/* Header */}
          <div className="flex justify-between items-start border-b border-gray-300 pb-4 mb-4">
            <div>
              <h2 className="text-lg font-bold text-gray-900">{storeName}</h2>
              <p className="text-gray-600">إذن فحص واستلام بضاعة مخزنية (GRN)</p>
            </div>
            <div className="text-left font-mono">
              <div className="font-bold text-sm text-emerald-700">{goodsReceipt.receiptNumber}</div>
              <div className="text-gray-500">التاريخ: {new Date(goodsReceipt.receivedAt).toLocaleDateString('ar-EG')}</div>
              <div className="text-gray-500">أمر الشراء: {goodsReceipt.purchaseOrderNumberSnapshot}</div>
            </div>
          </div>

          {/* Supplier & Location */}
          <div className="grid grid-cols-2 gap-4 bg-gray-50 p-3 rounded mb-4 border border-gray-100 text-xs">
            <div>
              <span className="text-gray-500 block">المورد / دار النشر:</span>
              <strong className="text-gray-900 text-sm">{goodsReceipt.supplierNameSnapshot}</strong>
              {goodsReceipt.supplierInvoiceNumber && (
                <div className="text-gray-600 mt-0.5">فاتورة المورد: {goodsReceipt.supplierInvoiceNumber}</div>
              )}
            </div>
            <div>
              <span className="text-gray-500 block">موقع الاستلام / المستودع:</span>
              <strong className="text-gray-900">{goodsReceipt.destinationLocationId}</strong>
              <div className="text-gray-600 mt-0.5">أمين المخزن المستلم: {goodsReceipt.receivedBy}</div>
            </div>
          </div>

          {/* Items Table */}
          <table className="w-full text-right text-xs mb-4 border-collapse">
            <thead>
              <tr className="bg-gray-100 border-b border-gray-300 font-bold">
                <th className="p-2">#</th>
                <th className="p-2">الصنف المستلم</th>
                <th className="p-2">SKU</th>
                <th className="p-2 text-center">المستلم</th>
                <th className="p-2 text-center text-emerald-700">المقبول (سليم)</th>
                <th className="p-2 text-center text-red-700">المرفوض (تالف)</th>
                <th className="p-2 text-left">التكلفة الفعالة</th>
                <th className="p-2 text-left">إجمالي القيمة</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-200">
              {goodsReceipt.items.map((item, idx) => (
                <tr key={idx}>
                  <td className="p-2 text-gray-500">{idx + 1}</td>
                  <td className="p-2 font-bold">{item.productNameSnapshot}</td>
                  <td className="p-2 font-mono text-gray-600">{item.skuSnapshot}</td>
                  <td className="p-2 text-center font-bold">{item.receivedQuantity}</td>
                  <td className="p-2 text-center font-bold text-emerald-700">{item.acceptedQuantity}</td>
                  <td className="p-2 text-center font-bold text-red-700">{item.rejectedQuantity || 0}</td>
                  <td className="p-2 text-left">{number(item.effectiveUnitCost || item.unitPurchaseCost)}</td>
                  <td className="p-2 text-left font-bold">{number(item.lineTotal)}</td>
                </tr>
              ))}
            </tbody>
          </table>

          {/* Totals & Notes */}
          <div className="border-t border-gray-300 pt-3 flex justify-between items-center text-xs">
            <div>
              {goodsReceipt.notes && (
                <p className="text-gray-600 italic">ملاحظات الاستلام: {goodsReceipt.notes}</p>
              )}
            </div>
            <div className="w-52 space-y-1 text-left">
              <div className="flex justify-between">
                <span>قيمة البضاعة المقبولة:</span>
                <span>{number(goodsReceipt.subtotal)} ج.م</span>
              </div>
              {Number(goodsReceipt.extraCosts || 0) > 0 && (
                <div className="flex justify-between text-gray-600">
                  <span>مصاريف الشحن والتفريغ:</span>
                  <span>+{number(goodsReceipt.extraCosts)} ج.م</span>
                </div>
              )}
              <div className="flex justify-between font-bold text-sm border-t border-gray-300 pt-1 text-emerald-700">
                <span>إجمالي قيد التزام المورد:</span>
                <span>{number(goodsReceipt.grandTotal)} ج.م</span>
              </div>
            </div>
          </div>

          {/* Signatures */}
          <div className="grid grid-cols-2 gap-8 pt-8 mt-6 border-t border-gray-200 text-center text-[11px] text-gray-600">
            <div>
              <p>توقيع أمين المستودع / الفاحص المستلم</p>
              <div className="border-b border-gray-300 w-36 mx-auto mt-6" />
            </div>
            <div>
              <p>توقيع مندوب / سائق المورد للتسليم</p>
              <div className="border-b border-gray-300 w-36 mx-auto mt-6" />
            </div>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
};
