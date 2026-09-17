export type StandardRmsEventType =
  | 'order.created'
  | 'order.updated'
  | 'order.status_changed'
  | 'order.cancelled'
  | 'payment.created'
  | 'payment.updated'
  | 'payment.completed'
  | 'payment.failed'
  | 'menu.updated'
  | 'product.created'
  | 'product.updated'
  | 'product.deleted'
  | 'branch.created'
  | 'branch.updated'
  | 'branch.disabled'
  | 'delivery.created'
  | 'delivery.updated'
  | 'delivery.status_changed'
  | 'reservation.created'
  | 'reservation.updated'
  | 'reservation.cancelled'
  | 'inventory.updated'
  | 'tenant.updated'
  | 'integration.updated';

export interface RmsEvent<T = unknown> {
  id: string;
  type: StandardRmsEventType | string;
  version: string;
  tenant_id: string;
  integration_id?: string;
  branch_id?: string;
  resource_type: string;
  resource_id: string;
  request_id: string;
  timestamp: string;
  data: T;
  metadata?: Record<string, unknown>;
}

export type PublicRmsEvent<T = unknown> = Omit<RmsEvent<T>, 'metadata'> & {
  metadata?: Record<string, unknown>;
};

export interface EventPublishOptions {
  integration_id?: string;
  branch_id?: string;
  request_id?: string;
  metadata?: Record<string, unknown>;
}
