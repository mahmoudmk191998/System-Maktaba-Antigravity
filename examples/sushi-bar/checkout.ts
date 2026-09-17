import crypto from 'crypto';
import { rmsClient } from './rms-client.js';
import { CreateOrderInput, PricingPreviewInput } from '../../server/src/integration/index.js';

export async function processCustomerCheckout(
  customerCart: {
    branchId: string;
    items: Array<{ productId: string; quantity: number; addonIds?: string[] }>;
    deliveryZoneId?: string;
    couponCode?: string;
    customerInfo: { name: string; phone: string; address: string };
  }
) {
  // Step 1: Request authoritative server pricing preview
  const previewInput: PricingPreviewInput = {
    branch_id: customerCart.branchId,
    order_type: customerCart.deliveryZoneId ? 'delivery' : 'takeaway',
    delivery_zone_id: customerCart.deliveryZoneId,
    coupon_code: customerCart.couponCode,
    items: customerCart.items.map((i) => ({
      product_id: i.productId,
      quantity: i.quantity,
      addon_ids: i.addonIds,
    })),
  };

  const pricing = await rmsClient.previewPricing(previewInput);
  console.log(`Server Authoritative Grand Total: ${pricing.grand_total} ${pricing.currency}`);

  // Step 2: Create Order with Idempotency Key
  const orderInput: CreateOrderInput = {
    branch_id: customerCart.branchId,
    order_type: customerCart.deliveryZoneId ? 'delivery' : 'takeaway',
    delivery: customerCart.deliveryZoneId
      ? { zone_id: customerCart.deliveryZoneId, address: customerCart.customerInfo.address }
      : undefined,
    customer: {
      name: customerCart.customerInfo.name,
      phone: customerCart.customerInfo.phone,
      address: customerCart.customerInfo.address,
    },
    coupon_code: customerCart.couponCode,
    payment_method: 'cash',
    items: customerCart.items.map((i) => ({
      product_id: i.productId,
      quantity: i.quantity,
      addon_ids: i.addonIds,
    })),
  };

  // Generate unique idempotency key for this checkout attempt
  const idempotencyKey = `idem_${crypto.randomUUID()}`;

  const orderResult = await rmsClient.createOrder(orderInput, idempotencyKey);
  console.log(`Order Created Successfully: ${orderResult.order_number} (ID: ${orderResult.order_id})`);

  return orderResult;
}
