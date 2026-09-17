import { useState, useEffect, useMemo } from 'react';
import { useForm } from 'react-hook-form';
import { useAuth } from '@/hooks/useAuth';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { useToast } from '@/hooks/use-toast';
import { addExpense } from '@/services/expenses';
import { useTenantBranch, useHR } from '@/hooks/useDatabase';
import { usePayroll } from '@/hooks/usePayroll';
import type { ExpenseCategory } from '@/types/expenses';
import type { PaymentMethod } from '@/types/payroll';
import { DollarSign, UserCheck, AlertCircle, ArrowUpRight } from 'lucide-react';

interface AddExpenseDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSuccess: () => void;
  onOpenPayroll?: () => void;
}

interface FormData {
  amount: number;
  category: ExpenseCategory;
  description: string;
  date: string;
}

const CATEGORIES: ExpenseCategory[] = ['رواتب', 'مشتريات', 'صيانة', 'أخرى'];

export function AddExpenseDialog({ open, onOpenChange, onSuccess, onOpenPayroll }: AddExpenseDialogProps) {
  const [isSubmitting, setIsSubmitting] = useState(false);
  const { user } = useAuth();
  const { toast } = useToast();
  const { tenantId, branchId } = useTenantBranch();

  // HR & Payroll hooks for salary flow
  const { employees, attendance, hrSettings } = useHR(tenantId);
  const { getPayrollForPeriod, disburseSalaryPayment, isSubmittingPayment } = usePayroll(tenantId, branchId);

  // Form State
  const { register, handleSubmit, formState: { errors }, setValue, watch, reset } = useForm<FormData>({
    defaultValues: {
      date: new Date().toISOString().split('T')[0],
      amount: 0,
    },
  });

  const categoryValue = watch('category');

  // Dedicated Salary Disbursal State inside dialog
  const [selectedEmpId, setSelectedEmpId] = useState<string>('');
  const [salaryPaymentMethod, setSalaryPaymentMethod] = useState<PaymentMethod>('cash');
  const [salaryReference, setSalaryReference] = useState('');
  const [salaryNotes, setSalaryNotes] = useState('');
  const [salaryAmount, setSalaryAmount] = useState<number>(0);

  const currentPeriod = useMemo(() => {
    const d = new Date();
    const m = String(d.getMonth() + 1).padStart(2, '0');
    return `${d.getFullYear()}-${m}`;
  }, []);

  // Compute calculated payroll record for the selected employee in current period
  const selectedEmployeePayroll = useMemo(() => {
    if (categoryValue !== 'رواتب' || !selectedEmpId) return null;
    const emp = employees.find((e) => e.id === selectedEmpId);
    if (!emp) return null;

    const records = getPayrollForPeriod(currentPeriod, [emp], attendance, hrSettings);
    return records[0] || null;
  }, [categoryValue, selectedEmpId, employees, attendance, hrSettings, currentPeriod, getPayrollForPeriod]);

  // Sync amount when employee selected
  useEffect(() => {
    if (selectedEmployeePayroll) {
      setSalaryAmount(selectedEmployeePayroll.remaining);
    }
  }, [selectedEmployeePayroll]);

  const onSubmit = async (data: FormData) => {
    if (!user) return;

    // If category is "رواتب" and an employee was chosen in the specialized flow
    if (data.category === 'رواتب' && selectedEmployeePayroll) {
      if (salaryAmount <= 0) {
        toast({
          title: 'تنبيه',
          description: 'يرجى إدخال مبلغ صحيح للصرف',
          variant: 'destructive',
        });
        return;
      }

      const success = await disburseSalaryPayment({
        payroll: selectedEmployeePayroll,
        amount: Number(salaryAmount),
        paymentMethod: salaryPaymentMethod,
        referenceNumber: salaryReference,
        notes: salaryNotes,
        currentUser: user,
      });

      if (success) {
        reset();
        setSelectedEmpId('');
        onSuccess();
        onOpenChange(false);
      }
      return;
    }

    // Standard non-salary expense submission
    setIsSubmitting(true);
    try {
      await addExpense({
        amount: Number(data.amount),
        category: data.category,
        description: data.description,
        date: data.date,
        createdBy: user.uid,
        branchId: branchId || tenantId || undefined,
        tenantId: tenantId || undefined,
      });

      toast({
        title: 'تمت الإضافة',
        description: 'تم إضافة المصروف بنجاح',
      });

      reset();
      onSuccess();
      onOpenChange(false);
    } catch (error) {
      toast({
        title: 'خطأ',
        description: 'حدث خطأ أثناء إضافة المصروف',
        variant: 'destructive',
      });
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <Dialog
      open={open}
      onOpenChange={(val) => {
        if (!val) {
          reset();
          setSelectedEmpId('');
        }
        onOpenChange(val);
      }}
    >
      <DialogContent className="sm:max-w-[460px] max-h-[90dvh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>
            {categoryValue === 'رواتب' ? 'صرف رواتب ومصروفات الموظفين' : 'إضافة مصروف جديد'}
          </DialogTitle>
        </DialogHeader>

        <form onSubmit={handleSubmit(onSubmit)} className="space-y-3.5 py-3">
          {/* Category Selector */}
          <div className="space-y-1.5">
            <Label htmlFor="category">التصنيف *</Label>
            <Select
              disabled={isSubmitting || isSubmittingPayment}
              value={categoryValue}
              onValueChange={(val: ExpenseCategory) => {
                setValue('category', val, { shouldValidate: true });
                if (val === 'رواتب' && employees.length > 0 && !selectedEmpId) {
                  setSelectedEmpId(employees[0].id);
                }
              }}
            >
              <SelectTrigger>
                <SelectValue placeholder="اختر التصنيف..." />
              </SelectTrigger>
              <SelectContent>
                {CATEGORIES.map((cat) => (
                  <SelectItem key={cat} value={cat}>
                    {cat}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <input type="hidden" {...register('category', { required: 'يرجى اختيار التصنيف' })} />
            {errors.category && <span className="text-xs text-destructive">{errors.category.message}</span>}
          </div>

          {/* DEDICATED PAYROLL SALARY VIEW WHEN CATEGORY IS "رواتب" */}
          {categoryValue === 'رواتب' ? (
            <div className="space-y-3 p-3 bg-slate-900/60 rounded-xl border border-slate-800">
              <div className="flex items-center justify-between">
                <span className="text-xs font-bold text-slate-200 flex items-center gap-1.5">
                  <UserCheck className="w-4 h-4 text-primary" />
                  اختيار الموظف لصرف الراتب
                </span>
                {onOpenPayroll && (
                  <Button
                    type="button"
                    variant="link"
                    size="sm"
                    onClick={() => {
                      onOpenChange(false);
                      onOpenPayroll();
                    }}
                    className="h-auto p-0 text-[11px] text-primary gap-1"
                  >
                    <span>فتح جدول المسير الكامل</span>
                    <ArrowUpRight className="w-3 h-3" />
                  </Button>
                )}
              </div>

              {/* Employee Selector */}
              <div className="space-y-1">
                <Select
                  value={selectedEmpId}
                  onValueChange={(val) => setSelectedEmpId(val)}
                  disabled={isSubmittingPayment}
                >
                  <SelectTrigger className="h-9 text-xs bg-slate-950">
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

              {/* Employee Payroll Snapshot Box */}
              {selectedEmployeePayroll && (
                <div className="p-2.5 bg-slate-950 rounded-lg border border-slate-800/80 space-y-1.5 text-xs">
                  <div className="flex justify-between items-center text-[11px] text-muted-foreground border-b border-slate-800 pb-1">
                    <span>شهر: {currentPeriod}</span>
                    <span>الأساسي: {selectedEmployeePayroll.basicSalarySnapshot.toLocaleString('ar-EG')} ج.م</span>
                  </div>
                  <div className="grid grid-cols-3 gap-1 text-center pt-0.5">
                    <div>
                      <p className="text-[10px] text-muted-foreground">خصم الحضور</p>
                      <p className="font-mono text-rose-400 font-bold">
                        -{selectedEmployeePayroll.attendanceDeductions.toLocaleString('ar-EG')}
                      </p>
                    </div>
                    <div>
                      <p className="text-[10px] text-muted-foreground">أقساط السلف</p>
                      <p className="font-mono text-amber-400 font-bold">
                        -{selectedEmployeePayroll.advanceDeductions.toLocaleString('ar-EG')}
                      </p>
                    </div>
                    <div>
                      <p className="text-[10px] text-muted-foreground">المتبقي</p>
                      <p className="font-mono text-emerald-400 font-bold">
                        {selectedEmployeePayroll.remaining.toLocaleString('ar-EG')} ج.م
                      </p>
                    </div>
                  </div>
                </div>
              )}

              {/* Amount to pay */}
              <div className="space-y-1">
                <div className="flex justify-between items-center">
                  <Label className="text-xs">المبلغ المصروف الآن *</Label>
                  {selectedEmployeePayroll && selectedEmployeePayroll.remaining > 0 && (
                    <button
                      type="button"
                      onClick={() => setSalaryAmount(selectedEmployeePayroll.remaining)}
                      className="text-[10px] text-primary hover:underline"
                    >
                      دفع المتبقي ({selectedEmployeePayroll.remaining} ج.م)
                    </button>
                  )}
                </div>
                <Input
                  type="number"
                  step="0.01"
                  min={0.01}
                  max={selectedEmployeePayroll ? selectedEmployeePayroll.remaining : undefined}
                  value={salaryAmount || ''}
                  onChange={(e) => setSalaryAmount(Number(e.target.value))}
                  className="h-10 text-xs font-mono font-bold"
                  required
                  disabled={isSubmittingPayment}
                />
              </div>

              {/* Payment Method & Reference */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                <div className="space-y-1">
                  <Label className="text-[11px]">طريقة الدفع</Label>
                  <Select
                    value={salaryPaymentMethod}
                    onValueChange={(val: PaymentMethod) => setSalaryPaymentMethod(val)}
                    disabled={isSubmittingPayment}
                  >
                    <SelectTrigger className="h-9 text-xs">
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
                <div className="space-y-1">
                  <Label className="text-[11px]">رقم المرجع (اختياري)</Label>
                  <Input
                    placeholder="إيصال / تحويل..."
                    value={salaryReference}
                    onChange={(e) => setSalaryReference(e.target.value)}
                    className="h-9 text-xs"
                    disabled={isSubmittingPayment}
                  />
                </div>
              </div>

              <div className="space-y-1">
                <Label className="text-[11px]">ملاحظات (اختياري)</Label>
                <Input
                  placeholder="ملاحظات الصرف..."
                  value={salaryNotes}
                  onChange={(e) => setSalaryNotes(e.target.value)}
                  className="h-9 text-xs"
                  disabled={isSubmittingPayment}
                />
              </div>
            </div>
          ) : (
            /* STANDARD GENERIC EXPENSE FORM FOR (مشتريات, صيانة, أخرى) */
            <>
              <div className="space-y-1.5">
                <Label htmlFor="amount">المبلغ *</Label>
                <Input
                  id="amount"
                  type="number"
                  step="0.01"
                  disabled={isSubmitting}
                  {...register('amount', {
                    required: 'يرجى إدخال المبلغ',
                    min: { value: 0.01, message: 'يجب أن يكون المبلغ أكبر من صفر' },
                  })}
                />
                {errors.amount && <span className="text-xs text-destructive">{errors.amount.message}</span>}
              </div>

              <div className="space-y-1.5">
                <Label htmlFor="date">التاريخ *</Label>
                <Input
                  id="date"
                  type="date"
                  disabled={isSubmitting}
                  {...register('date', { required: 'يرجى إدخال التاريخ' })}
                />
                {errors.date && <span className="text-xs text-destructive">{errors.date.message}</span>}
              </div>

              <div className="space-y-1.5">
                <Label htmlFor="description">البيان (الوصف) *</Label>
                <Textarea
                  id="description"
                  disabled={isSubmitting}
                  placeholder="وصف تفصيلي للمصروف..."
                  {...register('description', { required: 'يرجى إدخال الوصف' })}
                />
                {errors.description && (
                  <span className="text-xs text-destructive">{errors.description.message}</span>
                )}
              </div>
            </>
          )}

          <DialogFooter className="pt-2">
            <Button
              type="button"
              variant="outline"
              onClick={() => onOpenChange(false)}
              disabled={isSubmitting || isSubmittingPayment}
            >
              إلغاء
            </Button>
            <Button type="submit" disabled={isSubmitting || isSubmittingPayment}>
              {isSubmitting || isSubmittingPayment ? (
                <>
                  <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin ml-2" />
                  جاري الحفظ...
                </>
              ) : categoryValue === 'رواتب' ? (
                'تأكيد صرف الراتب'
              ) : (
                'حفظ المصروف'
              )}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
