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
  limit as fsLimit,
} from 'firebase/firestore';
import type { Book } from '@/types/library.types';

export interface BookFilterOptions {
  search?: string;
  categoryId?: string;
  authorId?: string;
  status?: string;
  maxLimit?: number;
}

export function normalizeSearchText(text: string): string {
  if (!text) return '';
  return text
    .trim()
    .toLowerCase()
    .replace(/[أإآ]/g, 'ا')
    .replace(/ة/g, 'ه')
    .replace(/ى/g, 'ي')
    .replace(/[\u064B-\u065F]/g, ''); // Remove Arabic diacritics (tashkeel)
}

export async function getBooks(tenantId: string, options: BookFilterOptions = {}): Promise<Book[]> {
  if (!tenantId) return [];

  const constraints: any[] = [where('tenantId', '==', tenantId)];

  if (options.status && options.status !== 'all') {
    constraints.push(where('status', '==', options.status));
  } else {
    // Default to active books
    constraints.push(where('status', '==', 'active'));
  }

  if (options.categoryId) {
    constraints.push(where('categoryIds', 'array-contains', options.categoryId));
  }

  if (options.authorId) {
    constraints.push(where('authorIds', 'array-contains', options.authorId));
  }

  if (options.maxLimit && options.maxLimit > 0) {
    constraints.push(fsLimit(options.maxLimit));
  }

  const q = query(collection(db, 'books'), ...constraints);
  const snap = await getDocs(q);
  let books = snap.docs.map((d) => ({ id: d.id, ...(d.data() as Omit<Book, 'id'>) }));

  // Client-side text search with Arabic & English normalization
  if (options.search && options.search.trim()) {
    const term = normalizeSearchText(options.search);
    books = books.filter((b) => {
      const matchTitle = normalizeSearchText(b.title).includes(term);
      const matchSubtitle = b.subtitle ? normalizeSearchText(b.subtitle).includes(term) : false;
      const matchIsbn13 = b.isbn13 ? b.isbn13.replace(/[-\s]/g, '').includes(term.replace(/[-\s]/g, '')) : false;
      const matchIsbn10 = b.isbn10 ? b.isbn10.replace(/[-\s]/g, '').includes(term.replace(/[-\s]/g, '')) : false;
      const matchCall = b.callNumber ? normalizeSearchText(b.callNumber).includes(term) : false;
      const matchAuthors = (b.authors || []).some((a) => normalizeSearchText(a).includes(term));
      const matchKeywords = (b.keywords || []).some((k) => normalizeSearchText(k).includes(term));
      return matchTitle || matchSubtitle || matchIsbn13 || matchIsbn10 || matchCall || matchAuthors || matchKeywords;
    });
  }

  // Sort by title
  books.sort((a, b) => a.title.localeCompare(b.title, 'ar'));

  return books;
}

export async function getBookById(bookId: string): Promise<Book | null> {
  const ref = doc(db, 'books', bookId);
  const snap = await getDoc(ref);
  if (!snap.exists()) return null;
  return { id: snap.id, ...(snap.data() as Omit<Book, 'id'>) };
}

export async function createBook(
  tenantId: string,
  data: Omit<Book, 'id' | 'tenantId' | 'createdAt' | 'updatedAt' | 'totalCopiesCount' | 'availableCopiesCount'>
): Promise<Book> {
  // Normalize ISBNs (remove spaces and hyphens for consistency)
  const cleanIsbn13 = data.isbn13 ? data.isbn13.replace(/[-\s]/g, '') : undefined;
  const cleanIsbn10 = data.isbn10 ? data.isbn10.replace(/[-\s]/g, '') : undefined;

  const now = new Date().toISOString();
  const newDoc = {
    tenantId,
    title: data.title.trim(),
    subtitle: data.subtitle?.trim() || '',
    description: data.description || '',
    isbn10: cleanIsbn10 || '',
    isbn13: cleanIsbn13 || '',
    authorIds: data.authorIds || [],
    authors: data.authors || [],
    publisherId: data.publisherId || '',
    publisherName: data.publisherName || '',
    publicationYear: data.publicationYear ? Number(data.publicationYear) : undefined,
    publicationDate: data.publicationDate || '',
    edition: data.edition || '',
    language: data.language || 'العربية',
    pageCount: data.pageCount ? Number(data.pageCount) : undefined,
    categoryIds: data.categoryIds || [],
    categoryNames: data.categoryNames || [],
    keywords: data.keywords || [],
    coverUrl: data.coverUrl || '',
    deweyDecimal: data.deweyDecimal || '',
    callNumber: data.callNumber || '',
    defaultShelfId: data.defaultShelfId || '',
    tags: data.tags || [],
    status: data.status || 'active',
    isReferenceOnly: !!data.isReferenceOnly,
    isShortLoan: !!data.isShortLoan,
    loanPeriodOverrideDays: data.loanPeriodOverrideDays ? Number(data.loanPeriodOverrideDays) : undefined,
    totalCopiesCount: 0,
    availableCopiesCount: 0,
    createdAt: now,
    updatedAt: now,
    createdBy: data.createdBy || '',
  };

  const ref = await addDoc(collection(db, 'books'), newDoc);
  return { id: ref.id, ...newDoc };
}

export async function updateBook(
  bookId: string,
  data: Partial<Omit<Book, 'id' | 'tenantId' | 'createdAt' | 'updatedAt'>>
): Promise<void> {
  const ref = doc(db, 'books', bookId);
  const updates: Record<string, any> = {
    ...data,
    updatedAt: new Date().toISOString(),
  };

  if (data.isbn13 !== undefined) {
    updates.isbn13 = data.isbn13 ? data.isbn13.replace(/[-\s]/g, '') : '';
  }
  if (data.isbn10 !== undefined) {
    updates.isbn10 = data.isbn10 ? data.isbn10.replace(/[-\s]/g, '') : '';
  }

  await updateDoc(ref, updates);
}

export async function deleteBook(bookId: string, tenantId: string): Promise<{ archived: boolean }> {
  // Check if book has any active or historical copies
  const copiesQ = query(
    collection(db, 'book_copies'),
    where('tenantId', '==', tenantId),
    where('bookId', '==', bookId)
  );
  const copiesSnap = await getDocs(copiesQ);

  if (!copiesSnap.empty) {
    // If copies exist, soft-delete by setting status to archived to prevent orphan copies or breaking loan history
    await updateDoc(doc(db, 'books', bookId), {
      status: 'archived',
      updatedAt: new Date().toISOString(),
    });
    return { archived: true };
  }

  // Safe to hard delete only if no copies ever existed
  await deleteDoc(doc(db, 'books', bookId));
  return { archived: false };
}
