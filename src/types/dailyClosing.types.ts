export type DifferenceType = 'balanced' | 'shortage' | 'overage';

export type DailyClosingStatus = 'closed' | 'needs_review' | 'voided';

export interface DailyClosing {
  id: string; // ${tenantId}_${branchId}_${date}
  tenantId: string;
  branchId: string;
  branchName?: string;
  date: string; // YYYY-MM-DD
  
  // Sales Snapshots
  salesSnapshot: number;
  cashSalesSnapshot: number;
  electronicSalesSnapshot: number;
  ordersCountSnapshot: number;

  // Outflows & Operational Snapshots
  operatingExpensesSnapshot: number;
  cashOutflowsSnapshot: number;
  salaryPaymentsSnapshot: number;
  advancesSnapshot: number;
  purchasesSnapshot: number;
  supplierPaymentsSnapshot?: number;
  wasteSnapshot: number;

  // Cash Reconciliation
  openingCash: number;
  expectedCash: number;
  actualCash: number;
  difference: number;
  differenceType: DifferenceType;
  differenceReason?: string;
  notes?: string;

  // Audit & Status
  status: DailyClosingStatus;
  closedBy: string;
  closedAt: string; // ISO 8601
  updatedAt?: string;
  updatedBy?: string;
  voidReason?: string;
  voidedAt?: string;
  voidedBy?: string;
}

export interface DailyClosingPreview {
  date: string;
  tenantId: string;
  branchId: string;
  
  // Real-time aggregates
  salesTotal: number;
  cashSales: number;
  electronicSales: number;
  ordersCount: number;

  operatingExpenses: number;
  cashOutflows: number;
  salaryPaymentsCash: number;
  advancesCash: number;
  purchasesTotal: number;
  purchasesCash: number;
  wasteCost: number;

  openingCash: number;
  expectedCash: number;
  
  existingClosing: DailyClosing | null;
  hasPostClosingModifications?: boolean;
}
