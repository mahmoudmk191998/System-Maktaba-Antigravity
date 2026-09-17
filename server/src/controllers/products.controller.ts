import { Response, NextFunction } from 'express';
import { defaultInventoryService, InventoryService } from '../services/inventory.service.js';
import { defaultMenuService, MenuService } from '../services/menu.service.js';
import { AuthenticatedRequest } from '../types/api.types.js';
import { sendSuccess } from '../utils/response.js';

export function createProductsController(
  menuService: MenuService = defaultMenuService,
  inventoryService: InventoryService = defaultInventoryService
) {
  return {
    getProducts: async (req: AuthenticatedRequest, res: Response, next: NextFunction): Promise<void> => {
      try {
        const tenantId = req.apiClient!.tenantId;
        const { category_id, search, available_only, limit, offset } = req.query as any;

        const products = await menuService.getProducts(tenantId, {
          category_id,
          search,
          available_only,
          limit,
          offset,
        });

        sendSuccess(res, products);
      } catch (error) {
        next(error);
      }
    },

    getProductById: async (req: AuthenticatedRequest, res: Response, next: NextFunction): Promise<void> => {
      try {
        const tenantId = req.apiClient!.tenantId;
        const productId = String(req.params.id);

        const product = await menuService.getProductById(tenantId, productId);
        sendSuccess(res, product);
      } catch (error) {
        next(error);
      }
    },

    getProductAvailability: async (req: AuthenticatedRequest, res: Response, next: NextFunction): Promise<void> => {
      try {
        const tenantId = req.apiClient!.tenantId;
        const productId = String(req.params.id);
        const branchId = (req.query.branch_id as string) || req.header('X-Branch-ID');

        const availability = await inventoryService.checkProductAvailability(tenantId, productId, branchId);
        sendSuccess(res, availability);
      } catch (error) {
        next(error);
      }
    },
  };
}

export const { getProducts, getProductById, getProductAvailability } = createProductsController();
