import { db } from '@/lib/firebase';
import {
  addDoc,
  collection,
  doc,
  getDoc,
  getDocs,
  limit,
  query,
  setDoc,
  where,
} from 'firebase/firestore';

export interface BranchProfilePatch {
  name?: string;
  phone?: string;
  address?: string;
  opening_time?: string;
  closing_time?: string;
}

export interface ResolvedTenantBranch {
  id: string;
  data: Record<string, any>;
  recovered: boolean;
  source: 'requested' | 'existing' | 'recreated' | 'created';
}

export function getBranchTenantId(data: Record<string, any> | undefined): string {
  return String(data?.tenantId || data?.tenant_id || '');
}

export function isBranchOwnedByTenant(
  data: Record<string, any> | undefined,
  tenantId: string
): boolean {
  const documentTenantId = getBranchTenantId(data);
  // Legacy branch docs may predate tenant fields. They are accepted only when
  // addressed by a tenant-owned profile and immediately backfilled.
  return !documentTenantId || documentTenantId === tenantId;
}

export function buildBranchDocument(
  tenantId: string,
  patch: BranchProfilePatch = {}
): Record<string, any> {
  return {
    tenantId,
    tenant_id: tenantId,
    name: patch.name?.trim() || 'الفرع الرئيسي',
    phone: patch.phone?.trim() || '',
    address: patch.address?.trim() || '',
    opening_time: patch.opening_time || '08:00',
    closing_time: patch.closing_time || '23:00',
    is_active: true,
    updated_at: new Date().toISOString(),
  };
}

async function findFirstTenantBranch(
  tenantId: string
): Promise<{ id: string; data: Record<string, any> } | null> {
  for (const tenantField of ['tenantId', 'tenant_id'] as const) {
    const snap = await getDocs(
      query(collection(db, 'branches'), where(tenantField, '==', tenantId), limit(1))
    );

    if (!snap.empty) {
      return {
        id: snap.docs[0].id,
        data: snap.docs[0].data(),
      };
    }
  }

  return null;
}

/**
 * Resolves a branch referenced by the current user's profile.
 *
 * If the profile points to a branch document that no longer exists (for example
 * after an old/partial data reset), the same branch ID is recreated so existing
 * references remain stable. If the requested ID belongs to another tenant, it
 * is never overwritten; a valid tenant branch is selected/created instead.
 */
export async function resolveOrRecoverTenantBranch(
  tenantId: string,
  requestedBranchId?: string | null
): Promise<ResolvedTenantBranch> {
  if (!tenantId) {
    throw new Error('Tenant ID is required to resolve a branch');
  }

  if (requestedBranchId) {
    const requestedRef = doc(db, 'branches', requestedBranchId);
    const requestedSnap = await getDoc(requestedRef);

    if (requestedSnap.exists()) {
      const data = requestedSnap.data();

      if (isBranchOwnedByTenant(data, tenantId)) {
        // Backfill both naming conventions for legacy branch docs.
        if (!data.tenantId || !data.tenant_id) {
          await setDoc(
            requestedRef,
            {
              tenantId,
              tenant_id: tenantId,
              updated_at: new Date().toISOString(),
            },
            { merge: true }
          );
        }

        return {
          id: requestedBranchId,
          data: {
            ...data,
            tenantId,
            tenant_id: tenantId,
          },
          recovered: false,
          source: 'requested',
        };
      }

      // Never repurpose a branch document owned by a different tenant.
      const existing = await findFirstTenantBranch(tenantId);
      if (existing) {
        return {
          id: existing.id,
          data: existing.data,
          recovered: true,
          source: 'existing',
        };
      }

      const created = await addDoc(collection(db, 'branches'), {
        ...buildBranchDocument(tenantId),
        created_at: new Date().toISOString(),
      });

      return {
        id: created.id,
        data: buildBranchDocument(tenantId),
        recovered: true,
        source: 'created',
      };
    }

    // Missing document: recreate the exact profile-referenced ID. This repairs
    // the stale reference atomically from the application's perspective and
    // avoids breaking historical records that still carry the branch ID.
    const recoveredData = {
      ...buildBranchDocument(tenantId),
      created_at: new Date().toISOString(),
      recovered_from_missing_reference: true,
      recovered_at: new Date().toISOString(),
    };
    await setDoc(requestedRef, recoveredData, { merge: false });

    return {
      id: requestedBranchId,
      data: recoveredData,
      recovered: true,
      source: 'recreated',
    };
  }

  const existing = await findFirstTenantBranch(tenantId);
  if (existing) {
    return {
      id: existing.id,
      data: existing.data,
      recovered: false,
      source: 'existing',
    };
  }

  const branchData = {
    ...buildBranchDocument(tenantId),
    created_at: new Date().toISOString(),
  };
  const created = await addDoc(collection(db, 'branches'), branchData);

  return {
    id: created.id,
    data: branchData,
    recovered: true,
    source: 'created',
  };
}

/**
 * Saves branch settings using an UPSERT instead of updateDoc.
 *
 * Firestore updateDoc throws "No document to update" when a stale profile points
 * to a deleted branch. setDoc({ merge: true }) repairs that exact missing branch
 * safely while preserving the same ID.
 */
export async function saveTenantBranchProfile(
  tenantId: string,
  branchId: string,
  patch: BranchProfilePatch
): Promise<{ success: true; recovered: boolean }> {
  if (!tenantId || !branchId) {
    throw new Error('Tenant ID and Branch ID are required');
  }

  const branchRef = doc(db, 'branches', branchId);
  const snap = await getDoc(branchRef);

  if (snap.exists() && !isBranchOwnedByTenant(snap.data(), tenantId)) {
    throw new Error('Branch does not belong to the current tenant');
  }

  const now = new Date().toISOString();
  await setDoc(
    branchRef,
    {
      ...buildBranchDocument(tenantId, patch),
      ...(snap.exists() ? {} : {
        created_at: now,
        recovered_from_missing_reference: true,
        recovered_at: now,
      }),
    },
    { merge: true }
  );

  return {
    success: true,
    recovered: !snap.exists(),
  };
}

export async function saveTenantProfileDocument(
  tenantId: string,
  data: Record<string, any>
): Promise<void> {
  if (!tenantId) throw new Error('Tenant ID is required');

  // Settings/profile save should be idempotent and self-healing if an older
  // partial reset removed the tenant doc while the authenticated profile still
  // references it.
  await setDoc(
    doc(db, 'tenants', tenantId),
    {
      ...data,
      updated_at: new Date().toISOString(),
    },
    { merge: true }
  );
}
