import { Router } from 'express';
import {
  onboardIntegration,
  listIntegrations,
  getIntegrationById,
  updateIntegration,
  revokeIntegration,
  rotateSecret,
  getWebhookHealth,
  getIntegrationMetrics,
  getDeadLetters,
} from '../../controllers/adminIntegrations.controller.js';
import { authenticateApiKey } from '../../middleware/auth.middleware.js';
import { requirePermission } from '../../middleware/permission.middleware.js';
import { validateRequest } from '../../middleware/validator.middleware.js';
import {
  onboardIntegrationSchema,
  updateIntegrationSchema,
} from '../../validators/integration.validator.js';

export const adminIntegrationsRouter = Router();

// POST /admin/integrations (Onboard new integration)
adminIntegrationsRouter.post(
  '/admin/integrations',
  authenticateApiKey,
  requirePermission('api_clients:manage'),
  validateRequest({ body: onboardIntegrationSchema }),
  onboardIntegration
);

// GET /admin/integrations (List integrations)
adminIntegrationsRouter.get(
  '/admin/integrations',
  authenticateApiKey,
  requirePermission('api_clients:manage'),
  listIntegrations
);

// GET /admin/integrations/:id (Get single integration)
adminIntegrationsRouter.get(
  '/admin/integrations/:id',
  authenticateApiKey,
  requirePermission('api_clients:manage'),
  getIntegrationById
);

// PATCH /admin/integrations/:id (Update integration)
adminIntegrationsRouter.patch(
  '/admin/integrations/:id',
  authenticateApiKey,
  requirePermission('api_clients:manage'),
  validateRequest({ body: updateIntegrationSchema }),
  updateIntegration
);

// DELETE /admin/integrations/:id (Revoke integration)
adminIntegrationsRouter.delete(
  '/admin/integrations/:id',
  authenticateApiKey,
  requirePermission('api_clients:manage'),
  revokeIntegration
);

// POST /admin/integrations/:id/rotate-secret (Rotate integration credentials)
adminIntegrationsRouter.post(
  '/admin/integrations/:id/rotate-secret',
  authenticateApiKey,
  requirePermission('api_clients:manage'),
  rotateSecret
);

// GET /admin/integrations/:id/webhook-health (Webhook delivery observability & metrics)
adminIntegrationsRouter.get(
  '/admin/integrations/:id/webhook-health',
  authenticateApiKey,
  requirePermission('api_clients:manage'),
  getWebhookHealth
);

// GET /admin/integrations/:id/metrics (Detailed integration-level metrics & p95 latency)
adminIntegrationsRouter.get(
  '/admin/integrations/:id/metrics',
  authenticateApiKey,
  requirePermission('api_clients:manage'),
  getIntegrationMetrics
);

// GET /admin/integrations/:id/dead-letters (Inspect failed webhook events)
adminIntegrationsRouter.get(
  '/admin/integrations/:id/dead-letters',
  authenticateApiKey,
  requirePermission('api_clients:manage'),
  getDeadLetters
);
