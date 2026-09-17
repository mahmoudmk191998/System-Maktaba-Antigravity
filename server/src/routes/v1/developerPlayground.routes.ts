import { Router } from 'express';
import { z } from 'zod';
import {
  getIntegrations,
  getOpenApiSpec,
  executeRequest,
} from '../../controllers/developerPlayground.controller.js';
import { authenticateApiKey } from '../../middleware/auth.middleware.js';
import { requirePermission } from '../../middleware/permission.middleware.js';
import { validateRequest } from '../../middleware/validator.middleware.js';

export const developerPlaygroundRouter = Router();

const executePlaygroundSchema = z.object({
  integration_id: z.string().min(1, 'integration_id is required'),
  version: z.enum(['v1', 'v2']).default('v1').optional(),
  method: z.enum(['GET', 'POST', 'PATCH', 'DELETE']),
  path: z.string().min(1, 'path is required'),
  query_params: z.record(z.string()).optional(),
  headers: z.record(z.string()).optional(),
  body: z.any().optional(),
});

// GET /developer/playground/integrations (List safe integrations for authorized tenant)
developerPlaygroundRouter.get(
  '/developer/playground/integrations',
  authenticateApiKey,
  requirePermission('api_clients:manage'),
  getIntegrations
);

// GET /developer/playground/openapi (Safe OpenAPI spec)
developerPlaygroundRouter.get(
  '/developer/playground/openapi',
  authenticateApiKey,
  requirePermission('api_clients:manage'),
  getOpenApiSpec
);

// POST /developer/playground/execute (Server-side authenticated execution proxy)
developerPlaygroundRouter.post(
  '/developer/playground/execute',
  authenticateApiKey,
  requirePermission('api_clients:manage'),
  validateRequest({ body: executePlaygroundSchema }),
  executeRequest
);
