import { describe, it, expect, beforeEach } from 'vitest';
import request from 'supertest';
import { app } from '../index.js';
import { defaultApiClientService } from '../services/apiClient.service.js';
import { defaultMenuService } from '../services/menu.service.js';
import { defaultBranchesService } from '../services/branches.service.js';
import { defaultDeliveryService } from '../services/delivery.service.js';
import { defaultOffersService } from '../services/offers.service.js';
import { defaultSettingsService } from '../services/settings.service.js';
import { defaultInventoryService } from '../services/inventory.service.js';
import { resetRateLimits } from '../middleware/rateLimiter.js';

describe('Phase 2: RMS REST API Catalog, Branches, Delivery & Offers Suite', () => {
  let tenantAToken: string;
  let tenantBToken: string;
  let restrictedBranchToken: string;
  let limitedPermissionToken: string;

  const TENANT_A = 'tenant_sushi_bar';
  const TENANT_B = 'tenant_burger_house';

  beforeEach(async () => {
    resetRateLimits();
    defaultApiClientService.clearMemory();
    defaultMenuService.clearMemory();
    defaultBranchesService.clearMemory();
    defaultDeliveryService.clearMemory();
    defaultOffersService.clearMemory();
    defaultSettingsService.clearMemory();
    defaultInventoryService.clearMemory();

    // 1. Create API Clients
    // Client A: All permissions for Tenant A, all branches
    const clientA = await defaultApiClientService.createClient({
      tenant_id: TENANT_A,
      name: 'Sushi Bar Full Client',
      permissions: ['menu:read', 'offers:read', 'branches:read', 'delivery:read'],
      allowed_branch_ids: [],
    });
    tenantAToken = `Bearer ${clientA.credential_header}`;

    // Client B: For Tenant B
    const clientB = await defaultApiClientService.createClient({
      tenant_id: TENANT_B,
      name: 'Burger House Client',
      permissions: ['menu:read', 'offers:read', 'branches:read', 'delivery:read'],
      allowed_branch_ids: [],
    });
    tenantBToken = `Bearer ${clientB.credential_header}`;

    // Client C: Restricted to 'branch_sushi_main' only
    const clientRestricted = await defaultApiClientService.createClient({
      tenant_id: TENANT_A,
      name: 'Sushi Bar Branch Main Only',
      permissions: ['menu:read', 'offers:read', 'branches:read', 'delivery:read'],
      allowed_branch_ids: ['branch_sushi_main'],
    });
    restrictedBranchToken = `Bearer ${clientRestricted.credential_header}`;

    // Client D: Only 'branches:read' (missing 'menu:read')
    const clientNoMenu = await defaultApiClientService.createClient({
      tenant_id: TENANT_A,
      name: 'Sushi Bar No Menu Perm',
      permissions: ['branches:read'],
      allowed_branch_ids: [],
    });
    limitedPermissionToken = `Bearer ${clientNoMenu.credential_header}`;

    // 2. Seed Tenant A Data
    defaultBranchesService.setMemoryBranch('branch_sushi_main', {
      tenant_id: TENANT_A,
      name: 'Sushi Bar Main Branch',
      address: '123 Ocean Ave',
      phone: '01011111111',
      isActive: true,
    });

    defaultBranchesService.setMemoryBranch('branch_sushi_downtown', {
      tenant_id: TENANT_A,
      name: 'Sushi Bar Downtown',
      address: '456 City St',
      phone: '01022222222',
      isActive: true,
    });

    defaultMenuService.setMemoryCategory('cat_sushi_rolls', {
      tenant_id: TENANT_A,
      name: 'سوشي رول',
      name_en: 'Sushi Rolls',
      sort_order: 1,
    });

    defaultMenuService.setMemoryCategory('cat_sashimi', {
      tenant_id: TENANT_A,
      name: 'ساشيمي',
      name_en: 'Sashimi',
      sort_order: 2,
    });

    defaultMenuService.setMemoryProduct('prod_california', {
      tenant_id: TENANT_A,
      category_id: 'cat_sushi_rolls',
      name: 'كاليفورنيا رول',
      name_en: 'California Roll',
      description: 'كراب طازج مع أفوكادو وخيار',
      price: 150,
      cost: 45, // Internal field - MUST BE STRIPPED
      is_available: true,
      preparation_time: 15,
      calories: 320,
      allergens: ['fish', 'crustaceans'],
    });

    defaultMenuService.setMemoryProduct('prod_salmon_sashimi', {
      tenant_id: TENANT_A,
      category_id: 'cat_sashimi',
      name: 'ساشيمي سلمون',
      name_en: 'Salmon Sashimi',
      price: 220,
      cost: 90, // Internal field - MUST BE STRIPPED
      is_available: false, // Inactive / unavailable item
    });

    // 3. Seed Tenant B Data (to test isolation)
    defaultMenuService.setMemoryCategory('cat_burgers', {
      tenant_id: TENANT_B,
      name: 'برجر لحم',
      sort_order: 1,
    });

    defaultMenuService.setMemoryProduct('prod_cheeseburger', {
      tenant_id: TENANT_B,
      category_id: 'cat_burgers',
      name: 'تشيز برجر كلاسيك',
      price: 180,
      is_available: true,
    });

    // 4. Seed Delivery Zones
    defaultDeliveryService.setMemoryZone('zone_zamalek', {
      tenant_id: TENANT_A,
      name: 'الزمالك',
      price: 35,
      estimated_time: 40,
    });

    defaultDeliveryService.setMemoryZone('zone_nasr_city', {
      tenant_id: TENANT_B, // Belongs to Tenant B
      name: 'مدينة نصر',
      price: 45,
      estimated_time: 50,
    });

    // 5. Seed Offers
    defaultOffersService.setMemoryOffer('promo_active_10', {
      tenant_id: TENANT_A,
      name: 'خصم الافتتاح 10%',
      type: 'percentage',
      value: 10,
      is_active: true,
      start_date: new Date(Date.now() - 86400000).toISOString(),
      end_date: new Date(Date.now() + 86400000 * 7).toISOString(),
      usage_count: 5,
      usage_limit: 100,
    });

    defaultOffersService.setMemoryOffer('promo_inactive', {
      tenant_id: TENANT_A,
      name: 'عرض متوقف',
      type: 'fixed',
      value: 50,
      is_active: false,
    });

    defaultOffersService.setMemoryOffer('promo_expired', {
      tenant_id: TENANT_A,
      name: 'عرض منتهي الصلاحية',
      type: 'percentage',
      value: 20,
      is_active: true,
      start_date: new Date(Date.now() - 86400000 * 10).toISOString(),
      end_date: new Date(Date.now() - 86400000 * 2).toISOString(), // Expired 2 days ago
    });

    // 6. Seed Settings
    defaultSettingsService.setMemoryTenant(TENANT_A, {
      name: 'Sushi Bar Cairo',
      logo: 'https://cdn.example.com/sushi-logo.png',
      settings: {
        currency: 'EGP',
        locale: 'ar-EG',
        timezone: 'Africa/Cairo',
        taxRate: 14,
        taxIncluded: false,
        invoicePhone: '01000000000',
        invoiceAddress: 'Cairo, Egypt',
        primaryColor: '#ea580c',
        // Internal/Sensitive settings - MUST NEVER BE EXPOSED
        openDrawerPassword: 'secret_drawer_pin_1234',
        logAllOperations: true,
      },
    });
  });

  // Test 1: valid menu request
  it('1. Valid GET /api/v1/menu returns complete public catalog', async () => {
    const res = await request(app)
      .get('/api/v1/menu')
      .set('Authorization', tenantAToken);

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.data.categories).toHaveLength(2);
    expect(res.body.data.products).toHaveLength(2);
    expect(res.body.data.categories[0].name).toBe('سوشي رول');
    const productNames = res.body.data.products.map((p: any) => p.name);
    expect(productNames).toContain('كاليفورنيا رول');
    expect(productNames).toContain('ساشيمي سلمون');
    // Ensure internal cost field is stripped
    expect(res.body.data.products[0].cost).toBeUndefined();
    expect(res.body.data.products[1].cost).toBeUndefined();
  });

  // Test 2: unauthenticated menu request
  it('2. Unauthenticated GET /api/v1/menu returns 401 Unauthorized', async () => {
    const res = await request(app).get('/api/v1/menu');

    expect(res.status).toBe(401);
    expect(res.body.success).toBe(false);
    expect(res.body.error.code).toBe('UNAUTHORIZED');
  });

  // Test 3: invalid API credentials
  it('3. Invalid API credentials return 401 Unauthorized', async () => {
    const res = await request(app)
      .get('/api/v1/menu')
      .set('Authorization', 'Bearer rms_live_fake_client.fake_secret');

    expect(res.status).toBe(401);
    expect(res.body.success).toBe(false);
    expect(res.body.error.code).toBe('UNAUTHORIZED');
  });

  // Test 4: unauthorized permission
  it('4. Missing required permission returns 403 Forbidden', async () => {
    // limitedPermissionToken only has 'branches:read', missing 'menu:read'
    const res = await request(app)
      .get('/api/v1/menu')
      .set('Authorization', limitedPermissionToken);

    expect(res.status).toBe(403);
    expect(res.body.success).toBe(false);
    expect(res.body.error.code).toBe('FORBIDDEN');
    expect(res.body.error.message).toContain('Missing required permission');
  });

  // Test 5: tenant isolation
  it('5. Tenant A cannot see Tenant B catalog and vice-versa', async () => {
    // Tenant A request
    const resA = await request(app)
      .get('/api/v1/products')
      .set('Authorization', tenantAToken);

    expect(resA.status).toBe(200);
    const productNamesA = resA.body.data.map((p: any) => p.name);
    expect(productNamesA).toContain('كاليفورنيا رول');
    expect(productNamesA).not.toContain('تشيز برجر كلاسيك');

    // Tenant B request
    const resB = await request(app)
      .get('/api/v1/products')
      .set('Authorization', tenantBToken);

    expect(resB.status).toBe(200);
    const productNamesB = resB.body.data.map((p: any) => p.name);
    expect(productNamesB).toContain('تشيز برجر كلاسيك');
    expect(productNamesB).not.toContain('كاليفورنيا رول');
  });

  // Test 6: product from another tenant returns 404
  it('6. Product from another tenant returns 404 without revealing existence', async () => {
    // Tenant A tries to fetch Tenant B's product
    const res = await request(app)
      .get('/api/v1/products/prod_cheeseburger')
      .set('Authorization', tenantAToken);

    expect(res.status).toBe(404);
    expect(res.body.success).toBe(false);
    expect(res.body.error.code).toBe('NOT_FOUND');
  });

  // Test 7: unauthorized branch returns 403
  it('7. Accessing an unauthorized branch context returns 403 Forbidden', async () => {
    // restrictedBranchToken only allows 'branch_sushi_main'
    const res = await request(app)
      .get('/api/v1/menu?branch_id=branch_sushi_downtown')
      .set('Authorization', restrictedBranchToken);

    expect(res.status).toBe(403);
    expect(res.body.success).toBe(false);
    expect(res.body.error.code).toBe('FORBIDDEN');
    expect(res.body.error.message).toContain('Branch access denied');
  });

  // Test 8: valid branch returns data
  it('8. Valid branch context returns branch data attached to menu', async () => {
    const res = await request(app)
      .get('/api/v1/menu?branch_id=branch_sushi_main')
      .set('Authorization', tenantAToken);

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.data.branch).toBeDefined();
    expect(res.body.data.branch.id).toBe('branch_sushi_main');
    expect(res.body.data.branch.name).toBe('Sushi Bar Main Branch');
  });

  // Test 9: inactive products filtered with available_only=true
  it('9. Inactive products are filtered out when available_only=true', async () => {
    const res = await request(app)
      .get('/api/v1/products?available_only=true')
      .set('Authorization', tenantAToken);

    expect(res.status).toBe(200);
    expect(res.body.data).toHaveLength(1);
    expect(res.body.data[0].id).toBe('prod_california');
  });

  // Test 10: inactive offers are hidden
  it('10. Inactive offers are hidden from GET /api/v1/offers', async () => {
    const res = await request(app)
      .get('/api/v1/offers')
      .set('Authorization', tenantAToken);

    expect(res.status).toBe(200);
    const offerIds = res.body.data.map((o: any) => o.id);
    expect(offerIds).not.toContain('promo_inactive');
  });

  // Test 11: expired offers are hidden
  it('11. Expired offers are hidden from GET /api/v1/offers', async () => {
    const res = await request(app)
      .get('/api/v1/offers')
      .set('Authorization', tenantAToken);

    expect(res.status).toBe(200);
    const offerIds = res.body.data.map((o: any) => o.id);
    expect(offerIds).not.toContain('promo_expired');
    expect(offerIds).toContain('promo_active_10');
  });

  // Test 12: invalid query parameters return 400
  it('12. Invalid query parameters return 400 Validation Error', async () => {
    // limit exceeds max (100) or is negative
    const res = await request(app)
      .get('/api/v1/products?limit=500')
      .set('Authorization', tenantAToken);

    expect(res.status).toBe(400);
    expect(res.body.success).toBe(false);
    expect(res.body.error.code).toBe('VALIDATION_ERROR');
  });

  // Test 13: delivery zone from another tenant cannot be accessed
  it('13. Delivery zone from another tenant returns 404 on check', async () => {
    // Tenant A tries to validate Tenant B's zone 'zone_nasr_city'
    const res = await request(app)
      .post('/api/v1/delivery-zones/check')
      .set('Authorization', tenantAToken)
      .send({ zone_id: 'zone_nasr_city' });

    expect(res.status).toBe(404);
    expect(res.body.success).toBe(false);
    expect(res.body.error.code).toBe('NOT_FOUND');
  });

  // Test 14: settings do not expose secrets
  it('14. GET /api/v1/settings returns public branding and strips private keys and passwords', async () => {
    const res = await request(app)
      .get('/api/v1/settings')
      .set('Authorization', tenantAToken);

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.data.restaurant_name).toBe('Sushi Bar Cairo');
    expect(res.body.data.currency).toBe('EGP');
    expect(res.body.data.tax_rate).toBe(14);
    // Ensure sensitive fields are NEVER leaked
    expect(res.body.data.openDrawerPassword).toBeUndefined();
    expect(res.body.data.apiKey).toBeUndefined();
    expect(res.body.data.private_key).toBeUndefined();
  });

  // Test 15: pagination/limit works correctly
  it('15. Pagination limit and offset work correctly', async () => {
    const res = await request(app)
      .get('/api/v1/products?limit=1&offset=0')
      .set('Authorization', tenantAToken);

    expect(res.status).toBe(200);
    expect(res.body.data).toHaveLength(1);

    const resOffset = await request(app)
      .get('/api/v1/products?limit=1&offset=1')
      .set('Authorization', tenantAToken);

    expect(resOffset.status).toBe(200);
    expect(resOffset.body.data).toHaveLength(1);
    expect(resOffset.body.data[0].id).not.toBe(res.body.data[0].id);
  });
});
