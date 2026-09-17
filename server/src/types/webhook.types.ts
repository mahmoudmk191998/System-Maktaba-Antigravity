export type WebhookEventType =
  | 'order.created'
  | 'order.status_updated'
  | 'order.confirmed'
  | 'order.preparing'
  | 'order.ready'
  | 'order.out_for_delivery'
  | 'order.delivered'
  | 'order.completed'
  | 'order.cancelled'
  | 'menu.updated';

export const ALL_WEBHOOK_EVENT_TYPES: WebhookEventType[] = [
  'order.created',
  'order.status_updated',
  'order.confirmed',
  'order.preparing',
  'order.ready',
  'order.out_for_delivery',
  'order.delivered',
  'order.completed',
  'order.cancelled',
  'menu.updated',
];

export interface WebhookEndpoint {
  id: string;
  tenant_id: string;
  client_id: string;
  url: string;
  events: WebhookEventType[];
  secret_hash: string;
  active: boolean;
  created_at: string;
  updated_at: string;
}

export interface PublicWebhookEndpoint {
  id: string;
  tenant_id: string;
  client_id: string;
  url: string;
  events: WebhookEventType[];
  active: boolean;
  created_at: string;
  updated_at: string;
}

export interface CreateWebhookEndpointInput {
  url: string;
  events: WebhookEventType[];
  active?: boolean;
}

export interface CreateWebhookEndpointResult {
  endpoint: PublicWebhookEndpoint;
  secret: string; // Plaintext secret returned ONCE on creation
  warning?: string;
}

export interface WebhookEventPayload {
  event_id: string;
  event_type: WebhookEventType;
  tenant_id: string;
  timestamp: string;
  data: Record<string, any>;
}

export interface WebhookEvent {
  id: string; // event_id
  tenant_id: string;
  client_id: string;
  event_type: WebhookEventType;
  event_id: string;
  order_id?: string;
  payload: WebhookEventPayload;
  status: 'pending' | 'delivered' | 'failed' | 'retrying' | 'permanently_failed';
  attempts: number;
  next_attempt_at: string | null;
  delivered_at: string | null;
  last_error: string | null;
  created_at: string;
}

export interface WebhookDeliveryAttempt {
  id: string;
  event_id: string;
  endpoint_id: string;
  attempt_number: number;
  status_code: number | null;
  response_time_ms: number;
  success: boolean;
  response_body?: string;
  error: string | null;
  created_at: string;
}
