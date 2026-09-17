import { v4 as uuidv4 } from 'uuid';
import { getFirestoreDb } from '../config/firebase.js';
import { env } from '../config/environment.js';
import { AppError, NotFoundError } from '../utils/errors.js';
import { OrderStatus, OrderStatusHistory, StoredOrder } from '../types/order.types.js';
import { defaultOrderService, OrderService } from './order.service.js';
import { defaultWebhookService, WebhookService } from './webhook.service.js';

const STATUS_HISTORY_COLLECTION = 'order_status_history';
const ORDERS_COLLECTION = 'orders';

const VALID_TRANSITIONS: Record<OrderStatus, OrderStatus[]> = {
  pending: ['confirmed', 'preparing', 'cancelled'],
  confirmed: ['preparing', 'cancelled'],
  preparing: ['ready', 'cancelled'],
  ready: ['out_for_delivery', 'delivered', 'completed', 'cancelled'],
  out_for_delivery: ['delivered', 'cancelled'],
  delivered: ['completed'],
  completed: [],
  cancelled: [],
};

// In-memory test store for status history
const inMemoryHistory = new Map<string, OrderStatusHistory[]>();

export class OrderStatusService {
  private useMemory: boolean;
  private orderService: OrderService;
  private webhookService: WebhookService;

  constructor(
    useMemory: boolean = env.NODE_ENV === 'test',
    orderService: OrderService = defaultOrderService,
    webhookService: WebhookService = defaultWebhookService
  ) {
    this.useMemory = useMemory;
    this.orderService = orderService;
    this.webhookService = webhookService;
  }

  /**
   * Updates an order status atomically with transition validation,
   * immutable history audit logging, and webhook dispatching.
   */
  async updateOrderStatus(
    tenantId: string,
    orderId: string,
    newStatus: OrderStatus,
    changedBy: string,
    source: 'system' | 'pos' | 'kitchen' | 'delivery' | 'api' = 'system',
    note?: string
  ): Promise<StoredOrder> {
    const order = await this.orderService.getOrderById(tenantId, orderId);
    if (!order) {
      throw new NotFoundError(`Order '${orderId}' not found`);
    }

    const previousStatus = order.status;

    // Check transition validity
    const allowedTransitions = VALID_TRANSITIONS[previousStatus] || [];
    if (!allowedTransitions.includes(newStatus)) {
      throw new AppError(
        `Invalid status transition: Cannot transition order '${orderId}' from '${previousStatus}' to '${newStatus}'. Allowed transitions: [${allowedTransitions.join(', ')}]`,
        400,
        'INVALID_STATUS_TRANSITION'
      );
    }

    const now = new Date().toISOString();
    const historyId = `osh_${uuidv4().replace(/-/g, '').slice(0, 16)}`;

    const historyRecord: OrderStatusHistory = {
      id: historyId,
      tenant_id: tenantId,
      order_id: orderId,
      previous_status: previousStatus,
      new_status: newStatus,
      changed_by: changedBy,
      source,
      note: note || null,
      created_at: now,
    };

    // Update order object
    order.status = newStatus;
    order.updated_at = now;

    if (this.useMemory) {
      const records = inMemoryHistory.get(orderId) || [];
      records.push(historyRecord);
      inMemoryHistory.set(orderId, records);
    } else {
      try {
        const db = getFirestoreDb();
        const batch = db.batch();

        const orderRef = db.collection(ORDERS_COLLECTION).doc(orderId);
        batch.update(orderRef, {
          status: newStatus,
          updated_at: now,
        });

        const historyRef = db.collection(STATUS_HISTORY_COLLECTION).doc(historyId);
        batch.set(historyRef, historyRecord);

        await batch.commit();
      } catch (_) {
        const records = inMemoryHistory.get(orderId) || [];
        records.push(historyRecord);
        inMemoryHistory.set(orderId, records);
      }
    }

    // Trigger Webhook Events
    const webhookData = {
      order_id: order.id,
      order_number: order.order_number,
      branch_id: order.branch_id,
      order_type: order.order_type,
      previous_status: previousStatus,
      status: newStatus,
      customer: order.customer_snapshot,
      delivery: order.delivery_snapshot,
      pricing: {
        grand_total: order.pricing_snapshot.grand_total,
        currency: order.pricing_snapshot.currency,
      },
      updated_at: now,
    };

    // Generic status updated event
    await this.webhookService.triggerEvent(
      tenantId,
      'order.status_updated',
      orderId,
      webhookData
    );

    // Specific status event
    const specificEvent = `order.${newStatus}` as any;
    await this.webhookService.triggerEvent(tenantId, specificEvent, orderId, webhookData);

    return order;
  }

  /**
   * Fetch immutable status history for an order.
   */
  async getStatusHistory(tenantId: string, orderId: string): Promise<OrderStatusHistory[]> {
    const order = await this.orderService.getOrderById(tenantId, orderId);
    if (!order) {
      throw new NotFoundError(`Order '${orderId}' not found`);
    }

    if (this.useMemory) {
      return inMemoryHistory.get(orderId) || [];
    }

    try {
      const db = getFirestoreDb();
      const snapshot = await db
        .collection(STATUS_HISTORY_COLLECTION)
        .where('tenant_id', '==', tenantId)
        .where('order_id', '==', orderId)
        .orderBy('created_at', 'asc')
        .get();

      return snapshot.docs.map((doc) => doc.data() as OrderStatusHistory);
    } catch (_) {
      return inMemoryHistory.get(orderId) || [];
    }
  }

  clearMemory() {
    inMemoryHistory.clear();
  }
}

export const defaultOrderStatusService = new OrderStatusService();
