import { z } from 'zod';

export const createOrderItemSchema = z
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

export const customerSchema = z
  .object({
    customer_id: z.string().trim().optional(),
    name: z.string().trim().optional(),
    phone: z.string().trim().optional(),
    address: z.string().trim().optional(),
  })
  .strict();

export const deliverySchema = z
  .object({
    zone_id: z.string().trim().optional(),
    address_id: z.string().trim().optional(),
    address: z.string().trim().optional(),
    notes: z.string().trim().optional(),
  })
  .strict();

export const createOrderSchema = z
  .object({
    tenant_id: z.string().trim().optional(),
    branch_id: z.string().trim().min(1, 'branch_id is required'),
    order_type: z.enum(['dine_in', 'takeaway', 'delivery', 'curbside'], {
      errorMap: () => ({
        message: "order_type must be one of: 'dine_in', 'takeaway', 'delivery', 'curbside'",
      }),
    }),
    items: z
      .array(createOrderItemSchema)
      .min(1, 'Order must contain at least one item'),
    customer: customerSchema.optional(),
    delivery: deliverySchema.optional(),
    coupon_code: z.string().trim().optional(),
    promotion_id: z.string().trim().optional(),
    payment_method: z.string().trim().optional(),
    notes: z.string().trim().optional(),
    table_id: z.string().trim().optional(),
  })
  .strict();

export type CreateOrderBody = z.infer<typeof createOrderSchema>;

export const updateOrderStatusSchema = z.object({ status: z.enum(['preparing', 'ready', 'completed', 'cancelled']) }).strict();
