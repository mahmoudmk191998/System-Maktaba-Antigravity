import { rms } from './rms-client.js';
import crypto from 'crypto';

export async function processCustomerCheckout(cart: {
  branchId: string;
  orderType: 'takeaway' | 'delivery' | 'dine_in';
  items: Array<{ productId: string; quantity: number; addons?: string[] }>;
  customer: { name: string; phone: string };
  deliveryAddress?: { street: string; city: string };
  couponCode?: string;
}) {
  // 1. Authoritative Server-side Price Preview
  const preview = await rms.previewPricing({
    branch_id: cart.branchId,
    order_type: cart.orderType,
    items: cart.items.map((i) => ({
      product_id: i.productId,
      quantity: i.quantity,
      addon_ids: i.addons,
    })),
    coupon_code: cart.couponCode,
  });

  // 2. Deterministic Order Creation with Idempotency Key
  const idempotencyKey = crypto.randomUUID();
  const order = await rms.createOrder(
    {
      branch_id: cart.branchId,
      order_type: cart.orderType,
      items: cart.items.map((i) => ({
        product_id: i.productId,
        quantity: i.quantity,
        addon_ids: i.addons,
      })),
      coupon_code: cart.couponCode,
      customer: {
        name: cart.customer.name,
        phone: cart.customer.phone,
      },
      delivery_address: cart.deliveryAddress,
      payment_method: 'card',
    },
    idempotencyKey
  );

  return {
    orderNumber: order.order_number,
    grandTotal: preview.pricing.grand_total,
    currency: preview.pricing.currency,
    status: order.status,
  };
}
