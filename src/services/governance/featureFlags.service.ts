/**
 * Enterprise Feature Flags Service (Phase 11)
 * Central management of modular ERP capabilities.
 * Invariant: Disabling a feature flag NEVER deletes historical data,
 * only safely restricts new operations and UI entry points.
 */

import { db } from '@/lib/firebase';
import { doc, getDoc, setDoc } from 'firebase/firestore';

export interface TenantFeatureFlags {
  enableWholesale: boolean;
  enableCreditSales: boolean;
  enableCustomerAdvances: boolean;
  enableTax: boolean;
  enablePurchaseApprovals: boolean;
  enableReturns: boolean;
  enableCrossBranchReturns: boolean;
  enableAccounting: boolean;
  enableAnalytics: boolean;
  enableStrictNegativeStockBlock: boolean;
  enableIdempotencyVerification: boolean;
}

export const DEFAULT_FEATURE_FLAGS: TenantFeatureFlags = {
  enableWholesale: true,
  enableCreditSales: true,
  enableCustomerAdvances: true,
  enableTax: true,
  enablePurchaseApprovals: true,
  enableReturns: true,
  enableCrossBranchReturns: true,
  enableAccounting: true,
  enableAnalytics: true,
  enableStrictNegativeStockBlock: true,
  enableIdempotencyVerification: true,
};

/**
 * Fetch feature flags for a tenant
 */
export async function getTenantFeatureFlags(tenantId: string): Promise<TenantFeatureFlags> {
  const ref = doc(db, 'feature_flags', tenantId);
  const snap = await getDoc(ref);
  if (snap.exists()) {
    return { ...DEFAULT_FEATURE_FLAGS, ...snap.data() } as TenantFeatureFlags;
  }
  return DEFAULT_FEATURE_FLAGS;
}

/**
 * Update feature flags for a tenant (Admin/Owner only)
 */
export async function updateTenantFeatureFlags(
  tenantId: string,
  updates: Partial<TenantFeatureFlags>
): Promise<TenantFeatureFlags> {
  const ref = doc(db, 'feature_flags', tenantId);
  const current = await getTenantFeatureFlags(tenantId);
  const merged = { ...current, ...updates };
  await setDoc(ref, merged, { merge: true });
  return merged;
}
