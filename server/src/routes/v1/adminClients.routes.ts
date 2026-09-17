import { Router } from 'express';
import {
  createClient,
  disableClient,
  enableClient,
  getAuditLogs,
  getClientById,
  getUsageAnalytics,
  listClients,
  revokeClient,
  rotateSecret,
  updateClient,
} from '../../controllers/adminClients.controller.js';
import { authenticateApiKey } from '../../middleware/auth.middleware.js';
import { requirePermission } from '../../middleware/permission.middleware.js';
import { validateRequest } from '../../middleware/validator.middleware.js';
import {
  createAdminClientSchema,
  updateAdminClientSchema,
} from '../../validators/adminClient.validator.js';

export const adminClientsRouter = Router();

// POST /admin/api-clients
adminClientsRouter.post(
  '/admin/api-clients',
  authenticateApiKey,
  requirePermission('api_clients:manage'),
  validateRequest({ body: createAdminClientSchema }),
  createClient
);

// GET /admin/api-clients
adminClientsRouter.get(
  '/admin/api-clients',
  authenticateApiKey,
  requirePermission('api_clients:manage'),
  listClients
);

// GET /admin/api-clients/:id
adminClientsRouter.get(
  '/admin/api-clients/:id',
  authenticateApiKey,
  requirePermission('api_clients:manage'),
  getClientById
);

// PATCH /admin/api-clients/:id
adminClientsRouter.patch(
  '/admin/api-clients/:id',
  authenticateApiKey,
  requirePermission('api_clients:manage'),
  validateRequest({ body: updateAdminClientSchema }),
  updateClient
);

// POST /admin/api-clients/:id/enable
adminClientsRouter.post(
  '/admin/api-clients/:id/enable',
  authenticateApiKey,
  requirePermission('api_clients:manage'),
  enableClient
);

// POST /admin/api-clients/:id/disable
adminClientsRouter.post(
  '/admin/api-clients/:id/disable',
  authenticateApiKey,
  requirePermission('api_clients:manage'),
  disableClient
);

// POST /admin/api-clients/:id/revoke
adminClientsRouter.post(
  '/admin/api-clients/:id/revoke',
  authenticateApiKey,
  requirePermission('api_clients:manage'),
  revokeClient
);

// POST /admin/api-clients/:id/rotate-secret
adminClientsRouter.post(
  '/admin/api-clients/:id/rotate-secret',
  authenticateApiKey,
  requirePermission('api_clients:manage'),
  rotateSecret
);

// GET /admin/api-clients/:id/audit-logs
adminClientsRouter.get(
  '/admin/api-clients/:id/audit-logs',
  authenticateApiKey,
  requirePermission('api_clients:manage'),
  getAuditLogs
);

// GET /admin/api-clients/:id/usage
adminClientsRouter.get(
  '/admin/api-clients/:id/usage',
  authenticateApiKey,
  requirePermission('api_clients:manage'),
  getUsageAnalytics
);

