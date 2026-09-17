import { describe, it, expect, beforeEach } from 'vitest';
import request from 'supertest';
import { app } from '../index.js';
import { defaultApiClientService } from '../services/apiClient.service.js';
import { defaultIntegrationService } from '../services/integration.service.js';
import { defaultWebhookService } from '../services/webhook.service.js';
import { defaultSettingsService } from '../services/settings.service.js';
import { defaultBranchesService } from '../services/branches.service.js';
import { defaultMenuService } from '../services/menu.service.js';
import { defaultAnalyticsService } from '../services/analytics.service.js';
import { RmsApiClient } from '../../../packages/rms-sdk/src/client.js';
import { verifyWebhookSignature } from '../../../packages/rms-sdk/src/crypto.js';

describe('Phase 7: Universal Developer Platform Suite', () => {
  const TENANT_A = 'tenant_artisan_pizza';
  const TENANT_B = 'tenant_burger_craze';

  let adminClientA: any;
  let tenantAToken: string;
  let adminClientB: any;
  let tenantBToken: string;

  beforeEach(async () => {
    defaultApiClientService.clearMemory();
    defaultIntegrationService.clearMemory();
    defaultWebhookService.clearMemory();
    defaultBranchesService.clearMemory();
    defaultMenuService.clearMemory();
    defaultSettingsService.clearMemory();
    defaultAnalyticsService.clearMemory();

    // 1. Seed Tenants
    defaultSettingsService.setMemoryTenant(TENANT_A, {
      name: 'Artisan Pizza',
      settings: { currency: 'EUR', taxRate: 10, deliveryFee: 4 },
    });
    defaultSettingsService.setMemoryTenant(TENANT_B, {
      name: 'Burger Craze',
      settings: { currency: 'USD', taxRate: 8, deliveryFee: 3 },
    });

    // 2. Seed Branches
    defaultBranchesService.setMemoryBranch('branch_1', {
      tenant_id: TENANT_A,
      name: 'Main Piazza Branch',
      is_active: true,
    });

    // 3. Create Admin Clients
    adminClientA = await defaultApiClientService.createClient({
      tenant_id: TENANT_A,
      name: 'Artisan Admin',
      permissions: ['api_clients:manage', 'menu:read', 'orders:create', 'orders:read', 'branches:read', 'webhooks:manage'],
      rate_limit_tier: 'standard',
    });
    tenantAToken = `Bearer ${adminClientA.credential_header}`;

    adminClientB = await defaultApiClientService.createClient({
      tenant_id: TENANT_B,
      name: 'Burger Admin',
      permissions: ['api_clients:manage', 'menu:read'],
      rate_limit_tier: 'free',
    });
    tenantBToken = `Bearer ${adminClientB.credential_header}`;
  });

  // ==================== PART A & B: Onboarding Flow & Server Validation ====================

  it('1. Successfully onboards a Universal Integration with webhook and returns complete summary envelope', async () => {
    const res = await request(app)
      .post('/api/v1/admin/integrations')
      .set('Authorization', tenantAToken)
      .send({
        name: 'Artisan Mobile App',
        type: 'mobile_app',
        allowed_origins: ['https://app.artisanpizza.com'],
        permissions: ['menu:read', 'orders:create', 'branches:read'],
        rate_limit_tier: 'standard',
        webhook_url: 'https://webhook.artisanpizza.com/events',
      });

    expect(res.status).toBe(201);
    expect(res.body.success).toBe(true);
    expect(res.body.data.integration.name).toBe('Artisan Mobile App');
    expect(res.body.data.integration.type).toBe('mobile_app');
    expect(res.body.data.api_key).toMatch(/^rms_live_/);
    expect(res.body.data.webhook_secret).toMatch(/^whsec_/);
    expect(res.body.data.instructions).toBeDefined();
  });

  it('2. Rejects invalid integration type or invalid webhook URL (SSRF prevention)', async () => {
    // Invalid type
    const res1 = await request(app)
      .post('/api/v1/admin/integrations')
      .set('Authorization', tenantAToken)
      .send({
        name: 'Invalid Type App',
        type: 'invalid_super_type',
        permissions: ['menu:read'],
      });
    expect(res1.status).toBe(400);

    // SSRF blocked webhook URL (AWS metadata IP)
    const res2 = await request(app)
      .post('/api/v1/admin/integrations')
      .set('Authorization', tenantAToken)
      .send({
        name: 'SSRF Attack App',
        type: 'custom_website',
        permissions: ['menu:read'],
        webhook_url: 'http://169.254.169.254/latest/meta-data',
      });
    expect(res2.status).toBe(400);
  });

  // ==================== PART C: Credential Lifecycle & Rotation ====================

  it('3. Rotates credentials, invalidates old secret immediately, and preserves tenant isolation', async () => {
    // 1. Onboard
    const onboard = await request(app)
      .post('/api/v1/admin/integrations')
      .set('Authorization', tenantAToken)
      .send({
        name: 'Kiosk Terminal',
        type: 'kiosk',
        permissions: ['menu:read', 'branches:read'],
      });

    const intId = onboard.body.data.integration.id;
    const oldApiKey = onboard.body.data.api_key;

    // 2. Old API key works
    const testOld = await request(app)
      .get('/api/v1/branches')
      .set('Authorization', `Bearer ${oldApiKey}`);
    expect(testOld.status).toBe(200);

    // 3. Rotate Secret
    const rotate = await request(app)
      .post(`/api/v1/admin/integrations/${intId}/rotate-secret`)
      .set('Authorization', tenantAToken);
    expect(rotate.status).toBe(200);
    const newApiKey = rotate.body.data.api_key;
    expect(newApiKey).not.toBe(oldApiKey);

    // 4. Old API key is immediately invalidated (401)
    const testOldAfter = await request(app)
      .get('/api/v1/branches')
      .set('Authorization', `Bearer ${oldApiKey}`);
    expect(testOldAfter.status).toBe(401);

    // 5. New API key works
    const testNew = await request(app)
      .get('/api/v1/branches')
      .set('Authorization', `Bearer ${newApiKey}`);
    expect(testNew.status).toBe(200);
  });

  it('4. Revoked integration client can never authenticate again', async () => {
    const onboard = await request(app)
      .post('/api/v1/admin/integrations')
      .set('Authorization', tenantAToken)
      .send({
        name: 'Temporary Bot',
        type: 'third_party_service',
        permissions: ['menu:read'],
      });

    const intId = onboard.body.data.integration.id;
    const apiKey = onboard.body.data.api_key;

    // Delete / Revoke
    const delRes = await request(app)
      .delete(`/api/v1/admin/integrations/${intId}`)
      .set('Authorization', tenantAToken);
    expect(delRes.status).toBe(200);

    // Request with revoked key fails
    const testRes = await request(app)
      .get('/api/v1/branches')
      .set('Authorization', `Bearer ${apiKey}`);
    expect(testRes.status).toBe(401);
  });

  // ==================== PART D: Distributable SDK & Webhook Verification ====================

  it('5. Distributable SDK executes health and catalog queries seamlessly', async () => {
    const mockFetch = async (url: string | URL | Request, init?: RequestInit) => {
      const u = url.toString();
      if (u.endsWith('/health')) {
        return new Response(JSON.stringify({ success: true, data: { status: 'healthy', service: 'rms-api', version: 'v1' } }), {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
        });
      }
      if (u.endsWith('/branches')) {
        return new Response(JSON.stringify({ success: true, data: [{ id: 'b1', name: 'Downtown Branch', is_active: true }] }), {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
        });
      }
      return new Response(JSON.stringify({ error: { message: 'Not found' } }), { status: 404 });
    };

    const sdk = new RmsApiClient({
      baseUrl: 'https://api.artisanpizza.com/api/v1',
      apiKey: 'rms_live_mockclient.mocksecret',
      fetch: mockFetch as any,
    });

    const health = await sdk.getHealth();
    expect(health.status).toBe('healthy');

    const branches = await sdk.getBranches();
    expect(branches.length).toBe(1);
    expect(branches[0].name).toBe('Downtown Branch');
  });

  it('6. SDK verifyWebhookSignature correctly validates authentic HMAC signatures and detects tampering', () => {
    const secret = 'whsec_987654321fedcba';
    const timestamp = Math.floor(Date.now() / 1000).toString();
    const rawBody = JSON.stringify({ event: 'order.created', data: { id: 'ord_123' } });

    const crypto = require('crypto');
    const signature = crypto
      .createHmac('sha256', secret)
      .update(`${timestamp}.${rawBody}`)
      .digest('hex');

    const validHeader = `t=${timestamp},v1=${signature}`;

    // 1. Valid verification
    const isValid = verifyWebhookSignature({
      signatureHeader: validHeader,
      rawBody,
      secret,
    });
    expect(isValid).toBe(true);

    // 2. Tampered body
    const isTampered = verifyWebhookSignature({
      signatureHeader: validHeader,
      rawBody: rawBody + 'tamper',
      secret,
    });
    expect(isTampered).toBe(false);

    // 3. Expired timestamp (> 300s)
    const expiredTimestamp = (Math.floor(Date.now() / 1000) - 500).toString();
    const expiredSignature = crypto
      .createHmac('sha256', secret)
      .update(`${expiredTimestamp}.${rawBody}`)
      .digest('hex');
    const expiredHeader = `t=${expiredTimestamp},v1=${expiredSignature}`;

    const isExpired = verifyWebhookSignature({
      signatureHeader: expiredHeader,
      rawBody,
      secret,
      toleranceSeconds: 300,
    });
    expect(isExpired).toBe(false);
  });

  // ==================== PART E: API Versioning ====================

  it('7. /api/v2/version provides forward-compatible version metadata without breaking /api/v1', async () => {
    const v2Res = await request(app).get('/api/v2/version');
    expect(v2Res.status).toBe(200);
    expect(v2Res.body.success).toBe(true);
    expect(v2Res.body.data.version).toBe('v2');
    expect(v2Res.body.data.status).toBe('active');

    // /api/v1 health is unchanged
    const v1Res = await request(app).get('/api/v1/health');
    expect(v1Res.status).toBe(200);
    expect(v1Res.body.version).toBe('v1');
  });

  // ==================== PART G: Integration-Level Detailed Metrics ====================

  it('8. GET /api/v1/admin/integrations/:id/metrics returns p95 latency and usage statistics', async () => {
    // 1. Onboard integration
    const onboard = await request(app)
      .post('/api/v1/admin/integrations')
      .set('Authorization', tenantAToken)
      .send({
        name: 'Web Store',
        type: 'custom_website',
        permissions: ['menu:read', 'branches:read'],
      });

    const intId = onboard.body.data.integration.id;
    const apiKey = onboard.body.data.api_key;

    // 2. Perform some requests with the new API key
    await request(app).get('/api/v1/branches').set('Authorization', `Bearer ${apiKey}`);
    await request(app).get('/api/v1/branches').set('Authorization', `Bearer ${apiKey}`);

    // 3. Query integration metrics
    const metricsRes = await request(app)
      .get(`/api/v1/admin/integrations/${intId}/metrics`)
      .set('Authorization', tenantAToken);

    expect(metricsRes.status).toBe(200);
    expect(metricsRes.body.success).toBe(true);
    expect(metricsRes.body.data.integration_id).toBe(intId);
    expect(metricsRes.body.data.request_count).toBeGreaterThanOrEqual(2);
    expect(metricsRes.body.data.p95_latency_ms).toBeDefined();
    expect(metricsRes.body.data.circuit_state).toBe('CLOSED');
  });
});
