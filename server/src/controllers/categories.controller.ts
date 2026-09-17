import { Response, NextFunction } from 'express';
import { defaultMenuService, MenuService } from '../services/menu.service.js';
import { AuthenticatedRequest } from '../types/api.types.js';
import { sendSuccess } from '../utils/response.js';

export function createCategoriesController(menuService: MenuService = defaultMenuService) {
  return async (req: AuthenticatedRequest, res: Response, next: NextFunction): Promise<void> => {
    try {
      const tenantId = req.apiClient!.tenantId;
      const categories = await menuService.getCategories(tenantId);
      sendSuccess(res, categories);
    } catch (error) {
      next(error);
    }
  };
}

export const getCategories = createCategoriesController();
