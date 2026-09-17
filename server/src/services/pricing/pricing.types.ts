export type OrderType = 'dine_in' | 'takeaway' | 'delivery' | 'curbside';

export interface PricingItemInput {
  product_id: string;
  quantity: number;
  addon_ids?: string[];
  notes?: string;
}

export interface DeliveryPricingInput {
  zone_id?: string;
  address?: string;
}

export interface PricingContext {
  tenantId: string;
  branchId: string;
  orderType: OrderType;
  items: PricingItemInput[];
  couponCode?: string;
  promotionId?: string;
  delivery?: DeliveryPricingInput;
}

export interface PricingLineAddon {
  id: string;
  name: string;
  price: number;
}

export interface PricingLineItem {
  product_id: string;
  name: string;
  quantity: number;
  unit_price: number;
  addons: PricingLineAddon[];
  addons_total: number;
  line_subtotal: number;
  discount: number;
  line_total: number;
}

export interface AppliedPromotion {
  id: string;
  name: string;
  code?: string;
  type: 'percentage' | 'fixed' | 'free_delivery' | string;
  value: number;
  discount_amount: number;
}

export interface PricingResult {
  tenant_id: string;
  branch_id: string;
  order_type: OrderType;
  currency: string;
  items: PricingLineItem[];
  subtotal: number;
  discounts: AppliedPromotion[];
  discount_total: number;
  delivery_fee: number;
  tax_rate: number;
  tax_included: boolean;
  tax_amount: number;
  grand_total: number;
  calculated_at: string;
}
