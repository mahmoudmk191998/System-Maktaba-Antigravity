import { Response, NextFunction } from 'express';
import { defaultBranchesService, BranchesService } from '../services/branches.service.js';
import { AuthenticatedRequest } from '../types/api.types.js';
import { sendSuccess } from '../utils/response.js';

export function createBranchesController(branchesService: BranchesService = defaultBranchesService) {
  return async (req: AuthenticatedRequest, res: Response, next: NextFunction): Promise<void> => {
    try {
      const tenantId = req.apiClient!.tenantId;
      const allowedBranchIds = req.apiClient!.allowedBranchIds;

      const branches = await branchesService.getBranches(tenantId, allowedBranchIds);
      sendSuccess(res, branches);
    } catch (error) {
      next(error);
    }
  };
}

export const getBranches = createBranchesController();
