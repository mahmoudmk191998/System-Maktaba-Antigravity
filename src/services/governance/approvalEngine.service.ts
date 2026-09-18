/**
 * Unified Governance & Multi-Step Approval Engine Service
 * Provides single, deterministic approval architecture across all ERP modules:
 * High-value POs, Large Discounts, Below-minimum Sales, Large Refunds,
 * Inventory Adjustments, Damage/Loss, Supplier Payments, and Credit Overrides.
 */

import { db } from '@/lib/firebase';
import {
  collection,
  doc,
  getDoc,
  getDocs,
  setDoc,
  updateDoc,
  query,
  where,
} from 'firebase/firestore';
import type {
  ApprovalRequest,
  ApprovalStep,
  ApprovalWorkflowType,
  ApprovalStatus,
  ApprovalThresholdConfig,
  ApprovalActionRecord,
} from '@/types/approval.types';

export const DEFAULT_APPROVAL_THRESHOLDS: ApprovalThresholdConfig = {
  purchaseApprovalThreshold: 10000,
  refundApprovalThreshold: 500,
  discountApprovalThreshold: 300,
  inventoryAdjustmentThreshold: 1000,
  paymentApprovalThreshold: 25000,
  allowSelfApproval: false,
};

export interface CreateApprovalInput {
  tenantId: string;
  branchId?: string | null;
  workflowType: ApprovalWorkflowType;
  entityType: string;
  entityId: string;
  entityNumberSnapshot?: string;
  requestedBy: string;
  requesterNameSnapshot: string;
  amount?: number;
  currency?: string;
  contextSnapshot: Record<string, any>;
  notes?: string;
}

export interface ProcessActionInput {
  tenantId: string;
  requestId: string;
  actorId: string;
  actorName: string;
  actorRole: string;
  action: 'approve' | 'reject' | 'cancel';
  comment?: string;
}

/**
 * Fetch Approval Threshold Settings for Tenant
 */
export async function getApprovalSettings(tenantId: string): Promise<ApprovalThresholdConfig> {
  const docRef = doc(db, 'approval_settings', tenantId);
  const snap = await getDoc(docRef);
  if (snap.exists()) {
    return { ...DEFAULT_APPROVAL_THRESHOLDS, ...snap.data() } as ApprovalThresholdConfig;
  }
  return DEFAULT_APPROVAL_THRESHOLDS;
}

/**
 * Create a new Approval Request with multi-step pipeline and self-approval rules
 */
export async function createApprovalRequest(input: CreateApprovalInput): Promise<ApprovalRequest> {
  const {
    tenantId,
    branchId = null,
    workflowType,
    entityType,
    entityId,
    entityNumberSnapshot,
    requestedBy,
    requesterNameSnapshot,
    amount,
    currency = 'EGP',
    contextSnapshot,
    notes,
  } = input;

  const settings = await getApprovalSettings(tenantId);
  const now = new Date().toISOString();

  // Define Steps based on Workflow and Amount
  const steps: ApprovalStep[] = [];
  const reqAmount = amount || 0;

  // Step 1: Always Manager / Operational Lead
  steps.push({
    stepNumber: 1,
    stepName: 'موافقة مدير الفرع / التشغيل',
    requiredRole: 'manager',
    status: 'pending',
  });

  // Step 2: High value escalation to Owner / Admin if exceeds threshold
  let requiresOwnerEscalation = false;
  switch (workflowType) {
    case 'high_value_purchase_order':
      requiresOwnerEscalation = reqAmount >= settings.purchaseApprovalThreshold * 2;
      break;
    case 'supplier_payment':
      requiresOwnerEscalation = reqAmount >= settings.paymentApprovalThreshold * 2;
      break;
    case 'large_refund':
      requiresOwnerEscalation = reqAmount >= settings.refundApprovalThreshold * 3;
      break;
    case 'backup_restore':
    case 'sensitive_settings_change':
    case 'period_reopen':
      requiresOwnerEscalation = true;
      break;
  }

  if (requiresOwnerEscalation) {
    steps.push({
      stepNumber: 2,
      stepName: 'اعتماد الإدارة العليا / المالك',
      requiredRole: 'owner',
      status: 'pending',
    });
  }

  const reqDocRef = doc(collection(db, 'approval_requests'));
  const request: ApprovalRequest = {
    id: reqDocRef.id,
    tenantId,
    branchId,
    workflowType,
    entityType,
    entityId,
    entityNumberSnapshot,
    requestedBy,
    requesterNameSnapshot,
    requestedAt: now,
    amount,
    currency,
    status: 'pending',
    currentStep: 1,
    totalSteps: steps.length,
    steps,
    contextSnapshot,
    notes,
  };

  await setDoc(reqDocRef, request);
  return request;
}

/**
 * Process Approval Action (Approve, Reject, Cancel)
 * Enforces self-approval prevention and step progression.
 */
export async function processApprovalAction(input: ProcessActionInput): Promise<ApprovalRequest> {
  const { tenantId, requestId, actorId, actorName, actorRole, action, comment } = input;
  const reqRef = doc(db, 'approval_requests', requestId);
  const snap = await getDoc(reqRef);

  if (!snap.exists()) {
    throw new Error('طلب الاعتماد المطلوب غير موجود');
  }

  const request = snap.data() as ApprovalRequest;
  if (request.tenantId !== tenantId) {
    throw new Error('لا توجد صلاحية للوصول إلى هذا الطلب');
  }

  if (request.status !== 'pending') {
    throw new Error(`لا يمكن تعديل الطلب لأنه بحالة (${request.status})`);
  }

  const settings = await getApprovalSettings(tenantId);

  // Self-Approval Check
  if (action === 'approve' && !settings.allowSelfApproval && request.requestedBy === actorId) {
    throw new Error('وفق سياسة الحوكمة المعتمدة، لا يمكنك اعتماد طلب قمت بإنشائه بنفسك');
  }

  const now = new Date().toISOString();
  const currentStepIdx = request.currentStep - 1;
  const activeStep = request.steps[currentStepIdx];

  if (!activeStep) {
    throw new Error('خطوة الاعتماد الحالية غير صالحة');
  }

  const actionRecord: ApprovalActionRecord = {
    actorId,
    actorName,
    actorRole,
    action,
    timestamp: now,
    comment,
    stepNumber: request.currentStep,
  };

  if (action === 'cancel') {
    if (request.requestedBy !== actorId && actorRole !== 'owner' && actorRole !== 'admin') {
      throw new Error('فقط منشئ الطلب أو مدير النظام يمكنه إلغاء الطلب');
    }
    activeStep.status = 'cancelled';
    activeStep.actionRecord = actionRecord;
    request.status = 'cancelled';
    request.cancelledAt = now;
  } else if (action === 'reject') {
    activeStep.status = 'rejected';
    activeStep.actionRecord = actionRecord;
    request.status = 'rejected';
    request.completedAt = now;
  } else if (action === 'approve') {
    activeStep.status = 'approved';
    activeStep.actionRecord = actionRecord;

    // Check if more steps remain
    if (request.currentStep < request.totalSteps) {
      request.currentStep += 1;
      request.steps[request.currentStep - 1].status = 'pending';
    } else {
      // Final approval achieved
      request.status = 'approved';
      request.completedAt = now;
    }
  }

  await updateDoc(reqRef, {
    status: request.status,
    currentStep: request.currentStep,
    steps: request.steps,
    completedAt: request.completedAt || null,
    cancelledAt: request.cancelledAt || null,
  });

  return request;
}

/**
 * Fetch Approval Requests with filters
 */
export async function fetchApprovalRequests(
  tenantId: string,
  filter?: {
    status?: ApprovalStatus;
    branchId?: string;
    requestedBy?: string;
    workflowType?: ApprovalWorkflowType;
  }
): Promise<ApprovalRequest[]> {
  const reqRef = collection(db, 'approval_requests');
  let q = query(reqRef, where('tenantId', '==', tenantId));

  if (filter?.status) {
    q = query(q, where('status', '==', filter.status));
  }
  if (filter?.branchId && filter.branchId !== 'all') {
    q = query(q, where('branchId', '==', filter.branchId));
  }
  if (filter?.requestedBy) {
    q = query(q, where('requestedBy', '==', filter.requestedBy));
  }
  if (filter?.workflowType) {
    q = query(q, where('workflowType', '==', filter.workflowType));
  }

  const snap = await getDocs(q);
  const items: ApprovalRequest[] = [];
  snap.forEach((d) => items.push({ id: d.id, ...d.data() } as ApprovalRequest));

  return items.sort((a, b) => b.requestedAt.localeCompare(a.requestedAt));
}
