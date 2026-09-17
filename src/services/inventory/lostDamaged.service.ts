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
  orderBy,
} from 'firebase/firestore';
import type {
  LostDamagedRecord,
  LostDamagedResolution,
  BookCopy,
  Book,
  Fine,
} from '@/types/library.types';

export async function getLostDamagedRecords(
  tenantId: string,
  options: { branchId?: string; type?: 'lost' | 'damaged' } = {}
): Promise<LostDamagedRecord[]> {
  if (!tenantId) return [];
  const constraints = [where('tenantId', '==', tenantId)];

  if (options.type) {
    constraints.push(where('type', '==', options.type));
  }
  if (options.branchId && options.branchId !== 'all') {
    constraints.push(where('branchId', '==', options.branchId));
  }

  const q = query(collection(db, 'lost_damaged_records'), ...constraints, orderBy('createdAt', 'desc'));
  const snap = await getDocs(q);
  return snap.docs.map((d) => ({ id: d.id, ...(d.data() as Omit<LostDamagedRecord, 'id'>) }));
}

export async function reportLostOrDamagedBook(options: {
  tenantId: string;
  branchId: string;
  bookCopyId: string;
  type: 'lost' | 'damaged';
  description: string;
  chargeAmount?: number;
  memberId?: string;
  memberName?: string;
  loanId?: string;
  employeeId: string;
}): Promise<LostDamagedRecord> {
  const { tenantId, branchId, bookCopyId, type, description, chargeAmount = 0, memberId, memberName, loanId, employeeId } = options;
  const now = new Date().toISOString();

  // 1. Fetch copy & book details
  const copyRef = doc(db, 'book_copies', bookCopyId);
  const copySnap = await getDoc(copyRef);
  if (!copySnap.exists()) throw new Error('نسخة الكتاب غير موجودة.');
  const copy = copySnap.data() as BookCopy;

  const bookRef = doc(db, 'books', copy.bookId);
  const bookSnap = await getDoc(bookRef);
  const book = bookSnap.exists() ? (bookSnap.data() as Book) : null;

  const recordDocRef = doc(collection(db, 'lost_damaged_records'));
  const record: LostDamagedRecord = {
    id: recordDocRef.id,
    tenantId,
    branchId,
    bookCopyId,
    bookId: copy.bookId,
    bookTitle: book?.title || '',
    copyBarcode: copy.barcode,
    memberId: memberId || '',
    memberName: memberName || '',
    loanId: loanId || '',
    type,
    description: description.trim(),
    chargeAmount: Number(chargeAmount) || 0,
    employeeId,
    resolution: 'withdrawn', // default initial state
    resolvedAt: undefined,
    createdAt: now,
  };

  await runTransaction(db, async (t) => {
    t.set(recordDocRef, record);

    // Update copy status
    t.update(copyRef, {
      status: type === 'lost' ? 'lost' : 'damaged',
      updatedAt: now,
    });

    // Create Fine if chargeAmount > 0 and member is identified
    if (chargeAmount > 0 && memberId) {
      const fineRef = doc(collection(db, 'fines'));
      const newFine: Fine = {
        id: fineRef.id,
        tenantId,
        memberId,
        memberName: memberName || '',
        loanId: loanId || null,
        loanItemId: null,
        bookCopyId,
        fineType: type === 'lost' ? 'lost_book' : 'damaged_book',
        amount: chargeAmount,
        paidAmount: 0,
        remainingAmount: chargeAmount,
        reason: `قيمة التعويض عن كتاب [${type === 'lost' ? 'مفقود' : 'تالف'}]: ${book?.title || copy.barcode}`,
        status: 'unpaid',
        waivedBy: null,
        waivedReason: null,
        createdAt: now,
        updatedAt: now,
      };
      t.set(fineRef, newFine);

      // Increment member outstandingFine
      const memRef = doc(db, 'members', memberId);
      const memSnap = await t.get(memRef);
      if (memSnap.exists()) {
        const m = memSnap.data();
        t.update(memRef, {
          outstandingFine: (m.outstandingFine || 0) + chargeAmount,
          updatedAt: now,
        });
      }
    }
  });

  return record;
}

export async function resolveLostDamaged(
  recordId: string,
  resolution: LostDamagedResolution,
  employeeId: string,
  notes?: string
): Promise<void> {
  const ref = doc(db, 'lost_damaged_records', recordId);
  const snap = await getDoc(ref);
  if (!snap.exists()) throw new Error('السجل غير موجود.');
  const record = snap.data() as LostDamagedRecord;

  const now = new Date().toISOString();

  await runTransaction(db, async (t) => {
    t.update(ref, {
      resolution,
      resolvedAt: now,
    });

    const copyRef = doc(db, 'book_copies', record.bookCopyId);
    if (resolution === 'repaired' || resolution === 'replaced') {
      t.update(copyRef, {
        status: 'available',
        condition: resolution === 'repaired' ? 'fair' : 'new',
        updatedAt: now,
      });
    } else if (resolution === 'withdrawn') {
      t.update(copyRef, {
        status: 'withdrawn',
        updatedAt: now,
      });
    }
  });
}
