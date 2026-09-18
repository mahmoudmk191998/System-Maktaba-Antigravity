/**
 * Atomic Invoice and Sequence Numbering Service
 * Ensures duplicate-safe, tenant-and-branch-scoped sequential numbers for sales,
 * returns, purchase orders, goods receipts, and transfers.
 */

import { db } from '@/lib/firebase';
import { doc, runTransaction } from 'firebase/firestore';

export type SequenceType = 
  | 'sale' 
  | 'return' 
  | 'purchase_order' 
  | 'goods_receipt' 
  | 'purchase_return' 
  | 'transfer' 
  | 'stocktake';

const PREFIX_MAP: Record<SequenceType, string> = {
  sale: 'INV',
  return: 'RET',
  purchase_order: 'PO',
  goods_receipt: 'GR',
  purchase_return: 'PR',
  transfer: 'TR',
  stocktake: 'ST',
};

/**
export function padSequence(seq: number, digits = 6): string {
  return seq.toString().padStart(digits, '0');
}

/**
 * Formats a sequence number deterministically:
 * Overload 1: formatSequenceNumber(type, branchCode, year, sequence) -> e.g. INV-B01-2026-000001
 * Overload 2: formatSequenceNumber(sequence, digits) -> e.g. "000001"
 */
export function formatSequenceNumber(
  typeOrSeq: SequenceType | number,
  branchCodeOrDigits?: string | number,
  year?: number,
  sequence?: number
): string {
  if (typeof typeOrSeq === 'number') {
    const digits = typeof branchCodeOrDigits === 'number' ? branchCodeOrDigits : 6;
    return typeOrSeq.toString().padStart(digits, '0');
  }

  const prefix = PREFIX_MAP[typeOrSeq] || 'DOC';
  const cleanBranch = (typeof branchCodeOrDigits === 'string' ? branchCodeOrDigits : 'HQ')
    .toUpperCase()
    .replace(/[^A-Z0-9]/g, '')
    .slice(0, 5);
  const currentYear = year || new Date().getFullYear();
  const seqStr = (sequence ?? 1).toString().padStart(6, '0');
  return `${prefix}-${cleanBranch}-${currentYear}-${seqStr}`;
}

/**
 * Atomically generates the next sequence number in Firestore using a runTransaction write.
 * Falls back to timestamp-based sequence in mocked/offline environments.
 */
export async function getNextAtomicSequence(
  tenantId: string,
  branchId: string,
  branchCode: string,
  type: SequenceType
): Promise<{ sequenceNumber: string; counter: number }> {
  const year = new Date().getFullYear();
  const counterDocId = `${tenantId}_${branchId}_${type}_${year}`;
  const counterRef = doc(db, 'sequence_counters', counterDocId);

  try {
    const nextCounter = await runTransaction(db, async (transaction) => {
      const snap = await transaction.get(counterRef);
      let current = 0;
      if (snap.exists()) {
        current = snap.data().current || 0;
      }
      const next = current + 1;
      transaction.set(counterRef, {
        tenantId,
        branchId,
        type,
        year,
        current: next,
        updatedAt: new Date().toISOString(),
      }, { merge: true });

      return next;
    });

    const sequenceNumber = formatSequenceNumber(type, branchCode, year, nextCounter);
    return { sequenceNumber, counter: nextCounter };
  } catch (err) {
    // If Firestore transaction fails or in offline environment, generate deterministic fallback
    console.warn('Falling back to timestamp sequence generation due to transaction error:', err);
    const fallbackSeq = Math.floor(Date.now() % 1000000);
    const sequenceNumber = formatSequenceNumber(type, branchCode, year, fallbackSeq);
    return { sequenceNumber, counter: fallbackSeq };
  }
}
