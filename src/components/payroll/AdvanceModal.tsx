import React, { useState } from 'react';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
  DialogDescription,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { HandCoins, Calculator, Calendar } from 'lucide-react';
import type { PaymentMethod, AdvanceRepaymentType } from '@/types/payroll';
import { useAuth } from '@/hooks/useAuth';

interface AdvanceModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  employees: Array<{ id: string; name: string; role?: string }>;
  defaultEmployeeId?: string;
  onSaveAdvance: (data: {
    employeeId: string;
    employeeName: string;
    amount: number;
    repaymentType: AdvanceRepaymentType;
    installmentAmount?: number;
    numberOfInstallments?: number;
    startDate: string;
    paymentMethod: PaymentMethod;
    notes?: string;
    currentUser?: any;
  }) => Promise<string | null>;
}

export const AdvanceModal: React.FC<AdvanceModalProps> = ({
  open,
  onOpenChange,
  employees,
  defaultEmployeeId,
  onSaveAdvance,
}) => {
  const { user } = useAuth();
  const [employeeId, setEmployeeId] = useState(defaultEmployeeId || (employees[0]?.id || ''));
  const [amount, setAmount] = useState<number | ''>('');
  const [repaymentType, setRepaymentType] = useState<AdvanceRepaymentType>('next_salary');
  const [numberOfInstallments, setNumberOfInstallments] = useState<number>(4);
  const [startDate, setStartDate] = useState(new Date().toISOString().split('T')[0]);
  const [paymentMethod, setPaymentMethod] = useState<PaymentMethod>('cash');
  const [notes, setNotes] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);

  // Sync default employee if changes
  React.useEffect(() => {
    if (defaultEmployeeId) {
      setEmployeeId(defaultEmployeeId);
    } else if (employees.length > 0 && !employeeId) {
      setEmployeeId(employees[0].id);
    }
  }, [defaultEmployeeId, employees]);

  const numAmount = Number(amount) || 0;
  const calculatedInstallment = repaymentType === 'installments' && numberOfInstallments > 0
    ? Math.round((numAmount / numberOfInstallments) * 100) / 100
    : numAmount;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!employeeId || numAmount <= 0) return;

    const selectedEmp = employees.find((e) => e.id === employeeId);
    if (!selectedEmp) return;

    setIsSubmitting(true);
    try {
      const advanceId = await onSaveAdvance({
        employeeId: selectedEmp.id,
        employeeName: selectedEmp.name,
        amount: numAmount,
        repaymentType,
        installmentAmount: calculatedInstallment,
        numberOfInstallments: repaymentType === 'installments' ? numberOfInstallments : 1,
        startDate,
        paymentMethod,
        notes: notes.trim() || undefined,
        currentUser: user,
      });

      if (advanceId) {
        onOpenChange(false);
        // Reset form
        setAmount('');
        setNotes('');
      }
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-base">
            <HandCoins className="w-5 h-5 text-amber-400" />
            <span>تسجيل سلفة جديدة لموظف</span>
          </DialogTitle>
          <DialogDescription className="text-xs">
            سيتم خصم السلفة تلقائياً من مسير الرواتب القادم حسب خطة السداد المحددة
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="space-y-3.5 py-2">
          {/* Employee Selection */}
          <div className="space-y-1">
            <Label className="text-xs">الموظف *</Label>
            <Select value={employeeId} onValueChange={setEmployeeId} disabled={isSubmitting || !!defaultEmployeeId}>
              <SelectTrigger className="h-10 text-xs">
                <SelectValue placeholder="اختر الموظف..." />
              </SelectTrigger>
              <SelectContent>
                {employees.map((emp) => (
                  <SelectItem key={emp.id} value={emp.id}>
                    {emp.name} {emp.role ? `(${emp.role})` : ''}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {/* Amount & Payment Method */}
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1">
              <Label className="text-xs">مبلغ السلفة (ج.م) *</Label>
              <Input
                type="number"
                min={1}
                step="1"
                placeholder="مثال: 2000"
                value={amount}
                onChange={(e) => setAmount(e.target.value === '' ? '' : Number(e.target.value))}
                className="h-10 text-xs font-bold font-mono"
                required
                disabled={isSubmitting}
              />
            </div>
            <div className="space-y-1">
              <Label className="text-xs">طريقة صرف السلفة *</Label>
              <Select value={paymentMethod} onValueChange={(val: PaymentMethod) => setPaymentMethod(val)} disabled={isSubmitting}>
                <SelectTrigger className="h-10 text-xs">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="cash">نقداً (كاش)</SelectItem>
                  <SelectItem value="bank_transfer">تحويل بنكي</SelectItem>
                  <SelectItem value="vodafone_cash">فودافون كاش</SelectItem>
                  <SelectItem value="instapay">إنستاباي</SelectItem>
                  <SelectItem value="other">أخرى</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>

          {/* Repayment Type */}
          <div className="space-y-1.5">
            <Label className="text-xs font-semibold">طريقة سداد وخصم السلفة *</Label>
            <div className="grid grid-cols-2 gap-2">
              <button
                type="button"
                onClick={() => setRepaymentType('next_salary')}
                className={`p-2.5 rounded-xl border text-xs text-right transition-all ${
                  repaymentType === 'next_salary'
                    ? 'border-primary bg-primary/10 text-primary font-bold shadow-sm'
                    : 'border-slate-800 bg-slate-900/40 text-muted-foreground hover:bg-slate-800/60'
                }`}
              >
                <p className="font-bold">خصم كامل المبلغ</p>
                <p className="text-[10px] opacity-80">يخصم دفعة واحدة من الراتب القادم</p>
              </button>

              <button
                type="button"
                onClick={() => setRepaymentType('installments')}
                className={`p-2.5 rounded-xl border text-xs text-right transition-all ${
                  repaymentType === 'installments'
                    ? 'border-primary bg-primary/10 text-primary font-bold shadow-sm'
                    : 'border-slate-800 bg-slate-900/40 text-muted-foreground hover:bg-slate-800/60'
                }`}
              >
                <p className="font-bold">تقسيط السلفة</p>
                <p className="text-[10px] opacity-80">توزيع المبلغ على عدة أشهر</p>
              </button>
            </div>
          </div>

          {/* Installments Options if Selected */}
          {repaymentType === 'installments' && (
            <div className="p-3 bg-slate-900/60 rounded-xl border border-slate-800 space-y-2 text-xs">
              <div className="grid grid-cols-2 gap-3 items-center">
                <div className="space-y-1">
                  <Label className="text-[11px]">عدد الأقساط (شهور)</Label>
                  <Input
                    type="number"
                    min={2}
                    max={24}
                    value={numberOfInstallments}
                    onChange={(e) => setNumberOfInstallments(Math.max(2, parseInt(e.target.value, 10) || 2))}
                    className="h-9 text-xs"
                    disabled={isSubmitting}
                  />
                </div>
                <div className="space-y-1 text-center bg-slate-950/60 p-2 rounded-lg border border-slate-800">
                  <p className="text-[10px] text-muted-foreground">قيمة القسط الشهري</p>
                  <p className="text-sm font-bold text-emerald-400">
                    {calculatedInstallment.toLocaleString('ar-EG')} ج.م
                  </p>
                </div>
              </div>
              <p className="text-[10px] text-muted-foreground">
                مثال: {numAmount.toLocaleString('ar-EG')} ج.م على {numberOfInstallments} أشهر = {calculatedInstallment.toLocaleString('ar-EG')} ج.م شهرياً.
              </p>
            </div>
          )}

          {/* Start Date & Notes */}
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1">
              <Label className="text-xs">تاريخ بدء الخصم</Label>
              <Input
                type="date"
                value={startDate}
                onChange={(e) => setStartDate(e.target.value)}
                className="h-10 text-xs"
                disabled={isSubmitting}
              />
            </div>
            <div className="space-y-1">
              <Label className="text-xs">ملاحظات (اختياري)</Label>
              <Input
                placeholder="سبب السلفة..."
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                className="h-10 text-xs"
                disabled={isSubmitting}
              />
            </div>
          </div>

          <DialogFooter className="pt-2">
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)} disabled={isSubmitting}>
              إلغاء
            </Button>
            <Button type="submit" disabled={isSubmitting || !employeeId || numAmount <= 0} className="gap-2">
              {isSubmitting ? (
                <>
                  <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
                  جاري الحفظ...
                </>
              ) : (
                <>
                  <HandCoins className="w-4 h-4" />
                  حفظ السلفة
                </>
              )}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
};
