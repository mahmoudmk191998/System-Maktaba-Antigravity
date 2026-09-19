/**
 * Retail Credit Sales & Accounts Receivable Service (Phase 8)
 * Manages customer receivables, credit limit enforcement, aging buckets,
 * and credit eligibility checks.
 */

import { db } from '@/lib/firebase';
import {
  collection,
  doc,
  getDoc,
  getDocs,
  query,
  where,
  orderBy,
  limit as fsLimit,
} from 'firebase/firestore';
import type {
  Customer,
  CustomerCreditStatus,
  CustomerReceivable,
  CustomerReceivableStatus,
  ReceivablesAgingSummary,
} from '@/types/retail.types';

export interface CreditEligibilityResult {
  eligible: boolean;
  isEligible: boolean;
  creditStatus?: CustomerCreditStatus;
  reason?: string;
  currentBalance: number;
  creditLimit: number;
  availableCredit: number;
  exceededBy?: number;
  hasOverdueReceivables?: boolean;
  oldestOverdueDays?: number;
}

/**
 * Checks whether a customer is eligible for a new credit sale.
 */
export function checkCustomerCreditEligibility(
  customer: Customer,
  requestedCreditAmount: number,
  options?: {
    allowCreditOverride?: boolean;
    blockCreditWhenOverdue?: boolean;
    blockIfOverdue?: boolean;
    hasOverdue?: boolean;
  }
): CreditEligibilityResult {
  const currentBalance = Number(customer.currentBalance ?? customer.balance ?? 0);
  const creditLimit = Number(customer.creditLimit || 0);
  const availableCredit = Math.max(0, creditLimit - Math.max(0, currentBalance));
  const creditStatus = customer.creditStatus || 'normal';

  // 1. Check if customer is active
  const isActive = customer.isActive ?? customer.active ?? (customer.status !== 'archived');
  if (!isActive || customer.archived) {
    return {
      eligible: false,
      isEligible: false,
      creditStatus,
      reason: 'حساب العميل غير نشط أو مؤرشف',
      currentBalance,
      creditLimit,
      availableCredit: 0,
    };
  }

  // 2. Check if Credit is enabled for this customer
  if (!customer.creditEnabled) {
    return {
      eligible: false,
      isEligible: false,
      creditStatus,
      reason: 'البيع الآجل غير مفعّل لهذا العميل',
      currentBalance,
      creditLimit,
      availableCredit: 0,
    };
  }

  // 3. Check Credit Status (Blocked or On Hold)
  if (customer.creditStatus === 'blocked') {
    return {
      eligible: false,
      isEligible: false,
      creditStatus,
      reason: 'حساب العميل محظور ائتمانياً (Blocked)',
      currentBalance,
      creditLimit,
      availableCredit: 0,
    };
  }
  if (customer.creditStatus === 'on_hold') {
    return {
      eligible: false,
      isEligible: false,
      creditStatus,
      reason: 'الحساب الائتماني للعميل معلق مؤقتاً للمراجعة (On Hold)',
      currentBalance,
      creditLimit,
      availableCredit,
    };
  }

  // 4. Check Overdue Block Policy
  const isOverdueBlocked =
    (options?.blockCreditWhenOverdue || options?.blockIfOverdue) &&
    ((customer.overdueBalance || 0) > 0 || options?.hasOverdue);

  if (isOverdueBlocked && !options?.allowCreditOverride) {
    return {
      eligible: false,
      isEligible: false,
      creditStatus,
      reason: 'العميل لديه مديونية متأخرة وتجاوزت تاريخ الاستحقاق',
      currentBalance,
      creditLimit,
      availableCredit,
      hasOverdueReceivables: true,
    };
  }

  // 5. Check Credit Limit
  const projectedBalance = currentBalance + requestedCreditAmount;
  if (creditLimit > 0 && projectedBalance > creditLimit && !options?.allowCreditOverride) {
    const exceededBy = Math.round((projectedBalance - creditLimit) * 100) / 100;
    return {
      eligible: false,
      isEligible: false,
      creditStatus,
      reason: `تجاوز السقف الائتماني بمقدار ${exceededBy} ج.م (المتاح: ${availableCredit} ج.م)`,
      currentBalance,
      creditLimit,
      availableCredit,
      exceededBy,
    };
  }

  // 6. Max single invoice amount limit (if configured)
  if (
    customer.maxInvoiceAmount &&
    requestedCreditAmount > customer.maxInvoiceAmount &&
    !options?.allowCreditOverride
  ) {
    return {
      eligible: false,
      isEligible: false,
      creditStatus,
      reason: `قيمة الفاتورة الآجلة تتجاوز الحد الأقصى للفاتورة الواحدة (${customer.maxInvoiceAmount} ج.م)`,
      currentBalance,
      creditLimit,
      availableCredit,
    };
  }

  return {
    eligible: true,
    isEligible: true,
    creditStatus,
    currentBalance,
    creditLimit,
    availableCredit,
  };
}

/**
 * Calculates accounts receivable aging schedule for a tenant or customer.
 * Buckets: Current (not yet due), 1–30 days overdue, 31–60 days, 61–90 days, >90 days overdue.
 */
export function calculateReceivablesAging(
  receivables: CustomerReceivable[],
  referenceDateInput?: string | Date
): ReceivablesAgingSummary {
  let referenceDate: Date;
  if (!referenceDateInput) {
    referenceDate = new Date();
  } else if (referenceDateInput instanceof Date) {
    referenceDate = referenceDateInput;
  } else {
    referenceDate = new Date(referenceDateInput);
  }
  const refTime = referenceDate.getTime();

  let current = 0;
  let days1to30 = 0;
  let days31to60 = 0;
  let days61to90 = 0;
  let days90Plus = 0;
  let overdueCount = 0;

  for (const rec of receivables) {
    const remaining = Number(rec.remainingAmount || 0);
    if (remaining <= 0) continue;

    const dueDate = new Date(rec.dueDate).getTime();
    const diffMs = refTime - dueDate;
    const overdueDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));

    if (overdueDays <= 0) {
      current += remaining;
    } else {
      overdueCount++;
      if (overdueDays <= 30) {
        days1to30 += remaining;
      } else if (overdueDays <= 60) {
        days31to60 += remaining;
      } else if (overdueDays <= 90) {
        days61to90 += remaining;
      } else {
        days90Plus += remaining;
      }
    }
  }

  current = Math.round(current * 100) / 100;
  days1to30 = Math.round(days1to30 * 100) / 100;
  days31to60 = Math.round(days31to60 * 100) / 100;
  days61to90 = Math.round(days61to90 * 100) / 100;
  days90Plus = Math.round(days90Plus * 100) / 100;
  const totalOverdue = Math.round((days1to30 + days31to60 + days61to90 + days90Plus) * 100) / 100;
  const totalOutstanding = Math.round((current + totalOverdue) * 100) / 100;

  return {
    current,
    days1to30,
    days31to60,
    days61to90,
    days90Plus,
    days90plus: days90Plus,
    totalOutstanding,
    totalOverdue,
    overdueCount,
    totalReceivablesCount: receivables.filter((r) => Number(r.remainingAmount || 0) > 0).length,
  };
}

/**
 * Fetches open and partially paid receivables for a specific customer, ordered by dueDate ascending (oldest first).
 */
export async function getOpenReceivablesForCustomer(
  tenantId: string,
  customerId: string
): Promise<CustomerReceivable[]> {
  try {
    let q = query(
      collection(db, 'customer_receivables'),
      where('tenantId', '==', tenantId),
      where('customerId', '==', customerId)
    );
    let snap = await getDocs(q);
    if (snap.empty) {
      q = query(
        collection(db, 'customer_receivables'),
        where('tenant_id', '==', tenantId),
        where('customerId', '==', customerId)
      );
      snap = await getDocs(q);
    }
    const docs = snap.docs.map((d) => ({ id: d.id, ...d.data() } as CustomerReceivable));
    return docs
      .filter((r) => {
        const remaining = Number(r.remainingAmount || 0);
        return remaining > 0 && r.status !== 'paid' && r.status !== 'cancelled';
      })
      .sort((a, b) => new Date(a.dueDate).getTime() - new Date(b.dueDate).getTime());
  } catch (err) {
    console.warn('Failed getOpenReceivablesForCustomer query:', err);
    return [];
  }
}
