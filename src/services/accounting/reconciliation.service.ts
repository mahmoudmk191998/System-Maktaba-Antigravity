/**
 * Accounting Reconciliation Engine (Phase 9 - Audit 2)
 * Verifies mathematical alignment between General Ledger control accounts
 * and operational Subledgers (Customers AR, Suppliers AP, Inventory Valuation, Cash/Registers).
 */

import { db } from '@/lib/firebase';
import {
  collection,
  query,
  where,
  getDocs,
  doc,
  getDoc,
} from 'firebase/firestore';
import type {
  SubledgerReconciliationResult,
  InventoryReconciliationResult,
  CashReconciliationResult,
  ChartAccount,
} from '@/types/retail.types';
import { getChartOfAccounts } from './chartOfAccounts.service';

/**
 * Reconciles Accounts Receivable (AR) GL Control Account against Customer Subledger
 * Audit 2 Invariant: sum(Customer Ledger Balances) == GL Account 1130 Balance
 */
export async function reconcileARSubledger(
  tenantId: string,
  asOfDate?: string
): Promise<SubledgerReconciliationResult> {
  const accounts = await getChartOfAccounts(tenantId);
  const arAccount = accounts.find(
    (a) => a.systemMappingKey === 'accountsReceivable' || a.accountCode === '1130'
  );

  if (!arAccount) {
    throw new Error('حساب المدينون ومراقبة العملاء (1130) غير موجود في شجرة الحسابات');
  }

  // 1. Calculate GL Balance
  let glBalance = 0;
  if (asOfDate) {
    const linesSnap = await getDocs(
      query(
        collection(db, 'journal_lines'),
        where('tenantId', '==', tenantId),
        where('accountId', '==', arAccount.id),
        where('postingDate', '<=', asOfDate)
      )
    );
    let drTotal = 0;
    let crTotal = 0;
    linesSnap.forEach((doc) => {
      const data = doc.data();
      drTotal += Number(data.debit || 0);
      crTotal += Number(data.credit || 0);
    });
    glBalance = Math.round((drTotal - crTotal) * 100) / 100;
  } else {
    glBalance = Math.round(Number(arAccount.currentBalance || 0) * 100) / 100;
  }

  // 2. Calculate Customer Subledger Total
  const customersSnap = await getDocs(
    query(collection(db, 'customers'), where('tenantId', '==', tenantId))
  );

  let subledgerTotal = 0;
  const unmatchedItems: Array<{ id: string; name: string; balance: number }> = [];

  customersSnap.forEach((docSnap) => {
    const data = docSnap.data();
    const bal = Math.round(Number(data.currentBalance || 0) * 100) / 100;
    subledgerTotal += bal;
    if (bal !== 0) {
      unmatchedItems.push({
        id: docSnap.id,
        name: data.name || 'عميل بدون اسم',
        balance: bal,
      });
    }
  });

  subledgerTotal = Math.round(subledgerTotal * 100) / 100;
  const variance = Math.round((glBalance - subledgerTotal) * 100) / 100;
  const isMatched = Math.abs(variance) < 0.01;

  return {
    controlAccountName: arAccount.name,
    glAccountCode: arAccount.accountCode,
    glBalance,
    subledgerTotal,
    variance,
    isMatched,
    itemCount: customersSnap.size,
    unmatchedItems,
  };
}

/**
 * Reconciles Accounts Payable (AP) GL Control Account against Supplier Subledger
 * Audit 2 Invariant: sum(Supplier Ledger Balances) == GL Account 2110 Balance
 */
export async function reconcileAPSubledger(
  tenantId: string,
  asOfDate?: string
): Promise<SubledgerReconciliationResult> {
  const accounts = await getChartOfAccounts(tenantId);
  const apAccount = accounts.find(
    (a) => a.systemMappingKey === 'accountsPayable' || a.accountCode === '2110'
  );

  if (!apAccount) {
    throw new Error('حساب الموردون ومراقبة المشتريات (2110) غير موجود في شجرة الحسابات');
  }

  // 1. Calculate GL Balance
  let glBalance = 0;
  if (asOfDate) {
    const linesSnap = await getDocs(
      query(
        collection(db, 'journal_lines'),
        where('tenantId', '==', tenantId),
        where('accountId', '==', apAccount.id),
        where('postingDate', '<=', asOfDate)
      )
    );
    let drTotal = 0;
    let crTotal = 0;
    linesSnap.forEach((doc) => {
      const data = doc.data();
      drTotal += Number(data.debit || 0);
      crTotal += Number(data.credit || 0);
    });
    // Normal balance for AP is credit: Credit - Debit
    glBalance = Math.round((crTotal - drTotal) * 100) / 100;
  } else {
    glBalance = Math.round(Number(apAccount.currentBalance || 0) * 100) / 100;
  }

  // 2. Calculate Supplier Subledger Total
  const suppliersSnap = await getDocs(
    query(collection(db, 'suppliers'), where('tenantId', '==', tenantId))
  );

  let subledgerTotal = 0;
  const unmatchedItems: Array<{ id: string; name: string; balance: number }> = [];

  suppliersSnap.forEach((docSnap) => {
    const data = docSnap.data();
    const bal = Math.round(Number(data.currentBalance || 0) * 100) / 100;
    subledgerTotal += bal;
    if (bal !== 0) {
      unmatchedItems.push({
        id: docSnap.id,
        name: data.name || 'مورد بدون اسم',
        balance: bal,
      });
    }
  });

  subledgerTotal = Math.round(subledgerTotal * 100) / 100;
  const variance = Math.round((glBalance - subledgerTotal) * 100) / 100;
  const isMatched = Math.abs(variance) < 0.01;

  return {
    controlAccountName: apAccount.name,
    glAccountCode: apAccount.accountCode,
    glBalance,
    subledgerTotal,
    variance,
    isMatched,
    itemCount: suppliersSnap.size,
    unmatchedItems,
  };
}

/**
 * Reconciles Inventory GL Control Account (1140) against Physical Product Catalog Valuation
 * Valuation = sum(product.stockQuantity * product.costPrice/wac)
 */
export async function reconcileInventory(
  tenantId: string,
  asOfDate?: string
): Promise<InventoryReconciliationResult> {
  const accounts = await getChartOfAccounts(tenantId);
  const invAccount = accounts.find(
    (a) => a.systemMappingKey === 'inventory' || a.accountCode === '1140'
  );

  if (!invAccount) {
    throw new Error('حساب مراقبة المخزون (1140) غير موجود في شجرة الحسابات');
  }

  // 1. Calculate GL Balance
  let glInventoryBalance = 0;
  if (asOfDate) {
    const linesSnap = await getDocs(
      query(
        collection(db, 'journal_lines'),
        where('tenantId', '==', tenantId),
        where('accountId', '==', invAccount.id),
        where('postingDate', '<=', asOfDate)
      )
    );
    let drTotal = 0;
    let crTotal = 0;
    linesSnap.forEach((doc) => {
      const data = doc.data();
      drTotal += Number(data.debit || 0);
      crTotal += Number(data.credit || 0);
    });
    glInventoryBalance = Math.round((drTotal - crTotal) * 100) / 100;
  } else {
    glInventoryBalance = Math.round(Number(invAccount.currentBalance || 0) * 100) / 100;
  }

  // 2. Physical Stock Valuation from Products
  const productsSnap = await getDocs(
    query(collection(db, 'products'), where('tenantId', '==', tenantId))
  );

  let stockValuationTotal = 0;
  let totalUnitsCount = 0;
  let productCount = 0;

  productsSnap.forEach((docSnap) => {
    const data = docSnap.data();
    if (data.status !== 'archived') {
      const qty = Number(data.stockQuantity || 0);
      const unitCost = Number(data.costPrice ?? data.wac ?? 0);
      if (qty > 0) {
        stockValuationTotal += qty * unitCost;
        totalUnitsCount += qty;
      }
      productCount++;
    }
  });

  stockValuationTotal = Math.round(stockValuationTotal * 100) / 100;
  const variance = Math.round((glInventoryBalance - stockValuationTotal) * 100) / 100;
  const isMatched = Math.abs(variance) < 0.01;

  return {
    glAccountCode: invAccount.accountCode,
    glInventoryBalance,
    stockValuationTotal,
    variance,
    isMatched,
    productCount,
    totalUnitsCount,
  };
}

/**
 * Reconciles GL Cash Accounts against Active / Physical Registers
 */
export async function reconcileCash(
  tenantId: string
): Promise<CashReconciliationResult> {
  const accounts = await getChartOfAccounts(tenantId);
  const cashAccounts = accounts.filter(
    (a) =>
      a.systemMappingKey === 'defaultCash' ||
      a.systemMappingKey === 'posCashRegister' ||
      a.accountCode === '1111' ||
      a.accountCode === '1112'
  );

  let glCashBalance = 0;
  for (const acc of cashAccounts) {
    glCashBalance += Number(acc.currentBalance || 0);
  }
  glCashBalance = Math.round(glCashBalance * 100) / 100;

  // Query operational cash from active register shifts
  const shiftsSnap = await getDocs(
    query(
      collection(db, 'cash_shifts'),
      where('tenantId', '==', tenantId),
      where('status', '==', 'open')
    )
  );

  let operationalRegisterCash = 0;
  let activeShiftsCount = 0;

  shiftsSnap.forEach((docSnap) => {
    const data = docSnap.data();
    operationalRegisterCash += Number(data.currentCash ?? data.expectedCash ?? data.startingCash ?? 0);
    activeShiftsCount++;
  });

  // If no open shifts, fallback to financial_accounts cash balances
  if (activeShiftsCount === 0) {
    const finAccountsSnap = await getDocs(
      query(
        collection(db, 'financial_accounts'),
        where('tenantId', '==', tenantId),
        where('active', '==', true)
      )
    );
    finAccountsSnap.forEach((d) => {
      const data = d.data();
      if (data.type === 'cash_drawer' || data.type === 'treasury') {
        operationalRegisterCash += Number(data.currentBalance || 0);
      }
    });
  }

  operationalRegisterCash = Math.round(operationalRegisterCash * 100) / 100;
  const variance = Math.round((glCashBalance - operationalRegisterCash) * 100) / 100;
  const isMatched = Math.abs(variance) < 0.01;

  return {
    glCashBalance,
    operationalRegisterCash,
    variance,
    isMatched,
    activeShiftsCount,
  };
}
