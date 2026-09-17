import { describe, it, expect, beforeEach } from 'vitest';
import express from 'express';
import request from 'supertest';
import { ApiClientService } from '../services/apiClient.service.js';
import { createAuthMiddleware } from '../middleware/auth.middleware.js';
import { requirePermission } from '../middleware/permission.middleware.js';
import { requireBranchAccess } from '../middleware/branch.middleware.js';
import { createRateLimiter, resetRateLimits } from '../middleware/rateLimiter.js';
import { errorHandler } from '../middleware/error.middleware.js';
import { requestIdMiddleware } from '../middleware/requestId.js';
import { sendSuccess } from '../utils/response.js';
import { AuthenticatedRequest } from '../types/api.types.js';

describe('RMS API Authentication & Authorization Suite', () => {
  let clientService: ApiClientService;
  let app: express.Application;
  let validCredentialHeader: string;
  let testClientId: string;

  beforeEach(async () => {
    resetRateLimits();
    clientService = new ApiClientService(true); // use in-memory store for tests
    clientService.clearMemory();

    // Create a standard active test client for Tenant A with specific branch and permissions
    const created = await clientService.createClient({
      tenant_id: 'tenant_sushi_bar',
      name: 'Sushi Bar Web Client',
      permissions: ['menu:read', 'orders:create'],
      allowed_branch_ids: ['branch_main', 'branch_downtown'],
      allowed_origins: ['https://sushibar.com'],
    });

    testClientId = created.client.client_id;
    validCredentialHeader = `Bearer ${created.credential_header}`;

    // Setup Test Express App with endpoints representing protected resources
    app = express();
    app.use(express.json());
    app.use(requestIdMiddleware);

    const authMiddleware = createAuthMiddleware(clientService);

    // 1. Basic authenticated endpoint
    app.get('/api/v1/test/auth', authMiddleware, (req: AuthenticatedRequest, res) => {
      sendSuccess(res, { context: req.apiClient });
    });

    // 2. Permission protected endpoint
    app.get(
      '/api/v1/test/orders',
      authMiddleware,
      requirePermission('orders:create'),
      (req: AuthenticatedRequest, res) => {
        sendSuccess(res, { message: 'Order endpoint accessed' });
      }
    );

    // 3. Unpermitted endpoint for this client
    app.get(
      '/api/v1/test/reservations',
      authMiddleware,
      requirePermission('reservations:create'),
      (req: AuthenticatedRequest, res) => {
        sendSuccess(res, { message: 'Reservation endpoint accessed' });
      }
    );

    // 4. Branch protected endpoint
    app.get(
      '/api/v1/test/branches/:branchId/menu',
      authMiddleware,
      requireBranchAccess('branchId'),
      (req: AuthenticatedRequest, res) => {
        sendSuccess(res, { branch: req.params.branchId });
      }
    );

    // 5. Tenant isolated create order endpoint
    app.post(
      '/api/v1/test/orders',
      authMiddleware,
      (req: AuthenticatedRequest, res) => {
        sendSuccess(res, { tenantId: req.apiClient?.tenantId, bodyTenant: req.body.tenant_id });
      }
    );

    // 6. Rate limited test endpoint
    const customLimiter = createRateLimiter(2, 60000); // 2 requests per minute limit
    app.get('/api/v1/test/limited', customLimiter, (req, res) => {
      sendSuccess(res, { limited: false });
    });

    app.use(errorHandler);
  });

  // Scenario 1: Missing credentials → 401
  it('1. Missing credentials should return 401 Unauthorized', async () => {
    const res = await request(app).get('/api/v1/test/auth');

    expect(res.status).toBe(401);
    expect(res.body.success).toBe(false);
    expect(res.body.error.code).toBe('UNAUTHORIZED');
  });

  // Scenario 2: Invalid credentials → 401
  it('2. Invalid credentials should return 401 Unauthorized', async () => {
    const res = await request(app)
      .get('/api/v1/test/auth')
      .set('Authorization', 'Bearer rms_live_invalid_client.wrong_secret');

    expect(res.status).toBe(401);
    expect(res.body.success).toBe(false);
    expect(res.body.error.code).toBe('UNAUTHORIZED');
  });

  // Scenario 3: Expired credentials → 401
  it('3. Expired credentials should return 401 Unauthorized', async () => {
    const expiredClient = await clientService.createClient({
      tenant_id: 'tenant_sushi_bar',
      name: 'Expired Client',
      permissions: ['menu:read'],
      expires_in_days: -1, // Expired yesterday
    });

    const res = await request(app)
      .get('/api/v1/test/auth')
      .set('Authorization', `Bearer ${expiredClient.credential_header}`);

    expect(res.status).toBe(401);
    expect(res.body.success).toBe(false);
    expect(res.body.error.code).toBe('UNAUTHORIZED');
    expect(res.body.error.message).toContain('expired');
  });

  // Scenario 4: Disabled client → 401
  it('4. Disabled client should return 401 Unauthorized', async () => {
    await clientService.disableClient(testClientId);

    const res = await request(app)
      .get('/api/v1/test/auth')
      .set('Authorization', validCredentialHeader);

    expect(res.status).toBe(401);
    expect(res.body.success).toBe(false);
    expect(res.body.error.code).toBe('UNAUTHORIZED');
    expect(res.body.error.message).toContain('disabled');
  });

  // Scenario 5: Valid credentials → success
  it('5. Valid credentials should return 200 and inject RequestContext', async () => {
    const res = await request(app)
      .get('/api/v1/test/auth')
      .set('Authorization', validCredentialHeader);

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.data.context.clientId).toBe(testClientId);
    expect(res.body.data.context.tenantId).toBe('tenant_sushi_bar');
    expect(res.body.data.context.permissions).toContain('menu:read');
  });

  // Scenario 6: Unauthorized tenant spoofing attempt → 403
  it('6. Attempting to spoof another tenant_id in request body should return 403 Forbidden', async () => {
    const res = await request(app)
      .post('/api/v1/test/orders')
      .set('Authorization', validCredentialHeader)
      .send({
        tenant_id: 'different_attacker_tenant',
        items: [{ id: '1', quantity: 2 }],
      });

    expect(res.status).toBe(403);
    expect(res.body.success).toBe(false);
    expect(res.body.error.code).toBe('FORBIDDEN');
    expect(res.body.error.message).toContain('Tenant mismatch');
  });

  // Scenario 7: Unauthorized branch → 403
  it('7. Accessing an unauthorized branch should return 403 Forbidden', async () => {
    // Client only has ['branch_main', 'branch_downtown']
    const res = await request(app)
      .get('/api/v1/test/branches/branch_unauthorized_999/menu')
      .set('Authorization', validCredentialHeader);

    expect(res.status).toBe(403);
    expect(res.body.success).toBe(false);
    expect(res.body.error.code).toBe('FORBIDDEN');
    expect(res.body.error.message).toContain('Branch access denied');
  });

  // Scenario 8: Missing permission → 403
  it('8. Missing required permission should return 403 Forbidden', async () => {
    // Client does NOT have 'reservations:create'
    const res = await request(app)
      .get('/api/v1/test/reservations')
      .set('Authorization', validCredentialHeader);

    expect(res.status).toBe(403);
    expect(res.body.success).toBe(false);
    expect(res.body.error.code).toBe('FORBIDDEN');
    expect(res.body.error.message).toContain('Missing required permission');
  });

  // Scenario 9: Valid permission → success
  it('9. Valid required permission should succeed with 200', async () => {
    // Client HAS 'orders:create'
    const res = await request(app)
      .get('/api/v1/test/orders')
      .set('Authorization', validCredentialHeader);

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
  });

  // Scenario 10: Rate limit exceeded → 429
  it('10. Exceeding rate limit should return 429 RateLimitError', async () => {
    // Limit is 2 requests
    const res1 = await request(app).get('/api/v1/test/limited');
    expect(res1.status).toBe(200);

    const res2 = await request(app).get('/api/v1/test/limited');
    expect(res2.status).toBe(200);

    const res3 = await request(app).get('/api/v1/test/limited');
    expect(res3.status).toBe(429);
    expect(res3.body.success).toBe(false);
    expect(res3.body.error.code).toBe('RATE_LIMIT_EXCEEDED');
  });
});
