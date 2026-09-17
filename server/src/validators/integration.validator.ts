import { z } from 'zod';
import { INTEGRATION_TYPES } from '../types/integration.types.js';
import { API_PERMISSIONS } from '../types/permissions.types.js';
import { ALL_WEBHOOK_EVENT_TYPES } from '../types/webhook.types.js';
import { validateSafeWebhookUrl } from '../utils/ssrf.js';

export const onboardIntegrationSchema = z
  .object({
    tenant_id: z.string().trim().optional(),
    name: z
      .string()
      .trim()
      .min(2, 'Integration name must be at least 2 characters')
      .max(100, 'Integration name cannot exceed 100 characters'),
    type: z.enum(INTEGRATION_TYPES as unknown as [string, ...string[]], {
      errorMap: () => ({
        message: `type must be one of: ${INTEGRATION_TYPES.join(', ')}`,
      }),
    }),
    description: z.string().trim().max(500).optional(),
    allowed_branch_ids: z.array(z.string().trim()).optional().default([]),
    allowed_origins: z.array(z.string().trim()).optional().default([]),
    permissions: z
      .array(
        z.enum(API_PERMISSIONS as unknown as [string, ...string[]], {
          errorMap: () => ({
            message: `permissions must be valid RMS permissions: ${API_PERMISSIONS.join(', ')}`,
          }),
        })
      )
      .min(1, 'At least one permission is required for an integration'),
    rate_limit_tier: z.enum(['free', 'standard', 'premium']).optional().default('standard'),
    webhook_url: z
      .string()
      .trim()
      .url('webhook_url must be a valid URL')
      .superRefine((val, ctx) => {
        const check = validateSafeWebhookUrl(val);
        if (!check.isValid) {
          ctx.addIssue({
            code: z.ZodIssueCode.custom,
            message: check.error || 'Invalid or dangerous webhook destination URL',
          });
        }
      })
      .optional(),
    webhook_events: z
      .array(
        z.enum(ALL_WEBHOOK_EVENT_TYPES as unknown as [string, ...string[]], {
          errorMap: () => ({
            message: `webhook_events must be one or more of: ${ALL_WEBHOOK_EVENT_TYPES.join(', ')}`,
          }),
        })
      )
      .optional(),
    expires_in_days: z.number().int().min(1).max(3650).optional(),
    metadata: z.record(z.any()).optional(),
  })
  .strict();

export const updateIntegrationSchema = z
  .object({
    name: z.string().trim().min(2).max(100).optional(),
    description: z.string().trim().max(500).optional(),
    type: z.enum(INTEGRATION_TYPES as unknown as [string, ...string[]]).optional(),
    allowed_branch_ids: z.array(z.string().trim()).optional(),
    allowed_origins: z.array(z.string().trim()).optional(),
    permissions: z.array(z.enum(API_PERMISSIONS as unknown as [string, ...string[]])).min(1).optional(),
    rate_limit_tier: z.enum(['free', 'standard', 'premium']).optional(),
    status: z.enum(['active', 'disabled', 'revoked']).optional(),
    metadata: z.record(z.any()).optional(),
  })
  .strict();

export type OnboardIntegrationSchema = z.infer<typeof onboardIntegrationSchema>;
export type UpdateIntegrationSchema = z.infer<typeof updateIntegrationSchema>;
