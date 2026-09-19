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
import { firestoreLogger } from '@/lib/firestoreLogger';
import type {
  Supplier,
  SupplierType,
  SupplierProduct,
  SupplierLedgerEntry,
  SupplierPayment,
  PaymentMethodType,
  GoodsReceipt,
  JournalEntry,
} from '@/types/retail.types';
import { formatSequenceNumber } from '../sales/invoiceNumber.service';
import {
  postSupplierPaymentJournalEntry,
  postGoodsReceiptJournalEntry,
} from '../accounting/postingEngine';

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
  try {
    const counterRef = doc(db, 'sequence_counters', `${tenantId}_supplier_code`);
    const seq = await runTransaction(db, async (tx) => {
      const snap = await tx.get(counterRef);
      const current = snap.exists() ? Number(snap.data().lastSequence || 0) : 0;
      const next = current + 1;
      tx.set(counterRef, { lastSequence: next, updatedAt: new Date().toISOString() }, { merge: true });
      return next;
    });
    return `SUP-${formatSequenceNumber(seq, 6)}`;
  } catch (err) {
    console.warn('Transaction failed for generateSupplierCode, using timestamp fallback:', err);
    return `SUP-${Date.now().toString().slice(-6)}`;
  }
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
    tenant_id: tenantId,
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
      tenant_id: tenantId,
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
  const docTenant = snap.data().tenantId || snap.data().tenant_id;
  if (tenantId && tenantId !== 'default' && docTenant && docTenant !== tenantId) {
    throw new Error('غير مصرح بتعديل هذا المورد');
  }

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
  const docTenant = snap.data().tenantId || snap.data().tenant_id;
  if (tenantId && tenantId !== 'default' && docTenant && docTenant !== tenantId) {
    throw new Error('غير مصرح بأرشفة هذا المورد');
  }

  await updateDoc(supplierRef, {
    archived: true,
    active: false,
    updatedAt: new Date().toISOString(),
    updatedBy: archivedBy,
  });
}

/**
 * Restores an archived supplier back to active status.
 */
export async function restoreSupplier(
  supplierId: string,
  tenantId: string,
  restoredBy: string
): Promise<void> {
  const supplierRef = doc(db, 'suppliers', supplierId);
  const snap = await getDoc(supplierRef);
  if (!snap.exists()) throw new Error('المورد غير موجود');
  const docTenant = snap.data().tenantId || snap.data().tenant_id;
  if (tenantId && tenantId !== 'default' && docTenant && docTenant !== tenantId) {
    throw new Error('غير مصرح باسترجاع هذا المورد');
  }

  await updateDoc(supplierRef, {
    archived: false,
    active: true,
    updatedAt: new Date().toISOString(),
    updatedBy: restoredBy,
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

  const { search, supplierType, activeOnly = false, pageSize = 50 } = options;

  let rawDocs: any[] = [];
  try {
    let snap = await getDocs(query(collection(db, 'suppliers'), where('tenantId', '==', tenantId), fsLimit(pageSize)));
    firestoreLogger.logOperation('suppliers.service', 'suppliers', 'getDocs', snap.docs.length);
    if (snap.empty) {
      snap = await getDocs(query(collection(db, 'suppliers'), where('tenant_id', '==', tenantId), fsLimit(pageSize)));
      firestoreLogger.logOperation('suppliers.service.alt', 'suppliers', 'getDocs', snap.docs.length);
    }
    if (snap.empty && (tenantId === 'default' || !tenantId)) {
      snap = await getDocs(query(collection(db, 'suppliers'), fsLimit(pageSize)));
      firestoreLogger.logOperation('suppliers.service.fallback', 'suppliers', 'getDocs', snap.docs.length);
    }
    rawDocs = snap.docs;
  } catch (err) {
    console.warn('Primary supplier query failed, falling back to bounded query:', err);
    try {
      const snap = await getDocs(query(collection(db, 'suppliers'), fsLimit(pageSize)));
      firestoreLogger.logOperation('suppliers.service.fallbackErr', 'suppliers', 'getDocs', snap.docs.length);
      rawDocs = snap.docs;
    } catch (fallbackErr) {
      console.error('All supplier fetch attempts failed:', fallbackErr);
      return { suppliers: [], hasMore: false };
    }
  }

  let suppliers: Supplier[] = rawDocs
    .map((d) => ({ id: d.id, ...d.data() } as Supplier))
    .filter((sup) => {
      // Tenant isolation
      const docTenant = sup.tenantId || (sup as any).tenant_id;
      if (tenantId && tenantId !== 'default' && docTenant && docTenant !== tenantId) {
        return false;
      }
      // Active / Archived filter
      if (activeOnly) {
        if (sup.active === false || sup.archived === true) return false;
      }
      // Supplier type filter
      if (supplierType && supplierType !== 'all' && sup.supplierType !== supplierType) {
        return false;
      }
      return true;
    });

  // Sort by createdAt descending in-memory (bulletproof, zero index requirement)
  suppliers.sort((a, b) => {
    const timeA = a.createdAt ? new Date(a.createdAt).getTime() : 0;
    const timeB = b.createdAt ? new Date(b.createdAt).getTime() : 0;
    return timeB - timeA;
  });

  if (search && search.trim()) {
    const s = search.toLowerCase().trim();
    suppliers = suppliers.filter(
      (sup) =>
        (sup.name && sup.name.toLowerCase().includes(s)) ||
        (sup.supplierCode && sup.supplierCode.toLowerCase().includes(s)) ||
        (sup.companyName && sup.companyName.toLowerCase().includes(s)) ||
        (sup.phone && sup.phone.includes(s)) ||
        (sup.contactPerson && sup.contactPerson.toLowerCase().includes(s)) ||
        (sup.taxNumber && sup.taxNumber.includes(s))
    );
  }

  const hasMore = suppliers.length > pageSize;
  const pagedSuppliers = suppliers.slice(0, pageSize);

  return {
    suppliers: pagedSuppliers,
    hasMore,
  };
}

/**
 * Fetches Supplier Ledger Statement with running balance.
 * Uses a single equality query on supplierId to avoid composite index failures,
 * with client-side tenant isolation and chronological sorting.
 */
export async function fetchSupplierLedger(
  tenantId: string,
  supplierId: string,
  pageSize = 250
): Promise<SupplierLedgerEntry[]> {
  if (!supplierId) return [];

  let rawDocs: any[] = [];
  try {
    const q = query(
      collection(db, 'supplier_ledger'),
      where('supplierId', '==', supplierId)
    );
    const snap = await getDocs(q);
    rawDocs = snap.docs;
  } catch (err) {
    console.warn('Query supplier_ledger by supplierId failed, attempting fallback:', err);
    try {
      const snap = await getDocs(collection(db, 'supplier_ledger'));
      rawDocs = snap.docs;
    } catch (fallbackErr) {
      console.error('All supplier_ledger fetch attempts failed:', fallbackErr);
      return [];
    }
  }

  let entries: SupplierLedgerEntry[] = rawDocs
    .map((d) => ({ id: d.id, ...d.data() } as SupplierLedgerEntry))
    .filter((entry) => {
      if (entry.supplierId !== supplierId) return false;
      const docTenant = entry.tenantId || (entry as any).tenant_id;
      if (tenantId && tenantId !== 'default' && docTenant && docTenant !== tenantId) {
        return false;
      }
      return true;
    });

  // Sort ascending by creation time so running balance is calculated chronologically
  entries.sort((a, b) => {
    const timeA = a.createdAt ? new Date(a.createdAt).getTime() : 0;
    const timeB = b.createdAt ? new Date(b.createdAt).getTime() : 0;
    return timeA - timeB;
  });

  if (pageSize && entries.length > pageSize) {
    entries = entries.slice(-pageSize);
  }

  let running = 0;
  return entries.map((entry) => {
    // Credit increases payable (+), Debit decreases payable (-)
    running += (Number(entry.credit) || 0) - (Number(entry.debit) || 0);
    running = Math.round(running * 100) / 100;
    return {
      ...entry,
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

    if (res.success && res.payment && !res.isIdempotentReplay) {
      // Post to accounting journal in background
      postSupplierPaymentJournalEntry(res.payment, tenantId, { createdBy: processedBy }).catch((postErr) => {
        console.warn('Background accounting journal post for payment skipped/failed:', postErr);
      });
    }

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
 * Returns detailed breakdown of debits, credits, and discrepancy if any exists.
 */
export async function reconcileSupplierBalance(
  tenantId: string,
  supplierId: string
): Promise<{
  isReconciled: boolean;
  ledgerSum: number;
  cachedBalance: number;
  difference: number;
  purchasesTotal: number;
  paymentsTotal: number;
  returnsTotal: number;
  openingBalance: number;
}> {
  const supplierRef = doc(db, 'suppliers', supplierId);
  const supplierSnap = await getDoc(supplierRef);
  if (!supplierSnap.exists()) throw new Error('المورد غير موجود');

  const supplierData = supplierSnap.data() as Supplier;
  const cachedBalance = Number(supplierData.currentBalance || 0);
  const openingBalance = Number(supplierData.openingBalance || 0);

  const entries = await fetchSupplierLedger(tenantId, supplierId, 500);

  let purchasesTotal = 0;
  let paymentsTotal = 0;
  let returnsTotal = 0;
  let ledgerSum = 0;

  entries.forEach((e) => {
    const c = Number(e.credit) || 0;
    const d = Number(e.debit) || 0;
    ledgerSum += c - d;
    if (e.type === 'purchase_invoice') purchasesTotal += c;
    if (e.type === 'payment') paymentsTotal += d;
    if (e.type === 'purchase_return') returnsTotal += d;
  });

  ledgerSum = Math.round(ledgerSum * 100) / 100;
  const difference = Math.round((cachedBalance - ledgerSum) * 100) / 100;

  return {
    isReconciled: Math.abs(difference) < 0.01,
    ledgerSum,
    cachedBalance,
    difference,
    purchasesTotal: Math.round(purchasesTotal * 100) / 100,
    paymentsTotal: Math.round(paymentsTotal * 100) / 100,
    returnsTotal: Math.round(returnsTotal * 100) / 100,
    openingBalance,
  };
}

/**
 * Synchronizes Goods Receipts, Payments, Returns, and Opening Balance into supplier_ledger,
 * posts any missing journal entries, re-computes running balance,
 * and perfectly matches cached currentBalance with the ledger entries (100% reconciliation).
 */
export async function syncAndReconcileSupplierLedger(
  tenantId: string,
  supplierId: string,
  processedBy: string = 'نظام المطابقة الدفترية'
): Promise<{
  isReconciled: boolean;
  ledgerSum: number;
  cachedBalance: number;
  difference: number;
  syncedCount: number;
  createdJournalCount: number;
}> {
  const supplierRef = doc(db, 'suppliers', supplierId);
  const supplierSnap = await getDoc(supplierRef);
  if (!supplierSnap.exists()) throw new Error('المورد غير موجود');
  const supplierData = { id: supplierSnap.id, ...supplierSnap.data() } as Supplier;

  // 1. Fetch current ledger entries
  const existingEntries = await fetchSupplierLedger(tenantId, supplierId, 1000);
  const existingRefIds = new Set(existingEntries.map((e) => e.referenceId).filter(Boolean));
  const existingRefNums = new Set(existingEntries.map((e) => e.referenceNumber).filter(Boolean));

  let syncedCount = 0;
  let createdJournalCount = 0;

  // 2. Fetch Goods Receipts for this supplier
  let grnDocs: any[] = [];
  try {
    const grnSnap = await getDocs(
      query(collection(db, 'goods_receipts'), where('supplierId', '==', supplierId))
    );
    grnDocs = grnSnap.docs;
  } catch {
    const allGrn = await getDocs(collection(db, 'goods_receipts'));
    grnDocs = allGrn.docs.filter((d) => d.data().supplierId === supplierId);
  }

  for (const gDoc of grnDocs) {
    const grn = { id: gDoc.id, ...gDoc.data() } as GoodsReceipt;
    const docTenant = grn.tenantId || (grn as any).tenant_id;
    if (tenantId && tenantId !== 'default' && docTenant && docTenant !== tenantId) continue;

    if (!existingRefIds.has(grn.id) && !existingRefNums.has(grn.receiptNumber)) {
      const ledgerRef = doc(collection(db, 'supplier_ledger'));
      const totalLiability = Number(grn.grandTotal || 0);
      const newEntry: SupplierLedgerEntry = {
        id: ledgerRef.id,
        tenantId: grn.tenantId || tenantId,
        tenant_id: grn.tenantId || tenantId,
        supplierId,
        type: 'purchase_invoice',
        referenceType: 'goods_receipt',
        referenceId: grn.id,
        referenceNumber: grn.receiptNumber,
        debit: 0,
        credit: totalLiability,
        balanceAfter: 0,
        currency: 'EGP',
        notes: grn.supplierInvoiceNumber
          ? `فاتورة مشتريات رقم ${grn.supplierInvoiceNumber} بموجب إذن الاستلام ${grn.receiptNumber}`
          : `استلام بضاعة بموجب إذن استلام رقم ${grn.receiptNumber}`,
        createdAt: grn.receivedAt || grn.createdAt || new Date().toISOString(),
        createdBy: grn.receivedBy || processedBy,
      };
      await setDoc(ledgerRef, newEntry);
      existingRefIds.add(grn.id);
      existingRefNums.add(grn.receiptNumber);
      syncedCount++;

      // Try posting journal entry if not already posted
      try {
        const j = await postGoodsReceiptJournalEntry(grn, tenantId, { createdBy: processedBy });
        if (j) createdJournalCount++;
      } catch (postErr) {
        console.warn('Accounting journal post skipped/failed:', postErr);
      }
    }
  }

  // 3. Fetch Payments for this supplier
  let payDocs: any[] = [];
  try {
    const paySnap = await getDocs(
      query(collection(db, 'supplier_payments'), where('supplierId', '==', supplierId))
    );
    payDocs = paySnap.docs;
  } catch {
    const allPay = await getDocs(collection(db, 'supplier_payments'));
    payDocs = allPay.docs.filter((d) => d.data().supplierId === supplierId);
  }

  for (const pDoc of payDocs) {
    const pay = { id: pDoc.id, ...pDoc.data() } as SupplierPayment;
    const docTenant = pay.tenantId || (pay as any).tenant_id;
    if (tenantId && tenantId !== 'default' && docTenant && docTenant !== tenantId) continue;

    if (!existingRefIds.has(pay.id) && !existingRefNums.has(pay.paymentNumber)) {
      const ledgerRef = doc(collection(db, 'supplier_ledger'));
      const amount = Number(pay.amount || 0);
      const newEntry: SupplierLedgerEntry = {
        id: ledgerRef.id,
        tenantId: pay.tenantId || tenantId,
        tenant_id: pay.tenantId || tenantId,
        supplierId,
        type: 'payment',
        referenceType: 'supplier_payment',
        referenceId: pay.id,
        referenceNumber: pay.paymentNumber,
        debit: amount,
        credit: 0,
        balanceAfter: 0,
        currency: 'EGP',
        notes: pay.notes || `سداد دفعة للمورد برقم ${pay.paymentNumber}`,
        createdAt: pay.paidAt || pay.createdAt || new Date().toISOString(),
        createdBy: pay.processedBy || processedBy,
      };
      await setDoc(ledgerRef, newEntry);
      existingRefIds.add(pay.id);
      existingRefNums.add(pay.paymentNumber);
      syncedCount++;

      try {
        const j = await postSupplierPaymentJournalEntry(pay, tenantId, { createdBy: processedBy });
        if (j) createdJournalCount++;
      } catch (postErr) {
        console.warn('Accounting journal post skipped/failed:', postErr);
      }
    }
  }

  // 4. Check opening balance
  const opBal = Number(supplierData.openingBalance || 0);
  const hasOpeningEntry = existingEntries.some((e) => e.type === 'opening_balance');
  if (opBal !== 0 && !hasOpeningEntry) {
    const ledgerRef = doc(collection(db, 'supplier_ledger'));
    const opEntry: SupplierLedgerEntry = {
      id: ledgerRef.id,
      tenantId,
      tenant_id: tenantId,
      supplierId,
      type: 'opening_balance',
      referenceType: 'manual',
      referenceId: supplierId,
      referenceNumber: 'OPENING',
      debit: opBal < 0 ? Math.abs(opBal) : 0,
      credit: opBal > 0 ? opBal : 0,
      balanceAfter: opBal,
      currency: 'EGP',
      notes: 'رصيد افتتاحي معتمد للمورد',
      createdAt: supplierData.createdAt || new Date().toISOString(),
      createdBy: processedBy,
    };
    await setDoc(ledgerRef, opEntry);
    syncedCount++;
  }

  // 5. Re-fetch all entries, calculate cumulative balances and update supplier.currentBalance
  const allUpdated = await fetchSupplierLedger(tenantId, supplierId, 1000);
  let running = 0;
  for (const entry of allUpdated) {
    running += (Number(entry.credit) || 0) - (Number(entry.debit) || 0);
    running = Math.round(running * 100) / 100;
    if (entry.balanceAfter !== running) {
      await updateDoc(doc(db, 'supplier_ledger', entry.id), {
        balanceAfter: running,
      });
    }
  }

  // Update supplier currentBalance to strictly match ledger
  await updateDoc(supplierRef, {
    currentBalance: running,
    updatedAt: new Date().toISOString(),
    updatedBy: processedBy,
  });

  return {
    isReconciled: true,
    ledgerSum: running,
    cachedBalance: running,
    difference: 0,
    syncedCount,
    createdJournalCount,
  };
}

/**
 * Fetches general journal entries from accounting linked to this supplier.
 */
export async function fetchSupplierJournalEntries(
  tenantId: string,
  supplierId: string
): Promise<JournalEntry[]> {
  if (!tenantId || !supplierId) return [];
  try {
    let q = query(
      collection(db, 'journal_entries'),
      where('tenantId', '==', tenantId)
    );
    let snap = await getDocs(q);
    if (snap.empty) {
      q = query(
        collection(db, 'journal_entries'),
        where('tenant_id', '==', tenantId)
      );
      snap = await getDocs(q);
    }
    if (snap.empty && (tenantId === 'default' || !tenantId)) {
      snap = await getDocs(collection(db, 'journal_entries'));
    }

    return snap.docs
      .map((d) => ({ id: d.id, ...d.data() } as JournalEntry))
      .filter((je) => {
        return (
          je.lines?.some((line) => line.supplierId === supplierId) ||
          (je as any).supplierId === supplierId
        );
      })
      .sort((a, b) => new Date(b.date || b.createdAt).getTime() - new Date(a.date || a.createdAt).getTime());
  } catch (err) {
    console.warn('fetchSupplierJournalEntries warning:', err);
    return [];
  }
}
