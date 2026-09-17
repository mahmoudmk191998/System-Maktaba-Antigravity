/**
 * RMS REST API Client SDK Types
 */

export interface RmsClientConfig {
  /** Base URL of the RMS REST API backend (e.g. 'http://localhost:4000/api/v1' or 'https://api.rms.example.com/api/v1') */
  baseUrl: string;
  /**
   * API Key credential header string (e.g. 'rms_live_cli_xxx.rms_sec_yyy' or Bearer token)
   */
  apiKey: string;
  /** Optional branch ID to set default X-Branch-ID on all catalog and pricing requests */
  branchId?: string;
  /** Request timeout in milliseconds (default: 10000ms) */
  timeoutMs?: number;
  /** Maximum retry attempts for idempotent/safe operations (default: 2) */
  maxRetries?: number;
  /** Custom fetch implementation (optional) */
  fetch?: typeof fetch;
}

export interface RequestOptions {
  branchId?: string;
  requestId?: string;
  idempotencyKey?: string;
  timeoutMs?: number;
  headers?: Record<string, string>;
}

export interface ApiResponseEnvelope<T> {
  success: boolean;
  data: T;
  error?: {
    code: string;
    message: string;
    details?: any;
  };
  request_id?: string;
}

export interface HealthResponse {
  status: string;
  timestamp: string;
  version: string;
  uptime_seconds: number;
}

export interface RestaurantSettings {
  name: string;
  currency: string;
  taxRate: number;
  taxIncluded: boolean;
  serviceCharge: number;
  minimumOrder: number;
  defaultDeliveryFee: number;
  phone?: string;
  address?: string;
  workingHours?: Record<string, { open: string; close: string }>;
}

export interface Branch {
  id: string;
  name: string;
  address: string;
  phone: string;
  is_active: boolean;
}

export interface Category {
  id: string;
  name: string;
  name_en?: string;
  sort_order?: number;
  is_active: boolean;
}

export interface ProductAddon {
  id: string;
  name: string;
  price: number;
  is_available: boolean;
}

export interface Product {
  id: string;
  category_id: string;
  name: string;
  name_en?: string;
  description?: string;
  price: number;
  image_url?: string;
  is_available: boolean;
  addons?: ProductAddon[];
}

export interface DeliveryZone {
  id: string;
  name: string;
  delivery_fee: number;
  estimated_time_minutes: number;
  min_order_amount: number;
  is_active: boolean;
}

export interface Offer {
  id: string;
  title: string;
  description?: string;
  discount_type: 'percentage' | 'fixed';
  discount_value: number;
  coupon_code?: string;
  start_date: string;
  end_date: string;
  is_active: boolean;
}

export interface PricingPreviewItemInput {
  product_id: string;
  quantity: number;
  addon_ids?: string[];
}

export interface PricingPreviewInput {
  branch_id: string;
  order_type: 'dine_in' | 'takeaway' | 'delivery' | 'curbside';
  items: PricingPreviewItemInput[];
  delivery_zone_id?: string;
  coupon_code?: string;
  promotion_id?: string;
}

export interface PricingLineItem {
  product_id: string;
  product_name: string;
  unit_price: number;
  quantity: number;
  addons_total: number;
  line_subtotal: number;
  addons_breakdown?: Array<{ id: string; name: string; price: number }>;
}

export interface PricingCalculationResult {
  currency: string;
  subtotal: number;
  discount_total: number;
  discount_breakdown: {
    coupon_discount: number;
    promotion_discount: number;
    coupon_code?: string;
    promotion_id?: string;
  };
  discounted_subtotal: number;
  delivery_fee: number;
  tax_rate: number;
  tax_amount: number;
  tax_included: boolean;
  grand_total: number;
  items: PricingLineItem[];
}

export interface CustomerInput {
  name?: string;
  phone?: string;
  address?: string;
}

export interface DeliveryInput {
  zone_id?: string;
  address?: string;
  notes?: string;
}

export interface CreateOrderInput {
  branch_id: string;
  order_type: 'dine_in' | 'takeaway' | 'delivery' | 'curbside';
  items: Array<{
    product_id: string;
    quantity: number;
    addon_ids?: string[];
    notes?: string;
  }>;
  customer?: CustomerInput;
  delivery?: DeliveryInput;
  coupon_code?: string;
  promotion_id?: string;
  payment_method?: 'cash' | 'card' | 'online' | 'other';
  notes?: string;
}

export interface CreateOrderResult {
  order_id: string;
  order_number: string;
  status: string;
  payment_status: string;
  pricing: {
    subtotal: number;
    discount_total: number;
    delivery_fee: number;
    tax_rate: number;
    tax_amount: number;
    grand_total: number;
    currency: string;
  };
  items_count: number;
  created_at: string;
}

export interface PublicOrderResponse {
  id: string;
  order_number: string;
  branch_id: string;
  order_type: string;
  status: string;
  payment_status: string;
  payment_method?: string;
  customer?: CustomerInput;
  delivery?: DeliveryInput;
  pricing: PricingCalculationResult;
  items: Array<{
    product_id: string;
    product_name: string;
    unit_price: number;
    quantity: number;
    addons_total: number;
    line_subtotal: number;
    notes?: string;
  }>;
  notes?: string;
  created_at: string;
  updated_at?: string;
}

export interface WebhookEndpoint {
  id: string;
  tenant_id: string;
  client_id: string;
  url: string;
  events: string[];
  active: boolean;
  created_at: string;
}

export interface CreateWebhookInput {
  url: string;
  events: string[];
  active?: boolean;
}

export interface CreateWebhookResult {
  endpoint: WebhookEndpoint;
  secret: string;
}

export interface WebhookVerificationResult {
  isValid: boolean;
  error?: string;
  timestamp?: number;
  eventId?: string;
}
