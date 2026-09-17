import { db } from '@/lib/firebase';
import {
  collection,
  query,
  where,
  getDocs,
  limit as fsLimit,
} from 'firebase/firestore';

export interface LibraryDashboardKPIs {
  totalBooks: number;
  totalCopies: number;
  availableCopies: number;
  activeLoans: number;
  loansToday: number;
  returnsToday: number;
  overdueLoans: number;
  activeHolds: number;
  activeMembers: number;
  outstandingFines: number;
  finesCollectedToday: number;
  lostBooksCount: number;
  damagedBooksCount: number;
}

export interface PopularTitleStat {
  bookId: string;
  title: string;
  loanCount: number;
}

export async function getLibraryDashboardKPIs(
  tenantId: string,
  branchId?: string | null
): Promise<LibraryDashboardKPIs> {
  if (!tenantId) {
    return {
      totalBooks: 0,
      totalCopies: 0,
      availableCopies: 0,
      activeLoans: 0,
      loansToday: 0,
      returnsToday: 0,
      overdueLoans: 0,
      activeHolds: 0,
      activeMembers: 0,
      outstandingFines: 0,
      finesCollectedToday: 0,
      lostBooksCount: 0,
      damagedBooksCount: 0,
    };
  }

  const todayStr = new Date().toISOString().slice(0, 10);

  // 1. Books Count
  const booksQ = query(
    collection(db, 'books'),
    where('tenantId', '==', tenantId),
    where('status', '==', 'active')
  );
  const booksSnap = await getDocs(booksQ);
  const totalBooks = booksSnap.size;

  // 2. Copies Count & Available
  const copiesConstraints = [where('tenantId', '==', tenantId)];
  if (branchId && branchId !== 'all') {
    copiesConstraints.push(where('branchId', '==', branchId));
  }
  const copiesQ = query(collection(db, 'book_copies'), ...copiesConstraints);
  const copiesSnap = await getDocs(copiesQ);
  const totalCopies = copiesSnap.size;
  let availableCopies = 0;
  let lostBooksCount = 0;
  let damagedBooksCount = 0;

  copiesSnap.docs.forEach((d) => {
    const data = d.data();
    if (data.status === 'available') availableCopies++;
    if (data.status === 'lost') lostBooksCount++;
    if (data.status === 'damaged') damagedBooksCount++;
  });

  // 3. Loans
  const loansConstraints = [where('tenantId', '==', tenantId)];
  if (branchId && branchId !== 'all') {
    loansConstraints.push(where('branchId', '==', branchId));
  }
  const loansQ = query(collection(db, 'loans'), ...loansConstraints);
  const loansSnap = await getDocs(loansQ);

  let activeLoans = 0;
  let loansToday = 0;
  let returnsToday = 0;
  let overdueLoans = 0;
  const now = new Date();

  loansSnap.docs.forEach((d) => {
    const l = d.data();
    if (l.status === 'active' || l.status === 'partially_returned' || l.status === 'overdue') {
      activeLoans++;
      if (new Date(l.dueDate) < now) {
        overdueLoans++;
      }
    }
    if (l.checkoutDate && l.checkoutDate.slice(0, 10) === todayStr) {
      loansToday++;
    }
    if (l.returnedAt && l.returnedAt.slice(0, 10) === todayStr) {
      returnsToday++;
    }
  });

  // 4. Holds
  const holdsConstraints = [where('tenantId', '==', tenantId), where('status', 'in', ['waiting', 'ready'])];
  if (branchId && branchId !== 'all') {
    holdsConstraints.push(where('branchId', '==', branchId));
  }
  const holdsSnap = await getDocs(query(collection(db, 'holds'), ...holdsConstraints));
  const activeHolds = holdsSnap.size;

  // 5. Members
  const membersSnap = await getDocs(
    query(collection(db, 'members'), where('tenantId', '==', tenantId), where('status', '==', 'active'))
  );
  const activeMembers = membersSnap.size;

  // 6. Fines Outstanding
  const finesSnap = await getDocs(
    query(collection(db, 'fines'), where('tenantId', '==', tenantId), where('status', 'in', ['unpaid', 'partially_paid']))
  );
  let outstandingFines = 0;
  finesSnap.docs.forEach((d) => {
    outstandingFines += Number(d.data().remainingAmount || 0);
  });

  // 7. Fines Collected Today
  const paySnap = await getDocs(
    query(collection(db, 'fine_payments'), where('tenantId', '==', tenantId))
  );
  let finesCollectedToday = 0;
  paySnap.docs.forEach((d) => {
    const p = d.data();
    if (p.createdAt && p.createdAt.slice(0, 10) === todayStr) {
      finesCollectedToday += Number(p.amount || 0);
    }
  });

  return {
    totalBooks,
    totalCopies,
    availableCopies,
    activeLoans,
    loansToday,
    returnsToday,
    overdueLoans,
    activeHolds,
    activeMembers,
    outstandingFines: Number(outstandingFines.toFixed(2)),
    finesCollectedToday: Number(finesCollectedToday.toFixed(2)),
    lostBooksCount,
    damagedBooksCount,
  };
}
