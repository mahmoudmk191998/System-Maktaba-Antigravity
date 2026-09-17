import { Router } from 'express';
import { getSettings } from '../../controllers/settings.controller.js';
import { authenticateApiKey } from '../../middleware/auth.middleware.js';
import { requirePermission } from '../../middleware/permission.middleware.js';

export const settingsRouter = Router();

settingsRouter.get(
  '/settings',
  authenticateApiKey,
  requirePermission('settings:read'),
  getSettings
);
