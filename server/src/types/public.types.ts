export interface PublicCategory {
  id: string;
  name: string;
  name_en?: string;
  icon?: string;
  color?: string;
  sort_order: number;
}

export interface PublicMenuItem {
  id: string;
  category_id: string | null;
  name: string;
  name_en?: string;
  description?: string;
  description_en?: string;
  price: number;
  image_url?: string | null;
  preparation_time?: number;
  calories?: number | null;
  allergens?: string[] | null;
  is_available: boolean;
}

export interface PublicBranch {
  id: string;
  name: string;
  address?: string;
  phone?: string;
  is_active: boolean;
}

export interface PublicDeliveryZone {
  id: string;
  name: string;
  price: number;
  estimated_time?: number;
}

export interface DeliveryZoneCheckResult {
  available: boolean;
  delivery_fee: number;
  estimated_time: number;
}

export type ProductUnavailableReason =
  | 'out_of_stock'
  | 'disabled'
  | 'branch_unavailable'
  | 'not_found'
  | null;

export interface ProductAvailabilityResult {
  available: boolean;
  reason: ProductUnavailableReason;
}

export interface PublicOffer {
  id: string;
  name: string;
  type: 'percentage' | 'fixed' | 'free_delivery' | string;
  value: number;
  min_order?: number;
  max_discount?: number | null;
  start_date?: string;
  end_date?: string;
  is_active: boolean;
}

export interface PublicRestaurantSettings {
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
