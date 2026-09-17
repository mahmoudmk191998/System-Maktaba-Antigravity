import { getFirestoreDb } from '../../config/firebase.js';
import { env } from '../../config/environment.js';
import { defaultBranchesService, BranchesService } from '../branches.service.js';
import { defaultDeliveryService, DeliveryService } from '../delivery.service.js';
import { defaultMenuService, MenuService } from '../menu.service.js';
import { defaultOffersService, OffersService } from '../offers.service.js';
import { defaultSettingsService, SettingsService } from '../settings.service.js';
import {
  InvalidQuantityError,
  MinimumOrderError,
  ProductUnavailableError,
  PromotionExpiredError,
  PromotionInvalidError,
} from './pricing.errors.js';
import {
  AppliedPromotion,
  OrderType,
  PricingContext,
  PricingLineAddon,
  PricingLineItem,
  PricingResult,
} from './pricing.types.js';
import {
  addMoney,
  clampNonNegative,
  multiplyMoney,
  percentageMoney,
  roundMoney,
  subtractMoney,
} from './pricing.utils.js';

// In-memory test stores for coupons & addons
const inMemoryCoupons = new Map<string, any>();
const inMemoryAddons = new Map<string, any>();

export class PricingEngine {
  private useMemory: boolean;
  private menuService: MenuService;
  private branchesService: BranchesService;
  private deliveryService: DeliveryService;
  private offersService: OffersService;
  private settingsService: SettingsService;

  constructor(
    useMemory: boolean = env.NODE_ENV === 'test',
    menuService: MenuService = defaultMenuService,
    branchesService: BranchesService = defaultBranchesService,
    deliveryService: DeliveryService = defaultDeliveryService,
    offersService: OffersService = defaultOffersService,
    settingsService: SettingsService = defaultSettingsService
  ) {
    this.useMemory = useMemory;
    this.menuService = menuService;
    this.branchesService = branchesService;
    this.deliveryService = deliveryService;
    this.offersService = offersService;
    this.settingsService = settingsService;
  }

  /**
   * Deterministic, server-authoritative price calculation for an order context.
   */
  async calculateOrderPricing(context: PricingContext): Promise<PricingResult> {
    const { tenantId, branchId, orderType, items, couponCode, promotionId, delivery } = context;

    // 1. Verify Branch Ownership and Active State
    const branch = await this.branchesService.getBranchById(tenantId, branchId);
    if (!branch.is_active) {
      throw new ProductUnavailableError(`Branch '${branchId}' is currently inactive`);
    }

    // 2. Validate Items Array
    if (!Array.isArray(items) || items.length === 0) {
      throw new InvalidQuantityError('Order must contain at least one item');
    }

    const lineItems: PricingLineItem[] = [];

    // 3. Resolve Product Prices and Line Totals
    for (const item of items) {
      // Validate Quantity strictly (Integer, >= 1, <= 999, reject NaN/Infinity/decimals)
      const qty = item.quantity;
      if (
        typeof qty !== 'number' ||
        isNaN(qty) ||
        !isFinite(qty) ||
        !Number.isInteger(qty) ||
        qty < 1 ||
        qty > 999
      ) {
        throw new InvalidQuantityError(
          `Invalid quantity '${qty}' for product '${item.product_id}'. Must be a positive integer between 1 and 999.`
        );
      }

      // Load Authoritative Product
      const product = await this.menuService.getProductById(tenantId, item.product_id);
      if (!product.is_available) {
        throw new ProductUnavailableError(
          `Product '${product.name}' (${item.product_id}) is currently unavailable`
        );
      }

      const authoritativeUnitPrice = Number(product.price) || 0;

      // Resolve Addons / Modifiers if provided
      const resolvedAddons: PricingLineAddon[] = [];
      let addonsUnitSum = 0;

      if (Array.isArray(item.addon_ids) && item.addon_ids.length > 0) {
        for (const addonId of item.addon_ids) {
          const addon = await this.resolveAddon(tenantId, item.product_id, addonId);
          resolvedAddons.push(addon);
          addonsUnitSum = addMoney(addonsUnitSum, addon.price);
        }
      }

      const singleItemPrice = addMoney(authoritativeUnitPrice, addonsUnitSum);
      const lineSubtotal = multiplyMoney(singleItemPrice, qty);

      lineItems.push({
        product_id: product.id,
        name: product.name,
        quantity: qty,
        unit_price: authoritativeUnitPrice,
        addons: resolvedAddons,
        addons_total: addonsUnitSum,
        line_subtotal: lineSubtotal,
        discount: 0,
        line_total: lineSubtotal,
      });
    }

    // 4. Calculate Subtotal
    const subtotal = lineItems.reduce((acc, line) => addMoney(acc, line.line_subtotal), 0);

    // 5. Process Discounts (Promotions / Coupons)
    const appliedDiscounts: AppliedPromotion[] = [];
    let discountTotal = 0;
    let freeDeliveryGranted = false;

    if (couponCode) {
      const coupon = await this.resolveCoupon(tenantId, couponCode);
      if (coupon) {
        // Validate minimum order for coupon
        if (coupon.min_order && subtotal < coupon.min_order) {
          throw new MinimumOrderError(
            `Coupon '${couponCode}' requires a minimum subtotal of ${coupon.min_order} EGP. Current subtotal is ${subtotal} EGP.`
          );
        }

        let discAmt = 0;
        if (coupon.type === 'percentage') {
          discAmt = percentageMoney(subtotal, coupon.discount);
          if (coupon.max_discount && discAmt > coupon.max_discount) {
            discAmt = coupon.max_discount;
          }
        } else if (coupon.type === 'fixed') {
          discAmt = Math.min(coupon.discount, subtotal);
        } else if (coupon.type === 'free_delivery') {
          freeDeliveryGranted = true;
        }

        discAmt = roundMoney(discAmt);
        if (discAmt > 0 || coupon.type === 'free_delivery') {
          appliedDiscounts.push({
            id: coupon.id,
            name: `كوبون (${coupon.code})`,
            code: coupon.code,
            type: coupon.type,
            value: coupon.discount,
            discount_amount: discAmt,
          });
          discountTotal = addMoney(discountTotal, discAmt);
        }
      }
    }

    if (promotionId) {
      const promo = await this.resolvePromotion(tenantId, promotionId);
      if (promo) {
        // Validate minimum order for promotion
        if (promo.min_order && subtotal < promo.min_order) {
          throw new MinimumOrderError(
            `Promotion '${promo.name}' requires a minimum subtotal of ${promo.min_order} EGP. Current subtotal is ${subtotal} EGP.`
          );
        }

        let discAmt = 0;
        if (promo.type === 'percentage') {
          discAmt = percentageMoney(subtotal, promo.value);
          if (promo.max_discount && discAmt > promo.max_discount) {
            discAmt = promo.max_discount;
          }
        } else if (promo.type === 'fixed') {
          discAmt = Math.min(promo.value, subtotal);
        } else if (promo.type === 'free_delivery') {
          freeDeliveryGranted = true;
        }

        discAmt = roundMoney(discAmt);
        if (discAmt > 0 || promo.type === 'free_delivery') {
          appliedDiscounts.push({
            id: promo.id,
            name: promo.name,
            type: promo.type,
            value: promo.value,
            discount_amount: discAmt,
          });
          discountTotal = addMoney(discountTotal, discAmt);
        }
      }
    }

    // Ensure discount never exceeds subtotal
    discountTotal = Math.min(discountTotal, subtotal);
    const discountedSubtotal = clampNonNegative(subtractMoney(subtotal, discountTotal));

    // 6. Resolve Delivery Fee
    let deliveryFee = 0;
    if (orderType === 'delivery') {
      if (delivery?.zone_id) {
        const zoneResult = await this.deliveryService.checkDeliveryZone(
          tenantId,
          delivery.zone_id,
          branchId
        );
        deliveryFee = freeDeliveryGranted ? 0 : zoneResult.delivery_fee;
      }
    }

    // 7. Resolve Tax & Restaurant Settings
    const settings = await this.settingsService.getPublicSettings(tenantId);
    const taxRate = Number(settings.tax_rate) || 0;
    const taxIncluded = Boolean(settings.tax_included);
    let taxAmount = 0;

    if (taxRate > 0) {
      if (taxIncluded) {
        // Tax is already built into the product price
        taxAmount = roundMoney(
          discountedSubtotal - discountedSubtotal / (1 + taxRate / 100)
        );
      } else {
        // Tax is added on top of taxable discounted subtotal
        taxAmount = percentageMoney(discountedSubtotal, taxRate);
      }
    }

    // 8. Calculate Final Grand Total
    let grandTotal = 0;
    if (taxIncluded) {
      grandTotal = clampNonNegative(addMoney(discountedSubtotal, deliveryFee));
    } else {
      grandTotal = clampNonNegative(addMoney(discountedSubtotal, deliveryFee, taxAmount));
    }

    return {
      tenant_id: tenantId,
      branch_id: branchId,
      order_type: orderType as OrderType,
      currency: settings.currency || 'EGP',
      items: lineItems,
      subtotal: subtotal,
      discounts: appliedDiscounts,
      discount_total: discountTotal,
      delivery_fee: deliveryFee,
      tax_rate: taxRate,
      tax_included: taxIncluded,
      tax_amount: taxAmount,
      grand_total: grandTotal,
      calculated_at: new Date().toISOString(),
    };
  }

  /**
   * Authoritative lookup of an addon/modifier.
   */
  private async resolveAddon(
    tenantId: string,
    productId: string,
    addonId: string
  ): Promise<PricingLineAddon> {
    if (this.useMemory) {
      const addon = inMemoryAddons.get(addonId);
      if (addon && addon.tenant_id === tenantId) {
        return {
          id: addon.id,
          name: addon.name || 'إضافة',
          price: Number(addon.price) || 0,
        };
      }
    } else {
      try {
        const db = getFirestoreDb();
        const doc = await db.collection('addons').doc(addonId).get();
        if (doc.exists) {
          const data = doc.data();
          if (data?.tenant_id === tenantId) {
            return {
              id: doc.id,
              name: data.name || 'إضافة',
              price: Number(data.price) || 0,
            };
          }
        }
      } catch (_) {}
    }

    throw new ProductUnavailableError(
      `Addon '${addonId}' not found or not available for tenant '${tenantId}'`
    );
  }

  /**
   * Authoritative lookup and validation of a coupon.
   */
  private async resolveCoupon(tenantId: string, code: string): Promise<any> {
    const cleanCode = code.trim().toUpperCase();
    let coupon: any = null;

    if (this.useMemory) {
      coupon = Array.from(inMemoryCoupons.values()).find(
        (c) => c.tenant_id === tenantId && c.code?.toUpperCase() === cleanCode
      );
    } else {
      try {
        const db = getFirestoreDb();
        const snap = await db
          .collection('coupons')
          .where('tenant_id', '==', tenantId)
          .where('code', '==', cleanCode)
          .limit(1)
          .get();

        if (!snap.empty) {
          const doc = snap.docs[0];
          coupon = { id: doc.id, ...doc.data() };
        }
      } catch (_) {}
    }

    if (!coupon) {
      throw new PromotionInvalidError(`Coupon code '${code}' is invalid or does not exist`);
    }

    // Verify Active
    if (coupon.is_active === false || coupon.isActive === false) {
      throw new PromotionInvalidError(`Coupon code '${code}' is currently inactive`);
    }

    // Verify Expiry
    const now = new Date();
    const expiry = coupon.expiry_date || coupon.expiryDate;
    if (expiry) {
      const expDate = new Date(expiry);
      if (!isNaN(expDate.getTime()) && now > expDate) {
        throw new PromotionExpiredError(`Coupon code '${code}' has expired`);
      }
    }

    // Verify Usage Limit
    if (typeof coupon.usage_limit === 'number' && coupon.usage_limit > 0) {
      const usage = coupon.usage_count || 0;
      if (usage >= coupon.usage_limit) {
        throw new PromotionInvalidError(`Coupon code '${code}' usage limit has been exceeded`);
      }
    }

    return {
      id: coupon.id,
      code: coupon.code,
      type: coupon.type || 'percentage',
      discount: Number(coupon.discount || coupon.value) || 0,
      min_order: Number(coupon.min_order || coupon.minOrder) || 0,
      max_discount: coupon.max_discount !== undefined ? Number(coupon.max_discount) : null,
    };
  }

  /**
   * Authoritative lookup of a promotion by ID.
   */
  private async resolvePromotion(tenantId: string, promotionId: string): Promise<any> {
    let promo: any = null;

    if (this.useMemory) {
      // In memory lookup from offers service store
      const allOffers = await this.offersService.getOffers(tenantId);
      promo = allOffers.find((o) => o.id === promotionId);
    } else {
      try {
        const db = getFirestoreDb();
        const doc = await db.collection('promotions').doc(promotionId).get();
        if (doc.exists) {
          const data = doc.data();
          if (data?.tenant_id === tenantId) {
            promo = { id: doc.id, ...data };
          }
        }
      } catch (_) {}
    }

    if (!promo) {
      throw new PromotionInvalidError(`Promotion '${promotionId}' not found or inactive`);
    }

    return promo;
  }

  // Test helpers
  setMemoryCoupon(id: string, data: any) {
    inMemoryCoupons.set(id, { id, ...data });
  }

  setMemoryAddon(id: string, data: any) {
    inMemoryAddons.set(id, { id, ...data });
  }

  clearMemory() {
    inMemoryCoupons.clear();
    inMemoryAddons.clear();
  }
}

export const defaultPricingEngine = new PricingEngine();
