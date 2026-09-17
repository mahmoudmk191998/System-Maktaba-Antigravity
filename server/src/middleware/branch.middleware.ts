import { Response, NextFunction } from 'express';
import { AuthenticatedRequest } from '../types/api.types.js';
import { ForbiddenError, UnauthorizedError } from '../utils/errors.js';

export function requireBranchAccess(branchParamOrHeaderName: string = 'branchId') {
  return (req: AuthenticatedRequest, res: Response, next: NextFunction): void => {
    if (!req.apiClient) {
      return next(new UnauthorizedError('Authentication required before checking branch access'));
    }

    const { allowedBranchIds } = req.apiClient;

    // If allowedBranchIds is empty, client has unrestricted access to all branches in this tenant
    if (!allowedBranchIds || allowedBranchIds.length === 0) {
      return next();
    }

    // Resolve branchId from params, query, headers, or body
    const branchId =
      req.params[branchParamOrHeaderName] ||
      req.params.branchId ||
      req.params.branch_id ||
      req.query[branchParamOrHeaderName] ||
      req.query.branch_id ||
      req.query.branchId ||
      req.header('X-Branch-ID') ||
      req.body?.[branchParamOrHeaderName] ||
      req.body?.branch_id ||
      req.body?.branchId;

    if (!branchId || typeof branchId !== 'string') {
      // If no branch was specified in the request, proceed unless explicit branch is mandatory
      return next();
    }

    const isAllowed = allowedBranchIds.includes(branchId);
    if (!isAllowed) {
      return next(
        new ForbiddenError(
          `Branch access denied: Client is not authorized to access branch '${branchId}'. Allowed branches: [${allowedBranchIds.join(', ')}]`
        )
      );
    }

    next();
  };
}
