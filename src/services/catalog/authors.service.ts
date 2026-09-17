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
  orderBy,
} from 'firebase/firestore';
import type { Author } from '@/types/library.types';

export async function getAuthors(tenantId: string): Promise<Author[]> {
  if (!tenantId) return [];
  const q = query(
    collection(db, 'authors'),
    where('tenantId', '==', tenantId),
    orderBy('name', 'asc')
  );
  const snap = await getDocs(q);
  return snap.docs.map((d) => ({ id: d.id, ...(d.data() as Omit<Author, 'id'>) }));
}

export async function createAuthor(
  tenantId: string,
  data: Omit<Author, 'id' | 'tenantId' | 'createdAt' | 'updatedAt'>
): Promise<Author> {
  const normalizedName = data.name.trim().toLowerCase();
  const now = new Date().toISOString();

  const newDoc = {
    tenantId,
    name: data.name.trim(),
    normalizedName,
    biography: data.biography || '',
    nationality: data.nationality || '',
    birthDate: data.birthDate || '',
    deathDate: data.deathDate || '',
    photoUrl: data.photoUrl || '',
    createdAt: now,
    updatedAt: now,
  };

  const ref = await addDoc(collection(db, 'authors'), newDoc);
  return { id: ref.id, ...newDoc };
}

export async function updateAuthor(
  authorId: string,
  data: Partial<Omit<Author, 'id' | 'tenantId' | 'createdAt' | 'updatedAt'>>
): Promise<void> {
  const ref = doc(db, 'authors', authorId);
  const updates: Record<string, any> = {
    ...data,
    updatedAt: new Date().toISOString(),
  };
  if (data.name) {
    updates.normalizedName = data.name.trim().toLowerCase();
  }
  await updateDoc(ref, updates);
}

export async function deleteAuthor(authorId: string, tenantId: string): Promise<void> {
  // Safety check: ensure no active books reference this author
  const booksQ = query(
    collection(db, 'books'),
    where('tenantId', '==', tenantId),
    where('authorIds', 'array-contains', authorId)
  );
  const booksSnap = await getDocs(booksQ);
  if (!booksSnap.empty) {
    throw new Error('لا يمكن حذف المؤلف لوجود كتب مسجلة باسمه في الفهرس. يرجى حذف الكتب أولاً.');
  }

  await deleteDoc(doc(db, 'authors', authorId));
}
