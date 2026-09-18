import React, { useState } from 'react';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  DollarSign,
  Building2,
  Calendar,
  CreditCard,
  AlertTriangle,
  FileCheck,
} from 'lucide-react';
import { toast } from 'sonner';
import { useFormatters } from '@/lib/formatters';
import { useAppStore } from '@/lib/store';
import type { Supplier } from '@/types/retail.types';

interface SupplierPaymentModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  supplier: Supplier | null;
  onSuccess?: () => void;
  onPay: (input: any) => Promise<any>;
}

export const SupplierPaymentModal: React.FC<SupplierPaymentModalProps> = ({
  open,
  onOpenChange,
  supplier,
  onSuccess,
  onPay,
}) => {
  const { number } = useFormatters();
  const currentBranch = useAppStore((state) => state.currentBranch);
  const currentUser = useAppStore((state) => state.currentUser);

  const [amount, setAmount] = useState<number>(0);
  const [paymentMethod, setPaymentMethod] = useState<string>('bank_transfer');
  const [paymentSource, setPaymentSource] = useState<string>('treasury');
  const [referenceNumber, setReferenceNumber] = useState('');
  const [notes, setNotes] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);

  if (!supplier) return null;

  const currentBalance = Number(supplier.currentBalance || 0);
  const isOverpayment = amount > currentBalance && currentBalance > 0;

  const handleSubmit = async () => {
    if (amount <= 0) {
      toast.error('يرجى إدخال مبلغ سداد صحيح أكبر من الصفر');
      return;
    }

    setIsSubmitting(true);
    try {
      const clientPaymentId = `spay_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`;
      const res = await onPay({
        supplierId: supplier.id,
        branchId: currentBranch?.id,
        amount,
        paymentMethod,
        paymentSource,
        referenceNumber,
        notes,
        processedBy: currentUser?.name || 'مسؤول الحسابات',
        clientPaymentId,
      });

      if (res.success) {
        toast.success(`تم تسجيل سداد الدفعة بنجاح! رقم الإيصال: ${res.payment?.paymentNumber}`);
        onSuccess?.();
        onOpenChange(false);
      } else {
        toast.error(res.error || 'فشلت عملية سداد الدفعة');
      }
    } catch (err: any) {
      toast.error(err.message || 'حدث خطأ أثناء السداد');
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md p-0 overflow-hidden" dir="rtl">
        <DialogHeader className="p-4 border-b border-border bg-emerald-500/10">
          <div className="flex items-center gap-3">
            <div className="p-2 rounded-xl bg-emerald-600 text-white shadow-sm">
              <DollarSign className="w-5 h-5" />
            </div>
            <div>
              <DialogTitle className="text-lg font-bold">تسجيل سند صرف / دفعة للمورد</DialogTitle>
              <DialogDescription className="text-xs text-muted-foreground mt-0.5">
                المورد: <strong className="text-foreground">{supplier.name}</strong> ({supplier.supplierCode})
              </DialogDescription>
            </div>
          </div>
        </DialogHeader>

        <div className="p-4 space-y-4 text-xs">
          {/* Current Balance Card */}
          <div className="p-3 bg-muted/30 border border-border rounded-xl flex items-center justify-between">
            <div>
              <span className="text-muted-foreground block text-[11px]">الرصيد الحالي المستحق للمورد:</span>
              <span className="text-lg font-black text-foreground">{number(currentBalance)} ج.م</span>
            </div>
            <Badge variant="outline" className={currentBalance > 0 ? 'bg-amber-100 text-amber-900 border-amber-300' : 'bg-emerald-100 text-emerald-900'}>
              {currentBalance > 0 ? 'مستحق للمورد' : currentBalance === 0 ? 'خالص الحساب' : 'رصيد لصالح المكتبة'}
            </Badge>
          </div>

          {/* Amount Input */}
          <div className="space-y-1">
            <Label className="text-xs font-bold block">مبلغ الدفعة (ج.م) *:</Label>
            <Input
              type="number"
              min={1}
              step="0.1"
              value={amount || ''}
              onChange={(e) => setAmount(Number(e.target.value) || 0)}
              placeholder="أدخل المبلغ المسدد..."
              className="h-10 text-base font-bold text-emerald-600"
            />
            {currentBalance > 0 && (
              <div className="flex justify-end pt-1">
                <Button
                  type="button"
                  size="sm"
                  variant="ghost"
                  className="h-6 text-[11px] text-primary p-0"
                  onClick={() => setAmount(currentBalance)}
                >
                  سداد كامل الرصيد المستحق ({number(currentBalance)} ج.م)
                </Button>
              </div>
            )}
          </div>

          {/* Overpayment warning */}
          {isOverpayment && (
            <div className="p-2.5 bg-amber-500/10 border border-amber-500/30 rounded-lg text-amber-800 flex items-center gap-2 text-[11px]">
              <AlertTriangle className="w-4 h-4 shrink-0 text-amber-600" />
              <span>
                المبلغ المسدد أكبر من رصيد المورد الحالي. سيتم تسجيل الفائض كدفعة مقدمة (Supplier Advance) لصالح المكتبة.
              </span>
            </div>
          )}

          {/* Payment Method & Source */}
          <div className="grid grid-cols-2 gap-2">
            <div className="space-y-1">
              <Label className="text-[11px] font-bold block">طريقة السداد:</Label>
              <Select value={paymentMethod} onValueChange={setPaymentMethod}>
                <SelectTrigger className="h-8 text-xs">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent dir="rtl">
                  <SelectItem value="bank_transfer">تحويل بنكي</SelectItem>
                  <SelectItem value="cash">نقداً (Cash)</SelectItem>
                  <SelectItem value="cheque">شيك مصرفي</SelectItem>
                  <SelectItem value="wallet">محفظة إلكترونية</SelectItem>
                  <SelectItem value="card">بطاقة بنكية</SelectItem>
                  <SelectItem value="other">أخرى</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-1">
              <Label className="text-[11px] font-bold block">مصدر الصرف:</Label>
              <Select value={paymentSource} onValueChange={setPaymentSource}>
                <SelectTrigger className="h-8 text-xs">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent dir="rtl">
                  <SelectItem value="treasury">الخزينة الرئيسية</SelectItem>
                  <SelectItem value="bank">الحساب البنكي</SelectItem>
                  <SelectItem value="cash_register">درج الكاشير</SelectItem>
                  <SelectItem value="other">عهدة أخرى</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>

          {/* Reference Number */}
          <div className="space-y-1">
            <Label className="text-[11px] text-muted-foreground block">رقم التحويل / رقم الشيك (اختياري):</Label>
            <Input
              value={referenceNumber}
              onChange={(e) => setReferenceNumber(e.target.value)}
              placeholder="مثال: REF-987654..."
              className="h-8 text-xs font-mono"
            />
          </div>

          {/* Notes */}
          <div className="space-y-1">
            <Label className="text-[11px] text-muted-foreground block">ملاحظات أو بيان السند:</Label>
            <Input
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="دفعة من حساب فاتورة رقم..."
              className="h-8 text-xs"
            />
          </div>
        </div>

        <DialogFooter className="p-4 border-t border-border bg-muted/20 flex items-center justify-between sm:justify-between">
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={() => onOpenChange(false)}
            disabled={isSubmitting}
          >
            إلغاء
          </Button>

          <Button
            type="button"
            size="sm"
            disabled={isSubmitting || amount <= 0}
            onClick={handleSubmit}
            className="font-bold px-6 gap-2 bg-emerald-600 hover:bg-emerald-700 text-white"
          >
            <FileCheck className="w-4 h-4" />
            <span>{isSubmitting ? 'جارِ التسجيل...' : `تأكيد صرف ${number(amount)} ج.م`}</span>
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};
