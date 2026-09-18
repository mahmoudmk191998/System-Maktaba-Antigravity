/**
 * Retail Suppliers Service
 * Production-grade Supplier Management, Supplier-Product Mapping,
 * Immutable Supplier Ledger, and Atomic Payments.
 */

import { db } from '@/lib/firebase';
import {
  collection,
  doc,
  getDoc,
  getDocs,
  setDoc,
  updateDoc,
  query,
  where,
  orderBy,
  limit as fsLimit,
  startAfter,
  runTransaction,
  type DocumentSnapshot,
} from 'firebase/firestore';
import type {
  Supplier,
  SupplierType,
  SupplierProduct,
  SupplierLedgerEntry,
  SupplierPayment,
  PaymentMethodType,
} from '@/types/retail.types';
import { formatSequenceNumber } from '../sales/invoiceNumber.service';

export interface CreateSupplierInput {
  tenantId: string;
  name: string;
  companyName?: string;
  supplierType: SupplierType;
  supplierCode?: string;
  phone: string;
  phone2?: string;
  email?: string;
  address?: string;
  city?: string;
  country?: string;
  taxNumber?: string;
  commercialRegistration?: string;
  contactPerson?: string;
  paymentTermsDays?: number;
  creditLimit?: number;
  openingBalance?: number;
  preferredPaymentMethod?: PaymentMethodType | string;
  publisherId?: string | null;
  notes?: string;
  createdBy?: string;
}

export interface UpdateSupplierInput {
  name?: string;
  companyName?: string;
  supplierType?: SupplierType;
  phone?: string;
  phone2?: string;
  email?: string;
  address?: string;
  city?: string;
  country?: string;
  taxNumber?: string;
  commercialRegistration?: string;
  contactPerson?: string;
  paymentTermsDays?: number;
  creditLimit?: number;
  preferredPaymentMethod?: PaymentMethodType | string;
  publisherId?: string | null;
  notes?: string;
  active?: boolean;
  updatedBy?: string;
}

export interface RecordSupplierPaymentInput {
  tenantId: string;
  supplierId: string;
  branchId?: string;
  amount: number;
  paymentMethod: PaymentMethodType | string;
  paymentSource: 'cash_register' | 'bank' | 'treasury' | 'other';
  referenceNumber?: string;
  paidAt?: string;
  processedBy: string;
  notes?: string;
  clientPaymentId: string;
}

/**
 * Deterministic document ID for supplier payment idempotency lock
 */
export function getSupplierPaymentIdempotencyDocId(tenantId: string, idempotencyKey: string): string {
  const sanitized = idempotencyKey.replace(/[^a-zA-Z0-9_-]/g, '_');
  return `${tenantId}___${sanitized}`;
}

/**
 * Generates an atomic sequential Supplier Code (e.g. SUP-000001)
 */
export async function generateSupplierCode(tenantId: string): Promise<string> {
  const counterRef = doc(db, 'sequence_counters', `${tenantId}_supplier_code`);
  const seq = await runTransaction(db, async (tx) => {
    const snap = await tx.get(counterRef);
    const current = snap.exists() ? Number(snap.data().lastSequence || 0) : 0;
    const next = current + 1;
    tx.set(counterRef, { lastSequence: next, updatedAt: new Date().toISOString() }, { merge: true });
    return next;
  });
  return `SUP-${formatSequenceNumber(seq, 6)}`;
}

/**
 * Creates a new Supplier record. If openingBalance > 0, initializes the ledger.
 */
export async function createSupplier(input: CreateSupplierInput): Promise<Supplier> {
  const {
    tenantId,
    name,
    companyName,
    supplierType,
    phone,
    phone2,
    email,
    address,
    city,
    country,
    taxNumber,
    commercialRegistration,
    contactPerson,
    paymentTermsDays = 30,
    creditLimit = 0,
    openingBalance = 0,
    preferredPaymentMethod,
    publisherId,
    notes,
    createdBy = 'system',
  } = input;

  if (!tenantId || !name || !phone) {
    throw new Error('بيانات المورد الأساسية (الاسم، الهاتف، المنشأة) إلزامية');
  }

  const supplierCode = input.supplierCode?.trim() || (await generateSupplierCode(tenantId));
  const supplierRef = doc(collection(db, 'suppliers'));
  const now = new Date().toISOString();

  const newSupplier: Supplier = {
    id: supplierRef.id,
    tenantId,
    supplierCode,
    name: name.trim(),
    companyName: companyName?.trim() || '',
    supplierType: supplierType || 'general_supplier',
    phone: phone.trim(),
    phone2: phone2?.trim() || '',
    email: email?.trim() || '',
    address: address?.trim() || '',
    city: city?.trim() || '',
    country: country?.trim() || 'Egypt',
    taxNumber: taxNumber?.trim() || '',
    commercialRegistration: commercialRegistration?.trim() || '',
    contactPerson: contactPerson?.trim() || '',
    paymentTermsDays: Number(paymentTermsDays) || 30,
    creditLimit: Number(creditLimit) || 0,
    openingBalance: Number(openingBalance) || 0,
    currentBalance: Number(openingBalance) || 0, // Positive = We owe supplier
    preferredPaymentMethod: preferredPaymentMethod || 'cash',
    publisherId: publisherId || null,
    notes: notes?.trim() || '',
    active: true,
    archived: false,
    createdAt: now,
    updatedAt: now,
    createdBy,
    updatedBy: createdBy,
  };

  await setDoc(supplierRef, newSupplier);

  // If opening balance exists, write opening_balance ledger entry
  if (openingBalance !== 0) {
    const ledgerRef = doc(collection(db, 'supplier_ledger'));
    const ledgerEntry: SupplierLedgerEntry = {
      id: ledgerRef.id,
      tenantId,
      supplierId: supplierRef.id,
      type: 'opening_balance',
      referenceType: 'manual',
      referenceId: supplierRef.id,
      referenceNumber: 'OPENING',
      debit: openingBalance < 0 ? Math.abs(openingBalance) : 0,
      credit: openingBalance > 0 ? openingBalance : 0,
      balanceAfter: openingBalance,
      currency: 'EGP',
      notes: 'رصيد افتتاحي عند إنشاء سجل المورد',
      createdAt: now,
      createdBy,
    };
    await setDoc(ledgerRef, ledgerEntry);
  }

  return newSupplier;
}

/**
 * Updates an existing Supplier record. Protects currentBalance from direct modification.
 */
export async function updateSupplier(
  supplierId: string,
  tenantId: string,
  updates: UpdateSupplierInput
): Promise<void> {
  const supplierRef = doc(db, 'suppliers', supplierId);
  const snap = await getDoc(supplierRef);
  if (!snap.exists()) throw new Error('المورد غير موجود');
  if (snap.data().tenantId !== tenantId) throw new Error('غير مصرح بتعديل هذا المورد');

  const now = new Date().toISOString();
  const safeUpdates: any = {
    updatedAt: now,
  };

  if (updates.name !== undefined) safeUpdates.name = updates.name.trim();
  if (updates.companyName !== undefined) safeUpdates.companyName = updates.companyName.trim();
  if (updates.supplierType !== undefined) safeUpdates.supplierType = updates.supplierType;
  if (updates.phone !== undefined) safeUpdates.phone = updates.phone.trim();
  if (updates.phone2 !== undefined) safeUpdates.phone2 = updates.phone2.trim();
  if (updates.email !== undefined) safeUpdates.email = updates.email.trim();
  if (updates.address !== undefined) safeUpdates.address = updates.address.trim();
  if (updates.city !== undefined) safeUpdates.city = updates.city.trim();
  if (updates.country !== undefined) safeUpdates.country = updates.country.trim();
  if (updates.taxNumber !== undefined) safeUpdates.taxNumber = updates.taxNumber.trim();
  if (updates.commercialRegistration !== undefined) safeUpdates.commercialRegistration = updates.commercialRegistration.trim();
  if (updates.contactPerson !== undefined) safeUpdates.contactPerson = updates.contactPerson.trim();
  if (updates.paymentTermsDays !== undefined) safeUpdates.paymentTermsDays = Number(updates.paymentTermsDays);
  if (updates.creditLimit !== undefined) safeUpdates.creditLimit = Number(updates.creditLimit);
  if (updates.preferredPaymentMethod !== undefined) safeUpdates.preferredPaymentMethod = updates.preferredPaymentMethod;
  if (updates.publisherId !== undefined) safeUpdates.publisherId = updates.publisherId;
  if (updates.notes !== undefined) safeUpdates.notes = updates.notes.trim();
  if (updates.active !== undefined) safeUpdates.active = updates.active;
  if (updates.updatedBy !== undefined) safeUpdates.updatedBy = updates.updatedBy;

  await updateDoc(supplierRef, safeUpdates);
}

/**
 * Safely Archives a supplier (soft-delete). Hard delete is prevented if transactions exist.
 */
export async function archiveSupplier(supplierId: string, tenantId: string, archivedBy: string): Promise<void> {
  const supplierRef = doc(db, 'suppliers', supplierId);
  const snap = await getDoc(supplierRef);
  if (!snap.exists()) throw new Error('المورد غير موجود');
  if (snap.data().tenantId !== tenantId) throw new Error('غير مصرح بأرشفة هذا المورد');

  await updateDoc(supplierRef, {
    archived: true,
    active: false,
    updatedAt: new Date().toISOString(),
    updatedBy: archivedBy,
  });
}

/**
 * Fetches suppliers with filtering and pagination
 */
export interface FetchSuppliersOptions {
  search?: string;
  supplierType?: string;
  activeOnly?: boolean;
  pageSize?: number;
  lastVisible?: DocumentSnapshot;
}

export async function fetchSuppliersFromDb(
  tenantId: string,
  options: FetchSuppliersOptions = {}
): Promise<{ suppliers: Supplier[]; hasMore: boolean; lastVisible?: DocumentSnapshot }> {
  if (!tenantId) return { suppliers: [], hasMore: false };

  const { search, supplierType, activeOnly = false, pageSize = 50, lastVisible } = options;
  const constraints: any[] = [where('tenantId', '==', tenantId)];

  if (activeOnly) {
    constraints.push(where('active', '==', true));
    constraints.push(where('archived', '==', false));
  }
  if (supplierType && supplierType !== 'all') {
    constraints.push(where('supplierType', '==', supplierType));
  }

  constraints.push(orderBy('createdAt', 'desc'));
  constraints.push(fsLimit(pageSize + 1));

  if (lastVisible) {
    constraints.push(startAfter(lastVisible));
  }

  const q = query(collection(db, 'suppliers'), ...constraints);
  const snap = await getDocs(q);

  let docs = snap.docs;
  const hasMore = docs.length > pageSize;
  if (hasMore) {
    docs = docs.slice(0, pageSize);
  }

  let suppliers = docs.map((d) => ({ id: d.id, ...d.data() } as Supplier));

  if (search && search.trim()) {
    const s = search.toLowerCase().trim();
    suppliers = suppliers.filter(
      (sup) =>
        sup.name.toLowerCase().includes(s) ||
        sup.supplierCode.toLowerCase().includes(s) ||
        (sup.companyName && sup.companyName.toLowerCase().includes(s)) ||
        (sup.phone && sup.phone.includes(s)) ||
        (sup.contactPerson && sup.contactPerson.toLowerCase().includes(s)) ||
        (sup.taxNumber && sup.taxNumber.includes(s))
    );
  }

  return {
    suppliers,
    hasMore,
    lastVisible: docs.length > 0 ? docs[docs.length - 1] : undefined,
  };
}

/**
 * Fetches Supplier Ledger Statement with running balance
 */
export async function fetchSupplierLedger(
  tenantId: string,
  supplierId: string,
  pageSize = 100
): Promise<SupplierLedgerEntry[]> {
  const q = query(
    collection(db, 'supplier_ledger'),
    where('tenantId', '==', tenantId),
    where('supplierId', '==', supplierId),
    orderBy('createdAt', 'asc'),
    fsLimit(pageSize)
  );
  const snap = await getDocs(q);
  let running = 0;
  return snap.docs.map((d) => {
    const data = d.data() as SupplierLedgerEntry;
    // Credit increases payable (+), Debit decreases payable (-)
    running += (data.credit || 0) - (data.debit || 0);
    return {
      ...data,
      id: d.id,
      balanceAfter: running,
    };
  });
}

/**
 * Records an Atomic Supplier Payment:
 * Idempotent, decrements supplier currentBalance, and creates ledger entry.
 */
export async function recordSupplierPayment(
  input: RecordSupplierPaymentInput
): Promise<{ success: boolean; isIdempotentReplay: boolean; payment?: SupplierPayment; error?: string }> {
  const {
    tenantId,
    supplierId,
    branchId,
    amount,
    paymentMethod,
    paymentSource,
    referenceNumber,
    paidAt = new Date().toISOString(),
    processedBy,
    notes,
    clientPaymentId,
  } = input;

  if (!tenantId || !supplierId || amount <= 0) {
    return { success: false, isIdempotentReplay: false, error: 'مبلغ الدفعة غير صالح أو بيانات المورد ناقصة' };
  }

  const idempotencyKey = `supplier_payment:${tenantId}:${clientPaymentId}`;
  const idempDocId = getSupplierPaymentIdempotencyDocId(tenantId, idempotencyKey);
  const idempRef = doc(db, 'purchase_idempotency', idempDocId);

  const year = new Date().getFullYear();
  const counterRef = doc(db, 'sequence_counters', `${tenantId}_supplier_payment_${year}`);

  try {
    const res = await runTransaction(db, async (tx) => {
      // 1. Idempotency Check
      const idempSnap = await tx.get(idempRef);
      if (idempSnap.exists()) {
        return {
          isIdempotentReplay: true,
          payment: idempSnap.data().paymentSnapshot as SupplierPayment,
        };
      }

      // 2. Read Supplier
      const supplierRef = doc(db, 'suppliers', supplierId);
      const supplierSnap = await tx.get(supplierRef);
      if (!supplierSnap.exists()) {
        throw new Error('المورد المطلوب سداد الدفعة له غير موجود');
      }

      const supplierData = supplierSnap.data() as Supplier;
      if (supplierData.tenantId !== tenantId) {
        throw new Error('غير مصرح بالوصول إلى بيانات هذا المورد');
      }

      // 3. Generate Atomic Payment Number
      const counterSnap = await tx.get(counterRef);
      const currentSeq = counterSnap.exists() ? Number(counterSnap.data().lastSequence || 0) : 0;
      const nextSeq = currentSeq + 1;
      tx.set(counterRef, { lastSequence: nextSeq, updatedAt: paidAt }, { merge: true });
      const paymentNumber = `PAY-SUP-${year}-${formatSequenceNumber(nextSeq, 6)}`;

      // 4. Calculate new balance
      const currentBal = Number(supplierData.currentBalance || 0);
      const newBal = Math.round((currentBal - amount) * 100) / 100;

      // 5. Create Payment Record
      const paymentRef = doc(collection(db, 'supplier_payments'));
      const paymentRecord: SupplierPayment = {
        id: paymentRef.id,
        tenantId,
        supplierId,
        branchId,
        paymentNumber,
        amount,
        paymentMethod,
        paymentSource,
        referenceNumber: referenceNumber || '',
        paidAt,
        processedBy,
        notes: notes || '',
        idempotencyKey,
        createdAt: paidAt,
      };
      tx.set(paymentRef, paymentRecord);

      // 6. Create Ledger Entry (Debit = Payment reduces liability)
      const ledgerRef = doc(collection(db, 'supplier_ledger'));
      const ledgerEntry: SupplierLedgerEntry = {
        id: ledgerRef.id,
        tenantId,
        supplierId,
        type: 'payment',
        referenceType: 'supplier_payment',
        referenceId: paymentRef.id,
        referenceNumber: paymentNumber,
        debit: amount,
        credit: 0,
        balanceAfter: newBal,
        currency: 'EGP',
        notes: notes ? `دفعة للمورد (${notes})` : `سداد دفعة للمورد برقم ${paymentNumber}`,
        createdAt: paidAt,
        createdBy: processedBy,
      };
      tx.set(ledgerRef, ledgerEntry);

      // 7. Update Supplier current balance
      tx.update(supplierRef, {
        currentBalance: newBal,
        updatedAt: paidAt,
        updatedBy: processedBy,
      });

      // 8. Register Idempotency Lock
      tx.set(idempRef, {
        tenantId,
        idempotencyKey,
        paymentId: paymentRef.id,
        paymentNumber,
        amount,
        paymentSnapshot: paymentRecord,
        createdAt: paidAt,
      });

      return {
        isIdempotentReplay: false,
        payment: paymentRecord,
      };
    });

    return {
      success: true,
      isIdempotentReplay: res.isIdempotentReplay,
      payment: res.payment,
    };
  } catch (err: any) {
    console.error('Supplier payment error:', err);
    return {
      success: false,
      isIdempotentReplay: false,
      error: err.message || 'فشلت عملية سداد دفعة المورد',
    };
  }
}

/**
 * Reconciles the supplier ledger against cached currentBalance.
 * Returns difference if any discrepancy exists.
 */
export async function reconcileSupplierBalance(
  tenantId: string,
  supplierId: string
): Promise<{ isReconciled: boolean; ledgerSum: number; cachedBalance: number; difference: number }> {
  const supplierRef = doc(db, 'suppliers', supplierId);
  const supplierSnap = await getDoc(supplierRef);
  if (!supplierSnap.exists()) throw new Error('المورد غير موجود');

  const cachedBalance = Number(supplierSnap.data().currentBalance || 0);

  const q = query(
    collection(db, 'supplier_ledger'),
    where('tenantId', '==', tenantId),
    where('supplierId', '==', supplierId)
  );
  const snap = await getDocs(q);

  let ledgerSum = 0;
  snap.docs.forEach((d) => {
    const entry = d.data() as SupplierLedgerEntry;
    ledgerSum += (entry.credit || 0) - (entry.debit || 0);
  });

  ledgerSum = Math.round(ledgerSum * 100) / 100;
  const difference = Math.round((cachedBalance - ledgerSum) * 100) / 100;

  return {
    isReconciled: Math.abs(difference) < 0.01,
    ledgerSum,
    cachedBalance,
    difference,
  };
}
