import { Router } from 'express';
import { getCategories } from '../../controllers/categories.controller.js';
import { authenticateApiKey } from '../../middleware/auth.middleware.js';
import { requirePermission } from '../../middleware/permission.middleware.js';

export const categoriesRouter = Router();

categoriesRouter.get(
  '/categories',
  authenticateApiKey,
  requirePermission('menu:read'),
  getCategories
);
