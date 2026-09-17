/**
 * ==============================================================================
 * RMS Production Deployment & Integration Smoke Test
 * ==============================================================================
 * 
 * Generic automated validation script for RMS API backend deployment.
 * 
 * Usage:
 *   npx tsx examples/generic-restaurant/production-smoke-test.ts
 * 
 * Required Environment Variables:
 *   RMS_API_URL=https://api.your-rms-domain.com/api/v1
 *   RMS_API_KEY=rms_live_cli_xxxxxxxx.xxxxxxxxxxxxxxxxxxxxxxx
 * 
 * Optional:
 *   RMS_BRANCH_ID=branch_main
 *   RMS_TENANT_ID=tenant_main
 */

import { v4 as uuidv4 } from 'uuid';

interface SmokeTestConfig {
  baseUrl: string;
  apiKey: string;
  branchId?: string;
}

interface StepResult {
  step: string;
  status: 'PASS' | 'FAIL' | 'SKIPPED';
  durationMs: number;
  requestId?: string;
  message?: string;
  details?: Record<string, any>;
}

const config: SmokeTestConfig = {
  baseUrl: (process.env.RMS_API_URL || 'http://localhost:4000/api/v1').replace(/\/+$/, ''),
  apiKey: process.env.RMS_API_KEY || 'rms_live_cli_test.sample_secret',
  branchId: process.env.RMS_BRANCH_ID,
};

const results: StepResult[] = [];

async function apiRequest<T = any>(
  path: string,
  options: {
    method?: string;
    body?: any;
    headers?: Record<string, string>;
    requiresAuth?: boolean;
  } = {}
): Promise<{ status: number; data: T; headers: Headers; durationMs: number; requestId: string | null }> {
  const url = `${config.baseUrl}${path.startsWith('/') ? path : `/${path}`}`;
  const start = Date.now();
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    'User-Agent': 'RMS-Production-Smoke-Test/1.0',
    ...(options.headers || {}),
  };

  if (options.requiresAuth !== false && config.apiKey) {
    headers['Authorization'] = `Bearer ${config.apiKey}`;
  }

  const response = await fetch(url, {
    method: options.method || 'GET',
    headers,
    body: options.body ? JSON.stringify(options.body) : undefined,
  });

  const durationMs = Date.now() - start;
  const requestId = response.headers.get('x-request-id');

  let data: any;
  try {
    data = await response.json();
  } catch (_) {
    data = null;
  }

  return {
    status: response.status,
    data,
    headers: response.headers,
    durationMs,
    requestId,
  };
}

async function runStep(
  name: string,
  fn: () => Promise<{ message: string; details?: Record<string, any>; skipped?: boolean }>
) {
  const start = Date.now();
  try {
    const res = await fn();
    const durationMs = Date.now() - start;
    if (res.skipped) {
      results.push({ step: name, status: 'SKIPPED', durationMs, message: res.message });
      console.log(` ⚠️  [SKIPPED] ${name}: ${res.message} (${durationMs}ms)`);
    } else {
      results.push({ step: name, status: 'PASS', durationMs, message: res.message, details: res.details });
      console.log(` ✅ [PASS] ${name} (${durationMs}ms) — ${res.message}`);
    }
  } catch (err: any) {
    const durationMs = Date.now() - start;
    results.push({ step: name, status: 'FAIL', durationMs, message: err.message, details: err.details });
    console.error(` ❌ [FAIL] ${name} (${durationMs}ms) — Error: ${err.message}`);
  }
}

async function main() {
  console.log('\n================================================================');
  console.log('🚀 RMS Production Deployment & Integration Smoke Test');
  console.log('================================================================');
  console.log(` Target API URL: ${config.baseUrl}`);
  console.log(` Auth Configured: ${config.apiKey ? 'Yes (Bearer Key Present)' : 'No'}`);
  console.log(` Timestamp: ${new Date().toISOString()}`);
  console.log('----------------------------------------------------------------\n');

  let discoveredBranchId = config.branchId;
  let discoveredProductId: string | undefined;
  let discoveredProductName: string | undefined;
  let discoveredProductPrice = 100;

  // Step 1: Health Check (Public, No Auth)
  await runStep('1. Public Health Check (GET /health)', async () => {
    const res = await apiRequest('/health', { requiresAuth: false });
    if (res.status !== 200) {
      throw new Error(`Expected HTTP 200, got ${res.status}`);
    }
    if (!res.data?.success && res.data?.status !== 'healthy' && res.data?.status !== 'degraded') {
      throw new Error('Health check response payload missing standard health indicators');
    }
    return {
      message: `Status: ${res.data.status} | Service: ${res.data.service || 'rms-api'} | ReqId: ${res.requestId}`,
      details: {
        status: res.data.status,
        realtime: res.data.realtime?.status,
        infrastructure: res.data.infrastructure,
      },
    };
  });

  // Step 2: Authentication & Branches Retrieval
  await runStep('2. Authenticated Branches Check (GET /branches)', async () => {
    const res = await apiRequest('/branches');
    if (res.status === 401 || res.status === 403) {
      throw new Error(`Authentication/Authorization rejected with HTTP ${res.status}. Verify RMS_API_KEY.`);
    }
    if (res.status !== 200) {
      throw new Error(`Expected HTTP 200, got ${res.status}`);
    }

    const branches = res.data?.data || res.data || [];
    if (Array.isArray(branches) && branches.length > 0) {
      if (!discoveredBranchId) {
        discoveredBranchId = branches[0].id || branches[0].branch_id;
      }
    }

    return {
      message: `Found ${Array.isArray(branches) ? branches.length : 0} branches | Selected Branch: ${discoveredBranchId || 'none'} | ReqId: ${res.requestId}`,
      details: { branchCount: Array.isArray(branches) ? branches.length : 0 },
    };
  });

  // Step 3: Catalog Menu Retrieval
  await runStep('3. Catalog Menu Retrieval (GET /menu)', async () => {
    const path = discoveredBranchId ? `/menu?branch_id=${discoveredBranchId}` : '/menu';
    const res = await apiRequest(path);
    if (res.status !== 200) {
      throw new Error(`Expected HTTP 200, got ${res.status}`);
    }

    const menu = res.data?.data || res.data;
    const categories = menu?.categories || [];
    const products = menu?.products || [];

    if (products.length > 0) {
      discoveredProductId = products[0].id || products[0].product_id;
      discoveredProductName = products[0].name;
      discoveredProductPrice = products[0].price || 100;
    }

    return {
      message: `Categories: ${categories.length}, Products: ${products.length} | First Item: ${discoveredProductName || 'N/A'} | ReqId: ${res.requestId}`,
      details: { categoriesCount: categories.length, productsCount: products.length },
    };
  });

  // Step 4: Server-Side Authoritative Pricing Calculation
  await runStep('4. Authoritative Pricing Preview (POST /pricing/preview)', async () => {
    if (!discoveredProductId) {
      return { skipped: true, message: 'Skipped: No products available in catalog to test pricing preview' };
    }

    const payload = {
      branch_id: discoveredBranchId,
      order_type: 'dine_in',
      items: [
        {
          product_id: discoveredProductId,
          quantity: 2,
        },
      ],
    };

    const res = await apiRequest('/pricing/preview', {
      method: 'POST',
      body: payload,
    });

    if (res.status !== 200) {
      throw new Error(`Pricing calculation returned HTTP ${res.status}: ${JSON.stringify(res.data)}`);
    }

    const pricing = res.data?.data || res.data;
    return {
      message: `Subtotal: ${pricing.subtotal}, Total: ${pricing.total} | ReqId: ${res.requestId}`,
      details: pricing,
    };
  });

  // Step 5: Delivery Serviceability Verification
  await runStep('5. Delivery Serviceability Check (POST /delivery/check)', async () => {
    const payload = {
      branch_id: discoveredBranchId,
      customer_coordinates: { lat: 30.0444, lng: 31.2357 },
    };

    const res = await apiRequest('/delivery/check', {
      method: 'POST',
      body: payload,
    });

    if (res.status === 404) {
      return { skipped: true, message: 'Delivery check route not configured for this branch' };
    }

    if (res.status !== 200) {
      throw new Error(`Delivery check returned HTTP ${res.status}: ${JSON.stringify(res.data)}`);
    }

    return {
      message: `Eligible: ${res.data?.data?.eligible ?? res.data?.eligible ?? true} | ReqId: ${res.requestId}`,
    };
  });

  // Step 6: Order Creation with Idempotency-Key
  const testIdempotencyKey = `smoke_${uuidv4()}`;
  let createdOrderId: string | undefined;

  await runStep('6. Secure Order Creation (POST /orders with Idempotency-Key)', async () => {
    if (!discoveredProductId) {
      return { skipped: true, message: 'Skipped: No products available to place an order' };
    }

    const orderPayload = {
      branch_id: discoveredBranchId,
      order_type: 'takeaway',
      items: [
        {
          product_id: discoveredProductId,
          quantity: 1,
        },
      ],
      customer: {
        name: 'Smoke Test Automated Runner',
        phone: '+201000000000',
      },
      notes: 'Automated production smoke test order',
    };

    const res = await apiRequest('/orders', {
      method: 'POST',
      headers: {
        'Idempotency-Key': testIdempotencyKey,
      },
      body: orderPayload,
    });

    if (res.status !== 201) {
      throw new Error(`Order creation failed with HTTP ${res.status}: ${JSON.stringify(res.data)}`);
    }

    const order = res.data?.data || res.data;
    createdOrderId = order.id || order.order_id;

    return {
      message: `Created Order ID: ${createdOrderId} | Order Number: ${order.order_number || 'N/A'} | ReqId: ${res.requestId}`,
      details: { orderId: createdOrderId, total: order.total },
    };
  });

  // Step 7: Idempotent Replay Verification
  await runStep('7. Idempotency Replay Verification (Deduplication)', async () => {
    if (!createdOrderId || !discoveredProductId) {
      return { skipped: true, message: 'Skipped: Prior order creation step did not run' };
    }

    const orderPayload = {
      branch_id: discoveredBranchId,
      order_type: 'takeaway',
      items: [
        {
          product_id: discoveredProductId,
          quantity: 1,
        },
      ],
      customer: {
        name: 'Smoke Test Automated Runner',
        phone: '+201000000000',
      },
      notes: 'Automated production smoke test order',
    };

    const res = await apiRequest('/orders', {
      method: 'POST',
      headers: {
        'Idempotency-Key': testIdempotencyKey,
      },
      body: orderPayload,
    });

    if (res.status !== 200 && res.status !== 201) {
      throw new Error(`Expected HTTP 200/201 on idempotency replay, got ${res.status}`);
    }

    const replayedOrder = res.data?.data || res.data;
    const replayedId = replayedOrder.id || replayedOrder.order_id;

    if (replayedId !== createdOrderId) {
      throw new Error(`Idempotency failure: Returned order ID '${replayedId}' does not match original '${createdOrderId}'`);
    }

    return {
      message: `Idempotency confirmed: Returned exact same Order ID ${replayedId} | ReqId: ${res.requestId}`,
    };
  });

  // Summary Report
  console.log('\n================================================================');
  console.log('📊 Production Smoke Test Summary Report');
  console.log('================================================================');

  const passed = results.filter((r) => r.status === 'PASS').length;
  const failed = results.filter((r) => r.status === 'FAIL').length;
  const skipped = results.filter((r) => r.status === 'SKIPPED').length;

  console.log(` Total Steps: ${results.length}`);
  console.log(` Passed:      ${passed}`);
  console.log(` Failed:      ${failed}`);
  console.log(` Skipped:     ${skipped}`);
  console.log('----------------------------------------------------------------');

  if (failed > 0) {
    console.error('\n❌ Smoke test completed with FAILURES. Inspect logs above.\n');
    process.exit(1);
  } else {
    console.log('\n🎉 ALL PRODUCTION SMOKE TEST CHECKS PASSED!\n');
    process.exit(0);
  }
}

main().catch((err) => {
  console.error('Fatal runner error:', err);
  process.exit(1);
});
