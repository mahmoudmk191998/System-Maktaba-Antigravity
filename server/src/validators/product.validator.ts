import { z } from 'zod';

export const productsQuerySchema = z.object({
  category_id: z.string().trim().min(1).optional(),
  search: z.string().trim().optional(),
  available_only: z
    .enum(['true', 'false'])
    .optional()
    .transform((val) => val === 'true'),
  limit: z.coerce.number().int().min(1).max(100).default(50),
  offset: z.coerce.number().int().min(0).default(0),
});

export const productIdParamSchema = z.object({
  id: z.string().trim().min(1, 'Product ID is required'),
});

export const productAvailabilityQuerySchema = z.object({
  branch_id: z.string().trim().min(1).optional(),
});

export type ProductsQuery = z.infer<typeof productsQuerySchema>;
export type ProductIdParam = z.infer<typeof productIdParamSchema>;
export type ProductAvailabilityQuery = z.infer<typeof productAvailabilityQuerySchema>;
