import { z } from 'zod';
import { API_PERMISSIONS } from '../types/permissions.types.js';

export const createAdminClientSchema = z
  .object({
    tenant_id: z.string().trim().optional(),
    name: z.string().trim().min(1, 'Client name is required'),
    description: z.string().trim().optional(),
    permissions: z
      .array(
        z.enum(API_PERMISSIONS as unknown as [string, ...string[]], {
          errorMap: () => ({
            message: `permissions must be one or more of valid API permissions: [${API_PERMISSIONS.join(', ')}]`,
          }),
        })
      )
      .min(1, 'At least one permission is required'),
    allowed_branch_ids: z.array(z.string().trim().min(1)).optional(),
    allowed_origins: z.array(z.string().trim().min(1)).optional(),
    rate_limit_tier: z.enum(['free', 'standard', 'premium']).optional(),
    expires_in_days: z.number().int().min(1).max(3650).optional(),
    expires_at: z.string().datetime().optional(),
  })
  .strict();

export const updateAdminClientSchema = z
  .object({
    tenant_id: z.string().trim().optional(),
    name: z.string().trim().min(1, 'Client name cannot be empty').optional(),
    description: z.string().trim().optional(),
    permissions: z
      .array(
        z.enum(API_PERMISSIONS as unknown as [string, ...string[]], {
          errorMap: () => ({
            message: `permissions must be one or more of valid API permissions: [${API_PERMISSIONS.join(', ')}]`,
          }),
        })
      )
      .min(1, 'permissions array cannot be empty')
      .optional(),
    allowed_branch_ids: z.array(z.string().trim().min(1)).optional(),
    allowed_origins: z.array(z.string().trim().min(1)).optional(),
    rate_limit_tier: z.enum(['free', 'standard', 'premium']).optional(),
    expires_at: z.string().datetime().nullable().optional(),
  })
  .strict();
