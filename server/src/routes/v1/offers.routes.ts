import { Router } from 'express';
import { getOffers } from '../../controllers/offers.controller.js';
import { authenticateApiKey } from '../../middleware/auth.middleware.js';
import { requirePermission } from '../../middleware/permission.middleware.js';

export const offersRouter = Router();

offersRouter.get(
  '/offers',
  authenticateApiKey,
  requirePermission('offers:read'),
  getOffers
);
