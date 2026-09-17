import { db } from '@/lib/firebase';
import {
  collection,
  doc,
  getDocs,
  getDoc,
  addDoc,
  updateDoc,
  deleteDoc,
  query,
  where,
  runTransaction,
} from 'firebase/firestore';
import type { BookCopy, BookCopyStatus, BookCopyCondition } from '@/types/library.types';
import { AccessionNumberGenerator } from './accessionNumber';

export interface CopyFilterOptions {
  bookId?: string;
  branchId?: string;
  status?: BookCopyStatus;
  barcode?: string;
}

export async function getBookCopies(
  tenantId: string,
  options: CopyFilterOptions = {}
): Promise<BookCopy[]> {
  if (!tenantId) return [];

  const constraints = [where('tenantId', '==', tenantId)];

  if (options.bookId) {
    constraints.push(where('bookId', '==', options.bookId));
  }
  if (options.branchId && options.branchId !== 'all') {
    constraints.push(where('branchId', '==', options.branchId));
  }
  if (options.status) {
    constraints.push(where('status', '==', options.status));
  }
  if (options.barcode) {
    constraints.push(where('barcode', '==', options.barcode.trim()));
  }

  const q = query(collection(db, 'book_copies'), ...constraints);
  const snap = await getDocs(q);
  return snap.docs.map((d) => ({ id: d.id, ...(d.data() as Omit<BookCopy, 'id'>) }));
}

export async function getCopyByBarcode(
  tenantId: string,
  barcode: string
): Promise<BookCopy | null> {
  const cleanBarcode = barcode.trim();
  if (!cleanBarcode) return null;

  const q = query(
    collection(db, 'book_copies'),
    where('tenantId', '==', tenantId),
    where('barcode', '==', cleanBarcode)
  );
  const snap = await getDocs(q);
  if (snap.empty) return null;
  return { id: snap.docs[0].id, ...(snap.docs[0].data() as Omit<BookCopy, 'id'>) };
}

export async function createBookCopy(
  tenantId: string,
  data: {
    bookId: string;
    branchId: string;
    barcode: string;
    accessionNumber?: string;
    branchCode?: string;
    shelfId?: string;
    shelfLocation?: string;
    acquisitionDate?: string;
    purchasePrice?: number;
    supplierId?: string;
    condition?: BookCopyCondition;
    status?: BookCopyStatus;
    notes?: string;
    performedBy?: string;
  }
): Promise<BookCopy> {
  const cleanBarcode = data.barcode.trim();
  if (!cleanBarcode) {
    throw new Error('الباركود مطلوب لإنشاء نسخة كتاب.');
  }

  // 1. Check for duplicate barcode within this tenant
  const existing = await getCopyByBarcode(tenantId, cleanBarcode);
  if (existing) {
    throw new Error(`الباركود [${cleanBarcode}] مسجل مسبقاً لنسخة أخرى في هذه المؤسسة.`);
  }

  // 2. Generate Accession Number if not provided
  let accessionNumber = data.accessionNumber?.trim();
  if (!accessionNumber) {
    accessionNumber = await AccessionNumberGenerator.generateNext({
      tenantId,
      branchCode: data.branchCode || 'MAIN',
    });
  }

  const now = new Date().toISOString();
  const initialStatus: BookCopyStatus = data.status || 'available';

  const newCopy: Omit<BookCopy, 'id'> = {
    tenantId,
    bookId: data.bookId,
    branchId: data.branchId,
    barcode: cleanBarcode,
    accessionNumber,
    shelfId: data.shelfId || '',
    shelfLocation: data.shelfLocation || '',
    acquisitionDate: data.acquisitionDate || now.slice(0, 10),
    purchasePrice: Number(data.purchasePrice) || 0,
    supplierId: data.supplierId || '',
    condition: data.condition || 'new',
    status: initialStatus,
    notes: data.notes || '',
    currentLoanId: null,
    reservedForMemberId: null,
    lastInventoryCheckAt: null,
    createdAt: now,
    updatedAt: now,
  };

  const copyRef = await addDoc(collection(db, 'book_copies'), newCopy);

  // 3. Atomically update parent Book aggregate counters
  const bookRef = doc(db, 'books', data.bookId);
  try {
    await runTransaction(db, async (t) => {
      const bSnap = await t.get(bookRef);
      if (bSnap.exists()) {
        const bData = bSnap.data();
        const total = (bData.totalCopiesCount || 0) + 1;
        const available = (bData.availableCopiesCount || 0) + (initialStatus === 'available' ? 1 : 0);
        t.update(bookRef, {
          totalCopiesCount: total,
          availableCopiesCount: available,
          updatedAt: now,
        });
      }
    });
  } catch (err) {
    console.warn('[Copies] Could not update book counters:', err);
  }

  // 4. Record initial movement in book_movements
  try {
    await addDoc(collection(db, 'book_movements'), {
      tenantId,
      branchId: data.branchId,
      bookCopyId: copyRef.id,
      bookId: data.bookId,
      movementType: 'acquired',
      beforeStatus: 'processing',
      afterStatus: initialStatus,
      beforeShelfId: '',
      afterShelfId: data.shelfId || '',
      beforeBranchId: '',
      afterBranchId: data.branchId,
      performedBy: data.performedBy || 'system',
      notes: 'إضافة نسخة جديدة إلى فهرس المكتبة',
      timestamp: now,
    });
  } catch (err) {
    console.warn('[Copies] Could not record initial movement:', err);
  }

  return { id: copyRef.id, ...newCopy };
}

export async function updateCopyStatus(
  copyId: string,
  newStatus: BookCopyStatus,
  options: {
    performedBy?: string;
    notes?: string;
    memberId?: string;
    loanId?: string;
    shelfId?: string;
  } = {}
): Promise<void> {
  const copyRef = doc(db, 'book_copies', copyId);
  const now = new Date().toISOString();

  await runTransaction(db, async (t) => {
    const snap = await t.get(copyRef);
    if (!snap.exists()) {
      throw new Error('نسخة الكتاب غير موجودة.');
    }
    const copy = snap.data() as BookCopy;
    const oldStatus = copy.status;

    if (oldStatus === newStatus && (!options.shelfId || options.shelfId === copy.shelfId)) {
      return; // No change
    }

    const updates: Record<string, any> = {
      status: newStatus,
      updatedAt: now,
    };
    if (options.shelfId !== undefined) {
      updates.shelfId = options.shelfId;
    }
    if (options.loanId !== undefined) {
      updates.currentLoanId = options.loanId;
    }
    if (newStatus === 'available') {
      updates.currentLoanId = null;
      updates.reservedForMemberId = null;
    }

    t.update(copyRef, updates);

    // Update parent Book available count if status changed from/to available
    if (oldStatus !== newStatus && (oldStatus === 'available' || newStatus === 'available')) {
      const bookRef = doc(db, 'books', copy.bookId);
      const bSnap = await t.get(bookRef);
      if (bSnap.exists()) {
        const bData = bSnap.data();
        let avail = bData.availableCopiesCount || 0;
        if (oldStatus === 'available') avail = Math.max(0, avail - 1);
        if (newStatus === 'available') avail += 1;
        t.update(bookRef, {
          availableCopiesCount: avail,
          updatedAt: now,
        });
      }
    }
  });

  // Log movement
  try {
    const snap = await getDoc(copyRef);
    if (snap.exists()) {
      const copy = snap.data() as BookCopy;
      await addDoc(collection(db, 'book_movements'), {
        tenantId: copy.tenantId,
        branchId: copy.branchId,
        bookCopyId: copyId,
        bookId: copy.bookId,
        movementType: newStatus === 'on_loan' ? 'loaned' : (newStatus === 'available' ? 'returned' : 'shelf_changed'),
        beforeStatus: copy.status,
        afterStatus: newStatus,
        beforeShelfId: copy.shelfId || '',
        afterShelfId: options.shelfId || copy.shelfId || '',
        beforeBranchId: copy.branchId,
        afterBranchId: copy.branchId,
        performedBy: options.performedBy || 'system',
        memberId: options.memberId || '',
        loanId: options.loanId || '',
        notes: options.notes || `تحديث حالة النسخة إلى ${newStatus}`,
        timestamp: now,
      });
    }
  } catch (err) {
    console.warn('[Copies] Could not log status movement:', err);
  }
}
