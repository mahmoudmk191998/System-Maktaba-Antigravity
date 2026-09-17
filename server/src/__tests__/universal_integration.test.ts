import { describe, it, expect, beforeEach } from 'vitest';
import request from 'supertest';
import { app } from '../index.js';
import { defaultApiClientService } from '../services/apiClient.service.js';
import { defaultIntegrationService } from '../services/integration.service.js';
import { defaultBranchesService } from '../services/branches.service.js';
import { defaultMenuService } from '../services/menu.service.js';
import { defaultSettingsService } from '../services/settings.service.js';
import { defaultWebhookService } from '../services/webhook.service.js';
import { RmsApiClient } from '../integration/rmsApiClient.js';
import { resetRateLimits } from '../middleware/rateLimiter.js';

describe('Phase 6A: Universal Restaurant Integration Architecture Test Suite', () => {
  const TENANT_A = 'tenant_pizza_palace';
  const TENANT_B = 'tenant_taco_fiesta';

  let tenantAAdminToken: string;
  let tenantBAdminToken: string;

  beforeEach(async () => {
    resetRateLimits();
    defaultApiClientService.clearMemory();
    defaultIntegrationService.clearMemory();
    defaultBranchesService.clearMemory();
    defaultMenuService.clearMemory();
    defaultSettingsService.clearMemory();

    // 1. Seed Tenants
    defaultSettingsService.setMemoryTenant(TENANT_A, {
      name: 'Pizza Palace',
      settings: { currency: 'USD', taxRate: 8, deliveryFee: 5, minOrder: 15 },
    });

    defaultSettingsService.setMemoryTenant(TENANT_B, {
      name: 'Taco Fiesta',
      settings: { currency: 'USD', taxRate: 8, deliveryFee: 4, minOrder: 10 },
    });

    // 2. Seed Branches
    defaultBranchesService.setMemoryBranch('branch_pizza_downtown', {
      tenant_id: TENANT_A,
      name: 'Pizza Downtown',
      isActive: true,
    });
    defaultBranchesService.setMemoryBranch('branch_pizza_uptown', {
      tenant_id: TENANT_A,
      name: 'Pizza Uptown',
      isActive: true,
    });

    defaultBranchesService.setMemoryBranch('branch_taco_central', {
      tenant_id: TENANT_B,
      name: 'Taco Central',
      isActive: true,
    });

    // 3. Seed Products
    defaultMenuService.setMemoryCategory('cat_pizzas', { tenant_id: TENANT_A, name: 'Pizzas', isActive: true });
    defaultMenuService.setMemoryProduct('prod_pizza_pepperoni', {
      tenant_id: TENANT_A,
      category_id: 'cat_pizzas',
      name: 'Pepperoni Pizza',
      price: 18,
      is_available: true,
    });

    // 4. Create Master Admin API Clients for Onboarding Tests
    const adminA = await defaultApiClientService.createClient({
      tenant_id: TENANT_A,
      name: 'Pizza Master Admin',
      permissions: ['api_clients:manage', 'menu:read', 'branches:read', 'orders:create', 'orders:read', 'webhooks:manage'],
      allowed_branch_ids: [],
    });
    tenantAAdminToken = `Bearer ${adminA.credential_header}`;

    const adminB = await defaultApiClientService.createClient({
      tenant_id: TENANT_B,
      name: 'Taco Master Admin',
      permissions: ['api_clients:manage', 'menu:read'],
      allowed_branch_ids: [],
    });
    tenantBAdminToken = `Bearer ${adminB.credential_header}`;
  });

  // ==================== 1. Onboarding Universal Integration ====================

  it('1. POST /admin/integrations onboards a new channel with API client & webhook atomically', async () => {
    const res = await request(app)
      .post('/api/v1/admin/integrations')
      .set('Authorization', tenantAAdminToken)
      .send({
        name: 'Pizza Palace Mobile App',
        type: 'mobile_app',
        description: 'Customer iOS/Android Ordering Application',
        allowed_branch_ids: ['branch_pizza_downtown'],
        allowed_origins: ['https://app.pizzapalace.com'],
        permissions: ['menu:read', 'branches:read', 'orders:create', 'orders:read'],
        rate_limit_tier: 'premium',
        webhook_url: 'https://backend.pizzapalace.com/webhooks/rms',
        webhook_events: ['order.created', 'order.status_updated'],
      });

    expect(res.status).toBe(201);
    expect(res.body.success).toBe(true);
    expect(res.body.data.integration.id).toMatch(/^int_/);
    expect(res.body.data.integration.type).toBe('mobile_app');
    expect(res.body.data.api_key).toMatch(/^rms_live_/);
    expect(res.body.data.webhook_secret).toMatch(/^whsec_/);
    expect(res.body.data.instructions.architecture_flow).toContain('External Website Backend');
  });

  // ==================== 2. Tenant Isolation ====================

  it('2. Tenant A cannot access, view, or modify Tenant B integrations', async () => {
    // 1. Onboard integration for Tenant B
    const bRes = await request(app)
      .post('/api/v1/admin/integrations')
      .set('Authorization', tenantBAdminToken)
      .send({
        name: 'Taco Kiosk',
        type: 'kiosk',
        permissions: ['menu:read', 'orders:create'],
      });

    const bIntegrationId = bRes.body.data.integration.id;

    // 2. Tenant A attempts to access Tenant B's integration
    const getRes = await request(app)
      .get(`/api/v1/admin/integrations/${bIntegrationId}`)
      .set('Authorization', tenantAAdminToken);

    expect(getRes.status).toBe(404);

    // 3. Tenant A attempts to rotate secret of Tenant B's integration
    const rotateRes = await request(app)
      .post(`/api/v1/admin/integrations/${bIntegrationId}/rotate-secret`)
      .set('Authorization', tenantAAdminToken);

    expect(rotateRes.status).toBe(404);
  });

  // ==================== 3. Branch Isolation ====================

  it('3. Integration restricted to branch A cannot access or place orders for branch B', async () => {
    const onboard = await request(app)
      .post('/api/v1/admin/integrations')
      .set('Authorization', tenantAAdminToken)
      .send({
        name: 'Downtown Kiosk',
        type: 'kiosk',
        allowed_branch_ids: ['branch_pizza_downtown'],
        permissions: ['menu:read', 'orders:create'],
      });

    const integrationToken = `Bearer ${onboard.body.data.api_key}`;

    // Attempt to order for 'branch_pizza_uptown'
    const orderRes = await request(app)
      .post('/api/v1/orders')
      .set('Authorization', integrationToken)
      .set('X-Branch-ID', 'branch_pizza_uptown')
      .send({
        branch_id: 'branch_pizza_uptown',
        order_type: 'takeaway',
        items: [{ product_id: 'prod_pizza_pepperoni', quantity: 1 }],
      });

    expect(orderRes.status).toBe(403);
    expect(orderRes.body.error.code).toBe('FORBIDDEN');
  });

  // ==================== 4. Permission Enforcement ====================

  it('4. Integration missing required permission is rejected with 403', async () => {
    const onboard = await request(app)
      .post('/api/v1/admin/integrations')
      .set('Authorization', tenantAAdminToken)
      .send({
        name: 'Read-Only Catalog Widget',
        type: 'custom_website',
        permissions: ['menu:read'],
      });

    const readOnlyToken = `Bearer ${onboard.body.data.api_key}`;

    // Attempt to place order
    const orderRes = await request(app)
      .post('/api/v1/orders')
      .set('Authorization', readOnlyToken)
      .send({
        branch_id: 'branch_pizza_downtown',
        order_type: 'takeaway',
        items: [{ product_id: 'prod_pizza_pepperoni', quantity: 1 }],
      });

    expect(orderRes.status).toBe(403);
    expect(orderRes.body.error.message).toContain('orders:create');
  });

  // ==================== 5. Origin Isolation ====================

  it('5. Integration allowed_origins is enforced and unauthorized origins are rejected', async () => {
    const onboard = await request(app)
      .post('/api/v1/admin/integrations')
      .set('Authorization', tenantAAdminToken)
      .send({
        name: 'Web Store',
        type: 'custom_website',
        allowed_origins: ['https://pizzapalace.com'],
        permissions: ['menu:read'],
      });

    const token = `Bearer ${onboard.body.data.api_key}`;

    // Valid origin
    const validRes = await request(app)
      .get('/api/v1/menu')
      .set('Origin', 'https://pizzapalace.com')
      .set('Authorization', token);

    expect(validRes.status).toBe(200);

    // Invalid origin
    const invalidRes = await request(app)
      .get('/api/v1/menu')
      .set('Origin', 'https://unauthorized-site.com')
      .set('Authorization', token);

    expect(invalidRes.status).toBe(403);
  });

  // ==================== 6. Revoked & Disabled Integrations ====================

  it('6. Revoked or disabled integration cannot authenticate', async () => {
    const onboard = await request(app)
      .post('/api/v1/admin/integrations')
      .set('Authorization', tenantAAdminToken)
      .send({
        name: 'Temporary Promo Site',
        type: 'custom_website',
        permissions: ['menu:read'],
      });

    const intId = onboard.body.data.integration.id;
    const token = `Bearer ${onboard.body.data.api_key}`;

    // Verify it works when active
    const activeRes = await request(app).get('/api/v1/menu').set('Authorization', token);
    expect(activeRes.status).toBe(200);

    // Revoke integration
    await request(app)
      .delete(`/api/v1/admin/integrations/${intId}`)
      .set('Authorization', tenantAAdminToken);

    // Verify it is rejected with 401 Unauthorized
    const revokedRes = await request(app).get('/api/v1/menu').set('Authorization', token);
    expect(revokedRes.status).toBe(401);
  });

  // ==================== 7. Rate Limit Tier ====================

  it('7. Premium rate limit tier applies 2000 requests limit', async () => {
    const onboard = await request(app)
      .post('/api/v1/admin/integrations')
      .set('Authorization', tenantAAdminToken)
      .send({
        name: 'Heavy Aggregator',
        type: 'delivery_aggregator',
        rate_limit_tier: 'premium',
        permissions: ['menu:read'],
      });

    const token = `Bearer ${onboard.body.data.api_key}`;
    const res = await request(app).get('/api/v1/menu').set('Authorization', token);
    expect(res.status).toBe(200);
    expect(res.headers['x-ratelimit-limit']).toBe('2000');
  });

  // ==================== 8. Secret Redaction ====================

  it('8. Secrets never appear in GET /admin/integrations or logs', async () => {
    await request(app)
      .post('/api/v1/admin/integrations')
      .set('Authorization', tenantAAdminToken)
      .send({
        name: 'Audit Channel',
        type: 'custom_website',
        permissions: ['menu:read'],
      });

    const listRes = await request(app)
      .get('/api/v1/admin/integrations')
      .set('Authorization', tenantAAdminToken);

    expect(listRes.status).toBe(200);
    const bodyStr = JSON.stringify(listRes.body);
    expect(bodyStr).not.toContain('rms_sec_');
    expect(bodyStr).not.toContain('client_secret_hash');
  });

  // ==================== 9. Generic SDK Verification ====================

  it('9. Generic RmsApiClient works across any restaurant tenant without special assumptions', async () => {
    const onboard = await request(app)
      .post('/api/v1/admin/integrations')
      .set('Authorization', tenantAAdminToken)
      .send({
        name: 'Generic Pizza Client',
        type: 'custom_website',
        permissions: ['menu:read', 'branches:read'],
      });

    const customFetch = async (url: RequestInfo | URL, init?: RequestInit): Promise<Response> => {
      const urlStr = url.toString();
      const path = urlStr.replace(/^https?:\/\/[^/]+/, '');
      const method = (init?.method || 'GET').toLowerCase();
      const headers = (init?.headers as Record<string, string>) || {};

      let reqBuilder = (request(app) as any)[method](path);
      for (const [k, v] of Object.entries(headers)) {
        reqBuilder = reqBuilder.set(k, v);
      }
      if (init?.body) {
        reqBuilder = reqBuilder.send(init.body as string);
      }

      const agentRes = await reqBuilder;
      return new Response(JSON.stringify(agentRes.body), {
        status: agentRes.status,
        headers: agentRes.headers as any,
      });
    };

    const client = new RmsApiClient({
      baseUrl: 'http://localhost:4000/api/v1',
      apiKey: onboard.body.data.api_key,
      fetch: customFetch as any,
    });

    const settings = await client.getSettings();
    expect(settings.restaurant_name).toBe('Pizza Palace');
    expect(settings.currency).toBe('USD');

    const branches = await client.getBranches();
    expect(branches.length).toBe(2);

    const menu = await client.getMenu();
    expect(menu.products.length).toBe(1);
    expect(menu.products[0].name).toBe('Pepperoni Pizza');
  });
});
