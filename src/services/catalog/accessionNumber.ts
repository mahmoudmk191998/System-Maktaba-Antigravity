import { db } from '@/lib/firebase';
import { doc, runTransaction } from 'firebase/firestore';

export interface AccessionNumberOptions {
  tenantId: string;
  branchCode?: string;
  year?: number;
  prefix?: string;
}

export class AccessionNumberGenerator {
  /**
   * Generates a single unique, atomic accession number in Firestore.
   * Format: LIB-BRANCH-YEAR-000001
   * Guaranteed duplicate-resistant and tenant-isolated.
   */
  static async generateNext(options: AccessionNumberOptions): Promise<string> {
    const { tenantId, branchCode = 'MAIN', year = new Date().getFullYear(), prefix = 'LIB' } = options;
    const cleanBranch = branchCode.trim().toUpperCase().slice(0, 6) || 'MAIN';
    const counterId = `accession_${tenantId}_${cleanBranch}_${year}`;
    const counterRef = doc(db, 'accession_counters', counterId);

    const nextSeq = await runTransaction(db, async (transaction) => {
      const snap = await transaction.get(counterRef);
      let currentSeq = 0;
      if (snap.exists()) {
        currentSeq = Number(snap.data()?.lastSequence || 0);
      }
      const updatedSeq = currentSeq + 1;
      transaction.set(
        counterRef,
        {
          tenantId,
          branchCode: cleanBranch,
          year,
          lastSequence: updatedSeq,
          updatedAt: new Date().toISOString(),
        },
        { merge: true }
      );
      return updatedSeq;
    });

    return `${prefix}-${cleanBranch}-${year}-${String(nextSeq).padStart(6, '0')}`;
  }

  /**
   * Atomically generates a batch of N sequential accession numbers in a single transaction.
   * Highly optimal for Acquisitions receiving workflows (e.g. 50 copies of a book).
   */
  static async generateBatch(
    options: AccessionNumberOptions,
    count: number
  ): Promise<string[]> {
    if (count <= 0) return [];
    const { tenantId, branchCode = 'MAIN', year = new Date().getFullYear(), prefix = 'LIB' } = options;
    const cleanBranch = branchCode.trim().toUpperCase().slice(0, 6) || 'MAIN';
    const counterId = `accession_${tenantId}_${cleanBranch}_${year}`;
    const counterRef = doc(db, 'accession_counters', counterId);

    const startSeq = await runTransaction(db, async (transaction) => {
      const snap = await transaction.get(counterRef);
      let currentSeq = 0;
      if (snap.exists()) {
        currentSeq = Number(snap.data()?.lastSequence || 0);
      }
      const updatedSeq = currentSeq + count;
      transaction.set(
        counterRef,
        {
          tenantId,
          branchCode: cleanBranch,
          year,
          lastSequence: updatedSeq,
          updatedAt: new Date().toISOString(),
        },
        { merge: true }
      );
      return currentSeq + 1;
    });

    const numbers: string[] = [];
    for (let i = 0; i < count; i++) {
      const seq = startSeq + i;
      numbers.push(`${prefix}-${cleanBranch}-${year}-${String(seq).padStart(6, '0')}`);
    }
    return numbers;
  }

  /**
   * Helper to validate and parse an accession number format
   */
  static parse(accessionNumber: string): {
    valid: boolean;
    prefix?: string;
    branchCode?: string;
    year?: number;
    sequence?: number;
  } {
    const regex = /^([A-Z0-9]+)-([A-Z0-9]+)-(\d{4})-(\d{6})$/;
    const match = accessionNumber.trim().match(regex);
    if (!match) {
      return { valid: false };
    }
    return {
      valid: true,
      prefix: match[1],
      branchCode: match[2],
      year: parseInt(match[3], 10),
      sequence: parseInt(match[4], 10),
    };
  }
}
