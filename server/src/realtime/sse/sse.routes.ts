import { Router, Response } from 'express';
import { defaultSseManager, SseManager } from './sseManager.js';
import { authenticateApiKey } from '../../middleware/auth.middleware.js';
import { AuthenticatedRequest } from '../../types/api.types.js';
import { ForbiddenError } from '../../utils/errors.js';

export function createSseRoutes(sseManager: SseManager = defaultSseManager): Router {
  const router = Router();

  router.get(
    '/realtime/events',
    authenticateApiKey,
    async (req: AuthenticatedRequest, res: Response, next) => {
      try {
        const client = req.apiClient!;
        const typesParam = req.query.types as string | undefined;
        const branchIdParam = (req.query.branch_id || req.header('X-Branch-ID')) as string | undefined;
        const lastEventId = (req.header('Last-Event-ID') || req.query.last_event_id) as string | undefined;

        // Branch restriction check
        if (branchIdParam && client.allowedBranchIds.length > 0) {
          if (!client.allowedBranchIds.includes(branchIdParam)) {
            throw new ForbiddenError(
              `Branch access denied: Client is not authorized to subscribe to branch '${branchIdParam}'`
            );
          }
        }

        const requestedTypes = typesParam
          ? typesParam.split(',').map((t) => t.trim()).filter(Boolean)
          : undefined;

        await sseManager.handleConnection(
          {
            tenantId: client.tenantId,
            integrationId: client.clientId,
            clientId: client.clientId,
            allowedBranchIds: client.allowedBranchIds || [],
            permissions: client.permissions || [],
            types: requestedTypes,
            branchId: branchIdParam,
            requestId: req.header('X-Request-ID') || 'req_sse',
          },
          res,
          lastEventId
        );
      } catch (error) {
        next(error);
      }
    }
  );

  return router;
}

export const sseRouter = createSseRoutes();
