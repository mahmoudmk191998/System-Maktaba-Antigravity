import { Router } from 'express';
import { getMenu } from '../../controllers/menu.controller.js';
import { authenticateApiKey } from '../../middleware/auth.middleware.js';
import { requireBranchAccess } from '../../middleware/branch.middleware.js';
import { requirePermission } from '../../middleware/permission.middleware.js';
import { validateRequest } from '../../middleware/validator.middleware.js';
import { menuQuerySchema } from '../../validators/menu.validator.js';

export const menuRouter = Router();

menuRouter.get(
  '/menu',
  authenticateApiKey,
  requirePermission('menu:read'),
  requireBranchAccess('branch_id'),
  validateRequest({ query: menuQuerySchema }),
  getMenu
);
