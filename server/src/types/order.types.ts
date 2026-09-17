import { OrderType, PricingLineItem, PricingResult } from '../services/pricing/pricing.types.js';

export type OrderStatus =
  | 'pending'
  | 'confirmed'
  | 'preparing'
  | 'ready'
  | 'out_for_delivery'
  | 'delivered'
  | 'completed'
  | 'cancelled';

export type PaymentStatus = 'pending' | 'paid' | 'partial' | 'refunded';
export type PaymentMethod = 'cash' | 'card' | 'wallet' | 'online' | string;

export interface CustomerInput {
  customer_id?: string;
  name?: string;
  phone?: string;
  address?: string;
}

export interface DeliveryInput {
  zone_id?: string;
  address_id?: string;
  address?: string;
  notes?: string;
}

export interface CreateOrderItemInput {
  product_id: string;
  quantity: number;
  addon_ids?: string[];
  notes?: string;
}

export interface CreateOrderInput {
  branch_id: string;
  order_type: OrderType;
  items: CreateOrderItemInput[];
  customer?: CustomerInput;
  delivery?: DeliveryInput;
  coupon_code?: string;
  promotion_id?: string;
  payment_method?: PaymentMethod;
  notes?: string;
  table_id?: string;
}

export interface CustomerSnapshot {
  customer_id: string | null;
  name: string | null;
  phone: string | null;
  address: string | null;
}

export interface DeliverySnapshot {
  zone_id: string | null;
  address: string | null;
  delivery_fee: number;
}

export interface OrderStatusHistory {
  id: string;
  tenant_id: string;
  order_id: string;
  previous_status: OrderStatus | null;
  new_status: OrderStatus;
  changed_by: string;
  source: 'system' | 'pos' | 'kitchen' | 'delivery' | 'api';
  note?: string | null;
  created_at: string;
}

export interface PublicOrderResponse {
  id: string;
  order_number: string;
  branch_id: string;
  order_type: OrderType;
  status: OrderStatus;
  payment_status: PaymentStatus;
  payment_method: string;
  customer: CustomerSnapshot;
  delivery: DeliverySnapshot;
  pricing: {
    subtotal: number;
    discount_total: number;
    delivery_fee: number;
    tax_rate: number;
    tax_amount: number;
    grand_total: number;
    currency: string;
  };
  items: {
    product_id: string;
    name: string;
    quantity: number;
    unit_price: number;
    addons: { id: string; name: string; price: number }[];
    addons_total: number;
    line_subtotal: number;
    line_total: number;
    notes?: string;
  }[];
  notes: string | null;
  created_at: string;
  updated_at?: string;
}

export interface StoredOrder {
  id: string;
  tenant_id: string;
  branch_id: string;
  order_number: string;
  order_type: OrderType;
  status: OrderStatus;
  payment_status: PaymentStatus;
  payment_method: string;
  customer_snapshot: CustomerSnapshot;
  delivery_snapshot: DeliverySnapshot;
  pricing_snapshot: PricingResult;
  items: PricingLineItem[];
  subtotal: number;
  discount_amount: number;
  tax_amount: number;
  delivery_fee: number;
  total: number;
  notes: string | null;
  created_by: string;
  created_at: string;
  updated_at?: string;
  idempotency_key?: string;
}

export interface CreateOrderResult {
  order_id: string;
  order_number: string;
  status: OrderStatus;
  payment_status: PaymentStatus;
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
