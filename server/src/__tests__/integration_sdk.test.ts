import { describe, it, expect, beforeEach } from 'vitest';
import request from 'supertest';
import crypto from 'crypto';
import { app } from '../index.js';
import { RmsApiClient } from '../integration/rmsApiClient.js';
import { defaultApiClientService } from '../services/apiClient.service.js';
import { defaultBranchesService } from '../services/branches.service.js';
import { defaultMenuService } from '../services/menu.service.js';
import { defaultSettingsService } from '../services/settings.service.js';
import { defaultOrderService } from '../services/order.service.js';
import { defaultPricingEngine } from '../services/pricing/pricing.engine.js';
import { defaultAnalyticsService } from '../services/analytics.service.js';
import { resetRateLimits } from '../middleware/rateLimiter.js';
import { RmsAuthError, RmsNotFoundError, RmsValidationError } from '../integration/errors.js';

describe('Phase 4B: Integration Layer, SDK, Webhooks & Analytics Test Suite', () => {
  let tenantAToken: string;
  let tenantAHeader: string;
  let tenantBToken: string;
  let adminClientA: any;
  let adminClientB: any;
  let customFetchClient: RmsApiClient;

  const TENANT_A = 'tenant_sushi_bar';
  const TENANT_B = 'tenant_burger_house';

  beforeEach(async () => {
    resetRateLimits();
    defaultApiClientService.clearMemory();
    defaultBranchesService.clearMemory();
    defaultMenuService.clearMemory();
    defaultSettingsService.clearMemory();
    defaultOrderService.clearMemory();
    defaultPricingEngine.clearMemory();
    defaultAnalyticsService.clearMemory();

    // 1. Seed Settings
    defaultSettingsService.setMemoryTenant(TENANT_A, {
      name: 'Sushi Bar Cairo',
      settings: {
        currency: 'EGP',
        taxRate: 14,
        taxIncluded: false,
        deliveryFee: 40,
        minOrder: 100,
      },
    });

    // 2. Seed Branch
    defaultBranchesService.setMemoryBranch('branch_sushi_main', {
      tenant_id: TENANT_A,
      name: 'Sushi Bar Zamalek',
      isActive: true,
    });

    // 3. Seed Category & Products & Addons
    defaultMenuService.setMemoryCategory('cat_rolls', {
      tenant_id: TENANT_A,
      name: 'Maki Rolls',
      isActive: true,
    });

    defaultPricingEngine.setMemoryAddon('addon_ginger', {
      id: 'addon_ginger',
      tenant_id: TENANT_A,
      name: 'Extra Ginger',
      price: 20,
      is_available: true,
    });

    defaultMenuService.setMemoryProduct('prod_california', {
      tenant_id: TENANT_A,
      category_id: 'cat_rolls',
      name: 'California Roll 8pcs',
      price: 220,
      is_available: true,
      addons: [
        { id: 'addon_ginger', name: 'Extra Ginger', price: 20, is_available: true },
      ],
    });

    // 4. Create API Clients
    adminClientA = await defaultApiClientService.createClient({
      tenant_id: TENANT_A,
      name: 'Sushi Bar Web Client',
      permissions: ['api_clients:manage', 'menu:read', 'branches:read', 'delivery:read', 'offers:read', 'orders:create', 'orders:read', 'webhooks:manage'],
      allowed_branch_ids: ['branch_sushi_main'],
      rate_limit_tier: 'standard',
    });
    tenantAToken = `Bearer ${adminClientA.credential_header}`;
    tenantAHeader = adminClientA.credential_header;

    adminClientB = await defaultApiClientService.createClient({
      tenant_id: TENANT_B,
      name: 'Burger House Client',
      permissions: ['api_clients:manage', 'menu:read'],
      allowed_branch_ids: [],
    });
    tenantBToken = `Bearer ${adminClientB.credential_header}`;

    // 5. Setup Custom Fetch for SDK against Express App
    const customFetch = async (input: RequestInfo | URL, init?: RequestInit): Promise<Response> => {
      const urlStr = input.toString();
      const pathAndQuery = urlStr.replace(/^https?:\/\/[^/]+/, '');
      const method = (init?.method || 'GET').toLowerCase() as 'get' | 'post' | 'patch' | 'delete';

      let reqBuilder = (request(app) as any)[method](pathAndQuery);

      if (init?.headers) {
        const headers = init.headers as Record<string, string>;
        for (const [k, v] of Object.entries(headers)) {
          reqBuilder = reqBuilder.set(k, v);
        }
      }

      if (init?.body) {
        reqBuilder = reqBuilder.send(JSON.parse(init.body as string));
      }

      const res = await reqBuilder;

      return new Response(JSON.stringify(res.body), {
        status: res.status,
        headers: new Headers(res.headers as Record<string, string>),
      });
    };

    customFetchClient = new RmsApiClient({
      baseUrl: 'http://localhost:4000/api/v1',
      apiKey: tenantAHeader,
      branchId: 'branch_sushi_main',
      fetch: customFetch,
    });
  });

  // ==================== A) SDK Client Tests ====================

  it('1. SDK getHealth returns system health and uptime', async () => {
    const health: any = await customFetchClient.getHealth();
    expect(health.success).toBe(true);
    expect(health.service).toBe('rms-api');
    expect(health.version).toBeDefined();
  });

  it('2. SDK getSettings returns public restaurant settings', async () => {
    const settings: any = await customFetchClient.getSettings();
    expect(settings.restaurant_name).toBe('Sushi Bar Cairo');
    expect(settings.currency).toBe('EGP');
  });

  it('3. SDK getBranches returns active branches list', async () => {
    const branches = await customFetchClient.getBranches();
    expect(branches.length).toBeGreaterThanOrEqual(1);
    expect(branches[0].id).toBe('branch_sushi_main');
  });

  it('4. SDK getMenu returns categories and products', async () => {
    const menu = await customFetchClient.getMenu();
    expect(menu.categories.length).toBeGreaterThanOrEqual(1);
    expect(menu.products.length).toBeGreaterThanOrEqual(1);
    expect(menu.products[0].name).toBe('California Roll 8pcs');
  });

  it('5. SDK checkProductAvailability returns correct status', async () => {
    const availability = await customFetchClient.checkProductAvailability('prod_california');
    expect(availability.product_id).toBe('prod_california');
    expect(availability.is_available).toBe(true);
  });

  it('6. SDK previewPricing computes deterministic grand total', async () => {
    const pricing = await customFetchClient.previewPricing({
      branch_id: 'branch_sushi_main',
      order_type: 'takeaway',
      items: [
        { product_id: 'prod_california', quantity: 2, addon_ids: ['addon_ginger'] },
      ],
    });

    expect(pricing.currency).toBe('EGP');
    expect(pricing.subtotal).toBe(480); // (220 + 20) * 2
    expect(pricing.grand_total).toBe(547.2); // 480 + 14% tax (67.2)
  });

  it('7. SDK createOrder creates order with idempotency key and safe snapshot', async () => {
    const idempotencyKey = 'sdk_order_key_001';
    const order = await customFetchClient.createOrder(
      {
        branch_id: 'branch_sushi_main',
        order_type: 'takeaway',
        items: [{ product_id: 'prod_california', quantity: 1 }],
      },
      idempotencyKey
    );

    expect(order.order_id).toBeDefined();
    expect(order.order_number).toBe('#1');
    expect(order.pricing.grand_total).toBe(250.8); // 220 + 14% tax (30.8)

    // Retrieve order by ID
    const retrieved = await customFetchClient.getOrder(order.order_id);
    expect(retrieved.id).toBe(order.order_id);
    expect(retrieved.status).toBe('pending');
  });

  it('8. SDK maps 404 and 400 errors properly to typed RmsError classes', async () => {
    await expect(customFetchClient.getProduct('nonexistent_prod')).rejects.toThrow(RmsNotFoundError);
    await expect(
      customFetchClient.createOrder({
        branch_id: 'branch_sushi_main',
        order_type: 'takeaway',
        items: [{ product_id: 'prod_california', quantity: -5 }],
      })
    ).rejects.toThrow(RmsValidationError);
  });

  it('9. SDK with invalid credentials throws RmsAuthError', async () => {
    const invalidClient = new RmsApiClient({
      baseUrl: 'http://localhost:4000/api/v1',
      apiKey: 'rms_live_cli_invalid.rms_sec_wrong_secret',
      fetch: (customFetchClient as any).fetchImpl,
    });

    await expect(invalidClient.getMenu()).rejects.toThrow(RmsAuthError);
  });

  // ==================== B) Webhook Verification Tests ====================

  it('10. verifyWebhookSignature validates authentic HMAC-SHA256 signatures', () => {
    const secret = 'whsec_test_secret_key_12345';
    const rawBody = JSON.stringify({ event_type: 'order.confirmed', payload: { order_id: 'ord_123' } });
    const timestamp = Math.floor(Date.now() / 1000).toString();

    // Generate valid HMAC
    const expectedSig = crypto
      .createHmac('sha256', secret)
      .update(`${timestamp}.${rawBody}`)
      .digest('hex');

    const result = RmsApiClient.verifyWebhookSignature(
      secret,
      rawBody,
      timestamp,
      `t=${timestamp},v1=${expectedSig}`
    );

    expect(result.isValid).toBe(true);
    expect(result.error).toBeUndefined();
  });

  it('11. verifyWebhookSignature rejects tampered request body', () => {
    const secret = 'whsec_test_secret_key_12345';
    const rawBody = JSON.stringify({ event_type: 'order.confirmed', payload: { order_id: 'ord_123' } });
    const timestamp = Math.floor(Date.now() / 1000).toString();

    const expectedSig = crypto
      .createHmac('sha256', secret)
      .update(`${timestamp}.${rawBody}`)
      .digest('hex');

    const tamperedBody = JSON.stringify({ event_type: 'order.confirmed', payload: { order_id: 'ord_TAMPERED' } });

    const result = RmsApiClient.verifyWebhookSignature(
      secret,
      tamperedBody,
      timestamp,
      `t=${timestamp},v1=${expectedSig}`
    );

    expect(result.isValid).toBe(false);
    expect(result.error).toBe('Signature mismatch');
  });

  it('12. verifyWebhookSignature prevents replay attacks with timestamps outside tolerance window', () => {
    const secret = 'whsec_test_secret_key_12345';
    const rawBody = '{"event":"test"}';
    const oldTimestamp = (Math.floor(Date.now() / 1000) - 400).toString(); // 400 seconds old (exceeds 300s)

    const expectedSig = crypto
      .createHmac('sha256', secret)
      .update(`${oldTimestamp}.${rawBody}`)
      .digest('hex');

    const result = RmsApiClient.verifyWebhookSignature(
      secret,
      rawBody,
      oldTimestamp,
      `t=${oldTimestamp},v1=${expectedSig}`,
      300
    );

    expect(result.isValid).toBe(false);
    expect(result.error).toContain('tolerance');
  });

  // ==================== C) Rate Limiting & Tiers Tests ====================

  it('13. Rate limiter sets X-RateLimit headers on responses', async () => {
    const res = await request(app).get('/api/v1/menu').set('Authorization', tenantAToken);
    expect(res.status).toBe(200);
    expect(res.headers['x-ratelimit-limit']).toBeDefined();
    expect(res.headers['x-ratelimit-remaining']).toBeDefined();
    expect(res.headers['x-ratelimit-reset']).toBeDefined();
  });

  it('14. Standard rate limit tier allocates 500 requests limit', async () => {
    const res = await request(app).get('/api/v1/menu').set('Authorization', tenantAToken);
    expect(res.status).toBe(200);
    expect(res.headers['x-ratelimit-limit']).toBe('500');
  });

  // ==================== D) Analytics & Admin Usage Query Tests ====================

  it('15. API requests record non-blocking usage events and admin can query aggregated usage', async () => {
    // 1. Fire a few requests
    await request(app).get('/api/v1/menu').set('Authorization', tenantAToken);
    await request(app).get('/api/v1/branches').set('Authorization', tenantAToken);
    await request(app).get('/api/v1/products/nonexistent').set('Authorization', tenantAToken); // 404

    // 2. Query usage analytics endpoint
    const usageRes = await request(app)
      .get(`/api/v1/admin/api-clients/${adminClientA.client_id}/usage`)
      .set('Authorization', tenantAToken);

    expect(usageRes.status).toBe(200);
    expect(usageRes.body.data.client_id).toBe(adminClientA.client_id);
    expect(usageRes.body.data.total_requests).toBeGreaterThanOrEqual(3);
    expect(usageRes.body.data.count_4xx).toBeGreaterThanOrEqual(1);
    expect(usageRes.body.data.events).toBeDefined();
    expect(usageRes.body.data.avg_response_time_ms).toBeDefined();

    // Verify secrets/passwords are NOT in analytics payload
    const jsonStr = JSON.stringify(usageRes.body);
    expect(jsonStr).not.toContain('rms_sec_');
    expect(jsonStr).not.toContain('Authorization');
  });

  it('16. Tenant B cannot query Tenant A client usage analytics (returns 404)', async () => {
    const res = await request(app)
      .get(`/api/v1/admin/api-clients/${adminClientA.client_id}/usage`)
      .set('Authorization', tenantBToken);

    expect(res.status).toBe(404);
    expect(res.body.success).toBe(false);
  });
});
