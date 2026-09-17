import { Response, NextFunction } from 'express';
import { defaultPricingEngine, PricingEngine } from '../services/pricing/pricing.engine.js';
import { AuthenticatedRequest } from '../types/api.types.js';
import { sendSuccess } from '../utils/response.js';

export function createPricingController(pricingEngine: PricingEngine = defaultPricingEngine) {
  return {
    previewPricing: async (
      req: AuthenticatedRequest,
      res: Response,
      next: NextFunction
    ): Promise<void> => {
      try {
        const tenantId = req.apiClient!.tenantId;
        const { branch_id, order_type, items, coupon_code, promotion_id, delivery } = req.body;

        const result = await pricingEngine.calculateOrderPricing({
          tenantId,
          branchId: branch_id,
          orderType: order_type,
          items,
          couponCode: coupon_code,
          promotionId: promotion_id,
          delivery,
        });

        sendSuccess(res, result);
      } catch (error) {
        next(error);
      }
    },
  };
}

export const { previewPricing } = createPricingController();
