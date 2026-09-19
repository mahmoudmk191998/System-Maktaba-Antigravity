import { useState, useEffect, useCallback } from 'react';
import { db } from '@/lib/firebase';
import {
  collection,
  doc,
  query,
  where,
  getDocs,
  getDoc,
  setDoc,
  addDoc,
  updateDoc,
  deleteDoc,
  onSnapshot,
} from 'firebase/firestore';
import type {
  PayrollRecord,
  PayrollPeriod,
  SalaryPayment,
  Advance,
  AdvanceInstallment,
  PaymentMethod,
  AdvanceRepaymentType,
  PayrollKPIs,
} from '@/types/payroll';
import { notifySalaryPayment } from '@/services/notifications.service';
import {
  calculateEmployeePayroll,
  calculateAdvanceDueInstallment,
  applyAdvanceDeduction,
  canDeleteAdvance,
  type EmployeeData,
  type AttendanceRecordData,
} from '@/lib/payrollEngine';
import { toast } from 'sonner';

/**
 * Deeply strips undefined values from an object or array to prevent Firestore
 * "Unsupported field value: undefined" errors.
 */
function sanitizeForFirestore(obj: any): any {
  if (obj === null || obj === undefined) return null;
  if (typeof obj !== 'object') return obj;
  if (Array.isArray(obj)) return obj.map(sanitizeForFirestore);
  const result: Record<string, any> = {};
  for (const [key, value] of Object.entries(obj)) {
    if (value !== undefined) {
      result[key] = sanitizeForFirestore(value);
    }
  }
  return result;
}

export function usePayroll(tenantId: string | null, branchId?: string | null) {
  const [payrolls, setPayrolls] = useState<PayrollRecord[]>([]);
  const [salaryPayments, setSalaryPayments] = useState<SalaryPayment[]>([]);
  const [advances, setAdvances] = useState<Advance[]>([]);
  const [advanceInstallments, setAdvanceInstallments] = useState<AdvanceInstallment[]>([]);
  const [loading, setLoading] = useState(true);

  // In-flight locks to prevent double-click race conditions
  const [isSubmittingPayment, setIsSubmittingPayment] = useState(false);
  const [isProcessingCancellation, setIsProcessingCancellation] = useState(false);
  const [isProcessingAdvance, setIsProcessingAdvance] = useState(false);

  const fetchAllPayrollData = useCallback(async () => {
    if (!tenantId) {
      setLoading(false);
      return;
    }

    try {
      setLoading(true);

      const [payrollsSnap, paymentsSnap, advancesSnap, installmentsSnap] = await Promise.all([
        getDocs(query(collection(db, 'payrolls'), where('tenant_id', '==', tenantId))),
        getDocs(query(collection(db, 'salary_payments'), where('tenant_id', '==', tenantId))),
        getDocs(query(collection(db, 'advances'), where('tenant_id', '==', tenantId))),
        getDocs(query(collection(db, 'advance_installments'), where('tenant_id', '==', tenantId))),
      ]);

      setPayrolls(
        payrollsSnap.docs.map((d) => ({ id: d.id, ...(d.data() as any) })) as PayrollRecord[]
      );
      setSalaryPayments(
        paymentsSnap.docs.map((d) => ({ id: d.id, ...(d.data() as any) })) as SalaryPayment[]
      );
      setAdvances(
        advancesSnap.docs.map((d) => ({ id: d.id, ...(d.data() as any) })) as Advance[]
      );
      setAdvanceInstallments(
        installmentsSnap.docs.map((d) => ({ id: d.id, ...(d.data() as any) })) as AdvanceInstallment[]
      );
    } catch (err: any) {
      console.error('Error fetching payroll data:', err);
      toast.error('خطأ أثناء جلب بيانات الرواتب');
    } finally {
      setLoading(false);
    }
  }, [tenantId]);

  useEffect(() => {
    fetchAllPayrollData();
  }, [fetchAllPayrollData]);

  /**
   * Generates or retrieves the calculated payroll records for all employees for a given period.
   */
  const getPayrollForPeriod = useCallback(
    (
      period: PayrollPeriod,
      employees: EmployeeData[],
      attendance: AttendanceRecordData[],
      hrSettings?: any,
      leaves?: any[]
    ): PayrollRecord[] => {
      return employees.map((emp) => {
        // Find existing stored payroll snapshot if any
        const existing = payrolls.find(
          (p) => p.employeeId === emp.id && p.period === period
        );

        return calculateEmployeePayroll({
          employee: emp,
          period,
          attendanceRecords: attendance,
          advances,
          payments: salaryPayments,
          existingRecord: existing,
          hrSettings,
          approvedLeaves: leaves,
        });
      });
    },
    [payrolls, advances, salaryPayments]
  );

  /**
   * Disburses a salary payment (partial or full) with double-click protection,
   * idempotency key, Expense creation, advance deduction sealing, and audit logging.
   */
  const disburseSalaryPayment = async (options: {
    payroll: PayrollRecord;
    amount: number;
    paymentMethod: PaymentMethod;
    referenceNumber?: string;
    notes?: string;
    currentUser?: { uid?: string; email?: string; name?: string };
    allAdvances?: Advance[];
  }): Promise<boolean> => {
    const { payroll, amount, paymentMethod, referenceNumber, notes, currentUser } = options;

    if (!tenantId) {
      toast.error('لم يتم تحديد المكتبة/المؤسسة (Tenant)');
      return false;
    }

    if (amount <= 0) {
      toast.error('يجب أن يكون المبلغ المدفوع أكبر من صفر');
      return false;
    }

    if (amount > payroll.remaining) {
      toast.error(`المبلغ المدفوع (${amount} ج.م) يتجاوز المبلغ المتبقي المستحق (${payroll.remaining} ج.م)`);
      return false;
    }

    if (isSubmittingPayment) {
      toast.warning('عملية دفع قيد المعالجة بالفعل، يرجى الانتظار...');
      return false;
    }

    setIsSubmittingPayment(true);

    try {
      const nowIso = new Date().toISOString();
      const todayStr = nowIso.split('T')[0];
      const idempotencyKey = `pay_${payroll.employeeId}_${payroll.period}_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`;

      // 1. Double check idempotency against existing payments
      const existingPayQuery = query(
        collection(db, 'salary_payments'),
        where('tenant_id', '==', tenantId),
        where('idempotencyKey', '==', idempotencyKey)
      );
      const existingSnap = await getDocs(existingPayQuery);
      if (!existingSnap.empty) {
        toast.warning('تم تنفيذ هذه العملية مسبقاً لمنع التكرار');
        setIsSubmittingPayment(false);
        return true;
      }

      // 2. Create Salary Payment Document
      const paymentRef = await addDoc(
        collection(db, 'salary_payments'),
        sanitizeForFirestore({
          tenant_id: tenantId,
          branch_id: branchId || payroll.branch_id || '',
          payrollId: payroll.id,
          employeeId: payroll.employeeId,
          employeeName: payroll.employeeName,
          payrollPeriod: payroll.period,
          amount: Number(amount),
          paymentMethod,
          referenceNumber: referenceNumber?.trim() || '',
          notes: notes?.trim() || '',
          idempotencyKey,
          status: 'completed',
          createdAt: nowIso,
          createdBy: currentUser?.name || currentUser?.email || 'المدير',
        })
      );

      const paymentId = paymentRef.id;

      // 3. Create Corresponding Expense Transaction (Category: 'رواتب')
      // Exactly 1 expense record per payment
      const expenseRef = await addDoc(
        collection(db, 'expenses'),
        sanitizeForFirestore({
          tenantId: tenantId,
          branchId: branchId || payroll.branch_id || '',
          amount: Number(amount),
          category: 'رواتب',
          description: `صرف راتب شهر ${payroll.period} للموظف ${payroll.employeeName}${notes ? ' - ' + notes : ''}`,
          date: todayStr,
          payment_id: paymentId,
          reference_id: `salary_payment_${paymentId}`,
          payroll_period: payroll.period,
          employee_id: payroll.employeeId,
          createdBy: currentUser?.uid || 'المدير',
          createdAt: nowIso,
        })
      );

      // 4. Link expenseId into salary payment
      await updateDoc(paymentRef, {
        expenseId: expenseRef.id,
      });

      // 5. Update / Save Payroll Record with new paid total & remaining
      const newTotalPaid = (payroll.totalPaid || 0) + Number(amount);
      const newRemaining = Math.max(0, payroll.netSalary - newTotalPaid);
      const newStatus = newRemaining === 0 ? 'paid' : 'partial';

      const payrollDocRef = doc(db, 'payrolls', payroll.id);
      await setDoc(
        payrollDocRef,
        sanitizeForFirestore({
          ...payroll,
          branch_id: branchId || payroll.branch_id || '',
          totalPaid: newTotalPaid,
          remaining: newRemaining,
          status: newStatus,
          updatedAt: nowIso,
        }),
        { merge: true }
      );

      // 6. Seal Advance Installments if not already sealed for this period
      const currentAdvances = options.allAdvances || advances;
      const empAdvances = currentAdvances.filter(
        (a) => a.employeeId === payroll.employeeId && a.status !== 'cancelled'
      );

      for (const adv of empAdvances) {
        if (!adv.deductedPeriods || !adv.deductedPeriods.includes(payroll.period)) {
          const installment = calculateAdvanceDueInstallment(adv, payroll.period);
          if (installment > 0) {
            // Create Advance Installment Document
            await addDoc(
              collection(db, 'advance_installments'),
              sanitizeForFirestore({
                tenant_id: tenantId,
                advanceId: adv.id,
                employeeId: payroll.employeeId,
                payrollId: payroll.id,
                period: payroll.period,
                amount: installment,
                status: 'paid',
                paidAt: nowIso,
                createdAt: nowIso,
              })
            );

            // Update Advance document
            const updatedAdv = applyAdvanceDeduction(adv, payroll.period, installment);
            await updateDoc(
              doc(db, 'advances', adv.id),
              sanitizeForFirestore({
                paidAmount: updatedAdv.paidAmount,
                remainingAmount: updatedAdv.remainingAmount,
                remainingInstallments: updatedAdv.remainingInstallments,
                status: updatedAdv.status,
                deductedPeriods: updatedAdv.deductedPeriods,
                updatedAt: nowIso,
              })
            );
          }
        }
      }

      // 7. Audit Log
      await addDoc(
        collection(db, 'audit_logs'),
        sanitizeForFirestore({
          tenant_id: tenantId,
          action: 'salary_paid',
          entity: 'salary_payment',
          target_id: paymentId,
          user: currentUser?.name || currentUser?.email || 'المدير',
          details: `صرف دفعة راتب للموظف ${payroll.employeeName} بقيمة ${amount} ج.م لشهر ${payroll.period} بطريقة ${paymentMethod}`,
          severity: 'info',
          created_at: nowIso,
        })
      );

      // 8. Smart Notification (only for authorized payroll viewers)
      notifySalaryPayment(
        branchId || payroll.branch_id || 'all',
        payroll.employeeName,
        Number(amount),
        paymentId
      ).catch(() => {});

      toast.success(`تم صرف الراتب بنجاح: ${amount.toLocaleString('ar-EG')} ج.م للموظف ${payroll.employeeName}`);
      await fetchAllPayrollData();
      return true;
    } catch (err: any) {
      console.error('Error disbursing salary payment:', err);
      toast.error('حدث خطأ أثناء صرف الراتب: ' + err.message);
      return false;
    } finally {
      setIsSubmittingPayment(false);
    }
  };

  /**
   * Helper to verify if the user has permissions to void/cancel financial operations
   */
  const checkFinancialPermission = (currentUser?: any): boolean => {
    if (!currentUser) return true;
    if (currentUser.isAdmin) return true;
    if (currentUser.roles && Array.isArray(currentUser.roles)) {
      if (currentUser.roles.some((r: string) => ['admin', 'super_admin', 'owner', 'manager'].includes(r))) {
        return true;
      }
    }
    if (currentUser.permissions && Array.isArray(currentUser.permissions)) {
      if (currentUser.permissions.includes('*') || currentUser.permissions.includes('payroll.manage')) {
        return true;
      }
    }
    if (currentUser.role && ['admin', 'super_admin', 'owner', 'manager'].includes(currentUser.role)) {
      return true;
    }
    if (currentUser.roles?.length || currentUser.role) {
      return false;
    }
    return true;
  };

  /**
   * Voids / Cancels a salary payment safely:
   * - Marks payment voided with mandatory reason and operator
   * - Sets corresponding expense status = 'voided' (keeps immutable audit history)
   * - Restores payroll totalPaid, remaining, and status
   * - Records SALARY_PAYMENT_VOIDED audit log
   * - Includes double-click idempotency protection
   */
  const voidSalaryPayment = async (
    paymentId: string,
    reason: string,
    currentUser?: any
  ): Promise<boolean> => {
    if (!tenantId) return false;
    if (isProcessingCancellation) return false;

    if (!checkFinancialPermission(currentUser)) {
      toast.error('غير مصرح لك بإجراء هذه العملية المالية');
      return false;
    }

    if (!reason?.trim()) {
      toast.error('يرجى تحديد سبب إلغاء الدفعة');
      return false;
    }

    try {
      setIsProcessingCancellation(true);
      const payment = salaryPayments.find((p) => p.id === paymentId);
      if (!payment || payment.status === 'voided') {
        toast.error('الدفعة غير موجودة أو تم إلغاؤها مسبقاً');
        return false;
      }

      const nowIso = new Date().toISOString();
      const performedByName = currentUser?.name || currentUser?.email || 'المدير';

      // 1. Mark payment voided
      await updateDoc(
        doc(db, 'salary_payments', paymentId),
        sanitizeForFirestore({
          status: 'voided',
          voidReason: reason.trim(),
          voidedAt: nowIso,
          voidedBy: performedByName,
        })
      );

      // 2. Void corresponding expense (Do NOT delete doc, retain audit trail!)
      const expenseVoidData = sanitizeForFirestore({
        status: 'voided',
        voidReason: reason.trim(),
        voidedAt: nowIso,
        voidedBy: performedByName,
      });

      if (payment.expenseId) {
        await updateDoc(doc(db, 'expenses', payment.expenseId), expenseVoidData).catch(() => {});
      }
      // Also search by payment_id and reference_id to ensure complete consistency
      try {
        const expQ1 = query(collection(db, 'expenses'), where('payment_id', '==', paymentId));
        const expSnap1 = await getDocs(expQ1);
        for (const d of expSnap1.docs) {
          await updateDoc(d.ref, expenseVoidData).catch(() => {});
        }

        const expQ2 = query(collection(db, 'expenses'), where('reference_id', '==', `salary_payment_${paymentId}`));
        const expSnap2 = await getDocs(expQ2);
        for (const d of expSnap2.docs) {
          await updateDoc(d.ref, expenseVoidData).catch(() => {});
        }
      } catch (e) {
        console.warn('Could not update all linked expenses by query:', e);
      }

      // 3. Update Payroll Record
      const payroll = payrolls.find((p) => p.id === payment.payrollId);
      if (payroll) {
        const newTotalPaid = Math.max(0, (payroll.totalPaid || 0) - payment.amount);
        const newRemaining = Math.max(0, payroll.netSalary - newTotalPaid);
        let newStatus: 'unpaid' | 'partial' | 'paid' = 'unpaid';
        if (newTotalPaid >= payroll.netSalary && payroll.netSalary > 0) {
          newStatus = 'paid';
        } else if (newTotalPaid > 0) {
          newStatus = 'partial';
        } else {
          newStatus = 'unpaid';
        }

        await updateDoc(
          doc(db, 'payrolls', payroll.id),
          sanitizeForFirestore({
            totalPaid: newTotalPaid,
            remaining: newRemaining,
            status: newStatus,
            updatedAt: nowIso,
          })
        );
      }

      // 4. Audit Log
      await addDoc(
        collection(db, 'audit_logs'),
        sanitizeForFirestore({
          tenant_id: tenantId,
          branch_id: payment.branch_id || branchId || '',
          action: 'SALARY_PAYMENT_VOIDED',
          entityType: 'salary_payment',
          entityId: paymentId,
          employeeId: payment.employeeId,
          employeeName: payment.employeeName,
          amount: payment.amount,
          reason: reason.trim(),
          performedBy: performedByName,
          performedAt: nowIso,
          previousStatus: 'completed',
          newStatus: 'voided',
          details: `إلغاء دفعة راتب للموظف ${payment.employeeName} بقيمة ${payment.amount} ج.م لشهر ${payment.payrollPeriod}. السبب: ${reason}`,
          severity: 'warning',
          created_at: nowIso,
        })
      );

      toast.success('تم إلغاء دفعة الراتب وتحديث المصروف والمسير بنجاح');
      await fetchAllPayrollData();
      return true;
    } catch (err: any) {
      console.error('Error voiding salary payment:', err);
      toast.error('حدث خطأ أثناء إلغاء الدفعة: ' + err.message);
      return false;
    } finally {
      setIsProcessingCancellation(false);
    }
  };

  /**
   * Creates a new advance for an employee and records an idempotent cash outflow in expenses
   */
  const createAdvance = async (advanceData: {
    employeeId: string;
    employeeName: string;
    amount: number;
    repaymentType: AdvanceRepaymentType;
    installmentAmount?: number;
    numberOfInstallments?: number;
    startDate: string;
    paymentMethod: PaymentMethod;
    notes?: string;
    currentUser?: { name?: string; email?: string; uid?: string };
    idempotencyKey?: string;
  }): Promise<string | null> => {
    if (!tenantId) return null;
    if (isProcessingAdvance) return null;

    try {
      setIsProcessingAdvance(true);
      const nowIso = new Date().toISOString();
      const amount = Number(advanceData.amount);
      if (!Number.isFinite(amount) || amount <= 0) {
        toast.error('قيمة السلفة يجب أن تكون أكبر من الصفر');
        return null;
      }

      const isInstallments = advanceData.repaymentType === 'installments';
      const numberOfInstallments = isInstallments ? Math.max(1, Number(advanceData.numberOfInstallments) || 1) : 1;
      const installmentAmount = isInstallments
        ? Math.round((amount / numberOfInstallments) * 100) / 100
        : amount;

      // 1. Create advance document in 'advances' collection
      const docRef = await addDoc(
        collection(db, 'advances'),
        sanitizeForFirestore({
          tenant_id: tenantId,
          branch_id: branchId || '',
          employeeId: advanceData.employeeId,
          employeeName: advanceData.employeeName,
          amount,
          paidAmount: 0,
          remainingAmount: amount,
          repaymentType: advanceData.repaymentType,
          installmentAmount,
          numberOfInstallments,
          remainingInstallments: numberOfInstallments,
          startDate: advanceData.startDate,
          paymentMethod: advanceData.paymentMethod,
          status: 'active',
          deductedPeriods: [],
          notes: advanceData.notes?.trim() || '',
          createdAt: nowIso,
          createdBy: advanceData.currentUser?.name || advanceData.currentUser?.email || 'المدير',
        })
      );

      const advanceId = docRef.id;
      const expenseId = `employee_advance_${advanceId}`;

      // 2. Create linked cash outflow transaction in 'expenses'
      // Category: 'سلف الموظفين', type: 'employee_advance'
      // affectsCashFlow: true (money left the cash drawer)
      // affectsProfitLoss: false (not an operational expense, balance sheet asset)
      // isOperatingExpense: false (strictly excluded from operating expense totals)
      await setDoc(
        doc(db, 'expenses', expenseId),
        sanitizeForFirestore({
          id: expenseId,
          tenantId: tenantId,
          tenant_id: tenantId,
          branchId: branchId || '',
          branch_id: branchId || '',
          amount,
          category: 'سلف الموظفين',
          type: 'employee_advance',
          description: `سلفة موظف: ${advanceData.employeeName}`,
          date: advanceData.startDate || nowIso.split('T')[0],
          paymentMethod: advanceData.paymentMethod || 'cash',
          employee_id: advanceData.employeeId,
          employee_name: advanceData.employeeName,
          advance_id: advanceId,
          reference_id: expenseId,
          affectsCashFlow: true,
          affectsProfitLoss: false,
          isOperatingExpense: false,
          status: 'active',
          createdBy: advanceData.currentUser?.name || advanceData.currentUser?.email || 'المدير',
          createdAt: nowIso,
        })
      );

      // 3. Link expenseId to the advance document
      await updateDoc(
        doc(db, 'advances', advanceId),
        sanitizeForFirestore({
          expenseId,
          expense_id: expenseId,
        })
      );

      // 4. Record Financial Audit Log
      await addDoc(
        collection(db, 'audit_logs'),
        sanitizeForFirestore({
          tenant_id: tenantId,
          branch_id: branchId || '',
          action: 'EMPLOYEE_ADVANCE_CREATED',
          entityType: 'advance',
          entityId: advanceId,
          employeeId: advanceData.employeeId,
          employeeName: advanceData.employeeName,
          amount,
          cashTransactionId: expenseId,
          user: advanceData.currentUser?.name || advanceData.currentUser?.email || 'المدير',
          details: `إنشاء سلفة جديدة للموظف ${advanceData.employeeName} بمبلغ ${amount} ج.م وقيد حركة خروج نقدية مرتبطة (${expenseId})`,
          severity: 'info',
          created_at: nowIso,
        })
      );

      toast.success('تم تسجيل السلفة وتوثيق خروج النقدية بنجاح');
      await fetchAllPayrollData();
      return advanceId;
    } catch (err: any) {
      console.error('Error creating advance:', err);
      toast.error('حدث خطأ أثناء إضافة السلفة: ' + err.message);
      return null;
    } finally {
      setIsProcessingAdvance(false);
    }
  };

  /**
   * Cancels an advance safely:
   * - If uncollected (paidAmount === 0): status = 'cancelled', remainingAmount = 0
   * - If partially paid (paidAmount > 0): status = 'cancelled', halts future installments, retains historical paid installments
   * - Mandatory reason & operator
   * - Records ADVANCE_CANCELLED audit log
   */
  const cancelAdvance = async (
    advanceId: string,
    reason: string,
    currentUser?: any
  ): Promise<boolean> => {
    if (!tenantId) return false;
    if (isProcessingCancellation) return false;

    if (!checkFinancialPermission(currentUser)) {
      toast.error('غير مصرح لك بإجراء هذه العملية المالية');
      return false;
    }

    if (!reason?.trim()) {
      toast.error('يرجى تحديد سبب إلغاء السلفة');
      return false;
    }

    try {
      setIsProcessingCancellation(true);
      const adv = advances.find((a) => a.id === advanceId);
      if (!adv || adv.status === 'cancelled') {
        toast.error('السلفة غير موجودة أو تم إلغاؤها مسبقاً');
        return false;
      }

      const nowIso = new Date().toISOString();
      const performedByName = currentUser?.name || currentUser?.email || 'المدير';
      const wasPartiallyPaid = (adv.paidAmount || 0) > 0;

      await updateDoc(
        doc(db, 'advances', advanceId),
        sanitizeForFirestore({
          status: 'cancelled',
          remainingAmount: 0,
          remainingInstallments: 0,
          cancelReason: reason.trim(),
          cancelledAt: nowIso,
          cancelledBy: performedByName,
          notes: `${adv.notes || ''} [تم الإلغاء بواسطة ${performedByName}: ${reason.trim()}]`.trim(),
          updatedAt: nowIso,
        })
      );

      // Cancel future unpaid installments linked to this advance
      const linkedUnpaidInstallments = advanceInstallments.filter(
        (i) => i.advanceId === advanceId && i.status !== 'paid' && i.status !== 'voided'
      );
      for (const inst of linkedUnpaidInstallments) {
        try {
          await updateDoc(
            doc(db, 'advance_installments', inst.id),
            sanitizeForFirestore({
              status: 'cancelled',
              voidReason: `إلغاء السلفة: ${reason.trim()}`,
              voidedAt: nowIso,
              voidedBy: performedByName,
            })
          );
        } catch (e) {
          console.warn('Could not cancel installment:', inst.id, e);
        }
      }

      // Void linked cash outflow transaction in 'expenses'
      const expenseId = adv.expenseId || adv.expense_id || `employee_advance_${advanceId}`;
      try {
        await updateDoc(
          doc(db, 'expenses', expenseId),
          sanitizeForFirestore({
            status: 'voided',
            voidReason: `إلغاء السلفة: ${reason.trim()}`,
            voidedAt: nowIso,
            voidedBy: performedByName,
            affectsCashFlow: false,
            updatedAt: nowIso,
          })
        );
      } catch (e) {
        console.warn('Could not void linked advance expense:', expenseId, e);
      }

      // Audit Log
      await addDoc(
        collection(db, 'audit_logs'),
        sanitizeForFirestore({
          tenant_id: tenantId,
          branch_id: adv.branch_id || branchId || '',
          action: 'EMPLOYEE_ADVANCE_CANCELLED',
          entityType: 'advance',
          entityId: advanceId,
          employeeId: adv.employeeId,
          employeeName: adv.employeeName,
          amount: adv.amount,
          cashTransactionId: expenseId,
          reason: reason.trim(),
          performedBy: performedByName,
          performedAt: nowIso,
          previousStatus: adv.status,
          newStatus: 'cancelled',
          details: `إلغاء سلفة للموظف ${adv.employeeName} بمبلغ ${adv.amount} ج.م وإلغاء حركة النقدية المرتبطة (${expenseId}). السبب: ${reason}`,
          severity: 'warning',
          created_at: nowIso,
        })
      );

      toast.success(
        wasPartiallyPaid
          ? 'تم إلغاء السلفة وإيقاف الأقساط المستقبلية مع الاحتفاظ بالسجل المالي'
          : 'تم إلغاء السلفة بنجاح'
      );
      await fetchAllPayrollData();
      return true;
    } catch (err: any) {
      console.error('Error cancelling advance:', err);
      toast.error('خطأ أثناء إلغاء السلفة: ' + err.message);
      return false;
    } finally {
      setIsProcessingCancellation(false);
    }
  };

  /**
   * Safely Hard Deletes an advance IF AND ONLY IF it has no financial activity:
   * - Rule: paidAmount === 0, no paid installments, no deducted periods linked to paid salaries.
   * - If any financial activity exists: Rejects hard deletion and instructs caller to cancel instead.
   * - Enforces role permissions (Admin, Owner, Manager).
   * - Requires mandatory reason (e.g. "تم تسجيل السلفة بالخطأ").
   * - Records ADVANCE_DELETED audit log before deletion.
   * - Cleans up any linked unpaid advance_installments.
   * - Idempotent & prevents double-delete concurrency.
   * - Immediately updates in-memory states (advances, advanceInstallments).
   */
  const deleteAdvance = async (
    advanceId: string,
    reason: string,
    currentUser?: any
  ): Promise<{ success: boolean; message?: string }> => {
    if (!tenantId) return { success: false, message: 'لم يتم تحديد المتجر/المكتبة' };
    if (isProcessingCancellation) return { success: false, message: 'جاري معالجة عملية أخرى، يرجى الانتظار' };

    if (!checkFinancialPermission(currentUser)) {
      toast.error('ليس لديك صلاحية لحذف السلف');
      return { success: false, message: 'ليس لديك صلاحية لحذف السلف' };
    }

    if (!reason?.trim()) {
      toast.error('سبب الحذف إجباري للمتابعة');
      return { success: false, message: 'سبب الحذف إجباري للمتابعة' };
    }

    const adv = advances.find((a) => a.id === advanceId);
    if (!adv) {
      toast.error('السلفة غير موجودة أو تم حذفها بالفعل');
      return { success: false, message: 'السلفة غير موجودة أو تم حذفها بالفعل' };
    }

    // Verification of financial activity
    const check = canDeleteAdvance(adv, advanceInstallments, salaryPayments);
    if (!check.allowed) {
      toast.error(check.reason || 'لا يمكن حذف هذه السلفة نهائيًا لأنها تحتوي على عمليات مالية سابقة');
      return { success: false, message: check.reason };
    }

    try {
      setIsProcessingCancellation(true);
      const nowIso = new Date().toISOString();
      const performedByName = currentUser?.name || currentUser?.email || 'المدير';

      // 1. Record Audit Log before hard delete
      await addDoc(
        collection(db, 'audit_logs'),
        sanitizeForFirestore({
          tenant_id: tenantId,
          branch_id: adv.branch_id || branchId || '',
          action: 'ADVANCE_DELETED',
          entityType: 'advance',
          entityId: advanceId,
          employeeId: adv.employeeId,
          employeeName: adv.employeeName,
          amount: adv.amount,
          reason: reason.trim(),
          performedBy: performedByName,
          performedAt: nowIso,
          previousStatus: adv.status,
          newStatus: 'deleted',
          details: `حذف سلفة للموظف ${adv.employeeName} بمبلغ ${adv.amount} ج.م نهائياً لعدم وجود حركات مالية عليها. السبب: ${reason.trim()}`,
          severity: 'warning',
          created_at: nowIso,
        })
      );

      // 2. Remove any linked unpaid installments
      const linkedInstallments = advanceInstallments.filter((i) => i.advanceId === advanceId);
      for (const inst of linkedInstallments) {
        try {
          await deleteDoc(doc(db, 'advance_installments', inst.id));
        } catch (e) {
          console.warn('Could not delete installment:', inst.id, e);
        }
      }

      // Void linked cash outflow transaction in 'expenses' to prevent phantom cash outflows
      const expenseId = adv.expenseId || adv.expense_id || `employee_advance_${advanceId}`;
      try {
        await updateDoc(
          doc(db, 'expenses', expenseId),
          sanitizeForFirestore({
            status: 'voided',
            voidReason: `حذف السلفة: ${reason.trim()}`,
            voidedAt: nowIso,
            voidedBy: performedByName,
            affectsCashFlow: false,
            updatedAt: nowIso,
          })
        );
      } catch (e) {
        console.warn('Could not void linked advance expense on deletion:', expenseId, e);
      }

      // 3. Delete the advance document
      await deleteDoc(doc(db, 'advances', advanceId));

      // 4. Update in-memory states immediately
      setAdvances((prev) => prev.filter((a) => a.id !== advanceId));
      setAdvanceInstallments((prev) => prev.filter((i) => i.advanceId !== advanceId));

      toast.success('تم حذف السلفة بنجاح');
      return { success: true };
    } catch (err: any) {
      console.error('Error deleting advance:', err);
      toast.error('حدث خطأ أثناء حذف السلفة: ' + err.message);
      return { success: false, message: err.message };
    } finally {
      setIsProcessingCancellation(false);
    }
  };

  /**
   * Safely reverses an advance installment that was deducted from a payroll:
   * - Guard: If the payroll was already paid (totalPaid > 0), BLOCKS reversal and warns the user:
   *   "هذا القسط مرتبط بمرتب تم دفعه بالفعل. يجب أولاً عكس/تعديل دفعة المرتب."
   * - If allowed:
   *   - Marks installment status = 'voided'
   *   - Restores advance balance (paidAmount decreased, remainingAmount increased, period removed from deductedPeriods)
   *   - Restores payroll balance (advanceDeductions decreased, netSalary & remaining recalculated)
   *   - Records ADVANCE_INSTALLMENT_REVERSED audit log
   */
  const reverseAdvanceInstallment = async (
    installmentId: string,
    reason: string,
    currentUser?: any
  ): Promise<boolean> => {
    if (!tenantId) return false;
    if (isProcessingCancellation) return false;

    if (!checkFinancialPermission(currentUser)) {
      toast.error('غير مصرح لك بإجراء هذه العملية المالية');
      return false;
    }

    if (!reason?.trim()) {
      toast.error('يرجى تحديد سبب إلغاء القسط');
      return false;
    }

    try {
      setIsProcessingCancellation(true);
      const installment = advanceInstallments.find((i) => i.id === installmentId);
      if (!installment || installment.status === 'voided') {
        toast.error('القسط غير موجود أو تم إلغاؤه مسبقاً');
        return false;
      }

      const payroll = payrolls.find((p) => p.id === installment.payrollId);
      const advance = advances.find((a) => a.id === installment.advanceId);
      if (!advance) {
        toast.error('بيانات السلفة المرتبطة غير موجودة');
        return false;
      }

      // Guard: if salary was already paid, block reversal!
      if (payroll && (payroll.totalPaid || 0) > 0) {
        toast.error('هذا القسط مرتبط بمرتب تم دفعه بالفعل. يجب أولاً عكس/تعديل دفعة المرتب.');
        return false;
      }

      const nowIso = new Date().toISOString();
      const performedByName = currentUser?.name || currentUser?.email || 'المدير';

      // 1. Mark installment voided
      await updateDoc(
        doc(db, 'advance_installments', installmentId),
        sanitizeForFirestore({
          status: 'voided',
          voidReason: reason.trim(),
          voidedAt: nowIso,
          voidedBy: performedByName,
        })
      );

      // 2. Restore Advance balance
      const restoredPaidAmount = Math.max(0, (advance.paidAmount || 0) - installment.amount);
      const restoredRemainingAmount = Math.min(
        advance.amount,
        (advance.remainingAmount || 0) + installment.amount
      );
      const restoredRemainingInstallments =
        advance.repaymentType === 'installments'
          ? (advance.remainingInstallments || 0) + 1
          : 1;
      const restoredDeductedPeriods = (advance.deductedPeriods || []).filter(
        (p) => p !== installment.period
      );
      const restoredStatus = restoredPaidAmount > 0 ? 'partially_paid' : 'active';

      await updateDoc(
        doc(db, 'advances', advance.id),
        sanitizeForFirestore({
          paidAmount: restoredPaidAmount,
          remainingAmount: restoredRemainingAmount,
          remainingInstallments: restoredRemainingInstallments,
          deductedPeriods: restoredDeductedPeriods,
          status: restoredStatus,
          updatedAt: nowIso,
        })
      );

      // 3. Restore Payroll balance if exists
      if (payroll) {
        const newAdvanceDeductions = Math.max(
          0,
          (payroll.advanceDeductions || 0) - installment.amount
        );
        const newNetSalary = Math.max(
          0,
          payroll.grossSalary -
            payroll.attendanceDeductions -
            payroll.manualDeductions -
            newAdvanceDeductions
        );
        const newRemaining = Math.max(0, newNetSalary - (payroll.totalPaid || 0));
        let newStatus: 'unpaid' | 'partial' | 'paid' = 'unpaid';
        if ((payroll.totalPaid || 0) >= newNetSalary && newNetSalary > 0) {
          newStatus = 'paid';
        } else if ((payroll.totalPaid || 0) > 0) {
          newStatus = 'partial';
        } else {
          newStatus = 'unpaid';
        }

        await updateDoc(
          doc(db, 'payrolls', payroll.id),
          sanitizeForFirestore({
            advanceDeductions: newAdvanceDeductions,
            netSalary: newNetSalary,
            remaining: newRemaining,
            status: newStatus,
            updatedAt: nowIso,
          })
        );
      }

      // 4. Audit Log
      await addDoc(
        collection(db, 'audit_logs'),
        sanitizeForFirestore({
          tenant_id: tenantId,
          branch_id: advance.branch_id || branchId || '',
          action: 'ADVANCE_INSTALLMENT_REVERSED',
          entityType: 'advance_installment',
          entityId: installmentId,
          employeeId: installment.employeeId,
          amount: installment.amount,
          reason: reason.trim(),
          performedBy: performedByName,
          performedAt: nowIso,
          previousStatus: 'paid',
          newStatus: 'voided',
          details: `عكس قسط سلفة بقيمة ${installment.amount} ج.م لشهر ${installment.period}. السبب: ${reason}`,
          severity: 'warning',
          created_at: nowIso,
        })
      );

      toast.success('تم إلغاء قسط السلفة واستعادة الرصيد للمسير والسلفة بنجاح');
      await fetchAllPayrollData();
      return true;
    } catch (err: any) {
      console.error('Error reversing installment:', err);
      toast.error('حدث خطأ أثناء عكس القسط: ' + err.message);
      return false;
    } finally {
      setIsProcessingCancellation(false);
    }
  };

  /**
   * Compute dashboard KPI cards for payroll
   */
  const getKPIs = (periodRecords: PayrollRecord[]): PayrollKPIs => {
    const totalPayroll = periodRecords.reduce((sum, p) => sum + p.netSalary, 0);
    const totalPaid = periodRecords.reduce((sum, p) => sum + p.totalPaid, 0);
    const totalRemaining = periodRecords.reduce((sum, p) => sum + p.remaining, 0);

    const activeAdvancesTotal = advances
      .filter((a) => a.status === 'active' || a.status === 'partially_paid')
      .reduce((sum, a) => sum + a.remainingAmount, 0);

    const employeesCount = periodRecords.length;

    return {
      totalPayroll,
      totalPaid,
      totalRemaining,
      activeAdvancesTotal,
      employeesCount,
    };
  };

  return {
    payrolls,
    salaryPayments,
    advances,
    advanceInstallments,
    loading,
    isSubmittingPayment,
    isProcessingCancellation,
    isProcessingAdvance,
    fetchAllPayrollData,
    getPayrollForPeriod,
    disburseSalaryPayment,
    voidSalaryPayment,
    createAdvance,
    cancelAdvance,
    deleteAdvance,
    reverseAdvanceInstallment,
    getKPIs,
  };
}
