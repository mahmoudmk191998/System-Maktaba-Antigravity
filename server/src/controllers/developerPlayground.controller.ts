import { Response, NextFunction } from 'express';
import {
  defaultPlaygroundService,
  PlaygroundService,
} from '../services/playground.service.js';
import { AuthenticatedRequest } from '../types/api.types.js';
import { sendSuccess } from '../utils/response.js';

export function createDeveloperPlaygroundController(
  playgroundService: PlaygroundService = defaultPlaygroundService
) {
  return {
    getIntegrations: async (
      req: AuthenticatedRequest,
      res: Response,
      next: NextFunction
    ): Promise<void> => {
      try {
        const tenantId = req.apiClient!.tenantId;
        const integrations = await playgroundService.getTenantIntegrations(tenantId);
        sendSuccess(res, integrations, 200);
      } catch (error) {
        next(error);
      }
    },

    getOpenApiSpec: async (
      req: AuthenticatedRequest,
      res: Response,
      next: NextFunction
    ): Promise<void> => {
      try {
        const version = (req.query.version as 'v1' | 'v2') || 'v1';
        const spec = await playgroundService.getOpenApiSpec(version);
        sendSuccess(res, spec, 200);
      } catch (error) {
        next(error);
      }
    },

    executeRequest: async (
      req: AuthenticatedRequest,
      res: Response,
      next: NextFunction
    ): Promise<void> => {
      try {
        const tenantId = req.apiClient!.tenantId;
        const callerClientId = req.apiClient!.clientId;

        const result = await playgroundService.executeRequest({
          tenant_id: tenantId,
          caller_client_id: callerClientId,
          ...req.body,
        });

        sendSuccess(res, result, 200);
      } catch (error) {
        next(error);
      }
    },
  };
}

export const {
  getIntegrations,
  getOpenApiSpec,
  executeRequest,
} = createDeveloperPlaygroundController();
