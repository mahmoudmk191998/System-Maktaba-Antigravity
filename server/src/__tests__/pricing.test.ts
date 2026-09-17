import { describe, it, expect, beforeEach } from 'vitest';
import request from 'supertest';
import { app } from '../index.js';
import { defaultApiClientService } from '../services/apiClient.service.js';
import { defaultMenuService } from '../services/menu.service.js';
import { defaultBranchesService } from '../services/branches.service.js';
import { defaultDeliveryService } from '../services/delivery.service.js';
import { defaultOffersService } from '../services/offers.service.js';
import { defaultSettingsService } from '../services/settings.service.js';
import { defaultPricingEngine } from '../services/pricing/pricing.engine.js';
import { resetRateLimits } from '../middleware/rateLimiter.js';
import {
  addMoney,
  multiplyMoney,
  percentageMoney,
  roundMoney,
  subtractMoney,
} from '../services/pricing/pricing.utils.js';

describe('Phase 3A: RMS Server-Side Pricing Engine Test Suite', () => {
  let tenantAToken: string;
  let tenantBToken: string;
  let restrictedBranchToken: string;

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
    defaultPricingEngine.clearMemory();

    // 1. Create API Clients
    const clientA = await defaultApiClientService.createClient({
      tenant_id: TENANT_A,
      name: 'Sushi Bar Full Client',
      permissions: ['menu:read', 'offers:read', 'branches:read', 'delivery:read'],
      allowed_branch_ids: [],
    });
    tenantAToken = `Bearer ${clientA.credential_header}`;

    const clientB = await defaultApiClientService.createClient({
      tenant_id: TENANT_B,
      name: 'Burger House Client',
      permissions: ['menu:read', 'offers:read', 'branches:read', 'delivery:read'],
      allowed_branch_ids: [],
    });
    tenantBToken = `Bearer ${clientB.credential_header}`;

    const clientRestricted = await defaultApiClientService.createClient({
      tenant_id: TENANT_A,
      name: 'Sushi Bar Branch Main Only',
      permissions: ['menu:read', 'offers:read', 'branches:read', 'delivery:read'],
      allowed_branch_ids: ['branch_sushi_main'],
    });
    restrictedBranchToken = `Bearer ${clientRestricted.credential_header}`;

    // 2. Seed Branches
    defaultBranchesService.setMemoryBranch('branch_sushi_main', {
      tenant_id: TENANT_A,
      name: 'Sushi Bar Main Branch',
      address: '123 Ocean Ave',
      phone: '01011111111',
      isActive: true,
    });

    defaultBranchesService.setMemoryBranch('branch_sushi_downtown', {
      tenant_id: TENANT_A,
      name: 'Sushi Bar Downtown Branch',
      address: '456 City St',
      phone: '01022222222',
      isActive: true,
    });

    defaultBranchesService.setMemoryBranch('branch_sushi_inactive', {
      tenant_id: TENANT_A,
      name: 'Sushi Bar Closed Branch',
      isActive: false,
    });

    // 3. Seed Products
    defaultMenuService.setMemoryProduct('prod_california', {
      tenant_id: TENANT_A,
      name: 'كاليفورنيا رول',
      price: 250,
      is_available: true,
    });

    defaultMenuService.setMemoryProduct('prod_salmon_sashimi', {
      tenant_id: TENANT_A,
      name: 'ساشيمي سلمون',
      price: 180,
      is_available: true,
    });

    defaultMenuService.setMemoryProduct('prod_unavailable_dish', {
      tenant_id: TENANT_A,
      name: 'طبق غير متاح',
      price: 300,
      is_available: false,
    });

    // Product belonging to Tenant B
    defaultMenuService.setMemoryProduct('prod_cheeseburger', {
      tenant_id: TENANT_B,
      name: 'تشيز برجر',
      price: 190,
      is_available: true,
    });

    // 4. Seed Addons
    defaultPricingEngine.setMemoryAddon('addon_extra_ginger', {
      tenant_id: TENANT_A,
      name: 'زنجبيل إضافي',
      price: 30,
    });

    defaultPricingEngine.setMemoryAddon('addon_spicy_mayo', {
      tenant_id: TENANT_A,
      name: 'سبايسي مايو',
      price: 20,
    });

    // Addon belonging to Tenant B
    defaultPricingEngine.setMemoryAddon('addon_extra_cheese', {
      tenant_id: TENANT_B,
      name: 'جبنة إضافية',
      price: 25,
    });

    // 5. Seed Coupons
    defaultPricingEngine.setMemoryCoupon('coupon_welcome20', {
      tenant_id: TENANT_A,
      code: 'WELCOME20',
      type: 'percentage',
      discount: 20, // 20%
      min_order: 200,
      max_discount: 100,
      is_active: true,
    });

    defaultPricingEngine.setMemoryCoupon('coupon_fixed50', {
      tenant_id: TENANT_A,
      code: 'FLAT50',
      type: 'fixed',
      discount: 50, // 50 EGP
      min_order: 150,
      is_active: true,
    });

    defaultPricingEngine.setMemoryCoupon('coupon_expired', {
      tenant_id: TENANT_A,
      code: 'EXPIRED10',
      type: 'percentage',
      discount: 10,
      expiry_date: new Date(Date.now() - 86400000).toISOString(), // Expired yesterday
      is_active: true,
    });

    defaultPricingEngine.setMemoryCoupon('coupon_limit_exceeded', {
      tenant_id: TENANT_A,
      code: 'MAXEDOUT',
      type: 'percentage',
      discount: 15,
      usage_count: 10,
      usage_limit: 10,
      is_active: true,
    });

    // Coupon for Tenant B
    defaultPricingEngine.setMemoryCoupon('coupon_burger_deal', {
      tenant_id: TENANT_B,
      code: 'BURGERDEAL',
      type: 'fixed',
      discount: 40,
      is_active: true,
    });

    // 6. Seed Delivery Zones
    defaultDeliveryService.setMemoryZone('zone_zamalek', {
      tenant_id: TENANT_A,
      name: 'الزمالك',
      price: 45,
      estimated_time: 35,
    });

    // 7. Seed Settings (Tax Rate: 14%, not included)
    defaultSettingsService.setMemoryTenant(TENANT_A, {
      name: 'Sushi Bar Cairo',
      settings: {
        currency: 'EGP',
        taxRate: 14,
        taxIncluded: false,
      },
    });

    defaultSettingsService.setMemoryTenant(TENANT_B, {
      name: 'Burger House',
      settings: {
        currency: 'EGP',
        taxRate: 14,
        taxIncluded: false,
      },
    });
  });

  // Test 1: Server ignores client-supplied product price
  it('1. Server ignores client-supplied product price and uses authoritative price', async () => {
    const res = await request(app)
      .post('/api/v1/pricing/preview')
      .set('Authorization', tenantAToken)
      .send({
        branch_id: 'branch_sushi_main',
        order_type: 'dine_in',
        items: [
          // Client sends a manipulated price of 1 EGP instead of 250 EGP
          { product_id: 'prod_california', quantity: 2, price: 1 } as any,
        ],
      });

    // Zod strict validation rejects unexpected client-supplied 'price' field
    expect(res.status).toBe(400);
    expect(res.body.success).toBe(false);
    expect(res.body.error.code).toBe('VALIDATION_ERROR');
  });

  // Test 2: Server ignores/rejects client-supplied subtotal
  it('2. Server rejects client-supplied subtotal', async () => {
    const res = await request(app)
      .post('/api/v1/pricing/preview')
      .set('Authorization', tenantAToken)
      .send({
        branch_id: 'branch_sushi_main',
        order_type: 'dine_in',
        subtotal: 10,
        items: [{ product_id: 'prod_california', quantity: 1 }],
      });

    expect(res.status).toBe(400);
    expect(res.body.success).toBe(false);
    expect(res.body.error.code).toBe('VALIDATION_ERROR');
  });

  // Test 3: Server rejects client-supplied discount
  it('3. Server rejects client-supplied discount', async () => {
    const res = await request(app)
      .post('/api/v1/pricing/preview')
      .set('Authorization', tenantAToken)
      .send({
        branch_id: 'branch_sushi_main',
        order_type: 'dine_in',
        discount: 200,
        items: [{ product_id: 'prod_california', quantity: 1 }],
      });

    expect(res.status).toBe(400);
    expect(res.body.success).toBe(false);
  });

  // Test 4: Server rejects client-supplied tax
  it('4. Server rejects client-supplied tax amount', async () => {
    const res = await request(app)
      .post('/api/v1/pricing/preview')
      .set('Authorization', tenantAToken)
      .send({
        branch_id: 'branch_sushi_main',
        order_type: 'dine_in',
        tax_amount: 0,
        items: [{ product_id: 'prod_california', quantity: 1 }],
      });

    expect(res.status).toBe(400);
    expect(res.body.success).toBe(false);
  });

  // Test 5: Server rejects client-supplied delivery fee
  it('5. Server rejects client-supplied delivery fee', async () => {
    const res = await request(app)
      .post('/api/v1/pricing/preview')
      .set('Authorization', tenantAToken)
      .send({
        branch_id: 'branch_sushi_main',
        order_type: 'delivery',
        delivery_fee: 0,
        items: [{ product_id: 'prod_california', quantity: 1 }],
      });

    expect(res.status).toBe(400);
    expect(res.body.success).toBe(false);
  });

  // Test 6: Tenant A cannot price Tenant B products
  it('6. Tenant A cannot price Tenant B products (returns 404/400)', async () => {
    const res = await request(app)
      .post('/api/v1/pricing/preview')
      .set('Authorization', tenantAToken)
      .send({
        branch_id: 'branch_sushi_main',
        order_type: 'dine_in',
        items: [{ product_id: 'prod_cheeseburger', quantity: 1 }],
      });

    expect(res.status).toBe(404);
    expect(res.body.success).toBe(false);
  });

  // Test 7: Unauthorized branch returns 403
  it('7. Accessing unauthorized branch returns 403 Forbidden', async () => {
    const res = await request(app)
      .post('/api/v1/pricing/preview')
      .set('Authorization', restrictedBranchToken)
      .send({
        branch_id: 'branch_sushi_downtown', // restricted to branch_sushi_main
        order_type: 'dine_in',
        items: [{ product_id: 'prod_california', quantity: 1 }],
      });

    expect(res.status).toBe(403);
    expect(res.body.success).toBe(false);
    expect(res.body.error.code).toBe('FORBIDDEN');
  });

  // Test 8: Inactive product cannot be priced
  it('8. Inactive product cannot be priced (returns 400 PRODUCT_UNAVAILABLE)', async () => {
    const res = await request(app)
      .post('/api/v1/pricing/preview')
      .set('Authorization', tenantAToken)
      .send({
        branch_id: 'branch_sushi_main',
        order_type: 'dine_in',
        items: [{ product_id: 'prod_unavailable_dish', quantity: 1 }],
      });

    expect(res.status).toBe(400);
    expect(res.body.success).toBe(false);
    expect(res.body.error.code).toBe('PRODUCT_UNAVAILABLE');
  });

  // Test 9: Invalid quantity is rejected
  it('9. Invalid quantity <= 0 is rejected with 400 Validation Error', async () => {
    const res = await request(app)
      .post('/api/v1/pricing/preview')
      .set('Authorization', tenantAToken)
      .send({
        branch_id: 'branch_sushi_main',
        order_type: 'dine_in',
        items: [{ product_id: 'prod_california', quantity: 0 }],
      });

    expect(res.status).toBe(400);
    expect(res.body.success).toBe(false);
  });

  // Test 10: Decimal quantity is rejected
  it('10. Decimal quantity (e.g. 2.5) is rejected with 400 Validation Error', async () => {
    const res = await request(app)
      .post('/api/v1/pricing/preview')
      .set('Authorization', tenantAToken)
      .send({
        branch_id: 'branch_sushi_main',
        order_type: 'dine_in',
        items: [{ product_id: 'prod_california', quantity: 2.5 }],
      });

    expect(res.status).toBe(400);
    expect(res.body.success).toBe(false);
  });

  // Test 11: Correct subtotal calculation
  it('11. Correct subtotal calculation: 2 × 250 = 500', async () => {
    const res = await request(app)
      .post('/api/v1/pricing/preview')
      .set('Authorization', tenantAToken)
      .send({
        branch_id: 'branch_sushi_main',
        order_type: 'takeaway',
        items: [{ product_id: 'prod_california', quantity: 2 }],
      });

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.data.subtotal).toBe(500);
    expect(res.body.data.tax_amount).toBe(70); // 14% of 500
    expect(res.body.data.grand_total).toBe(570); // 500 + 70
  });

  // Test 12: Correct addon pricing
  it('12. Correct addon pricing: (250 + 30 + 20) × 2 = 600', async () => {
    const res = await request(app)
      .post('/api/v1/pricing/preview')
      .set('Authorization', tenantAToken)
      .send({
        branch_id: 'branch_sushi_main',
        order_type: 'takeaway',
        items: [
          {
            product_id: 'prod_california',
            quantity: 2,
            addon_ids: ['addon_extra_ginger', 'addon_spicy_mayo'],
          },
        ],
      });

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.data.items[0].addons_total).toBe(50);
    expect(res.body.data.items[0].line_subtotal).toBe(600);
    expect(res.body.data.subtotal).toBe(600);
  });

  // Test 13: Correct percentage discount
  it('13. Correct percentage discount: 20% on 500 = 100', async () => {
    const res = await request(app)
      .post('/api/v1/pricing/preview')
      .set('Authorization', tenantAToken)
      .send({
        branch_id: 'branch_sushi_main',
        order_type: 'takeaway',
        coupon_code: 'WELCOME20',
        items: [{ product_id: 'prod_california', quantity: 2 }], // 500 EGP
      });

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.data.subtotal).toBe(500);
    expect(res.body.data.discount_total).toBe(100);
    // Discounted subtotal: 400, Tax (14%): 56, Total: 456
    expect(res.body.data.tax_amount).toBe(56);
    expect(res.body.data.grand_total).toBe(456);
  });

  // Test 14: Correct fixed discount
  it('14. Correct fixed discount: 50 EGP flat discount on 250 = 200', async () => {
    const res = await request(app)
      .post('/api/v1/pricing/preview')
      .set('Authorization', tenantAToken)
      .send({
        branch_id: 'branch_sushi_main',
        order_type: 'takeaway',
        coupon_code: 'FLAT50',
        items: [{ product_id: 'prod_california', quantity: 1 }], // 250 EGP
      });

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.data.discount_total).toBe(50);
    // Tax on (250 - 50 = 200) at 14% = 28
    expect(res.body.data.tax_amount).toBe(28);
    expect(res.body.data.grand_total).toBe(228);
  });

  // Test 15: Expired promotion is rejected
  it('15. Expired coupon returns 400 PROMOTION_EXPIRED', async () => {
    const res = await request(app)
      .post('/api/v1/pricing/preview')
      .set('Authorization', tenantAToken)
      .send({
        branch_id: 'branch_sushi_main',
        order_type: 'takeaway',
        coupon_code: 'EXPIRED10',
        items: [{ product_id: 'prod_california', quantity: 1 }],
      });

    expect(res.status).toBe(400);
    expect(res.body.success).toBe(false);
    expect(res.body.error.code).toBe('PROMOTION_EXPIRED');
  });

  // Test 16: Promotion usage limit exceeded is rejected
  it('16. Promotion usage limit exceeded returns 400 PROMOTION_INVALID', async () => {
    const res = await request(app)
      .post('/api/v1/pricing/preview')
      .set('Authorization', tenantAToken)
      .send({
        branch_id: 'branch_sushi_main',
        order_type: 'takeaway',
        coupon_code: 'MAXEDOUT',
        items: [{ product_id: 'prod_california', quantity: 1 }],
      });

    expect(res.status).toBe(400);
    expect(res.body.success).toBe(false);
    expect(res.body.error.code).toBe('PROMOTION_INVALID');
  });

  // Test 17: Minimum order validation works
  it('17. Minimum order requirement not met returns 400 MINIMUM_ORDER_NOT_MET', async () => {
    // FLAT50 requires min_order = 150. We send item of price = 100
    defaultMenuService.setMemoryProduct('prod_small_miso', {
      tenant_id: TENANT_A,
      name: 'شوربة ميسو',
      price: 80,
      is_available: true,
    });

    const res = await request(app)
      .post('/api/v1/pricing/preview')
      .set('Authorization', tenantAToken)
      .send({
        branch_id: 'branch_sushi_main',
        order_type: 'takeaway',
        coupon_code: 'FLAT50', // requires min 150
        items: [{ product_id: 'prod_small_miso', quantity: 1 }], // 80 EGP
      });

    expect(res.status).toBe(400);
    expect(res.body.success).toBe(false);
    expect(res.body.error.code).toBe('MINIMUM_ORDER_NOT_MET');
  });

  // Test 18: Delivery fee is resolved server-side
  it('18. Delivery fee is resolved server-side and added to grand total', async () => {
    const res = await request(app)
      .post('/api/v1/pricing/preview')
      .set('Authorization', tenantAToken)
      .send({
        branch_id: 'branch_sushi_main',
        order_type: 'delivery',
        delivery: { zone_id: 'zone_zamalek' },
        items: [{ product_id: 'prod_california', quantity: 1 }], // 250 EGP
      });

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.data.subtotal).toBe(250);
    expect(res.body.data.delivery_fee).toBe(45); // Zone Zamalek fee
    expect(res.body.data.tax_amount).toBe(35); // 14% of 250
    expect(res.body.data.grand_total).toBe(330); // 250 + 35 + 45
  });

  // Test 19: Tax is resolved server-side
  it('19. Tax is calculated deterministically based on restaurant settings', async () => {
    const res = await request(app)
      .post('/api/v1/pricing/preview')
      .set('Authorization', tenantAToken)
      .send({
        branch_id: 'branch_sushi_main',
        order_type: 'dine_in',
        items: [{ product_id: 'prod_salmon_sashimi', quantity: 1 }], // 180 EGP
      });

    expect(res.status).toBe(200);
    expect(res.body.data.tax_rate).toBe(14);
    expect(res.body.data.tax_amount).toBe(25.2); // 180 * 0.14 = 25.2
    expect(res.body.data.grand_total).toBe(205.2);
  });

  // Test 20: Grand total cannot become negative
  it('20. Grand total and discounted subtotal are clamped and cannot be negative', async () => {
    // Huge fixed discount
    defaultPricingEngine.setMemoryCoupon('coupon_huge_discount', {
      tenant_id: TENANT_A,
      code: 'BIGDISCOUNT',
      type: 'fixed',
      discount: 1000,
      is_active: true,
    });

    const res = await request(app)
      .post('/api/v1/pricing/preview')
      .set('Authorization', tenantAToken)
      .send({
        branch_id: 'branch_sushi_main',
        order_type: 'dine_in',
        coupon_code: 'BIGDISCOUNT',
        items: [{ product_id: 'prod_california', quantity: 1 }], // 250 EGP
      });

    expect(res.status).toBe(200);
    expect(res.body.data.subtotal).toBe(250);
    expect(res.body.data.discount_total).toBe(250); // Capped at subtotal
    expect(res.body.data.tax_amount).toBe(0);
    expect(res.body.data.grand_total).toBe(0);
  });

  // Test 21: Floating-point / rounding behavior is deterministic
  it('21. Floating-point math utilities are deterministic and avoid rounding drift', () => {
    expect(addMoney(10.1, 10.2)).toBe(20.3);
    expect(multiplyMoney(99.99, 3)).toBe(299.97);
    expect(percentageMoney(999, 15)).toBe(149.85);
    expect(percentageMoney(125.5, 14)).toBe(17.57);
    expect(subtractMoney(100.55, 50.25)).toBe(50.3);
    expect(roundMoney(0.1 + 0.2)).toBe(0.3);
  });

  // Test 22: Multiple products calculate correctly
  it('22. Multiple products line totals aggregate into correct subtotal', async () => {
    const res = await request(app)
      .post('/api/v1/pricing/preview')
      .set('Authorization', tenantAToken)
      .send({
        branch_id: 'branch_sushi_main',
        order_type: 'dine_in',
        items: [
          { product_id: 'prod_california', quantity: 2 }, // 2 * 250 = 500
          { product_id: 'prod_salmon_sashimi', quantity: 3 }, // 3 * 180 = 540
        ],
      });

    expect(res.status).toBe(200);
    expect(res.body.data.items).toHaveLength(2);
    expect(res.body.data.subtotal).toBe(1040); // 500 + 540
    expect(res.body.data.tax_amount).toBe(145.6); // 1040 * 0.14
    expect(res.body.data.grand_total).toBe(1185.6);
  });

  // Test 23: Inactive branch returns 400 ProductUnavailableError
  it('23. Inactive branch returns 400 error', async () => {
    const res = await request(app)
      .post('/api/v1/pricing/preview')
      .set('Authorization', tenantAToken)
      .send({
        branch_id: 'branch_sushi_inactive',
        order_type: 'dine_in',
        items: [{ product_id: 'prod_california', quantity: 1 }],
      });

    expect(res.status).toBe(400);
    expect(res.body.success).toBe(false);
  });

  // Test 24: Cross-tenant coupon cannot be used
  it('24. Cross-tenant coupon returns 400 PROMOTION_INVALID', async () => {
    const res = await request(app)
      .post('/api/v1/pricing/preview')
      .set('Authorization', tenantAToken)
      .send({
        branch_id: 'branch_sushi_main',
        order_type: 'dine_in',
        coupon_code: 'BURGERDEAL', // Belongs to Tenant B
        items: [{ product_id: 'prod_california', quantity: 1 }],
      });

    expect(res.status).toBe(400);
    expect(res.body.success).toBe(false);
    expect(res.body.error.code).toBe('PROMOTION_INVALID');
  });

  // Test 25: Cross-tenant addon cannot be used
  it('25. Cross-tenant addon returns 400 PRODUCT_UNAVAILABLE', async () => {
    const res = await request(app)
      .post('/api/v1/pricing/preview')
      .set('Authorization', tenantAToken)
      .send({
        branch_id: 'branch_sushi_main',
        order_type: 'dine_in',
        items: [
          {
            product_id: 'prod_california',
            quantity: 1,
            addon_ids: ['addon_extra_cheese'], // Belongs to Tenant B
          },
        ],
      });

    expect(res.status).toBe(400);
    expect(res.body.success).toBe(false);
    expect(res.body.error.code).toBe('PRODUCT_UNAVAILABLE');
  });

  // Test 26: Takeaway does not charge delivery fee even if delivery details sent
  it('26. Non-delivery orders never charge delivery fee', async () => {
    const res = await request(app)
      .post('/api/v1/pricing/preview')
      .set('Authorization', tenantAToken)
      .send({
        branch_id: 'branch_sushi_main',
        order_type: 'takeaway',
        delivery: { zone_id: 'zone_zamalek' },
        items: [{ product_id: 'prod_california', quantity: 1 }], // 250
      });

    expect(res.status).toBe(200);
    expect(res.body.data.delivery_fee).toBe(0);
    expect(res.body.data.grand_total).toBe(285); // 250 + 35 tax
  });
});
