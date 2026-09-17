'use server';

import { RmsApiClient } from '../../../server/src/integration/index.js';
import crypto from 'crypto';

const rms = new RmsApiClient({
  baseUrl: process.env.RMS_API_URL || 'https://api.your-rms.com/api/v1',
  apiKey: process.env.RMS_API_KEY!,
});

export async function calculateCartTotal(cart: {
  branchId: string;
  orderType: 'delivery' | 'takeaway' | 'dine_in';
  items: Array<{ productId: string; quantity: number; addons?: string[] }>;
  couponCode?: string;
}) {
  const result = await rms.previewPricing({
    branch_id: cart.branchId,
    order_type: cart.orderType,
    items: cart.items.map((i) => ({
      product_id: i.productId,
      quantity: i.quantity,
      addon_ids: i.addons,
    })),
    coupon_code: cart.couponCode,
  });

  return result.pricing;
}

export async function submitOrder(cart: any, customer: { name: string; phone: string }) {
  const idempotencyKey = crypto.randomUUID();
  const order = await rms.createOrder(
    {
      branch_id: cart.branchId,
      order_type: cart.orderType,
      items: cart.items.map((i: any) => ({
        product_id: i.productId,
        quantity: i.quantity,
        addon_ids: i.addons,
      })),
      coupon_code: cart.couponCode,
      customer,
      payment_method: 'card',
    },
    idempotencyKey
  );

  return order;
}
