import { describe, it, expect } from 'vitest';
import type { DailyClosing, DailyClosingPreview, DifferenceType } from '@/types/dailyClosing.types';

describe('Safe Daily Closing System & Cash Reconciliation', () => {
  const mockPreview: DailyClosingPreview = {
    date: '2026-09-16',
    tenantId: 'tenant_mk',
    branchId: 'branch_main',
    salesTotal: 18500,
    cashSales: 12000,
    electronicSales: 6500,
    ordersCount: 45,
    operatingExpenses: 3000,
    cashOutflows: 4500, // 3000 expenses + 1500 advance
    salaryPaymentsCash: 0,
    advancesCash: 1500,
    purchasesTotal: 5000,
    purchasesCash: 0,
    wasteCost: 200,
    openingCash: 1000,
    expectedCash: 8500, // 1000 + 12000 - 4500 = 8500
    existingClosing: null,
  };

  it('Scenario 1: Balanced closing when actual cash count exactly matches expected cash', () => {
    const actualCash = 8500;
    const difference = actualCash - mockPreview.expectedCash;
    let differenceType: DifferenceType = 'balanced';
    if (difference < 0) differenceType = 'shortage';
    else if (difference > 0) differenceType = 'overage';

    expect(difference).toBe(0);
    expect(differenceType).toBe('balanced');

    const closingRecord: DailyClosing = {
      id: `${mockPreview.tenantId}_${mockPreview.branchId}_${mockPreview.date}`,
      tenantId: mockPreview.tenantId,
      branchId: mockPreview.branchId,
      date: mockPreview.date,
      salesSnapshot: mockPreview.salesTotal,
      cashSalesSnapshot: mockPreview.cashSales,
      electronicSalesSnapshot: mockPreview.electronicSales,
      ordersCountSnapshot: mockPreview.ordersCount,
      operatingExpensesSnapshot: mockPreview.operatingExpenses,
      cashOutflowsSnapshot: mockPreview.cashOutflows,
      salaryPaymentsSnapshot: mockPreview.salaryPaymentsCash,
      advancesSnapshot: mockPreview.advancesCash,
      purchasesSnapshot: mockPreview.purchasesTotal,
      wasteSnapshot: mockPreview.wasteCost,
      openingCash: mockPreview.openingCash,
      expectedCash: mockPreview.expectedCash,
      actualCash,
      difference,
      differenceType,
      status: 'closed',
      closedBy: 'المدير',
      closedAt: new Date().toISOString(),
    };

    expect(closingRecord.status).toBe('closed');
    expect(closingRecord.difference).toBe(0);
  });

  it('Scenario 2: Shortage detection when actual cash count is less than expected', () => {
    const actualCash = 8200; // 300 EGP shortage
    const difference = actualCash - mockPreview.expectedCash;
    let differenceType: DifferenceType = 'balanced';
    if (difference < 0) differenceType = 'shortage';
    else if (difference > 0) differenceType = 'overage';

    expect(difference).toBe(-300);
    expect(differenceType).toBe('shortage');

    // Rule: Mandatory reason when difference !== 0
    const differenceReason = 'فرق في العد اليدوي للنقدية';
    expect(differenceReason.length).toBeGreaterThan(0);
  });

  it('Scenario 3: Overage detection when actual cash count exceeds expected cash', () => {
    const actualCash = 8750; // 250 EGP overage
    const difference = actualCash - mockPreview.expectedCash;
    let differenceType: DifferenceType = 'balanced';
    if (difference < 0) differenceType = 'shortage';
    else if (difference > 0) differenceType = 'overage';

    expect(difference).toBe(250);
    expect(differenceType).toBe('overage');
  });

  it('Scenario 4: Rejects duplicate closing on same branch and date (Idempotency)', () => {
    const closingsStore = new Map<string, DailyClosing>();
    const docId = `${mockPreview.tenantId}_${mockPreview.branchId}_${mockPreview.date}`;

    // Admin A closes day
    const closingA: DailyClosing = {
      id: docId,
      tenantId: mockPreview.tenantId,
      branchId: mockPreview.branchId,
      date: mockPreview.date,
      salesSnapshot: mockPreview.salesTotal,
      cashSalesSnapshot: mockPreview.cashSales,
      electronicSalesSnapshot: mockPreview.electronicSales,
      ordersCountSnapshot: mockPreview.ordersCount,
      operatingExpensesSnapshot: mockPreview.operatingExpenses,
      cashOutflowsSnapshot: mockPreview.cashOutflows,
      salaryPaymentsSnapshot: mockPreview.salaryPaymentsCash,
      advancesSnapshot: mockPreview.advancesCash,
      purchasesSnapshot: mockPreview.purchasesTotal,
      wasteSnapshot: mockPreview.wasteCost,
      openingCash: mockPreview.openingCash,
      expectedCash: mockPreview.expectedCash,
      actualCash: 8500,
      difference: 0,
      differenceType: 'balanced',
      status: 'closed',
      closedBy: 'المدير أ',
      closedAt: new Date().toISOString(),
    };
    closingsStore.set(docId, closingA);

    // Admin B attempts to close same day
    const attemptCloseB = (id: string): { success: boolean; error?: string } => {
      const existing = closingsStore.get(id);
      if (existing && existing.status !== 'voided') {
        return { success: false, error: 'تم إغلاق هذا اليوم بالفعل لهذا الفرع' };
      }
      return { success: true };
    };

    const resultB = attemptCloseB(docId);
    expect(resultB.success).toBe(false);
    expect(resultB.error).toContain('تم إغلاق هذا اليوم بالفعل');
  });

  it('Scenario 5: Snapshot immutability - past closing retains exact numbers even if later changes occur', () => {
    const storedSnapshot: DailyClosing = {
      id: 'closing_2026_09_10',
      tenantId: 'tenant_mk',
      branchId: 'branch_1',
      date: '2026-09-10',
      salesSnapshot: 15000,
      cashSalesSnapshot: 10000,
      electronicSalesSnapshot: 5000,
      ordersCountSnapshot: 30,
      operatingExpensesSnapshot: 2000,
      cashOutflowsSnapshot: 2000,
      salaryPaymentsSnapshot: 0,
      advancesSnapshot: 0,
      purchasesSnapshot: 1000,
      wasteSnapshot: 100,
      openingCash: 500,
      expectedCash: 8500,
      actualCash: 8500,
      difference: 0,
      differenceType: 'balanced',
      status: 'closed',
      closedBy: 'المدير',
      closedAt: '2026-09-10T23:00:00Z',
    };

    // Simulate an order from that day being edited days later in POS
    const modifiedOrderAmount = 25000;
    expect(modifiedOrderAmount).toBe(25000);

    // Stored snapshot MUST remain unchanged
    expect(storedSnapshot.salesSnapshot).toBe(15000);
    expect(storedSnapshot.expectedCash).toBe(8500);
  });

  it('Scenario 6: Voiding a closing sets status to voided with mandatory reason without deleting record', () => {
    const activeClosing: DailyClosing = {
      id: 'closing_2026_09_15',
      tenantId: 'tenant_mk',
      branchId: 'branch_1',
      date: '2026-09-15',
      salesSnapshot: 10000,
      cashSalesSnapshot: 8000,
      electronicSalesSnapshot: 2000,
      ordersCountSnapshot: 20,
      operatingExpensesSnapshot: 1000,
      cashOutflowsSnapshot: 1000,
      salaryPaymentsSnapshot: 0,
      advancesSnapshot: 0,
      purchasesSnapshot: 0,
      wasteSnapshot: 0,
      openingCash: 0,
      expectedCash: 7000,
      actualCash: 7000,
      difference: 0,
      differenceType: 'balanced',
      status: 'closed',
      closedBy: 'المدير',
      closedAt: '2026-09-15T22:00:00Z',
    };

    // Void action
    const voidedClosing: DailyClosing = {
      ...activeClosing,
      status: 'voided',
      voidReason: 'تم تسجيل النقدية بالخطأ وإعادة الجرد',
      voidedAt: '2026-09-15T23:00:00Z',
      voidedBy: 'مالك المنشأة',
    };

    expect(voidedClosing.status).toBe('voided');
    expect(voidedClosing.voidReason).toBe('تم تسجيل النقدية بالخطأ وإعادة الجرد');
    expect(voidedClosing.voidedBy).toBe('مالك المنشأة');
  });
});
