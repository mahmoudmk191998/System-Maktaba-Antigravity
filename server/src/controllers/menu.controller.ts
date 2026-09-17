import { Response, NextFunction } from 'express';
import { defaultMenuService, MenuService } from '../services/menu.service.js';
import { AuthenticatedRequest } from '../types/api.types.js';
import { sendSuccess } from '../utils/response.js';

export function createMenuController(menuService: MenuService = defaultMenuService) {
  return async (req: AuthenticatedRequest, res: Response, next: NextFunction): Promise<void> => {
    try {
      const tenantId = req.apiClient!.tenantId;
      const branchId = (req.query.branch_id as string) || req.header('X-Branch-ID');

      const menu = await menuService.getFullMenu(tenantId, branchId);
      sendSuccess(res, menu);
    } catch (error) {
      next(error);
    }
  };
}

export const getMenu = createMenuController();
