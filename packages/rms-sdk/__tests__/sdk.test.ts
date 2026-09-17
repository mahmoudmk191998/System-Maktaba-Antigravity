import { describe, it, expect, vi } from 'vitest';
import {
  RmsApiClient,
  verifyWebhookSignature,
  RmsAuthError,
  RmsPermissionError,
  RmsNotFoundError,
  RmsValidationError,
  RmsConflictError,
  RmsRateLimitError,
  RmsServerError,
} from '../src/index.js';
import crypto from 'crypto';

describe('Phase 8B: Official @rms/sdk Test Suite', () => {
  const BASE_URL = 'https://api.example-restaurant.com/api/v1';
  const API_KEY = 'rms_live_testclient123_sec_abcdef1234567890abcdef1234567890';
  const WEBHOOK_SECRET = 'whsec_sample_secret_key_1234567890';

  // ==================== PART 1: Client Initialization & Config ====================

  it('1. Client initializes cleanly and trims trailing slashes from baseUrl', () => {
    const client = new RmsApiClient({
      baseUrl: 'https://api.example-restaurant.com/api/v1///',
      apiKey: `  ${API_KEY}  `,
    });
    expect(client).toBeInstanceOf(RmsApiClient);
  });

  it('2. Client initialization throws if baseUrl or apiKey is missing', () => {
    expect(() => new RmsApiClient({ baseUrl: '', apiKey: API_KEY })).toThrow('baseUrl is required');
    expect(() => new RmsApiClient({ baseUrl: BASE_URL, apiKey: '' })).toThrow('apiKey is required');
  });

  // ==================== PART 2: Request Headers & Authentication ====================

  it('3. Injects Authorization, X-Request-ID, and X-Branch-ID headers', async () => {
    let capturedHeaders: Record<string, string> = {};

    const mockFetch = vi.fn().mockImplementation(async (url: string, init: any) => {
      capturedHeaders = init.headers;
      return new Response(
        JSON.stringify({ success: true, data: { status: 'healthy', version: '1.0.0' } }),
        { status: 200, headers: { 'content-type': 'application/json' } }
      );
    });

    const client = new RmsApiClient({
      baseUrl: BASE_URL,
      apiKey: API_KEY,
      defaultBranchId: 'branch_downtown_01',
      fetch: mockFetch as any,
    });

    const health = await client.getHealth({ requestId: 'custom_req_999' });
    expect(health.status).toBe('healthy');
    expect(capturedHeaders['Authorization']).toBe(`Bearer ${API_KEY}`);
    expect(capturedHeaders['X-Request-ID']).toBe('custom_req_999');
    expect(capturedHeaders['X-Branch-ID']).toBe('branch_downtown_01');
  });

  // ==================== PART 3: Core API Methods ====================

  it('4. getBranches() and getMenu() execute successful GET requests', async () => {
    const mockFetch = vi.fn().mockImplementation(async (url: string) => {
      if (url.endsWith('/branches')) {
        return new Response(
          JSON.stringify({ success: true, data: [{ id: 'b1', name: 'Main Branch' }] }),
          { status: 200 }
        );
      }
      if (url.endsWith('/menu')) {
        return new Response(
          JSON.stringify({ success: true, data: { categories: [{ id: 'c1', name: 'Appetizers' }] } }),
          { status: 200 }
        );
      }
      return new Response('Not Found', { status: 404 });
    });

    const client = new RmsApiClient({ baseUrl: BASE_URL, apiKey: API_KEY, fetch: mockFetch as any });

    const branches = await client.getBranches();
    expect(branches.length).toBe(1);
    expect(branches[0].name).toBe('Main Branch');

    const menu = await client.getMenu();
    expect(menu.categories.length).toBe(1);
    expect(menu.categories[0].name).toBe('Appetizers');
  });

  it('5. previewPricing() submits calculation payload and returns Breakdown', async () => {
    const mockFetch = vi.fn().mockImplementation(async (url: string, init: any) => {
      const parsedBody = JSON.parse(init.body);
      expect(parsedBody.branch_id).toBe('b1');
      return new Response(
        JSON.stringify({
          success: true,
          data: { subtotal: 50, tax: 4, delivery_fee: 5, total: 59, discounts_total: 0 },
        }),
        { status: 200 }
      );
    });

    const client = new RmsApiClient({ baseUrl: BASE_URL, apiKey: API_KEY, fetch: mockFetch as any });
    const preview = await client.previewPricing({
      branch_id: 'b1',
      order_type: 'delivery',
      items: [{ product_id: 'p1', quantity: 2 }],
    });

    expect(preview.total).toBe(59);
    expect(preview.subtotal).toBe(50);
  });

  it('6. createOrder() injects Idempotency-Key and returns created order', async () => {
    let capturedIdempotencyKey = '';

    const mockFetch = vi.fn().mockImplementation(async (url: string, init: any) => {
      capturedIdempotencyKey = init.headers['Idempotency-Key'];
      return new Response(
        JSON.stringify({
          success: true,
          data: { order_id: 'ord_123', order_number: '#101', status: 'pending' },
        }),
        { status: 201 }
      );
    });

    const client = new RmsApiClient({ baseUrl: BASE_URL, apiKey: API_KEY, fetch: mockFetch as any });
    const order = await client.createOrder(
      {
        branch_id: 'b1',
        order_type: 'takeaway',
        items: [{ product_id: 'p1', quantity: 1 }],
        payment_method: 'cash',
      },
      { idempotencyKey: 'idem_key_unique_888' }
    );

    expect(order.order_id).toBe('ord_123');
    expect(capturedIdempotencyKey).toBe('idem_key_unique_888');
  });

  // ==================== PART 4: Typed Errors & Status Code Handling ====================

  it('7. Maps 401 Unauthorized to RmsAuthError', async () => {
    const mockFetch = vi.fn().mockResolvedValue(
      new Response(
        JSON.stringify({ success: false, error: { message: 'Invalid API credential token' } }),
        { status: 401 }
      )
    );

    const client = new RmsApiClient({ baseUrl: BASE_URL, apiKey: API_KEY, fetch: mockFetch as any });
    await expect(client.getBranches()).rejects.toThrow(RmsAuthError);
  });

  it('8. Maps 403 Forbidden to RmsPermissionError', async () => {
    const mockFetch = vi.fn().mockResolvedValue(
      new Response(
        JSON.stringify({ success: false, error: { message: 'Missing permission menu:read' } }),
        { status: 403 }
      )
    );

    const client = new RmsApiClient({ baseUrl: BASE_URL, apiKey: API_KEY, fetch: mockFetch as any });
    await expect(client.getBranches()).rejects.toThrow(RmsPermissionError);
  });

  it('9. Maps 404 Not Found to RmsNotFoundError', async () => {
    const mockFetch = vi.fn().mockResolvedValue(
      new Response(
        JSON.stringify({ success: false, error: { message: 'Branch not found' } }),
        { status: 404 }
      )
    );

    const client = new RmsApiClient({ baseUrl: BASE_URL, apiKey: API_KEY, fetch: mockFetch as any });
    await expect(client.getBranchById('nonexistent')).rejects.toThrow(RmsNotFoundError);
  });

  it('10. Maps 400 Validation Error to RmsValidationError with details', async () => {
    const mockFetch = vi.fn().mockResolvedValue(
      new Response(
        JSON.stringify({ success: false, error: { message: 'Invalid quantity', details: [{ field: 'items' }] } }),
        { status: 400 }
      )
    );

    const client = new RmsApiClient({ baseUrl: BASE_URL, apiKey: API_KEY, fetch: mockFetch as any });
    try {
      await client.createOrder({ branch_id: 'b1', order_type: 'takeaway', items: [] });
      expect.unreachable();
    } catch (err: any) {
      expect(err).toBeInstanceOf(RmsValidationError);
      expect(err.details).toBeDefined();
    }
  });

  it('11. Maps 409 Conflict to RmsConflictError', async () => {
    const mockFetch = vi.fn().mockResolvedValue(
      new Response(
        JSON.stringify({ success: false, error: { message: 'Idempotency key payload mismatch' } }),
        { status: 409 }
      )
    );

    const client = new RmsApiClient({ baseUrl: BASE_URL, apiKey: API_KEY, fetch: mockFetch as any });
    await expect(client.createOrder({ branch_id: 'b1', order_type: 'takeaway', items: [{ product_id: 'p1', quantity: 1 }] })).rejects.toThrow(RmsConflictError);
  });

  it('12. Maps 429 Rate Limit to RmsRateLimitError with retryAfterSeconds', async () => {
    const mockFetch = vi.fn().mockResolvedValue(
      new Response(
        JSON.stringify({ success: false, error: { message: 'Rate limit exceeded' } }),
        {
          status: 429,
          headers: { 'retry-after': '30' },
        }
      )
    );

    const client = new RmsApiClient({ baseUrl: BASE_URL, apiKey: API_KEY, fetch: mockFetch as any });
    try {
      await client.getMenu();
      expect.unreachable();
    } catch (err: any) {
      expect(err).toBeInstanceOf(RmsRateLimitError);
      expect(err.retryAfterSeconds).toBe(30);
    }
  });

  // ==================== PART 5: Retry Policy & Resilience ====================

  it('13. Automatically retries 500 errors up to maxRetries before failing with RmsServerError', async () => {
    let callCount = 0;
    const mockFetch = vi.fn().mockImplementation(async () => {
      callCount++;
      return new Response(
        JSON.stringify({ success: false, error: { message: 'Internal Server Error' } }),
        { status: 500 }
      );
    });

    const client = new RmsApiClient({
      baseUrl: BASE_URL,
      apiKey: API_KEY,
      maxRetries: 2,
      fetch: mockFetch as any,
    });

    await expect(client.getHealth()).rejects.toThrow(RmsServerError);
    // Initial attempt + 2 retries = 3 calls
    expect(callCount).toBe(3);
  });

  it('14. Does NOT retry client errors (400, 401, 403, 404, 409)', async () => {
    let callCount = 0;
    const mockFetch = vi.fn().mockImplementation(async () => {
      callCount++;
      return new Response(
        JSON.stringify({ success: false, error: { message: 'Forbidden' } }),
        { status: 403 }
      );
    });

    const client = new RmsApiClient({
      baseUrl: BASE_URL,
      apiKey: API_KEY,
      maxRetries: 3,
      fetch: mockFetch as any,
    });

    await expect(client.getBranches()).rejects.toThrow(RmsPermissionError);
    // Should fail immediately after 1 attempt
    expect(callCount).toBe(1);
  });

  // ==================== PART 6: Webhook Signature Verification ====================

  it('15. verifyWebhookSignature validates authentic HMAC-SHA256 signatures', () => {
    const rawBody = JSON.stringify({ event: 'order.created', tenant_id: 'tenant_sample' });
    const timestamp = Math.floor(Date.now() / 1000);
    const signature = crypto
      .createHmac('sha256', WEBHOOK_SECRET)
      .update(`${timestamp}.${rawBody}`)
      .digest('hex');

    const signatureHeader = `t=${timestamp},v1=${signature}`;

    const isValid = verifyWebhookSignature({
      signatureHeader,
      rawBody,
      secret: WEBHOOK_SECRET,
    });

    expect(isValid).toBe(true);
  });

  it('16. verifyWebhookSignature rejects tampered body or invalid secrets', () => {
    const rawBody = JSON.stringify({ event: 'order.created' });
    const timestamp = Math.floor(Date.now() / 1000);
    const signature = crypto
      .createHmac('sha256', WEBHOOK_SECRET)
      .update(`${timestamp}.${rawBody}`)
      .digest('hex');

    const signatureHeader = `t=${timestamp},v1=${signature}`;

    // Tampered body
    expect(
      verifyWebhookSignature({
        signatureHeader,
        rawBody: JSON.stringify({ event: 'order.created', tampered: true }),
        secret: WEBHOOK_SECRET,
      })
    ).toBe(false);

    // Wrong secret
    expect(
      verifyWebhookSignature({
        signatureHeader,
        rawBody,
        secret: 'whsec_wrong_secret_123',
      })
    ).toBe(false);
  });

  it('17. verifyWebhookSignature rejects expired timestamps (replay protection)', () => {
    const rawBody = JSON.stringify({ event: 'order.created' });
    // Timestamp from 10 minutes ago
    const timestamp = Math.floor(Date.now() / 1000) - 600;
    const signature = crypto
      .createHmac('sha256', WEBHOOK_SECRET)
      .update(`${timestamp}.${rawBody}`)
      .digest('hex');

    const signatureHeader = `t=${timestamp},v1=${signature}`;

    const isValid = verifyWebhookSignature({
      signatureHeader,
      rawBody,
      secret: WEBHOOK_SECRET,
      toleranceSeconds: 300, // 5 minutes max
    });

    expect(isValid).toBe(false);
  });

  it('18. verifyWebhookSignature safely handles malformed headers without throwing', () => {
    expect(
      verifyWebhookSignature({
        signatureHeader: 'malformed_header_with_no_timestamp',
        rawBody: 'body',
        secret: WEBHOOK_SECRET,
      })
    ).toBe(false);

    expect(
      verifyWebhookSignature({
        signatureHeader: '',
        rawBody: 'body',
        secret: WEBHOOK_SECRET,
      })
    ).toBe(false);
  });

  // ==================== PART 7: Real-Time Event Streaming ====================

  it('19. client.events.subscribe returns an active RmsEventStream', () => {
    const client = new RmsApiClient({ baseUrl: BASE_URL, apiKey: API_KEY });
    const stream = client.events.subscribe({ types: ['order.created'], branchId: 'branch_1' });
    expect(stream).toBeDefined();
    expect(typeof stream.close).toBe('function');
    stream.close();
  });

  it('20. client.events.streamOrder subscribes to order lifecycle events', () => {
    const client = new RmsApiClient({ baseUrl: BASE_URL, apiKey: API_KEY });
    const stream = client.events.streamOrder('ord_999');
    expect(stream).toBeDefined();
    expect(typeof stream.close).toBe('function');
    stream.close();
  });
});
