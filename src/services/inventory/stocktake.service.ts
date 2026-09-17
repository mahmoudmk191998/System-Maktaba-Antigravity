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
} from 'firebase/firestore';
import type {
  InventorySession,
  InventoryAuditItem,
  InventoryScanStatus,
  BookCopy,
} from '@/types/library.types';
import { getBookCopies, getCopyByBarcode } from '../catalog/copies.service';

export async function createInventorySession(
  tenantId: string,
  branchId: string,
  name: string,
  conductedBy: string
): Promise<InventorySession> {
  const now = new Date().toISOString();
  const sessionNumber = `INV-${new Date().getFullYear()}-${Date.now().toString().slice(-4)}`;

  // Count existing copies in this branch
  const existingCopies = await getBookCopies(tenantId, { branchId });
  const totalCopiesExpected = existingCopies.length;

  const sessionDocRef = doc(collection(db, 'inventory_sessions'));
  const newSession: InventorySession = {
    id: sessionDocRef.id,
    tenantId,
    branchId,
    sessionNumber,
    name: name.trim(),
    status: 'in_progress',
    startedAt: now,
    conductedBy,
    totalCopiesExpected,
    totalCopiesScanned: 0,
    foundCount: 0,
    missingCount: 0,
    unexpectedCount: 0,
    wrongShelfCount: 0,
    notes: '',
  };

  await addDoc(collection(db, 'inventory_sessions'), newSession);
  return newSession;
}

export async function scanItemInInventorySession(options: {
  tenantId: string;
  sessionId: string;
  barcode: string;
  scannedShelfId?: string;
  scannedBy: string;
}): Promise<{ auditItem: InventoryAuditItem; status: InventoryScanStatus }> {
  const { tenantId, sessionId, barcode, scannedShelfId, scannedBy } = options;
  const cleanBarcode = barcode.trim();
  const now = new Date().toISOString();

  // 1. Fetch Session
  const sessionRef = doc(db, 'inventory_sessions', sessionId);
  const sessionSnap = await getDoc(sessionRef);
  if (!sessionSnap.exists()) throw new Error('جلسة الجرد غير موجودة.');
  const session = sessionSnap.data() as InventorySession;

  if (session.status !== 'in_progress') {
    throw new Error('جلسة الجرد مغلقة أو ملغاة.');
  }

  // 2. Fetch Copy
  const copy = await getCopyByBarcode(tenantId, cleanBarcode);

  let scanStatus: InventoryScanStatus = 'unexpected';
  let copyId: string | undefined = undefined;
  let expectedShelfId: string | undefined = undefined;

  if (copy) {
    copyId = copy.id;
    expectedShelfId = copy.shelfId;

    if (copy.branchId !== session.branchId) {
      scanStatus = 'unexpected'; // Belongs to another branch
    } else if (copy.status === 'on_loan') {
      scanStatus = 'loaned';
    } else if (copy.status === 'damaged') {
      scanStatus = 'damaged';
    } else if (scannedShelfId && copy.shelfId && scannedShelfId !== copy.shelfId) {
      scanStatus = 'wrong_shelf';
    } else {
      scanStatus = 'found';
    }
  }

  const itemDocRef = doc(collection(db, 'inventory_items'));
  const auditItem: InventoryAuditItem = {
    id: itemDocRef.id,
    tenantId,
    sessionId,
    bookCopyId: copyId,
    barcode: cleanBarcode,
    expectedShelfId,
    scannedShelfId: scannedShelfId || '',
    status: scanStatus,
    scannedAt: now,
    scannedBy,
  };

  await runTransaction(db, async (t) => {
    t.set(itemDocRef, auditItem);

    // Update Session Counters
    const sSnap = await t.get(sessionRef);
    if (sSnap.exists()) {
      const s = sSnap.data() as InventorySession;
      t.update(sessionRef, {
        totalCopiesScanned: (s.totalCopiesScanned || 0) + 1,
        foundCount: (s.foundCount || 0) + (scanStatus === 'found' ? 1 : 0),
        wrongShelfCount: (s.wrongShelfCount || 0) + (scanStatus === 'wrong_shelf' ? 1 : 0),
        unexpectedCount: (s.unexpectedCount || 0) + (scanStatus === 'unexpected' ? 1 : 0),
      });
    }

    // Update copy lastInventoryCheckAt
    if (copy) {
      t.update(doc(db, 'book_copies', copy.id), {
        lastInventoryCheckAt: now,
      });
    }
  });

  return { auditItem, status: scanStatus };
}

export async function finalizeInventorySession(
  sessionId: string,
  notes?: string
): Promise<InventorySession> {
  const sessionRef = doc(db, 'inventory_sessions', sessionId);
  const snap = await getDoc(sessionRef);
  if (!snap.exists()) throw new Error('جلسة الجرد غير موجودة.');
  const session = snap.data() as InventorySession;

  const now = new Date().toISOString();
  const missingCount = Math.max(0, session.totalCopiesExpected - session.foundCount);

  await updateDoc(sessionRef, {
    status: 'completed',
    completedAt: now,
    missingCount,
    notes: notes || session.notes || '',
  });

  return {
    ...session,
    status: 'completed',
    completedAt: now,
    missingCount,
  };
}
