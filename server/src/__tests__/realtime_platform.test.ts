import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import request from 'supertest';
import express, { Express } from 'express';
import { WebSocket } from 'ws';
import { defaultInMemoryEventBus, InMemoryEventBus } from '../realtime/event-bus/inMemoryEventBus.js';
import { RedisEventBus } from '../realtime/event-bus/redisEventBus.js';
import { EventPublisher } from '../realtime/events/eventPublisher.js';
import { InMemoryEventReplayStore } from '../realtime/replay/eventReplayStore.js';
import { EventReplayService } from '../realtime/replay/eventReplay.service.js';
import { SseManager } from '../realtime/sse/sseManager.js';
import { createSseRoutes } from '../realtime/sse/sse.routes.js';
import { WebsocketManager } from '../realtime/websocket/websocketManager.js';
import { toPublicEvent, sanitizePayloadData, validateEventEnvelope } from '../realtime/events/eventValidator.js';
import { isAuthorizedForEvent } from '../realtime/events/eventRegistry.js';
import { defaultApiClientService } from '../services/apiClient.service.js';
import { v1Router } from '../routes/v1/index.js';
import { errorHandler } from '../middleware/error.middleware.js';

describe('Phase 8C: Universal Real-Time Event Platform Suite', () => {
  let app: Express;
  let testEventBus: InMemoryEventBus;
  let testReplayStore: InMemoryEventReplayStore;
  let testReplayService: EventReplayService;
  let testPublisher: EventPublisher;
  let testSseManager: SseManager;
  let testWsManager: WebsocketManager;

  const TENANT_A = 'tenant_rest_alpha';
  const TENANT_B = 'tenant_rest_beta';
  let clientAKey: string;
  let clientBKey: string;
  let clientARestrictedBranchKey: string;

  beforeEach(async () => {
    testEventBus = new InMemoryEventBus();
    testReplayStore = new InMemoryEventReplayStore(100);
    testReplayService = new EventReplayService(testReplayStore);
    testPublisher = new EventPublisher(testEventBus, testReplayStore);
    testSseManager = new SseManager(testEventBus, testReplayService, 5, 3);
    testWsManager = new WebsocketManager(testEventBus, testReplayService, 5, 3, 2);

    app = express();
    app.use(express.json());
    app.use('/api/v1', v1Router);
    app.use(errorHandler);

    // Create test clients
    const clientA = await defaultApiClientService.createClient({
      tenant_id: TENANT_A,
      name: 'Client Alpha Full',
      type: 'custom_website',
      permissions: ['menu:read', 'orders:create', 'orders:read', 'orders:update_status', 'branches:read', 'delivery:read'],
      allowed_branch_ids: [],
    });
    clientAKey = clientA.credential_header;

    const clientB = await defaultApiClientService.createClient({
      tenant_id: TENANT_B,
      name: 'Client Beta Full',
      type: 'custom_website',
      permissions: ['menu:read', 'orders:create', 'orders:read', 'branches:read'],
      allowed_branch_ids: [],
    });
    clientBKey = clientB.credential_header;

    const clientARestricted = await defaultApiClientService.createClient({
      tenant_id: TENANT_A,
      name: 'Client Alpha Branch 1 Only',
      type: 'kiosk',
      permissions: ['menu:read', 'orders:read', 'branches:read'],
      allowed_branch_ids: ['branch_alpha_1'],
    });
    clientARestrictedBranchKey = clientARestricted.credential_header;
  });

  afterEach(() => {
    testSseManager.closeAll();
    testWsManager.closeAll();
  });

  // ==================== 1. SSE AUTHENTICATION & HEADERS ====================

  it('1. GET /api/v1/realtime/events returns 401 Unauthorized without credentials', async () => {
    const res = await request(app).get('/api/v1/realtime/events');
    expect(res.status).toBe(401);
    expect(res.body.success).toBe(false);
  });

  it('2. GET /api/v1/realtime/events returns 401 with invalid API key', async () => {
    const res = await request(app)
      .get('/api/v1/realtime/events')
      .set('Authorization', 'Bearer rms_live_invalidkey123_sec_invalid');
    expect(res.status).toBe(401);
    expect(res.body.success).toBe(false);
  });

  // ==================== 2. EVENT VALIDATION & SANITIZATION ====================

  it('3. validateEventEnvelope strictly validates event structure', () => {
    expect(() => validateEventEnvelope(null)).toThrow();
    expect(() => validateEventEnvelope({ id: 'evt_1' })).toThrow(); // missing tenant_id, type, etc.

    const valid = validateEventEnvelope({
      id: 'evt_12345',
      type: 'order.created',
      version: '1',
      tenant_id: TENANT_A,
      resource_type: 'order',
      resource_id: 'ord_123',
      request_id: 'req_123',
      timestamp: new Date().toISOString(),
      data: { total: 100 },
    });
    expect(valid.id).toBe('evt_12345');
  });

  it('4. sanitizePayloadData and toPublicEvent redact sensitive secrets, passwords, and private keys', () => {
    const rawData = {
      order_id: 'ord_101',
      customer_name: 'John Doe',
      auth_token: 'secret_jwt_token_123',
      payment: {
        card_number: '4111222233334444',
        cvv: '123',
        secret_key: 'topsecret',
      },
    };

    const sanitized = sanitizePayloadData(rawData);
    expect(sanitized.order_id).toBe('ord_101');
    expect(sanitized.customer_name).toBe('John Doe');
    expect(sanitized.auth_token).toBe('<REDACTED>');
    expect(sanitized.payment.card_number).toBe('<REDACTED>');
    expect(sanitized.payment.cvv).toBe('<REDACTED>');
    expect(sanitized.payment.secret_key).toBe('<REDACTED>');

    const publicEvt = toPublicEvent({
      id: 'evt_sec_01',
      type: 'payment.completed',
      version: '1',
      tenant_id: TENANT_A,
      resource_type: 'payment',
      resource_id: 'pay_999',
      request_id: 'req_sec',
      timestamp: new Date().toISOString(),
      data: rawData,
    });

    expect(publicEvt.data.payment.card_number).toBe('<REDACTED>');
  });

  // ==================== 3. TENANT ISOLATION ====================

  it('5. Tenant Isolation: Tenant A subscribers NEVER receive events published by Tenant B', async () => {
    const receivedByA: any[] = [];
    const receivedByB: any[] = [];

    testEventBus.subscribe({ tenant_id: TENANT_A }, (evt) => {
      receivedByA.push(evt);
    });

    testEventBus.subscribe({ tenant_id: TENANT_B }, (evt) => {
      receivedByB.push(evt);
    });

    // Publish event for Tenant A
    await testPublisher.publish(TENANT_A, 'order.created', 'order', 'ord_a_1', { amount: 50 });

    // Publish event for Tenant B
    await testPublisher.publish(TENANT_B, 'order.created', 'order', 'ord_b_1', { amount: 80 });

    expect(receivedByA.length).toBe(1);
    expect(receivedByA[0].resource_id).toBe('ord_a_1');
    expect(receivedByA[0].tenant_id).toBe(TENANT_A);

    expect(receivedByB.length).toBe(1);
    expect(receivedByB[0].resource_id).toBe('ord_b_1');
    expect(receivedByB[0].tenant_id).toBe(TENANT_B);
  });

  // ==================== 4. BRANCH FILTERING & RESTRICTION ====================

  it('6. Branch Isolation: Client restricted to Branch 1 never receives events from Branch 2', async () => {
    const receivedByRestricted: any[] = [];

    testEventBus.subscribe(
      {
        tenant_id: TENANT_A,
        allowed_branch_ids: ['branch_alpha_1'],
      },
      (evt) => {
        receivedByRestricted.push(evt);
      }
    );

    // Event on Branch 1 (Allowed)
    await testPublisher.publish(TENANT_A, 'order.created', 'order', 'ord_1', { items: 1 }, {
      branch_id: 'branch_alpha_1',
    });

    // Event on Branch 2 (Restricted)
    await testPublisher.publish(TENANT_A, 'order.created', 'order', 'ord_2', { items: 2 }, {
      branch_id: 'branch_alpha_2',
    });

    expect(receivedByRestricted.length).toBe(1);
    expect(receivedByRestricted[0].resource_id).toBe('ord_1');
  });

  it('7. Branch Subscription Forbidden: Client cannot subscribe directly to unauthorized branch', async () => {
    const res = await request(app)
      .get('/api/v1/realtime/events?branch_id=branch_alpha_2')
      .set('Authorization', `Bearer ${clientARestrictedBranchKey}`);

    expect(res.status).toBe(403);
    expect(res.body.error.message).toContain('Branch access denied');
  });

  // ==================== 5. PERMISSION FILTERING ====================

  it('8. Permission Isolation: Subscriber without orders:read does not receive order events', async () => {
    const received: any[] = [];

    // Client has only menu:read
    testEventBus.subscribe(
      {
        tenant_id: TENANT_A,
        permissions: ['menu:read'],
      },
      (evt) => {
        received.push(evt);
      }
    );

    // Publish order event (requires orders:read)
    await testPublisher.publish(TENANT_A, 'order.created', 'order', 'ord_x', {});

    // Publish menu event (requires menu:read)
    await testPublisher.publish(TENANT_A, 'menu.updated', 'menu', 'menu_1', {});

    expect(received.length).toBe(1);
    expect(received[0].type).toBe('menu.updated');
  });

  // ==================== 6. EVENT REPLAY & LAST-EVENT-ID ====================

  it('9. Event Replay: Replays missed events following Last-Event-ID', async () => {
    const evt1 = await testPublisher.publish(TENANT_A, 'order.created', 'order', 'ord_101', { num: 1 });
    const evt2 = await testPublisher.publish(TENANT_A, 'order.created', 'order', 'ord_102', { num: 2 });
    const evt3 = await testPublisher.publish(TENANT_A, 'order.created', 'order', 'ord_103', { num: 3 });

    const replay = await testReplayService.replayEvents({
      tenant_id: TENANT_A,
      last_event_id: evt1.id,
    });

    expect(replay.events.length).toBe(2);
    expect(replay.events[0].id).toBe(evt2.id);
    expect(replay.events[1].id).toBe(evt3.id);
  });

  it('10. Event Replay Isolation: Tenant A cannot replay events of Tenant B', async () => {
    const evtB = await testPublisher.publish(TENANT_B, 'order.created', 'order', 'ord_b_100', {});

    const replay = await testReplayService.replayEvents({
      tenant_id: TENANT_A,
      last_event_id: evtB.id,
    });

    // None of Tenant B's events are leaked
    expect(replay.events.every((e) => e.tenant_id === TENANT_A)).toBe(true);
  });

  // ==================== 7. CONNECTION LIMITS ====================

  it('11. Enforces maximum active SSE connections limit per tenant and integration', async () => {
    const fakeRes: any = {
      setHeader: vi.fn(),
      flushHeaders: vi.fn(),
      write: vi.fn(),
      end: vi.fn(),
      on: vi.fn(),
    };

    // Manager max is 5 per tenant, 3 per integration
    await testSseManager.handleConnection({ tenantId: TENANT_A, integrationId: 'int_1', clientId: 'cli_1', allowedBranchIds: [], permissions: [], requestId: 'r1' }, fakeRes);
    await testSseManager.handleConnection({ tenantId: TENANT_A, integrationId: 'int_1', clientId: 'cli_1', allowedBranchIds: [], permissions: [], requestId: 'r2' }, fakeRes);
    await testSseManager.handleConnection({ tenantId: TENANT_A, integrationId: 'int_1', clientId: 'cli_1', allowedBranchIds: [], permissions: [], requestId: 'r3' }, fakeRes);

    // 4th connection on same integration exceeds limit
    await expect(
      testSseManager.handleConnection({ tenantId: TENANT_A, integrationId: 'int_1', clientId: 'cli_1', allowedBranchIds: [], permissions: [], requestId: 'r4' }, fakeRes)
    ).rejects.toThrow('limit exceeded');
  });

  // ==================== 8. REDIS FALLBACK & RESILIENCE ====================

  it('12. Redis Event Bus falls back to in-memory dispatch on disconnect without crashing', async () => {
    const redisBus = new RedisEventBus('rms:events:');
    redisBus.setRedisConnected(false); // Disconnected
    expect(redisBus.isHealthy()).toBe(false);

    const received: any[] = [];
    redisBus.subscribe({ tenant_id: TENANT_A }, (evt) => {
      received.push(evt);
    });

    // Should publish cleanly via in-memory fallback
    await redisBus.publish({
      id: 'evt_fallback_1',
      type: 'order.created',
      version: '1',
      tenant_id: TENANT_A,
      resource_type: 'order',
      resource_id: 'ord_fall',
      request_id: 'req_fall',
      timestamp: new Date().toISOString(),
      data: { status: 'fallback_ok' },
    });

    expect(received.length).toBe(1);
    expect(received[0].id).toBe('evt_fallback_1');
  });

  // ==================== 9. HEALTH CHECK INTEGRATION ====================

  it('13. GET /api/v1/health exposes realtime health status', async () => {
    const res = await request(app).get('/api/v1/health');
    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.realtime).toBeDefined();
    expect(res.body.realtime.status).toBe('healthy');
  });
});
