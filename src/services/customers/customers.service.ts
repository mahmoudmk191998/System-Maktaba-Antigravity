/**
 * Retail Customers Service (Phase 8)
 * Production-grade Customer Management, Customer Code Generation,
 * Safe Archiving, Immutable Customer Ledger, and Balance Reconciliation.
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
  deleteDoc,
  runTransaction,
  type DocumentSnapshot,
} from 'firebase/firestore';
import type {
  Customer,
  CustomerType,
  CustomerCreditStatus,
  CustomerLedgerEntry,
  CustomerLedgerEntryType,
  PaymentMethodType,
} from '@/types/retail.types';
import { formatSequenceNumber } from '../sales/invoiceNumber.service';

export interface CreateCustomerInput {
  tenantId: string;
  name: string;
  companyName?: string;
  customerType?: CustomerType;
  customerCode?: string;
  phone: string;
  phone2?: string;
  email?: string;
  address?: string;
  city?: string;
  taxNumber?: string;
  commercialRegistration?: string;
  contactPerson?: string;
  creditEnabled?: boolean;
  creditLimit?: number;
  creditStatus?: CustomerCreditStatus;
  paymentTermsDays?: number;
  openingBalance?: number; // Positive = Customer owes us, Negative = Customer has credit
  defaultPriceListId?: string | null;
  preferredPaymentMethod?: PaymentMethodType | string;
  notes?: string;
  createdBy?: string;
}

export interface UpdateCustomerInput {
  name?: string;
  companyName?: string;
  customerType?: CustomerType;
  phone?: string;
  phone2?: string;
  email?: string;
  address?: string;
  city?: string;
  taxNumber?: string;
  commercialRegistration?: string;
  contactPerson?: string;
  creditEnabled?: boolean;
  creditLimit?: number;
  creditStatus?: CustomerCreditStatus;
  paymentTermsDays?: number;
  defaultPriceListId?: string | null;
  preferredPaymentMethod?: PaymentMethodType | string;
  notes?: string;
  active?: boolean;
  updatedBy?: string;
}

export interface AdjustCustomerBalanceInput {
  tenantId: string;
  customerId: string;
  amount: number; // Positive increases customer debt (debit), Negative decreases debt (credit)
  type?: 'manual_adjustment' | 'credit_note' | 'debit_note' | 'write_off';
  reason: string;
  processedBy: string;
  notes?: string;
}

/**
 * Generates an atomic sequential Customer Code (e.g. CUS-000001)
 */
export async function generateCustomerCode(tenantId: string): Promise<string> {
  const counterRef = doc(db, 'sequence_counters', `${tenantId}_customer_code`);
  const seq = await runTransaction(db, async (tx) => {
    const snap = await tx.get(counterRef);
    const current = snap.exists() ? Number(snap.data().lastSequence || 0) : 0;
    const next = current + 1;
    tx.set(counterRef, { lastSequence: next, updatedAt: new Date().toISOString() }, { merge: true });
    return next;
  });
  return `CUS-${formatSequenceNumber(seq, 6)}`;
}

/**
 * Creates a new Customer. If opening balance is provided, initializes the customer_ledger.
 */
export async function createCustomer(input: CreateCustomerInput): Promise<Customer> {
  const {
    tenantId,
    name,
    companyName,
    customerType = 'retail',
    phone,
    phone2,
    email,
    address,
    city,
    taxNumber,
    commercialRegistration,
    contactPerson,
    creditEnabled = false,
    creditLimit = 0,
    creditStatus = 'normal',
    paymentTermsDays = 30,
    openingBalance = 0,
    defaultPriceListId = null,
    preferredPaymentMethod = 'cash',
    notes,
    createdBy = 'system',
  } = input;

  if (!tenantId || !name || !phone) {
    throw new Error('اسم العميل ورقم الهاتف ومُعرّف المؤسسة حقول إلزامية');
  }

  const customerCode = input.customerCode?.trim() || (await generateCustomerCode(tenantId));
  const customerRef = doc(collection(db, 'customers'));
  const now = new Date().toISOString();

  const newCustomer: Customer = {
    id: customerRef.id,
    tenantId,
    customerCode,
    name: name.trim(),
    companyName: companyName?.trim() || '',
    customerType,
    phone: phone.trim(),
    phone2: phone2?.trim() || '',
    email: email?.trim() || '',
    address: address?.trim() || '',
    city: city?.trim() || '',
    taxNumber: taxNumber?.trim() || '',
    commercialRegistration: commercialRegistration?.trim() || '',
    contactPerson: contactPerson?.trim() || '',
    creditEnabled: !!creditEnabled,
    creditLimit: Math.max(0, Number(creditLimit) || 0),
    creditStatus,
    paymentTermsDays: Math.max(0, Number(paymentTermsDays) || 0),
    openingBalance: Number(openingBalance) || 0,
    currentBalance: Number(openingBalance) || 0, // Positive = owes us, Negative = credit
    balance: Number(openingBalance) || 0,
    defaultPriceListId: defaultPriceListId || null,
    preferredPaymentMethod,
    totalPurchases: 0,
    notes: notes?.trim() || '',
    active: true,
    archived: false,
    createdAt: now,
    updatedAt: now,
    createdBy,
    updatedBy: createdBy,
  };

  await setDoc(customerRef, newCustomer);

  // If opening balance exists, write opening_balance ledger entry
  if (openingBalance !== 0) {
    const ledgerRef = doc(collection(db, 'customer_ledger'));
    const isReceivable = openingBalance > 0;
    const ledgerEntry: CustomerLedgerEntry = {
      id: ledgerRef.id,
      tenantId,
      customerId: customerRef.id,
      customerNameSnapshot: newCustomer.name,
      type: 'opening_balance',
      referenceType: 'opening_balance',
      referenceId: customerRef.id,
      referenceNumber: 'OPENING',
      debit: isReceivable ? openingBalance : 0,
      credit: !isReceivable ? Math.abs(openingBalance) : 0,
      balanceAfter: openingBalance,
      notes: 'رصيد افتتاحي عند إنشاء ملف العميل',
      createdAt: now,
      createdBy,
    };
    await setDoc(ledgerRef, ledgerEntry);
  }

  return newCustomer;
}

/**
 * Updates customer profile details. STRICTLY protects currentBalance from manual modification.
 */
export async function updateCustomer(
  customerId: string,
  tenantId: string,
  updates: UpdateCustomerInput
): Promise<void> {
  const customerRef = doc(db, 'customers', customerId);
  const snap = await getDoc(customerRef);
  if (!snap.exists()) throw new Error('العميل غير موجود');
  if (snap.data().tenantId !== tenantId) throw new Error('غير مصرح بتعديل هذا العميل');

  const now = new Date().toISOString();
  const safeUpdates: Partial<Customer> = {
    updatedAt: now,
    updatedBy: updates.updatedBy || 'system',
  };

  if (updates.name !== undefined) safeUpdates.name = updates.name.trim();
  if (updates.companyName !== undefined) safeUpdates.companyName = updates.companyName.trim();
  if (updates.customerType !== undefined) safeUpdates.customerType = updates.customerType;
  if (updates.phone !== undefined) safeUpdates.phone = updates.phone.trim();
  if (updates.phone2 !== undefined) safeUpdates.phone2 = updates.phone2.trim();
  if (updates.email !== undefined) safeUpdates.email = updates.email.trim();
  if (updates.address !== undefined) safeUpdates.address = updates.address.trim();
  if (updates.city !== undefined) safeUpdates.city = updates.city.trim();
  if (updates.taxNumber !== undefined) safeUpdates.taxNumber = updates.taxNumber.trim();
  if (updates.commercialRegistration !== undefined) safeUpdates.commercialRegistration = updates.commercialRegistration.trim();
  if (updates.contactPerson !== undefined) safeUpdates.contactPerson = updates.contactPerson.trim();
  if (updates.creditEnabled !== undefined) safeUpdates.creditEnabled = !!updates.creditEnabled;
  if (updates.creditLimit !== undefined) safeUpdates.creditLimit = Math.max(0, Number(updates.creditLimit) || 0);
  if (updates.creditStatus !== undefined) safeUpdates.creditStatus = updates.creditStatus;
  if (updates.paymentTermsDays !== undefined) safeUpdates.paymentTermsDays = Math.max(0, Number(updates.paymentTermsDays) || 0);
  if (updates.defaultPriceListId !== undefined) safeUpdates.defaultPriceListId = updates.defaultPriceListId;
  if (updates.preferredPaymentMethod !== undefined) safeUpdates.preferredPaymentMethod = updates.preferredPaymentMethod;
  if (updates.notes !== undefined) safeUpdates.notes = updates.notes.trim();
  if (updates.active !== undefined) safeUpdates.active = !!updates.active;

  await updateDoc(customerRef, safeUpdates);
}

/**
 * Safely archives a customer. Does NOT hard delete, preserving historical sales and ledger.
 */
export async function archiveCustomer(customerId: string, tenantId: string): Promise<void> {
  const customerRef = doc(db, 'customers', customerId);
  const snap = await getDoc(customerRef);
  if (!snap.exists()) throw new Error('العميل غير موجود');
  if (snap.data().tenantId !== tenantId) throw new Error('غير مصرح بأرشفة هذا العميل');

  await updateDoc(customerRef, {
    active: false,
    archived: true,
    updatedAt: new Date().toISOString(),
  });
}

/**
 * Adjusts customer balance atomically through a ledger entry.
 * Positive amount increases customer debt (debit), Negative amount decreases debt/adds credit (credit).
 */
export async function adjustCustomerBalance(
  params: AdjustCustomerBalanceInput
): Promise<{ success: boolean; newBalance: number; ledgerEntryId: string }> {
  const {
    tenantId,
    customerId,
    amount,
    type = 'manual_adjustment',
    reason,
    processedBy,
    notes,
  } = params;

  if (!amount || amount === 0) throw new Error('مبلغ التسوية لا يمكن أن يكون صفراً');
  if (!reason || reason.trim() === '') throw new Error('سبب التسوية المالية إلزامي');

  const customerRef = doc(db, 'customers', customerId);
  const now = new Date().toISOString();
  const ledgerRef = doc(collection(db, 'customer_ledger'));

  return await runTransaction(db, async (tx) => {
    const custSnap = await tx.get(customerRef);
    if (!custSnap.exists()) throw new Error('العميل غير موجود');
    const custData = custSnap.data() as Customer;
    if (custData.tenantId !== tenantId) throw new Error('غير مصرح بالوصول إلى هذا العميل');

    const prevBalance = Number(custData.currentBalance || custData.balance || 0);
    const newBalance = Math.round((prevBalance + amount) * 100) / 100;

    const isDebit = amount > 0;
    const absAmount = Math.abs(amount);

    const ledgerEntry: CustomerLedgerEntry = {
      id: ledgerRef.id,
      tenantId,
      customerId,
      customerNameSnapshot: custData.name,
      type,
      referenceType: 'manual',
      referenceId: ledgerRef.id,
      referenceNumber: `ADJ-${new Date().getFullYear()}`,
      debit: isDebit ? absAmount : 0,
      credit: !isDebit ? absAmount : 0,
      balanceBefore: prevBalance,
      balanceAfter: newBalance,
      notes: `${reason} ${notes ? `- ${notes}` : ''}`,
      createdAt: now,
      createdBy: processedBy,
    };

    tx.set(ledgerRef, ledgerEntry);
    tx.update(customerRef, {
      currentBalance: newBalance,
      balance: newBalance,
      updatedAt: now,
      updatedBy: processedBy,
    });

    return {
      success: true,
      newBalance,
      ledgerEntryId: ledgerRef.id,
    };
  });
}

/**
 * Reconciles customer ledger against cached currentBalance.
 * Convention: Positive = Customer owes store (sum(debit) - sum(credit)).
 */
export async function reconcileCustomerBalance(
  tenantId: string,
  customerId: string
): Promise<{ isReconciled: boolean; ledgerSum: number; cachedBalance: number; difference: number }> {
  const customerRef = doc(db, 'customers', customerId);
  const customerSnap = await getDoc(customerRef);
  if (!customerSnap.exists()) throw new Error('العميل غير موجود');

  const cachedBalance = Number(customerSnap.data().currentBalance ?? customerSnap.data().balance ?? 0);

  const q = query(
    collection(db, 'customer_ledger'),
    where('tenantId', '==', tenantId),
    where('customerId', '==', customerId)
  );
  const snap = await getDocs(q);

  let ledgerSum = 0;
  snap.docs.forEach((d) => {
    const entry = d.data() as CustomerLedgerEntry;
    ledgerSum += (entry.debit || 0) - (entry.credit || 0);
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

/**
 * Fetches a single Customer by ID.
 */
export async function getCustomerById(customerId: string): Promise<Customer | null> {
  const snap = await getDoc(doc(db, 'customers', customerId));
  if (!snap.exists()) return null;
  return snap.data() as Customer;
}

/**
 * Fetches customers list with optional filters and pagination.
 */
export async function getCustomers(
  tenantId: string,
  options?: {
    customerType?: CustomerType;
    activeOnly?: boolean;
    hasBalanceOnly?: boolean;
    searchQuery?: string;
    pageSize?: number;
    lastDoc?: DocumentSnapshot;
  }
): Promise<{ customers: Customer[]; lastDoc?: DocumentSnapshot }> {
  const constraints: any[] = [where('tenantId', '==', tenantId)];

  if (options?.activeOnly) {
    constraints.push(where('active', '==', true));
  }

  if (options?.customerType) {
    constraints.push(where('customerType', '==', options.customerType));
  }

  constraints.push(orderBy('name', 'asc'));

  if (options?.pageSize) {
    constraints.push(fsLimit(options.pageSize));
  }

  if (options?.lastDoc) {
    constraints.push(startAfter(options.lastDoc));
  }

  const q = query(collection(db, 'customers'), ...constraints);
  const snap = await getDocs(q);

  let customers = snap.docs.map((d) => d.data() as Customer);

  if (options?.hasBalanceOnly) {
    customers = customers.filter((c) => Math.abs(c.currentBalance || c.balance || 0) > 0.01);
  }

  if (options?.searchQuery && options.searchQuery.trim()) {
    const queryTerm = options.searchQuery.trim().toLowerCase();
    customers = customers.filter(
      (c) =>
        c.name.toLowerCase().includes(queryTerm) ||
        c.phone.includes(queryTerm) ||
        c.customerCode.toLowerCase().includes(queryTerm) ||
        (c.companyName && c.companyName.toLowerCase().includes(queryTerm)) ||
        (c.taxNumber && c.taxNumber.includes(queryTerm))
    );
  }

  return {
    customers,
    lastDoc: snap.docs[snap.docs.length - 1],
  };
}


/**
 * Safely deletes a customer only if they have ZERO historical transactions (Phase 9 - Audit 1).
 * If any sales, ledger entries, payments, or non-zero balance exist, hard delete is blocked
 * and an error is thrown advising archiving instead.
 */
export async function safeDeleteCustomer(tenantId: string, customerId: string): Promise<void> {
  const customerRef = doc(db, 'customers', customerId);
  const snap = await getDoc(customerRef);
  if (!snap.exists()) {
    throw new Error('العميل غير موجود');
  }

  const customer = snap.data() as Customer;
  if (Math.abs(Number(customer.currentBalance || customer.balance || 0)) > 0.01) {
    throw new Error('لا يمكن حذف العميل لوجود رصيد مالي قائم. يرجى أرشفة العميل بدلاً من حذفه');
  }

  if (Number(customer.totalPurchases || 0) > 0) {
    throw new Error('لا يمكن حذف العميل لوجود مبيعات تاريخية مسجلة باسمه. يرجى استخدام الأرشفة لحفظ السجلات المحاسبية');
  }

  // Check sales
  const salesSnap = await getDocs(
    query(collection(db, 'sales'), where('customerId', '==', customerId), fsLimit(1))
  );
  if (!salesSnap.empty) {
    throw new Error('لا يمكن حذف العميل لارتباطه بفواتير مبيعات سابقة. يرجى أرشفة العميل');
  }

  // Check customer ledger
  const ledgerSnap = await getDocs(
    query(collection(db, 'customer_ledger'), where('customerId', '==', customerId), fsLimit(1))
  );
  if (!ledgerSnap.empty) {
    throw new Error('لا يمكن حذف العميل لوجود حركات مالية مسجلة في كشف حسابه. يرجى أرشفة العميل');
  }

  // Check customer payments
  const paymentsSnap = await getDocs(
    query(collection(db, 'customer_payments'), where('customerId', '==', customerId), fsLimit(1))
  );
  if (!paymentsSnap.empty) {
    throw new Error('لا يمكن حذف العميل لوجود سندات قبض مسجلة. يرجى أرشفة العميل');
  }

  // Safe to delete brand-new customer with 0 history
  await deleteDoc(customerRef);
}
