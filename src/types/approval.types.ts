/**
 * Approval Engine Types & Schema
 * Unified governance foundation for high-value orders, discounts, refunds,
 * inventory adjustments, credit overrides, and financial entries.
 */

export type ApprovalWorkflowType =
  | 'high_value_purchase_order'
  | 'large_discount'
  | 'sale_below_minimum'
  | 'large_refund'
  | 'inventory_adjustment'
  | 'damage_loss'
  | 'supplier_payment'
  | 'customer_credit_override'
  | 'journal_entry'
  | 'period_reopen'
  | 'backup_restore'
  | 'sensitive_settings_change';

export type ApprovalStatus = 'pending' | 'approved' | 'rejected' | 'cancelled';

export interface ApprovalActionRecord {
  actorId: string;
  actorName: string;
  actorRole: string;
  action: 'approve' | 'reject' | 'request_changes' | 'cancel';
  timestamp: string;
  comment?: string;
  stepNumber: number;
}

export interface ApprovalStep {
  stepNumber: number;
  stepName: string;
  requiredRole: string; // e.g. 'manager', 'owner', 'accountant'
  status: ApprovalStatus;
  actionRecord?: ApprovalActionRecord;
}

export interface ApprovalRequest {
  id: string;
  tenantId: string;
  branchId?: string | null;
  workflowType: ApprovalWorkflowType;
  entityType: string; // e.g. 'purchase_order', 'sale', 'sale_return', 'customer', 'journal_entry'
  entityId: string;
  entityNumberSnapshot?: string; // e.g. 'PO-HQ-2026-000001'
  requestedBy: string;
  requesterNameSnapshot: string;
  requestedAt: string;
  amount?: number;
  currency?: string;
  status: ApprovalStatus;
  currentStep: number;
  totalSteps: number;
  steps: ApprovalStep[];
  contextSnapshot: Record<string, any>;
  notes?: string;
  completedAt?: string | null;
  cancelledAt?: string | null;
}

export interface ApprovalThresholdConfig {
  purchaseApprovalThreshold: number; // e.g. 10000 EGP
  refundApprovalThreshold: number;   // e.g. 500 EGP
  discountApprovalThreshold: number; // e.g. 15% or 300 EGP
  inventoryAdjustmentThreshold: number; // e.g. 1000 EGP
  paymentApprovalThreshold: number;  // e.g. 25000 EGP
  allowSelfApproval: boolean;        // Default: false
}
