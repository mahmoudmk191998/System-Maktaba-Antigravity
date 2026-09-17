import { Router } from 'express';
import { previewPricing } from '../../controllers/pricing.controller.js';
import { authenticateApiKey } from '../../middleware/auth.middleware.js';
import { requireBranchAccess } from '../../middleware/branch.middleware.js';
import { requirePermission } from '../../middleware/permission.middleware.js';
import { validateRequest } from '../../middleware/validator.middleware.js';
import { pricingPreviewSchema } from '../../validators/pricing.validator.js';

export const pricingRouter = Router();

// POST /pricing/preview
pricingRouter.post(
  '/pricing/preview',
  authenticateApiKey,
  requirePermission('menu:read'),
  requireBranchAccess('branch_id'),
  validateRequest({ body: pricingPreviewSchema }),
  previewPricing
);
