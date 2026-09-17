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
import type { BookCategory } from '@/types/library.types';

export async function getBookCategories(tenantId: string): Promise<BookCategory[]> {
  if (!tenantId) return [];
  const q = query(
    collection(db, 'book_categories'),
    where('tenantId', '==', tenantId),
    orderBy('sortOrder', 'asc')
  );
  const snap = await getDocs(q);
  return snap.docs.map((d) => ({ id: d.id, ...(d.data() as Omit<BookCategory, 'id'>) }));
}

export async function createBookCategory(
  tenantId: string,
  data: Omit<BookCategory, 'id' | 'tenantId' | 'createdAt' | 'updatedAt'>
): Promise<BookCategory> {
  const now = new Date().toISOString();
  const newDoc = {
    tenantId,
    name: data.name.trim(),
    nameEn: data.nameEn || '',
    parentId: data.parentId || null,
    description: data.description || '',
    icon: data.icon || '📚',
    sortOrder: Number(data.sortOrder) || 0,
    active: data.active ?? true,
    createdAt: now,
    updatedAt: now,
  };

  const ref = await addDoc(collection(db, 'book_categories'), newDoc);
  return { id: ref.id, ...newDoc };
}

export async function updateBookCategory(
  categoryId: string,
  data: Partial<Omit<BookCategory, 'id' | 'tenantId' | 'createdAt' | 'updatedAt'>>
): Promise<void> {
  const ref = doc(db, 'book_categories', categoryId);
  await updateDoc(ref, {
    ...data,
    updatedAt: new Date().toISOString(),
  });
}

export async function deleteBookCategory(categoryId: string, tenantId: string): Promise<void> {
  // Check for child categories
  const childQ = query(
    collection(db, 'book_categories'),
    where('tenantId', '==', tenantId),
    where('parentId', '==', categoryId)
  );
  const childSnap = await getDocs(childQ);
  if (!childSnap.empty) {
    throw new Error('لا يمكن حذف التصنيف لاحتوائه على تصنيفات فرعية تابعة له.');
  }

  // Check for books assigned to this category
  const booksQ = query(
    collection(db, 'books'),
    where('tenantId', '==', tenantId),
    where('categoryIds', 'array-contains', categoryId)
  );
  const booksSnap = await getDocs(booksQ);
  if (!booksSnap.empty) {
    throw new Error('لا يمكن حذف التصنيف لوجود كتب مسجلة تحته.');
  }

  await deleteDoc(doc(db, 'book_categories', categoryId));
}
