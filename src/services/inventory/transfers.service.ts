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
import type { BookTransfer, BookCopy } from '@/types/library.types';

export async function getBookTransfers(
  tenantId: string,
  options: { branchId?: string; status?: string } = {}
): Promise<BookTransfer[]> {
  if (!tenantId) return [];
  const constraints = [where('tenantId', '==', tenantId)];

  if (options.status && options.status !== 'all') {
    constraints.push(where('status', '==', options.status));
  }

  const q = query(collection(db, 'book_transfers'), ...constraints, orderBy('requestedAt', 'desc'));
  const snap = await getDocs(q);
  let transfers = snap.docs.map((d) => ({ id: d.id, ...(d.data() as Omit<BookTransfer, 'id'>) }));

  if (options.branchId && options.branchId !== 'all') {
    transfers = transfers.filter(
      (t) => t.fromBranchId === options.branchId || t.toBranchId === options.branchId
    );
  }

  return transfers;
}

export async function requestBookTransfer(options: {
  tenantId: string;
  fromBranchId: string;
  fromBranchName?: string;
  toBranchId: string;
  toBranchName?: string;
  bookCopyIds: string[];
  requestedBy: string;
  notes?: string;
}): Promise<BookTransfer> {
  const { tenantId, fromBranchId, fromBranchName, toBranchId, toBranchName, bookCopyIds, requestedBy, notes } = options;

  if (fromBranchId === toBranchId) {
    throw new Error('لا يمكن نقل الكتب لنفس الفرع.');
  }
  if (!bookCopyIds || bookCopyIds.length === 0) {
    throw new Error('يرجى اختيار نسخة كتاب واحدة على الأقل للنقل.');
  }

  const now = new Date().toISOString();
  const transferNumber = `TRF-${Date.now().toString().slice(-6)}`;

  const transferDocRef = doc(collection(db, 'book_transfers'));
  const newTransfer: BookTransfer = {
    id: transferDocRef.id,
    tenantId,
    transferNumber,
    fromBranchId,
    fromBranchName: fromBranchName || '',
    toBranchId,
    toBranchName: toBranchName || '',
    bookCopyIds,
    requestedBy,
    status: 'requested',
    requestedAt: now,
    notes: notes || '',
  };

  await addDoc(collection(db, 'book_transfers'), newTransfer);
  return newTransfer;
}

export async function shipBookTransfer(transferId: string, approvedBy: string): Promise<void> {
  const ref = doc(db, 'book_transfers', transferId);
  const snap = await getDoc(ref);
  if (!snap.exists()) throw new Error('سند المناقلة غير موجود.');
  const trf = snap.data() as BookTransfer;

  if (trf.status !== 'requested' && trf.status !== 'approved') {
    throw new Error('لا يمكن شحن مناقلة في حالتها الحالية.');
  }

  const now = new Date().toISOString();
  await updateDoc(ref, {
    status: 'in_transit',
    approvedBy,
    shippedAt: now,
  });
}

export async function receiveBookTransfer(transferId: string, receivedBy: string): Promise<void> {
  const ref = doc(db, 'book_transfers', transferId);
  const snap = await getDoc(ref);
  if (!snap.exists()) throw new Error('سند المناقلة غير موجود.');
  const trf = snap.data() as BookTransfer;

  if (trf.status !== 'in_transit') {
    throw new Error('لا يمكن تأكيد استلام مناقلة لم تشحن بعد (ليست In Transit).');
  }

  const now = new Date().toISOString();

  // Atomically update copy branches ONLY upon confirmed receipt
  await runTransaction(db, async (t) => {
    t.update(ref, {
      status: 'received',
      receivedBy,
      receivedAt: now,
    });

    for (const copyId of trf.bookCopyIds) {
      const copyRef = doc(db, 'book_copies', copyId);
      const cSnap = await t.get(copyRef);
      if (cSnap.exists()) {
        t.update(copyRef, {
          branchId: trf.toBranchId,
          shelfId: '', // Clear shelf assignment on transfer until placed on new shelf
          updatedAt: now,
        });
      }
    }
  });

  // Log book movements
  for (const copyId of trf.bookCopyIds) {
    try {
      await addDoc(collection(db, 'book_movements'), {
        tenantId: trf.tenantId,
        branchId: trf.toBranchId,
        bookCopyId: copyId,
        bookId: '',
        movementType: 'transferred',
        beforeStatus: 'available',
        afterStatus: 'available',
        beforeShelfId: '',
        afterShelfId: '',
        beforeBranchId: trf.fromBranchId,
        afterBranchId: trf.toBranchId,
        performedBy: receivedBy,
        notes: `استلام مناقلة بين الفروع رقم ${trf.transferNumber}`,
        timestamp: now,
      });
    } catch (err) {
      console.warn('[Transfers] Movement log error:', err);
    }
  }
}
