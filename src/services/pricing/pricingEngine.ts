/**
 * Retail Pricing Engine (Phase 8)
 * Calculates base price, customer-specific contracts, price lists, quantity tiers,
 * wholesale prices, promotional discounts, taxes, and profit margins with deterministic priority rules.
 */

import type {
  Product,
  ProductVariant,
  Promotion,
  Coupon,
  Customer,
  CustomerType,
  CustomerProductPrice,
  PriceListItem,
} from '@/types/retail.types';

export interface QuantityTier {
  minQuantity: number;
  price: number;
}

export interface PricingContext {
  product: Product;
  variant?: ProductVariant | null;
  quantity: number;
  conversionFactor?: number;            // e.g. 50 pieces per box
  customer?: Customer | null;
  customerId?: string | null;
  customerType?: CustomerType;
  isWholesale?: boolean;
  customerContractPrice?: number | null; // Customer-specific contractual price
  customerProductPrices?: CustomerProductPrice[];
  priceListPrice?: number | null;        // Assigned Price List price
  priceListItems?: PriceListItem[];
  priceListId?: string | null;
  quantityTiers?: QuantityTier[];        // Configured quantity tiers
  allowWholesalePromotions?: boolean;
  activePromotions?: Promotion[];
  coupon?: Coupon | null;
  manualDiscountAmount?: number;
  manualDiscountPercentage?: number;
  manualDiscountPercent?: number;       // alias for manualDiscountPercentage
  taxRate?: number;                     // e.g. 0.14 for 14% VAT
  allowBelowMinimum?: boolean;
}

export type PriceSourceType =
  | 'customer_contract'
  | 'contract'
  | 'price_list'
  | 'quantity_tier'
  | 'wholesale'
  | 'retail'
  | 'promotion'
  | 'manual_override';

export interface CalculatedPriceResult {
  baseUnitSellingPrice: number;
  appliedUnitPrice: number;
  pricingTierUsed: 'retail' | 'wholesale';
  priceSource: PriceSourceType;
  priceListId?: string | null;
  pricingRuleId?: string | null;
  discountAmount: number;
  discountReason: string;
  subtotal: number;
  taxAmount: number;
  lineTotal: number;
  unitCost: number;
  estimatedProfit: number;
  minimumPriceViolated?: boolean;
  warning?: string;
}

/**
 * Calculates deterministic line item pricing following retail priority rules:
 * 1. Customer-specific contractual price takes highest precedence
 * 2. Assigned Price List takes 2nd precedence
 * 3. Quantity Tiers take 3rd precedence (evaluated against base quantity)
 * 4. Default Wholesale price takes 4th precedence (if wholesale customer or wholesale mode)
 * 5. Retail base price (Variant override vs Product default)
 * 6. Promotions/Offers applied (if allowed on tier)
 * 7. Manual discount applied if specified
 * 8. Minimum Selling Price Guard (absolute floor)
 * 9. Tax & Profit Margins computed
 */
export function calculateItemPrice(context: PricingContext): CalculatedPriceResult {
  const {
    product,
    variant,
    quantity,
    conversionFactor = 1,
    customer,
    customerContractPrice: explicitContractPrice = null,
    customerProductPrices = [],
    priceListPrice: explicitPriceListPrice = null,
    priceListItems = [],
    allowWholesalePromotions = false,
    activePromotions = [],
    coupon = null,
    manualDiscountAmount = 0,
    manualDiscountPercentage = 0,
    manualDiscountPercent = 0,
    taxRate = product.taxRate || 0,
    allowBelowMinimum = false,
  } = context;

  // Resolve Customer attributes
  const effectiveCustomerId = customer?.id || context.customerId || null;
  const effectiveCustomerType = customer?.customerType || context.customerType;
  const effectivePriceListId = customer?.priceListId || context.priceListId || null;
  const isWholesaleRequested = context.isWholesale || false;

  // Baseline prices
  const retailPrice = variant?.sellingPrice ?? product.sellingPrice;
  const defaultWholesale = variant?.wholesalePrice ?? product.wholesalePrice ?? retailPrice;
  const unitCost = variant?.purchasePrice ?? product.averageCost ?? product.purchasePrice ?? 0;
  const baseQty = Math.max(1, quantity) * Math.max(1, conversionFactor);

  let effectiveBasePrice = retailPrice;
  let priceSource: PriceSourceType = 'retail';
  let pricingTierUsed: 'retail' | 'wholesale' = 'retail';
  let pricingRuleId: string | null = null;

  // Resolve Customer Contract Price (Priority 1)
  let resolvedContractPrice: number | null = explicitContractPrice;
  if (resolvedContractPrice === null && effectiveCustomerId && customerProductPrices.length > 0) {
    const matched = customerProductPrices.find(
      (cp) =>
        (cp.customerId === effectiveCustomerId || !cp.customerId) &&
        cp.productId === product.id &&
        cp.isActive !== false
    );
    if (matched && matched.customPrice > 0) {
      resolvedContractPrice = matched.customPrice;
    }
  }

  // Resolve Price List Price (Priority 2)
  let resolvedPriceListPrice: number | null = explicitPriceListPrice;
  if (resolvedPriceListPrice === null && effectivePriceListId && priceListItems.length > 0) {
    const matchedPli = priceListItems.find(
      (pli) => pli.priceListId === effectivePriceListId && pli.productId === product.id
    );
    if (matchedPli) {
      if (matchedPli.fixedPrice !== undefined && matchedPli.fixedPrice > 0) {
        resolvedPriceListPrice = matchedPli.fixedPrice;
      } else if (matchedPli.discountPercentage && matchedPli.discountPercentage > 0) {
        resolvedPriceListPrice = Math.round(retailPrice * (1 - matchedPli.discountPercentage / 100) * 100) / 100;
      }
    }
  }

  // Resolve Quantity Tiers (Priority 3)
  const resolvedTiers: QuantityTier[] = [...(context.quantityTiers || [])];
  if (resolvedTiers.length === 0 && product.pricingRules && product.pricingRules.length > 0) {
    for (const rule of product.pricingRules) {
      if (rule.tierMinQty) {
        let tierPrice = retailPrice;
        if (rule.discountType === 'fixed_price' && rule.discountValue) {
          tierPrice = rule.discountValue;
        } else if (rule.discountType === 'percentage' && rule.discountValue) {
          tierPrice = Math.round(retailPrice * (1 - rule.discountValue / 100) * 100) / 100;
        }
        resolvedTiers.push({
          minQuantity: rule.tierMinQty,
          price: tierPrice,
        });
      }
    }
  }

  // 1. Priority 1: Customer-specific contractual price
  if (resolvedContractPrice !== null && resolvedContractPrice > 0) {
    effectiveBasePrice = resolvedContractPrice;
    priceSource = 'customer_contract';
    pricingTierUsed = 'wholesale';
  }
  // 2. Priority 2: Assigned Price List
  else if (resolvedPriceListPrice !== null && resolvedPriceListPrice > 0) {
    effectiveBasePrice = resolvedPriceListPrice;
    priceSource = 'price_list';
    pricingTierUsed = 'wholesale';
  }
  // 3. Priority 3: Quantity Tiers (evaluated on base quantity)
  else if (resolvedTiers && resolvedTiers.length > 0) {
    const sortedTiers = [...resolvedTiers].sort((a, b) => b.minQuantity - a.minQuantity);
    const matchedTier = sortedTiers.find((tier) => baseQty >= tier.minQuantity);

    if (matchedTier && matchedTier.price > 0 && matchedTier.price < retailPrice) {
      effectiveBasePrice = matchedTier.price;
      priceSource = 'quantity_tier';
      pricingTierUsed = 'wholesale';
      pricingRuleId = `tier_${matchedTier.minQuantity}`;
    }
  }

  // 4. Priority 4: Default Wholesale price
  if (priceSource === 'retail') {
    const isWholesaleCustomer =
      effectiveCustomerType === 'wholesale' ||
      effectiveCustomerType === 'company' ||
      effectiveCustomerType === 'school' ||
      effectiveCustomerType === 'corporate';

    if (isWholesaleRequested || isWholesaleCustomer) {
      effectiveBasePrice = defaultWholesale;
      priceSource = 'wholesale';
      pricingTierUsed = 'wholesale';
    }
  }

  let currentUnitPrice = effectiveBasePrice;
  let discountAmount = 0;
  let discountReason = '';

  // 5. Promotions (only apply to standard retail unless allowWholesalePromotions is enabled)
  const canApplyPromotions = pricingTierUsed === 'retail' || allowWholesalePromotions;
  if (canApplyPromotions && activePromotions && activePromotions.length > 0) {
    for (const promo of activePromotions) {
      const isPromoActive = promo.status === 'active' || promo.active === true || promo.isActive === true;
      if (!isPromoActive) continue;
      if (promo.minQuantity && quantity < promo.minQuantity) continue;

      if (promo.type === 'percentage') {
        const potentialDiscount = (effectiveBasePrice * promo.value) / 100;
        if (potentialDiscount > discountAmount) {
          discountAmount = potentialDiscount;
          discountReason = promo.title || `خصم ${promo.value}%`;
          priceSource = 'promotion';
        }
      } else if (promo.type === 'fixed') {
        if (promo.value > discountAmount) {
          discountAmount = Math.min(promo.value, effectiveBasePrice);
          discountReason = promo.title || `خصم بقيمة ${promo.value} ج.م`;
          priceSource = 'promotion';
        }
      }
    }
  }

  // 6. Manual Discounts
  const effectiveManualDiscountPercent = manualDiscountPercent || manualDiscountPercentage || 0;
  if (effectiveManualDiscountPercent > 0) {
    const mDiscount = (effectiveBasePrice * effectiveManualDiscountPercent) / 100;
    discountAmount += mDiscount;
    discountReason = discountReason
      ? `${discountReason} + يدوي ${effectiveManualDiscountPercent}%`
      : `خصم يدوي ${effectiveManualDiscountPercent}%`;
  } else if (manualDiscountAmount > 0) {
    discountAmount += manualDiscountAmount;
    discountReason = discountReason
      ? `${discountReason} + يدوي ${manualDiscountAmount} ج.م`
      : `خصم يدوي ${manualDiscountAmount} ج.م`;
  }

  // Ensure discount doesn't exceed base price
  discountAmount = Math.min(discountAmount, effectiveBasePrice);
  currentUnitPrice = Math.max(0, effectiveBasePrice - discountAmount);

  // 7. Minimum Selling Price Guard (absolute floor unless allowBelowMinimum is explicitly permitted)
  let minimumPriceViolated = false;
  let warning: string | undefined = undefined;
  const minPrice = product.minimumSellingPrice ?? 0;
  if (!allowBelowMinimum && minPrice > 0 && currentUnitPrice < minPrice) {
    currentUnitPrice = minPrice;
    discountAmount = Math.max(0, effectiveBasePrice - minPrice);
    discountReason += ' (مقيد بالحد الأدنى للبيع)';
    minimumPriceViolated = true;
    warning = 'السعر مقيد بالحد الأدنى للبيع';
  }

  // Subtotal for line
  const subtotal = Math.round(currentUnitPrice * quantity * 100) / 100;

  // Tax calculation
  const taxAmount = Math.round(subtotal * taxRate * 100) / 100;
  const lineTotal = Math.round((subtotal + taxAmount) * 100) / 100;

  // Profit estimation
  const totalCost = Math.round(unitCost * baseQty * 100) / 100;
  const estimatedProfit = Math.round((subtotal - totalCost) * 100) / 100;

  return {
    baseUnitSellingPrice: retailPrice,
    appliedUnitPrice: Math.round(currentUnitPrice * 100) / 100,
    pricingTierUsed,
    priceSource,
    priceListId: effectivePriceListId,
    pricingRuleId,
    discountAmount: Math.round(discountAmount * 100) / 100,
    discountReason,
    subtotal,
    taxAmount,
    lineTotal,
    unitCost,
    estimatedProfit,
    minimumPriceViolated,
    warning,
  };
}
