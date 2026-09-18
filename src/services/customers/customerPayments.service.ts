/**
 * Retail Customer Payments Service (Phase 8)
 * Atomic, Idempotent, Concurrency-Safe Customer Payment Execution,
 * Receivable Invoice Allocation (Oldest Due First / Manual),
 * Customer Advances, and Payment Reversals.
 */

import { db } from '@/lib/firebase';
import {
  collection,
  doc,
  getDoc,
  getDocs,
  query,
  where,
  orderBy,
  runTransaction,
} from 'firebase/firestore';
import type {
  Customer,
  CustomerPayment,
  CustomerPaymentAllocation,
  CustomerReceivable,
  CustomerLedgerEntry,
  PaymentMethodType,
  CashierShift,
} from '@/types/retail.types';
import { formatSequenceNumber } from '../sales/invoiceNumber.service';

export interface ManualAllocationInput {
  receivableId: string;
  amount: number;
}

export interface ProcessCustomerPaymentParams {
  tenantId: string;
  branchId?: string;
  branchCode?: string;
  customerId: string;
  amount: number;
  paymentMethod: PaymentMethodType | string;
  paymentDestination?: 'cash_register' | 'bank' | 'treasury' | 'other';
  allocationMode?: 'oldest_due_first' | 'manual';
  manualAllocations?: ManualAllocationInput[];
  allowCustomerAdvance?: boolean;
  referenceNumber?: string;
  shiftId?: string | null;
  processedBy: string;
  notes?: string;
  clientPaymentId: string;
}

export interface ProcessCustomerPaymentResult {
  success: boolean;
  isIdempotentReplay: boolean;
  payment?: CustomerPayment;
  allocations?: CustomerPaymentAllocation[];
  unallocatedCredit?: number;
  newBalance?: number;
  error?: string;
}

/**
 * Returns deterministic document ID for customer payment idempotency lock
 */
export function getCustomerPaymentIdempotencyDocId(tenantId: string, idempotencyKey: string): string {
  const sanitized = idempotencyKey.replace(/[^a-zA-Z0-9_-]/g, '_');
  return `${tenantId}___${sanitized}`;
}

/**
 * Generates an atomic sequential Payment Number (e.g. CP-HQ-2026-000001)
 */
export async function generateCustomerPaymentNumber(
  tenantId: string,
  branchCode = 'HQ'
): Promise<string> {
  const year = new Date().getFullYear();
  const counterRef = doc(db, 'sequence_counters', `${tenantId}_${branchCode}_cp_${year}`);
  const seq = await runTransaction(db, async (tx) => {
    const snap = await tx.get(counterRef);
    const current = snap.exists() ? Number(snap.data().lastSequence || 0) : 0;
    const next = current + 1;
    tx.set(counterRef, { lastSequence: next, updatedAt: new Date().toISOString() }, { merge: true });
    return next;
  });
  return `CP-${branchCode}-${year}-${formatSequenceNumber(seq, 6)}`;
}

/**
 * Executes a customer payment atomically inside a single Firestore transaction:
 * 1. Checks idempotency.
 * 2. Reads Customer and active open receivables.
 * 3. Allocates payment (Oldest Due First or Manual).
 * 4. Deducts receivable balances.
 * 5. Handles excess as Customer Advance.
 * 6. Creates CustomerPayment, CustomerPaymentAllocations, and CustomerLedgerEntry.
 * 7. Updates Customer currentBalance atomically.
 * 8. Updates Cash Register if cash destination.
 */
export async function completeCustomerPaymentTransaction(
  params: ProcessCustomerPaymentParams
): Promise<ProcessCustomerPaymentResult> {
  const {
    tenantId,
    branchId = 'main',
    branchCode = 'HQ',
    customerId,
    amount,
    paymentMethod,
    paymentDestination = 'cash_register',
    allocationMode = 'oldest_due_first',
    manualAllocations = [],
    allowCustomerAdvance = true,
    referenceNumber,
    shiftId,
    processedBy,
    notes,
    clientPaymentId,
  } = params;

  if (!tenantId || !customerId || !amount || amount <= 0) {
    return { success: false, isIdempotentReplay: false, error: 'بيانات السداد أو المبلغ غير صحيحة' };
  }

  const idempotencyKey = `customer_payment:${tenantId}:${clientPaymentId}`;
  const idempDocId = getCustomerPaymentIdempotencyDocId(tenantId, idempotencyKey);
  const idempRef = doc(db, 'customer_idempotency', idempDocId);

  try {
    const result = await runTransaction(db, async (tx) => {
      // 1. Check idempotency
      const idempSnap = await tx.get(idempRef);
      if (idempSnap.exists()) {
        const idempData = idempSnap.data();
        return {
          success: true,
          isIdempotentReplay: true,
          payment: idempData.paymentSnapshot as CustomerPayment,
          newBalance: idempData.newBalance,
        };
      }

      // 2. Read Customer
      const customerRef = doc(db, 'customers', customerId);
      const customerSnap = await tx.get(customerRef);
      if (!customerSnap.exists()) {
        throw new Error('العميل غير موجود');
      }
      const customerData = customerSnap.data() as Customer;
      if (customerData.tenantId !== tenantId) {
        throw new Error('غير مصرح بالوصول إلى بيانات هذا العميل');
      }

      const prevBalance = Number(customerData.currentBalance ?? customerData.balance ?? 0);
      const paymentAmount = Math.round(amount * 100) / 100;
      const now = new Date().toISOString();

      // 3. Read Open Receivables for this customer
      const receivablesQuery = query(
        collection(db, 'customer_receivables'),
        where('tenantId', '==', tenantId),
        where('customerId', '==', customerId),
        where('status', 'in', ['open', 'partially_paid', 'overdue']),
        orderBy('dueDate', 'asc')
      );
      const receivablesSnap = await getDocs(receivablesQuery);
      const openReceivables = receivablesSnap.docs.map((d) => d.data() as CustomerReceivable);

      // Total current outstanding
      const totalOutstanding = openReceivables.reduce((acc, r) => acc + Number(r.remainingAmount || 0), 0);

      if (paymentAmount > totalOutstanding && !allowCustomerAdvance) {
        throw new Error(
          `مبلغ السداد (${paymentAmount} ج.م) يتجاوز إجمالي المستحقات (${totalOutstanding} ج.م) وقبول الدفعات المقدمة غير مفعل`
        );
      }

      // 4. Perform Allocation
      let remainingToAllocate = paymentAmount;
      const allocations: CustomerPaymentAllocation[] = [];
      const paymentDocRef = doc(collection(db, 'customer_payments'));
      const paymentId = paymentDocRef.id;

      if (allocationMode === 'manual' && manualAllocations.length > 0) {
        // Manual Allocation mode
        const manualSum = manualAllocations.reduce((sum, a) => sum + a.amount, 0);
        if (manualSum > paymentAmount) {
          throw new Error('مجموع المبالغ الموزعة يدويًا يتجاوز إجمالي مبلغ الدفعة');
        }

        for (const mAlloc of manualAllocations) {
          if (mAlloc.amount <= 0) continue;
          const rec = openReceivables.find((r) => r.id === mAlloc.receivableId);
          if (!rec) continue;

          const recRef = doc(db, 'customer_receivables', rec.id);
          const currentRem = Number(rec.remainingAmount || 0);
          const allocAmount = Math.min(mAlloc.amount, currentRem);
          const newRem = Math.max(0, Math.round((currentRem - allocAmount) * 100) / 100);
          const newPaid = Math.round(((rec.paidAmount || 0) + allocAmount) * 100) / 100;
          const newStatus = newRem === 0 ? 'paid' : 'partially_paid';

          tx.update(recRef, {
            remainingAmount: newRem,
            paidAmount: newPaid,
            status: newStatus,
            updatedAt: now,
          });

          allocations.push({
            id: doc(collection(db, 'customer_payment_allocations')).id,
            tenantId,
            paymentId,
            customerId,
            receivableId: rec.id,
            saleId: rec.saleId,
            invoiceNumber: rec.invoiceNumber,
            allocatedAmount: allocAmount,
            createdAt: now,
          });

          remainingToAllocate -= allocAmount;
        }
      } else {
        // Default: Oldest Due First (FIFO invoice allocation)
        for (const rec of openReceivables) {
          if (remainingToAllocate <= 0) break;

          const recRef = doc(db, 'customer_receivables', rec.id);
          const currentRem = Number(rec.remainingAmount || 0);
          const allocAmount = Math.min(remainingToAllocate, currentRem);
          const newRem = Math.max(0, Math.round((currentRem - allocAmount) * 100) / 100);
          const newPaid = Math.round(((rec.paidAmount || 0) + allocAmount) * 100) / 100;
          const newStatus = newRem === 0 ? 'paid' : 'partially_paid';

          tx.update(recRef, {
            remainingAmount: newRem,
            paidAmount: newPaid,
            status: newStatus,
            updatedAt: now,
          });

          allocations.push({
            id: doc(collection(db, 'customer_payment_allocations')).id,
            tenantId,
            paymentId,
            customerId,
            receivableId: rec.id,
            saleId: rec.saleId,
            invoiceNumber: rec.invoiceNumber,
            allocatedAmount: allocAmount,
            createdAt: now,
          });

          remainingToAllocate = Math.max(0, Math.round((remainingToAllocate - allocAmount) * 100) / 100);
        }
      }

      const unallocatedCredit = Math.max(0, remainingToAllocate);

      // 5. Generate Payment Number
      const year = new Date().getFullYear();
      const counterRef = doc(db, 'sequence_counters', `${tenantId}_${branchCode}_cp_${year}`);
      const counterSnap = await tx.get(counterRef);
      let nextSeq = 1;
      if (counterSnap.exists()) {
        nextSeq = Number(counterSnap.data().lastSequence || 0) + 1;
      }
      tx.set(counterRef, { lastSequence: nextSeq, updatedAt: now }, { merge: true });
      const paymentNumber = `CP-${branchCode}-${year}-${formatSequenceNumber(nextSeq, 6)}`;

      // 6. Build CustomerPayment Document
      const paymentRecord: CustomerPayment = {
        id: paymentId,
        tenantId,
        customerId,
        customerNameSnapshot: customerData.name,
        paymentNumber,
        branchId,
        amount: paymentAmount,
        paymentMethod,
        paymentDestination,
        paymentDate: now.split('T')[0],
        referenceNumber: referenceNumber || '',
        allocationMode,
        unallocatedCredit,
        shiftId: shiftId || null,
        processedBy,
        notes: notes || '',
        idempotencyKey,
        isReversed: false,
        createdAt: now,
      };
      tx.set(paymentDocRef, paymentRecord);

      // 7. Write Allocations docs
      for (const alloc of allocations) {
        const aRef = doc(db, 'customer_payment_allocations', alloc.id);
        tx.set(aRef, alloc);
      }

      // 8. Write Customer Ledger Entry (Credit decreases customer liability)
      const newCustomerBalance = Math.round((prevBalance - paymentAmount) * 100) / 100;
      const ledgerRef = doc(collection(db, 'customer_ledger'));
      const ledgerEntry: CustomerLedgerEntry = {
        id: ledgerRef.id,
        tenantId,
        customerId,
        customerNameSnapshot: customerData.name,
        type: unallocatedCredit > 0 && allocations.length === 0 ? 'customer_advance' : 'payment',
        referenceType: 'payment',
        referenceId: paymentId,
        referenceNumber: paymentNumber,
        debit: 0,
        credit: paymentAmount,
        balanceBefore: prevBalance,
        balanceAfter: newCustomerBalance,
        branchId,
        notes: `سداد عميل بموجب سند ${paymentNumber} (${paymentMethod})`,
        idempotencyKey,
        createdAt: now,
        createdBy: processedBy,
      };
      tx.set(ledgerRef, ledgerEntry);

      // 9. Update Customer Cached currentBalance
      tx.update(customerRef, {
        currentBalance: newCustomerBalance,
        balance: newCustomerBalance,
        updatedAt: now,
        updatedBy: processedBy,
      });

      // 10. Update Cash Register Shift if active and destination is cash register
      if (paymentMethod === 'cash' && paymentDestination === 'cash_register' && shiftId) {
        const shiftRef = doc(db, 'cashier_shifts', shiftId);
        const shiftSnap = await tx.get(shiftRef);
        if (shiftSnap.exists()) {
          const sData = shiftSnap.data() as CashierShift;
          tx.update(shiftRef, {
            totalSalesCash: (sData.totalSalesCash || 0) + paymentAmount,
            updatedAt: now,
          });

          const regTxRef = doc(collection(db, 'cash_register_transactions'));
          tx.set(regTxRef, {
            id: regTxRef.id,
            tenantId,
            branchId,
            shiftId,
            cashierId: processedBy,
            type: 'customer_payment',
            amount: paymentAmount,
            reason: `تحصيل دفعة عميل (${customerData.name}) سند رقم ${paymentNumber}`,
            createdAt: now,
          });
        }
      }

      // 11. Write Idempotency Lock
      tx.set(idempRef, {
        tenantId,
        idempotencyKey,
        paymentId,
        paymentNumber,
        newBalance: newCustomerBalance,
        paymentSnapshot: paymentRecord,
        createdAt: now,
      });

      return {
        success: true,
        isIdempotentReplay: false,
        payment: paymentRecord,
        allocations,
        unallocatedCredit,
        newBalance: newCustomerBalance,
      };
    });

    return result;
  } catch (err: any) {
    console.error('Customer payment transaction error:', err);
    return {
      success: false,
      isIdempotentReplay: false,
      error: err.message || 'فشلت عملية سداد دفعة العميل',
    };
  }
}

/**
 * Reverses a customer payment safely:
 * Re-opens allocated receivables, writes reversal ledger entry, and restores customer balance.
 */
export async function reverseCustomerPaymentTransaction(params: {
  tenantId: string;
  paymentId: string;
  reason: string;
  reversedBy: string;
}): Promise<{ success: boolean; error?: string }> {
  const { tenantId, paymentId, reason, reversedBy } = params;

  try {
    await runTransaction(db, async (tx) => {
      const paymentRef = doc(db, 'customer_payments', paymentId);
      const paymentSnap = await tx.get(paymentRef);
      if (!paymentSnap.exists()) throw new Error('سند السداد غير موجود');
      const payment = paymentSnap.data() as CustomerPayment;

      if (payment.tenantId !== tenantId) throw new Error('غير مصرح بالوصول إلى هذا السند');
      if (payment.isReversed) throw new Error('هذا السند تم إلغاؤه وعكسه مسبقاً');

      const customerRef = doc(db, 'customers', payment.customerId);
      const customerSnap = await tx.get(customerRef);
      if (!customerSnap.exists()) throw new Error('العميل غير موجود');
      const customer = customerSnap.data() as Customer;

      const now = new Date().toISOString();

      // Read allocations
      const allocQuery = query(
        collection(db, 'customer_payment_allocations'),
        where('tenantId', '==', tenantId),
        where('paymentId', '==', paymentId)
      );
      const allocSnap = await getDocs(allocQuery);

      // Re-open receivables
      for (const d of allocSnap.docs) {
        const alloc = d.data() as CustomerPaymentAllocation;
        const recRef = doc(db, 'customer_receivables', alloc.receivableId);
        const recSnap = await tx.get(recRef);
        if (recSnap.exists()) {
          const rec = recSnap.data() as CustomerReceivable;
          const restoredRemaining = Math.round(((rec.remainingAmount || 0) + alloc.allocatedAmount) * 100) / 100;
          const restoredPaid = Math.max(0, Math.round(((rec.paidAmount || 0) - alloc.allocatedAmount) * 100) / 100);

          tx.update(recRef, {
            remainingAmount: restoredRemaining,
            paidAmount: restoredPaid,
            status: restoredPaid === 0 ? 'open' : 'partially_paid',
            updatedAt: now,
          });
        }
      }

      // Reversal ledger entry: debit restores customer liability
      const prevBal = Number(customer.currentBalance ?? customer.balance ?? 0);
      const newBal = Math.round((prevBal + payment.amount) * 100) / 100;

      const ledgerRef = doc(collection(db, 'customer_ledger'));
      const ledgerEntry: CustomerLedgerEntry = {
        id: ledgerRef.id,
        tenantId,
        customerId: payment.customerId,
        customerNameSnapshot: customer.name,
        type: 'payment_reversal',
        referenceType: 'payment',
        referenceId: paymentId,
        referenceNumber: payment.paymentNumber,
        debit: payment.amount,
        credit: 0,
        balanceBefore: prevBal,
        balanceAfter: newBal,
        notes: `إلغاء وعكس سند السداد رقم ${payment.paymentNumber}: ${reason}`,
        createdAt: now,
        createdBy: reversedBy,
      };
      tx.set(ledgerRef, ledgerEntry);

      // Update customer balance
      tx.update(customerRef, {
        currentBalance: newBal,
        balance: newBal,
        updatedAt: now,
        updatedBy: reversedBy,
      });

      // Mark payment as reversed
      tx.update(paymentRef, {
        isReversed: true,
        reversalReason: reason,
        reversedAt: now,
        reversedBy,
      });
    });

    return { success: true };
  } catch (err: any) {
    console.error('Payment reversal error:', err);
    return { success: false, error: err.message || 'فشلت عملية عكس سند السداد' };
  }
}
