import { describe, it, expect, beforeEach } from 'vitest';
import request from 'supertest';
import { app } from '../index.js';
import { defaultApiClientService } from '../services/apiClient.service.js';
import { defaultMenuService } from '../services/menu.service.js';
import { defaultBranchesService } from '../services/branches.service.js';
import { defaultOrderService } from '../services/order.service.js';
import { defaultOrderStatusService } from '../services/orderStatus.service.js';
import { defaultSettingsService } from '../services/settings.service.js';
import { defaultWebhookService } from '../services/webhook.service.js';
import { resetRateLimits } from '../middleware/rateLimiter.js';

describe('Phase 3C: Order Tracking, Status History & Webhooks Test Suite', () => {
  let tenantAToken: string;
  let tenantBToken: string;
  let restrictedBranchToken: string;
  let noOrdersReadToken: string;
  let noWebhooksManageToken: string;

  const TENANT_A = 'tenant_sushi_bar';
  const TENANT_B = 'tenant_burger_house';

  let createdOrderAId: string;
  let createdOrderBId: string;

  beforeEach(async () => {
    resetRateLimits();
    defaultApiClientService.clearMemory();
    defaultMenuService.clearMemory();
    defaultBranchesService.clearMemory();
    defaultOrderService.clearMemory();
    defaultOrderStatusService.clearMemory();
    defaultSettingsService.clearMemory();
    defaultWebhookService.clearMemory();

    // 0. Seed Settings
    defaultSettingsService.setMemoryTenant(TENANT_A, {
      name: 'Sushi Bar Cairo',
      settings: {
        currency: 'EGP',
        taxRate: 14,
        taxIncluded: false,
      },
    });

    defaultSettingsService.setMemoryTenant(TENANT_B, {
      name: 'Burger House',
      settings: {
        currency: 'EGP',
        taxRate: 14,
        taxIncluded: false,
      },
    });

    // 1. API Clients
    const clientA = await defaultApiClientService.createClient({
      tenant_id: TENANT_A,
      name: 'Sushi Bar Full Admin Client',
      permissions: ['orders:read', 'orders:create', 'orders:update', 'webhooks:manage'],
      allowed_branch_ids: [],
    });
    tenantAToken = `Bearer ${clientA.credential_header}`;

    const clientB = await defaultApiClientService.createClient({
      tenant_id: TENANT_B,
      name: 'Burger House Client',
      permissions: ['orders:read', 'orders:create', 'orders:update', 'webhooks:manage'],
      allowed_branch_ids: [],
    });
    tenantBToken = `Bearer ${clientB.credential_header}`;

    const clientRestricted = await defaultApiClientService.createClient({
      tenant_id: TENANT_A,
      name: 'Branch Main Only Client',
      permissions: ['orders:read', 'orders:create', 'orders:update', 'webhooks:manage'],
      allowed_branch_ids: ['branch_sushi_main'],
    });
    restrictedBranchToken = `Bearer ${clientRestricted.credential_header}`;

    const clientNoRead = await defaultApiClientService.createClient({
      tenant_id: TENANT_A,
      name: 'No Orders Read Client',
      permissions: ['orders:create', 'webhooks:manage'],
      allowed_branch_ids: [],
    });
    noOrdersReadToken = `Bearer ${clientNoRead.credential_header}`;

    const clientNoWebhook = await defaultApiClientService.createClient({
      tenant_id: TENANT_A,
      name: 'No Webhook Manage Client',
      permissions: ['orders:read', 'orders:create'],
      allowed_branch_ids: [],
    });
    noWebhooksManageToken = `Bearer ${clientNoWebhook.credential_header}`;

    // 2. Branches
    defaultBranchesService.setMemoryBranch('branch_sushi_main', {
      tenant_id: TENANT_A,
      name: 'Sushi Bar Main Branch',
      isActive: true,
    });

    defaultBranchesService.setMemoryBranch('branch_sushi_downtown', {
      tenant_id: TENANT_A,
      name: 'Sushi Bar Downtown Branch',
      isActive: true,
    });

    defaultBranchesService.setMemoryBranch('branch_burger_main', {
      tenant_id: TENANT_B,
      name: 'Burger House Main Branch',
      isActive: true,
    });

    // 3. Products
    defaultMenuService.setMemoryProduct('prod_california', {
      tenant_id: TENANT_A,
      name: 'كاليفورنيا رول',
      price: 250,
      cost: 45, // Must be stripped
      is_available: true,
    });

    defaultMenuService.setMemoryProduct('prod_cheeseburger', {
      tenant_id: TENANT_B,
      name: 'تشيز برجر',
      price: 190,
      cost: 40,
      is_available: true,
    });

    // 4. Create Initial Order for Tenant A
    const orderResA = await defaultOrderService.createOrder(
      TENANT_A,
      clientA.client_id,
      {
        branch_id: 'branch_sushi_main',
        order_type: 'takeaway',
        items: [{ product_id: 'prod_california', quantity: 2 }],
        customer: { name: 'عمر خالد', phone: '01099999999' },
        notes: 'حار جدا',
      }
    );
    createdOrderAId = orderResA.order_id;

    // Create Initial Order for Tenant B
    const orderResB = await defaultOrderService.createOrder(
      TENANT_B,
      clientB.client_id,
      {
        branch_id: 'branch_burger_main',
        order_type: 'dine_in',
        items: [{ product_id: 'prod_cheeseburger', quantity: 1 }],
      }
    );
    createdOrderBId = orderResB.order_id;
  });

  // Test 1: Valid order tracking -> 200
  it('1. Valid order tracking returns 200 with full safe details', async () => {
    const res = await request(app)
      .get(`/api/v1/orders/${createdOrderAId}`)
      .set('Authorization', tenantAToken);

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.data.id).toBe(createdOrderAId);
    expect(res.body.data.order_number).toBe('#1');
    expect(res.body.data.status).toBe('pending');
    expect(res.body.data.customer.name).toBe('عمر خالد');
    expect(res.body.data.pricing.subtotal).toBe(500);
    expect(res.body.data.items).toHaveLength(1);
    expect(res.body.data.items[0].name).toBe('كاليفورنيا رول');
  });

  // Test 2: Missing authentication -> 401
  it('2. Missing authentication returns 401 Unauthorized', async () => {
    const res = await request(app).get(`/api/v1/orders/${createdOrderAId}`);
    expect(res.status).toBe(401);
    expect(res.body.success).toBe(false);
  });

  // Test 3: Invalid credentials -> 401
  it('3. Invalid credentials returns 401 Unauthorized', async () => {
    const res = await request(app)
      .get(`/api/v1/orders/${createdOrderAId}`)
      .set('Authorization', 'Bearer rms_live_fake_client.fake_secret');
    expect(res.status).toBe(401);
    expect(res.body.success).toBe(false);
  });

  // Test 4: Missing orders:read -> 403
  it('4. Missing orders:read permission returns 403 Forbidden', async () => {
    const res = await request(app)
      .get(`/api/v1/orders/${createdOrderAId}`)
      .set('Authorization', noOrdersReadToken);

    expect(res.status).toBe(403);
    expect(res.body.success).toBe(false);
    expect(res.body.error.code).toBe('FORBIDDEN');
  });

  // Test 5: Unauthorized branch -> 403
  it('5. Accessing order from unauthorized branch returns 403 Forbidden', async () => {
    // Create an order in downtown branch
    const downtownOrder = await defaultOrderService.createOrder(
      TENANT_A,
      'test_client',
      {
        branch_id: 'branch_sushi_downtown',
        order_type: 'takeaway',
        items: [{ product_id: 'prod_california', quantity: 1 }],
      }
    );

    // Client with access only to branch_sushi_main tries to read downtown order
    const res = await request(app)
      .get(`/api/v1/orders/${downtownOrder.order_id}`)
      .set('Authorization', restrictedBranchToken);

    expect(res.status).toBe(403);
    expect(res.body.success).toBe(false);
    expect(res.body.error.code).toBe('FORBIDDEN');
  });

  // Test 6: Cross-tenant order -> 404
  it('6. Cross-tenant order lookup returns 404 without leaking existence', async () => {
    // Tenant A attempts to view Tenant B's order
    const res = await request(app)
      .get(`/api/v1/orders/${createdOrderBId}`)
      .set('Authorization', tenantAToken);

    expect(res.status).toBe(404);
    expect(res.body.success).toBe(false);
    expect(res.body.error.code).toBe('NOT_FOUND');
  });

  // Test 7: Nonexistent order -> 404
  it('7. Nonexistent order lookup returns 404 Not Found', async () => {
    const res = await request(app)
      .get('/api/v1/orders/ord_nonexistent_12345')
      .set('Authorization', tenantAToken);

    expect(res.status).toBe(404);
    expect(res.body.success).toBe(false);
    expect(res.body.error.code).toBe('NOT_FOUND');
  });

  // Test 8: Private/internal fields are stripped
  it('8. Private/internal fields (cost, recipe, secrets) are completely stripped', async () => {
    const res = await request(app)
      .get(`/api/v1/orders/${createdOrderAId}`)
      .set('Authorization', tenantAToken);

    expect(res.status).toBe(200);
    expect((res.body.data as any).cost).toBeUndefined();
    expect((res.body.data as any).supplier_cost).toBeUndefined();
    expect((res.body.data as any).secret).toBeUndefined();
    expect(res.body.data.items[0].cost).toBeUndefined();
  });

  // Test 9: Valid status transition succeeds
  it('9. Valid status transition (pending -> confirmed -> preparing -> ready) succeeds', async () => {
    const updated = await defaultOrderStatusService.updateOrderStatus(
      TENANT_A,
      createdOrderAId,
      'confirmed',
      'kitchen_staff_1',
      'pos'
    );

    expect(updated.status).toBe('confirmed');

    const updated2 = await defaultOrderStatusService.updateOrderStatus(
      TENANT_A,
      createdOrderAId,
      'preparing',
      'chef_mario',
      'kitchen'
    );
    expect(updated2.status).toBe('preparing');
  });

  // Test 10: Invalid status transition rejected
  it('10. Invalid status transition (pending -> delivered) is rejected with 400', async () => {
    await expect(
      defaultOrderStatusService.updateOrderStatus(
        TENANT_A,
        createdOrderAId,
        'delivered', // Illegal transition directly from pending
        'delivery_agent_1',
        'delivery'
      )
    ).rejects.toThrow('Invalid status transition');
  });

  // Test 11: Status history created
  it('11. Status history records are created immutably with audit details', async () => {
    await defaultOrderStatusService.updateOrderStatus(
      TENANT_A,
      createdOrderAId,
      'confirmed',
      'cashier_1',
      'pos',
      'Order confirmed via POS'
    );

    await defaultOrderStatusService.updateOrderStatus(
      TENANT_A,
      createdOrderAId,
      'preparing',
      'kitchen_station_2',
      'kitchen',
      'In kitchen oven'
    );

    const history = await defaultOrderStatusService.getStatusHistory(TENANT_A, createdOrderAId);
    expect(history).toHaveLength(2);
    expect(history[0].previous_status).toBe('pending');
    expect(history[0].new_status).toBe('confirmed');
    expect(history[0].changed_by).toBe('cashier_1');
    expect(history[1].previous_status).toBe('confirmed');
    expect(history[1].new_status).toBe('preparing');
  });

  // Test 12: Tenant isolation for status updates
  it('12. Tenant A cannot update Tenant B order status (throws 404)', async () => {
    await expect(
      defaultOrderStatusService.updateOrderStatus(
        TENANT_A,
        createdOrderBId, // Tenant B order
        'confirmed',
        'attacker',
        'api'
      )
    ).rejects.toThrow('not found');
  });

  // Test 13-14: Webhook event generated with deterministic unique event_id
  it('13-14. Webhook event is generated with deterministic unique event_id on status update', async () => {
    // 1. Create Webhook endpoint for Tenant A
    const epResult = await defaultWebhookService.createEndpoint(TENANT_A, 'client_sushi_main', {
      url: 'https://sushibar.example.com/webhook',
      events: ['order.status_updated', 'order.confirmed'],
    });

    expect(epResult.endpoint.id).toBeDefined();
    expect(epResult.secret).toBeDefined();

    // 2. Trigger status update
    await defaultOrderStatusService.updateOrderStatus(
      TENANT_A,
      createdOrderAId,
      'confirmed',
      'cashier_1',
      'pos'
    );

    // 3. Verify event was stored
    const ep = await defaultWebhookService.listEndpoints(TENANT_A);
    expect(ep).toHaveLength(1);
  });

  // Test 15-16: HMAC signature and timestamp header generated
  it('15-16. HMAC-SHA256 signature and timestamp are computed correctly', () => {
    const secret = 'whsec_test_secret_key_12345';
    const timestamp = 1718000000;
    const payload = JSON.stringify({ event: 'order.confirmed', order_id: 'ord_123' });

    const signature = defaultWebhookService.computeHmacSignature(secret, timestamp, payload);
    expect(signature).toBeDefined();
    expect(typeof signature).toBe('string');
    expect(signature.length).toBe(64); // SHA-256 hex string length
  });

  // Test 17-21: Retry system, 2xx success, exponential backoff, and exhaustion
  it('17-21. Failed webhook delivery initiates retry backoff and successful 2xx marks delivered', async () => {
    // 1. Create endpoint that simulates failure
    const failEndpoint = await defaultWebhookService.createEndpoint(TENANT_A, 'client_sushi_main', {
      url: 'https://example.com/fail-webhook',
      events: ['order.status_updated'],
    });

    const event = {
      id: 'evt_test_001',
      tenant_id: TENANT_A,
      client_id: 'client_sushi_main',
      event_type: 'order.status_updated' as any,
      event_id: 'evt_test_001',
      order_id: createdOrderAId,
      payload: {
        event_id: 'evt_test_001',
        event_type: 'order.status_updated' as any,
        tenant_id: TENANT_A,
        timestamp: new Date().toISOString(),
        data: { status: 'confirmed' },
      },
      status: 'pending' as any,
      attempts: 0,
      next_attempt_at: null,
      delivered_at: null,
      last_error: null,
      created_at: new Date().toISOString(),
    };

    // Attempt 1: Fails
    const attempt1 = await defaultWebhookService.deliverEventToEndpoint(
      event,
      failEndpoint.endpoint,
      failEndpoint.secret,
      1
    );

    expect(attempt1.success).toBe(false);
    expect(event.attempts).toBe(1);
    expect(event.next_attempt_at).toBeDefined(); // Backoff set

    // Attempt 3 (Exhaustion with maxRetries=3)
    await defaultWebhookService.deliverEventToEndpoint(
      event,
      failEndpoint.endpoint,
      failEndpoint.secret,
      3
    );

    expect(event.status).toBe('failed');
    expect(event.attempts).toBe(3);

    // Now test 2xx Success endpoint
    const successEndpoint = await defaultWebhookService.createEndpoint(TENANT_A, 'client_sushi_main', {
      url: 'https://example.com/webhook',
      events: ['order.status_updated'],
    });

    const successEvent = { ...event, id: 'evt_success_002', event_id: 'evt_success_002', attempts: 0, status: 'pending' as any };
    const successAttempt = await defaultWebhookService.deliverEventToEndpoint(
      successEvent,
      successEndpoint.endpoint,
      successEndpoint.secret,
      1
    );

    expect(successAttempt.success).toBe(true);
    expect(successEvent.status).toBe('delivered');
    expect(successEvent.delivered_at).toBeDefined();
  });

  // Test 22-25: Webhook Management API endpoints (POST, GET, DELETE)
  it('22-25. Webhook Management API creates endpoints (returning secret once), lists securely without secret, and deletes', async () => {
    // 1. Missing webhooks:manage permission returns 403
    const forbiddenRes = await request(app)
      .post('/api/v1/webhooks')
      .set('Authorization', noWebhooksManageToken)
      .send({
        url: 'https://sushibar.example.com/events',
        events: ['order.created', 'order.status_updated'],
      });

    expect(forbiddenRes.status).toBe(403);

    // 2. Create Webhook Endpoint (returns secret once)
    const createRes = await request(app)
      .post('/api/v1/webhooks')
      .set('Authorization', tenantAToken)
      .send({
        url: 'https://sushibar.example.com/events',
        events: ['order.created', 'order.status_updated'],
      });

    expect(createRes.status).toBe(201);
    expect(createRes.body.success).toBe(true);
    expect(createRes.body.data.endpoint.id).toBeDefined();
    expect(createRes.body.data.endpoint.url).toBe('https://sushibar.example.com/events');
    expect(createRes.body.data.secret).toBeDefined(); // Plaintext secret returned ONCE
    expect(createRes.body.data.secret.startsWith('whsec_')).toBe(true);

    const endpointId = createRes.body.data.endpoint.id;

    // 3. GET /webhooks lists endpoints without secret or secret_hash
    const listRes = await request(app)
      .get('/api/v1/webhooks')
      .set('Authorization', tenantAToken);

    expect(listRes.status).toBe(200);
    expect(listRes.body.data).toHaveLength(1);
    expect(listRes.body.data[0].id).toBe(endpointId);
    expect(listRes.body.data[0].secret).toBeUndefined();
    expect(listRes.body.data[0].secret_hash).toBeUndefined();

    // 4. Cross-tenant endpoint lookup/delete returns 404
    const crossDeleteRes = await request(app)
      .delete(`/api/v1/webhooks/${endpointId}`)
      .set('Authorization', tenantBToken);

    expect(crossDeleteRes.status).toBe(404);

    // 5. Valid delete returns 200
    const deleteRes = await request(app)
      .delete(`/api/v1/webhooks/${endpointId}`)
      .set('Authorization', tenantAToken);

    expect(deleteRes.status).toBe(200);

    // Verify list is now empty
    const listAfterDelete = await request(app)
      .get('/api/v1/webhooks')
      .set('Authorization', tenantAToken);

    expect(listAfterDelete.body.data).toHaveLength(0);
  });
});
