/**
 * Trusted Revalidation Sync Engine
 * Coordinates background synchronization across tabs with durable IndexedDB leases,
 * limited concurrency, strict dependency ordering, and zero silent conflicts.
 */

import { getOfflineDB } from './offlineDb';
import { offlineQueueService } from './offlineQueue.service';
import { connectivityService, isGenuineTransportError } from './offlineConnectivity.service';
import { completeSaleTransaction } from '../sales/sales.service';
import type { OfflineOperation, OfflineSalePayload, OfflineLease } from './offlineTypes';

const LEASE_KEY = 'sync_leader';
const LEASE_DURATION_MS = 10000;
const HEARTBEAT_INTERVAL_MS = 4000;
const MAX_CONCURRENT_OPERATIONS = 3;

export class OfflineSyncService {
  private leaderId: string = typeof crypto !== 'undefined' && crypto.randomUUID
    ? crypto.randomUUID()
    : 'tab_' + Math.random().toString(36).substring(2, 9);
  private heartbeatTimer: any = null;
  private syncInProgress: boolean = false;
  private broadcastChannel: BroadcastChannel | null = null;
  private syncListeners: Set<() => void> = new Set();

  constructor() {
    if (typeof window !== 'undefined') {
      try {
        this.broadcastChannel = new BroadcastChannel('alwan_offline_sync');
        this.broadcastChannel.onmessage = (event) => {
          if (event.data?.type === 'SYNC_REQUEST') {
            this.attemptSync();
          }
        };
      } catch (e) {
        // BroadcastChannel not supported in some test envs
      }

      // Re-trigger sync on online, visibility change, and window focus
      window.addEventListener('online', () => this.attemptSync());
      window.addEventListener('visibilitychange', () => {
        if (document.visibilityState === 'visible') {
          this.attemptSync();
        }
      });
      window.addEventListener('focus', () => this.attemptSync());
    }
  }

  public subscribe(listener: () => void): () => void {
    this.syncListeners.add(listener);
    return () => {
      this.syncListeners.delete(listener);
    };
  }

  private notify() {
    for (const listener of this.syncListeners) {
      try {
        listener();
      } catch (err) {
        console.error('Error in sync listener:', err);
      }
    }
  }

  /**
   * Safeguard 2:
   * Acquires durable multi-tab leader lease in IndexedDB.
   * Stale or dead leases (>10s) are safely reclaimed.
   */
  public async acquireOrRenewLease(): Promise<boolean> {
    const db = await getOfflineDB();
    const now = Date.now();
    const existing = await db.get('offline_leases', LEASE_KEY);

    if (!existing || existing.leaseUntil < now || existing.leaderId === this.leaderId) {
      const lease: OfflineLease = {
        key: LEASE_KEY,
        leaderId: this.leaderId,
        acquiredAt: existing?.leaderId === this.leaderId ? existing.acquiredAt : now,
        leaseUntil: now + LEASE_DURATION_MS,
        heartbeatAt: now,
      };

      await db.put('offline_leases', lease);
      this.startHeartbeat();
      return true;
    }

    return false;
  }

  /**
   * Releases current tab leader lease
   */
  public async releaseLease(): Promise<void> {
    this.stopHeartbeat();
    try {
      const db = await getOfflineDB();
      const existing = await db.get('offline_leases', LEASE_KEY);
      if (existing && existing.leaderId === this.leaderId) {
        await db.delete('offline_leases', LEASE_KEY);
      }
    } catch {}
  }

  private startHeartbeat() {
    if (this.heartbeatTimer) return;
    this.heartbeatTimer = setInterval(async () => {
      try {
        const db = await getOfflineDB();
        const existing = await db.get('offline_leases', LEASE_KEY);
        if (existing && existing.leaderId === this.leaderId) {
          const now = Date.now();
          existing.heartbeatAt = now;
          existing.leaseUntil = now + LEASE_DURATION_MS;
          await db.put('offline_leases', existing);
        } else {
          this.stopHeartbeat();
        }
      } catch {
        this.stopHeartbeat();
      }
    }, HEARTBEAT_INTERVAL_MS);

    if (typeof this.heartbeatTimer === 'object' && typeof (this.heartbeatTimer as any)?.unref === 'function') {
      (this.heartbeatTimer as any).unref();
    }
  }

  public stopHeartbeat() {
    if (this.heartbeatTimer) {
      clearInterval(this.heartbeatTimer);
      this.heartbeatTimer = null;
    }
  }

  /**
   * Main Sync Trigger
   */
  public async attemptSync(): Promise<{ processed: number; succeeded: number; conflicts: number; failed: number }> {
    if (this.syncInProgress) {
      return { processed: 0, succeeded: 0, conflicts: 0, failed: 0 };
    }

    // Must be online
    if (!connectivityService.isOnline()) {
      return { processed: 0, succeeded: 0, conflicts: 0, failed: 0 };
    }

    // Must acquire multi-tab leader lease
    const isLeader = await this.acquireOrRenewLease();
    if (!isLeader) {
      // Notify leader tab via BroadcastChannel
      this.broadcastChannel?.postMessage({ type: 'SYNC_REQUEST' });
      return { processed: 0, succeeded: 0, conflicts: 0, failed: 0 };
    }

    this.syncInProgress = true;
    let processed = 0;
    let succeeded = 0;
    let conflicts = 0;
    let failed = 0;

    try {
      const db = await getOfflineDB();
      const all = await db.getAll('offline_queue');

      // Candidates for sync: pending, awaiting_confirmation, or failed transient retries
      const now = Date.now();
      const candidates = all.filter((op) => {
        if (op.status === 'pending' || op.status === 'awaiting_confirmation') {
          return true;
        }
        if (op.status === 'syncing') {
          // Recover stuck operations if they have been in syncing for > 2 minutes
          const age = now - new Date(op.updatedAt || op.createdAt).getTime();
          return age > 120000;
        }
        return false;
      });

      if (candidates.length === 0) {
        return { processed: 0, succeeded: 0, conflicts: 0, failed: 0 };
      }

      // Order by priority (1 is highest), then creation date
      candidates.sort((a, b) => {
        if (a.priority !== b.priority) return a.priority - b.priority;
        return new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime();
      });

      // Safeguard 33: Entity-level serialization
      // Concurrency up to 3 for independent operations, but operations sharing the same
      // stockKey, shiftId, or customerId must execute sequentially across batches.
      const remaining: OfflineOperation<any>[] = [...candidates];

      while (remaining.length > 0) {
        const batch: OfflineOperation<any>[] = [];
        const seenEntityKeys = new Set<string>();

        for (let idx = 0; idx < remaining.length; idx++) {
          const op = remaining[idx];
          const keys = this.extractEntityKeys(op);
          const hasConflict = keys.some((k) => seenEntityKeys.has(k));

          if (!hasConflict) {
            batch.push(op);
            keys.forEach((k) => seenEntityKeys.add(k));
            remaining.splice(idx, 1);
            idx--;
            if (batch.length >= MAX_CONCURRENT_OPERATIONS) {
              break;
            }
          }
        }

        if (batch.length === 0) {
          batch.push(remaining.shift()!);
        }

        const results = await Promise.all(batch.map((op) => this.syncSingleOperation(op)));

        for (const res of results) {
          processed++;
          if (res === 'synced') succeeded++;
          else if (res === 'conflict') conflicts++;
          else if (res === 'failed') failed++;
        }
      }
    } finally {
      this.syncInProgress = false;
      this.notify();
    }

    return { processed, succeeded, conflicts, failed };
  }

  /**
   * Syncs an individual offline operation using the existing trusted service.
   */
  public async syncSingleOperation(
    op: OfflineOperation<any>
  ): Promise<'synced' | 'conflict' | 'failed' | 'retry'> {
    const db = await getOfflineDB();
    const nowIso = new Date().toISOString();

    // Mark syncing
    op.status = 'syncing';
    op.lastAttemptAt = nowIso;
    op.updatedAt = nowIso;
    await db.put('offline_queue', op);
    this.notify();

    if (op.operationType === 'pos_sale') {
      const payload = op.payload as OfflineSalePayload;

      try {
        // CALL EXISTING TRUSTED SERVICE DIRECTLY WITH SAME IDEMPOTENCY KEY
        const result = await completeSaleTransaction({
          tenantId: payload.tenantId,
          branchId: payload.branchId,
          branchCode: payload.branchCode,
          cashierId: payload.cashierId,
          cashierNameSnapshot: payload.cashierNameSnapshot,
          customerId: payload.customerId,
          customerNameSnapshot: payload.customerNameSnapshot,
          customerPhoneSnapshot: payload.customerPhoneSnapshot,
          shiftId: payload.shiftId,
          saleType: payload.saleType,
          items: payload.items,
          payments: payload.payments,
          cartDiscountAmount: payload.cartDiscountAmount,
          discountType: payload.discountType,
          discountValue: payload.discountValue,
          serviceChargeRate: payload.serviceChargeRate,
          serviceChargeAmount: payload.serviceChargeAmount,
          taxIncluded: payload.taxIncluded,
          serviceChargeIncluded: payload.serviceChargeIncluded,
          clientCheckoutId: payload.clientCheckoutId, // Original idempotency identifier!
          notes: payload.notes ? `${payload.notes} [Offline Sync: ${payload.temporaryReceiptNumber}]` : `[Offline Sync: ${payload.temporaryReceiptNumber}]`,
        });

        if (result.success && result.sale) {
          // SUCCESSFUL COMMIT OR IDEMPOTENT REPLAY
          op.status = 'synced';
          op.serverReferenceId = result.sale.invoiceNumber;
          const syncTimestamp = new Date().toISOString();
          op.updatedAt = syncTimestamp;
          await db.put('offline_queue', op);

          // Safeguard 30: Local Shadow Stock Reconciliation
          // Mark local shadow stock entries refreshed/synced with server
          try {
            const stockTx = db.transaction('shadow_stock', 'readwrite');
            const stockStore = stockTx.objectStore('shadow_stock');
            for (const item of payload.items || []) {
              const vId = item.variantId && item.variantId.trim() !== '' ? item.variantId.trim() : null;
              const stockKey = `${payload.tenantId}___${payload.branchId}___${item.productId}___${vId || 'main'}`;
              const stockEntry = await stockStore.get(stockKey);
              if (stockEntry) {
                stockEntry.lastSyncedAt = syncTimestamp;
                await stockStore.put(stockEntry);
              }
            }
            await stockTx.done;
          } catch (stockSyncErr) {
            console.warn('Could not update shadow stock sync timestamp:', stockSyncErr);
          }

          return 'synced';
        } else {
          // BUSINESS REJECTION / CONFLICT
          const errMsg = result.error || 'فشل إتمام العملية على الخادم';
          op.status = 'conflict';
          op.errorCode = 'BUSINESS_RULE_REJECTION';
          op.errorMessage = errMsg;
          op.updatedAt = new Date().toISOString();
          await db.put('offline_queue', op);
          return 'conflict';
        }
      } catch (err: any) {
        if (isGenuineTransportError(err)) {
          // Transient network error
          op.retryCount = (op.retryCount || 0) + 1;
          // Safeguard 1: If transport drops mid-execution, mark awaiting_confirmation
          op.status = 'awaiting_confirmation';
          op.errorMessage = `انقطع الاتصال أثناء الإرسال: ${err?.message || 'Network error'}`;
          op.updatedAt = new Date().toISOString();
          await db.put('offline_queue', op);
          return 'retry';
        } else {
          // Hard / Permanent error (e.g. permission-denied, invalid document)
          op.status = 'conflict';
          op.errorCode = err?.code || 'PERMANENT_ERROR';
          op.errorMessage = err?.message || 'خطأ غير قابل لإعادة المحاولة التلقائية';
          op.updatedAt = new Date().toISOString();
          await db.put('offline_queue', op);
          return 'conflict';
        }
      }
    }

    return 'synced';
  }

  /**
   * Extracts distinct entity keys for an operation to prevent concurrent execution
   * on the same inventory items, cashier shift, or customer account.
   */
  public extractEntityKeys(op: OfflineOperation<any>): string[] {
    const keys: string[] = [];
    if (op.conflictKey) {
      keys.push(op.conflictKey);
    }
    if (op.tenantId) {
      if (op.operationType === 'pos_sale' && op.payload) {
        const payload = op.payload as OfflineSalePayload;
        if (payload.shiftId) {
          keys.push(`shift:${op.tenantId}:${payload.shiftId}`);
        }
        if (payload.customerId) {
          keys.push(`customer:${op.tenantId}:${payload.customerId}`);
        }
        for (const item of payload.items || []) {
          const vId = item.variantId && item.variantId.trim() !== '' ? item.variantId.trim() : 'main';
          keys.push(`stock:${op.tenantId}:${payload.branchId}:${item.productId}:${vId}`);
        }
      }
    }
    return keys.length > 0 ? Array.from(new Set(keys)) : [op.id];
  }
}

export const offlineSyncService = new OfflineSyncService();
