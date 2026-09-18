import React, { useRef } from 'react';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Printer, CheckCircle2, Building2, Calendar, CreditCard, User } from 'lucide-react';
import type { CustomerPayment, CustomerPaymentAllocation } from '@/types/retail.types';
import { formatCurrency } from '@/lib/utils';
import { useAppStore } from '@/lib/store';

interface CustomerPaymentReceiptDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  payment: CustomerPayment | null;
  allocations?: CustomerPaymentAllocation[];
  newBalance?: number;
}

export const CustomerPaymentReceiptDialog: React.FC<CustomerPaymentReceiptDialogProps> = ({
  open,
  onOpenChange,
  payment,
  allocations = [],
  newBalance,
}) => {
  const printRef = useRef<HTMLDivElement>(null);
  const settings = useAppStore((state) => state.settings);
  const currentTenant = useAppStore((state) => state.currentTenant);
  const currentBranch = useAppStore((state) => state.currentBranch);

  if (!payment) return null;

  const effectiveStoreName = settings.invoiceCompanyName || currentTenant?.name || 'مكتبة ألوان التجارية';
  const effectiveStoreAddress = settings.invoiceAddress || currentBranch?.address || '';
  const effectiveStorePhone = settings.invoicePhone || currentBranch?.phone || '';
  const effectiveTaxNumber = settings.invoiceTaxNumber || currentTenant?.taxNumber || '';

  const handlePrint = () => {
    if (!printRef.current) return;
    const printContent = printRef.current.innerHTML;
    const originalContent = document.body.innerHTML;

    document.body.innerHTML = `
      <div dir="rtl" style="font-family: Cairo, sans-serif; padding: 20px; color: #111;">
        ${printContent}
      </div>
    `;
    window.print();
    document.body.innerHTML = originalContent;
    window.location.reload();
  };

  const getMethodLabel = (method: string) => {
    switch (method) {
      case 'cash': return 'نقداً (كاش)';
      case 'card': return 'بطاقة بنكية';
      case 'bank_transfer': return 'تحويل بنكي';
      case 'instapay': return 'إنستاباي (InstaPay)';
      case 'cheque': return 'شيك مصرفي';
      default: return method;
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-emerald-600">
            <CheckCircle2 className="w-5 h-5" />
            سند قبض وتحصيل دفعة عميل
          </DialogTitle>
        </DialogHeader>

        {/* Printable Area */}
        <div ref={printRef} className="p-4 border rounded-lg bg-white text-slate-900 space-y-4">
          {/* Logo if configured */}
          {settings.invoiceLogo && (
            <div className="flex justify-center mb-2">
              <img
                src={settings.invoiceLogo}
                alt="Logo"
                className="max-h-12 max-w-[140px] object-contain filter grayscale"
              />
            </div>
          )}

          {/* Header */}
          <div className="text-center border-b pb-3">
            <h2 className="text-xl font-bold">{effectiveStoreName}</h2>
            <p className="text-xs text-slate-500">{currentBranch?.name || 'الفرع الرئيسي'} {effectiveStoreAddress ? `- ${effectiveStoreAddress}` : ''}</p>
            {effectiveStorePhone && <p className="text-[11px] text-slate-500">هاتف: {effectiveStorePhone}</p>}
            {effectiveTaxNumber && <p className="text-[11px] text-slate-600 font-semibold">الرقم الضريبي: {effectiveTaxNumber}</p>}
            <div className="inline-block mt-2 px-3 py-1 bg-emerald-50 text-emerald-700 font-semibold text-sm rounded-full border border-emerald-200">
              سند تحصيل رقم: {payment.paymentNumber}
            </div>
          </div>

          {/* Details Grid */}
          <div className="grid grid-cols-2 gap-2 text-xs">
            <div className="flex items-center gap-1">
              <User className="w-3.5 h-3.5 text-slate-400" />
              <span className="text-slate-500">العميل:</span>
              <span className="font-semibold">{payment.customerNameSnapshot || 'عميل مسجل'}</span>
            </div>
            <div className="flex items-center gap-1">
              <Calendar className="w-3.5 h-3.5 text-slate-400" />
              <span className="text-slate-500">التاريخ:</span>
              <span>{payment.paymentDate}</span>
            </div>
            <div className="flex items-center gap-1">
              <CreditCard className="w-3.5 h-3.5 text-slate-400" />
              <span className="text-slate-500">طريقة السداد:</span>
              <span className="font-medium">{getMethodLabel(payment.paymentMethod)}</span>
            </div>
            <div className="flex items-center gap-1">
              <Building2 className="w-3.5 h-3.5 text-slate-400" />
              <span className="text-slate-500">المستلم:</span>
              <span>{payment.processedBy}</span>
            </div>
            {payment.referenceNumber && (
              <div className="col-span-2 text-slate-500">
                رقم الإسناد / المرجع: <span className="font-mono text-slate-800">{payment.referenceNumber}</span>
              </div>
            )}
          </div>

          {/* Amount Box */}
          <div className="bg-emerald-50 p-3 rounded-md text-center border border-emerald-200">
            <div className="text-xs text-emerald-700">المبلغ المحصل</div>
            <div className="text-2xl font-bold text-emerald-900">{formatCurrency(payment.amount)}</div>
          </div>

          {/* Invoices Allocated */}
          {allocations.length > 0 && (
            <div className="space-y-1.5 border-t pt-2">
              <div className="text-xs font-semibold text-slate-700">تسوية الفواتير الآجلة:</div>
              <table className="w-full text-xs">
                <thead>
                  <tr className="border-b text-slate-500">
                    <th className="text-right py-1">رقم الفاتورة</th>
                    <th className="text-left py-1">المبلغ المسدد</th>
                  </tr>
                </thead>
                <tbody>
                  {allocations.map((alloc) => (
                    <tr key={alloc.id} className="border-b border-dashed">
                      <td className="py-1 font-mono text-slate-700">{alloc.invoiceNumber}</td>
                      <td className="py-1 text-left font-semibold text-emerald-700">
                        {formatCurrency(alloc.allocatedAmount)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

          {payment.unallocatedCredit > 0 && (
            <div className="text-xs bg-blue-50 text-blue-700 p-2 rounded border border-blue-200">
              تم تسجيل مبلغ <span className="font-bold">{formatCurrency(payment.unallocatedCredit)}</span> كدفعة مقدمة / رصيد دائن لصالح العميل.
            </div>
          )}

          {/* Final Balance Notice */}
          {newBalance !== undefined && (
            <div className="border-t pt-2 flex justify-between items-center text-xs">
              <span className="text-slate-600">الرصيد المتبقي بعد العملية:</span>
              <span className={`font-bold ${newBalance > 0 ? 'text-amber-600' : newBalance < 0 ? 'text-blue-600' : 'text-emerald-600'}`}>
                {newBalance > 0
                  ? `مستحق على العميل: ${formatCurrency(newBalance)}`
                  : newBalance < 0
                  ? `رصيد دائن للعميل: ${formatCurrency(Math.abs(newBalance))}`
                  : 'تم تسوية كامل الحساب (0 ج.م)'}
              </span>
            </div>
          )}

          {payment.notes && (
            <div className="text-xs text-slate-500 border-t pt-2">
              ملاحظات: {payment.notes}
            </div>
          )}

          <div className="text-center text-[10px] text-slate-400 pt-2 border-t">
            نشكركم لتعاملكم معنا • نظام ألوان لإدارة المكتبات ومبيعات التجزئة
          </div>
        </div>

        <DialogFooter className="flex justify-between gap-2">
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            إغلاق
          </Button>
          <Button onClick={handlePrint} className="bg-emerald-600 hover:bg-emerald-700 gap-2">
            <Printer className="w-4 h-4" />
            طباعة السند
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};
