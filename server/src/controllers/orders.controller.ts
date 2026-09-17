import { Response, NextFunction } from 'express';
import { defaultOrderService, OrderService } from '../services/order.service.js';
import { defaultWebhookService } from '../services/webhook.service.js';
import { defaultEventPublisher } from '../realtime/events/eventPublisher.js';
import { AuthenticatedRequest } from '../types/api.types.js';
import { ForbiddenError, NotFoundError } from '../utils/errors.js';
import { sendSuccess } from '../utils/response.js';

export function createOrdersController(orderService: OrderService = defaultOrderService) {
  return {
    createOrder: async (
      req: AuthenticatedRequest,
      res: Response,
      next: NextFunction
    ): Promise<void> => {
      try {
        const tenantId = req.apiClient!.tenantId;
        const clientId = req.apiClient!.clientId;
        const idempotencyKey = req.header('Idempotency-Key');
        const requestId = req.header('X-Request-ID');

        const result = await orderService.createOrder(
          tenantId,
          clientId,
          req.body,
          idempotencyKey
        );

        // 1. Trigger Webhooks
        defaultWebhookService
          .triggerEvent(tenantId, 'order.created', result.order_id, result as any)
          .catch(() => {});

        // 2. Publish Real-Time Event
        defaultEventPublisher
          .publish(tenantId, 'order.created', 'order', result.order_id, result, {
            branch_id: req.body.branch_id,
            request_id: requestId,
            integration_id: clientId,
          })
          .catch(() => {});

        sendSuccess(res, result, 201);
      } catch (error) {
        next(error);
      }
    },

    getOrderById: async (
      req: AuthenticatedRequest,
      res: Response,
      next: NextFunction
    ): Promise<void> => {
      try {
        const tenantId = req.apiClient!.tenantId;
        const orderId = req.params.id as string;

        const order = await orderService.getOrderById(tenantId, orderId);
        if (!order) {
          throw new NotFoundError(`Order '${orderId}' not found`);
        }

        // Enforce branch access restriction if configured for this API client
        const allowedBranches = req.apiClient?.allowedBranchIds || [];
        if (allowedBranches.length > 0 && !allowedBranches.includes(order.branch_id)) {
          throw new ForbiddenError(
            `Branch access denied: Client is not authorized to view orders from branch '${order.branch_id}'`
          );
        }

        sendSuccess(res, orderService.toPublicOrder(order), 200);
      } catch (error) {
        next(error);
      }
    },

    updateStatus: async (
      req: AuthenticatedRequest,
      res: Response,
      next: NextFunction
    ): Promise<void> => {
      try {
        const tenantId = req.apiClient!.tenantId;
        const clientId = req.apiClient!.clientId;
        const orderId = req.params.id as string;
        const allowedBranches = req.apiClient?.allowedBranchIds || [];
        const requestId = req.header('X-Request-ID');

        const updated = await orderService.transitionStatus(
          tenantId,
          orderId,
          req.body.status,
          allowedBranches
        );

        const publicOrder = orderService.toPublicOrder(updated);

        // 1. Trigger Webhooks
        defaultWebhookService
          .triggerEvent(tenantId, 'order.status_updated', orderId, updated as any)
          .catch(() => {});

        // 2. Publish Real-Time Event
        defaultEventPublisher
          .publish(
            tenantId,
            'order.status_changed',
            'order',
            orderId,
            {
              order_id: orderId,
              order_number: updated.order_number,
              status: req.body.status,
              updated_at: updated.updated_at,
            },
            {
              branch_id: updated.branch_id,
              request_id: requestId,
              integration_id: clientId,
            }
          )
          .catch(() => {});

        sendSuccess(res, publicOrder, 200);
      } catch (error) {
        next(error);
      }
    },
  };
}

export const { createOrder, getOrderById, updateStatus } = createOrdersController();
