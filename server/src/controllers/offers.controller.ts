import { Response, NextFunction } from 'express';
import { defaultOffersService, OffersService } from '../services/offers.service.js';
import { AuthenticatedRequest } from '../types/api.types.js';
import { sendSuccess } from '../utils/response.js';

export function createOffersController(offersService: OffersService = defaultOffersService) {
  return async (req: AuthenticatedRequest, res: Response, next: NextFunction): Promise<void> => {
    try {
      const tenantId = req.apiClient!.tenantId;
      const offers = await offersService.getOffers(tenantId);
      sendSuccess(res, offers);
    } catch (error) {
      next(error);
    }
  };
}

export const getOffers = createOffersController();
