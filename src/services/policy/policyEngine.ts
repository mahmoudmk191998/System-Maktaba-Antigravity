import type {
  Member,
  MembershipPlan,
  Book,
  BookCopy,
  Loan,
  LoanItem,
} from '@/types/library.types';

export interface BorrowEligibilityResult {
  allowed: boolean;
  reason?: string;
}

export interface RenewalEligibilityResult {
  allowed: boolean;
  reason?: string;
  newDueDate?: string;
}

export interface FineCalculationResult {
  overdueDays: number;
  gracePeriodDays: number;
  billableDays: number;
  finePerDay: number;
  totalFine: number;
  isCapped: boolean;
}

export class LibraryPolicyEngine {
  /**
   * Calculates the exact Due Date based on patron Membership Plan and Book Special Collections.
   * Priority:
   * 1. Book isReferenceOnly: Throws / blocks checkout
   * 2. Book loanPeriodOverrideDays (if specified on the book record)
   * 3. Book isShortLoan (defaults to 3 days unless overridden)
   * 4. Patron Membership Plan loanDurationDays
   */
  static calculateDueDate(
    checkoutDate: Date | string,
    plan: MembershipPlan,
    book: Book
  ): string {
    if (book.isReferenceOnly) {
      throw new Error('الكتاب مخصص للمطالعة الداخلية فقط ولا يمكن إعارته (Reference Only).');
    }

    const start = typeof checkoutDate === 'string' ? new Date(checkoutDate) : new Date(checkoutDate.getTime());
    let durationDays = plan.loanDurationDays || 14;

    if (book.loanPeriodOverrideDays && book.loanPeriodOverrideDays > 0) {
      durationDays = book.loanPeriodOverrideDays;
    } else if (book.isShortLoan) {
      durationDays = 3;
    }

    const due = new Date(start.getTime());
    due.setDate(due.getDate() + durationDays);
    due.setHours(23, 59, 59, 999);
    return due.toISOString();
  }

  /**
   * Verifies whether a patron is eligible to borrow additional books.
   */
  static canMemberBorrow(
    member: Member,
    plan: MembershipPlan,
    currentLoansCount?: number
  ): BorrowEligibilityResult {
    // 1. Account Status
    if (member.status === 'suspended') {
      return { allowed: false, reason: 'حساب العضو معلق مؤقتاً من قبل الإدارة.' };
    }
    if (member.status === 'blocked') {
      return { allowed: false, reason: 'حساب العضو محظور بسبب مخالفات سابقة.' };
    }
    if (member.status === 'expired') {
      return { allowed: false, reason: 'العضوية منتهية الصلاحية، يرجى التجديد أولاً.' };
    }

    // 2. Date Expiration
    const now = new Date();
    if (new Date(member.expiryDate) < now) {
      return { allowed: false, reason: 'انتهت صلاحية اشتراك العضوية، يلزم سداد رسوم التجديد.' };
    }

    // 3. Outstanding Unpaid Fines Block
    const maxFineAllowed = plan.maxFineAmount > 0 ? plan.maxFineAmount : 50;
    if (member.outstandingFine > maxFineAllowed) {
      return {
        allowed: false,
        reason: `يوجد على العضو غرامات غير مسددة بقيمة (${member.outstandingFine} ج.م) تتجاوز الحد المسموح به للإعارة (${maxFineAllowed} ج.م).`,
      };
    }

    // 4. Max Books Limit
    const activeLoans = currentLoansCount !== undefined ? currentLoansCount : (member.currentLoansCount || 0);
    const maxAllowed = member.maxBooksAllowed || plan.maxBooks || 3;
    if (activeLoans >= maxAllowed) {
      return {
        allowed: false,
        reason: `بلغ العضو الحد الأقصى المسموح به للكتب المعارة في وقت واحد (${maxAllowed} كتاب).`,
      };
    }

    return { allowed: true };
  }

  /**
   * Verifies if a book copy is eligible for checkout
   */
  static canCopyBeLoaned(
    copy: BookCopy,
    book: Book,
    requestingMemberId: string
  ): BorrowEligibilityResult {
    if (book.isReferenceOnly) {
      return { allowed: false, reason: 'هذا العنوان مصنف كمرجع غير قابل للإعارة الخارجية.' };
    }

    if (copy.status === 'on_loan') {
      return { allowed: false, reason: 'هذه النسخة معارة حالياً لمستعير آخر.' };
    }

    if (copy.status === 'reserved') {
      if (copy.reservedForMemberId && copy.reservedForMemberId !== requestingMemberId) {
        return { allowed: false, reason: 'هذه النسخة محجوزة مسبقاً لعضو آخر على قائمة الانتظار.' };
      }
    }

    if (copy.status === 'lost') {
      return { allowed: false, reason: 'هذه النسخة مسجلة كمفقودة ولا يمكن إعارتها.' };
    }

    if (copy.status === 'damaged') {
      return { allowed: false, reason: 'هذه النسخة تالفة وتحت الصيانة.' };
    }

    if (copy.status === 'maintenance' || copy.status === 'processing') {
      return { allowed: false, reason: 'النسخة قيد التجهيز الفني أو الصيانة.' };
    }

    if (copy.status === 'withdrawn') {
      return { allowed: false, reason: 'تم استبعاد هذه النسخة من التداول بالمكتبة.' };
    }

    return { allowed: true };
  }

  /**
   * Determines if an active loan item can be renewed.
   */
  static canRenewLoan(
    loan: Loan,
    loanItem: LoanItem,
    book: Book,
    plan: MembershipPlan,
    hasActiveHold: boolean = false
  ): RenewalEligibilityResult {
    if (loan.status !== 'active' && loan.status !== 'overdue') {
      return { allowed: false, reason: 'لا يمكن تجديد إعارة غير نشطة أو مغلقة.' };
    }

    if (loanItem.status !== 'active' && loanItem.status !== 'overdue') {
      return { allowed: false, reason: 'لا يمكن تجديد بند تم إرجاعه أو مفقود.' };
    }

    if (book.isShortLoan) {
      return { allowed: false, reason: 'الكتب ذات الإعارة القصيرة غير قابلة للتجديد.' };
    }

    // Hold Conflict Check
    if (hasActiveHold) {
      return {
        allowed: false,
        reason: 'لا يمكن التجديد لوجود حجز مسبق وقائمة انتظار على هذا الكتاب لعضو آخر.',
      };
    }

    // Max Renewals Check
    const currentRenewals = loanItem.renewalCount || 0;
    const maxRenewals = plan.maxRenewals || 1;
    if (currentRenewals >= maxRenewals) {
      return {
        allowed: false,
        reason: `تم استنفاد الحد الأقصى لمرات التجديد المسموح بها لهذه الخطة (${maxRenewals} مرة).`,
      };
    }

    // Compute next due date based on current due date
    const currentDue = new Date(loanItem.dueDate);
    const duration = plan.loanDurationDays || 14;
    const nextDue = new Date(currentDue.getTime());
    nextDue.setDate(nextDue.getDate() + duration);

    return {
      allowed: true,
      newDueDate: nextDue.toISOString(),
    };
  }

  /**
   * Calculates overdue fines with grace period and maximum capping
   */
  static calculateOverdueFine(
    dueDate: Date | string,
    returnDate: Date | string = new Date(),
    plan: MembershipPlan
  ): FineCalculationResult {
    const due = typeof dueDate === 'string' ? new Date(dueDate) : dueDate;
    const returned = typeof returnDate === 'string' ? new Date(returnDate) : returnDate;

    // Use UTC date coordinates to evaluate pure calendar day boundaries independently of server timezone
    const d1 = Date.UTC(due.getUTCFullYear(), due.getUTCMonth(), due.getUTCDate());
    const d2 = Date.UTC(returned.getUTCFullYear(), returned.getUTCMonth(), returned.getUTCDate());

    const diffTime = d2 - d1;
    const overdueDays = Math.max(0, Math.floor(diffTime / (1000 * 60 * 60 * 24)));

    const grace = plan.gracePeriodDays || 0;
    const fineRate = plan.finePerDay || 0;
    const maxCap = plan.maxFineAmount || 0;

    if (overdueDays <= grace) {
      return {
        overdueDays,
        gracePeriodDays: grace,
        billableDays: 0,
        finePerDay: fineRate,
        totalFine: 0,
        isCapped: false,
      };
    }

    const billableDays = overdueDays - grace;
    let computedFine = billableDays * fineRate;
    let isCapped = false;

    if (maxCap > 0 && computedFine > maxCap) {
      computedFine = maxCap;
      isCapped = true;
    }

    return {
      overdueDays,
      gracePeriodDays: grace,
      billableDays,
      finePerDay: fineRate,
      totalFine: Number(computedFine.toFixed(2)),
      isCapped,
    };
  }

  /**
   * Calculates lost book replacement fee
   */
  static calculateLostBookCharge(
    copy: BookCopy,
    processingFee: number = 25
  ): number {
    const basePrice = Number(copy.purchasePrice) > 0 ? Number(copy.purchasePrice) : 100;
    return Number((basePrice + processingFee).toFixed(2));
  }

  /**
   * Calculates damaged book fee according to severity
   */
  static calculateDamagedBookCharge(
    copy: BookCopy,
    severity: 'minor' | 'major' | 'total',
    rebindFee: number = 30
  ): number {
    const basePrice = Number(copy.purchasePrice) > 0 ? Number(copy.purchasePrice) : 100;
    if (severity === 'minor') return Number(rebindFee.toFixed(2));
    if (severity === 'major') return Number((basePrice * 0.5 + rebindFee).toFixed(2));
    return Number((basePrice + rebindFee).toFixed(2));
  }
}
