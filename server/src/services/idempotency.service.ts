import { getFirestoreDb } from '../config/firebase.js';
import { env } from '../config/environment.js';
import { AppError } from '../utils/errors.js';

const COLLECTION_NAME = 'idempotency_records';

export interface IdempotencyRecord {
  id: string;
  tenant_id: string;
  client_id: string;
  idempotency_key: string;
  request_hash: string;
  order_id: string;
  response_data: any;
  created_at: string;
}

// In-memory test store
const inMemoryIdempotency = new Map<string, IdempotencyRecord>();

export class IdempotencyService {
  private useMemory: boolean;

  constructor(useMemory: boolean = env.NODE_ENV === 'test') {
    this.useMemory = useMemory;
  }

  private buildKey(tenantId: string, clientId: string, key: string): string {
    return `${tenantId}_${clientId}_${key}`;
  }

  /**
   * Check if an idempotency record exists.
   * If exists with same requestHash -> returns cached response.
   * If exists with different requestHash -> throws 409 Conflict.
   * If does not exist -> returns null.
   */
  async checkIdempotency(
    tenantId: string,
    clientId: string,
    key: string,
    requestHash: string
  ): Promise<any | null> {
    const docId = this.buildKey(tenantId, clientId, key);
    let record: IdempotencyRecord | null = null;

    if (this.useMemory) {
      record = inMemoryIdempotency.get(docId) || null;
    } else {
      try {
        const db = getFirestoreDb();
        const doc = await db.collection(COLLECTION_NAME).doc(docId).get();
        if (doc.exists) {
          record = doc.data() as IdempotencyRecord;
        }
      } catch (err) {
        record = inMemoryIdempotency.get(docId) || null;
      }
    }

    if (!record) {
      return null;
    }

    // Check payload fingerprint
    if (record.request_hash !== requestHash) {
      throw new AppError(
        `Idempotency key '${key}' has already been used with a different request payload`,
        409,
        'IDEMPOTENCY_KEY_REUSED'
      );
    }

    return record.response_data;
  }

  /**
   * Save an idempotency record.
   */
  async saveIdempotency(
    tenantId: string,
    clientId: string,
    key: string,
    requestHash: string,
    orderId: string,
    responseData: any
  ): Promise<void> {
    const docId = this.buildKey(tenantId, clientId, key);
    const record: IdempotencyRecord = {
      id: docId,
      tenant_id: tenantId,
      client_id: clientId,
      idempotency_key: key,
      request_hash: requestHash,
      order_id: orderId,
      response_data: responseData,
      created_at: new Date().toISOString(),
    };

    if (this.useMemory) {
      inMemoryIdempotency.set(docId, record);
    } else {
      try {
        const db = getFirestoreDb();
        await db.collection(COLLECTION_NAME).doc(docId).set(record);
      } catch (err) {
        inMemoryIdempotency.set(docId, record);
      }
    }
  }

  clearMemory() {
    inMemoryIdempotency.clear();
  }
}

export const defaultIdempotencyService = new IdempotencyService();
