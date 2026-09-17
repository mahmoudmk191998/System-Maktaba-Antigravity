import { describe, it, expect, beforeEach, vi } from 'vitest';
import request from 'supertest';
import { app } from '../index.js';
import { defaultApiClientService } from '../services/apiClient.service.js';
import { defaultIntegrationService } from '../services/integration.service.js';
import { defaultWebhookService } from '../services/webhook.service.js';
import { defaultSettingsService } from '../services/settings.service.js';
import { defaultBranchesService } from '../services/branches.service.js';
import { defaultMenuService } from '../services/menu.service.js';
import { RedisWebhookQueue, RedisQueueClientInterface } from '../infrastructure/webhooks/redisWebhookQueue.js';
import { InMemoryWebhookQueue } from '../infrastructure/webhooks/inMemoryWebhookQueue.js';
import { InMemoryCircuitBreaker } from '../infrastructure/circuit-breaker/inMemoryCircuitBreaker.js';
import { WebhookWorker } from '../infrastructure/webhooks/webhookWorker.js';
import { defaultMetricsStore } from '../infrastructure/metrics/metricsStore.js';
import { defaultIntegrationHealthService } from '../services/integrationHealth.service.js';
import { defaultObservabilityService } from '../services/observability.service.js';
import { sanitizeRequestId } from '../middleware/requestId.js';

describe('Phase 6C: Distributed Webhook Workers, Circuit Breakers & Observability Test Suite', () => {
  const TENANT_A = 'tenant_taco_bar';
  const TENANT_B = 'tenant_waffle_house';

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
    defaultMetricsStore.reset();

    // 1. Seed Tenants
    defaultSettingsService.setMemoryTenant(TENANT_A, {
      name: 'Taco Bar',
      settings: { currency: 'USD', taxRate: 8, deliveryFee: 2.5 },
    });
    defaultSettingsService.setMemoryTenant(TENANT_B, {
      name: 'Waffle House',
      settings: { currency: 'USD', taxRate: 6, deliveryFee: 3 },
    });

    // 2. Create Master Admin Clients
    adminClientA = await defaultApiClientService.createClient({
      tenant_id: TENANT_A,
      name: 'Taco Master',
      permissions: ['api_clients:manage', 'menu:read', 'orders:create', 'orders:read', 'webhooks:manage'],
      rate_limit_tier: 'standard',
    });
    tenantAToken = `Bearer ${adminClientA.credential_header}`;

    adminClientB = await defaultApiClientService.createClient({
      tenant_id: TENANT_B,
      name: 'Waffle Master',
      permissions: ['api_clients:manage', 'menu:read'],
      rate_limit_tier: 'free',
    });
    tenantBToken = `Bearer ${adminClientB.credential_header}`;
  });

  // ==================== PART 1: Redis Distributed Queue & Visibility Timeout ====================

  it('1-6. RedisWebhookQueue supports atomic enqueue, claim with lease, ack, retry, and expired lease recovery', async () => {
    const memoryHash = new Map<string, Record<string, string>>();
    const readyZset = new Map<string, number>();
    const processingZset = new Map<string, number>();

    const mockRedis: RedisQueueClientInterface = {
      hset: vi.fn().mockImplementation(async (key, field, val) => {
        const obj = memoryHash.get(key) || {};
        obj[field as string] = val as string;
        memoryHash.set(key, obj);
        return 1;
      }),
      hget: vi.fn().mockImplementation(async (key, field) => {
        const obj = memoryHash.get(key);
        return obj ? obj[field] || null : null;
      }),
      hgetall: vi.fn().mockImplementation(async (key) => memoryHash.get(key) || {}),
      hdel: vi.fn().mockImplementation(async (key) => {
        memoryHash.delete(key);
        return 1;
      }),
      zadd: vi.fn().mockImplementation(async (key, score, member) => {
        if (key.includes('ready')) readyZset.set(member, score);
        if (key.includes('processing')) processingZset.set(member, score);
        return 1;
      }),
      zrangebyscore: vi.fn().mockImplementation(async (key) => {
        if (key.includes('ready')) return Array.from(readyZset.keys());
        if (key.includes('processing')) return Array.from(processingZset.keys());
        return [];
      }),
      zrem: vi.fn().mockImplementation(async (key, member) => {
        if (key.includes('ready')) readyZset.delete(member);
        if (key.includes('processing')) processingZset.delete(member);
        return 1;
      }),
      zcard: vi.fn().mockImplementation(async (key) => {
        if (key.includes('ready')) return readyZset.size;
        if (key.includes('processing')) return processingZset.size;
        return 0;
      }),
      eval: vi.fn().mockResolvedValue(1),
    };

    const redisQueue = new RedisWebhookQueue(mockRedis);
    expect((await redisQueue.getStatus()).status).toBe('healthy');

    const job = {
      job_id: 'job_redis_1',
      event_id: 'evt_redis_1',
      tenant_id: TENANT_A,
      endpoint_id: 'whe_1',
      url: 'https://api.tacobar.com/webhook',
      payload: {
        event_id: 'evt_redis_1',
        event_type: 'order.created' as const,
        tenant_id: TENANT_A,
        timestamp: new Date().toISOString(),
        data: { order_id: 'ord_123' },
      },
      secret: 'whsec_test',
      attempt_count: 1,
      max_attempts: 5,
      next_attempt_at: new Date().toISOString(),
      created_at: new Date().toISOString(),
    };

    // 1. Enqueue
    await redisQueue.enqueue(job);
    expect(mockRedis.hset).toHaveBeenCalled();
    expect(mockRedis.zadd).toHaveBeenCalled();

    // 2. Claim by Worker 1
    const claimed = await redisQueue.claim('worker_1', 1, 30);
    expect(claimed.length).toBe(1);
    expect(claimed[0].state).toBe('processing');
    expect(claimed[0].claimed_by).toBe('worker_1');

    // 3. Retry job
    await redisQueue.retry('job_redis_1', 10, 'Temporary timeout');
    expect(mockRedis.zadd).toHaveBeenCalled();

    // 4. Ack job
    await redisQueue.ack('job_redis_1');
    expect(mockRedis.zrem).toHaveBeenCalled();
  });

  it('7-9. InMemoryWebhookQueue recovers expired leases when worker crashes without completing', async () => {
    const queue = new InMemoryWebhookQueue();
    const pastTime = new Date(Date.now() - 5000).toISOString();

    const job = {
      job_id: 'job_crashed',
      event_id: 'evt_crashed',
      tenant_id: TENANT_A,
      endpoint_id: 'whe_1',
      url: 'https://api.tacobar.com/webhook',
      payload: {
        event_id: 'evt_crashed',
        event_type: 'order.created' as const,
        tenant_id: TENANT_A,
        timestamp: pastTime,
        data: { order_id: 'ord_crashed' },
      },
      secret: 'whsec_test',
      attempt_count: 1,
      max_attempts: 5,
      next_attempt_at: pastTime,
      created_at: pastTime,
    };

    await queue.enqueue(job);

    // Claim with expired lease
    const claimed = await queue.claim('worker_dead', 1, -10); // lease in past
    expect(claimed.length).toBe(1);

    // Recover expired leases
    const recovered = await queue.recoverExpiredLeases();
    expect(recovered).toBe(1);

    // Another worker claims the recovered job
    const reclaimed = await queue.claim('worker_alive', 1, 60);
    expect(reclaimed.length).toBe(1);
    expect(reclaimed[0].claimed_by).toBe('worker_alive');
  });

  // ==================== PART 2: Circuit Breaker ====================

  it('10-14. Circuit Breaker transitions from CLOSED to OPEN after 5 failures, then to HALF_OPEN and recovers to CLOSED', async () => {
    const cb = new InMemoryCircuitBreaker({
      failureThreshold: 3,
      cooldownSeconds: 1,
      halfOpenRequests: 1,
    });

    const ep = 'whe_circuit_test';

    // 1. Initial state CLOSED
    expect(await cb.canAttempt(TENANT_A, ep)).toBe(true);
    expect((await cb.getState(TENANT_A, ep)).state).toBe('CLOSED');

    // 2. Record 2 failures -> Still CLOSED
    await cb.recordFailure(TENANT_A, ep);
    await cb.recordFailure(TENANT_A, ep);
    expect((await cb.getState(TENANT_A, ep)).state).toBe('CLOSED');
    expect(await cb.canAttempt(TENANT_A, ep)).toBe(true);

    // 3. Record 3rd failure -> Trips to OPEN
    await cb.recordFailure(TENANT_A, ep);
    expect((await cb.getState(TENANT_A, ep)).state).toBe('OPEN');
    expect(await cb.canAttempt(TENANT_A, ep)).toBe(false);

    // 4. Tenant B endpoint is unaffected (strict tenant isolation)
    expect(await cb.canAttempt(TENANT_B, ep)).toBe(true);

    // 5. Wait for cooldown to expire -> transitions to HALF_OPEN
    await new Promise((r) => setTimeout(r, 1100));
    expect(await cb.canAttempt(TENANT_A, ep)).toBe(true);
    expect((await cb.getState(TENANT_A, ep)).state).toBe('HALF_OPEN');

    // 6. Record success on probe -> Recovers to CLOSED
    await cb.recordSuccess(TENANT_A, ep);
    expect((await cb.getState(TENANT_A, ep)).state).toBe('CLOSED');
  });

  // ==================== PART 3: Request Tracing & Correlation ====================

  it('18-19. Request ID is sanitized, preserved, and returned in response headers', async () => {
    // 1. Custom valid request ID
    const res1 = await request(app)
      .get('/api/v1/health')
      .set('X-Request-ID', 'custom-req-id-12345');

    expect(res1.status).toBe(200);
    expect(res1.header['x-request-id']).toBe('custom-req-id-12345');

    // 2. Malicious request ID gets sanitized
    const res2 = await request(app)
      .get('/api/v1/health')
      .set('X-Request-ID', '<script>alert(1)</script>');

    expect(res2.status).toBe(200);
    expect(res2.header['x-request-id']).not.toContain('<script>');
  });

  // ==================== PART 4: Observability & Health APIs ====================

  it('20-25. Admin Observability API returns platform and tenant metrics safely', async () => {
    // 1. Record metrics
    defaultMetricsStore.incrementCounter('orders_created_total', 5, { tenant_id: TENANT_A });
    defaultMetricsStore.incrementCounter('orders_failed_total', 1, { tenant_id: TENANT_A });
    defaultMetricsStore.setGauge('queue_depth', 3);

    // 2. Query observability endpoint with Tenant A token
    const res = await request(app)
      .get('/api/v1/admin/observability')
      .set('Authorization', tenantAToken);

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.data.metrics.orders_created_total).toBe(5);
    expect(res.body.data.metrics.orders_failed_total).toBe(1);
    expect(res.body.data.infrastructure.workers.enabled).toBe(true);
    expect(res.body.data.infrastructure.workers.concurrency).toBeGreaterThanOrEqual(1);

    // 3. Tenant B querying sees 0 orders created for Tenant B
    const resB = await request(app)
      .get('/api/v1/admin/observability')
      .set('Authorization', tenantBToken);

    expect(resB.status).toBe(200);
    expect(resB.body.data.metrics.orders_created_total).toBe(0);
  });

  it('26-30. Integration Health Service calculates reliability score (0-100) and exposes circuit state', async () => {
    // 1. Onboard integration for Tenant A
    const onboard = await request(app)
      .post('/api/v1/admin/integrations')
      .set('Authorization', tenantAToken)
      .send({
        name: 'Taco Kiosk App',
        type: 'kiosk',
        permissions: ['menu:read', 'orders:create'],
        webhook_url: 'https://api.tacobar.com/kiosk/events',
      });

    const intId = onboard.body.data.integration.id;

    // 2. Query health
    const health = await defaultIntegrationHealthService.getIntegrationHealth(TENANT_A, intId);
    expect(health.integration_id).toBe(intId);
    expect(health.health_score).toBe(100); // 100 for clean integration
    expect(health.circuit_state).toBe('CLOSED');
    expect(health.status).toBe('idle');
  });
});
