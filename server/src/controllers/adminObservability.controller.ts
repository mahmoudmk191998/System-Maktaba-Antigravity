import { Response, NextFunction } from 'express';
import {
  defaultObservabilityService,
  ObservabilityService,
} from '../services/observability.service.js';
import { AuthenticatedRequest } from '../types/api.types.js';
import { sendSuccess } from '../utils/response.js';

export function createAdminObservabilityController(
  observabilityService: ObservabilityService = defaultObservabilityService
) {
  return {
    getObservabilityMetrics: async (
      req: AuthenticatedRequest,
      res: Response,
      next: NextFunction
    ): Promise<void> => {
      try {
        const tenantId = req.apiClient?.tenantId;
        const report = await observabilityService.getObservabilityReport(tenantId);
        sendSuccess(res, report, 200);
      } catch (error) {
        next(error);
      }
    },
  };
}

export const { getObservabilityMetrics } = createAdminObservabilityController();
