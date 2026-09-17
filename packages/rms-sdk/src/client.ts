import {
  ApiResponseEnvelope,
  Branch,
  Category,
  CreateOrderInput,
  DeliveryZone,
  HealthResponse,
  MenuResponse,
  Offer,
  OrderResponse,
  OrderTrackingInfo,
  PricingBreakdown,
  PricingPreviewInput,
  Product,
  RequestOptions,
  RestaurantSettings,
  RmsSdkConfig,
} from './types.js';
import {
  RmsAuthError,
  RmsConflictError,
  RmsError,
  RmsNotFoundError,
  RmsPermissionError,
  RmsRateLimitError,
  RmsServerError,
  RmsValidationError,
} from './errors.js';
import { RmsRealtimeClient } from './realtime.js';

export class RmsApiClient {
  public readonly events: RmsRealtimeClient;
  private baseUrl: string;
  private apiKey: string;
  private timeoutMs: number;
  private maxRetries: number;
  private defaultBranchId?: string;
  private fetchImpl: typeof fetch;

  constructor(config: RmsSdkConfig) {
    if (!config.baseUrl) {
      throw new Error('baseUrl is required for RmsApiClient');
    }
    if (!config.apiKey) {
      throw new Error('apiKey is required for RmsApiClient');
    }

    this.baseUrl = config.baseUrl.replace(/\/+$/, '');
    this.apiKey = config.apiKey.trim();
    this.timeoutMs = config.timeoutMs || 10000;
    this.maxRetries = config.maxRetries !== undefined ? config.maxRetries : 2;
    this.defaultBranchId = config.defaultBranchId;
    this.fetchImpl = config.fetch || globalThis.fetch;
    this.events = new RmsRealtimeClient(this.baseUrl, this.apiKey, this.defaultBranchId);
  }

  private async request<T>(
    endpoint: string,
    method: 'GET' | 'POST' | 'PATCH' | 'DELETE' = 'GET',
    body?: any,
    options?: RequestOptions,
    attempt: number = 0
  ): Promise<T> {
    const url = `${this.baseUrl}${endpoint.startsWith('/') ? endpoint : `/${endpoint}`}`;
    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
      'User-Agent': '@rms/sdk-v1.0.0',
      Authorization: this.apiKey.startsWith('Bearer ') ? this.apiKey : `Bearer ${this.apiKey}`,
      ...(options?.headers || {}),
    };

    const branchId = options?.branchId || this.defaultBranchId;
    if (branchId) {
      headers['X-Branch-ID'] = branchId;
    }

    if (options?.idempotencyKey) {
      headers['Idempotency-Key'] = options.idempotencyKey;
    }

    if (options?.requestId) {
      headers['X-Request-ID'] = options.requestId;
    }

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), options?.timeoutMs || this.timeoutMs);

    try {
      const response = await this.fetchImpl(url, {
        method,
        headers,
        body: body !== undefined ? JSON.stringify(body) : undefined,
        signal: controller.signal,
      });

      clearTimeout(timeout);
      const requestId = response.headers.get('x-request-id') || undefined;

      let json: any;
      try {
        json = await response.json();
      } catch (_) {
        json = { success: response.ok };
      }

      if (!response.ok) {
        const errorData = json?.error || {};
        const message = errorData.message || response.statusText || 'API Request failed';
        const code = errorData.code || 'API_ERROR';

        if (response.status === 401) throw new RmsAuthError(message, errorData.details, requestId);
        if (response.status === 403) throw new RmsPermissionError(message, errorData.details, requestId);
        if (response.status === 404) throw new RmsNotFoundError(message, errorData.details, requestId);
        if (response.status === 400) throw new RmsValidationError(message, errorData.details, requestId);
        if (response.status === 409) throw new RmsConflictError(message, errorData.details, requestId);
        if (response.status === 429) {
          const retryAfter = parseInt(response.headers.get('retry-after') || '60', 10);
          throw new RmsRateLimitError(message, retryAfter, errorData.details, requestId);
        }
        if (response.status >= 500) {
          if (attempt < this.maxRetries && method === 'GET') {
            await new Promise((r) => setTimeout(r, Math.pow(2, attempt) * 500));
            return this.request<T>(endpoint, method, body, options, attempt + 1);
          }
          throw new RmsServerError(message, response.status, errorData.details, requestId);
        }

        throw new RmsError(message, code, response.status, errorData.details, requestId);
      }

      return json.data !== undefined ? json.data : (json as T);
    } catch (err: any) {
      clearTimeout(timeout);
      if (err instanceof RmsError) throw err;
      if (err.name === 'AbortError') {
        throw new RmsServerError('Request timeout', 504);
      }
      throw new RmsServerError(err?.message || 'Network communication error', 500);
    }
  }

  // System & Branding APIs
  async getHealth(options?: RequestOptions): Promise<HealthResponse> {
    return this.request<HealthResponse>('/health', 'GET', undefined, options);
  }

  async getSettings(options?: RequestOptions): Promise<RestaurantSettings> {
    return this.request<RestaurantSettings>('/settings', 'GET', undefined, options);
  }

  // Catalog & Menu APIs
  async getBranches(options?: RequestOptions): Promise<Branch[]> {
    return this.request<Branch[]>('/branches', 'GET', undefined, options);
  }

  async getBranchById(branchId: string, options?: RequestOptions): Promise<Branch> {
    return this.request<Branch>(`/branches/${branchId}`, 'GET', undefined, options);
  }

  async getCategories(options?: RequestOptions): Promise<Category[]> {
    return this.request<Category[]>('/categories', 'GET', undefined, options);
  }

  async getProducts(categoryId?: string, options?: RequestOptions): Promise<Product[]> {
    const query = categoryId ? `?category_id=${encodeURIComponent(categoryId)}` : '';
    return this.request<Product[]>(`/products${query}`, 'GET', undefined, options);
  }

  async getProductById(productId: string, options?: RequestOptions): Promise<Product> {
    return this.request<Product>(`/products/${productId}`, 'GET', undefined, options);
  }

  async getMenu(options?: RequestOptions): Promise<MenuResponse> {
    return this.request<MenuResponse>('/menu', 'GET', undefined, options);
  }

  async getDeliveryZones(options?: RequestOptions): Promise<DeliveryZone[]> {
    return this.request<DeliveryZone[]>('/delivery-zones', 'GET', undefined, options);
  }

  async getOffers(options?: RequestOptions): Promise<Offer[]> {
    return this.request<Offer[]>('/offers', 'GET', undefined, options);
  }

  // Server-Side Pricing Engine
  async previewPricing(input: PricingPreviewInput, options?: RequestOptions): Promise<PricingBreakdown> {
    return this.request<PricingBreakdown>('/pricing/preview', 'POST', input, options);
  }

  // Orders Management & Snapshots
  async createOrder(input: CreateOrderInput, options?: RequestOptions): Promise<OrderResponse> {
    return this.request<OrderResponse>('/orders', 'POST', input, options);
  }

  async getOrder(orderId: string, options?: RequestOptions): Promise<OrderResponse> {
    return this.request<OrderResponse>(`/orders/${orderId}`, 'GET', undefined, options);
  }

  async trackOrder(orderId: string, options?: RequestOptions): Promise<OrderTrackingInfo> {
    return this.request<OrderTrackingInfo>(`/orders/${orderId}/track`, 'GET', undefined, options);
  }

  async updateOrderStatus(
    orderId: string,
    status: string,
    notes?: string,
    options?: RequestOptions
  ): Promise<OrderResponse> {
    return this.request<OrderResponse>(`/orders/${orderId}/status`, 'PATCH', { status, notes }, options);
  }

  // Universal Delivery Fee Helper
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
}
