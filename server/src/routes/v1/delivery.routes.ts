import { Router } from 'express';
import { checkDeliveryZone, getDeliveryZones } from '../../controllers/delivery.controller.js';
import { authenticateApiKey } from '../../middleware/auth.middleware.js';
import { requireBranchAccess } from '../../middleware/branch.middleware.js';
import { requirePermission } from '../../middleware/permission.middleware.js';
import { validateRequest } from '../../middleware/validator.middleware.js';
import {
  deliveryZoneCheckBodySchema,
  deliveryZonesQuerySchema,
} from '../../validators/delivery.validator.js';

export const deliveryRouter = Router();

// GET /delivery-zones
deliveryRouter.get(
  '/delivery-zones',
  authenticateApiKey,
  requirePermission('delivery:read'),
  requireBranchAccess('branch_id'),
  validateRequest({ query: deliveryZonesQuerySchema }),
  getDeliveryZones
);

// POST /delivery-zones/check
deliveryRouter.post(
  '/delivery-zones/check',
  authenticateApiKey,
  requirePermission('delivery:read'),
  requireBranchAccess('branch_id'),
  validateRequest({ body: deliveryZoneCheckBodySchema }),
  checkDeliveryZone
);
