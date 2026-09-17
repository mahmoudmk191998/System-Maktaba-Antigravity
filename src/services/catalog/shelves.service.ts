import { db } from '@/lib/firebase';
import {
  collection,
  doc,
  getDocs,
  addDoc,
  updateDoc,
  deleteDoc,
  query,
  where,
  orderBy,
} from 'firebase/firestore';
import type { Shelf } from '@/types/library.types';

export async function getShelves(tenantId: string, branchId?: string | null): Promise<Shelf[]> {
  if (!tenantId) return [];
  let constraints = [where('tenantId', '==', tenantId)];
  if (branchId && branchId !== 'all') {
    constraints.push(where('branchId', '==', branchId));
  }
  const q = query(collection(db, 'shelves'), ...constraints, orderBy('code', 'asc'));
  const snap = await getDocs(q);
  return snap.docs.map((d) => ({ id: d.id, ...(d.data() as Omit<Shelf, 'id'>) }));
}

export async function createShelf(
  tenantId: string,
  data: Omit<Shelf, 'id' | 'tenantId' | 'createdAt' | 'updatedAt'>
): Promise<Shelf> {
  const now = new Date().toISOString();
  const newDoc = {
    tenantId,
    branchId: data.branchId,
    code: data.code.trim().toUpperCase(),
    name: data.name.trim(),
    floor: data.floor || '',
    section: data.section || '',
    aisle: data.aisle || '',
    description: data.description || '',
    active: data.active ?? true,
    createdAt: now,
    updatedAt: now,
  };

  const ref = await addDoc(collection(db, 'shelves'), newDoc);
  return { id: ref.id, ...newDoc };
}

export async function updateShelf(
  shelfId: string,
  data: Partial<Omit<Shelf, 'id' | 'tenantId' | 'createdAt' | 'updatedAt'>>
): Promise<void> {
  const ref = doc(db, 'shelves', shelfId);
  await updateDoc(ref, {
    ...data,
    updatedAt: new Date().toISOString(),
  });
}

export async function deleteShelf(shelfId: string, tenantId: string): Promise<void> {
  // Check if any copies are placed on this shelf
  const copiesQ = query(
    collection(db, 'book_copies'),
    where('tenantId', '==', tenantId),
    where('shelfId', '==', shelfId)
  );
  const copiesSnap = await getDocs(copiesQ);
  if (!copiesSnap.empty) {
    throw new Error('لا يمكن حذف الرف لوجود نسخ كتب موضوعة عليه حالياً. يرجى نقل النسخ أولاً.');
  }

  await deleteDoc(doc(db, 'shelves', shelfId));
}
