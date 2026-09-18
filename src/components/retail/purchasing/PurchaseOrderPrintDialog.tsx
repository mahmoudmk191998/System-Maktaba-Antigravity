import React, { useRef } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Printer, ShoppingCart } from 'lucide-react';
import type { PurchaseOrder } from '@/types/retail.types';
import { useFormatters } from '@/lib/formatters';

interface PurchaseOrderPrintDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  purchaseOrder: PurchaseOrder | null;
  storeName?: string;
}

export const PurchaseOrderPrintDialog: React.FC<PurchaseOrderPrintDialogProps> = ({
  open,
  onOpenChange,
  purchaseOrder,
  storeName = 'مكتبة ألوان التجارية',
}) => {
  const { number } = useFormatters();
  const printRef = useRef<HTMLDivElement>(null);

  if (!purchaseOrder) return null;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto" dir="rtl">
        <DialogHeader>
          <DialogTitle className="flex items-center justify-between text-base">
            <span className="flex items-center gap-2">
              <ShoppingCart className="w-4 h-4 text-primary" />
              <span>معاينة وطباعة أمر الشراء</span>
            </span>
            <Button size="sm" onClick={() => window.print()} className="gap-1.5 print:hidden">
              <Printer className="w-4 h-4" />
              طباعة (Print)
            </Button>
          </DialogTitle>
        </DialogHeader>

        <div
          ref={printRef}
          id="printable-po"
          className="p-6 bg-white text-black font-sans text-xs rounded border border-gray-200 shadow-sm leading-relaxed"
        >
          {/* Header */}
          <div className="flex justify-between items-start border-b border-gray-300 pb-4 mb-4">
            <div>
              <h2 className="text-lg font-bold text-gray-900">{storeName}</h2>
              <p className="text-gray-600">أمر توريد وشراء بضاعة رسمي</p>
            </div>
            <div className="text-left font-mono">
              <div className="font-bold text-sm text-primary">{purchaseOrder.purchaseOrderNumber}</div>
              <div className="text-gray-500">التاريخ: {purchaseOrder.orderDate}</div>
              <div className="text-gray-500">الحالة: {purchaseOrder.status}</div>
            </div>
          </div>

          {/* Supplier & Destination */}
          <div className="grid grid-cols-2 gap-4 bg-gray-50 p-3 rounded mb-4 border border-gray-100 text-xs">
            <div>
              <span className="text-gray-500 block">إلى المورد / دار النشر:</span>
              <strong className="text-gray-900 text-sm">{purchaseOrder.supplierNameSnapshot}</strong>
            </div>
            <div>
              <span className="text-gray-500 block">موقع التسليم / المستودع:</span>
              <strong className="text-gray-900">{purchaseOrder.destinationLocationId}</strong>
              {purchaseOrder.expectedDeliveryDate && (
                <div className="text-gray-600 mt-0.5">التوريد المتوقع: {purchaseOrder.expectedDeliveryDate}</div>
              )}
            </div>
          </div>

          {/* Table */}
          <table className="w-full text-right text-xs mb-4 border-collapse">
            <thead>
              <tr className="bg-gray-100 border-b border-gray-300 font-bold">
                <th className="p-2">#</th>
                <th className="p-2">الصنف والوصف</th>
                <th className="p-2">SKU</th>
                <th className="p-2 text-center">الكمية</th>
                <th className="p-2 text-left">سعر الوحدة</th>
                <th className="p-2 text-left">الإجمالي</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-200">
              {purchaseOrder.items.map((item, idx) => (
                <tr key={idx}>
                  <td className="p-2 text-gray-500">{idx + 1}</td>
                  <td className="p-2 font-bold">{item.productNameSnapshot}</td>
                  <td className="p-2 font-mono text-gray-600">{item.skuSnapshot}</td>
                  <td className="p-2 text-center font-bold">{item.orderedQuantity}</td>
                  <td className="p-2 text-left">{number(item.unitCost)}</td>
                  <td className="p-2 text-left font-bold">{number(item.lineTotal || item.orderedQuantity * item.unitCost)}</td>
                </tr>
              ))}
            </tbody>
          </table>

          {/* Totals */}
          <div className="border-t border-gray-300 pt-3 flex justify-between items-center text-xs">
            <div>
              {purchaseOrder.notes && (
                <p className="text-gray-600 italic">ملاحظات: {purchaseOrder.notes}</p>
              )}
            </div>
            <div className="w-48 space-y-1 text-left">
              <div className="flex justify-between">
                <span>الإجمالي قبل التكاليف:</span>
                <span>{number(purchaseOrder.subtotal)} ج.م</span>
              </div>
              {Number(purchaseOrder.shippingCost || 0) > 0 && (
                <div className="flex justify-between text-gray-600">
                  <span>الشحن والنقل:</span>
                  <span>+{number(purchaseOrder.shippingCost)} ج.م</span>
                </div>
              )}
              <div className="flex justify-between font-bold text-sm border-t border-gray-300 pt-1 text-primary">
                <span>الإجمالي النهائي:</span>
                <span>{number(purchaseOrder.grandTotal || purchaseOrder.totalAmount || 0)} ج.م</span>
              </div>
            </div>
          </div>

          {/* Signatures */}
          <div className="grid grid-cols-2 gap-8 pt-8 mt-6 border-t border-gray-200 text-center text-[11px] text-gray-600">
            <div>
              <p>توقيع مسؤول المشتريات / الطالب</p>
              <div className="border-b border-gray-300 w-36 mx-auto mt-6" />
            </div>
            <div>
              <p>اعتماد الإدارة / المدير المالي</p>
              <div className="border-b border-gray-300 w-36 mx-auto mt-6" />
            </div>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
};
