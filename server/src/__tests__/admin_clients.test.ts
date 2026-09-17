import { describe, it, expect, beforeEach } from 'vitest';
import request from 'supertest';
import { app } from '../index.js';
import { defaultApiClientService } from '../services/apiClient.service.js';
import { defaultBranchesService } from '../services/branches.service.js';
import { resetRateLimits } from '../middleware/rateLimiter.js';

describe('Phase 4A: API Client & Credential Management Test Suite', () => {
  let adminTokenA: string;
  let adminTokenB: string;
  let limitedClientToken: string;

  const TENANT_A = 'tenant_sushi_bar';
  const TENANT_B = 'tenant_burger_house';

  beforeEach(async () => {
    resetRateLimits();
    defaultApiClientService.clearMemory();
    defaultBranchesService.clearMemory();

    // 1. Seed branches
    defaultBranchesService.setMemoryBranch('branch_sushi_main', {
      tenant_id: TENANT_A,
      name: 'Sushi Bar Main Branch',
      isActive: true,
    });

    defaultBranchesService.setMemoryBranch('branch_burger_main', {
      tenant_id: TENANT_B,
      name: 'Burger Main Branch',
      isActive: true,
    });

    // 2. Create Admin API Client for Tenant A
    const adminA = await defaultApiClientService.createClient({
      tenant_id: TENANT_A,
      name: 'Tenant A Administrator',
      permissions: ['api_clients:manage', 'menu:read', 'orders:create'],
      allowed_branch_ids: [],
    });
    adminTokenA = `Bearer ${adminA.credential_header}`;

    // 3. Create Admin API Client for Tenant B
    const adminB = await defaultApiClientService.createClient({
      tenant_id: TENANT_B,
      name: 'Tenant B Administrator',
      permissions: ['api_clients:manage', 'menu:read'],
      allowed_branch_ids: [],
    });
    adminTokenB = `Bearer ${adminB.credential_header}`;

    // 4. Client without api_clients:manage permission
    const limited = await defaultApiClientService.createClient({
      tenant_id: TENANT_A,
      name: 'Limited Client',
      permissions: ['menu:read'],
      allowed_branch_ids: [],
    });
    limitedClientToken = `Bearer ${limited.credential_header}`;
  });

  // Test 1-5: Create client -> 201, unique client_id, secret returned once, secret hash exists, secret not stored plaintext
  it('1-5. Create client returns 201 with plaintext secret once and securely hashed in store', async () => {
    const res = await request(app)
      .post('/api/v1/admin/api-clients')
      .set('Authorization', adminTokenA)
      .send({
        name: 'Sushi Bar Mobile App',
        description: 'Customer ordering app',
        permissions: ['menu:read', 'orders:create', 'orders:read'],
        allowed_branch_ids: ['branch_sushi_main'],
        allowed_origins: ['https://sushibar.example.com'],
      });

    expect(res.status).toBe(201);
    expect(res.body.success).toBe(true);
    expect(res.body.data.client_id).toBeDefined();
    expect(res.body.data.client_secret).toBeDefined();
    expect(res.body.data.client_secret.startsWith('rms_sec_')).toBe(true);
    expect(res.body.data.warning).toBeDefined();

    const clientId = res.body.data.client_id;
    const rawSecret = res.body.data.client_secret;

    // Check stored client directly
    const stored = await defaultApiClientService.getClientByClientId(clientId);
    expect(stored).toBeDefined();
    expect(stored?.client_secret_hash).toBeDefined();
    expect(stored?.client_secret_hash).not.toBe(rawSecret); // Must NOT be plaintext
    expect(stored?.secret_last4).toBe(rawSecret.slice(-4));
  });

  // Test 6-7: GET list and GET single never expose secret or secret_hash
  it('6-7. GET list and GET single return safe metadata without secret or secret_hash', async () => {
    const createRes = await request(app)
      .post('/api/v1/admin/api-clients')
      .set('Authorization', adminTokenA)
      .send({
        name: 'Kiosk System',
        permissions: ['menu:read', 'orders:create'],
      });

    const clientId = createRes.body.data.client_id;

    // 1. List
    const listRes = await request(app)
      .get('/api/v1/admin/api-clients')
      .set('Authorization', adminTokenA);

    expect(listRes.status).toBe(200);
    expect(listRes.body.data.length).toBeGreaterThanOrEqual(2);
    for (const client of listRes.body.data) {
      expect(client.client_secret).toBeUndefined();
      expect(client.client_secret_hash).toBeUndefined();
      expect(client.secret_last4).toBeDefined();
    }

    // 2. Get Single
    const getRes = await request(app)
      .get(`/api/v1/admin/api-clients/${clientId}`)
      .set('Authorization', adminTokenA);

    expect(getRes.status).toBe(200);
    expect(getRes.body.data.id).toBe(clientId);
    expect(getRes.body.data.client_secret).toBeUndefined();
    expect(getRes.body.data.client_secret_hash).toBeUndefined();
  });

  // Test 8: Update client works
  it('8. PATCH update client modifies name, permissions, and origins', async () => {
    const createRes = await request(app)
      .post('/api/v1/admin/api-clients')
      .set('Authorization', adminTokenA)
      .send({
        name: 'Initial Name',
        permissions: ['menu:read'],
      });

    const clientId = createRes.body.data.client_id;

    const updateRes = await request(app)
      .patch(`/api/v1/admin/api-clients/${clientId}`)
      .set('Authorization', adminTokenA)
      .send({
        name: 'Updated Name',
        permissions: ['menu:read', 'orders:read'],
      });

    expect(updateRes.status).toBe(200);
    expect(updateRes.body.data.name).toBe('Updated Name');
    expect(updateRes.body.data.permissions).toEqual(['menu:read', 'orders:read']);
  });

  // Test 9: Cross-tenant client lookup returns 404
  it('9. Cross-tenant client operations return 404 Not Found', async () => {
    const createRes = await request(app)
      .post('/api/v1/admin/api-clients')
      .set('Authorization', adminTokenA)
      .send({
        name: 'Tenant A Secret App',
        permissions: ['menu:read'],
      });

    const clientId = createRes.body.data.client_id;

    // Tenant B attempts to read Tenant A client
    const getRes = await request(app)
      .get(`/api/v1/admin/api-clients/${clientId}`)
      .set('Authorization', adminTokenB);

    expect(getRes.status).toBe(404);
    expect(getRes.body.success).toBe(false);
  });

  // Test 10: Cross-tenant branch assignment rejected
  it('10. Cross-tenant branch assignment is rejected with 400 Validation Error', async () => {
    const res = await request(app)
      .post('/api/v1/admin/api-clients')
      .set('Authorization', adminTokenA)
      .send({
        name: 'Invalid Branch App',
        permissions: ['menu:read'],
        allowed_branch_ids: ['branch_burger_main'], // Belongs to Tenant B!
      });

    expect(res.status).toBe(400);
    expect(res.body.success).toBe(false);
  });

  // Test 11: Unknown permission rejected
  it('11. Unknown permission is rejected with 400 Validation Error', async () => {
    const res = await request(app)
      .post('/api/v1/admin/api-clients')
      .set('Authorization', adminTokenA)
      .send({
        name: 'Super Admin Exploit',
        permissions: ['root:superadmin_exploit' as any],
      });

    expect(res.status).toBe(400);
    expect(res.body.success).toBe(false);
  });

  // Test 12-13: Disable and Enable lifecycle
  it('12-13. Disabling prevents authentication and enabling restores it', async () => {
    const createRes = await request(app)
      .post('/api/v1/admin/api-clients')
      .set('Authorization', adminTokenA)
      .send({
        name: 'POS Terminal 3',
        permissions: ['menu:read'],
      });

    const clientId = createRes.body.data.client_id;
    const bearer = `Bearer ${createRes.body.data.credential_header}`;

    // 1. Works initially
    const test1 = await request(app).get('/api/v1/menu').set('Authorization', bearer);
    expect(test1.status).toBe(200);

    // 2. Disable client
    const disableRes = await request(app)
      .post(`/api/v1/admin/api-clients/${clientId}/disable`)
      .set('Authorization', adminTokenA);
    expect(disableRes.status).toBe(200);
    expect(disableRes.body.data.status).toBe('disabled');

    // 3. Authentication now fails (401)
    const test2 = await request(app).get('/api/v1/menu').set('Authorization', bearer);
    expect(test2.status).toBe(401);

    // 4. Enable client
    const enableRes = await request(app)
      .post(`/api/v1/admin/api-clients/${clientId}/enable`)
      .set('Authorization', adminTokenA);
    expect(enableRes.status).toBe(200);
    expect(enableRes.body.data.status).toBe('active');

    // 5. Authentication works again
    const test3 = await request(app).get('/api/v1/menu').set('Authorization', bearer);
    expect(test3.status).toBe(200);
  });

  // Test 14-15: Revoke is permanent and irreversible
  it('14-15. Revoking client is permanent and cannot be re-enabled', async () => {
    const createRes = await request(app)
      .post('/api/v1/admin/api-clients')
      .set('Authorization', adminTokenA)
      .send({
        name: 'Compromised Device',
        permissions: ['menu:read'],
      });

    const clientId = createRes.body.data.client_id;
    const bearer = `Bearer ${createRes.body.data.credential_header}`;

    // 1. Revoke client
    const revokeRes = await request(app)
      .post(`/api/v1/admin/api-clients/${clientId}/revoke`)
      .set('Authorization', adminTokenA);
    expect(revokeRes.status).toBe(200);
    expect(revokeRes.body.data.status).toBe('revoked');
    expect(revokeRes.body.data.revoked_at).toBeDefined();

    // 2. Authentication fails (401)
    const test1 = await request(app).get('/api/v1/menu').set('Authorization', bearer);
    expect(test1.status).toBe(401);

    // 3. Attempting to enable revoked client fails with 400
    const enableRes = await request(app)
      .post(`/api/v1/admin/api-clients/${clientId}/enable`)
      .set('Authorization', adminTokenA);
    expect(enableRes.status).toBe(400);
    expect(enableRes.body.error.code).toBe('CLIENT_REVOKED');
  });

  // Test 16-21: Rotate secret invalidates old secret, authenticates with new, preserves permissions
  it('16-21. Rotate secret invalidates old secret, returns new secret once, and preserves permissions/branches', async () => {
    const createRes = await request(app)
      .post('/api/v1/admin/api-clients')
      .set('Authorization', adminTokenA)
      .send({
        name: 'Delivery Integration',
        permissions: ['menu:read', 'orders:create'],
        allowed_branch_ids: ['branch_sushi_main'],
      });

    const clientId = createRes.body.data.client_id;
    const oldBearer = `Bearer ${createRes.body.data.credential_header}`;

    // 1. Rotate Secret
    const rotateRes = await request(app)
      .post(`/api/v1/admin/api-clients/${clientId}/rotate-secret`)
      .set('Authorization', adminTokenA);

    expect(rotateRes.status).toBe(200);
    expect(rotateRes.body.data.client_id).toBe(clientId);
    expect(rotateRes.body.data.client_secret).toBeDefined();
    expect(rotateRes.body.data.rotated_at).toBeDefined();

    const newBearer = `Bearer ${rotateRes.body.data.credential_header}`;

    // 2. Old secret fails
    const oldAuth = await request(app).get('/api/v1/menu').set('Authorization', oldBearer);
    expect(oldAuth.status).toBe(401);

    // 3. New secret succeeds
    const newAuth = await request(app).get('/api/v1/menu').set('Authorization', newBearer);
    expect(newAuth.status).toBe(200);

    // 4. Permissions & branch assignments preserved
    const client = await defaultApiClientService.getClientById(TENANT_A, clientId);
    expect(client.permissions).toEqual(['menu:read', 'orders:create']);
    expect(client.allowed_branch_ids).toEqual(['branch_sushi_main']);
  });

  // Test 22: Expired credentials rejected
  it('22. Expired credentials are rejected with 401', async () => {
    const expiredDate = new Date(Date.now() - 100000).toISOString();
    const createRes = await request(app)
      .post('/api/v1/admin/api-clients')
      .set('Authorization', adminTokenA)
      .send({
        name: 'Temporary Token',
        permissions: ['menu:read'],
        expires_at: expiredDate,
      });

    const bearer = `Bearer ${createRes.body.data.credential_header}`;
    const res = await request(app).get('/api/v1/menu').set('Authorization', bearer);
    expect(res.status).toBe(401);
  });

  // Test 23-24: Malformed and Wildcard origins rejected
  it('23-24. Malformed origins and Wildcard (*) are rejected with 400', async () => {
    const resWildcard = await request(app)
      .post('/api/v1/admin/api-clients')
      .set('Authorization', adminTokenA)
      .send({
        name: 'Insecure Client',
        permissions: ['menu:read'],
        allowed_origins: ['*'],
      });
    expect(resWildcard.status).toBe(400);

    const resMalformed = await request(app)
      .post('/api/v1/admin/api-clients')
      .set('Authorization', adminTokenA)
      .send({
        name: 'Malformed Client',
        permissions: ['menu:read'],
        allowed_origins: ['not-a-valid-url'],
      });
    expect(resMalformed.status).toBe(400);
  });

  // Test 25-31: Audit logs created for all actions and secrets never appear in logs
  it('25-31. Audit logs are generated for all lifecycle actions without leaking secrets', async () => {
    // 1. Create client
    const createRes = await request(app)
      .post('/api/v1/admin/api-clients')
      .set('Authorization', adminTokenA)
      .send({
        name: 'Audited Client',
        permissions: ['menu:read'],
      });
    const clientId = createRes.body.data.client_id;

    // 2. Update
    await request(app)
      .patch(`/api/v1/admin/api-clients/${clientId}`)
      .set('Authorization', adminTokenA)
      .send({ name: 'Audited Client Renamed' });

    // 3. Disable
    await request(app)
      .post(`/api/v1/admin/api-clients/${clientId}/disable`)
      .set('Authorization', adminTokenA);

    // 4. Enable
    await request(app)
      .post(`/api/v1/admin/api-clients/${clientId}/enable`)
      .set('Authorization', adminTokenA);

    // 5. Rotate Secret
    await request(app)
      .post(`/api/v1/admin/api-clients/${clientId}/rotate-secret`)
      .set('Authorization', adminTokenA);

    // 6. Revoke
    await request(app)
      .post(`/api/v1/admin/api-clients/${clientId}/revoke`)
      .set('Authorization', adminTokenA);

    // 7. Get Audit Logs
    const logsRes = await request(app)
      .get(`/api/v1/admin/api-clients/${clientId}/audit-logs`)
      .set('Authorization', adminTokenA);

    expect(logsRes.status).toBe(200);
    expect(logsRes.body.data.length).toBe(6);

    const actions = logsRes.body.data.map((l: any) => l.action);
    expect(actions).toContain('client.created');
    expect(actions).toContain('client.updated');
    expect(actions).toContain('client.disabled');
    expect(actions).toContain('client.enabled');
    expect(actions).toContain('client.secret_rotated');
    expect(actions).toContain('client.revoked');

    // Ensure raw secret NEVER appears in any audit metadata
    const fullLogJson = JSON.stringify(logsRes.body);
    expect(fullLogJson).not.toContain('rms_live_');
  });

  // Test 32-33: Missing api_clients:manage permission returns 403
  it('32-33. Missing api_clients:manage permission returns 403 Forbidden', async () => {
    const res = await request(app)
      .get('/api/v1/admin/api-clients')
      .set('Authorization', limitedClientToken);

    expect(res.status).toBe(403);
    expect(res.body.success).toBe(false);
    expect(res.body.error.code).toBe('FORBIDDEN');
  });

  // Test 34-36: Dual authentication supports Admin Dashboard session and created credential authenticates on menu
  it('34-36. Admin Dashboard session token creates API client whose secret authenticates on menu endpoint', async () => {
    const adminSessionToken = 'Bearer mock_admin_token_admin_user_123';

    // 1. Admin creates client via Dashboard session
    const createRes = await request(app)
      .post('/api/v1/admin/api-clients')
      .set('Authorization', adminSessionToken)
      .set('X-Tenant-ID', TENANT_A)
      .send({
        name: 'Sushi Storefront Live',
        permissions: ['menu:read', 'orders:create'],
        allowed_origins: ['https://sushi-bar.pages.dev'],
      });

    expect(createRes.status).toBe(201);
    expect(createRes.body.data.client_id).toBeDefined();
    expect(createRes.body.data.credential_header).toBeDefined();
    expect(createRes.body.data.client_secret).toBeDefined();

    const createdClientId = createRes.body.data.client_id;
    const clientBearerToken = `Bearer ${createRes.body.data.credential_header}`;

    // 2. Newly created client authenticates against /api/v1/menu
    const menuRes = await request(app)
      .get('/api/v1/menu')
      .set('Authorization', clientBearerToken)
      .set('Origin', 'https://sushi-bar.pages.dev');

    expect(menuRes.status).toBe(200);
    expect(menuRes.body.success).toBe(true);

    // 3. Admin rotates secret for client
    const rotateRes = await request(app)
      .post(`/api/v1/admin/api-clients/${createdClientId}/rotate-secret`)
      .set('Authorization', adminSessionToken)
      .set('X-Tenant-ID', TENANT_A);

    expect(rotateRes.status).toBe(200);
    const newCredentialHeader = rotateRes.body.data.credential_header;

    // 4. Old credential immediately fails
    const oldAuthRes = await request(app)
      .get('/api/v1/menu')
      .set('Authorization', clientBearerToken)
      .set('Origin', 'https://sushi-bar.pages.dev');

    expect(oldAuthRes.status).toBe(401);

    // 5. New credential authenticates successfully
    const newAuthRes = await request(app)
      .get('/api/v1/menu')
      .set('Authorization', `Bearer ${newCredentialHeader}`)
      .set('Origin', 'https://sushi-bar.pages.dev');

    expect(newAuthRes.status).toBe(200);

    // 6. Admin GET list immediately returns the newly created client
    const listRes = await request(app)
      .get('/api/v1/admin/api-clients')
      .set('Authorization', adminSessionToken)
      .set('X-Tenant-ID', TENANT_A);

    expect(listRes.status).toBe(200);
    expect(listRes.body.success).toBe(true);
    const found = listRes.body.data.find((c: any) => c.client_id === createdClientId);
    expect(found).toBeDefined();
    expect(found.name).toBe('Sushi Storefront Live');
    expect(found.status).toBe('active');
    expect(found.client_secret_hash).toBeUndefined();
  });
});
