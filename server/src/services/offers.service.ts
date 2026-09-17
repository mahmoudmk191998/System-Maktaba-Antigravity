import { getFirestoreDb } from '../config/firebase.js';
import { PublicOffer } from '../types/public.types.js';

import { env } from '../config/environment.js';

const COLLECTION_NAME = 'promotions';

// In-memory test store
const inMemoryOffers = new Map<string, any>();

export class OffersService {
  private useMemory: boolean;

  constructor(useMemory: boolean = env.NODE_ENV === 'test') {
    this.useMemory = useMemory;
  }

  /**
   * Fetch active offers/promotions for the authenticated tenant.
   * Validates date range, active toggle, and usage limits.
   */
  async getOffers(tenantId: string): Promise<PublicOffer[]> {
    let rawOffers: any[] = [];

    if (this.useMemory) {
      rawOffers = Array.from(inMemoryOffers.values()).filter(
        (o) => o.tenant_id === tenantId
      );
    } else {
      try {
        const db = getFirestoreDb();
        const snapshot = await db
          .collection(COLLECTION_NAME)
          .where('tenant_id', '==', tenantId)
          .get();

        rawOffers = snapshot.docs.map((d) => ({ id: d.id, ...d.data() }));
      } catch (err) {
        rawOffers = Array.from(inMemoryOffers.values()).filter(
          (o) => o.tenant_id === tenantId
        );
      }
    }

    const now = new Date();

    // Filter active offers
    const activeOffers = rawOffers.filter((o) => {
      // Check active flag
      if (o.is_active === false || o.isActive === false) return false;

      // Check usage limits if set
      if (typeof o.usage_limit === 'number' && o.usage_limit > 0) {
        const usageCount = o.usage_count || 0;
        if (usageCount >= o.usage_limit) return false;
      }

      // Check start date if present
      if (o.start_date) {
        const start = new Date(o.start_date);
        if (!isNaN(start.getTime()) && now < start) return false;
      }

      // Check end date if present
      if (o.end_date) {
        const end = new Date(o.end_date);
        if (!isNaN(end.getTime()) && now > end) return false;
      }

      return true;
    });

    return activeOffers.map((o) => ({
      id: o.id,
      name: o.name || '',
      type: o.type || 'percentage',
      value: Number(o.value) || 0,
      min_order: o.min_order !== undefined ? Number(o.min_order) : o.minOrder !== undefined ? Number(o.minOrder) : undefined,
      max_discount: o.max_discount !== undefined ? Number(o.max_discount) : o.maxDiscount !== undefined ? Number(o.maxDiscount) : undefined,
      start_date: o.start_date || o.startDate || undefined,
      end_date: o.end_date || o.endDate || undefined,
      is_active: true,
    }));
  }

  // Test helpers
  setMemoryOffer(id: string, data: any) {
    inMemoryOffers.set(id, { id, ...data });
  }

  clearMemory() {
    inMemoryOffers.clear();
  }
}

export const defaultOffersService = new OffersService();
