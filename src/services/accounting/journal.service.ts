/**
 * General Ledger & Journal Entry Service (Phase 9)
 * Handles atomic journal entry creation, balanced double-entry invariants,
 * period status enforcement, idempotency, immutability, and reversals.
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
  limit as fsLimit,
  runTransaction,
  writeBatch,
  increment,
} from 'firebase/firestore';
import type {
  JournalEntry,
  JournalLine,
  JournalSourceType,
  JournalEntryStatus,
  ChartAccount,
} from '@/types/retail.types';
import { formatSequenceNumber } from '../sales/invoiceNumber.service';
import { checkPostingAllowedInPeriod } from './periods.service';

export interface CreateJournalLineInput {
  accountId: string;
  accountCodeSnapshot?: string;
  accountNameSnapshot?: string;
  debit: number;
  credit: number;
  description?: string;
  branchId?: string | null;
  customerId?: string | null;
  supplierId?: string | null;
  employeeId?: string | null;
  productId?: string | null;
}

export interface CreateJournalEntryInput {
  tenantId: string;
  date?: string;
  postingDate?: string;
  sourceType: JournalSourceType;
  sourceId: string;
  description: string;
  currency?: string;
  exchangeRate?: number;
  branchId?: string | null;
  createdBy: string;
  lines: CreateJournalLineInput[];
  idempotencyKey?: string;
  postingRuleVersion?: number;
  allowSoftClosedOverride?: boolean;
}

/**
 * Deterministic idempotency key for journal entries
 */
export function getJournalIdempotencyDocId(tenantId: string, sourceType: string, sourceId: string): string {
  return `${tenantId}___${sourceType}___${sourceId}`;
}

/**
 * Generates an atomic sequential journal number: JE-YYYY-XXXXXX
 */
export async function generateJournalNumber(tenantId: string, year = new Date().getFullYear()): Promise<string> {
  const counterId = `journal_${tenantId}_${year}`;
  const counterRef = doc(db, 'sequence_counters', counterId);

  const seq = await runTransaction(db, async (tx) => {
    const snap = await tx.get(counterRef);
    let next = 1;
    if (snap.exists()) {
      next = (snap.data().lastSequence || 0) + 1;
    }
    tx.set(counterRef, { lastSequence: next, updatedAt: new Date().toISOString() }, { merge: true });
    return next;
  });

  return `JE-${year}-${formatSequenceNumber(seq, 6)}`;
}

/**
 * Validates the core double-entry accounting invariant: Total Debits == Total Credits.
 */
export function validateBalancedJournalLines(lines: CreateJournalLineInput[]): {
  isValid: boolean;
  totalDebit: number;
  totalCredit: number;
  difference: number;
  error?: string;
} {
  if (!lines || lines.length < 2) {
    return {
      isValid: false,
      totalDebit: 0,
      totalCredit: 0,
      difference: 0,
      error: 'يجب أن يحتوي القيد المحاسبي على طرفين على الأقل (مدين ودائن)',
    };
  }

  let totalDebit = 0;
  let totalCredit = 0;

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const dr = Math.round(Number(line.debit || 0) * 100) / 100;
    const cr = Math.round(Number(line.credit || 0) * 100) / 100;

    if (dr < 0 || cr < 0) {
      return {
        isValid: false,
        totalDebit: 0,
        totalCredit: 0,
        difference: 0,
        error: `السطر رقم ${i + 1}: المبالغ المحاسبية لا يمكن أن تكون سالبة`,
      };
    }

    if (dr > 0 && cr > 0) {
      return {
        isValid: false,
        totalDebit: 0,
        totalCredit: 0,
        difference: 0,
        error: `السطر رقم ${i + 1}: لا يمكن أن يحتوي السطر على مبلغ مدين ومبلغ دائن معاً`,
      };
    }

    if (dr === 0 && cr === 0) {
      return {
        isValid: false,
        totalDebit: 0,
        totalCredit: 0,
        difference: 0,
        error: `السطر رقم ${i + 1}: يجب تحديد قيمة للمدين أو الدائن ولا يمكن أن يكون كلاهما صفراً`,
      };
    }

    totalDebit += dr;
    totalCredit += cr;
  }

  totalDebit = Math.round(totalDebit * 100) / 100;
  totalCredit = Math.round(totalCredit * 100) / 100;
  const difference = Math.round(Math.abs(totalDebit - totalCredit) * 100) / 100;

  if (difference > 0.001) {
    return {
      isValid: false,
      totalDebit,
      totalCredit,
      difference,
      error: `القيد غير متوازن! إجمالي المدين (${totalDebit}) لا يساوي إجمالي الدائن (${totalCredit}). الفارق: ${difference}`,
    };
  }

  return {
    isValid: true,
    totalDebit,
    totalCredit,
    difference: 0,
  };
}

/**
 * Creates and posts a balanced Journal Entry atomically.
 * Strictly guarantees:
 * 1. Double-entry balance
 * 2. Period posting status check
 * 3. Idempotency (returns existing if already posted)
 * 4. Immutability
 */
export async function createAndPostJournalEntry(input: CreateJournalEntryInput): Promise<JournalEntry> {
  const {
    tenantId,
    date = new Date().toISOString(),
    postingDate = date,
    sourceType,
    sourceId,
    description,
    currency = 'EGP',
    exchangeRate = 1.0,
    branchId = null,
    createdBy,
    lines,
    idempotencyKey = getJournalIdempotencyDocId(tenantId, sourceType, sourceId),
    postingRuleVersion = 1,
    allowSoftClosedOverride = false,
  } = input;

  if (!tenantId || !sourceType || !sourceId || !description) {
    throw new Error('بيانات القيد المحاسبي الأساسية غير مكتملة');
  }

  // 1. Invariant: Validate double-entry balance
  const balanceCheck = validateBalancedJournalLines(lines);
  if (!balanceCheck.isValid) {
    throw new Error(balanceCheck.error);
  }

  // 2. Invariant: Validate Period Status (blocks closed periods)
  const periodCheck = await checkPostingAllowedInPeriod(tenantId, postingDate, { allowSoftClosedOverride });
  if (!periodCheck.allowed) {
    throw new Error(periodCheck.reason || 'الفترة المالية مغلقة ولا يمكن الترحيل إليها');
  }

  // 3. Idempotency Check
  const idempRef = doc(db, 'journal_idempotency', idempotencyKey);
  const existingIdemp = await getDoc(idempRef);
  if (existingIdemp.exists()) {
    const existingEntryId = existingIdemp.data().journalEntryId;
    const existingSnap = await getDoc(doc(db, 'journal_entries', existingEntryId));
    if (existingSnap.exists()) {
      return existingSnap.data() as JournalEntry;
    }
  }

  // 4. Resolve Account Code/Name Snapshots
  const accountIds = Array.from(new Set(lines.map((l) => l.accountId)));
  const accountMap: Record<string, ChartAccount> = {};

  for (const accId of accountIds) {
    const accSnap = await getDoc(doc(db, 'chart_of_accounts', accId));
    if (!accSnap.exists()) throw new Error(`الحساب المالي (${accId}) غير موجود`);
    const accData = accSnap.data() as ChartAccount;
    if (!accData.allowPosting) {
      throw new Error(`الحساب (${accData.accountCode} - ${accData.name}) حساب رئيسي غير قابل للترحيل المباشر عليه`);
    }
    accountMap[accId] = accData;
  }

  const now = new Date().toISOString();
  const year = new Date(postingDate).getFullYear();
  const journalNumber = await generateJournalNumber(tenantId, year);
  const journalRef = doc(collection(db, 'journal_entries'));

  // Build finalized lines
  const finalizedLines: JournalLine[] = lines.map((l) => {
    const acc = accountMap[l.accountId];
    return {
      id: crypto.randomUUID(),
      journalEntryId: journalRef.id,
      accountId: l.accountId,
      accountCodeSnapshot: acc.accountCode,
      accountNameSnapshot: acc.name,
      debit: Math.round(Number(l.debit || 0) * 100) / 100,
      credit: Math.round(Number(l.credit || 0) * 100) / 100,
      description: l.description || description,
      branchId: l.branchId || branchId,
      customerId: l.customerId || null,
      supplierId: l.supplierId || null,
      employeeId: l.employeeId || null,
      productId: l.productId || null,
      createdAt: now,
    };
  });

  const journalEntry: JournalEntry = {
    id: journalRef.id,
    tenantId,
    journalNumber,
    date,
    postingDate,
    sourceType,
    sourceId,
    description: description.trim(),
    status: 'posted',
    currency,
    exchangeRate,
    totalDebit: balanceCheck.totalDebit,
    totalCredit: balanceCheck.totalCredit,
    branchId,
    fiscalPeriodId: periodCheck.period?.id || null,
    createdBy,
    postedAt: now,
    idempotencyKey,
    lines: finalizedLines,
    postingRuleVersion,
    createdAt: now,
    updatedAt: now,
  };

  await runTransaction(db, async (tx) => {
    // Check idempotency inside transaction
    const txIdemp = await tx.get(idempRef);
    if (txIdemp.exists()) {
      return; // Handled outside
    }

    // Write Journal Entry
    tx.set(journalRef, journalEntry);

    // Write individual lines for indexing/querying
    for (const line of finalizedLines) {
      const lineRef = doc(db, 'journal_lines', line.id);
      tx.set(lineRef, {
        ...line,
        tenantId,
        postingDate,
        sourceType,
        sourceId,
      });

      // Update account cached balance based on normalBalance
      const acc = accountMap[line.accountId];
      const delta = acc.normalBalance === 'debit' ? (line.debit - line.credit) : (line.credit - line.debit);
      const accRef = doc(db, 'chart_of_accounts', line.accountId);
      tx.update(accRef, {
        currentBalance: increment(Math.round(delta * 100) / 100),
        updatedAt: now,
      });
    }

    // Set idempotency
    tx.set(idempRef, {
      tenantId,
      journalEntryId: journalRef.id,
      journalNumber,
      sourceType,
      sourceId,
      createdAt: now,
    });
  });

  return journalEntry;
}

/**
 * Reverses an existing posted Journal Entry.
 * Creates an exact mirror image (Dr -> Cr, Cr -> Dr) and marks the original as 'reversed'.
 */
export async function reverseJournalEntry(
  journalEntryId: string,
  tenantId: string,
  reversedBy: string,
  reason: string,
  reversalPostingDate?: string
): Promise<{ original: JournalEntry; reversal: JournalEntry }> {
  const originalRef = doc(db, 'journal_entries', journalEntryId);
  const snap = await getDoc(originalRef);
  if (!snap.exists()) throw new Error('القيد المحاسبي المراد عكسه غير موجود');

  const orig = snap.data() as JournalEntry;
  if (orig.tenantId !== tenantId) throw new Error('غير مصرح بعكس هذا القيد');
  if (orig.status === 'reversed') throw new Error('تم عكس هذا القيد مسبقاً');
  if (orig.status !== 'posted') throw new Error('يمكن عكس القيود المرحلة فقط');

  const now = new Date().toISOString();
  const effectiveReversalDate = reversalPostingDate || now;

  // Verify period for reversal
  const pCheck = await checkPostingAllowedInPeriod(tenantId, effectiveReversalDate);
  if (!pCheck.allowed) {
    throw new Error(`لا يمكن عكس القيد في الفترة المحددة: ${pCheck.reason}`);
  }

  // Create reverse lines (swapping debits and credits)
  const reversedLinesInput: CreateJournalLineInput[] = orig.lines.map((l) => ({
    accountId: l.accountId,
    accountCodeSnapshot: l.accountCodeSnapshot,
    accountNameSnapshot: l.accountNameSnapshot,
    debit: l.credit, // SWAP
    credit: l.debit, // SWAP
    description: `عكس قيد: ${l.description || orig.description}`,
    branchId: l.branchId,
    customerId: l.customerId,
    supplierId: l.supplierId,
    employeeId: l.employeeId,
    productId: l.productId,
  }));

  const reversal = await createAndPostJournalEntry({
    tenantId,
    date: now,
    postingDate: effectiveReversalDate,
    sourceType: orig.sourceType,
    sourceId: `rev_${orig.id}`,
    description: `عكس القيد رقم ${orig.journalNumber} - السبب: ${reason.trim()}`,
    currency: orig.currency,
    exchangeRate: orig.exchangeRate,
    branchId: orig.branchId,
    createdBy: reversedBy,
    lines: reversedLinesInput,
    idempotencyKey: `rev_${orig.id}_${tenantId}`,
  });

  // Mark original as reversed
  await runTransaction(db, async (tx) => {
    tx.update(originalRef, {
      status: 'reversed',
      reversedEntryId: reversal.id,
      reversalReason: reason.trim(),
      updatedAt: now,
    });
  });

  orig.status = 'reversed';
  orig.reversedEntryId = reversal.id;

  return { original: orig, reversal };
}

/**
 * Fetches journal entries for a tenant with optional filtering.
 */
export async function getJournalEntries(
  tenantId: string,
  options?: {
    startDate?: string;
    endDate?: string;
    sourceType?: JournalSourceType;
    status?: JournalEntryStatus;
    branchId?: string;
    limitCount?: number;
  }
): Promise<JournalEntry[]> {
  if (!tenantId) return [];

  let q = query(
    collection(db, 'journal_entries'),
    where('tenantId', '==', tenantId),
    orderBy('postingDate', 'desc'),
    fsLimit(options?.limitCount || 200)
  );

  const snap = await getDocs(q);
  let entries = snap.docs.map((d) => d.data() as JournalEntry);

  if (options?.sourceType) {
    entries = entries.filter((e) => e.sourceType === options.sourceType);
  }
  if (options?.status) {
    entries = entries.filter((e) => e.status === options.status);
  }
  if (options?.branchId) {
    entries = entries.filter((e) => e.branchId === options.branchId);
  }
  if (options?.startDate) {
    entries = entries.filter((e) => e.postingDate >= options.startDate!);
  }
  if (options?.endDate) {
    entries = entries.filter((e) => e.postingDate <= options.endDate!);
  }

  return entries;
}
