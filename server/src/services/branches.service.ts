import { getFirestoreDb } from '../config/firebase.js';
import { PublicBranch } from '../types/public.types.js';
import { NotFoundError } from '../utils/errors.js';

import { env } from '../config/environment.js';

const COLLECTION_NAME = 'branches';

// In-memory store for unit test suites and mock mode
const inMemoryBranches = new Map<string, any>();

export class BranchesService {
  private useMemory: boolean;

  constructor(useMemory: boolean = env.NODE_ENV === 'test') {
    this.useMemory = useMemory;
  }

  /**
   * Fetch active branches belonging strictly to the authenticated tenant.
   * Filters by allowedBranchIds if specified for the API client.
   */
  async getBranches(tenantId: string, allowedBranchIds: string[] = []): Promise<PublicBranch[]> {
    let branchesData: any[] = [];

    if (this.useMemory) {
      branchesData = Array.from(inMemoryBranches.values()).filter(
        (b) => b.tenant_id === tenantId
      );
    } else {
      try {
        const db = getFirestoreDb();
        const snapshot = await db
          .collection(COLLECTION_NAME)
          .where('tenant_id', '==', tenantId)
          .get();

        branchesData = snapshot.docs.map((doc) => ({
          id: doc.id,
          ...doc.data(),
        }));
      } catch (err) {
        branchesData = Array.from(inMemoryBranches.values()).filter(
          (b) => b.tenant_id === tenantId
        );
      }
    }

    // Filter by allowedBranchIds if restricted
    if (allowedBranchIds.length > 0) {
      branchesData = branchesData.filter((b) => allowedBranchIds.includes(b.id));
    }

    // Map to public-safe fields only
    return branchesData.map((b) => ({
      id: b.id,
      name: b.name || '',
      address: b.address || '',
      phone: b.phone || '',
      is_active: b.isActive !== undefined ? b.isActive : b.is_active !== undefined ? b.is_active : true,
    }));
  }

  /**
   * Fetch a single branch by ID, verifying tenant ownership.
   */
  async getBranchById(tenantId: string, branchId: string): Promise<PublicBranch> {
    let branchData: any = null;

    if (this.useMemory || inMemoryBranches.has(branchId)) {
      const b = inMemoryBranches.get(branchId);
      if (b && b.tenant_id === tenantId) {
        branchData = b;
      }
    }

    if (!branchData && !this.useMemory) {
      try {
        const db = getFirestoreDb();
        const doc = await db.collection(COLLECTION_NAME).doc(branchId).get();
        if (doc.exists) {
          const data = doc.data();
          if (data?.tenant_id === tenantId) {
            branchData = { id: doc.id, ...data };
          }
        }
      } catch (err) {
        const b = inMemoryBranches.get(branchId);
        if (b && b.tenant_id === tenantId) {
          branchData = b;
        }
      }
    }

    if (!branchData) {
      throw new NotFoundError(`Branch '${branchId}' not found`);
    }

    return {
      id: branchData.id,
      name: branchData.name || '',
      address: branchData.address || '',
      phone: branchData.phone || '',
      is_active: branchData.isActive !== undefined ? branchData.isActive : branchData.is_active !== undefined ? branchData.is_active : true,
    };
  }

  // Helper for test fixtures
  setMemoryBranch(id: string, data: any) {
    inMemoryBranches.set(id, { id, ...data });
  }

  clearMemory() {
    inMemoryBranches.clear();
  }
}

export const defaultBranchesService = new BranchesService();
