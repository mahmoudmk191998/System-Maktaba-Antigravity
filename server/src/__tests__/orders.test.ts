import { describe, it, expect, beforeEach } from 'vitest';
import request from 'supertest';
import { app } from '../index.js';
import { defaultApiClientService } from '../services/apiClient.service.js';
import { defaultMenuService } from '../services/menu.service.js';
import { defaultBranchesService } from '../services/branches.service.js';
import { defaultDeliveryService } from '../services/delivery.service.js';
import { defaultOffersService } from '../services/offers.service.js';
import { defaultSettingsService } from '../services/settings.service.js';
import { defaultPricingEngine } from '../services/pricing/pricing.engine.js';
import { defaultOrderService } from '../services/order.service.js';
import { defaultOrderNumberService } from '../services/orderNumber.service.js';
import { defaultIdempotencyService } from '../services/idempotency.service.js';
import { defaultInventoryService } from '../services/inventory.service.js';
import { resetRateLimits } from '../middleware/rateLimiter.js';

describe('Phase 3B: RMS Secure Order Creation, Idempotency & Snapshots Suite', () => {
  let tenantAToken: string;
  let tenantBToken: string;
  let restrictedBranchToken: string;
  let limitedPermissionToken: string;

  const TENANT_A = 'tenant_sushi_bar';
  const TENANT_B = 'tenant_burger_house';

  beforeEach(async () => {
    resetRateLimits();
    defaultApiClientService.clearMemory();
    defaultMenuService.clearMemory();
    defaultBranchesService.clearMemory();
    defaultDeliveryService.clearMemory();
    defaultOffersService.clearMemory();
    defaultSettingsService.clearMemory();
    defaultPricingEngine.clearMemory();
    defaultOrderService.clearMemory();
    defaultOrderNumberService.clearMemory();
    defaultIdempotencyService.clearMemory();
    defaultInventoryService.clearMemory();

    // 1. Create API Clients
    const clientA = await defaultApiClientService.createClient({
      tenant_id: TENANT_A,
      name: 'Sushi Bar Full Client',
      permissions: ['menu:read', 'offers:read', 'branches:read', 'delivery:read', 'orders:create', 'orders:read'],
      allowed_branch_ids: [],
    });
    tenantAToken = `Bearer ${clientA.credential_header}`;

    const clientB = await defaultApiClientService.createClient({
      tenant_id: TENANT_B,
      name: 'Burger House Client',
      permissions: ['menu:read', 'offers:read', 'branches:read', 'delivery:read', 'orders:create', 'orders:read'],
      allowed_branch_ids: [],
    });
    tenantBToken = `Bearer ${clientB.credential_header}`;

    const clientRestricted = await defaultApiClientService.createClient({
      tenant_id: TENANT_A,
      name: 'Sushi Bar Branch Main Only',
      permissions: ['menu:read', 'offers:read', 'branches:read', 'delivery:read', 'orders:create'],
      allowed_branch_ids: ['branch_sushi_main'],
    });
    restrictedBranchToken = `Bearer ${clientRestricted.credential_header}`;

    const clientNoOrderPerm = await defaultApiClientService.createClient({
      tenant_id: TENANT_A,
      name: 'Sushi Bar Menu Only Client',
      permissions: ['menu:read'],
      allowed_branch_ids: [],
    });
    limitedPermissionToken = `Bearer ${clientNoOrderPerm.credential_header}`;

    // 2. Seed Branches
    defaultBranchesService.setMemoryBranch('branch_sushi_main', {
      tenant_id: TENANT_A,
      name: 'Sushi Bar Main Branch',
      address: '123 Ocean Ave',
      phone: '01011111111',
      isActive: true,
    });

    defaultBranchesService.setMemoryBranch('branch_sushi_downtown', {
      tenant_id: TENANT_A,
      name: 'Sushi Bar Downtown Branch',
      address: '456 City St',
      phone: '01022222222',
      isActive: true,
    });

    defaultBranchesService.setMemoryBranch('branch_sushi_inactive', {
      tenant_id: TENANT_A,
      name: 'Sushi Bar Closed Branch',
      isActive: false,
    });

    // 3. Seed Products
    defaultMenuService.setMemoryProduct('prod_california', {
      tenant_id: TENANT_A,
      name: 'كاليفورنيا رول',
      price: 250,
      cost: 45, // Must be stripped
      is_available: true,
    });

    defaultMenuService.setMemoryProduct('prod_salmon_sashimi', {
      tenant_id: TENANT_A,
      name: 'ساشيمي سلمون',
      price: 180,
      cost: 60, // Must be stripped
      is_available: true,
    });

    defaultMenuService.setMemoryProduct('prod_unavailable_dish', {
      tenant_id: TENANT_A,
      name: 'طبق غير متاح',
      price: 300,
      is_available: false,
    });

    // Product belonging to Tenant B
    defaultMenuService.setMemoryProduct('prod_cheeseburger', {
      tenant_id: TENANT_B,
      name: 'تشيز برجر',
      price: 190,
      is_available: true,
    });

    // 4. Seed Addons
    defaultPricingEngine.setMemoryAddon('addon_extra_ginger', {
      tenant_id: TENANT_A,
      name: 'زنجبيل إضافي',
      price: 30,
    });

    defaultPricingEngine.setMemoryAddon('addon_spicy_mayo', {
      tenant_id: TENANT_A,
      name: 'سبايسي مايو',
      price: 20,
    });

    // Addon belonging to Tenant B
    defaultPricingEngine.setMemoryAddon('addon_extra_cheese', {
      tenant_id: TENANT_B,
      name: 'جبنة إضافية',
      price: 25,
    });

    // 5. Seed Coupons
    defaultPricingEngine.setMemoryCoupon('coupon_welcome20', {
      tenant_id: TENANT_A,
      code: 'WELCOME20',
      type: 'percentage',
      discount: 20, // 20%
      min_order: 200,
      max_discount: 100,
      is_active: true,
    });

    // 6. Seed Delivery Zones
    defaultDeliveryService.setMemoryZone('zone_zamalek', {
      tenant_id: TENANT_A,
      name: 'الزمالك',
      price: 45,
      estimated_time: 35,
    });

    // 7. Seed Settings (Tax Rate: 14%, not included)
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
  });

  // Test 1: Valid order creation returns 201
  it('1. Valid order creation returns 201 Created with clean response envelope', async () => {
    const res = await request(app)
      .post('/api/v1/orders')
      .set('Authorization', tenantAToken)
      .send({
        branch_id: 'branch_sushi_main',
        order_type: 'delivery',
        items: [
          {
            product_id: 'prod_california',
            quantity: 2,
            addon_ids: ['addon_extra_ginger', 'addon_spicy_mayo'],
          },
        ],
        customer: {
          name: 'أحمد محمود',
          phone: '01012345678',
          address: 'شارع 26 يوليو، الزمالك',
        },
        delivery: {
          zone_id: 'zone_zamalek',
        },
        coupon_code: 'WELCOME20',
        payment_method: 'cash',
        notes: 'بدون شطة',
      });

    expect(res.status).toBe(201);
    expect(res.body.success).toBe(true);
    expect(res.body.data.order_id).toBeDefined();
    expect(res.body.data.order_number).toBe('#1');
    expect(res.body.data.status).toBe('pending');
    expect(res.body.data.payment_status).toBe('pending');
    expect(res.body.data.pricing.subtotal).toBe(600); // (250 + 30 + 20) * 2 = 600
    expect(res.body.data.pricing.discount_total).toBe(100); // 20% capped at 100
    expect(res.body.data.pricing.delivery_fee).toBe(45);
    expect(res.body.data.pricing.tax_amount).toBe(70); // 14% of 500
    expect(res.body.data.pricing.grand_total).toBe(615); // 500 + 45 + 70
    expect(res.headers['x-request-id']).toBeDefined();
  });

  // Test 2: Missing API credentials returns 401
  it('2. Missing API credentials returns 401 Unauthorized', async () => {
    const res = await request(app)
      .post('/api/v1/orders')
      .send({
        branch_id: 'branch_sushi_main',
        order_type: 'dine_in',
        items: [{ product_id: 'prod_california', quantity: 1 }],
      });

    expect(res.status).toBe(401);
    expect(res.body.success).toBe(false);
  });

  // Test 3: Invalid API credentials returns 401
  it('3. Invalid API credentials returns 401 Unauthorized', async () => {
    const res = await request(app)
      .post('/api/v1/orders')
      .set('Authorization', 'Bearer rms_live_fake_client.fake_secret')
      .send({
        branch_id: 'branch_sushi_main',
        order_type: 'dine_in',
        items: [{ product_id: 'prod_california', quantity: 1 }],
      });

    expect(res.status).toBe(401);
    expect(res.body.success).toBe(false);
  });

  // Test 4: Missing orders:create permission returns 403
  it('4. Missing orders:create permission returns 403 Forbidden', async () => {
    const res = await request(app)
      .post('/api/v1/orders')
      .set('Authorization', limitedPermissionToken)
      .send({
        branch_id: 'branch_sushi_main',
        order_type: 'dine_in',
        items: [{ product_id: 'prod_california', quantity: 1 }],
      });

    expect(res.status).toBe(403);
    expect(res.body.success).toBe(false);
    expect(res.body.error.code).toBe('FORBIDDEN');
  });

  // Test 5: Unauthorized branch returns 403
  it('5. Unauthorized branch access returns 403 Forbidden', async () => {
    const res = await request(app)
      .post('/api/v1/orders')
      .set('Authorization', restrictedBranchToken)
      .send({
        branch_id: 'branch_sushi_downtown', // client only allowed branch_sushi_main
        order_type: 'dine_in',
        items: [{ product_id: 'prod_california', quantity: 1 }],
      });

    expect(res.status).toBe(403);
    expect(res.body.success).toBe(false);
    expect(res.body.error.code).toBe('FORBIDDEN');
  });

  // Test 6: Inactive branch rejected
  it('6. Inactive branch is rejected with 400', async () => {
    const res = await request(app)
      .post('/api/v1/orders')
      .set('Authorization', tenantAToken)
      .send({
        branch_id: 'branch_sushi_inactive',
        order_type: 'dine_in',
        items: [{ product_id: 'prod_california', quantity: 1 }],
      });

    expect(res.status).toBe(400);
    expect(res.body.success).toBe(false);
  });

  // Test 7: Cross-tenant product rejected
  it('7. Cross-tenant product is rejected (returns 404)', async () => {
    const res = await request(app)
      .post('/api/v1/orders')
      .set('Authorization', tenantAToken)
      .send({
        branch_id: 'branch_sushi_main',
        order_type: 'dine_in',
        items: [{ product_id: 'prod_cheeseburger', quantity: 1 }], // belongs to Tenant B
      });

    expect(res.status).toBe(404);
    expect(res.body.success).toBe(false);
  });

  // Test 8: Cross-tenant addon rejected
  it('8. Cross-tenant addon is rejected with 400', async () => {
    const res = await request(app)
      .post('/api/v1/orders')
      .set('Authorization', tenantAToken)
      .send({
        branch_id: 'branch_sushi_main',
        order_type: 'dine_in',
        items: [
          {
            product_id: 'prod_california',
            quantity: 1,
            addon_ids: ['addon_extra_cheese'], // belongs to Tenant B
          },
        ],
      });

    expect(res.status).toBe(400);
    expect(res.body.success).toBe(false);
  });

  // Test 9: Inactive product rejected
  it('9. Inactive product is rejected with 400 PRODUCT_UNAVAILABLE', async () => {
    const res = await request(app)
      .post('/api/v1/orders')
      .set('Authorization', tenantAToken)
      .send({
        branch_id: 'branch_sushi_main',
        order_type: 'dine_in',
        items: [{ product_id: 'prod_unavailable_dish', quantity: 1 }],
      });

    expect(res.status).toBe(400);
    expect(res.body.success).toBe(false);
  });

  // Test 10: Invalid quantity rejected
  it('10. Invalid quantity <= 0 is rejected with 400 Validation Error', async () => {
    const res = await request(app)
      .post('/api/v1/orders')
      .set('Authorization', tenantAToken)
      .send({
        branch_id: 'branch_sushi_main',
        order_type: 'dine_in',
        items: [{ product_id: 'prod_california', quantity: 0 }],
      });

    expect(res.status).toBe(400);
    expect(res.body.success).toBe(false);
  });

  // Test 11: Decimal quantity rejected
  it('11. Decimal quantity is rejected with 400 Validation Error', async () => {
    const res = await request(app)
      .post('/api/v1/orders')
      .set('Authorization', tenantAToken)
      .send({
        branch_id: 'branch_sushi_main',
        order_type: 'dine_in',
        items: [{ product_id: 'prod_california', quantity: 3.5 }],
      });

    expect(res.status).toBe(400);
    expect(res.body.success).toBe(false);
  });

  // Test 12-17: Client-supplied price, subtotal, discount, tax, delivery fee, grand total, status, order_number rejected
  it('12-17. Client-supplied financial and operational fields are strictly rejected', async () => {
    const res = await request(app)
      .post('/api/v1/orders')
      .set('Authorization', tenantAToken)
      .send({
        branch_id: 'branch_sushi_main',
        order_type: 'dine_in',
        subtotal: 1, // Manipulated subtotal
        items: [{ product_id: 'prod_california', quantity: 1, price: 1 } as any],
      });

    expect(res.status).toBe(400);
    expect(res.body.success).toBe(false);
    expect(res.body.error.code).toBe('VALIDATION_ERROR');
  });

  // Test 18-22: Server calculates authoritative pricing, delivery, and tax
  it('18-22. Server calculates authoritative pricing and zero delivery fee for takeaway', async () => {
    const res = await request(app)
      .post('/api/v1/orders')
      .set('Authorization', tenantAToken)
      .send({
        branch_id: 'branch_sushi_main',
        order_type: 'takeaway',
        items: [{ product_id: 'prod_california', quantity: 2 }], // 2 * 250 = 500
      });

    expect(res.status).toBe(201);
    expect(res.body.data.pricing.subtotal).toBe(500);
    expect(res.body.data.pricing.delivery_fee).toBe(0);
    expect(res.body.data.pricing.tax_amount).toBe(70); // 14% of 500
    expect(res.body.data.pricing.grand_total).toBe(570);
  });

  // Test 23-24: Order snapshot stores authoritative prices and is immutable
  it('23-24. Order snapshot stores exact prices and changing menu price later does not affect past orders', async () => {
    // 1. Create order when California Roll is 250 EGP
    const res = await request(app)
      .post('/api/v1/orders')
      .set('Authorization', tenantAToken)
      .send({
        branch_id: 'branch_sushi_main',
        order_type: 'dine_in',
        items: [{ product_id: 'prod_california', quantity: 1 }],
      });

    expect(res.status).toBe(201);
    const orderId = res.body.data.order_id;

    // 2. Fetch stored order snapshot
    const storedOrder = await defaultOrderService.getOrderById(TENANT_A, orderId);
    expect(storedOrder).toBeDefined();
    expect(storedOrder?.items[0].unit_price).toBe(250);
    expect(storedOrder?.pricing_snapshot.subtotal).toBe(250);

    // 3. Simulate Menu Price inflation (price increased to 350 EGP)
    defaultMenuService.setMemoryProduct('prod_california', {
      tenant_id: TENANT_A,
      name: 'كاليفورنيا رول',
      price: 350,
      is_available: true,
    });

    // 4. Verify historical order retains original 250 EGP snapshot
    const historicalOrder = await defaultOrderService.getOrderById(TENANT_A, orderId);
    expect(historicalOrder?.items[0].unit_price).toBe(250);
    expect(historicalOrder?.pricing_snapshot.subtotal).toBe(250);
  });

  // Test 25-26: Atomic Order Numbering & concurrency
  it('25-26. Order number is generated sequentially without collisions', async () => {
    const res1 = await request(app)
      .post('/api/v1/orders')
      .set('Authorization', tenantAToken)
      .send({
        branch_id: 'branch_sushi_main',
        order_type: 'dine_in',
        items: [{ product_id: 'prod_california', quantity: 1 }],
      });

    const res2 = await request(app)
      .post('/api/v1/orders')
      .set('Authorization', tenantAToken)
      .send({
        branch_id: 'branch_sushi_main',
        order_type: 'dine_in',
        items: [{ product_id: 'prod_salmon_sashimi', quantity: 1 }],
      });

    expect(res1.body.data.order_number).toBe('#1');
    expect(res2.body.data.order_number).toBe('#2');
  });

  // Test 27-29: Idempotency protection
  it('27-29. Idempotency-Key deduplicates requests and returns 409 on payload conflict', async () => {
    const idempotencyKey = 'idem_test_key_001';
    const payload = {
      branch_id: 'branch_sushi_main',
      order_type: 'dine_in',
      items: [{ product_id: 'prod_california', quantity: 2 }],
    };

    // First call: creates order
    const res1 = await request(app)
      .post('/api/v1/orders')
      .set('Authorization', tenantAToken)
      .set('Idempotency-Key', idempotencyKey)
      .send(payload);

    expect(res1.status).toBe(201);
    const orderId1 = res1.body.data.order_id;

    // Retry same request: returns identical cached order
    const res2 = await request(app)
      .post('/api/v1/orders')
      .set('Authorization', tenantAToken)
      .set('Idempotency-Key', idempotencyKey)
      .send(payload);

    expect(res2.status).toBe(201);
    expect(res2.body.data.order_id).toBe(orderId1);

    // Same key with DIFFERENT payload: returns 409 Conflict
    const conflictingPayload = {
      branch_id: 'branch_sushi_main',
      order_type: 'dine_in',
      items: [{ product_id: 'prod_salmon_sashimi', quantity: 5 }],
    };

    const res3 = await request(app)
      .post('/api/v1/orders')
      .set('Authorization', tenantAToken)
      .set('Idempotency-Key', idempotencyKey)
      .send(conflictingPayload);

    expect(res3.status).toBe(409);
    expect(res3.body.success).toBe(false);
    expect(res3.body.error.code).toBe('IDEMPOTENCY_KEY_REUSED');
  });

  // Test 30: Different idempotency keys create separate orders
  it('30. Different Idempotency-Keys create separate orders', async () => {
    const payload = {
      branch_id: 'branch_sushi_main',
      order_type: 'dine_in',
      items: [{ product_id: 'prod_california', quantity: 1 }],
    };

    const res1 = await request(app)
      .post('/api/v1/orders')
      .set('Authorization', tenantAToken)
      .set('Idempotency-Key', 'key_alpha')
      .send(payload);

    const res2 = await request(app)
      .post('/api/v1/orders')
      .set('Authorization', tenantAToken)
      .set('Idempotency-Key', 'key_beta')
      .send(payload);

    expect(res1.body.data.order_id).not.toBe(res2.body.data.order_id);
    expect(res1.body.data.order_number).toBe('#1');
    expect(res2.body.data.order_number).toBe('#2');
  });

  // Test 31: Inventory unavailable prevents order creation
  it('31. Inventory unavailable prevents order creation', async () => {
    // Setup recipe for prod_california with ingredient 'crab_meat' having stock 0
    defaultInventoryService.setMemoryRecipe('prod_california', 'rec_california', TENANT_A, [
      { item_id: 'ing_crab_meat', quantity: 100 },
    ]);
    defaultInventoryService.setMemoryStock('branch_sushi_main', 'ing_crab_meat', 0); // Out of stock

    const res = await request(app)
      .post('/api/v1/orders')
      .set('Authorization', tenantAToken)
      .send({
        branch_id: 'branch_sushi_main',
        order_type: 'dine_in',
        items: [{ product_id: 'prod_california', quantity: 1 }],
      });

    expect(res.status).toBe(400);
    expect(res.body.success).toBe(false);
  });

  // Test 32-35: Customer snapshot, address snapshot, payment method stored
  it('32-35. Customer snapshot, delivery address snapshot, and payment method stored', async () => {
    const res = await request(app)
      .post('/api/v1/orders')
      .set('Authorization', tenantAToken)
      .send({
        branch_id: 'branch_sushi_main',
        order_type: 'delivery',
        items: [{ product_id: 'prod_salmon_sashimi', quantity: 2 }],
        customer: {
          name: 'كريم عادل',
          phone: '01234567890',
          address: 'المعادي، القاهرة',
        },
        delivery: {
          zone_id: 'zone_zamalek',
          address: 'المعادي، القاهرة',
        },
        payment_method: 'card',
      });

    expect(res.status).toBe(201);
    const orderId = res.body.data.order_id;
    const stored = await defaultOrderService.getOrderById(TENANT_A, orderId);

    expect(stored?.customer_snapshot.name).toBe('كريم عادل');
    expect(stored?.customer_snapshot.phone).toBe('01234567890');
    expect(stored?.delivery_snapshot.address).toBe('المعادي، القاهرة');
    expect(stored?.payment_method).toBe('card');
  });

  // Test 36-37: Client cannot set status or order_number
  it('36-37. Client cannot set order status or order_number', async () => {
    const res = await request(app)
      .post('/api/v1/orders')
      .set('Authorization', tenantAToken)
      .send({
        branch_id: 'branch_sushi_main',
        order_type: 'dine_in',
        status: 'completed', // Client tries to bypass payment
        order_number: '#999',
        items: [{ product_id: 'prod_california', quantity: 1 }],
      });

    expect(res.status).toBe(400);
    expect(res.body.success).toBe(false);
    expect(res.body.error.code).toBe('VALIDATION_ERROR');
  });

  // Test 38: Tenant isolation is enforced
  it('38. Tenant isolation is enforced (Tenant A cannot see Tenant B orders)', async () => {
    const resA = await request(app)
      .post('/api/v1/orders')
      .set('Authorization', tenantAToken)
      .send({
        branch_id: 'branch_sushi_main',
        order_type: 'dine_in',
        items: [{ product_id: 'prod_california', quantity: 1 }],
      });

    const orderIdA = resA.body.data.order_id;

    // Tenant B attempts to fetch Tenant A order
    const orderForTenantB = await defaultOrderService.getOrderById(TENANT_B, orderIdA);
    expect(orderForTenantB).toBeNull();
  });

  // Test 39: API client isolation for idempotency keys
  it('39. Idempotency keys are isolated per API client / tenant', async () => {
    const sharedKey = 'client_shared_idempotency_key';

    // Seed branch for Tenant B
    defaultBranchesService.setMemoryBranch('branch_burger_main', {
      tenant_id: TENANT_B,
      name: 'Burger Main Branch',
      isActive: true,
    });

    const resA = await request(app)
      .post('/api/v1/orders')
      .set('Authorization', tenantAToken)
      .set('Idempotency-Key', sharedKey)
      .send({
        branch_id: 'branch_sushi_main',
        order_type: 'dine_in',
        items: [{ product_id: 'prod_california', quantity: 1 }],
      });

    const resB = await request(app)
      .post('/api/v1/orders')
      .set('Authorization', tenantBToken)
      .set('Idempotency-Key', sharedKey)
      .send({
        branch_id: 'branch_burger_main',
        order_type: 'dine_in',
        items: [{ product_id: 'prod_cheeseburger', quantity: 1 }],
      });

    expect(resA.status).toBe(201);
    expect(resB.status).toBe(201);
    expect(resA.body.data.order_id).not.toBe(resB.body.data.order_id);
  });

  // Test 40: Internal/private fields (cost, recipe) are not returned
  it('40. Internal/private fields (cost, recipe) are not returned in response', async () => {
    const res = await request(app)
      .post('/api/v1/orders')
      .set('Authorization', tenantAToken)
      .send({
        branch_id: 'branch_sushi_main',
        order_type: 'dine_in',
        items: [{ product_id: 'prod_california', quantity: 1 }],
      });

    expect(res.status).toBe(201);
    expect((res.body.data as any).cost).toBeUndefined();
    expect((res.body.data as any).supplier_cost).toBeUndefined();
    expect((res.body.data as any).recipe).toBeUndefined();
  });

  it('41. Concurrent retries with one idempotency key create exactly one order and counter value', async () => {
    const payload = { branch_id: 'branch_sushi_main', order_type: 'dine_in', items: [{ product_id: 'prod_california', quantity: 1 }] };
    const responses = await Promise.all(Array.from({ length: 12 }, () => request(app).post('/api/v1/orders').set('Authorization', tenantAToken).set('Idempotency-Key', 'concurrent-key').send(payload)));
    expect(responses.every(r => r.status === 201)).toBe(true);
    expect(new Set(responses.map(r => r.body.data.order_id)).size).toBe(1);
    expect(new Set(responses.map(r => r.body.data.order_number)).size).toBe(1);
  });

  it('42. Failed persistence leaves no idempotency record or consumed order number', async () => {
    defaultOrderService.failNextPersistenceForTest();
    const payload = { branch_id: 'branch_sushi_main', order_type: 'dine_in', items: [{ product_id: 'prod_california', quantity: 1 }] };
    const failed = await request(app).post('/api/v1/orders').set('Authorization', tenantAToken).set('Idempotency-Key', 'recovery-key').send(payload);
    expect(failed.status).toBe(503);
    const recovered = await request(app).post('/api/v1/orders').set('Authorization', tenantAToken).set('Idempotency-Key', 'recovery-key').send(payload);
    expect(recovered.status).toBe(201);
    expect(recovered.body.data.order_number).toBe('#1');
  });

  it('43-45. GET order hides PII, enforces tenant isolation, and state transitions are validated', async () => {
    const created = await request(app).post('/api/v1/orders').set('Authorization', tenantAToken).send({ branch_id: 'branch_sushi_main', order_type: 'dine_in', items: [{ product_id: 'prod_california', quantity: 1 }], customer: { phone: '01000000000', address: 'private address' } });
    const id = created.body.data.order_id;
    const read = await request(app).get(`/api/v1/orders/${id}`).set('Authorization', tenantAToken);
    expect(read.status).toBe(200); expect(read.body.data.customer_snapshot).toBeUndefined(); expect(JSON.stringify(read.body)).not.toContain('01000000000');
    expect((await request(app).get(`/api/v1/orders/${id}`).set('Authorization', tenantBToken)).status).toBe(404);
    expect((await request(app).patch(`/api/v1/orders/${id}/status`).set('Authorization', tenantAToken).send({ status: 'ready' })).status).toBe(403);
    await expect(defaultOrderService.transitionStatus(TENANT_A, id, 'ready', [])).rejects.toMatchObject({ code: 'INVALID_ORDER_STATUS_TRANSITION' });
    await expect(defaultOrderService.transitionStatus(TENANT_A, id, 'preparing', [])).resolves.toMatchObject({ status: 'preparing' });
  });
});

