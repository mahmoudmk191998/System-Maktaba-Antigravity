import React, { useRef } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Printer, RotateCcw } from 'lucide-react';
import type { SaleReturn } from '@/types/retail.types';
import { useFormatters } from '@/lib/formatters';
import { useAppStore } from '@/lib/store';

interface ReturnReceiptDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  saleReturn: SaleReturn | null;
  storeName?: string;
  storePhone?: string;
  storeAddress?: string;
}

export const ReturnReceiptDialog: React.FC<ReturnReceiptDialogProps> = ({
  open,
  onOpenChange,
  saleReturn,
  storeName,
  storePhone,
  storeAddress,
}) => {
  const { settings, currentTenant, currentBranch } = useAppStore();
  const { number, date } = useFormatters();
  const printRef = useRef<HTMLDivElement>(null);

  const effectiveStoreName = settings.invoiceCompanyName || storeName || currentTenant?.name || 'مكتبة ألوان التجارية';
  const effectiveStorePhone = settings.invoicePhone || storePhone || currentBranch?.phone || '';
  const effectiveStoreAddress = settings.invoiceAddress || storeAddress || currentBranch?.address || '';
  const effectiveTaxNumber = settings.invoiceTaxNumber || currentTenant?.taxNumber || '';
  const effectiveLogo = settings.invoiceLogo || '';

  if (!saleReturn) return null;

  const handlePrint = () => {
    window.print();
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md max-h-[90vh] overflow-y-auto" dir="rtl">
        <DialogHeader>
          <DialogTitle className="flex items-center justify-between text-base">
            <span className="flex items-center gap-2">
              <RotateCcw className="w-4 h-4 text-amber-600" />
              <span>معاينة إيصال مرتجع المبيعات</span>
            </span>
            <Button size="sm" onClick={handlePrint} className="gap-1.5 print:hidden">
              <Printer className="w-4 h-4" />
              طباعة (Print)
            </Button>
          </DialogTitle>
        </DialogHeader>

        {/* Printable Return Receipt Area */}
        <div
          ref={printRef}
          id="printable-return-receipt"
          className="p-4 bg-white text-black font-mono text-xs rounded border border-gray-200 shadow-sm leading-tight select-text"
          style={{ width: '100%', maxWidth: '300px', margin: '0 auto' }}
        >
          {/* Logo if configured */}
          {effectiveLogo && (
            <div className="flex justify-center mb-2">
              <img
                src={effectiveLogo}
                alt="Logo"
                className="max-h-12 max-w-[140px] object-contain filter grayscale"
              />
            </div>
          )}

          {/* Header */}
          <div className="text-center border-b border-dashed border-gray-400 pb-2 mb-2">
            <h2 className="text-sm font-bold text-gray-900">{effectiveStoreName}</h2>
            {effectiveStoreAddress && <p className="text-[11px] text-gray-700">{effectiveStoreAddress}</p>}
            {effectiveStorePhone && <p className="text-[10px] text-gray-600">هاتف: {effectiveStorePhone}</p>}
            {effectiveTaxNumber && (
              <p className="text-[10px] text-gray-700 font-semibold mt-0.5">
                الرقم الضريبي: {effectiveTaxNumber}
              </p>
            )}
            <div className="mt-1 font-bold text-xs bg-amber-100 text-amber-900 py-0.5 rounded">
              إيصال مرتجع مبيعات رسمي
            </div>
          </div>

          {/* Metadata */}
          <div className="text-[11px] space-y-0.5 border-b border-dashed border-gray-400 pb-2 mb-2">
            <div className="flex justify-between">
              <span className="text-gray-600">رقم المرتجع:</span>
              <span className="font-bold">{saleReturn.returnNumber}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-gray-600">الفاتورة الأصلية:</span>
              <span className="font-bold">{saleReturn.invoiceNumberSnapshot}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-gray-600">التاريخ والوقت:</span>
              <span>{new Date(saleReturn.createdAt).toLocaleString('ar-EG')}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-gray-600">المسؤول:</span>
              <span>{saleReturn.processedBy || 'كاشير'}</span>
            </div>
            {saleReturn.customerNameSnapshot && (
              <div className="flex justify-between">
                <span className="text-gray-600">العميل:</span>
                <span>{saleReturn.customerNameSnapshot}</span>
              </div>
            )}
          </div>

          {/* Returned Items */}
          <table className="w-full text-right text-[11px] mb-2 border-b border-dashed border-gray-400 pb-2">
            <thead>
              <tr className="border-b border-gray-300 font-bold">
                <th className="py-1">الصنف المرتجع</th>
                <th className="py-1 text-center">الكمية</th>
                <th className="py-1 text-left">المسترد</th>
              </tr>
            </thead>
            <tbody>
              {saleReturn.items.map((item, idx) => (
                <tr key={idx} className="border-b border-gray-100">
                  <td className="py-1 pr-0.5">
                    <div className="font-semibold text-gray-900">{item.productNameSnapshot}</div>
                    <div className="text-[9px] text-gray-500">
                      الحالة: {item.condition === 'resellable' ? 'صالح (إعادة للمخزن)' : 'تالف'}
                    </div>
                  </td>
                  <td className="py-1 text-center align-top font-bold">{item.quantity}</td>
                  <td className="py-1 text-left align-top font-bold">{number(item.refundLineAmount)}</td>
                </tr>
              ))}
            </tbody>
          </table>

          {/* Financial Totals */}
          <div className="space-y-1 text-[11px] border-b border-dashed border-gray-400 pb-2 mb-2">
            <div className="flex justify-between">
              <span>المجموع المرتجع:</span>
              <span>{number(saleReturn.subtotalReturned)} ج.م</span>
            </div>
            {saleReturn.discountReversed > 0 && (
              <div className="flex justify-between text-red-600">
                <span>خصم مسترجع:</span>
                <span>-{number(saleReturn.discountReversed)} ج.م</span>
              </div>
            )}
            {saleReturn.taxReversed > 0 && (
              <div className="flex justify-between">
                <span>ضريبة مسترجعة:</span>
                <span>+{number(saleReturn.taxReversed)} ج.م</span>
              </div>
            )}
            <div className="flex justify-between text-sm font-black border-t border-gray-300 pt-1 text-amber-900">
              <span>إجمالي المبلغ المسترد للعميل:</span>
              <span>{number(saleReturn.refundAmount)} ج.م</span>
            </div>
            <div className="flex justify-between text-[10px] text-gray-600 pt-0.5">
              <span>طريقة الاسترداد:</span>
              <span className="font-bold">{saleReturn.refundMethod === 'cash' ? 'نقداً (Cash)' : saleReturn.refundMethod}</span>
            </div>
          </div>

          {/* Footer */}
          <div className="text-center text-[10px] text-gray-600 space-y-1">
            <p>تم استلام البضاعة المرتجعة وتسوية الحساب</p>
            <p className="font-mono text-[9px] text-gray-400">*{saleReturn.returnNumber}*</p>
          </div>
        </div>

        {/* CSS Print Styles */}
        <style>{`
          @media print {
            body * {
              visibility: hidden;
            }
            #printable-return-receipt, #printable-return-receipt * {
              visibility: visible;
            }
            #printable-return-receipt {
              position: absolute;
              left: 0;
              top: 0;
              width: 80mm !important;
              max-width: 80mm !important;
              padding: 5mm !important;
              margin: 0 !important;
              border: none !important;
              box-shadow: none !important;
            }
          }
        `}</style>

        <DialogFooter className="flex gap-2 sm:justify-between">
          <Button variant="outline" size="sm" onClick={() => onOpenChange(false)}>
            إغلاق
          </Button>
          <Button size="sm" onClick={handlePrint} className="gap-1.5 bg-amber-600 hover:bg-amber-700 text-white">
            <Printer className="w-4 h-4" />
            طباعة إيصال المرتجع
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};
