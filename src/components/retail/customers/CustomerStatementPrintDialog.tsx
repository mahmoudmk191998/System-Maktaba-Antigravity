import React, { useRef } from 'react';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Printer, FileText } from 'lucide-react';
import type { Customer, CustomerLedgerEntry } from '@/types/retail.types';
import { formatCurrency } from '@/lib/formatters';
import { useAppStore } from '@/lib/store';

interface CustomerStatementPrintDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  customer: Customer | null;
  entries: CustomerLedgerEntry[];
  startDate?: string;
  endDate?: string;
  openingBalance?: number;
  closingBalance?: number;
}

export const CustomerStatementPrintDialog: React.FC<CustomerStatementPrintDialogProps> = ({
  open,
  onOpenChange,
  customer,
  entries,
  startDate,
  endDate,
  openingBalance = 0,
  closingBalance = 0,
}) => {
  const printRef = useRef<HTMLDivElement>(null);
  const currentTenant = useAppStore((state) => state.currentTenant);
  const currentBranch = useAppStore((state) => state.currentBranch);

  if (!customer) return null;

  const handlePrint = () => {
    if (!printRef.current) return;
    const printContent = printRef.current.innerHTML;
    const originalContent = document.body.innerHTML;

    document.body.innerHTML = `
      <div dir="rtl" style="font-family: Cairo, sans-serif; padding: 30px; color: #111;">
        ${printContent}
      </div>
    `;
    window.print();
    document.body.innerHTML = originalContent;
    window.location.reload();
  };

  const getEntryTypeLabel = (type: string) => {
    switch (type) {
      case 'opening_balance': return 'رصيد افتتاحي';
      case 'credit_sale': return 'فاتورة مبيعات آجلة';
      case 'payment': return 'سند تحصيل دفعة';
      case 'payment_reversal': return 'إلغاء وعكس سند قبض';
      case 'sale_return': return 'مرتجع مبيعات';
      case 'customer_advance': return 'دفعة مقدمة / رصيد دائن';
      case 'advance_applied': return 'استخدام رصيد دائن';
      case 'manual_adjustment': return 'تسوية محاسبية';
      case 'credit_note': return 'إشعار دائن';
      case 'debit_note': return 'إشعار مدين';
      case 'write_off': return 'شطب دين معدوم';
      default: return type;
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-4xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-primary">
            <FileText className="w-5 h-5" />
            معاينة وطباعة كشف حساب العميل
          </DialogTitle>
        </DialogHeader>

        {/* Printable Statement Document */}
        <div ref={printRef} className="p-6 border rounded-lg bg-white text-slate-900 space-y-6">
          {/* Header */}
          <div className="flex justify-between items-start border-b pb-4">
            <div>
              <h1 className="text-2xl font-bold text-slate-800">{currentTenant?.name || 'مكتبة الألوان الحديثة'}</h1>
              <p className="text-xs text-slate-500 mt-1">{currentBranch?.name || 'الفرع الرئيسي'} {currentBranch?.address ? `• ${currentBranch.address}` : ''}</p>
              <p className="text-xs text-slate-500 font-mono">هاتف: {currentBranch?.phone || '01000000000'}</p>
            </div>
            <div className="text-left">
              <div className="text-xl font-extrabold text-primary">كشف حساب عميل</div>
              <div className="text-xs text-slate-500 mt-1">تاريخ الإصدار: {new Date().toLocaleDateString('ar-EG')}</div>
              {startDate && endDate && (
                <div className="text-xs bg-slate-100 px-2 py-1 rounded mt-1 text-slate-600">
                  الفترة من: {startDate} إلى: {endDate}
                </div>
              )}
            </div>
          </div>

          {/* Customer Info Box */}
          <div className="bg-slate-50 p-4 rounded-lg border grid grid-cols-3 gap-4 text-xs">
            <div>
              <span className="text-slate-500 block">اسم العميل:</span>
              <span className="font-bold text-sm text-slate-800">{customer.name}</span>
              {customer.companyName && <span className="block text-slate-600">{customer.companyName}</span>}
            </div>
            <div>
              <span className="text-slate-500 block">كود العميل / الهاتف:</span>
              <span className="font-mono font-semibold">{customer.customerCode} • {customer.phone}</span>
              {customer.taxNumber && <span className="block text-slate-500 font-mono">الرقم الضريبي: {customer.taxNumber}</span>}
            </div>
            <div className="text-left">
              <span className="text-slate-500 block">الرصيد الختامي الحالي:</span>
              <span className={`font-bold text-base ${closingBalance > 0 ? 'text-amber-700' : closingBalance < 0 ? 'text-blue-700' : 'text-emerald-700'}`}>
                {closingBalance > 0
                  ? `مستحق: ${formatCurrency(closingBalance)}`
                  : closingBalance < 0
                  ? `دائن: ${formatCurrency(Math.abs(closingBalance))}`
                  : '0.00 ج.م'}
              </span>
            </div>
          </div>

          {/* Statement Table */}
          <div className="overflow-x-auto">
            <table className="w-full text-xs border-collapse">
              <thead>
                <tr className="bg-slate-100 border-y text-slate-700 font-semibold">
                  <th className="py-2.5 px-3 text-right">التاريخ</th>
                  <th className="py-2.5 px-3 text-right">نوع الحركة</th>
                  <th className="py-2.5 px-3 text-right">رقم المرجع / الفاتورة</th>
                  <th className="py-2.5 px-3 text-left">مدين (عليك)</th>
                  <th className="py-2.5 px-3 text-left">دائن (لك)</th>
                  <th className="py-2.5 px-3 text-left">الرصيد بعد الحركة</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-200">
                {/* Opening Balance row if applicable */}
                {openingBalance !== 0 && (
                  <tr className="bg-slate-50 font-semibold">
                    <td className="py-2 px-3 text-slate-500">{startDate || '-'}</td>
                    <td className="py-2 px-3" colSpan={2}>رصيد بداية الفترة</td>
                    <td className="py-2 px-3 text-left">{openingBalance > 0 ? formatCurrency(openingBalance) : '-'}</td>
                    <td className="py-2 px-3 text-left">{openingBalance < 0 ? formatCurrency(Math.abs(openingBalance)) : '-'}</td>
                    <td className="py-2 px-3 text-left font-bold">{formatCurrency(openingBalance)}</td>
                  </tr>
                )}

                {entries.length === 0 ? (
                  <tr>
                    <td colSpan={6} className="text-center py-6 text-slate-400">
                      لا توجد حركات مالية مسجلة في هذه الفترة
                    </td>
                  </tr>
                ) : (
                  entries.map((entry) => (
                    <tr key={entry.id} className="hover:bg-slate-50">
                      <td className="py-2 px-3 font-mono text-slate-600">{entry.createdAt.split('T')[0]}</td>
                      <td className="py-2 px-3 font-medium text-slate-800">
                        {getEntryTypeLabel(entry.type)}
                      </td>
                      <td className="py-2 px-3 font-mono text-slate-600">
                        {entry.referenceNumber || entry.referenceId || '-'}
                      </td>
                      <td className="py-2 px-3 text-left font-semibold text-amber-800">
                        {entry.debit > 0 ? formatCurrency(entry.debit) : '-'}
                      </td>
                      <td className="py-2 px-3 text-left font-semibold text-emerald-800">
                        {entry.credit > 0 ? formatCurrency(entry.credit) : '-'}
                      </td>
                      <td className="py-2 px-3 text-left font-bold font-mono text-slate-800">
                        {formatCurrency(entry.balanceAfter)}
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>

          {/* Statement Summary Footer */}
          <div className="border-t pt-4 flex justify-between items-center text-xs">
            <div className="text-slate-500">
              إجمالي عدد الحركات: <span className="font-semibold text-slate-700">{entries.length}</span> حركة
            </div>
            <div className="flex gap-6 text-sm">
              <div>
                <span className="text-slate-500">إجمالي المدين: </span>
                <span className="font-bold text-amber-800">
                  {formatCurrency(entries.reduce((sum, e) => sum + (e.debit || 0), 0))}
                </span>
              </div>
              <div>
                <span className="text-slate-500">إجمالي الدائن: </span>
                <span className="font-bold text-emerald-800">
                  {formatCurrency(entries.reduce((sum, e) => sum + (e.credit || 0), 0))}
                </span>
              </div>
              <div className="border-r pr-4">
                <span className="text-slate-700 font-semibold">صافي الرصيد الختامي: </span>
                <span className={`font-bold ${closingBalance > 0 ? 'text-amber-700' : 'text-emerald-700'}`}>
                  {formatCurrency(closingBalance)}
                </span>
              </div>
            </div>
          </div>
        </div>

        <DialogFooter className="flex justify-between gap-2">
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            إغلاق
          </Button>
          <Button onClick={handlePrint} className="gap-2">
            <Printer className="w-4 h-4" />
            طباعة كشف الحساب
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};
