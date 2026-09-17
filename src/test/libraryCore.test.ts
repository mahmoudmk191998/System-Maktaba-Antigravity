import { describe, it, expect } from 'vitest';
import { LibraryPolicyEngine } from '@/services/policy/policyEngine';
import { AccessionNumberGenerator } from '@/services/catalog/accessionNumber';
import type {
  Member,
  MembershipPlan,
  Book,
  BookCopy,
  Loan,
  LoanItem,
} from '@/types/library.types';

describe('Library Core Subsystem Tests: Policy Engine & Accession Numbers', () => {
  const samplePlan: MembershipPlan = {
    id: 'plan_student',
    tenantId: 'tenant_lib_1',
    name: 'خطة الطلاب',
    nameEn: 'Student Plan',
    maxBooks: 4,
    loanDurationDays: 14,
    maxRenewals: 2,
    reservationLimit: 2,
    finePerDay: 5,
    gracePeriodDays: 2,
    maxFineAmount: 100,
    membershipFee: 50,
    durationMonths: 12,
    active: true,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };

  const sampleMember: Member = {
    id: 'mem_1',
    tenantId: 'tenant_lib_1',
    memberNumber: 'MEM-0001',
    barcode: '20260001001',
    fullName: 'يوسف أحمد',
    phone: '01012345678',
    membershipPlanId: 'plan_student',
    joinDate: '2026-01-01',
    expiryDate: '2027-01-01',
    status: 'active',
    maxBooksAllowed: 4,
    outstandingFine: 0,
    currentLoansCount: 1,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };

  const sampleBook: Book = {
    id: 'book_clean_code',
    tenantId: 'tenant_lib_1',
    title: 'Clean Code',
    language: 'Arabic',
    authorIds: ['auth_robert'],
    categoryIds: ['cat_software'],
    status: 'active',
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };

  const sampleCopy: BookCopy = {
    id: 'copy_101',
    tenantId: 'tenant_lib_1',
    bookId: 'book_clean_code',
    branchId: 'branch_main',
    barcode: 'BC101001',
    accessionNumber: 'LIB-MAIN-2026-000001',
    acquisitionDate: '2026-02-01',
    purchasePrice: 250,
    condition: 'good',
    status: 'available',
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };

  describe('1. Due Date Calculation & Special Collections Rules', () => {
    it('calculates standard loan period based on membership plan (14 days)', () => {
      const checkoutDate = new Date('2026-09-01T10:00:00.000Z');
      const dueDateIso = LibraryPolicyEngine.calculateDueDate(checkoutDate, samplePlan, sampleBook);
      const dueDate = new Date(dueDateIso);

      expect(dueDate.getDate()).toBe(15); // Sept 1 + 14 days = Sept 15
      expect(dueDate.getMonth()).toBe(8); // September (0-indexed 8)
    });

    it('respects short loan books with a 3-day restriction', () => {
      const shortBook: Book = { ...sampleBook, isShortLoan: true };
      const checkoutDate = new Date('2026-09-01T10:00:00.000Z');
      const dueDateIso = LibraryPolicyEngine.calculateDueDate(checkoutDate, samplePlan, shortBook);
      const dueDate = new Date(dueDateIso);

      expect(dueDate.getDate()).toBe(4); // Sept 1 + 3 days = Sept 4
    });

    it('respects custom loanPeriodOverrideDays configured on a specific book title', () => {
      const customBook: Book = { ...sampleBook, loanPeriodOverrideDays: 7 };
      const checkoutDate = new Date('2026-09-01T10:00:00.000Z');
      const dueDateIso = LibraryPolicyEngine.calculateDueDate(checkoutDate, samplePlan, customBook);
      const dueDate = new Date(dueDateIso);

      expect(dueDate.getDate()).toBe(8); // Sept 1 + 7 days = Sept 8
    });

    it('strictly throws an exception for Reference Only titles', () => {
      const refBook: Book = { ...sampleBook, isReferenceOnly: true };
      const checkoutDate = new Date('2026-09-01T10:00:00.000Z');

      expect(() => {
        LibraryPolicyEngine.calculateDueDate(checkoutDate, samplePlan, refBook);
      }).toThrow(/Reference Only/);
    });
  });

  describe('2. Patron Borrowing Eligibility Rules', () => {
    it('allows an active patron in good standing to borrow', () => {
      const result = LibraryPolicyEngine.canMemberBorrow(sampleMember, samplePlan, 1);
      expect(result.allowed).toBe(true);
    });

    it('rejects suspended patrons with clear explanation', () => {
      const suspendedMember: Member = { ...sampleMember, status: 'suspended' };
      const result = LibraryPolicyEngine.canMemberBorrow(suspendedMember, samplePlan, 0);
      expect(result.allowed).toBe(false);
      expect(result.reason).toContain('معلق');
    });

    it('rejects expired subscriptions', () => {
      const expiredMember: Member = { ...sampleMember, expiryDate: '2025-01-01' };
      const result = LibraryPolicyEngine.canMemberBorrow(expiredMember, samplePlan, 0);
      expect(result.allowed).toBe(false);
      expect(result.reason).toContain('انتهت صلاحية اشتراك');
    });

    it('blocks borrowing when patron reaches their maximum books limit', () => {
      const result = LibraryPolicyEngine.canMemberBorrow(sampleMember, samplePlan, 4); // Max is 4
      expect(result.allowed).toBe(false);
      expect(result.reason).toContain('الحد الأقصى');
    });

    it('blocks borrowing when patron has excessive outstanding fines', () => {
      const fineMember: Member = { ...sampleMember, outstandingFine: 150 }; // Max fine is 100
      const result = LibraryPolicyEngine.canMemberBorrow(fineMember, samplePlan, 0);
      expect(result.allowed).toBe(false);
      expect(result.reason).toContain('غرامات غير مسددة');
    });
  });

  describe('3. Physical Copy Status Verification', () => {
    it('allows an available copy to be loaned', () => {
      const result = LibraryPolicyEngine.canCopyBeLoaned(sampleCopy, sampleBook, 'mem_1');
      expect(result.allowed).toBe(true);
    });

    it('rejects a copy that is already on loan', () => {
      const onLoanCopy: BookCopy = { ...sampleCopy, status: 'on_loan' };
      const result = LibraryPolicyEngine.canCopyBeLoaned(onLoanCopy, sampleBook, 'mem_1');
      expect(result.allowed).toBe(false);
      expect(result.reason).toContain('معارة حالياً');
    });

    it('rejects a copy reserved for another patron', () => {
      const reservedCopy: BookCopy = { ...sampleCopy, status: 'reserved', reservedForMemberId: 'mem_other' };
      const result = LibraryPolicyEngine.canCopyBeLoaned(reservedCopy, sampleBook, 'mem_1');
      expect(result.allowed).toBe(false);
      expect(result.reason).toContain('محجوزة مسبقاً لعضو آخر');
    });

    it('allows a reserved copy if the requester is the one who placed the hold', () => {
      const reservedCopy: BookCopy = { ...sampleCopy, status: 'reserved', reservedForMemberId: 'mem_1' };
      const result = LibraryPolicyEngine.canCopyBeLoaned(reservedCopy, sampleBook, 'mem_1');
      expect(result.allowed).toBe(true);
    });

    it('rejects lost or damaged copies', () => {
      const lostCopy: BookCopy = { ...sampleCopy, status: 'lost' };
      const damagedCopy: BookCopy = { ...sampleCopy, status: 'damaged' };

      expect(LibraryPolicyEngine.canCopyBeLoaned(lostCopy, sampleBook, 'mem_1').allowed).toBe(false);
      expect(LibraryPolicyEngine.canCopyBeLoaned(damagedCopy, sampleBook, 'mem_1').allowed).toBe(false);
    });
  });

  describe('4. Renewal Engine & Hold Conflicts', () => {
    const activeLoan: Loan = {
      id: 'loan_1',
      tenantId: 'tenant_lib_1',
      branchId: 'branch_main',
      loanNumber: 'LN-0001',
      memberId: 'mem_1',
      employeeId: 'emp_1',
      checkoutDate: '2026-09-01T12:00:00.000Z',
      dueDate: '2026-09-15T12:00:00.000Z',
      status: 'active',
      totalFine: 0,
      itemsCount: 1,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };

    const activeLoanItem: LoanItem = {
      id: 'item_1',
      tenantId: 'tenant_lib_1',
      loanId: 'loan_1',
      bookId: 'book_clean_code',
      bookTitle: 'Clean Code',
      bookCopyId: 'copy_101',
      copyBarcode: 'BC101001',
      copyAccessionNumber: 'LIB-MAIN-2026-000001',
      checkoutDate: '2026-09-01T12:00:00.000Z',
      dueDate: '2026-09-15T12:00:00.000Z',
      renewalCount: 0,
      fineAmount: 0,
      status: 'active',
      conditionOnCheckout: 'good',
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };

    it('allows renewal and computes new due date when limits are respected', () => {
      const result = LibraryPolicyEngine.canRenewLoan(activeLoan, activeLoanItem, sampleBook, samplePlan, false);
      expect(result.allowed).toBe(true);
      expect(result.newDueDate).toBeDefined();

      const newDue = new Date(result.newDueDate!);
      expect(newDue.getDate()).toBe(29); // Sept 15 + 14 = Sept 29
    });

    it('blocks renewal when another member has placed an active hold', () => {
      const result = LibraryPolicyEngine.canRenewLoan(activeLoan, activeLoanItem, sampleBook, samplePlan, true);
      expect(result.allowed).toBe(false);
      expect(result.reason).toContain('حجز مسبق');
    });

    it('blocks renewal when the maximum renewal count is reached', () => {
      const maxedItem: LoanItem = { ...activeLoanItem, renewalCount: 2 }; // Max is 2
      const result = LibraryPolicyEngine.canRenewLoan(activeLoan, maxedItem, sampleBook, samplePlan, false);
      expect(result.allowed).toBe(false);
      expect(result.reason).toContain('استنفاد الحد الأقصى');
    });
  });

  describe('5. Overdue Fines Calculation & Grace Periods', () => {
    it('applies zero fine when return is within the grace period', () => {
      // Due on Sept 10, returned on Sept 12 (2 days late, grace is 2 days)
      const due = '2026-09-10T23:59:59.000Z';
      const returned = '2026-09-12T10:00:00.000Z';

      const calc = LibraryPolicyEngine.calculateOverdueFine(due, returned, samplePlan);
      expect(calc.overdueDays).toBe(2);
      expect(calc.billableDays).toBe(0);
      expect(calc.totalFine).toBe(0);
    });

    it('charges only for days exceeding the grace period', () => {
      // Due on Sept 10, returned on Sept 15 (5 days late, grace 2 days => 3 billable days * 5 = 15)
      const due = '2026-09-10T23:59:59.000Z';
      const returned = '2026-09-15T10:00:00.000Z';

      const calc = LibraryPolicyEngine.calculateOverdueFine(due, returned, samplePlan);
      expect(calc.overdueDays).toBe(5);
      expect(calc.billableDays).toBe(3);
      expect(calc.totalFine).toBe(15);
      expect(calc.isCapped).toBe(false);
    });

    it('caps fine at maximum limit if configured', () => {
      // 100 days overdue * 5 = 500, but cap is 100
      const due = '2026-05-01T23:59:59.000Z';
      const returned = '2026-09-01T10:00:00.000Z';

      const calc = LibraryPolicyEngine.calculateOverdueFine(due, returned, samplePlan);
      expect(calc.totalFine).toBe(100);
      expect(calc.isCapped).toBe(true);
    });
  });

  describe('6. Accession Number Parsing & Format Validation', () => {
    it('validates and parses standard accession numbers correctly', () => {
      const parsed = AccessionNumberGenerator.parse('LIB-CAR-2026-000042');
      expect(parsed.valid).toBe(true);
      expect(parsed.prefix).toBe('LIB');
      expect(parsed.branchCode).toBe('CAR');
      expect(parsed.year).toBe(2026);
      expect(parsed.sequence).toBe(42);
    });

    it('rejects malformed accession numbers', () => {
      expect(AccessionNumberGenerator.parse('INVALID-NUMBER').valid).toBe(false);
      expect(AccessionNumberGenerator.parse('LIB-2026-1').valid).toBe(false);
    });
  });
});
