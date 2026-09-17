import { Router } from 'express';
import { getObservabilityMetrics } from '../../controllers/adminObservability.controller.js';
import { authenticateApiKey } from '../../middleware/auth.middleware.js';
import { requirePermission } from '../../middleware/permission.middleware.js';

export const adminObservabilityRouter = Router();

// GET /admin/observability (Admin Observability Dashboard & Metrics)
adminObservabilityRouter.get(
  '/admin/observability',
  authenticateApiKey,
  requirePermission('api_clients:manage'),
  getObservabilityMetrics
);
