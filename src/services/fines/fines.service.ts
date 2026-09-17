import { db } from '@/lib/firebase';
import {
  collection,
  doc,
  getDocs,
  getDoc,
  addDoc,
  updateDoc,
  query,
  where,
  runTransaction,
  limit as fsLimit,
} from 'firebase/firestore';
import type { Fine, FinePayment, PaymentMethod, Member } from '@/types/library.types';

export async function getFines(
  tenantId: string,
  options: { memberId?: string; status?: string } = {}
): Promise<Fine[]> {
  if (!tenantId) return [];
  const constraints = [where('tenantId', '==', tenantId)];

  if (options.status && options.status !== 'all') {
    constraints.push(where('status', '==', options.status));
  }
  if (options.memberId) {
    constraints.push(where('memberId', '==', options.memberId));
  }

  const q = query(collection(db, 'fines'), ...constraints);
  const snap = await getDocs(q);
  const fines = snap.docs.map((d) => ({ id: d.id, ...(d.data() as Omit<Fine, 'id'>) }));
  fines.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
  return fines;
}

export async function collectFinePayment(options: {
  tenantId: string;
  fineId: string;
  amount: number;
  paymentMethod: PaymentMethod;
  employeeId: string;
  employeeName?: string;
  branchId: string;
  notes?: string;
}): Promise<{ payment: FinePayment; updatedFine: Fine }> {
  const { tenantId, fineId, amount, paymentMethod, employeeId, employeeName, branchId, notes } = options;

  if (amount <= 0) {
    throw new Error('مبلغ السداد يجب أن يكون أكبر من الصفر.');
  }

  const fineRef = doc(db, 'fines', fineId);
  const now = new Date().toISOString();

  let finalPayment: FinePayment | null = null;
  let finalFine: Fine | null = null;

  await runTransaction(db, async (t) => {
    const fineSnap = await t.get(fineRef);
    if (!fineSnap.exists()) throw new Error('سجل الغرامة غير موجود.');
    const liveFine = fineSnap.data() as Fine;

    if (liveFine.status === 'paid' || liveFine.status === 'waived') {
      throw new Error('هذه الغرامة مسددة أو تم إعفاؤها مسبقاً.');
    }

    if (amount > liveFine.remainingAmount) {
      throw new Error(
        `المبلغ المدخل (${amount} ج.م) أكبر من المبلغ المتبقي على الغرامة (${liveFine.remainingAmount} ج.م).`
      );
    }

    const newPaidAmount = Number((liveFine.paidAmount + amount).toFixed(2));
    const newRemaining = Number((liveFine.remainingAmount - amount).toFixed(2));
    const newStatus = newRemaining <= 0 ? 'paid' : 'partially_paid';

    // 1. Update Fine Doc
    t.update(fineRef, {
      paidAmount: newPaidAmount,
      remainingAmount: newRemaining,
      status: newStatus,
      updatedAt: now,
    });

    finalFine = {
      ...liveFine,
      id: fineId,
      paidAmount: newPaidAmount,
      remainingAmount: newRemaining,
      status: newStatus,
      updatedAt: now,
    };

    // 2. Decrement Member Outstanding Fine Balance
    const memberRef = doc(db, 'members', liveFine.memberId);
    const memSnap = await t.get(memberRef);
    if (memSnap.exists()) {
      const liveMem = memSnap.data() as Member;
      const updatedMemFine = Math.max(0, Number(((liveMem.outstandingFine || 0) - amount).toFixed(2)));
      t.update(memberRef, {
        outstandingFine: updatedMemFine,
        updatedAt: now,
      });
    }

    // 3. Generate Receipt & Payment Record
    const receiptNumber = `REC-${Date.now().toString().slice(-6)}`;
    const payRef = doc(collection(db, 'fine_payments'));

    finalPayment = {
      id: payRef.id,
      tenantId,
      fineId,
      memberId: liveFine.memberId,
      amount,
      paymentMethod,
      employeeId,
      employeeName: employeeName || '',
      branchId,
      receiptNumber,
      notes: notes || 'سداد غرامة بالخزينة',
      createdAt: now,
    };

    t.set(payRef, finalPayment);
  });

  return { payment: finalPayment!, updatedFine: finalFine! };
}

export async function waiveFine(options: {
  tenantId: string;
  fineId: string;
  waivedBy: string;
  reason: string;
}): Promise<Fine> {
  const { tenantId, fineId, waivedBy, reason } = options;
  if (!reason.trim()) {
    throw new Error('يرجى كتابة سبب الإعفاء من الغرامة.');
  }

  const fineRef = doc(db, 'fines', fineId);
  const now = new Date().toISOString();
  let updated: Fine | null = null;

  await runTransaction(db, async (t) => {
    const fineSnap = await t.get(fineRef);
    if (!fineSnap.exists()) throw new Error('الغرامة غير موجودة.');
    const liveFine = fineSnap.data() as Fine;

    if (liveFine.status === 'paid' || liveFine.status === 'waived') {
      throw new Error('لا يمكن إعفاء غرامة مغلقة أو مسددة.');
    }

    const waivedAmount = liveFine.remainingAmount;

    t.update(fineRef, {
      status: 'waived',
      remainingAmount: 0,
      waivedBy,
      waivedReason: reason.trim(),
      updatedAt: now,
    });

    updated = {
      ...liveFine,
      id: fineId,
      status: 'waived',
      remainingAmount: 0,
      waivedBy,
      waivedReason: reason.trim(),
      updatedAt: now,
    };

    // Deduct from patron's outstanding fine
    const memberRef = doc(db, 'members', liveFine.memberId);
    const memSnap = await t.get(memberRef);
    if (memSnap.exists()) {
      const liveMem = memSnap.data() as Member;
      const updatedMemFine = Math.max(0, Number(((liveMem.outstandingFine || 0) - waivedAmount).toFixed(2)));
      t.update(memberRef, {
        outstandingFine: updatedMemFine,
        updatedAt: now,
      });
    }
  });

  return updated!;
}
