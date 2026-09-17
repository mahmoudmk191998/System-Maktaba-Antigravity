import { Response, NextFunction } from 'express';
import { defaultSettingsService, SettingsService } from '../services/settings.service.js';
import { AuthenticatedRequest } from '../types/api.types.js';
import { sendSuccess } from '../utils/response.js';

export function createSettingsController(settingsService: SettingsService = defaultSettingsService) {
  return async (req: AuthenticatedRequest, res: Response, next: NextFunction): Promise<void> => {
    try {
      const tenantId = req.apiClient!.tenantId;
      const settings = await settingsService.getPublicSettings(tenantId);
      sendSuccess(res, settings);
    } catch (error) {
      next(error);
    }
  };
}

export const getSettings = createSettingsController();
