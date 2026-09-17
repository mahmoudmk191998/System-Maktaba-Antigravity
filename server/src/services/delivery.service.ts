import { getFirestoreDb } from '../config/firebase.js';
import { DeliveryZoneCheckResult, PublicDeliveryZone } from '../types/public.types.js';
import { NotFoundError } from '../utils/errors.js';

import { env } from '../config/environment.js';

const COLLECTION_NAME = 'delivery_zones';

// In-memory test store
const inMemoryZones = new Map<string, any>();

export class DeliveryService {
  private useMemory: boolean;

  constructor(useMemory: boolean = env.NODE_ENV === 'test') {
    this.useMemory = useMemory;
  }

  /**
   * Fetch active delivery zones for the authenticated tenant.
   */
  async getDeliveryZones(tenantId: string, branchId?: string): Promise<PublicDeliveryZone[]> {
    let zonesData: any[] = [];

    if (this.useMemory) {
      zonesData = Array.from(inMemoryZones.values()).filter(
        (z) => z.tenant_id === tenantId
      );
    } else {
      try {
        const db = getFirestoreDb();
        const snapshot = await db
          .collection(COLLECTION_NAME)
          .where('tenant_id', '==', tenantId)
          .get();

        zonesData = snapshot.docs.map((d) => ({ id: d.id, ...d.data() }));
      } catch (err) {
        zonesData = Array.from(inMemoryZones.values()).filter(
          (z) => z.tenant_id === tenantId
        );
      }
    }

    // Filter by branch_id if zone is branch-specific
    if (branchId) {
      zonesData = zonesData.filter(
        (z) => !z.branch_id || z.branch_id === branchId || z.branchId === branchId
      );
    }

    return zonesData.map((z) => ({
      id: z.id,
      name: z.name || '',
      price: Number(z.price) || 0,
      estimated_time: Number(z.estimated_time || z.estimatedTime) || undefined,
    }));
  }

  /**
   * Validate a delivery zone and return authoritative fee and delivery duration.
   */
  async checkDeliveryZone(
    tenantId: string,
    zoneId: string,
    branchId?: string
  ): Promise<DeliveryZoneCheckResult> {
    let zone: any = null;

    if (this.useMemory) {
      const z = inMemoryZones.get(zoneId);
      if (z && z.tenant_id === tenantId) {
        zone = z;
      }
    } else {
      try {
        const db = getFirestoreDb();
        const doc = await db.collection(COLLECTION_NAME).doc(zoneId).get();
        if (doc.exists) {
          const data = doc.data();
          if (data?.tenant_id === tenantId) {
            zone = { id: doc.id, ...data };
          }
        }
      } catch (err) {
        const z = inMemoryZones.get(zoneId);
        if (z && z.tenant_id === tenantId) {
          zone = z;
        }
      }
    }

    if (!zone) {
      throw new NotFoundError(`Delivery zone '${zoneId}' not found`);
    }

    // If zone is branch-specific and a branch was supplied, verify match
    if (branchId && zone.branch_id && zone.branch_id !== branchId) {
      throw new NotFoundError(`Delivery zone '${zoneId}' does not serve branch '${branchId}'`);
    }

    return {
      available: true,
      delivery_fee: Number(zone.price) || 0,
      estimated_time: Number(zone.estimated_time || zone.estimatedTime) || 30,
    };
  }

  // Test helpers
  setMemoryZone(id: string, data: any) {
    inMemoryZones.set(id, { id, ...data });
  }

  clearMemory() {
    inMemoryZones.clear();
  }
}

export const defaultDeliveryService = new DeliveryService();
