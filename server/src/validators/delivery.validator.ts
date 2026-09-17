import { z } from 'zod';

export const deliveryZonesQuerySchema = z.object({
  branch_id: z.string().trim().min(1).optional(),
});

export const deliveryZoneCheckBodySchema = z.object({
  branch_id: z.string().trim().min(1).optional(),
  zone_id: z.string().trim().min(1, 'zone_id is required'),
});

export type DeliveryZonesQuery = z.infer<typeof deliveryZonesQuerySchema>;
export type DeliveryZoneCheckBody = z.infer<typeof deliveryZoneCheckBodySchema>;
