/**
 * Offline Command Queue Service
 * Handles durable command enqueueing, atomic local transactions,
 * shadow stock decrements, and strict cancellation guards.
 */

import { getOfflineDB, getOrCreateDeviceId, generateTemporaryReceiptNumber } from './offlineDb';
import type {
  OfflineOperation,
  OfflineSalePayload,
  ShadowStockEntry,
  OfflineShiftEntry,
  OfflineSettings,
  DEFAULT_OFFLINE_SETTINGS,
} from './offlineTypes';
import { DEFAULT_OFFLINE_SETTINGS as defaultSettings } from './offlineTypes';

export class OfflineQueueService {
  /**
   * Generates deterministic idempotency key before attempting request.
   * Format: offline-sale:{tenantId}:{deviceId}:{uuid}
   */
  public async generateSaleIdempotencyKey(tenantId: string, clientCheckoutId: string): Promise<string> {
    const deviceId = await getOrCreateDeviceId();
    return `offline-sale:${tenantId}:${deviceId}:${clientCheckoutId}`;
  }

  /**
   * Safeguard 3:
   * Enqueues an offline POS sale atomically across offline_queue, shadow_stock, and offline_shifts.
   * NEVER returns success unless the multi-store IndexedDB transaction commits completely.
   */
  public async enqueueOfflineSale(
    payload: OfflineSalePayload,
    status: 'pending' | 'awaiting_confirmation' = 'pending',
    settings: OfflineSettings = defaultSettings
  ): Promise<{ success: boolean; operation?: OfflineOperation<OfflineSalePayload>; error?: string }> {
    const { tenantId, branchId, cashierId, items, payments, clientCheckoutId, temporaryReceiptNumber } = payload;

    if (!tenantId || !branchId || !cashierId) {
      return { success: false, error: 'بيانات المؤسسة أو الفرع أو الكاشير غير مكتملة' };
    }

    if (!items || items.length === 0) {
      return { success: false, error: 'سلة المشتريات فارغة' };
    }

    // Total sale amount
    const totalAmount = items.reduce((sum, item) => sum + (item.unitSellingPrice * item.quantity), 0);

    // Enforce configured offline policies
    if (settings.offlineSalesEnabled === false) {
      return { success: false, error: 'البيع دون اتصال معطل حالياً وفقاً لسياسة النظام' };
    }

    if (totalAmount > settings.offlineMaxTransactionAmount) {
      return {
        success: false,
        error: `قيمة الفاتورة (${totalAmount}) تتجاوز الحد الأقصى المسموح به للبيع دون اتصال (${settings.offlineMaxTransactionAmount})`,
      };
    }

    // Check payment types
    const hasCredit = payments.some((p) => p.method === 'credit' || (p as any).isCredit);
    if (hasCredit && !settings.allowOfflineCreditSales) {
      return {
        success: false,
        error: 'البيع الآجل (الكريديت) غير مسموح به في وضع عدم الاتصال لضمان سلامة الحدود الائتمانية',
      };
    }

    const hasCard = payments.some((p) => p.method === 'card' || p.method === 'instapay' || p.method === 'vodafone_cash');
    if (hasCard && !settings.allowOfflineCardRecordedSales) {
      return {
        success: false,
        error: 'الدفع الإلكتروني/البنكي غير مفعل دون اتصال',
      };
    }

    const db = await getOfflineDB();

    // Check pending sales queue capacity limit
    const currentPending = await db.countFromIndex('offline_queue', 'by_status', 'pending');
    if (currentPending >= settings.offlineMaxPendingSales) {
      return {
        success: false,
        error: `تم الوصول للحد الأقصى للعمليات المعلقة دون اتصال (${settings.offlineMaxPendingSales}). يرجى المزامنة أولاً.`,
      };
    }

    const deviceId = await getOrCreateDeviceId();
    const idempotencyKey = await this.generateSaleIdempotencyKey(tenantId, clientCheckoutId);
    const now = new Date().toISOString();

    const operationId = typeof crypto !== 'undefined' && crypto.randomUUID
      ? crypto.randomUUID()
      : 'op_' + Math.random().toString(36).substring(2, 10) + Date.now().toString(36);

    const priceSnapshot: Record<string, number> = {};
    const stockSnapshot: Record<string, number> = {};

    for (const item of items) {
      const vId = item.variantId && item.variantId.trim() !== '' ? item.variantId.trim() : null;
      const key = `${item.productId}___${vId || 'main'}`;
      priceSnapshot[key] = item.unitSellingPrice;
    }

    const stockKeys = items
      .map((it) => `${it.productId}___${it.variantId || 'main'}`)
      .sort()
      .join(',');
    const conflictKey = `${tenantId}___${payload.shiftId || 'no_shift'}___${stockKeys}`;

    const operation: OfflineOperation<OfflineSalePayload> = {
      id: operationId,
      tenantId,
      branchId,
      operationType: 'pos_sale',
      idempotencyKey,
      payload,
      status,
      priority: 1, // High priority
      createdAt: now,
      updatedAt: now,
      createdBy: payload.cashierNameSnapshot || cashierId,
      createdByUserId: cashierId,
      conflictKey,
      retryCount: 0,
      schemaVersion: 1,
      operationVersion: 1,
      clientSnapshot: {
        temporaryReceiptNumber,
        grandTotal: totalAmount,
        priceSnapshot,
        stockSnapshot,
        shiftId: payload.shiftId || undefined,
      },
    };

    // Calculate cash and card delta for shadow shift updates
    const cashDelta = payments
      .filter((p) => p.method === 'cash')
      .reduce((sum, p) => sum + (Number(p.amount) || 0), 0);
    const cardDelta = payments
      .filter((p) => p.method !== 'cash')
      .reduce((sum, p) => sum + (Number(p.amount) || 0), 0);

    try {
      // ATOMIC MULTI-STORE TRANSACTION:
      // Writes to: offline_queue + shadow_stock + offline_shifts
      const tx = db.transaction(['offline_queue', 'shadow_stock', 'offline_shifts'], 'readwrite');
      const queueStore = tx.objectStore('offline_queue');
      const stockStore = tx.objectStore('shadow_stock');
      const shiftStore = tx.objectStore('offline_shifts');

      // 1. Decrement Shadow Stock on same device to prevent overselling
      for (const item of items) {
        const vId = item.variantId && item.variantId.trim() !== '' ? item.variantId.trim() : null;
        const stockKey = `${tenantId}___${branchId}___${item.productId}___${vId || 'main'}`;
        const existingStock = await stockStore.get(stockKey);

        const conv = Math.max(1, item.conversionFactor || 1);
        const reqQty = item.quantity * conv;

        if (existingStock) {
          const buffer = settings.offlineStockSafetyBuffer || 0;
          const sellable = Math.max(0, existingStock.available - buffer);

          if (reqQty > sellable) {
            tx.abort();
            return {
              success: false,
              error: `الرصيد المحلي المتاح للصنف "${item.productName}" (${sellable}) غير كافٍ للكمية المطلوبة (${reqQty})`,
            };
          }

          existingStock.available = Math.max(0, existingStock.available - reqQty);
          existingStock.onHand = Math.max(0, existingStock.onHand - reqQty);
          existingStock.lastLocallyModifiedAt = now;
          await stockStore.put(existingStock);
          stockSnapshot[stockKey] = existingStock.available;
        }
      }

      // 2. Update Shadow Cash Register / Shift
      if (payload.shiftId) {
        const existingShift = await shiftStore.get(payload.shiftId);
        if (existingShift) {
          existingShift.shadowExpectedCash += cashDelta;
          existingShift.shadowExpectedCard += cardDelta;
          existingShift.pendingSalesCount += 1;
          await shiftStore.put(existingShift);
        }
      }

      // 3. Put Offline Operation
      await queueStore.put(operation);

      // Commit transaction
      await tx.done;

      return { success: true, operation };
    } catch (err: any) {
      console.error('Failed to commit atomic offline transaction:', err);
      return {
        success: false,
        error: `فشل تسجيل العملية محلياً في الذاكرة التخزينية: ${err?.message || 'خطأ في قاعدة البيانات المحلية'}`,
      };
    }
  }

  /**
   * Retrieves all operations in the queue
   */
  public async getAllOperations(tenantId?: string): Promise<OfflineOperation<any>[]> {
    const db = await getOfflineDB();
    if (tenantId) {
      const all = await db.getAllFromIndex('offline_queue', 'by_tenant', tenantId);
      return all.sort((a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime());
    }
    const all = await db.getAll('offline_queue');
    return all.sort((a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime());
  }

  /**
   * Counts operations by status
   */
  public async getCounts(): Promise<{
    pending: number;
    syncing: number;
    synced: number;
    conflict: number;
    failed: number;
    awaiting_confirmation: number;
  }> {
    const db = await getOfflineDB();
    const all = await db.getAll('offline_queue');
    return {
      pending: all.filter((o) => o.status === 'pending').length,
      syncing: all.filter((o) => o.status === 'syncing').length,
      synced: all.filter((o) => o.status === 'synced').length,
      conflict: all.filter((o) => o.status === 'conflict').length,
      failed: all.filter((o) => o.status === 'failed').length,
      awaiting_confirmation: all.filter((o) => o.status === 'awaiting_confirmation').length,
    };
  }

  /**
   * Safeguard 1:
   * Cancels a pending offline operation before sync and reverses local shadow adjustments.
   * Operations in 'awaiting_confirmation' CAN NEVER be locally cancelled.
   */
  public async cancelPendingOperation(
    operationId: string,
    requestingUserId?: string,
    isManagerOrAdmin: boolean = false
  ): Promise<{ success: boolean; error?: string }> {
    const db = await getOfflineDB();
    const op = await db.get('offline_queue', operationId);

    if (!op) {
      return { success: false, error: 'العملية غير موجودة في قائمة الانتظار' };
    }

    if (op.status === 'awaiting_confirmation') {
      return {
        success: false,
        error: 'لا يمكن إلغاء هذه العملية محلياً لأن نتيجة الخادم غير مؤكدة بعد انقطاع الاتصال. يجب التحقق من الخادم وإعادة المحاولة بنفس المفتاح أولاً لتجنب ازدواج الفواتير.',
      };
    }

    if (op.status === 'synced') {
      return { success: false, error: 'تمت مزامنة العملية بالفعل مع الخادم ولا يمكن إلغاؤها محلياً' };
    }

    // Safeguard 7: User Isolation & Cancellation Guard
    // Only original creator or manager/admin can cancel a pending sale
    if (requestingUserId && op.createdByUserId && op.createdByUserId !== requestingUserId && !isManagerOrAdmin) {
      return {
        success: false,
        error: 'غير مصرح لك بإلغاء هذه العملية؛ يمكن فقط لمنشئ العملية أو للمدير إلغاؤها محلياً.',
      };
    }

    if (op.status === 'cancelled') {
      return { success: true };
    }

    // Atomic reversal of shadow stock and shift cash
    try {
      const tx = db.transaction(['offline_queue', 'shadow_stock', 'offline_shifts', 'offline_meta'], 'readwrite');
      const queueStore = tx.objectStore('offline_queue');
      const stockStore = tx.objectStore('shadow_stock');
      const shiftStore = tx.objectStore('offline_shifts');
      const metaStore = tx.objectStore('offline_meta');
      const now = new Date().toISOString();

      if (op.operationType === 'pos_sale' && op.payload) {
        const salePayload = op.payload as OfflineSalePayload;

        // 1. Restore Shadow Stock
        for (const item of salePayload.items || []) {
          const vId = item.variantId && item.variantId.trim() !== '' ? item.variantId.trim() : null;
          const stockKey = `${op.tenantId}___${op.branchId}___${item.productId}___${vId || 'main'}`;
          const existingStock = await stockStore.get(stockKey);
          if (existingStock) {
            const conv = Math.max(1, item.conversionFactor || 1);
            const restoreQty = item.quantity * conv;
            existingStock.available += restoreQty;
            existingStock.onHand += restoreQty;
            existingStock.lastLocallyModifiedAt = now;
            await stockStore.put(existingStock);
          }
        }

        // 2. Restore Shadow Shift Cash
        if (salePayload.shiftId) {
          const existingShift = await shiftStore.get(salePayload.shiftId);
          if (existingShift) {
            const cashDelta = (salePayload.payments || [])
              .filter((p) => p.method === 'cash')
              .reduce((sum, p) => sum + (Number(p.amount) || 0), 0);
            const cardDelta = (salePayload.payments || [])
              .filter((p) => p.method !== 'cash')
              .reduce((sum, p) => sum + (Number(p.amount) || 0), 0);

            existingShift.shadowExpectedCash = Math.max(0, existingShift.shadowExpectedCash - cashDelta);
            existingShift.shadowExpectedCard = Math.max(0, existingShift.shadowExpectedCard - cardDelta);
            existingShift.pendingSalesCount = Math.max(0, existingShift.pendingSalesCount - 1);
            await shiftStore.put(existingShift);
          }
        }
      }

      op.status = 'cancelled';
      op.updatedAt = now;
      await queueStore.put(op);

      // Safeguard 22: Manager Action / Cancellation Audit Trail
      await metaStore.put({
        key: `audit_cancel_${op.id}`,
        value: {
          operationId: op.id,
          temporaryReceipt: op.clientSnapshot?.temporaryReceiptNumber || op.idempotencyKey,
          reason: 'Local cancellation and stock restoration',
          action: 'CANCEL_PENDING_SALE',
          actor: requestingUserId || op.createdByUserId || 'unknown',
          timestamp: now,
        },
        updatedAt: now,
      });

      await tx.done;
      return { success: true };
    } catch (err: any) {
      return { success: false, error: err?.message || 'فشل إلغاء العملية واستعادة الأرصدة المحلية' };
    }
  }

  /**
   * Updates an operation's status
   */
  public async updateOperationStatus(
    operationId: string,
    status: OfflineOperation['status'],
    updates?: Partial<OfflineOperation>
  ): Promise<void> {
    const db = await getOfflineDB();
    const op = await db.get('offline_queue', operationId);
    if (!op) return;

    const updated: OfflineOperation = {
      ...op,
      ...updates,
      status,
      updatedAt: new Date().toISOString(),
    };

    await db.put('offline_queue', updated);
  }
}

export const offlineQueueService = new OfflineQueueService();
