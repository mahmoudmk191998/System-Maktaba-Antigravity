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
} from '@/types/library.types';
import { LibraryPolicyEngine } from '../policy/policyEngine';

export interface CheckoutRequest {
  tenantId: string;
  branchId: string;
  memberId: string;
  copyBarcodes: string[];
  employeeId: string;
  employeeName?: string;
  notes?: string;
}

export interface CheckoutResult {
  loan: Loan;
  items: LoanItem[];
}

export async function checkoutLoan(request: CheckoutRequest): Promise<CheckoutResult> {
  const { tenantId, branchId, memberId, copyBarcodes, employeeId, employeeName, notes } = request;

  if (!copyBarcodes || copyBarcodes.length === 0) {
    throw new Error('يجب تحديد نسخة كتاب واحدة على الأقل لإتمام الإعارة.');
  }

  // 1. Fetch patron & membership plan
  const memberRef = doc(db, 'members', memberId);
  const memberSnap = await getDoc(memberRef);
  if (!memberSnap.exists()) {
    throw new Error('بيانات العضو غير موجودة.');
  }
  const member = { id: memberSnap.id, ...(memberSnap.data() as Omit<Member, 'id'>) };

  const planRef = doc(db, 'membership_plans', member.membershipPlanId);
  const planSnap = await getDoc(planRef);
  if (!planSnap.exists()) {
    throw new Error('خطة العضوية غير موجودة أو معطلة.');
  }
  const plan = { id: planSnap.id, ...(planSnap.data() as Omit<MembershipPlan, 'id'>) };

  // 2. Pre-checkout policy check
  const totalProspectiveLoans = (member.currentLoansCount || 0) + copyBarcodes.length;
  const borrowCheck = LibraryPolicyEngine.canMemberBorrow(member, plan, totalProspectiveLoans - 1);
  if (!borrowCheck.allowed) {
    throw new Error(borrowCheck.reason);
  }

  // 3. Pre-load copies and books for validation
  const copyDocs: { copy: BookCopy; copyRef: any; book: Book; bookRef: any }[] = [];
  for (const rawBarcode of copyBarcodes) {
    const barcode = rawBarcode.trim();
    const copyQ = query(
      collection(db, 'book_copies'),
      where('tenantId', '==', tenantId),
      where('barcode', '==', barcode),
      fsLimit(1)
    );
    const copySnap = await getDocs(copyQ);
    if (copySnap.empty) {
      throw new Error(`نسخة الكتاب ذات الباركود [${barcode}] غير مسجلة بالنظام.`);
    }

    const cDoc = copySnap.docs[0];
    const copyData = { id: cDoc.id, ...(cDoc.data() as Omit<BookCopy, 'id'>) };

    const bRef = doc(db, 'books', copyData.bookId);
    const bSnap = await getDoc(bRef);
    if (!bSnap.exists()) {
      throw new Error(`العنوان الأصلي للنسخة [${barcode}] غير موجود.`);
    }
    const bookData = { id: bSnap.id, ...(bSnap.data() as Omit<Book, 'id'>) };

    // Verify copy status
    const copyCheck = LibraryPolicyEngine.canCopyBeLoaned(copyData, bookData, memberId);
    if (!copyCheck.allowed) {
      throw new Error(`النسخة [${copyData.barcode} - ${bookData.title}]: ${copyCheck.reason}`);
    }

    copyDocs.push({
      copy: copyData,
      copyRef: cDoc.ref,
      book: bookData,
      bookRef: bRef,
    });
  }

  // 4. Atomic Execution: Create Loan, LoanItems, update Copies, Member, and Book counters
  const now = new Date();
  const checkoutDate = now.toISOString();

  // Determine earliest due date among items
  let earliestDueDate = LibraryPolicyEngine.calculateDueDate(now, plan, copyDocs[0].book);

  const loanCounterRef = doc(db, 'loan_counters', `${tenantId}_${branchId}`);
  const result = await runTransaction(db, async (transaction) => {
    // A. Re-verify patron in transaction
    const transMemberSnap = await transaction.get(memberRef);
    if (!transMemberSnap.exists()) throw new Error('تعذر قراءة بيانات العضو.');
    const liveMember = transMemberSnap.data() as Member;

    // B. Re-verify every copy in transaction to strictly prevent race conditions
    for (const item of copyDocs) {
      const transCopySnap = await transaction.get(item.copyRef);
      if (!transCopySnap.exists()) throw new Error(`النسخة [${item.copy.barcode}] لم تعد متوفرة.`);
      const liveCopy = transCopySnap.data() as BookCopy;
      if (liveCopy.status !== 'available' && liveCopy.reservedForMemberId !== memberId) {
        throw new Error(`النسخة [${item.copy.barcode}] تم تغيير حالتها أو إعارتها في هذه اللحظة.`);
      }
    }

    // C. Atomic Loan Sequence
    const counterSnap = await transaction.get(loanCounterRef);
    let seq = 0;
    if (counterSnap.exists()) {
      seq = Number(counterSnap.data()?.lastSequence || 0);
    }
    const nextSeq = seq + 1;
    transaction.set(loanCounterRef, { lastSequence: nextSeq, updatedAt: checkoutDate }, { merge: true });

    const loanNumber = `LN-${new Date().getFullYear()}-${String(nextSeq).padStart(6, '0')}`;
    const newLoanRef = doc(collection(db, 'loans'));

    const createdLoan: Loan = {
      id: newLoanRef.id,
      tenantId,
      branchId,
      loanNumber,
      memberId,
      memberName: member.fullName,
      memberBarcode: member.barcode,
      employeeId,
      employeeName: employeeName || '',
      checkoutDate,
      dueDate: earliestDueDate,
      returnedAt: null,
      status: 'active',
      totalFine: 0,
      itemsCount: copyDocs.length,
      notes: notes || '',
      createdAt: checkoutDate,
      updatedAt: checkoutDate,
    };

    transaction.set(newLoanRef, createdLoan);

    // D. Create Loan Items and update copy statuses
    const createdItems: LoanItem[] = [];
    for (const item of copyDocs) {
      const itemDueDate = LibraryPolicyEngine.calculateDueDate(now, plan, item.book);
      if (new Date(itemDueDate) < new Date(earliestDueDate)) {
        earliestDueDate = itemDueDate;
      }

      const newItemRef = doc(collection(db, 'loan_items'));
      const loanItem: LoanItem = {
        id: newItemRef.id,
        tenantId,
        loanId: newLoanRef.id,
        bookId: item.book.id,
        bookTitle: item.book.title,
        bookCopyId: item.copy.id,
        copyBarcode: item.copy.barcode,
        copyAccessionNumber: item.copy.accessionNumber,
        checkoutDate,
        dueDate: itemDueDate,
        returnDate: null,
        renewalCount: 0,
        fineAmount: 0,
        status: 'active',
        conditionOnCheckout: item.copy.condition,
        conditionOnReturn: null,
        createdAt: checkoutDate,
        updatedAt: checkoutDate,
      };

      transaction.set(newItemRef, loanItem);
      createdItems.push(loanItem);

      // Update Copy
      transaction.update(item.copyRef, {
        status: 'on_loan',
        currentLoanId: newLoanRef.id,
        reservedForMemberId: null,
        updatedAt: checkoutDate,
      });

      // Update Book Available Count
      const transBookSnap = await transaction.get(item.bookRef);
      if (transBookSnap.exists()) {
        const bData = transBookSnap.data() as Book;
        const currentAvail = bData.availableCopiesCount || 0;
        transaction.update(item.bookRef, {
          availableCopiesCount: Math.max(0, currentAvail - 1),
          updatedAt: checkoutDate,
        });
      }
    }

    // E. Update Member Loans Count
    const currentLoans = liveMember.currentLoansCount || 0;
    transaction.update(memberRef, {
      currentLoansCount: currentLoans + copyDocs.length,
      updatedAt: checkoutDate,
    });

    return { loan: createdLoan, items: createdItems };
  });

  // 5. Asynchronously log book movements
  for (const item of copyDocs) {
    try {
      await addDoc(collection(db, 'book_movements'), {
        tenantId,
        branchId,
        bookCopyId: item.copy.id,
        bookId: item.book.id,
        movementType: 'loaned',
        beforeStatus: 'available',
        afterStatus: 'on_loan',
        beforeShelfId: item.copy.shelfId || '',
        afterShelfId: item.copy.shelfId || '',
        beforeBranchId: branchId,
        afterBranchId: branchId,
        performedBy: employeeId,
        memberId,
        loanId: result.loan.id,
        notes: `إعارة الكتاب بموجب السند رقم ${result.loan.loanNumber}`,
        timestamp: checkoutDate,
      });
    } catch (err) {
      console.warn('[Circulation] Error logging movement:', err);
    }
  }

  return result;
}

export async function getActiveLoans(tenantId: string, branchId?: string | null): Promise<Loan[]> {
  if (!tenantId) return [];
  const constraints = [
    where('tenantId', '==', tenantId),
    where('status', 'in', ['active', 'partially_returned', 'overdue']),
  ];
  if (branchId && branchId !== 'all') {
    constraints.push(where('branchId', '==', branchId));
  }
  const q = query(collection(db, 'loans'), ...constraints);
  const snap = await getDocs(q);
  const loans = snap.docs.map((d) => ({ id: d.id, ...(d.data() as Omit<Loan, 'id'>) }));
  loans.sort((a, b) => new Date(a.dueDate).getTime() - new Date(b.dueDate).getTime());
  return loans;
}
