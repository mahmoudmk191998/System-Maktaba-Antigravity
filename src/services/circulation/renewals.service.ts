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
  limit as fsLimit,
} from 'firebase/firestore';
import type {
  Loan,
  LoanItem,
  Book,
  BookCopy,
  Member,
  MembershipPlan,
  LoanRenewal,
} from '@/types/library.types';
import { LibraryPolicyEngine } from '../policy/policyEngine';

export interface RenewalRequest {
  tenantId: string;
  loanItemId: string;
  employeeId: string;
  notes?: string;
}

export async function renewLoanItem(request: RenewalRequest): Promise<{
  loanItem: LoanItem;
  newDueDate: string;
  renewalRecord: LoanRenewal;
}> {
  const { tenantId, loanItemId, employeeId, notes } = request;
  const now = new Date().toISOString();

  // 1. Fetch LoanItem
  const itemRef = doc(db, 'loan_items', loanItemId);
  const itemSnap = await getDoc(itemRef);
  if (!itemSnap.exists()) {
    throw new Error('بند الإعارة غير موجود.');
  }
  const loanItem = { id: itemSnap.id, ...(itemSnap.data() as Omit<LoanItem, 'id'>) };

  // 2. Fetch Parent Loan
  const loanRef = doc(db, 'loans', loanItem.loanId);
  const loanSnap = await getDoc(loanRef);
  if (!loanSnap.exists()) {
    throw new Error('سند الإعارة الرئيسي غير موجود.');
  }
  const loan = { id: loanSnap.id, ...(loanSnap.data() as Omit<Loan, 'id'>) };

  // 3. Fetch Book & Member & Plan
  const bookRef = doc(db, 'books', loanItem.bookId);
  const bookSnap = await getDoc(bookRef);
  if (!bookSnap.exists()) throw new Error('العنوان غير موجود.');
  const book = { id: bookSnap.id, ...(bookSnap.data() as Omit<Book, 'id'>) };

  const memberRef = doc(db, 'members', loan.memberId);
  const memberSnap = await getDoc(memberRef);
  if (!memberSnap.exists()) throw new Error('العضو غير موجود.');
  const member = { id: memberSnap.id, ...(memberSnap.data() as Omit<Member, 'id'>) };

  const planRef = doc(db, 'membership_plans', member.membershipPlanId);
  const planSnap = await getDoc(planRef);
  if (!planSnap.exists()) throw new Error('خطة العضوية غير موجودة.');
  const plan = { id: planSnap.id, ...(planSnap.data() as Omit<MembershipPlan, 'id'>) };

  // 4. Check for active holds on this title
  const holdsQ = query(
    collection(db, 'holds'),
    where('tenantId', '==', tenantId),
    where('bookId', '==', loanItem.bookId),
    where('status', '==', 'waiting'),
    fsLimit(1)
  );
  const holdSnap = await getDocs(holdsQ);
  const hasActiveHold = !holdSnap.empty;

  // 5. Policy Engine Check
  const renewalCheck = LibraryPolicyEngine.canRenewLoan(loan, loanItem, book, plan, hasActiveHold);
  if (!renewalCheck.allowed || !renewalCheck.newDueDate) {
    throw new Error(renewalCheck.reason || 'التجديد غير مسموح وفقاً للسياسات.');
  }

  const oldDueDate = loanItem.dueDate;
  const newDueDate = renewalCheck.newDueDate;

  // 6. Atomic Transaction
  const renewalDocRef = doc(collection(db, 'loan_renewals'));
  const renewalRecord: LoanRenewal = {
    id: renewalDocRef.id,
    tenantId,
    loanId: loan.id,
    loanItemId: loanItem.id,
    bookCopyId: loanItem.bookCopyId,
    memberId: member.id,
    employeeId,
    oldDueDate,
    newDueDate,
    renewedAt: now,
    notes: notes || 'تجديد موعد الإرجاع بواسطة موظف الإعارة',
  };

  await runTransaction(db, async (t) => {
    // Update loan_item
    t.update(itemRef, {
      dueDate: newDueDate,
      renewalCount: (loanItem.renewalCount || 0) + 1,
      status: 'active',
      updatedAt: now,
    });

    // Update parent loan dueDate if this was the latest/earliest
    t.update(loanRef, {
      dueDate: newDueDate,
      status: 'active',
      updatedAt: now,
    });

    // Set renewal audit record
    t.set(renewalDocRef, renewalRecord);
  });

  return {
    loanItem: { ...loanItem, dueDate: newDueDate, renewalCount: (loanItem.renewalCount || 0) + 1 },
    newDueDate,
    renewalRecord,
  };
}
