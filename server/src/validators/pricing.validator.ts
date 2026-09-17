import { z } from 'zod';

export const pricingItemSchema = z
  .object({
    product_id: z.string().trim().min(1, 'product_id is required'),
    quantity: z
      .number({ invalid_type_error: 'quantity must be a number' })
      .int('quantity must be an integer')
      .min(1, 'quantity must be at least 1')
      .max(999, 'quantity cannot exceed 999'),
    addon_ids: z.array(z.string().trim().min(1)).optional(),
    notes: z.string().trim().optional(),
  })
  .strict();

export const deliveryPricingSchema = z
  .object({
    zone_id: z.string().trim().min(1).optional(),
    address: z.string().trim().optional(),
  })
  .strict();

export const pricingPreviewSchema = z
  .object({
    tenant_id: z.string().trim().optional(),
    branch_id: z.string().trim().min(1, 'branch_id is required'),
    order_type: z.enum(['dine_in', 'takeaway', 'delivery', 'curbside'], {
      errorMap: () => ({
        message: "order_type must be one of: 'dine_in', 'takeaway', 'delivery', 'curbside'",
      }),
    }),
    items: z
      .array(pricingItemSchema)
      .min(1, 'Order must contain at least one item'),
    coupon_code: z.string().trim().optional(),
    promotion_id: z.string().trim().optional(),
    delivery: deliveryPricingSchema.optional(),
  })
  .strict();

export type PricingPreviewBody = z.infer<typeof pricingPreviewSchema>;
