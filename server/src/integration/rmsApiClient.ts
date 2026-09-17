import crypto from 'crypto';
import {
  RmsApiError,
  RmsAuthError,
  RmsConflictError,
  RmsForbiddenError,
  RmsNetworkError,
  RmsNotFoundError,
  RmsRateLimitError,
  RmsTimeoutError,
  RmsValidationError,
} from './errors.js';
import {
  ApiResponseEnvelope,
  Branch,
  Category,
  CreateOrderInput,
  CreateOrderResult,
  CreateWebhookInput,
  CreateWebhookResult,
  DeliveryZone,
  HealthResponse,
  Offer,
  PricingCalculationResult,
  PricingPreviewInput,
  Product,
  PublicOrderResponse,
  RequestOptions,
  RestaurantSettings,
  RmsClientConfig,
  WebhookEndpoint,
  WebhookVerificationResult,
} from './types.js';

export class RmsApiClient {
  private baseUrl: string;
  private apiKey: string;
  private defaultBranchId?: string;
  private timeoutMs: number;
  private maxRetries: number;
  private fetchImpl: typeof fetch;

  constructor(config: RmsClientConfig) {
    if (!config.baseUrl) {
      throw new Error('RmsApiClient: baseUrl is required');
    }
    if (!config.apiKey) {
      throw new Error('RmsApiClient: apiKey is required');
    }

    this.baseUrl = config.baseUrl.replace(/\/+$/, '');
    this.apiKey = config.apiKey.startsWith('Bearer ')
      ? config.apiKey
      : `Bearer ${config.apiKey.trim()}`;
    this.defaultBranchId = config.branchId;
    this.timeoutMs = config.timeoutMs || 10000;
    this.maxRetries = config.maxRetries ?? 2;
    this.fetchImpl = config.fetch || globalThis.fetch;
  }

  /**
   * Internal HTTP request handler with safe retry, timeout, and typed envelope parsing.
   */
  private async request<T>(
    method: 'GET' | 'POST' | 'PATCH' | 'DELETE',
    path: string,
    body?: any,
    options: RequestOptions = {}
  ): Promise<T> {
    const url = `${this.baseUrl}${path.startsWith('/') ? path : `/${path}`}`;
    const headers: Record<string, string> = {
      'Authorization': this.apiKey,
      'Accept': 'application/json',
      ...options.headers,
    };

    if (body !== undefined) {
      headers['Content-Type'] = 'application/json';
    }

    const branchId = options.branchId || this.defaultBranchId;
    if (branchId) {
      headers['X-Branch-ID'] = branchId;
    }

    if (options.requestId) {
      headers['X-Request-ID'] = options.requestId;
    }

    if (options.idempotencyKey) {
      headers['Idempotency-Key'] = options.idempotencyKey;
    }

    const isSafeMethod = method === 'GET';
    const isIdempotentPost = method === 'POST' && Boolean(options.idempotencyKey);
    const allowRetry = isSafeMethod || isIdempotentPost;
    const maxAttempts = allowRetry ? this.maxRetries + 1 : 1;

    let lastError: Error | null = null;

    for (let attempt = 1; attempt <= maxAttempts; attempt++) {
      try {
        const timeout = options.timeoutMs || this.timeoutMs;
        const controller = new AbortController();
        const timer = setTimeout(() => controller.abort(), timeout);

        const response = await this.fetchImpl(url, {
          method,
          headers,
          body: body !== undefined ? JSON.stringify(body) : undefined,
          signal: controller.signal,
        });

        clearTimeout(timer);

        const contentType = response.headers.get('content-type') || '';
        let data: any = null;

        if (contentType.includes('application/json')) {
          data = await response.json();
        } else {
          data = await response.text();
        }

        if (!response.ok) {
          this.handleHttpError(response.status, data, response.headers);
        }

        // Unpack RMS standard response envelope { success: true, data: T }
        if (data && typeof data === 'object' && 'data' in data && 'success' in data && data.success === true) {
          return data.data as T;
        }

        return data as T;
      } catch (err: any) {
        if (err.name === 'AbortError') {
          lastError = new RmsTimeoutError(`Request to ${method} ${path} timed out after ${this.timeoutMs}ms`);
        } else if (err instanceof RmsApiError) {
          // Do not retry 4xx errors except 429
          if (err.statusCode < 500 && err.statusCode !== 429) {
            throw err;
          }
          lastError = err;
        } else {
          lastError = new RmsNetworkError(err.message || 'Network request failed', err);
        }

        // If retries remaining, wait with small backoff
        if (attempt < maxAttempts) {
          await new Promise((resolve) => setTimeout(resolve, attempt * 200));
        }
      }
    }

    throw lastError || new RmsNetworkError('Request failed after retries');
  }

  private handleHttpError(status: number, data: any, headers: Headers): never {
    const message = data?.error?.message || data?.message || `HTTP Error ${status}`;
    const code = data?.error?.code || data?.code || 'HTTP_ERROR';
    const details = data?.error?.details || data?.details;
    const requestId = headers.get('x-request-id') || data?.request_id;

    switch (status) {
      case 400:
        throw new RmsValidationError(message, details, requestId);
      case 401:
        throw new RmsAuthError(message, details, requestId);
      case 403:
        throw new RmsForbiddenError(message, details, requestId);
      case 404:
        throw new RmsNotFoundError(message, details, requestId);
      case 409:
        throw new RmsConflictError(message, details, requestId);
      case 429: {
        const retryAfterHeader = headers.get('retry-after');
        const retryAfter = retryAfterHeader ? parseInt(retryAfterHeader, 10) : undefined;
        throw new RmsRateLimitError(message, retryAfter, details, requestId);
      }
      default:
        throw new RmsApiError(message, status, code, details, requestId);
    }
  }

  // ==================== Public Catalog & Configuration Methods ====================

  /**
   * Check backend health and uptime
   */
  async getHealth(): Promise<HealthResponse> {
    return this.request<HealthResponse>('GET', '/health');
  }

  /**
   * Fetch restaurant public settings (currency, tax rate, min order, etc.)
   */
  async getSettings(): Promise<RestaurantSettings> {
    return this.request<RestaurantSettings>('GET', '/settings');
  }

  /**
   * List active restaurant branches
   */
  async getBranches(): Promise<Branch[]> {
    return this.request<Branch[]>('GET', '/branches');
  }

  /**
   * Fetch full catalog menu (categories with embedded products & active addons)
   */
  async getMenu(options?: RequestOptions): Promise<{ categories: Category[]; products: Product[] }> {
    return this.request<{ categories: Category[]; products: Product[] }>('GET', '/menu', undefined, options);
  }

  /**
   * List active menu categories
   */
  async getCategories(): Promise<Category[]> {
    return this.request<Category[]>('GET', '/categories');
  }

  /**
   * List products, optionally filtered by category
   */
  async getProducts(categoryId?: string, options?: RequestOptions): Promise<Product[]> {
    const query = categoryId ? `?category_id=${encodeURIComponent(categoryId)}` : '';
    return this.request<Product[]>('GET', `/products${query}`, undefined, options);
  }

  /**
   * Fetch a single product by ID
   */
  async getProduct(productId: string, options?: RequestOptions): Promise<Product> {
    return this.request<Product>('GET', `/products/${encodeURIComponent(productId)}`, undefined, options);
  }

  /**
   * Check if a product is available in the current branch
   */
  async checkProductAvailability(productId: string, options?: RequestOptions): Promise<{ product_id: string; is_available: boolean }> {
    const product = await this.getProduct(productId, options);
    return {
      product_id: product.id,
      is_available: product.is_available,
    };
  }

  /**
   * List active delivery zones and fees
   */
  async getDeliveryZones(options?: RequestOptions): Promise<DeliveryZone[]> {
    return this.request<DeliveryZone[]>('GET', '/delivery/zones', undefined, options);
  }

  /**
   * Fetch specific delivery zone details and fee
   */
  async checkDeliveryZone(zoneId: string, options?: RequestOptions): Promise<DeliveryZone> {
    return this.request<DeliveryZone>('GET', `/delivery/zones/${encodeURIComponent(zoneId)}`, undefined, options);
  }

  /**
   * Check delivery availability and calculate fee for a target address
   */
  async checkDelivery(
    branchId: string,
    address: { zone_id?: string; city?: string; street?: string },
    options?: RequestOptions
  ): Promise<{ is_deliverable: boolean; zone?: DeliveryZone; delivery_fee: number }> {
    const zones = await this.getDeliveryZones({ ...options, branchId });
    if (address.zone_id) {
      const match = zones.find((z) => z.id === address.zone_id && z.is_active);
      if (match) {
        return { is_deliverable: true, zone: match, delivery_fee: match.delivery_fee };
      }
    }
    const defaultZone = zones.find((z) => z.is_active);
    return {
      is_deliverable: zones.length > 0,
      zone: defaultZone,
      delivery_fee: defaultZone ? defaultZone.delivery_fee : 0,
    };
  }

  /**
   * List active promotions and coupons
   */
  async getOffers(): Promise<Offer[]> {
    return this.request<Offer[]>('GET', '/offers');
  }

  // ==================== Pricing & Order Methods ====================

  /**
   * Preview authoritative server-side pricing for a cart before checkout.
   * Deterministically calculates items total, discounts, delivery fee, taxes, and grand total.
   */
  async previewPricing(input: PricingPreviewInput, options?: RequestOptions): Promise<PricingCalculationResult> {
    return this.request<PricingCalculationResult>('POST', '/pricing/preview', input, options);
  }

  /**
   * Create an order with authoritative pricing snapshots and optional idempotency key.
   */
  async createOrder(input: CreateOrderInput, idempotencyKey?: string, options?: RequestOptions): Promise<CreateOrderResult> {
    return this.request<CreateOrderResult>('POST', '/orders', input, {
      ...options,
      idempotencyKey: idempotencyKey || options?.idempotencyKey,
    });
  }

  /**
   * Track order by ID (customer-safe snapshot, excludes secret cost/recipes)
   */
  async getOrder(orderId: string, options?: RequestOptions): Promise<PublicOrderResponse> {
    return this.request<PublicOrderResponse>('GET', `/orders/${encodeURIComponent(orderId)}`, undefined, options);
  }

  // ==================== Webhooks Management ====================

  /**
   * Register a new webhook endpoint.
   * The returned secret is provided ONLY ONCE in the response.
   */
  async createWebhook(input: CreateWebhookInput): Promise<CreateWebhookResult> {
    return this.request<CreateWebhookResult>('POST', '/webhooks', input);
  }

  /**
   * List registered webhook endpoints (secrets are omitted)
   */
  async listWebhooks(): Promise<WebhookEndpoint[]> {
    return this.request<WebhookEndpoint[]>('GET', '/webhooks');
  }

  /**
   * Delete a webhook endpoint
   */
  async deleteWebhook(endpointId: string): Promise<{ message: string }> {
    return this.request<{ message: string }>('DELETE', `/webhooks/${encodeURIComponent(endpointId)}`);
  }

  // ==================== Webhook Verification Static Helper ====================

  /**
   * Reusable, timing-safe Webhook HMAC-SHA256 signature verification helper with replay protection.
   *
   * @param secret - Webhook secret string (e.g. 'whsec_...')
   * @param rawBody - Raw UTF-8 request body string (Do NOT JSON.parse or re-stringify before verification)
   * @param timestampHeader - Value of X-RMS-Timestamp header
   * @param signatureHeader - Value of X-RMS-Signature header (e.g. 't=1718000000,v1=abcdef...')
   * @param toleranceSeconds - Maximum allowed clock skew / age in seconds to prevent replay attacks (default: 300s / 5min)
   */
  static verifyWebhookSignature(
    secret: string,
    rawBody: string,
    timestampHeader?: string | null,
    signatureHeader?: string | null,
    toleranceSeconds: number = 300
  ): WebhookVerificationResult {
    if (!secret) {
      return { isValid: false, error: 'Missing webhook secret' };
    }
    if (!timestampHeader) {
      return { isValid: false, error: 'Missing X-RMS-Timestamp header' };
    }
    if (!signatureHeader) {
      return { isValid: false, error: 'Missing X-RMS-Signature header' };
    }

    const eventTimestamp = parseInt(timestampHeader, 10);
    if (isNaN(eventTimestamp)) {
      return { isValid: false, error: 'Invalid X-RMS-Timestamp header format' };
    }

    // 1. Replay attack protection (tolerance check)
    const currentTimestamp = Math.floor(Date.now() / 1000);
    if (Math.abs(currentTimestamp - eventTimestamp) > toleranceSeconds) {
      return {
        isValid: false,
        error: `Timestamp out of tolerance window (${toleranceSeconds}s). Possible replay attack or clock drift.`,
        timestamp: eventTimestamp,
      };
    }

    // 2. Extract v1 signature
    let signatureToVerify = signatureHeader;
    if (signatureHeader.includes('v1=')) {
      const parts = signatureHeader.split(',');
      const v1Part = parts.find((p) => p.trim().startsWith('v1='));
      if (v1Part) {
        signatureToVerify = v1Part.split('=')[1].trim();
      }
    }

    // 3. Compute expected HMAC: HMAC-SHA256(secret, timestamp + "." + rawBody)
    const payloadToSign = `${timestampHeader}.${rawBody}`;
    const expectedSignature = crypto
      .createHmac('sha256', secret)
      .update(payloadToSign)
      .digest('hex');

    // 4. Constant-time equality comparison
    try {
      const sigBuf = Buffer.from(signatureToVerify, 'hex');
      const expBuf = Buffer.from(expectedSignature, 'hex');

      if (sigBuf.length !== expBuf.length || !crypto.timingSafeEqual(sigBuf, expBuf)) {
        return { isValid: false, error: 'Signature mismatch' };
      }
    } catch (_) {
      return { isValid: false, error: 'Signature comparison failed' };
    }

    return {
      isValid: true,
      timestamp: eventTimestamp,
    };
  }
}
