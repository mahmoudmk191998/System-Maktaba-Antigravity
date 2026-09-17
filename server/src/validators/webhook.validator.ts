import { z } from 'zod';
import { ALL_WEBHOOK_EVENT_TYPES } from '../types/webhook.types.js';
import { validateSafeWebhookUrl } from '../utils/ssrf.js';

export const createWebhookEndpointSchema = z
  .object({
    tenant_id: z.string().trim().optional(),
    url: z
      .string()
      .trim()
      .url('url must be a valid URL')
      .superRefine((val, ctx) => {
        const check = validateSafeWebhookUrl(val);
        if (!check.isValid) {
          ctx.addIssue({
            code: z.ZodIssueCode.custom,
            message: check.error || 'Invalid or dangerous webhook destination URL',
          });
        }
      }),
    events: z
      .array(
        z.enum(ALL_WEBHOOK_EVENT_TYPES as [string, ...string[]], {
          errorMap: () => ({
            message: `events must be one or more of: ${ALL_WEBHOOK_EVENT_TYPES.join(', ')}`,
          }),
        })
      )
      .min(1, 'At least one event type must be specified'),
    active: z.boolean().optional(),
  })
  .strict();

export type CreateWebhookEndpointBody = z.infer<typeof createWebhookEndpointSchema>;
