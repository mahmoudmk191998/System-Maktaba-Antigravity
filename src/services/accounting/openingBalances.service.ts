/**
 * Opening Balances & Historical Migration Service (Phase 9 - Audit 3)
 * Consolidates pre-accounting system balances (inventory valuation, customer balances,
 * supplier balances, cash, bank) into a single, balanced Opening Journal Entry
 * balanced against Owner Capital / Opening Equity.
 */

import { db } from '@/lib/firebase';
import {
  collection,
  doc,
  getDoc,
  getDocs,
  query,
  where,
  setDoc,
} from 'firebase/firestore';
import type {
  OpeningBalanceMigration,
  JournalEntry,
} from '@/types/retail.types';
import { getChartOfAccounts } from './chartOfAccounts.service';
import { createAndPostJournalEntry, CreateJournalLineInput } from './journal.service';

export interface ExecuteOpeningBalancesInput {
  tenantId: string;
  migrationDate: string;
  cashBalance?: number;
  bankBalance?: number;
  migratedBy: string;
  customInventoryValuation?: number;
  customArTotal?: number;
  customApTotal?: number;
  notes?: string;
}

/**
 * Executes a one-time, idempotent Opening Balance Migration for a tenant.
 */
export async function executeOpeningBalanceMigration(
  input: ExecuteOpeningBalancesInput
): Promise<{ migration: OpeningBalanceMigration; journalEntry: JournalEntry }> {
  const {
    tenantId,
    migrationDate,
    cashBalance = 0,
    bankBalance = 0,
    migratedBy,
    customInventoryValuation,
    customArTotal,
    customApTotal,
  } = input;

  // 1. Check Idempotency / Existing Migration Lock
  const migrationLockRef = doc(db, 'opening_balance_migrations', tenantId);
  const existingMigration = await getDoc(migrationLockRef);
  if (existingMigration.exists()) {
    const data = existingMigration.data() as OpeningBalanceMigration;
    const jeSnap = await getDoc(doc(db, 'journal_entries', data.journalEntryId));
    if (jeSnap.exists()) {
      return {
        migration: data,
        journalEntry: jeSnap.data() as JournalEntry,
      };
    }
  }

  // 2. Resolve Chart of Accounts
  const accounts = await getChartOfAccounts(tenantId);
  const findAcc = (key: string, defaultCode: string) => {
    const found = accounts.find((a) => a.systemMappingKey === key || a.accountCode === defaultCode);
    if (!found) {
      throw new Error(`الحساب المالي المرتبط بـ (${key} / ${defaultCode}) غير موجود في شجرة الحسابات`);
    }
    return found;
  };

  const invAcc = findAcc('inventory', '1140');
  const arAcc = findAcc('accountsReceivable', '1130');
  const apAcc = findAcc('accountsPayable', '2110');
  const cashAcc = findAcc('defaultCash', '1111');
  const bankAcc = findAcc('bankClearing', '1120');
  const equityAcc = findAcc('openingEquity', '3300');

  // 3. Compute Inventory Valuation Snapshot
  let inventoryValue = 0;
  if (customInventoryValuation !== undefined) {
    inventoryValue = Math.round(customInventoryValuation * 100) / 100;
  } else {
    const prodSnap = await getDocs(
      query(collection(db, 'products'), where('tenantId', '==', tenantId))
    );
    prodSnap.forEach((d) => {
      const data = d.data();
      if (data.status !== 'archived') {
        const qty = Number(data.stockQuantity || 0);
        const cost = Number(data.costPrice ?? data.wac ?? 0);
        if (qty > 0 && cost > 0) {
          inventoryValue += qty * cost;
        }
      }
    });
    inventoryValue = Math.round(inventoryValue * 100) / 100;
  }

  // 4. Compute Customer Receivables (AR) Snapshot
  let arValue = 0;
  if (customArTotal !== undefined) {
    arValue = Math.round(customArTotal * 100) / 100;
  } else {
    const custSnap = await getDocs(
      query(collection(db, 'customers'), where('tenantId', '==', tenantId))
    );
    custSnap.forEach((d) => {
      const bal = Number(d.data().currentBalance || 0);
      if (bal > 0) {
        arValue += bal;
      }
    });
    arValue = Math.round(arValue * 100) / 100;
  }

  // 5. Compute Supplier Payables (AP) Snapshot
  let apValue = 0;
  if (customApTotal !== undefined) {
    apValue = Math.round(customApTotal * 100) / 100;
  } else {
    const suppSnap = await getDocs(
      query(collection(db, 'suppliers'), where('tenantId', '==', tenantId))
    );
    suppSnap.forEach((d) => {
      const bal = Number(d.data().currentBalance || 0);
      if (bal > 0) {
        apValue += bal;
      }
    });
    apValue = Math.round(apValue * 100) / 100;
  }

  const roundedCash = Math.round(cashBalance * 100) / 100;
  const roundedBank = Math.round(bankBalance * 100) / 100;

  // 6. Build Journal Lines
  const lines: CreateJournalLineInput[] = [];

  // Assets (Debits)
  if (inventoryValue > 0) {
    lines.push({
      accountId: invAcc.id,
      debit: inventoryValue,
      credit: 0,
      description: 'الرصيد الافتتاحي لمخزون الكتب والأدوات المكتبية',
    });
  }

  if (arValue > 0) {
    lines.push({
      accountId: arAcc.id,
      debit: arValue,
      credit: 0,
      description: 'الرصيد الافتتاحي لمديونيات العملاء وحسابات القبض',
    });
  }

  if (roundedCash > 0) {
    lines.push({
      accountId: cashAcc.id,
      debit: roundedCash,
      credit: 0,
      description: 'الرصيد الافتتاحي للنقدية بالخزينة الرئيسية',
    });
  }

  if (roundedBank > 0) {
    lines.push({
      accountId: bankAcc.id,
      debit: roundedBank,
      credit: 0,
      description: 'الرصيد الافتتاحي للحسابات البنكية',
    });
  }

  // Liabilities (Credits)
  if (apValue > 0) {
    lines.push({
      accountId: apAcc.id,
      debit: 0,
      credit: apValue,
      description: 'الرصيد الافتتاحي لمستحقات الموردين وحسابات الدفع',
    });
  }

  // Calculate Balancing Equity: Total Debits - Total Credits
  const totalDebits = Math.round((inventoryValue + arValue + roundedCash + roundedBank) * 100) / 100;
  const totalCredits = apValue;
  const netEquity = Math.round((totalDebits - totalCredits) * 100) / 100;

  if (netEquity >= 0) {
    lines.push({
      accountId: equityAcc.id,
      debit: 0,
      credit: netEquity,
      description: 'رصيد التسوية الافتتاحي لحقوق الملكية (Opening Balance Equity - 3300)',
    });
  } else {
    lines.push({
      accountId: equityAcc.id,
      debit: Math.abs(netEquity),
      credit: 0,
      description: 'عجز رصيد التسوية الافتتاحي لحقوق الملكية (Opening Balance Equity Deficit - 3300)',
    });
  }

  // 7. Create & Post the Opening Journal Entry
  const journalEntry = await createAndPostJournalEntry({
    tenantId,
    date: migrationDate,
    postingDate: migrationDate,
    sourceType: 'opening_balance',
    sourceId: `opening_balance_${tenantId}`,
    description: `قيد الأرصدة الافتتاحية لبداية الفترة المحاسبية - ${migrationDate}`,
    createdBy: migratedBy,
    lines,
    idempotencyKey: `opening_balance_${tenantId}`,
    allowSoftClosedOverride: true,
  });

  // 8. Record Migration Document
  const now = new Date().toISOString();
  const migrationRecord: OpeningBalanceMigration = {
    id: tenantId,
    tenantId,
    migrationDate,
    journalEntryId: journalEntry.id,
    inventorySnapshotValue: inventoryValue,
    arSnapshotValue: arValue,
    apSnapshotValue: apValue,
    cashSnapshotValue: roundedCash,
    bankSnapshotValue: roundedBank,
    openingEquityValue: netEquity,
    status: 'completed',
    migratedBy,
    createdAt: now,
  };

  await setDoc(migrationLockRef, migrationRecord);

  return {
    migration: migrationRecord,
    journalEntry,
  };
}

/**
 * Checks if Opening Balances have already been initialized for a tenant.
 */
export async function getOpeningBalanceMigration(
  tenantId: string
): Promise<OpeningBalanceMigration | null> {
  const snap = await getDoc(doc(db, 'opening_balance_migrations', tenantId));
  if (!snap.exists()) return null;
  return snap.data() as OpeningBalanceMigration;
}
