import { describe, it, expect, beforeEach } from 'vitest';
import request from 'supertest';
import fs from 'fs';
import path from 'path';
import { app } from '../index.js';
import { defaultApiClientService } from '../services/apiClient.service.js';
import { defaultBranchesService } from '../services/branches.service.js';
import { defaultMenuService } from '../services/menu.service.js';
import { defaultSettingsService } from '../services/settings.service.js';
import { defaultOrderService } from '../services/order.service.js';
import { defaultWebhookService } from '../services/webhook.service.js';
import { sanitize } from '../utils/logger.js';
import { validateSafeWebhookUrl } from '../utils/ssrf.js';
import { resetRateLimits } from '../middleware/rateLimiter.js';

describe('Phase 5: Production Security Hardening & Audit Test Suite', () => {
  let tenantAToken: string;
  let tenantBToken: string;
  let adminClientA: any;
  let adminClientB: any;

  const TENANT_A = 'tenant_sushi_bar';
  const TENANT_B = 'tenant_burger_house';

  beforeEach(async () => {
    resetRateLimits();
    defaultApiClientService.clearMemory();
    defaultBranchesService.clearMemory();
    defaultMenuService.clearMemory();
    defaultSettingsService.clearMemory();
    defaultOrderService.clearMemory();

    // 1. Seed Settings
    defaultSettingsService.setMemoryTenant(TENANT_A, {
      name: 'Sushi Bar Cairo',
      settings: { currency: 'EGP', taxRate: 14, taxIncluded: false, deliveryFee: 40, minOrder: 100 },
    });

    defaultSettingsService.setMemoryTenant(TENANT_B, {
      name: 'Burger House Cairo',
      settings: { currency: 'EGP', taxRate: 14, taxIncluded: false, deliveryFee: 30, minOrder: 50 },
    });

    // 2. Seed Branches
    defaultBranchesService.setMemoryBranch('branch_sushi_main', {
      tenant_id: TENANT_A,
      name: 'Sushi Bar Zamalek',
      isActive: true,
    });

    defaultBranchesService.setMemoryBranch('branch_burger_main', {
      tenant_id: TENANT_B,
      name: 'Burger House Maadi',
      isActive: true,
    });

    // 3. Seed Products
    defaultMenuService.setMemoryCategory('cat_rolls', { tenant_id: TENANT_A, name: 'Rolls', isActive: true });
    defaultMenuService.setMemoryProduct('prod_sushi_1', {
      tenant_id: TENANT_A,
      category_id: 'cat_rolls',
      name: 'Salmon Roll',
      price: 200,
      is_available: true,
    });

    // 4. Create API Clients
    adminClientA = await defaultApiClientService.createClient({
      tenant_id: TENANT_A,
      name: 'Sushi Bar Admin',
      permissions: ['api_clients:manage', 'menu:read', 'branches:read', 'orders:create', 'orders:read', 'webhooks:manage'],
      allowed_branch_ids: ['branch_sushi_main'],
      allowed_origins: ['https://sushibar.com'],
    });
    tenantAToken = `Bearer ${adminClientA.credential_header}`;

    adminClientB = await defaultApiClientService.createClient({
      tenant_id: TENANT_B,
      name: 'Burger House Admin',
      permissions: ['menu:read', 'branches:read'],
      allowed_branch_ids: ['branch_burger_main'],
      allowed_origins: ['https://burgerhouse.com'],
    });
    tenantBToken = `Bearer ${adminClientB.credential_header}`;
  });

  // ==================== 1-6. Sensitive Firestore Rule Declarations ====================

  it('1-6. firestore.rules declares explicit server-only denial for sensitive collections', () => {
    const rulesPath = path.resolve(process.cwd(), '../firestore.rules');
    const rulesContent = fs.readFileSync(rulesPath, 'utf-8');

    // 1. api_clients
    expect(rulesContent).toMatch(/match\s+\/api_clients\/\{clientId\}\s*\{\s*allow\s+read,\s*write:\s*if\s+false;\s*\}/);
    // 2. api_client_audit_logs
    expect(rulesContent).toMatch(/match\s+\/api_client_audit_logs\/\{logId\}\s*\{\s*allow\s+read,\s*write:\s*if\s+false;\s*\}/);
    // 3. api_usage_events
    expect(rulesContent).toMatch(/match\s+\/api_usage_events\/\{eventId\}\s*\{\s*allow\s+read,\s*write:\s*if\s+false;\s*\}/);
    // 4. webhook_endpoints & events & attempts
    expect(rulesContent).toMatch(/match\s+\/webhook_endpoints\/\{endpointId\}\s*\{\s*allow\s+read,\s*write:\s*if\s+false;\s*\}/);
    expect(rulesContent).toMatch(/match\s+\/webhook_events\/\{eventId\}\s*\{\s*allow\s+read,\s*write:\s*if\s+false;\s*\}/);
    expect(rulesContent).toMatch(/match\s+\/webhook_delivery_attempts\/\{attemptId\}\s*\{\s*allow\s+read,\s*write:\s*if\s+false;\s*\}/);
    // 5. branch_counters & idempotency_records
    expect(rulesContent).toMatch(/match\s+\/branch_counters\/\{counterId\}\s*\{\s*allow\s+read,\s*write:\s*if\s+false;\s*\}/);
    expect(rulesContent).toMatch(/match\s+\/idempotency_records\/\{recordId\}\s*\{\s*allow\s+read,\s*write:\s*if\s+false;\s*\}/);
  });

  // ==================== 7-8. Tenant & Branch Isolation ====================

  it('7. Tenant isolation is enforced on catalog and orders', async () => {
    const res = await request(app).get('/api/v1/products/prod_sushi_1').set('Authorization', tenantBToken);
    expect(res.status).toBe(404);
    expect(res.body.success).toBe(false);
  });

  it('8. Branch isolation rejects access to unauthorized branches', async () => {
    const res = await request(app)
      .post('/api/v1/orders')
      .set('Authorization', tenantAToken)
      .set('X-Branch-ID', 'branch_burger_main')
      .send({
        branch_id: 'branch_burger_main',
        order_type: 'takeaway',
        items: [{ product_id: 'prod_sushi_1', quantity: 1 }],
      });

    expect(res.status).toBe(403);
    expect(res.body.error.code).toBe('FORBIDDEN');
  });

  // ==================== 9-10. CORS Hardening & Preflight ====================

  it('9. Malicious Origin is rejected or denied CORS headers', async () => {
    const res = await request(app)
      .get('/api/v1/menu')
      .set('Origin', 'https://malicious-attacker-site.com')
      .set('Authorization', tenantAToken);

    expect(res.status).toBe(403);
  });

  it('10a. Client configured allowed_origins is respected and unauthorized origin is rejected', async () => {
    const allowedRes = await request(app)
      .get('/api/v1/menu')
      .set('Origin', 'https://sushibar.com')
      .set('Authorization', tenantAToken);

    expect(allowedRes.status).toBe(200);

    const unauthorizedRes = await request(app)
      .get('/api/v1/menu')
      .set('Origin', 'https://other-domain.com')
      .set('Authorization', tenantAToken);

    expect(unauthorizedRes.status).toBe(403);
  });

  it('10b. OPTIONS preflight from https://mksystem-rose.vercel.app allows X-Tenant-ID and credentials', async () => {
    const preflightRes = await request(app)
      .options('/api/v1/admin/api-clients')
      .set('Origin', 'https://mksystem-rose.vercel.app')
      .set('Access-Control-Request-Method', 'POST')
      .set('Access-Control-Request-Headers', 'authorization, content-type, x-tenant-id');

    expect(preflightRes.status).toBe(204);
    expect(preflightRes.headers['access-control-allow-origin']).toBe('https://mksystem-rose.vercel.app');
    expect(preflightRes.headers['access-control-allow-credentials']).toBe('true');
    expect(preflightRes.headers['access-control-allow-headers'].toLowerCase()).toContain('x-tenant-id');
  });

  it('10c. OPTIONS preflight from https://sushi-bar.pages.dev allows X-Tenant-ID and credentials', async () => {
    const preflightRes = await request(app)
      .options('/api/v1/admin/api-clients')
      .set('Origin', 'https://sushi-bar.pages.dev')
      .set('Access-Control-Request-Method', 'GET')
      .set('Access-Control-Request-Headers', 'authorization, content-type, x-tenant-id');

    expect(preflightRes.status).toBe(204);
    expect(preflightRes.headers['access-control-allow-origin']).toBe('https://sushi-bar.pages.dev');
    expect(preflightRes.headers['access-control-allow-credentials']).toBe('true');
    expect(preflightRes.headers['access-control-allow-headers'].toLowerCase()).toContain('x-tenant-id');
  });

  // ==================== 11. Request Payload Limits ====================

  it('11. Oversized request body (> 1MB) returns 413 Payload Too Large', async () => {
    // Generate a payload > 1MB
    const bigString = 'A'.repeat(1024 * 1024 * 1.2); // 1.2 MB
    const res = await request(app)
      .post('/api/v1/orders')
      .set('Authorization', tenantAToken)
      .set('Content-Type', 'application/json')
      .send(`{"notes":"${bigString}"}`);

    expect(res.status).toBe(413);
    expect(res.body.error.code).toBe('PAYLOAD_TOO_LARGE');
  });

  // ==================== 12. Input Strictness ====================

  it('12. Unknown API fields in order body are strictly rejected by Zod schema', async () => {
    const res = await request(app)
      .post('/api/v1/orders')
      .set('Authorization', tenantAToken)
      .send({
        branch_id: 'branch_sushi_main',
        order_type: 'takeaway',
        items: [{ product_id: 'prod_sushi_1', quantity: 1 }],
        malicious_injected_field: 'hacked',
      });

    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe('VALIDATION_ERROR');
  });

  // ==================== 13-15. Webhook SSRF Protection ====================

  it('13. Webhook localhost URL is rejected (SSRF protection)', () => {
    const check1 = validateSafeWebhookUrl('http://localhost:8080/hook');
    const check2 = validateSafeWebhookUrl('https://127.0.0.1/hook');
    expect(check1.isValid).toBe(false);
    expect(check2.isValid).toBe(false);
    expect(check1.error).toContain('SSRF');
  });

  it('14. Private IP ranges are rejected (SSRF protection)', () => {
    expect(validateSafeWebhookUrl('https://10.0.0.1/hook').isValid).toBe(false);
    expect(validateSafeWebhookUrl('https://192.168.1.1/hook').isValid).toBe(false);
    expect(validateSafeWebhookUrl('https://172.20.0.1/hook').isValid).toBe(false);
    expect(validateSafeWebhookUrl('https://169.254.169.254/hook').isValid).toBe(false);
  });

  it('15. Valid public HTTPS URL is accepted', () => {
    const check = validateSafeWebhookUrl('https://api.sushibar.com/webhooks/rms');
    expect(check.isValid).toBe(true);
    expect(check.error).toBeUndefined();
  });

  // ==================== 16. Webhook Secret Leakage Protection ====================

  it('16. Webhook secret never appears in list or query responses', async () => {
    await defaultWebhookService.createEndpoint(TENANT_A, adminClientA.client_id, {
      url: 'https://api.sushibar.com/events',
      events: ['order.created'],
    });

    const res = await request(app).get('/api/v1/webhooks').set('Authorization', tenantAToken);
    expect(res.status).toBe(200);
    expect(res.body.data.length).toBeGreaterThanOrEqual(1);

    const stringified = JSON.stringify(res.body);
    expect(stringified).not.toContain('whsec_');
    expect(stringified).not.toContain('secret_hash');
  });

  // ==================== 17. Logging Redaction ====================

  it('17. Sensitive keys (passwords, tokens, api_keys, client_secrets) are redacted from logs', () => {
    const dirtyData = {
      password: 'super_secret_password',
      client_secret: 'rms_sec_1234567890',
      token: 'bearer_token_xyz',
      authorization: 'Bearer rms_live_...',
      api_key: 'key_12345',
      user: {
        card_number: '4111222233334444',
        safe_name: 'Mahmoud',
      },
    };

    const sanitized = sanitize(dirtyData);
    expect(sanitized.password).toBe('[REDACTED]');
    expect(sanitized.client_secret).toBe('[REDACTED]');
    expect(sanitized.token).toBe('[REDACTED]');
    expect(sanitized.authorization).toBe('[REDACTED]');
    expect(sanitized.api_key).toBe('[REDACTED]');
    expect(sanitized.user.card_number).toBe('[REDACTED]');
    expect(sanitized.user.safe_name).toBe('Mahmoud');
  });

  // ==================== 18. Frontend Bundle Security Audit ====================

  it('18. Frontend bundle (dist/) does not contain Firebase Admin private keys or secrets', () => {
    const distPath = path.resolve(process.cwd(), '../dist');
    if (fs.existsSync(distPath)) {
      const files = fs.readdirSync(distPath, { recursive: true }) as string[];
      for (const file of files) {
        if (typeof file === 'string' && (file.endsWith('.js') || file.endsWith('.html'))) {
          const filePath = path.join(distPath, file);
          if (fs.statSync(filePath).isFile()) {
            const content = fs.readFileSync(filePath, 'utf-8');
            expect(content).not.toContain('BEGIN PRIVATE KEY');
            expect(content).not.toContain('FIREBASE_PRIVATE_KEY');
            expect(content).not.toContain('FIREBASE_CLIENT_EMAIL');
          }
        }
      }
    }
  }, 20000);

  // ==================== 19. Stack Trace & Error Hiding ====================

  it('19. Stack traces are never exposed in production error responses', async () => {
    const res = await request(app).get('/api/v1/nonexistent-route-for-error-test');
    expect(res.body.error).toBeDefined();
    expect(res.body.error.stack).toBeUndefined();
    expect(JSON.stringify(res.body)).not.toContain('node_modules');
  });

  // ==================== 20. Health Endpoint Sanitization ====================

  it('20. GET /api/v1/health exposes only safe status without database/secret internals', async () => {
    const res = await request(app).get('/api/v1/health');
    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.service).toBe('rms-api');
    expect(res.body.version).toBe('v1');

    const jsonStr = JSON.stringify(res.body);
    expect(jsonStr).not.toContain('firebase');
    expect(jsonStr).not.toContain('password');
    expect(jsonStr).not.toContain('private_key');
    expect(jsonStr).not.toContain('env');
  });
});
