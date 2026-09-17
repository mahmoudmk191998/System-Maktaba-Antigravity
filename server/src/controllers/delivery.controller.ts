import { Response, NextFunction } from 'express';
import { defaultDeliveryService, DeliveryService } from '../services/delivery.service.js';
import { AuthenticatedRequest } from '../types/api.types.js';
import { sendSuccess } from '../utils/response.js';

export function createDeliveryController(deliveryService: DeliveryService = defaultDeliveryService) {
  return {
    getDeliveryZones: async (req: AuthenticatedRequest, res: Response, next: NextFunction): Promise<void> => {
      try {
        const tenantId = req.apiClient!.tenantId;
        const branchId = (req.query.branch_id as string) || req.header('X-Branch-ID');

        const zones = await deliveryService.getDeliveryZones(tenantId, branchId);
        sendSuccess(res, zones);
      } catch (error) {
        next(error);
      }
    },

    checkDeliveryZone: async (req: AuthenticatedRequest, res: Response, next: NextFunction): Promise<void> => {
      try {
        const tenantId = req.apiClient!.tenantId;
        const { zone_id, branch_id } = req.body;
        const resolvedBranchId = branch_id || req.header('X-Branch-ID');

        const result = await deliveryService.checkDeliveryZone(tenantId, zone_id, resolvedBranchId);
        sendSuccess(res, result);
      } catch (error) {
        next(error);
      }
    },
  };
}

export const { getDeliveryZones, checkDeliveryZone } = createDeliveryController();
