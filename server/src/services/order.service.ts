import { createHash } from 'crypto';
import { v4 as uuidv4 } from 'uuid';
import { getFirestoreDb } from '../config/firebase.js';
import { env } from '../config/environment.js';
import { defaultBranchesService, BranchesService } from './branches.service.js';
import { defaultInventoryService, InventoryService } from './inventory.service.js';
import { defaultPricingEngine, PricingEngine } from './pricing/pricing.engine.js';
import { generateRequestFingerprint } from '../utils/fingerprint.js';
import { AppError, ForbiddenError, NotFoundError } from '../utils/errors.js';
import { ProductUnavailableError } from './pricing/pricing.errors.js';
import { CreateOrderInput, CreateOrderResult, CustomerSnapshot, DeliverySnapshot, OrderStatus, StoredOrder } from '../types/order.types.js';

const ORDERS = 'orders', ITEMS = 'order_items', IDEM = 'idempotency_records', COUNTERS = 'branch_counters';
const memoryOrders = new Map<string, StoredOrder>();
const memoryIdempotency = new Map<string, IdempotencyRecord>();
const memoryCounters = new Map<string, number>();
let memoryWriteChain: Promise<void> = Promise.resolve();
interface IdempotencyRecord { request_hash: string; response_data: CreateOrderResult; order_id: string; }
interface PreparedOrder { order: StoredOrder; }
const ALLOWED_TRANSITIONS: Record<OrderStatus, OrderStatus[]> = {
  pending: ['confirmed', 'preparing', 'cancelled'],
  confirmed: ['preparing', 'cancelled'],
  preparing: ['ready', 'cancelled'],
  ready: ['out_for_delivery', 'delivered', 'completed', 'cancelled'],
  out_for_delivery: ['delivered', 'cancelled'],
  delivered: ['completed'],
  completed: [],
  cancelled: [],
};
const safeDocId = (...parts: string[]) => createHash('sha256').update(parts.join('\u0000')).digest('hex');
const counterKey = (tenantId: string, branchId: string) => `${tenantId}:${branchId}`;

async function withMemoryWrite<T>(work: () => Promise<T> | T): Promise<T> {
  let release!: () => void;
  const previous = memoryWriteChain;
  memoryWriteChain = new Promise<void>((resolve) => { release = resolve; });
  await previous;
  try { return await work(); } finally { release(); }
}

/** Orders, line items, idempotency records and counters are committed together. */
export class OrderService {
  private failNextCommit = false;
  constructor(
    private useMemory: boolean = env.NODE_ENV === 'test',
    private branchesService: BranchesService = defaultBranchesService,
    private inventoryService: InventoryService = defaultInventoryService,
    private pricingEngine: PricingEngine = defaultPricingEngine,
  ) {}

  async createOrder(tenantId: string, clientId: string, input: CreateOrderInput, idempotencyKey?: string): Promise<CreateOrderResult> {
    const requestHash = idempotencyKey ? generateRequestFingerprint(input) : '';
    const prepared = await this.prepareOrder(tenantId, clientId, input, idempotencyKey);
    return this.useMemory
      ? this.commitMemory(tenantId, clientId, input.branch_id, idempotencyKey, requestHash, prepared)
      : this.commitFirestore(tenantId, clientId, input.branch_id, idempotencyKey, requestHash, prepared);
  }

  private async prepareOrder(tenantId: string, clientId: string, input: CreateOrderInput, idempotencyKey?: string): Promise<PreparedOrder> {
    const branch = await this.branchesService.getBranchById(tenantId, input.branch_id);
    if (!branch.is_active) throw new ProductUnavailableError(`Branch '${input.branch_id}' is currently inactive`);
    for (const item of input.items) {
      const availability = await this.inventoryService.checkProductAvailability(tenantId, item.product_id, input.branch_id);
      if (!availability.available) {
        if (availability.reason === 'not_found') throw new NotFoundError(`Product '${item.product_id}' not found`);
        throw new ProductUnavailableError(`Product '${item.product_id}' is unavailable. Reason: ${availability.reason}`);
      }
    }
    const pricing = await this.pricingEngine.calculateOrderPricing({ tenantId, branchId: input.branch_id, orderType: input.order_type, items: input.items, couponCode: input.coupon_code, promotionId: input.promotion_id, delivery: input.delivery ? { zone_id: input.delivery.zone_id, address: input.delivery.address || input.customer?.address } : undefined });
    const createdAt = new Date().toISOString();
    return { order: {
      id: `ord_${uuidv4().replace(/-/g, '').slice(0, 20)}`, tenant_id: tenantId, branch_id: input.branch_id, order_number: '', order_type: input.order_type, status: 'pending', payment_status: 'pending', payment_method: input.payment_method || 'cash',
      customer_snapshot: { customer_id: input.customer?.customer_id || null, name: input.customer?.name || null, phone: input.customer?.phone || null, address: input.customer?.address || null } as CustomerSnapshot,
      delivery_snapshot: { zone_id: input.delivery?.zone_id || null, address: input.delivery?.address || input.customer?.address || null, delivery_fee: pricing.delivery_fee } as DeliverySnapshot,
      pricing_snapshot: pricing, items: pricing.items, subtotal: pricing.subtotal, discount_amount: pricing.discount_total, tax_amount: pricing.tax_amount, delivery_fee: pricing.delivery_fee, total: pricing.grand_total, notes: input.notes || null, created_by: clientId, created_at: createdAt, idempotency_key: idempotencyKey,
    }};
  }
  private resultFor(order: StoredOrder): CreateOrderResult { return { order_id: order.id, order_number: order.order_number, status: order.status, payment_status: order.payment_status, pricing: { subtotal: order.subtotal, discount_total: order.discount_amount, delivery_fee: order.delivery_fee, tax_rate: order.pricing_snapshot.tax_rate, tax_amount: order.tax_amount, grand_total: order.total, currency: order.pricing_snapshot.currency }, items_count: order.items.length, created_at: order.created_at }; }

  private async commitMemory(tenantId: string, clientId: string, branchId: string, key: string | undefined, hash: string, prepared: PreparedOrder) {
    return withMemoryWrite(() => {
      const idemId = key ? safeDocId(tenantId, clientId, key) : undefined;
      const existing = idemId ? memoryIdempotency.get(idemId) : undefined;
      if (existing) { if (existing.request_hash !== hash) throw new AppError('Idempotency key has already been used with a different request payload', 409, 'IDEMPOTENCY_KEY_REUSED'); return existing.response_data; }
      if (this.failNextCommit) { this.failNextCommit = false; throw new AppError('Order persistence failed', 503, 'PERSISTENCE_FAILED'); }
      const next = (memoryCounters.get(counterKey(tenantId, branchId)) || 0) + 1;
      const order = { ...prepared.order, order_number: `#${next}` }, result = this.resultFor(order);
      memoryCounters.set(counterKey(tenantId, branchId), next); memoryOrders.set(order.id, order);
      if (idemId) memoryIdempotency.set(idemId, { request_hash: hash, response_data: result, order_id: order.id });
      return result;
    });
  }

  private async commitFirestore(tenantId: string, clientId: string, branchId: string, key: string | undefined, hash: string, prepared: PreparedOrder) {
    const db = getFirestoreDb(), idemRef = key ? db.collection(IDEM).doc(safeDocId(tenantId, clientId, key)) : null, counterRef = db.collection(COUNTERS).doc(safeDocId(tenantId, branchId));
    try { return await db.runTransaction(async transaction => {
      if (idemRef) { const existing = await transaction.get(idemRef); if (existing.exists) { const record = existing.data() as IdempotencyRecord; if (record.request_hash !== hash) throw new AppError('Idempotency key has already been used with a different request payload', 409, 'IDEMPOTENCY_KEY_REUSED'); return record.response_data; } }
      const next = ((await transaction.get(counterRef)).data()?.last_order_number || 0) + 1;
      const order = { ...prepared.order, order_number: `#${next}` }, result = this.resultFor(order);
      transaction.set(counterRef, { tenant_id: tenantId, branch_id: branchId, last_order_number: next, updated_at: order.created_at }, { merge: true });
      transaction.create(db.collection(ORDERS).doc(order.id), order);
      for (const item of order.items) transaction.create(db.collection(ITEMS).doc(), { order_id: order.id, tenant_id: tenantId, branch_id: branchId, menu_item_id: item.product_id, name: item.name, quantity: item.quantity, unit_price: item.unit_price, addons: item.addons, addons_total: item.addons_total, line_subtotal: item.line_subtotal, line_total: item.line_total, status: 'pending', created_at: order.created_at });
      if (idemRef) transaction.create(idemRef, { tenant_id: tenantId, client_id: clientId, idempotency_key: key, request_hash: hash, order_id: order.id, response_data: result, created_at: order.created_at });
      return result;
    }); } catch (error) { if (error instanceof AppError) throw error; throw new AppError('Order persistence failed; no order was confirmed', 503, 'PERSISTENCE_FAILED'); }
  }

  async getOrderById(tenantId: string, orderId: string): Promise<StoredOrder | null> {
    if (this.useMemory) { const order = memoryOrders.get(orderId); return order?.tenant_id === tenantId ? order : null; }
    try { const order = (await getFirestoreDb().collection(ORDERS).doc(orderId).get()).data() as StoredOrder | undefined; return order?.tenant_id === tenantId ? order : null; } catch { throw new AppError('Order lookup failed', 503, 'PERSISTENCE_FAILED'); }
  }
  async transitionStatus(tenantId: string, orderId: string, target: OrderStatus, allowedBranches: string[]): Promise<StoredOrder> {
    const order = await this.getOrderById(tenantId, orderId); if (!order) throw new NotFoundError('Order not found');
    if (allowedBranches.length && !allowedBranches.includes(order.branch_id)) throw new ForbiddenError('Branch access denied');
    if (!ALLOWED_TRANSITIONS[order.status].includes(target)) throw new AppError(`Invalid transition from ${order.status} to ${target}`, 409, 'INVALID_ORDER_STATUS_TRANSITION');
    const updated = { ...order, status: target, updated_at: new Date().toISOString() };
    if (this.useMemory) { memoryOrders.set(orderId, updated); return updated; }
    try { await getFirestoreDb().collection(ORDERS).doc(orderId).update({ status: target, updated_at: updated.updated_at }); return updated; } catch { throw new AppError('Order update failed', 503, 'PERSISTENCE_FAILED'); }
  }
  toPublicOrder(order: StoredOrder) { return { id: order.id, order_id: order.id, order_number: order.order_number, branch_id: order.branch_id, order_type: order.order_type, status: order.status, payment_status: order.payment_status, payment_method: order.payment_method, customer: order.customer_snapshot ? { name: order.customer_snapshot.name || null } : undefined, items: order.items.map(({ product_id, name, quantity, unit_price, addons, addons_total, line_total }) => ({ product_id, name, quantity, unit_price, addons, addons_total, line_total })), pricing: this.resultFor(order).pricing, created_at: order.created_at, updated_at: order.updated_at }; }
  failNextPersistenceForTest() { this.failNextCommit = true; }
  clearMemory() { memoryOrders.clear(); memoryIdempotency.clear(); memoryCounters.clear(); this.failNextCommit = false; }
}
export const defaultOrderService = new OrderService();
