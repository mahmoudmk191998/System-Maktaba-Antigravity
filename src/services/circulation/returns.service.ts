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
  limit as fsLimit,
} from 'firebase/firestore';
import type {
  Loan,
  LoanItem,
  BookCopy,
  BookCopyCondition,
  BookCopyStatus,
  Book,
  Member,
  MembershipPlan,
  Hold,
  Fine,
} from '@/types/library.types';
import { LibraryPolicyEngine } from '../policy/policyEngine';

export interface ReturnRequest {
  tenantId: string;
  copyBarcode: string;
  conditionOnReturn?: BookCopyCondition;
  employeeId: string;
  notes?: string;
}

export interface ReturnResult {
  loanItem: LoanItem;
  overdueFineAmount: number;
  fineId?: string;
  copyStatus: BookCopyStatus;
  holdFulfilled?: {
    holdId: string;
    memberId: string;
    memberName?: string;
  };
}

export async function returnLoanItem(request: ReturnRequest): Promise<ReturnResult> {
  const { tenantId, copyBarcode, conditionOnReturn = 'good', employeeId, notes } = request;
  const cleanBarcode = copyBarcode.trim();
  const now = new Date();
  const returnDate = now.toISOString();

  // 1. Find active copy
  const copyQ = query(
    collection(db, 'book_copies'),
    where('tenantId', '==', tenantId),
    where('barcode', '==', cleanBarcode),
    fsLimit(1)
  );
  const copySnap = await getDocs(copyQ);
  if (copySnap.empty) {
    throw new Error(`نسخة الكتاب ذات الباركود [${cleanBarcode}] غير موجودة.`);
  }

  const copyDoc = copySnap.docs[0];
  const copy = { id: copyDoc.id, ...(copyDoc.data() as Omit<BookCopy, 'id'>) };

  if (copy.status !== 'on_loan' || !copy.currentLoanId) {
    throw new Error(`هذه النسخة ليست في حالة إعارة حالياً (الحالة الحالية: ${copy.status}).`);
  }

  // 2. Find matching Loan Item
  const itemQ = query(
    collection(db, 'loan_items'),
    where('tenantId', '==', tenantId),
    where('bookCopyId', '==', copy.id),
    where('status', 'in', ['active', 'overdue']),
    fsLimit(1)
  );
  const itemSnap = await getDocs(itemQ);
  if (itemSnap.empty) {
    throw new Error(`لم يتم العثور على سجل إعارة نشط لهذه النسخة.`);
  }

  const itemDoc = itemSnap.docs[0];
  const loanItem = { id: itemDoc.id, ...(itemDoc.data() as Omit<LoanItem, 'id'>) };

  // 3. Load Loan, Member, Membership Plan, and Book
  const loanRef = doc(db, 'loans', loanItem.loanId);
  const loanSnap = await getDoc(loanRef);
  if (!loanSnap.exists()) throw new Error('سند الإعارة الرئيسي غير موجود.');
  const loan = { id: loanSnap.id, ...(loanSnap.data() as Omit<Loan, 'id'>) };

  const memberRef = doc(db, 'members', loan.memberId);
  const memberSnap = await getDoc(memberRef);
  const member = memberSnap.exists()
    ? { id: memberSnap.id, ...(memberSnap.data() as Omit<Member, 'id'>) }
    : null;

  let plan: MembershipPlan | null = null;
  if (member?.membershipPlanId) {
    const pSnap = await getDoc(doc(db, 'membership_plans', member.membershipPlanId));
    if (pSnap.exists()) {
      plan = { id: pSnap.id, ...(pSnap.data() as Omit<MembershipPlan, 'id'>) };
    }
  }

  const bookRef = doc(db, 'books', copy.bookId);
  const bookSnap = await getDoc(bookRef);
  const book = bookSnap.exists()
    ? { id: bookSnap.id, ...(bookSnap.data() as Omit<Book, 'id'>) }
    : null;

  // 4. Calculate Overdue Fine
  let overdueFineAmount = 0;
  if (plan) {
    const fineCalc = LibraryPolicyEngine.calculateOverdueFine(loanItem.dueDate, returnDate, plan);
    overdueFineAmount = fineCalc.totalFine;
  }

  // 5. Check if any patron is waiting for this book in Holds Queue
  const holdsQ = query(
    collection(db, 'holds'),
    where('tenantId', '==', tenantId),
    where('bookId', '==', copy.bookId),
    where('status', '==', 'waiting'),
    orderBy('queuePosition', 'asc'),
    fsLimit(1)
  );
  const holdSnap = await getDocs(holdsQ);
  const nextHold = !holdSnap.empty
    ? { id: holdSnap.docs[0].id, ...(holdSnap.docs[0].data() as Omit<Hold, 'id'>) }
    : null;

  // Determine post-return copy status
  let finalStatus: BookCopyStatus = 'available';
  let holdFulfilledInfo: ReturnResult['holdFulfilled'] = undefined;

  if (conditionOnReturn === 'damaged' || conditionOnReturn === 'poor') {
    finalStatus = 'damaged';
  } else if (nextHold) {
    finalStatus = 'reserved';
    holdFulfilledInfo = {
      holdId: nextHold.id,
      memberId: nextHold.memberId,
      memberName: nextHold.memberName,
    };
  }

  let createdFineId: string | undefined = undefined;

  // 6. Atomic Transaction
  await runTransaction(db, async (t) => {
    // A. Update Loan Item
    t.update(itemDoc.ref, {
      status: 'returned',
      returnDate,
      conditionOnReturn,
      fineAmount: overdueFineAmount,
      updatedAt: returnDate,
    });

    // B. Update Copy
    const copyUpdates: Record<string, any> = {
      status: finalStatus,
      condition: conditionOnReturn,
      currentLoanId: null,
      updatedAt: returnDate,
    };
    if (finalStatus === 'reserved' && nextHold) {
      copyUpdates.reservedForMemberId = nextHold.memberId;
    } else {
      copyUpdates.reservedForMemberId = null;
    }
    t.update(copyDoc.ref, copyUpdates);

    // C. Update Book available copies counter if available
    if (bookRef && finalStatus === 'available') {
      const transBookSnap = await t.get(bookRef);
      if (transBookSnap.exists()) {
        const b = transBookSnap.data() as Book;
        t.update(bookRef, {
          availableCopiesCount: (b.availableCopiesCount || 0) + 1,
          updatedAt: returnDate,
        });
      }
    }

    // D. Update Member loans count & fine balance
    if (memberRef) {
      const transMemSnap = await t.get(memberRef);
      if (transMemSnap.exists()) {
        const m = transMemSnap.data() as Member;
        const newLoansCount = Math.max(0, (m.currentLoansCount || 1) - 1);
        const newFines = (m.outstandingFine || 0) + overdueFineAmount;
        t.update(memberRef, {
          currentLoansCount: newLoansCount,
          outstandingFine: newFines,
          updatedAt: returnDate,
        });
      }
    }

    // E. Create Fine record if overdue
    if (overdueFineAmount > 0 && member) {
      const fineRef = doc(collection(db, 'fines'));
      createdFineId = fineRef.id;
      const newFine: Fine = {
        id: fineRef.id,
        tenantId,
        memberId: member.id,
        memberName: member.fullName,
        loanId: loan.id,
        loanItemId: loanItem.id,
        bookCopyId: copy.id,
        fineType: 'overdue',
        amount: overdueFineAmount,
        paidAmount: 0,
        remainingAmount: overdueFineAmount,
        reason: `غرامة تأخير في إرجاع كتاب [${loanItem.bookTitle}] لمدة تأخير محسوبة وفقاً للائحة الإعارة.`,
        status: 'unpaid',
        waivedBy: null,
        waivedReason: null,
        createdAt: returnDate,
        updatedAt: returnDate,
      };
      t.set(fineRef, newFine);
    }

    // F. Update Hold status if fulfilled
    if (nextHold && holdSnap.docs[0]) {
      const expires = new Date(now.getTime());
      expires.setDate(expires.getDate() + 3); // 3 days to pick up reserved book
      t.update(holdSnap.docs[0].ref, {
        status: 'ready',
        fulfilledCopyId: copy.id,
        expiresAt: expires.toISOString(),
        notifiedAt: returnDate,
        updatedAt: returnDate,
      });
    }

    // G. Check overall Loan completion
    const allItemsQ = query(
      collection(db, 'loan_items'),
      where('loanId', '==', loan.id)
    );
    // Note: will finalize loan status based on remaining items check
    t.update(loanRef, {
      totalFine: (loan.totalFine || 0) + overdueFineAmount,
      updatedAt: returnDate,
    });
  });

  // 7. Check if all items in loan returned
  try {
    const remainingQ = query(
      collection(db, 'loan_items'),
      where('loanId', '==', loan.id),
      where('status', 'in', ['active', 'overdue'])
    );
    const remSnap = await getDocs(remainingQ);
    if (remSnap.empty) {
      await updateDoc(loanRef, {
        status: 'returned',
        returnedAt: returnDate,
        updatedAt: returnDate,
      });
    } else {
      await updateDoc(loanRef, {
        status: 'partially_returned',
        updatedAt: returnDate,
      });
    }
  } catch (err) {
    console.warn('[Returns] Could not update parent loan status:', err);
  }

  // 8. Log movement
  try {
    await addDoc(collection(db, 'book_movements'), {
      tenantId,
      branchId: copy.branchId,
      bookCopyId: copy.id,
      bookId: copy.bookId,
      movementType: 'returned',
      beforeStatus: 'on_loan',
      afterStatus: finalStatus,
      beforeShelfId: copy.shelfId || '',
      afterShelfId: copy.shelfId || '',
      beforeBranchId: copy.branchId,
      afterBranchId: copy.branchId,
      performedBy: employeeId,
      memberId: loan.memberId,
      loanId: loan.id,
      notes: notes || `إرجاع النسخة بحالة ${conditionOnReturn}. ${overdueFineAmount > 0 ? `تم احتساب غرامة ${overdueFineAmount} ج.م` : ''}`,
      timestamp: returnDate,
    });
  } catch (err) {
    console.warn('[Returns] Could not record return movement:', err);
  }

  return {
    loanItem: { ...loanItem, status: 'returned', returnDate },
    overdueFineAmount,
    fineId: createdFineId,
    copyStatus: finalStatus,
    holdFulfilled: holdFulfilledInfo,
  };
}
