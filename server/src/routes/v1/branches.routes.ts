import { Router } from 'express';
import { getBranches } from '../../controllers/branches.controller.js';
import { authenticateApiKey } from '../../middleware/auth.middleware.js';
import { requirePermission } from '../../middleware/permission.middleware.js';

export const branchesRouter = Router();

branchesRouter.get(
  '/branches',
  authenticateApiKey,
  requirePermission('branches:read'),
  getBranches
);
