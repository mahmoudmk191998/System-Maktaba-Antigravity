import { z } from 'zod';

export const menuQuerySchema = z.object({
  branch_id: z.string().trim().min(1).optional(),
});

export type MenuQuery = z.infer<typeof menuQuerySchema>;
