import { Response, NextFunction } from 'express';
import { AuthenticatedRequest } from '../types/api.types.js';
import { ApiPermission, hasPermissionMatch } from '../types/permissions.types.js';
import { ForbiddenError, UnauthorizedError } from '../utils/errors.js';

export function requirePermission(requiredPermission: ApiPermission | string) {
  return (req: AuthenticatedRequest, res: Response, next: NextFunction): void => {
    if (!req.apiClient) {
      return next(new UnauthorizedError('Authentication required before checking permissions'));
    }

    const clientPerms = req.apiClient.permissions || [];
    const hasAccess = hasPermissionMatch(clientPerms, requiredPermission);

    if (!hasAccess) {
      return next(
        new ForbiddenError(
          `Permission denied: Missing required permission '${requiredPermission}'`
        )
      );
    }

    next();
  };
}

export function requireAnyPermission(permissions: (ApiPermission | string)[]) {
  return (req: AuthenticatedRequest, res: Response, next: NextFunction): void => {
    if (!req.apiClient) {
      return next(new UnauthorizedError('Authentication required before checking permissions'));
    }

    const clientPerms = req.apiClient.permissions || [];
    const hasAny = permissions.some((p) => hasPermissionMatch(clientPerms, p));
    if (!hasAny) {
      return next(
        new ForbiddenError(
          `Permission denied: Requires at least one of permissions: [${permissions.join(', ')}]`
        )
      );
    }

    next();
  };
}

export function requireAllPermissions(permissions: (ApiPermission | string)[]) {
  return (req: AuthenticatedRequest, res: Response, next: NextFunction): void => {
    if (!req.apiClient) {
      return next(new UnauthorizedError('Authentication required before checking permissions'));
    }

    const clientPerms = req.apiClient.permissions || [];
    const missing = permissions.filter((p) => !hasPermissionMatch(clientPerms, p));
    if (missing.length > 0) {
      return next(
        new ForbiddenError(
          `Permission denied: Missing required permissions: [${missing.join(', ')}]`
        )
      );
    }

    next();
  };
}
