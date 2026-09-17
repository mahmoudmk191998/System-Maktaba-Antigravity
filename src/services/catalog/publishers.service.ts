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
import type { Publisher } from '@/types/library.types';

export async function getPublishers(tenantId: string): Promise<Publisher[]> {
  if (!tenantId) return [];
  const q = query(
    collection(db, 'publishers'),
    where('tenantId', '==', tenantId),
    orderBy('name', 'asc')
  );
  const snap = await getDocs(q);
  return snap.docs.map((d) => ({ id: d.id, ...(d.data() as Omit<Publisher, 'id'>) }));
}

export async function createPublisher(
  tenantId: string,
  data: Omit<Publisher, 'id' | 'tenantId' | 'createdAt' | 'updatedAt'>
): Promise<Publisher> {
  const now = new Date().toISOString();
  const newDoc = {
    tenantId,
    name: data.name.trim(),
    phone: data.phone || '',
    email: data.email || '',
    address: data.address || '',
    website: data.website || '',
    notes: data.notes || '',
    createdAt: now,
    updatedAt: now,
  };

  const ref = await addDoc(collection(db, 'publishers'), newDoc);
  return { id: ref.id, ...newDoc };
}

export async function updatePublisher(
  publisherId: string,
  data: Partial<Omit<Publisher, 'id' | 'tenantId' | 'createdAt' | 'updatedAt'>>
): Promise<void> {
  const ref = doc(db, 'publishers', publisherId);
  await updateDoc(ref, {
    ...data,
    updatedAt: new Date().toISOString(),
  });
}

export async function deletePublisher(publisherId: string, tenantId: string): Promise<void> {
  // Safety check: ensure no active books reference this publisher
  const booksQ = query(
    collection(db, 'books'),
    where('tenantId', '==', tenantId),
    where('publisherId', '==', publisherId)
  );
  const booksSnap = await getDocs(booksQ);
  if (!booksSnap.empty) {
    throw new Error('لا يمكن حذف دار النشر لوجود كتب مسجلة تابعة لها في الفهرس.');
  }

  await deleteDoc(doc(db, 'publishers', publisherId));
}
