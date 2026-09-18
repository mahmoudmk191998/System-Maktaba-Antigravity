import React, { useState, useMemo, useEffect } from 'react';
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
import { Badge } from '@/components/ui/badge';
import {
  Banknote,
  CreditCard,
  Smartphone,
  CheckCircle2,
  AlertCircle,
  Plus,
  Trash2,
  Coins,
  FileText,
  Wallet,
} from 'lucide-react';
import { toast } from 'sonner';
import type { PaymentEntry, PaymentMethodType, Sale, Customer } from '@/types/retail.types';
import { useFormatters } from '@/lib/formatters';

interface QuickPaymentModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  grandTotal: number;
  customer?: Customer | null;
  onConfirmPayment: (payments: PaymentEntry[], clientCheckoutId: string) => Promise<Sale | null>;
}

const METHOD_LABELS: Record<string, string> = {
  cash: 'نقداً',
  visa: 'فيزا / ماستر',
  instapay: 'انستاباي',
  vodafone_cash: 'فودافون كاش',
  credit: 'آجل (على الحساب)',
  customer_credit: 'رصيد مقدم (Advance)',
};

export const QuickPaymentModal: React.FC<QuickPaymentModalProps> = ({
  open,
  onOpenChange,
  grandTotal,
  customer,
  onConfirmPayment,
}) => {
  const { number } = useFormatters();
  const [isSplit, setIsSplit] = useState(false);
  const [primaryMethod, setPrimaryMethod] = useState<PaymentMethodType>('cash');
  const [cashTendered, setCashTendered] = useState<string>(grandTotal.toString());
  const [splitPayments, setSplitPayments] = useState<PaymentEntry[]>([
    { method: 'cash', amount: grandTotal },
  ]);
  const [isProcessing, setIsProcessing] = useState(false);

  // Generate unique checkout client ID per modal opening for idempotency
  const [clientCheckoutId, setClientCheckoutId] = useState<string>('');

  // Customer Credit & Advance calculations
  const customerAdvance = useMemo(() => {
    if (!customer) return 0;
    return (customer.currentBalance || 0) < 0 ? Math.abs(customer.currentBalance) : 0;
  }, [customer]);

  const customerCurrentDebt = useMemo(() => {
    if (!customer) return 0;
    return (customer.currentBalance || 0) > 0 ? customer.currentBalance : 0;
  }, [customer]);

  const customerAvailableCredit = useMemo(() => {
    if (!customer || !customer.creditEnabled) return 0;
    if (customer.creditStatus === 'blocked') return 0;
    if (customer.creditLimit === 0) return 9999999; // unlimited
    return Math.max(0, customer.creditLimit - customerCurrentDebt);
  }, [customer, customerCurrentDebt]);

  useEffect(() => {
    if (open) {
      setClientCheckoutId(`chk_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`);
      setCashTendered(grandTotal.toString());
      setPrimaryMethod('cash');
      setIsSplit(false);
      setSplitPayments([{ method: 'cash', amount: grandTotal }]);
    }
  }, [open, grandTotal]);

  const cashReceivedNum = Number(cashTendered) || 0;

  // Single payment calculation
  const singleChange = useMemo(() => {
    if (primaryMethod === 'cash') {
      return Math.max(0, Math.round((cashReceivedNum - grandTotal) * 100) / 100);
    }
    return 0;
  }, [primaryMethod, cashReceivedNum, grandTotal]);

  // Split payment totals
  const splitTotalPaid = useMemo(() => {
    return Math.round(splitPayments.reduce((acc, p) => acc + (Number(p.amount) || 0), 0) * 100) / 100;
  }, [splitPayments]);

  const splitRemaining = useMemo(() => {
    return Math.round((grandTotal - splitTotalPaid) * 100) / 100;
  }, [grandTotal, splitTotalPaid]);

  const handleAddSplitEntry = (method: PaymentMethodType) => {
    const remaining = Math.max(0, splitRemaining);
    let initialAmt = remaining;
    if (method === 'customer_credit') {
      initialAmt = Math.min(remaining, customerAdvance);
    } else if (method === 'credit') {
      initialAmt = Math.min(remaining, customerAvailableCredit);
    }
    setSplitPayments((prev) => [...prev, { method, amount: initialAmt }]);
  };

  const handleUpdateSplitAmount = (index: number, val: number) => {
    setSplitPayments((prev) => {
      const copy = [...prev];
      copy[index] = { ...copy[index], amount: Math.max(0, val) };
      return copy;
    });
  };

  const handleRemoveSplitEntry = (index: number) => {
    setSplitPayments((prev) => prev.filter((_, i) => i !== index));
  };

  const handleFastCashChip = (addVal: number) => {
    setCashTendered((prev) => (Number(prev || 0) + addVal).toString());
  };

  const handleSetExactCash = () => {
    setCashTendered(grandTotal.toString());
  };

  const handleProcessCheckout = async () => {
    if (isProcessing) return;

    let finalPayments: PaymentEntry[] = [];

    if (!isSplit) {
      if (primaryMethod === 'cash') {
        if (cashReceivedNum < grandTotal) {
          toast.error(`المبلغ المستلم (${cashReceivedNum} ج.م) أقل من إجمالي الفاتورة (${grandTotal} ج.م)`);
          return;
        }
        finalPayments = [{ method: 'cash', amount: cashReceivedNum }];
      } else if (primaryMethod === 'credit') {
        if (!customer) {
          toast.error('يجب تحديد عميل لإجراء بيع آجل');
          return;
        }
        if (!customer.creditEnabled) {
          toast.error('البيع الآجل غير مفعّل لهذا العميل');
          return;
        }
        if (customer.creditStatus === 'blocked') {
          toast.error('حساب العميل محظور ائتمانياً');
          return;
        }
        if (customer.creditLimit > 0 && grandTotal > customerAvailableCredit) {
          toast.error(`قيمة الفاتورة تتجاوز السقف الائتماني المتاح (${customerAvailableCredit} ج.م)`);
          return;
        }
        finalPayments = [{ method: 'credit', amount: grandTotal }];
      } else if (primaryMethod === 'customer_credit') {
        if (!customer || customerAdvance <= 0) {
          toast.error('العميل ليس لديه رصيد مقدم كافٍ');
          return;
        }
        if (grandTotal > customerAdvance) {
          toast.error(`رصيد المقدم (${customerAdvance} ج.م) لا يكفي لتغطية كامل الفاتورة (${grandTotal} ج.م)؛ يمكنك استخدام الدفع المقسم`);
          return;
        }
        finalPayments = [{ method: 'customer_credit', amount: grandTotal }];
      } else {
        finalPayments = [{ method: primaryMethod, amount: grandTotal }];
      }
    } else {
      if (splitTotalPaid < grandTotal) {
        toast.error(`مجموع المدفوعات (${splitTotalPaid} ج.م) أقل من إجمالي الفاتورة (${grandTotal} ج.م)`);
        return;
      }

      // Validate split credit
      const creditPart = splitPayments.find((p) => p.method === 'credit')?.amount || 0;
      if (creditPart > 0) {
        if (!customer || !customer.creditEnabled) {
          toast.error('البيع الآجل غير متاح أو لم يتم تحديد عميل');
          return;
        }
        if (customer.creditStatus === 'blocked') {
          toast.error('حساب العميل محظور ائتمانياً');
          return;
        }
        if (customer.creditLimit > 0 && creditPart > customerAvailableCredit) {
          toast.error(`قيمة الجزء الآجل (${creditPart} ج.م) تتجاوز المتاح ائتمانياً (${customerAvailableCredit} ج.م)`);
          return;
        }
      }

      // Validate split customer advance
      const advancePart = splitPayments.find((p) => p.method === 'customer_credit')?.amount || 0;
      if (advancePart > 0 && advancePart > customerAdvance) {
        toast.error(`الجزء المخصوم من المقدم (${advancePart} ج.م) يتجاوز رصيد المقدم الفعلي (${customerAdvance} ج.م)`);
        return;
      }

      finalPayments = splitPayments;
    }

    setIsProcessing(true);
    try {
      const sale = await onConfirmPayment(finalPayments, clientCheckoutId);
      if (sale) {
        onOpenChange(false);
      }
    } finally {
      setIsProcessing(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg" dir="rtl">
        <DialogHeader>
          <DialogTitle className="text-xl font-bold flex items-center justify-between">
            <span>شاشة الدفع والتحصيل</span>
            <Badge variant="outline" className="text-base px-3 py-1 bg-primary/10 text-primary border-primary/30">
              المطلوب: {number(grandTotal)} ج.م
            </Badge>
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-4 py-2">
          {/* Customer Info Snippet */}
          {customer && (
            <div className="p-2.5 rounded-xl bg-muted/40 border text-xs flex items-center justify-between">
              <div>
                <span className="font-bold text-foreground">{customer.name}</span>
                <span className="text-muted-foreground mr-1.5 font-mono">({customer.code || customer.customerType})</span>
              </div>
              <div className="flex items-center gap-2">
                {customerAdvance > 0 && (
                  <Badge variant="secondary" className="bg-emerald-500/10 text-emerald-600 border-emerald-500/20">
                    رصيد مقدم: {number(customerAdvance)} ج.م
                  </Badge>
                )}
                {customer.creditEnabled && (
                  <Badge variant="secondary" className="bg-primary/10 text-primary border-primary/20">
                    سقف ائتمان: {number(customer.creditLimit || 0)} ج.م
                  </Badge>
                )}
                {customerCurrentDebt > 0 && (
                  <Badge variant="destructive" className="text-[10px]">
                    مدين: {number(customerCurrentDebt)} ج.م
                  </Badge>
                )}
              </div>
            </div>
          )}

          {/* Mode Switcher: Single vs Split */}
          <div className="flex gap-2 p-1 bg-muted rounded-xl">
            <Button
              type="button"
              variant={!isSplit ? 'default' : 'ghost'}
              size="sm"
              className="flex-1 font-semibold"
              onClick={() => setIsSplit(false)}
            >
              طريقة دفع واحدة
            </Button>
            <Button
              type="button"
              variant={isSplit ? 'default' : 'ghost'}
              size="sm"
              className="flex-1 font-semibold"
              onClick={() => setIsSplit(true)}
            >
              دفع مقسم (Split Payment)
            </Button>
          </div>

          {!isSplit ? (
            <div className="space-y-4">
              {/* Payment Methods Grid */}
              <div className="grid grid-cols-3 sm:grid-cols-4 gap-2">
                <Button
                  type="button"
                  variant={primaryMethod === 'cash' ? 'default' : 'outline'}
                  className="flex flex-col h-16 gap-1"
                  onClick={() => setPrimaryMethod('cash')}
                >
                  <Banknote className="w-5 h-5 text-emerald-600" />
                  <span className="text-xs font-bold">نقداً (Cash)</span>
                </Button>

                <Button
                  type="button"
                  variant={primaryMethod === 'visa' ? 'default' : 'outline'}
                  className="flex flex-col h-16 gap-1"
                  onClick={() => setPrimaryMethod('visa')}
                >
                  <CreditCard className="w-5 h-5 text-blue-600" />
                  <span className="text-xs font-bold">فيزا / ماستر</span>
                </Button>

                <Button
                  type="button"
                  variant={primaryMethod === 'instapay' ? 'default' : 'outline'}
                  className="flex flex-col h-16 gap-1"
                  onClick={() => setPrimaryMethod('instapay')}
                >
                  <Smartphone className="w-5 h-5 text-purple-600" />
                  <span className="text-xs font-bold">انستاباي</span>
                </Button>

                <Button
                  type="button"
                  variant={primaryMethod === 'vodafone_cash' ? 'default' : 'outline'}
                  className="flex flex-col h-16 gap-1"
                  onClick={() => setPrimaryMethod('vodafone_cash')}
                >
                  <Smartphone className="w-5 h-5 text-red-600" />
                  <span className="text-xs font-bold">فودافون كاش</span>
                </Button>

                {/* Credit Sale (آجل) Button */}
                {customer?.creditEnabled && (
                  <Button
                    type="button"
                    variant={primaryMethod === 'credit' ? 'default' : 'outline'}
                    className="flex flex-col h-16 gap-1 border-amber-500/40"
                    onClick={() => setPrimaryMethod('credit')}
                  >
                    <FileText className="w-5 h-5 text-amber-600" />
                    <span className="text-xs font-bold">آجل (على الحساب)</span>
                  </Button>
                )}

                {/* Advance Balance Button */}
                {customerAdvance > 0 && (
                  <Button
                    type="button"
                    variant={primaryMethod === 'customer_credit' ? 'default' : 'outline'}
                    className="flex flex-col h-16 gap-1 border-emerald-500/40"
                    onClick={() => setPrimaryMethod('customer_credit')}
                  >
                    <Wallet className="w-5 h-5 text-emerald-600" />
                    <span className="text-xs font-bold">من رصيد العميل</span>
                  </Button>
                )}
              </div>

              {primaryMethod === 'cash' ? (
                <div className="space-y-3 bg-muted/40 p-4 rounded-xl border border-border">
                  <div className="flex items-center justify-between">
                    <Label className="font-bold text-sm">المبلغ المستلم من العميل (ج.م):</Label>
                    <Button
                      type="button"
                      variant="link"
                      size="sm"
                      className="h-auto p-0 text-xs text-primary font-bold"
                      onClick={handleSetExactCash}
                    >
                      المبلغ بالضبط ({number(grandTotal)})
                    </Button>
                  </div>
                  <Input
                    type="number"
                    min="0"
                    step="any"
                    value={cashTendered}
                    onChange={(e) => setCashTendered(e.target.value)}
                    className="text-2xl font-bold text-center h-12 tracking-wide"
                    autoFocus
                  />

                  {/* Fast Tender Chips */}
                  <div className="flex flex-wrap gap-1.5 pt-1">
                    {[10, 20, 50, 100, 200].map((val) => (
                      <Button
                        key={val}
                        type="button"
                        variant="secondary"
                        size="sm"
                        className="text-xs font-semibold h-8 px-2.5"
                        onClick={() => handleFastCashChip(val)}
                      >
                        +{val}
                      </Button>
                    ))}
                  </div>

                  {/* Change Calculation Display */}
                  <div className="flex items-center justify-between pt-2 border-t border-border/80">
                    <span className="text-sm font-semibold text-muted-foreground flex items-center gap-1.5">
                      <Coins className="w-4 h-4 text-primary" />
                      المتبقي للعميل (الفكة):
                    </span>
                    <span
                      className={`text-lg font-black ${
                        singleChange > 0 ? 'text-emerald-600' : 'text-foreground'
                      }`}
                    >
                      {number(singleChange)} ج.م
                    </span>
                  </div>
                </div>
              ) : primaryMethod === 'credit' ? (
                <div className="p-4 rounded-xl bg-amber-500/10 border border-amber-500/30 space-y-2">
                  <div className="flex items-center gap-2 text-amber-700 dark:text-amber-400 font-bold text-sm">
                    <AlertCircle className="w-4 h-4" />
                    <span>فاتورة بيع بالآجل (Credit Sale)</span>
                  </div>
                  <p className="text-xs text-muted-foreground">
                    سيتم ترحيل كامل قيمة الفاتورة ({number(grandTotal)} ج.م) كمديونية على حساب العميل، مع إصدار مستحق سداد.
                  </p>
                  <div className="flex justify-between text-xs pt-1 border-t border-amber-500/20">
                    <span>السقف المتاح للعميل:</span>
                    <strong className="font-mono">{number(customerAvailableCredit)} ج.م</strong>
                  </div>
                </div>
              ) : primaryMethod === 'customer_credit' ? (
                <div className="p-4 rounded-xl bg-emerald-500/10 border border-emerald-500/30 space-y-2">
                  <div className="flex items-center gap-2 text-emerald-700 dark:text-emerald-400 font-bold text-sm">
                    <Wallet className="w-4 h-4" />
                    <span>خصم من الرصيد المقدم للعميل (Advance)</span>
                  </div>
                  <p className="text-xs text-muted-foreground">
                    سيتم سداد الفاتورة بخصم ({number(grandTotal)} ج.م) من رصيد الدفعة المقدمة المسجلة للعميل.
                  </p>
                  <div className="flex justify-between text-xs pt-1 border-t border-emerald-500/20">
                    <span>الرصيد الدائن المتاح:</span>
                    <strong className="font-mono text-emerald-600">{number(customerAdvance)} ج.م</strong>
                  </div>
                </div>
              ) : (
                <div className="p-4 rounded-xl bg-primary/5 border border-primary/20 text-center text-sm font-semibold">
                  <span>تم اختيار الدفع الإلكتروني بالكامل بقيمة </span>
                  <strong className="text-primary">{number(grandTotal)} ج.م</strong>
                </div>
              )}
            </div>
          ) : (
            /* Split Payment Section */
            <div className="space-y-4">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <span className="text-xs font-semibold text-muted-foreground">
                  المتبقي للتوزيع:{' '}
                  <strong className={splitRemaining === 0 ? 'text-emerald-600' : 'text-amber-600'}>
                    {number(splitRemaining)} ج.م
                  </strong>
                </span>
                <div className="flex flex-wrap gap-1">
                  <Button type="button" size="sm" variant="outline" className="h-7 text-xs" onClick={() => handleAddSplitEntry('cash')}>
                    + كاش
                  </Button>
                  <Button type="button" size="sm" variant="outline" className="h-7 text-xs" onClick={() => handleAddSplitEntry('visa')}>
                    + بطاقة
                  </Button>
                  <Button type="button" size="sm" variant="outline" className="h-7 text-xs" onClick={() => handleAddSplitEntry('instapay')}>
                    + انستاباي
                  </Button>
                  {customer?.creditEnabled && (
                    <Button type="button" size="sm" variant="outline" className="h-7 text-xs border-amber-500 text-amber-700" onClick={() => handleAddSplitEntry('credit')}>
                      + آجل
                    </Button>
                  )}
                  {customerAdvance > 0 && (
                    <Button type="button" size="sm" variant="outline" className="h-7 text-xs border-emerald-500 text-emerald-700" onClick={() => handleAddSplitEntry('customer_credit')}>
                      + مقدم
                    </Button>
                  )}
                </div>
              </div>

              <div className="space-y-2 max-h-48 overflow-y-auto pr-1">
                {splitPayments.map((entry, idx) => (
                  <div key={idx} className="flex items-center gap-2 p-2 bg-muted/40 rounded-lg border border-border">
                    <Badge variant="secondary" className="w-32 justify-center text-xs py-1">
                      {METHOD_LABELS[entry.method] || entry.method}
                    </Badge>
                    <Input
                      type="number"
                      min="0"
                      step="any"
                      value={entry.amount}
                      onChange={(e) => handleUpdateSplitAmount(idx, Number(e.target.value) || 0)}
                      className="h-9 font-bold text-left"
                    />
                    {splitPayments.length > 1 && (
                      <Button
                        type="button"
                        variant="ghost"
                        size="icon"
                        className="h-8 w-8 text-destructive hover:bg-destructive/10"
                        onClick={() => handleRemoveSplitEntry(idx)}
                      >
                        <Trash2 className="w-4 h-4" />
                      </Button>
                    )}
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>

        <DialogFooter className="flex gap-2 sm:justify-between pt-2">
          <Button
            type="button"
            variant="outline"
            onClick={() => onOpenChange(false)}
            disabled={isProcessing}
          >
            إلغاء
          </Button>
          <Button
            type="button"
            onClick={handleProcessCheckout}
            disabled={isProcessing}
            className="gap-2 px-6 font-bold bg-emerald-600 hover:bg-emerald-700 text-white"
          >
            {isProcessing ? (
              <div className="flex items-center gap-2">
                <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
                <span>جاري التنفيذ الذري...</span>
              </div>
            ) : (
              <>
                <CheckCircle2 className="w-4 h-4" />
                <span>إتمام البيع والتحصيل (F8)</span>
              </>
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};
