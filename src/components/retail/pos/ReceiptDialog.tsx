import React, { useRef, useState, useEffect } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Printer, ChefHat, Receipt as ReceiptIcon } from 'lucide-react';
import type { Sale } from '@/types/retail.types';
import { useFormatters } from '@/lib/formatters';
import { useAppStore } from '@/lib/store';

interface ReceiptDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  sale: Sale | null;
  storeName?: string;
  storePhone?: string;
  storeAddress?: string;
}

export const ReceiptDialog: React.FC<ReceiptDialogProps> = ({
  open,
  onOpenChange,
  sale,
  storeName,
  storePhone,
  storeAddress,
}) => {
  const { settings, currentTenant, currentBranch } = useAppStore();
  const { number, date } = useFormatters();
  const printRef = useRef<HTMLDivElement>(null);
  const [viewMode, setViewMode] = useState<'receipt' | 'kitchen'>('receipt');

  // Effective values resolved from settings, props, and active tenant/branch
  const effectiveStoreName = settings.invoiceCompanyName || storeName || currentTenant?.name || 'مكتبة ألوان التجارية';
  const effectiveStorePhone = settings.invoicePhone || storePhone || currentBranch?.phone || '';
  const effectiveStoreAddress = settings.invoiceAddress || storeAddress || currentBranch?.address || '';
  const effectiveTaxNumber = settings.invoiceTaxNumber || currentTenant?.taxNumber || '';
  const effectiveLogo = settings.invoiceLogo || '';
  const effectiveWelcomeMessage = settings.receiptWelcomeMessage || 'شكراً لزيارتكم ونسعد بخدمتكم دائماً';

  // Auto-print receipt if enabled in settings
  useEffect(() => {
    if (open && sale && settings.autoPrintReceipt) {
      const timer = setTimeout(() => {
        window.print();
      }, 400);
      return () => clearTimeout(timer);
    }
  }, [open, sale, settings.autoPrintReceipt]);

  // Reset view mode to receipt when dialog opens
  useEffect(() => {
    if (open) {
      setViewMode('receipt');
    }
  }, [open]);

  if (!sale) return null;

  const handlePrint = () => {
    window.print();
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md max-h-[90vh] overflow-y-auto" dir="rtl">
        <DialogHeader>
          <DialogTitle className="flex items-center justify-between text-base">
            <div className="flex items-center gap-2">
              <span>{viewMode === 'receipt' ? 'معاينة إيصال البيع الحراري' : 'تذكرة التحضير والتجهيز'}</span>
              {settings.printKitchenTicket && (
                <div className="flex gap-1 print:hidden bg-muted p-0.5 rounded-lg text-xs">
                  <button
                    type="button"
                    onClick={() => setViewMode('receipt')}
                    className={`px-2 py-1 rounded flex items-center gap-1 transition-colors ${
                      viewMode === 'receipt' ? 'bg-background shadow-xs font-semibold text-foreground' : 'text-muted-foreground hover:text-foreground'
                    }`}
                  >
                    <ReceiptIcon className="w-3.5 h-3.5" />
                    <span>الفاتورة</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => setViewMode('kitchen')}
                    className={`px-2 py-1 rounded flex items-center gap-1 transition-colors ${
                      viewMode === 'kitchen' ? 'bg-background shadow-xs font-semibold text-foreground' : 'text-muted-foreground hover:text-foreground'
                    }`}
                  >
                    <ChefHat className="w-3.5 h-3.5" />
                    <span>تذكرة التحضير</span>
                  </button>
                </div>
              )}
            </div>
            <Button size="sm" onClick={handlePrint} className="gap-1.5 print:hidden">
              <Printer className="w-4 h-4" />
              طباعة
            </Button>
          </DialogTitle>
        </DialogHeader>

        {viewMode === 'receipt' ? (
          /* Printable Thermal Receipt Area */
          <div
            ref={printRef}
            id="printable-receipt"
            className="p-4 bg-white text-black font-mono text-xs rounded border border-gray-200 shadow-sm leading-tight select-text"
            style={{ width: '100%', maxWidth: '300px', margin: '0 auto' }}
          >
            {/* Logo if configured */}
            {effectiveLogo && (
              <div className="flex justify-center mb-2">
                <img
                  src={effectiveLogo}
                  alt="Logo"
                  className="max-h-14 max-w-[150px] object-contain filter grayscale"
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
              <div className="mt-1 font-bold text-xs bg-gray-100 py-0.5 rounded">
                فاتورة مبيعات ضريبية
              </div>
            </div>

            {/* Metadata */}
            <div className="text-[11px] space-y-0.5 border-b border-dashed border-gray-400 pb-2 mb-2">
              <div className="flex justify-between">
                <span className="text-gray-600">رقم الفاتورة:</span>
                <span className="font-bold">{sale.invoiceNumber}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-gray-600">التاريخ والوقت:</span>
                <span>{date(sale.createdAt, 'datetime')}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-gray-600">الكاشير:</span>
                <span>{sale.cashierNameSnapshot || 'كاشير'}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-gray-600">العميل:</span>
                <span>{sale.customerNameSnapshot || 'عميل نقدي'}</span>
              </div>
              {sale.priceTierUsed === 'wholesale' && (
                <div className="flex justify-between font-bold text-indigo-700">
                  <span>فئة السعر:</span>
                  <span>سعر جملة (Wholesale)</span>
                </div>
              )}
            </div>

            {/* Items Table */}
            <table className="w-full text-right text-[11px] mb-2 border-b border-dashed border-gray-400 pb-2">
              <thead>
                <tr className="border-b border-gray-300 font-bold">
                  <th className="py-1">الصنف</th>
                  <th className="py-1 text-center">الكمية</th>
                  <th className="py-1 text-left">السعر</th>
                  <th className="py-1 text-left">الإجمالي</th>
                </tr>
              </thead>
              <tbody>
                {sale.items.map((item, idx) => (
                  <tr key={idx} className="border-b border-gray-100">
                    <td className="py-1 pr-0.5">
                      <div className="font-semibold text-gray-900">{item.productNameSnapshot}</div>
                      {item.variantNameSnapshot && (
                        <div className="text-[10px] text-gray-600">{item.variantNameSnapshot}</div>
                      )}
                      {item.discountAmount > 0 && (
                        <div className="text-[9px] text-red-600">خصم: -{number(item.discountAmount)} ج.م</div>
                      )}
                    </td>
                    <td className="py-1 text-center align-top">
                      {item.quantity} {item.conversionFactor > 1 ? `(x${item.conversionFactor})` : ''}
                    </td>
                    <td className="py-1 text-left align-top">{number(item.unitSellingPrice)}</td>
                    <td className="py-1 text-left align-top font-bold">{number(item.lineTotal)}</td>
                  </tr>
                ))}
              </tbody>
            </table>

            {/* Financial Totals */}
            <div className="space-y-1 text-[11px] border-b border-dashed border-gray-400 pb-2 mb-2">
              <div className="flex justify-between">
                <span>المجموع الفرعي:</span>
                <span>{number(sale.subtotal)} ج.م</span>
              </div>
              {sale.discountTotal > 0 && (
                <div className="flex justify-between text-red-600 font-semibold">
                  <span>
                    إجمالي الخصم
                    {sale.discountType === 'percentage' && sale.discountValue ? ` (${sale.discountValue}%):` : ':'}
                  </span>
                  <span>-{number(sale.discountTotal)} ج.م</span>
                </div>
              )}
              {(sale.serviceChargeTotal || sale.serviceCharge || 0) > 0 && (
                <div className="flex justify-between text-gray-700">
                  <span>رسوم الخدمة ({sale.serviceChargeRate || 0}%):</span>
                  <span>{sale.serviceChargeIncluded ? '(شاملة) ' : '+'}{number(sale.serviceChargeTotal || sale.serviceCharge || 0)} ج.م</span>
                </div>
              )}
              {sale.taxTotal > 0 && (
                <div className="flex justify-between text-gray-700">
                  <span>ضريبة القيمة المضافة:</span>
                  <span>{sale.taxIncluded ? '(شاملة) ' : '+'}{number(sale.taxTotal)} ج.م</span>
                </div>
              )}
              <div className="flex justify-between text-sm font-bold border-t border-gray-300 pt-1 text-gray-900">
                <span>المبلغ الإجمالي المطلوب:</span>
                <span>{number(sale.total)} ج.م</span>
              </div>
            </div>

            {/* Payments & Change */}
            <div className="space-y-0.5 text-[11px] border-b border-dashed border-gray-400 pb-2 mb-2">
              {sale.paymentMethods.map((pm, pIdx) => (
                <div key={pIdx} className="flex justify-between">
                  <span className="text-gray-600">المدفوع ({pm.method}):</span>
                  <span className="font-semibold">{number(pm.amount)} ج.م</span>
                </div>
              ))}
              {sale.changeAmount > 0 && (
                <div className="flex justify-between font-bold text-emerald-700 text-xs pt-1">
                  <span>المتبقي للعميل (الباقي):</span>
                  <span>{number(sale.changeAmount)} ج.م</span>
                </div>
              )}
            </div>

            {/* Footer */}
            <div className="text-center text-[10px] text-gray-600 space-y-1">
              <p className="font-medium">{effectiveWelcomeMessage}</p>
              <p className="text-[9px]">الاستبدال والاسترجاع خلال 14 يوماً مع إحضار أصل الفاتورة بحالتها الأصلية</p>
              <p className="font-mono text-[9px] text-gray-400">*{sale.invoiceNumber}*</p>
            </div>
          </div>
        ) : (
          /* Kitchen / Preparation Ticket Area */
          <div
            ref={printRef}
            id="printable-receipt"
            className="p-4 bg-white text-black font-mono text-xs rounded border border-gray-200 shadow-sm leading-tight select-text"
            style={{ width: '100%', maxWidth: '300px', margin: '0 auto' }}
          >
            <div className="text-center border-b border-dashed border-gray-400 pb-2 mb-2">
              <div className="font-black text-sm bg-gray-900 text-white py-1 px-2 rounded mb-1 inline-block">
                تذكرة تحضير وتجهيز
              </div>
              <h2 className="text-xs font-bold text-gray-800">{effectiveStoreName}</h2>
            </div>

            <div className="text-[11px] space-y-0.5 border-b border-dashed border-gray-400 pb-2 mb-2">
              <div className="flex justify-between font-bold text-sm">
                <span>طلب رقم:</span>
                <span>#{sale.invoiceNumber}</span>
              </div>
              <div className="flex justify-between">
                <span>التاريخ والوقت:</span>
                <span>{date(sale.createdAt, 'datetime')}</span>
              </div>
              <div className="flex justify-between">
                <span>الكاشير:</span>
                <span>{sale.cashierNameSnapshot || 'كاشير'}</span>
              </div>
              {sale.customerNameSnapshot && (
                <div className="flex justify-between">
                  <span>العميل:</span>
                  <span>{sale.customerNameSnapshot}</span>
                </div>
              )}
            </div>

            {/* Prep Items List */}
            <table className="w-full text-right text-xs mb-3 border-b border-dashed border-gray-400 pb-2">
              <thead>
                <tr className="border-b border-gray-300 font-bold">
                  <th className="py-1">الصنف المطلوب</th>
                  <th className="py-1 text-center">الكمية</th>
                </tr>
              </thead>
              <tbody>
                {sale.items.map((item, idx) => (
                  <tr key={idx} className="border-b border-gray-200">
                    <td className="py-1.5 pr-0.5">
                      <div className="font-bold text-gray-900 text-xs">{item.productNameSnapshot}</div>
                      {item.variantNameSnapshot && (
                        <div className="text-[10px] text-gray-600">{item.variantNameSnapshot}</div>
                      )}
                    </td>
                    <td className="py-1.5 text-center font-black text-sm">
                      x{item.quantity}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>

            <div className="border border-dashed border-gray-300 p-2 text-center text-[10px] text-gray-500 rounded">
              تأكد من مراجعة كافة الأصناف قبل التسليم للعميل
            </div>
          </div>
        )}

        {/* CSS Print Styles */}
        <style>{`
          @media print {
            body * {
              visibility: hidden;
            }
            #printable-receipt, #printable-receipt * {
              visibility: visible;
            }
            #printable-receipt {
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
          <Button size="sm" onClick={handlePrint} className="gap-1.5">
            <Printer className="w-4 h-4" />
            طباعة {viewMode === 'receipt' ? 'الفاتورة' : 'تذكرة التحضير'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};
