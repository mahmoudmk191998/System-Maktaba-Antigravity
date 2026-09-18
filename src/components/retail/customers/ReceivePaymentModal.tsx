import React, { useState, useEffect } from 'react';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Badge } from '@/components/ui/badge';
import { CreditCard, AlertCircle, CheckCircle, ArrowRight } from 'lucide-react';
import type { Customer, CustomerReceivable, CustomerPayment, CustomerPaymentAllocation } from '@/types/retail.types';
import { formatCurrency } from '@/lib/utils';
import { getOpenReceivablesForCustomer } from '@/services/customers/creditSales.service';
import { completeCustomerPaymentTransaction } from '@/services/customers/customerPayments.service';
import { useAppStore } from '@/lib/store';
import { CustomerPaymentReceiptDialog } from './CustomerPaymentReceiptDialog';

interface ReceivePaymentModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  customer: Customer | null;
  onPaymentSuccess?: () => void;
}

export const ReceivePaymentModal: React.FC<ReceivePaymentModalProps> = ({
  open,
  onOpenChange,
  customer,
  onPaymentSuccess,
}) => {
  const currentTenant = useAppStore((state) => state.currentTenant);
  const currentBranch = useAppStore((state) => state.currentBranch);
  const currentUser = useAppStore((state) => state.currentUser);

  const [receivables, setReceivables] = useState<CustomerReceivable[]>([]);
  const [loading, setLoading] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [amount, setAmount] = useState<number>(0);
  const [paymentMethod, setPaymentMethod] = useState<string>('cash');
  const [paymentDestination, setPaymentDestination] = useState<'cash_register' | 'bank' | 'treasury'>('cash_register');
  const [allocationMode, setAllocationMode] = useState<'oldest_due_first' | 'manual'>('oldest_due_first');
  const [manualAllocations, setManualAllocations] = useState<Record<string, number>>({});
  const [referenceNumber, setReferenceNumber] = useState<string>('');
  const [notes, setNotes] = useState<string>('');

  // Post-payment receipt dialog
  const [receiptOpen, setReceiptOpen] = useState(false);
  const [completedPayment, setCompletedPayment] = useState<CustomerPayment | null>(null);
  const [completedAllocations, setCompletedAllocations] = useState<CustomerPaymentAllocation[]>([]);
  const [newBalanceAfter, setNewBalanceAfter] = useState<number | undefined>(undefined);

  useEffect(() => {
    if (!open || !customer || !currentTenant) return;
    const fetchOpenInvoices = async () => {
      setLoading(true);
      setError(null);
      try {
        const recs = await getOpenReceivablesForCustomer(currentTenant.id, customer.id);
        setReceivables(recs);
        const totalDue = recs.reduce((sum, r) => sum + Number(r.remainingAmount || 0), 0);
        setAmount(totalDue > 0 ? totalDue : 0);
      } catch (err: any) {
        setError(err.message || 'فشل في جلب الفواتير الآجلة');
      } finally {
        setLoading(false);
      }
    };
    fetchOpenInvoices();
  }, [open, customer, currentTenant]);

  if (!customer) return null;

  const currentDebt = Number(customer.currentBalance ?? customer.balance ?? 0);
  const totalReceivablesRemaining = receivables.reduce((sum, r) => sum + Number(r.remainingAmount || 0), 0);

  const handleManualAmountChange = (recId: string, val: number) => {
    const updated = { ...manualAllocations, [recId]: Math.max(0, val) };
    setManualAllocations(updated);
    const sum = Object.values(updated).reduce((a, b) => a + b, 0);
    setAmount(sum);
  };

  const handleSubmit = async () => {
    if (!currentTenant) return;
    if (amount <= 0) {
      setError('يرجى إدخال مبلغ سداد أكبر من الصفر');
      return;
    }

    setSubmitting(true);
    setError(null);

    try {
      const clientPaymentId = `pay_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`;
      const manualList = Object.entries(manualAllocations)
        .filter(([_, a]) => a > 0)
        .map(([recId, a]) => ({ receivableId: recId, amount: a }));

      const res = await completeCustomerPaymentTransaction({
        tenantId: currentTenant.id,
        branchId: currentBranch?.id || 'main',
        branchCode: currentBranch?.name?.substring(0, 3)?.toUpperCase() || 'HQ',
        customerId: customer.id,
        amount,
        paymentMethod,
        paymentDestination,
        allocationMode,
        manualAllocations: allocationMode === 'manual' ? manualList : [],
        allowCustomerAdvance: true,
        referenceNumber,
        processedBy: currentUser?.displayName || currentUser?.email || 'المحاسب',
        notes,
        clientPaymentId,
      });

      if (!res.success || !res.payment) {
        throw new Error(res.error || 'فشلت عملية تسجيل السداد');
      }

      setCompletedPayment(res.payment);
      setCompletedAllocations(res.allocations || []);
      setNewBalanceAfter(res.newBalance);
      onOpenChange(false);
      setReceiptOpen(true);
      onPaymentSuccess?.();
    } catch (err: any) {
      setError(err.message || 'فشلت العملية');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <>
      <Dialog open={open} onOpenChange={onOpenChange}>
        <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-primary">
              <CreditCard className="w-5 h-5" />
              تحصيل دفعة من حساب العميل
            </DialogTitle>
          </DialogHeader>

          <div className="space-y-4 text-sm">
            {/* Customer Summary Card */}
            <div className="bg-slate-50 p-3 rounded-lg border flex justify-between items-center">
              <div>
                <div className="font-bold text-base text-slate-800">{customer.name}</div>
                <div className="text-xs text-slate-500 font-mono">{customer.customerCode} • {customer.phone}</div>
              </div>
              <div className="text-left">
                <div className="text-xs text-slate-500">الرصيد الدفتري الحالي</div>
                <div className={`font-bold text-base ${currentDebt > 0 ? 'text-amber-600' : currentDebt < 0 ? 'text-blue-600' : 'text-emerald-600'}`}>
                  {currentDebt > 0
                    ? `مستحق: ${formatCurrency(currentDebt)}`
                    : currentDebt < 0
                    ? `دائن: ${formatCurrency(Math.abs(currentDebt))}`
                    : 'مطابق (0 ج.م)'}
                </div>
              </div>
            </div>

            {error && (
              <div className="p-3 bg-red-50 text-red-700 border border-red-200 rounded-md text-xs flex items-center gap-2">
                <AlertCircle className="w-4 h-4 flex-shrink-0" />
                <span>{error}</span>
              </div>
            )}

            {/* Inputs: Amount & Method */}
            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label htmlFor="pay_amount">المبلغ المحصل (ج.م) *</Label>
                <Input
                  id="pay_amount"
                  type="number"
                  min="1"
                  step="0.5"
                  value={amount || ''}
                  onChange={(e) => setAmount(Number(e.target.value))}
                  placeholder="أدخل المبلغ..."
                  className="font-bold text-base text-emerald-700"
                />
              </div>

              <div>
                <Label htmlFor="pay_method">طريقة التحصيل *</Label>
                <Select value={paymentMethod} onValueChange={setPaymentMethod}>
                  <SelectTrigger id="pay_method">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="cash">نقداً (كاش)</SelectItem>
                    <SelectItem value="card">بطاقة بنكية / فيزا</SelectItem>
                    <SelectItem value="bank_transfer">تحويل بنكي</SelectItem>
                    <SelectItem value="instapay">إنستاباي (InstaPay)</SelectItem>
                    <SelectItem value="cheque">شيك بنكي</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              <div>
                <Label htmlFor="pay_dest">جهة إيداع المبلغ</Label>
                <Select value={paymentDestination} onValueChange={(v: any) => setPaymentDestination(v)}>
                  <SelectTrigger id="pay_dest">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="cash_register">درج الكاشير (الوردية النشطة)</SelectItem>
                    <SelectItem value="treasury">الخزينة الرئيسية</SelectItem>
                    <SelectItem value="bank">الحساب البنكي</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              <div>
                <Label htmlFor="pay_ref">رقم الإسناد / العملية (اختياري)</Label>
                <Input
                  id="pay_ref"
                  value={referenceNumber}
                  onChange={(e) => setReferenceNumber(e.target.value)}
                  placeholder="مثال: رقم التحويل البنكي..."
                />
              </div>
            </div>

            {/* Allocation Mode */}
            <div className="border rounded-lg p-3 space-y-3 bg-white">
              <div className="flex justify-between items-center">
                <span className="font-semibold text-xs text-slate-700">توزيع السداد على الفواتير الآجلة:</span>
                <div className="flex gap-2">
                  <Button
                    type="button"
                    size="sm"
                    variant={allocationMode === 'oldest_due_first' ? 'default' : 'outline'}
                    onClick={() => setAllocationMode('oldest_due_first')}
                    className="h-7 text-xs"
                  >
                    تلقائي (الأقدم استحقاقاً أولاً)
                  </Button>
                  <Button
                    type="button"
                    size="sm"
                    variant={allocationMode === 'manual' ? 'default' : 'outline'}
                    onClick={() => setAllocationMode('manual')}
                    className="h-7 text-xs"
                  >
                    توزيع يدوي
                  </Button>
                </div>
              </div>

              {loading ? (
                <div className="text-center py-4 text-xs text-slate-400">جارٍ تحميل الفواتير الآجلة...</div>
              ) : receivables.length === 0 ? (
                <div className="text-center py-3 text-xs text-slate-500 bg-slate-50 rounded border border-dashed">
                  لا توجد فواتير آجلة مفتوحة حالياً. سيتم تسجيل المبلغ بالكامل كـ <strong>دفعة مقدمة / رصيد دائن</strong> للعميل.
                </div>
              ) : (
                <div className="space-y-2 max-h-48 overflow-y-auto">
                  {receivables.map((rec) => {
                    const remaining = Number(rec.remainingAmount || 0);
                    return (
                      <div key={rec.id} className="p-2 border rounded text-xs flex justify-between items-center hover:bg-slate-50">
                        <div>
                          <div className="font-mono font-semibold text-slate-800">{rec.invoiceNumber}</div>
                          <div className="text-[10px] text-slate-500">استحقاق: {rec.dueDate} • الأصل: {formatCurrency(rec.originalAmount)}</div>
                        </div>
                        <div className="flex items-center gap-3">
                          <div className="text-left">
                            <span className="text-slate-500">المتبقي:</span>{' '}
                            <span className="font-bold text-amber-700">{formatCurrency(remaining)}</span>
                          </div>
                          {allocationMode === 'manual' && (
                            <Input
                              type="number"
                              min="0"
                              max={remaining}
                              step="0.5"
                              value={manualAllocations[rec.id] || ''}
                              onChange={(e) => handleManualAmountChange(rec.id, Number(e.target.value))}
                              placeholder="0"
                              className="w-24 h-7 text-xs text-left"
                            />
                          )}
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>

            {/* Excess Amount Notice */}
            {amount > totalReceivablesRemaining && totalReceivablesRemaining > 0 && (
              <div className="text-xs bg-blue-50 text-blue-800 p-2.5 rounded border border-blue-200">
                المبلغ المدخل ({formatCurrency(amount)}) يزيد عن إجمالي الفواتير المستحقة ({formatCurrency(totalReceivablesRemaining)}).
                سيتم إضافة الفارق <span className="font-bold">{formatCurrency(amount - totalReceivablesRemaining)}</span> كرصيد دائن / دفعة مقدمة في حساب العميل.
              </div>
            )}

            {/* Notes */}
            <div>
              <Label htmlFor="pay_notes">ملاحظات التحصيل</Label>
              <Input
                id="pay_notes"
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                placeholder="ملاحظات إضافية على سند التحصيل..."
              />
            </div>
          </div>

          <DialogFooter className="gap-2">
            <Button variant="outline" onClick={() => onOpenChange(false)}>
              إلغاء
            </Button>
            <Button
              onClick={handleSubmit}
              disabled={submitting || amount <= 0}
              className="bg-emerald-600 hover:bg-emerald-700 gap-2"
            >
              <CheckCircle className="w-4 h-4" />
              {submitting ? 'جارٍ التسجيل...' : `تأكيد التحصيل (${formatCurrency(amount)})`}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <CustomerPaymentReceiptDialog
        open={receiptOpen}
        onOpenChange={setReceiptOpen}
        payment={completedPayment}
        allocations={completedAllocations}
        newBalance={newBalanceAfter}
      />
    </>
  );
};
