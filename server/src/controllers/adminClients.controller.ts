import { Response, NextFunction } from 'express';
import { defaultApiClientService, ApiClientService } from '../services/apiClient.service.js';
import { defaultAnalyticsService } from '../services/analytics.service.js';
import { AuthenticatedRequest } from '../types/api.types.js';
import { sendSuccess } from '../utils/response.js';

export function createAdminClientsController(
  apiClientService: ApiClientService = defaultApiClientService
) {
  return {
    createClient: async (
      req: AuthenticatedRequest,
      res: Response,
      next: NextFunction
    ): Promise<void> => {
      try {
        const tenantId = req.apiClient!.tenantId;
        const actorId = req.apiClient!.clientId;

        if (req.body.allowed_branch_ids) {
          await apiClientService.validateBranches(tenantId, req.body.allowed_branch_ids);
        }

        const result = await apiClientService.createClient(
          {
            ...req.body,
            tenant_id: tenantId,
          },
          actorId
        );

        sendSuccess(res, result, 201);
      } catch (error) {
        next(error);
      }
    },

    listClients: async (
      req: AuthenticatedRequest,
      res: Response,
      next: NextFunction
    ): Promise<void> => {
      try {
        const tenantId = req.apiClient!.tenantId;
        const clients = await apiClientService.listClients(tenantId);
        sendSuccess(res, clients, 200);
      } catch (error) {
        next(error);
      }
    },

    getClientById: async (
      req: AuthenticatedRequest,
      res: Response,
      next: NextFunction
    ): Promise<void> => {
      try {
        const tenantId = req.apiClient!.tenantId;
        const clientId = req.params.id as string;

        const client = await apiClientService.getClientById(tenantId, clientId);
        sendSuccess(res, client, 200);
      } catch (error) {
        next(error);
      }
    },

    updateClient: async (
      req: AuthenticatedRequest,
      res: Response,
      next: NextFunction
    ): Promise<void> => {
      try {
        const tenantId = req.apiClient!.tenantId;
        const clientId = req.params.id as string;
        const actorId = req.apiClient!.clientId;

        const client = await apiClientService.updateClient(
          tenantId,
          clientId,
          req.body,
          actorId
        );
        sendSuccess(res, client, 200);
      } catch (error) {
        next(error);
      }
    },

    enableClient: async (
      req: AuthenticatedRequest,
      res: Response,
      next: NextFunction
    ): Promise<void> => {
      try {
        const tenantId = req.apiClient!.tenantId;
        const clientId = req.params.id as string;
        const actorId = req.apiClient!.clientId;

        const client = await apiClientService.enableClient(tenantId, clientId, actorId);
        sendSuccess(res, client, 200);
      } catch (error) {
        next(error);
      }
    },

    disableClient: async (
      req: AuthenticatedRequest,
      res: Response,
      next: NextFunction
    ): Promise<void> => {
      try {
        const tenantId = req.apiClient!.tenantId;
        const clientId = req.params.id as string;
        const actorId = req.apiClient!.clientId;

        const client = await apiClientService.disableClient(tenantId, clientId, actorId);
        sendSuccess(res, client, 200);
      } catch (error) {
        next(error);
      }
    },

    revokeClient: async (
      req: AuthenticatedRequest,
      res: Response,
      next: NextFunction
    ): Promise<void> => {
      try {
        const tenantId = req.apiClient!.tenantId;
        const clientId = req.params.id as string;
        const actorId = req.apiClient!.clientId;

        const client = await apiClientService.revokeClient(tenantId, clientId, actorId);
        sendSuccess(res, client, 200);
      } catch (error) {
        next(error);
      }
    },

    rotateSecret: async (
      req: AuthenticatedRequest,
      res: Response,
      next: NextFunction
    ): Promise<void> => {
      try {
        const tenantId = req.apiClient!.tenantId;
        const clientId = req.params.id as string;
        const actorId = req.apiClient!.clientId;

        const result = await apiClientService.rotateSecret(tenantId, clientId, actorId);
        sendSuccess(res, result, 200);
      } catch (error) {
        next(error);
      }
    },

    getAuditLogs: async (
      req: AuthenticatedRequest,
      res: Response,
      next: NextFunction
    ): Promise<void> => {
      try {
        const tenantId = req.apiClient!.tenantId;
        const clientId = req.params.id as string;

        const logs = await apiClientService.getAuditLogs(tenantId, clientId);
        sendSuccess(res, logs, 200);
      } catch (error) {
        next(error);
      }
    },

    getUsageAnalytics: async (
      req: AuthenticatedRequest,
      res: Response,
      next: NextFunction
    ): Promise<void> => {
      try {
        const tenantId = req.apiClient!.tenantId;
        const clientId = req.params.id as string;

        // Verify client exists and belongs to tenant
        await apiClientService.getClientById(tenantId, clientId);

        const summary = await defaultAnalyticsService.getClientUsageAnalytics(tenantId, clientId, {
          startDate: req.query.startDate as string,
          endDate: req.query.endDate as string,
          endpoint: req.query.endpoint as string,
          statusCode: req.query.statusCode ? parseInt(req.query.statusCode as string, 10) : undefined,
          page: req.query.page ? parseInt(req.query.page as string, 10) : 1,
          pageSize: req.query.pageSize ? parseInt(req.query.pageSize as string, 10) : 20,
        });

        sendSuccess(res, summary, 200);
      } catch (error) {
        next(error);
      }
    },
  };
}

export const {
  createClient,
  listClients,
  getClientById,
  updateClient,
  enableClient,
  disableClient,
  revokeClient,
  rotateSecret,
  getAuditLogs,
  getUsageAnalytics,
} = createAdminClientsController();
