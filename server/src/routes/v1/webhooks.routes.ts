import { Router } from 'express';
import {
  createEndpoint,
  deleteEndpoint,
  listEndpoints,
} from '../../controllers/webhooks.controller.js';
import { authenticateApiKey } from '../../middleware/auth.middleware.js';
import { requirePermission } from '../../middleware/permission.middleware.js';
import { validateRequest } from '../../middleware/validator.middleware.js';
import { createWebhookEndpointSchema } from '../../validators/webhook.validator.js';

export const webhooksRouter = Router();

// POST /webhooks
webhooksRouter.post(
  '/webhooks',
  authenticateApiKey,
  requirePermission('webhooks:manage'),
  validateRequest({ body: createWebhookEndpointSchema }),
  createEndpoint
);

// GET /webhooks
webhooksRouter.get(
  '/webhooks',
  authenticateApiKey,
  requirePermission('webhooks:manage'),
  listEndpoints
);

// DELETE /webhooks/:id
webhooksRouter.delete(
  '/webhooks/:id',
  authenticateApiKey,
  requirePermission('webhooks:manage'),
  deleteEndpoint
);
