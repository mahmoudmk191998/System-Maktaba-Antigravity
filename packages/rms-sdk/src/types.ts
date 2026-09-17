export interface RmsSdkConfig {
  baseUrl: string; // e.g. 'https://api.example-restaurant.com/api/v1'
  apiKey: string;  // e.g. 'rms_live_...'
  timeoutMs?: number; // default 10000ms
  maxRetries?: number; // default 2
  defaultBranchId?: string;
  fetch?: typeof fetch;
}

export interface RequestOptions {
  branchId?: string;
  idempotencyKey?: string;
  requestId?: string;
  timeoutMs?: number;
  headers?: Record<string, string>;
}

export interface ApiResponseEnvelope<T> {
  success: boolean;
  data: T;
  meta?: {
    request_id?: string;
    timestamp?: string;
    [key: string]: any;
  };
}

export interface HealthResponse {
  status: string;
  service: string;
  version: string;
  infrastructure?: {
    rateLimitStore: { provider: string; status: string };
    webhookQueue: { provider: string; status: string; pending_jobs: number };
    workers?: { enabled: boolean; active: boolean; concurrency: number };
    redis?: { status: string };
  };
}

export interface RestaurantSettings {
  restaurant_name: string;
  logo?: string;
  currency: string;
  locale: string;
  timezone: string;
  tax_rate: number;
  tax_included: boolean;
  phone?: string;
  address?: string;
  primary_color?: string;
}

export interface Branch {
  id: string;
  name: string;
  address?: string;
  phone?: string;
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

export interface MenuCategoryWithProducts extends Category {
  products: Product[];
}

export interface MenuResponse {
  categories: MenuCategoryWithProducts[];
  total_products: number;
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

export interface PricingBreakdown {
  subtotal: number;
  discount_total: number;
  delivery_fee: number;
  service_fee: number;
  tax_total: number;
  total: number;
  currency: string;
}

export interface OrderCustomerInput {
  name: string;
  phone: string;
  email?: string;
}

export interface DeliveryAddressInput {
  street: string;
  building?: string;
  floor?: string;
  apartment?: string;
  city?: string;
  zone_id?: string;
  notes?: string;
  coordinates?: { latitude: number; longitude: number };
}

export interface CreateOrderItemInput {
  product_id: string;
  quantity: number;
  addon_ids?: string[];
  notes?: string;
}

export interface CreateOrderInput {
  branch_id: string;
  order_type: 'dine_in' | 'takeaway' | 'delivery' | 'curbside';
  items: CreateOrderItemInput[];
  customer: OrderCustomerInput;
  delivery_address?: DeliveryAddressInput;
  delivery_zone_id?: string;
  coupon_code?: string;
  promotion_id?: string;
  payment_method: 'cash' | 'credit_card' | 'online' | 'wallet';
  notes?: string;
}

export interface OrderResponse {
  id: string;
  order_number: string;
  tenant_id: string;
  branch_id: string;
  order_type: string;
  status: string;
  pricing: PricingBreakdown;
  customer: OrderCustomerInput;
  delivery_address?: DeliveryAddressInput;
  payment_method: string;
  created_at: string;
}

export interface OrderTrackingInfo {
  order_id: string;
  order_number: string;
  status: string;
  estimated_delivery_time?: string;
  status_history: Array<{
    status: string;
    timestamp: string;
    notes?: string;
  }>;
}

export interface WebhookEventPayload<T = any> {
  event_id: string;
  event_type: string;
  tenant_id: string;
  timestamp: string;
  data: T;
}

export interface PublicRmsEvent<T = any> {
  id: string;
  type: string;
  version: string;
  tenant_id: string;
  integration_id?: string;
  branch_id?: string;
  resource_type: string;
  resource_id: string;
  request_id: string;
  timestamp: string;
  data: T;
  metadata?: Record<string, any>;
}
