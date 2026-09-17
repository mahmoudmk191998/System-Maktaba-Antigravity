import { getFirestoreDb } from '../config/firebase.js';
import { env } from '../config/environment.js';

const COLLECTION_NAME = 'branch_counters';

// In-memory counter store for tests / fallback
const inMemoryCounters = new Map<string, number>();

export class OrderNumberService {
  private useMemory: boolean;

  constructor(useMemory: boolean = env.NODE_ENV === 'test') {
    this.useMemory = useMemory;
  }

  private getCounterKey(tenantId: string, branchId: string): string {
    return `${tenantId}_${branchId}`;
  }

  /**
   * Generates the next sequential order number atomically for a branch.
   * e.g. '#1', '#2', '#3'
   */
  async generateNextOrderNumber(tenantId: string, branchId: string): Promise<string> {
    const key = this.getCounterKey(tenantId, branchId);

    if (this.useMemory) {
      const current = inMemoryCounters.get(key) || 0;
      const next = current + 1;
      inMemoryCounters.set(key, next);
      return `#${next}`;
    }

    try {
      const db = getFirestoreDb();
      const counterRef = db.collection(COLLECTION_NAME).doc(key);

      const nextNumber = await db.runTransaction(async (transaction) => {
        const counterDoc = await transaction.get(counterRef);
        let num = 1;

        if (counterDoc.exists) {
          const data = counterDoc.data();
          const reusable: number[] = data?.reusable_numbers || [];

          if (reusable.length > 0) {
            num = Math.min(...reusable);
            const remaining = reusable.filter((n) => n !== num);
            transaction.update(counterRef, { reusable_numbers: remaining });
            return num;
          }

          num = (data?.last_order_number || 0) + 1;
          transaction.update(counterRef, { last_order_number: num, updated_at: new Date().toISOString() });
        } else {
          transaction.set(counterRef, {
            tenant_id: tenantId,
            branch_id: branchId,
            last_order_number: num,
            reusable_numbers: [],
            created_at: new Date().toISOString(),
          });
        }

        return num;
      });

      return `#${nextNumber}`;
    } catch (err) {
      const current = inMemoryCounters.get(key) || 0;
      const next = current + 1;
      inMemoryCounters.set(key, next);
      return `#${next}`;
    }
  }

  clearMemory() {
    inMemoryCounters.clear();
  }
}

export const defaultOrderNumberService = new OrderNumberService();
