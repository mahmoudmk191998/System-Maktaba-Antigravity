import { describe, it, expect, beforeEach } from 'vitest';
import request from 'supertest';
import { app } from '../index.js';
import { defaultApiClientService } from '../services/apiClient.service.js';
import { defaultIntegrationService } from '../services/integration.service.js';
import { defaultBranchesService } from '../services/branches.service.js';
import { defaultMenuService } from '../services/menu.service.js';
import { defaultSettingsService } from '../services/settings.service.js';
import { defaultAnalyticsService } from '../services/analytics.service.js';

describe('Phase 8A: Interactive Developer Playground Test Suite', () => {
  const TENANT_A = 'tenant_burrito_bar';
  const TENANT_B = 'tenant_ramen_ya';

  let adminClientA: any;
  let tenantAToken: string;
  let adminClientB: any;
  let tenantBToken: string;
  let integrationA: any;
  let integrationB: any;

  beforeEach(async () => {
    defaultApiClientService.clearMemory();
    defaultIntegrationService.clearMemory();
    defaultBranchesService.clearMemory();
    defaultMenuService.clearMemory();
    defaultSettingsService.clearMemory();
    defaultAnalyticsService.clearMemory();

    // 1. Seed Tenants
    defaultSettingsService.setMemoryTenant(TENANT_A, {
      name: 'Burrito Bar',
      settings: { currency: 'USD', taxRate: 8, deliveryFee: 3 },
    });
    defaultSettingsService.setMemoryTenant(TENANT_B, {
      name: 'Ramen Ya',
      settings: { currency: 'JPY', taxRate: 10, deliveryFee: 500 },
    });

    // 2. Seed Branches
    defaultBranchesService.setMemoryBranch('branch_burrito_1', {
      tenant_id: TENANT_A,
      name: 'Downtown Cantina',
      is_active: true,
    });
    defaultBranchesService.setMemoryBranch('branch_ramen_1', {
      tenant_id: TENANT_B,
      name: 'Shibuya Crossing',
      is_active: true,
    });

    // 3. Create Master Admin Clients
    adminClientA = await defaultApiClientService.createClient({
      tenant_id: TENANT_A,
      name: 'Burrito Admin',
      permissions: ['api_clients:manage', 'menu:read', 'orders:create', 'orders:read', 'branches:read'],
      rate_limit_tier: 'standard',
    });
    tenantAToken = `Bearer ${adminClientA.credential_header}`;

    adminClientB = await defaultApiClientService.createClient({
      tenant_id: TENANT_B,
      name: 'Ramen Admin',
      permissions: ['api_clients:manage', 'menu:read'],
      rate_limit_tier: 'free',
    });
    tenantBToken = `Bearer ${adminClientB.credential_header}`;

    // 4. Onboard Integrations
    const onboardA = await defaultIntegrationService.onboardIntegration(TENANT_A, {
      name: 'Burrito Web App',
      type: 'custom_website',
      permissions: ['menu:read', 'branches:read', 'orders:create'],
      allowed_branch_ids: ['branch_burrito_1'],
    });
    integrationA = onboardA.integration;

    const onboardB = await defaultIntegrationService.onboardIntegration(TENANT_B, {
      name: 'Ramen Kiosk',
      type: 'kiosk',
      permissions: ['menu:read'],
      allowed_branch_ids: ['branch_ramen_1'],
    });
    integrationB = onboardB.integration;
  });

  // ==================== PART 1: Playground Integrations & OpenAPI Spec ====================

  it('1. GET /developer/playground/integrations lists safe metadata and strictly enforces tenant isolation', async () => {
    // Tenant A queries integrations
    const resA = await request(app)
      .get('/api/v1/developer/playground/integrations')
      .set('Authorization', tenantAToken);

    expect(resA.status).toBe(200);
    expect(resA.body.success).toBe(true);
    expect(resA.body.data.length).toBe(1);
    expect(resA.body.data[0].id).toBe(integrationA.id);
    expect(resA.body.data[0].name).toBe('Burrito Web App');
    
    // Crucial: No secret or secret_hash exposed in response
    expect(resA.body.data[0].secret).toBeUndefined();
    expect(resA.body.data[0].client_secret).toBeUndefined();
    expect(resA.body.data[0].secret_hash).toBeUndefined();

    // Tenant B queries integrations
    const resB = await request(app)
      .get('/api/v1/developer/playground/integrations')
      .set('Authorization', tenantBToken);

    expect(resB.status).toBe(200);
    expect(resB.body.data.length).toBe(1);
    expect(resB.body.data[0].id).toBe(integrationB.id);
    expect(resB.body.data[0].name).toBe('Ramen Kiosk');
  });

  it('2. GET /developer/playground/openapi returns sanitized OpenAPI schema', async () => {
    const res = await request(app)
      .get('/api/v1/developer/playground/openapi?version=v1')
      .set('Authorization', tenantAToken);

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.data.openapi).toBeDefined();
    expect(res.body.data.info.version).toBe('1.0.0');
    expect(JSON.stringify(res.body.data)).not.toContain('FIREBASE_PRIVATE_KEY');
    expect(JSON.stringify(res.body.data)).not.toContain('REDIS_URL');
  });

  // ==================== PART 2: Safe Server-Side Request Execution ====================

  it('3. POST /developer/playground/execute safely executes API call and generates code snippets', async () => {
    const res = await request(app)
      .post('/api/v1/developer/playground/execute')
      .set('Authorization', tenantAToken)
      .send({
        integration_id: integrationA.id,
        version: 'v1',
        method: 'GET',
        path: '/branches',
      });

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.data.status_code).toBe(200);
    expect(res.body.data.request_id).toBeDefined();
    expect(res.body.data.duration_ms).toBeGreaterThanOrEqual(0);
    
    // Code examples generated
    expect(res.body.data.code_examples.curl).toContain('curl -X GET');
    expect(res.body.data.code_examples.curl).toContain('<YOUR_API_KEY>');
    expect(res.body.data.code_examples.sdk).toContain('rms.getBranches()');

    // Headers sanitized
    expect(res.body.data.headers.authorization).toBeUndefined();
  });

  it('4. Cross-tenant execution is rejected (Tenant A cannot execute using Tenant B integration)', async () => {
    const res = await request(app)
      .post('/api/v1/developer/playground/execute')
      .set('Authorization', tenantAToken)
      .send({
        integration_id: integrationB.id, // Belongs to Tenant B
        version: 'v1',
        method: 'GET',
        path: '/branches',
      });

    expect(res.status).toBe(404);
    expect(res.body.error.message).toContain('not found');
  });

  it('5. SSRF & Open Proxy Guard blocks arbitrary protocols and destinations', async () => {
    const res = await request(app)
      .post('/api/v1/developer/playground/execute')
      .set('Authorization', tenantAToken)
      .send({
        integration_id: integrationA.id,
        method: 'GET',
        path: 'http://169.254.169.254/latest/meta-data',
      });

    expect(res.status).toBe(400);
    expect(res.body.error.message).toContain('Invalid path');
  });

  it('6. Missing permissions are enforced server-side before execution', async () => {
    // integrationB only has 'menu:read', lacking 'orders:create'
    const res = await request(app)
      .post('/api/v1/developer/playground/execute')
      .set('Authorization', tenantBToken)
      .send({
        integration_id: integrationB.id,
        method: 'POST',
        path: '/orders',
        body: {
          branch_id: 'branch_ramen_1',
          order_type: 'dine_in',
          items: [{ product_id: 'p1', quantity: 1 }],
          customer: { name: 'Test', phone: '+123456' },
          payment_method: 'cash',
        },
      });

    expect(res.status).toBe(403);
    expect(res.body.error.message).toContain('lacks required permission');
  });

  it('7. Revoked / disabled integration cannot execute playground calls', async () => {
    // Revoke integrationA
    await defaultIntegrationService.revokeIntegration(TENANT_A, integrationA.id);

    const res = await request(app)
      .post('/api/v1/developer/playground/execute')
      .set('Authorization', tenantAToken)
      .send({
        integration_id: integrationA.id,
        method: 'GET',
        path: '/branches',
      });

    expect(res.status).toBe(403);
    expect(res.body.error.message).toContain('revoked');
  });
});
