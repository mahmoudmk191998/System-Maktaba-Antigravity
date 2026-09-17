import { Response, NextFunction } from 'express';
import { defaultWebhookService, WebhookService } from '../services/webhook.service.js';
import { AuthenticatedRequest } from '../types/api.types.js';
import { sendSuccess } from '../utils/response.js';

export function createWebhooksController(webhookService: WebhookService = defaultWebhookService) {
  return {
    createEndpoint: async (
      req: AuthenticatedRequest,
      res: Response,
      next: NextFunction
    ): Promise<void> => {
      try {
        const tenantId = req.apiClient!.tenantId;
        const clientId = req.apiClient!.clientId;

        const result = await webhookService.createEndpoint(tenantId, clientId, req.body);
        sendSuccess(res, result, 201);
      } catch (error) {
        next(error);
      }
    },

    listEndpoints: async (
      req: AuthenticatedRequest,
      res: Response,
      next: NextFunction
    ): Promise<void> => {
      try {
        const tenantId = req.apiClient!.tenantId;
        const clientId = req.apiClient!.clientId;

        const endpoints = await webhookService.listEndpoints(tenantId, clientId);
        sendSuccess(res, endpoints, 200);
      } catch (error) {
        next(error);
      }
    },

    deleteEndpoint: async (
      req: AuthenticatedRequest,
      res: Response,
      next: NextFunction
    ): Promise<void> => {
      try {
        const tenantId = req.apiClient!.tenantId;
        const endpointId = req.params.id as string;

        await webhookService.deleteEndpoint(tenantId, endpointId);
        sendSuccess(res, { message: `Webhook endpoint '${endpointId}' deleted successfully` }, 200);
      } catch (error) {
        next(error);
      }
    },
  };
}

export const { createEndpoint, listEndpoints, deleteEndpoint } = createWebhooksController();
