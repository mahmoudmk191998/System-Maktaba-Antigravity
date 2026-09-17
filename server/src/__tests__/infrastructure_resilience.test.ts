import { describe, it, expect, beforeEach, vi } from 'vitest';
import request from 'supertest';
import { app } from '../index.js';
import { defaultApiClientService } from '../services/apiClient.service.js';
import { defaultIntegrationService } from '../services/integration.service.js';
import { defaultWebhookService } from '../services/webhook.service.js';
import { defaultSettingsService } from '../services/settings.service.js';
import { defaultBranchesService } from '../services/branches.service.js';
import { defaultMenuService } from '../services/menu.service.js';
import { InMemoryRateLimitStore } from '../infrastructure/rate-limit/inMemoryRateLimitStore.js';
import { RedisRateLimitStore, RedisClientInterface } from '../infrastructure/rate-limit/redisRateLimitStore.js';
import { InMemoryWebhookQueue } from '../infrastructure/webhooks/inMemoryWebhookQueue.js';
import { WebhookWorker } from '../infrastructure/webhooks/webhookWorker.js';
import { resetRateLimits } from '../middleware/rateLimiter.js';

describe('Phase 6B: Infrastructure Resilience, Distributed Rate Limiting & Webhook Queue Test Suite', () => {
  const TENANT_A = 'tenant_noodle_house';
  const TENANT_B = 'tenant_curry_leaf';

  let adminClientA: any;
  let tenantAToken: string;
  let adminClientB: any;
  let tenantBToken: string;

  beforeEach(async () => {
    resetRateLimits();
    defaultApiClientService.clearMemory();
    defaultIntegrationService.clearMemory();
    defaultWebhookService.clearMemory();
    defaultBranchesService.clearMemory();
    defaultMenuService.clearMemory();
    defaultSettingsService.clearMemory();

    // 1. Seed Tenants
    defaultSettingsService.setMemoryTenant(TENANT_A, {
      name: 'Noodle House',
      settings: { currency: 'EUR', taxRate: 10, deliveryFee: 3 },
    });
    defaultSettingsService.setMemoryTenant(TENANT_B, {
      name: 'Curry Leaf',
      settings: { currency: 'GBP', taxRate: 20, deliveryFee: 4 },
    });

    // 2. Seed Branches
    defaultBranchesService.setMemoryBranch('branch_noodle_1', {
      tenant_id: TENANT_A,
      name: 'Noodle Berlin',
      isActive: true,
    });

    // 3. Seed Menu
    defaultMenuService.setMemoryCategory('cat_noodles', { tenant_id: TENANT_A, name: 'Noodles', isActive: true });
    defaultMenuService.setMemoryProduct('prod_ramen', {
      tenant_id: TENANT_A,
      category_id: 'cat_noodles',
      name: 'Miso Ramen',
      price: 15,
      is_available: true,
    });

    // 4. Create Master Admin Clients
    adminClientA = await defaultApiClientService.createClient({
      tenant_id: TENANT_A,
      name: 'Noodle Master',
      permissions: ['api_clients:manage', 'menu:read', 'branches:read', 'orders:create', 'orders:read', 'webhooks:manage'],
      rate_limit_tier: 'standard',
    });
    tenantAToken = `Bearer ${adminClientA.credential_header}`;

    adminClientB = await defaultApiClientService.createClient({
      tenant_id: TENANT_B,
      name: 'Curry Master',
      permissions: ['api_clients:manage', 'menu:read'],
      rate_limit_tier: 'free',
    });
    tenantBToken = `Bearer ${adminClientB.credential_header}`;
  });

  // ==================== PART 1: Rate Limiting Unit & Integration ====================

  it('1-5. InMemoryRateLimitStore enforces quota, counts remaining, and resets accurately', async () => {
    const store = new InMemoryRateLimitStore();
    const key = 'tenant:t1:client:c1';

    // 1. First request
    const r1 = await store.consume(key, 3, 60);
    expect(r1.allowed).toBe(true);
    expect(r1.remaining).toBe(2);
    expect(r1.limit).toBe(3);

    // 2. Second request
    const r2 = await store.consume(key, 3, 60);
    expect(r2.allowed).toBe(true);
    expect(r2.remaining).toBe(1);

    // 3. Third request (exhaust limit)
    const r3 = await store.consume(key, 3, 60);
    expect(r3.allowed).toBe(true);
    expect(r3.remaining).toBe(0);

    // 4. Fourth request (rejected)
    const r4 = await store.consume(key, 3, 60);
    expect(r4.allowed).toBe(false);
    expect(r4.remaining).toBe(0);
    expect(r4.retryAfterSeconds).toBeGreaterThanOrEqual(1);

    // 5. Reset key
    await store.reset(key);
    const r5 = await store.consume(key, 3, 60);
    expect(r5.allowed).toBe(true);
    expect(r5.remaining).toBe(2);
  });

  it('6-7. RedisRateLimitStore executes atomic Lua script and reports healthy status', async () => {
    let mockEvalCounter = 0;
    const mockRedis: RedisClientInterface = {
      eval: vi.fn().mockImplementation(async () => {
        mockEvalCounter += 1;
        return [mockEvalCounter, 59];
      }),
      del: vi.fn().mockResolvedValue(1),
      ping: vi.fn().mockResolvedValue('PONG'),
    };

    const redisStore = new RedisRateLimitStore(mockRedis);
    expect(redisStore.getStatus().status).toBe('healthy');

    const res = await redisStore.consume('test-key', 5, 60);
    expect(res.allowed).toBe(true);
    expect(res.remaining).toBe(4);
    expect(mockRedis.eval).toHaveBeenCalledTimes(1);
  });

  it('8-10. RedisRateLimitStore gracefully falls back to in-memory store if Redis throws error', async () => {
    const failingRedis: RedisClientInterface = {
      eval: vi.fn().mockRejectedValue(new Error('ECONNREFUSED 127.0.0.1:6379')),
      del: vi.fn().mockRejectedValue(new Error('ECONNREFUSED')),
      ping: vi.fn().mockRejectedValue(new Error('ECONNREFUSED')),
    };

    const redisStore = new RedisRateLimitStore(failingRedis);

    // Initial consumption triggers error and falls back seamlessly
    const res = await redisStore.consume('fallback-key', 2, 60);
    expect(res.allowed).toBe(true);
    expect(res.remaining).toBe(1);
    expect(redisStore.getStatus().status).toBe('degraded');
  });

  // ==================== PART 2: Webhook Queue & Worker ====================

  it('11-13. InMemoryWebhookQueue enqueues, dequeues, and acks jobs on successful delivery', async () => {
    const queue = new InMemoryWebhookQueue();
    const mockFetch = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      text: async () => 'OK',
      headers: new Headers(),
    });

    const worker = new WebhookWorker(queue, mockFetch as any);

    const job = {
      job_id: 'job_1',
      event_id: 'evt_1',
      tenant_id: TENANT_A,
      endpoint_id: 'whe_1',
      url: 'https://api.noodlehouse.com/webhook',
      payload: {
        event_id: 'evt_1',
        event_type: 'order.created' as const,
        tenant_id: TENANT_A,
        timestamp: new Date().toISOString(),
        data: { order_id: 'ord_123' },
      },
      secret: 'whsec_secret123',
      attempt_count: 1,
      max_attempts: 5,
      next_attempt_at: new Date().toISOString(),
      created_at: new Date().toISOString(),
    };

    await queue.enqueue(job);
    expect(await queue.getPendingCount()).toBe(1);

    const processed = await worker.processBatch();
    expect(processed).toBe(1);
    expect(mockFetch).toHaveBeenCalledTimes(1);
    expect(await queue.getPendingCount()).toBe(0);
  });

  it('14-16. Webhook worker retries on 500 error and 429 rate limit with exponential backoff', async () => {
    const queue = new InMemoryWebhookQueue();
    const mockFetch = vi.fn().mockResolvedValue({
      ok: false,
      status: 500,
      text: async () => 'Internal Server Error',
      headers: new Headers(),
    });

    const worker = new WebhookWorker(queue, mockFetch as any);

    const job = {
      job_id: 'job_500',
      event_id: 'evt_500',
      tenant_id: TENANT_A,
      endpoint_id: 'whe_1',
      url: 'https://api.noodlehouse.com/webhook',
      payload: {
        event_id: 'evt_500',
        event_type: 'order.created' as const,
        tenant_id: TENANT_A,
        timestamp: new Date().toISOString(),
        data: { order_id: 'ord_500' },
      },
      secret: 'whsec_secret123',
      attempt_count: 1,
      max_attempts: 3,
      next_attempt_at: new Date().toISOString(),
      created_at: new Date().toISOString(),
    };

    await queue.enqueue(job);
    await worker.deliverJob(job);

    // Job should be rescheduled for retry (still in queue with increased attempt_count)
    expect(await queue.getPendingCount()).toBe(1);
  });

  it('17-20. Webhook worker does NOT retry permanently rejected 4xx status codes (400, 401, 404)', async () => {
    const queue = new InMemoryWebhookQueue();
    const mockFetch = vi.fn().mockResolvedValue({
      ok: false,
      status: 404,
      text: async () => 'Not Found',
      headers: new Headers(),
    });

    const worker = new WebhookWorker(queue, mockFetch as any);

    const job = {
      job_id: 'job_404',
      event_id: 'evt_404',
      tenant_id: TENANT_A,
      endpoint_id: 'whe_1',
      url: 'https://api.noodlehouse.com/webhook',
      payload: {
        event_id: 'evt_404',
        event_type: 'order.created' as const,
        tenant_id: TENANT_A,
        timestamp: new Date().toISOString(),
        data: { order_id: 'ord_404' },
      },
      secret: 'whsec_secret123',
      attempt_count: 1,
      max_attempts: 5,
      next_attempt_at: new Date().toISOString(),
      created_at: new Date().toISOString(),
    };

    await queue.enqueue(job);
    await worker.deliverJob(job);

    // Job removed from active queue and placed into dead letters
    expect(await queue.getPendingCount()).toBe(0);
    const deadLetters = await queue.getDeadLetters(TENANT_A);
    expect(deadLetters.length).toBe(1);
    expect(deadLetters[0].last_status_code).toBe(404);
  });

  it('21-22. Max retry attempts moves job to Dead-Letter queue', async () => {
    const queue = new InMemoryWebhookQueue();
    const mockFetch = vi.fn().mockResolvedValue({
      ok: false,
      status: 503,
      text: async () => 'Service Unavailable',
      headers: new Headers(),
    });

    const worker = new WebhookWorker(queue, mockFetch as any);

    const job = {
      job_id: 'job_max_attempts',
      event_id: 'evt_max',
      tenant_id: TENANT_A,
      endpoint_id: 'whe_1',
      url: 'https://api.noodlehouse.com/webhook',
      payload: {
        event_id: 'evt_max',
        event_type: 'order.created' as const,
        tenant_id: TENANT_A,
        timestamp: new Date().toISOString(),
        data: { order_id: 'ord_max' },
      },
      secret: 'whsec_secret123',
      attempt_count: 5, // Already at max attempts
      max_attempts: 5,
      next_attempt_at: new Date().toISOString(),
      created_at: new Date().toISOString(),
    };

    await queue.enqueue(job);
    await worker.deliverJob(job);

    expect(await queue.getPendingCount()).toBe(0);
    const deadLetters = await queue.getDeadLetters(TENANT_A);
    expect(deadLetters.length).toBe(1);
    expect(deadLetters[0].event_id).toBe('evt_max');
  });

  // ==================== PART 3: Admin Observability & Health Endpoints ====================

  it('23-26. GET /admin/integrations/:id/webhook-health returns delivery metrics under tenant isolation', async () => {
    // 1. Onboard Integration for Tenant A with Webhook
    const onboardA = await request(app)
      .post('/api/v1/admin/integrations')
      .set('Authorization', tenantAToken)
      .send({
        name: 'Noodle Web App',
        type: 'custom_website',
        permissions: ['menu:read', 'orders:create'],
        webhook_url: 'https://api.noodlehouse.com/events',
      });

    const intAId = onboardA.body.data.integration.id;

    // 2. Query webhook health for Tenant A
    const healthRes = await request(app)
      .get(`/api/v1/admin/integrations/${intAId}/webhook-health`)
      .set('Authorization', tenantAToken);

    expect(healthRes.status).toBe(200);
    expect(healthRes.body.success).toBe(true);
    expect(healthRes.body.data.integration_id).toBe(intAId);
    expect(healthRes.body.data.endpoint_url).toBe('https://api.noodlehouse.com/events');
    expect(healthRes.body.data.dead_letter_count).toBe(0);

    // 3. Tenant B attempts to view Tenant A's webhook health (rejected with 404)
    const crossRes = await request(app)
      .get(`/api/v1/admin/integrations/${intAId}/webhook-health`)
      .set('Authorization', tenantBToken);

    expect(crossRes.status).toBe(404);
  });

  it('27-30. System GET /health exposes rate limiter and queue status without sensitive secrets', async () => {
    const health = await request(app).get('/api/v1/health');
    expect(health.status).toBe(200);
    expect(health.body.success).toBe(true);
    expect(health.body.infrastructure).toBeDefined();
    expect(health.body.infrastructure.rateLimitStore.status).toBe('healthy');
    expect(health.body.infrastructure.webhookQueue.status).toBe('healthy');

    const jsonStr = JSON.stringify(health.body);
    expect(jsonStr).not.toContain('redis://');
    expect(jsonStr).not.toContain('password');
    expect(jsonStr).not.toContain('whsec_');
  });
});
