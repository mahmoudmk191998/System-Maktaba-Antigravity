import { WebhookEventPayload } from '../../types/webhook.types.js';

export type JobState = 'ready' | 'processing' | 'completed' | 'failed';

export interface QueuedWebhookJob {
  job_id: string;
  event_id: string;
  tenant_id: string;
  integration_id?: string;
  endpoint_id: string;
  url: string;
  payload: WebhookEventPayload;
  secret: string; // Plaintext signing key held in queue execution context
  attempt_count: number;
  max_attempts: number;
  next_attempt_at: string; // ISO string
  created_at: string;
  state?: JobState;
  claimed_by?: string;
  lease_until?: string; // ISO string for visibility timeout
  correlation_id?: string; // Request ID
}

export interface WebhookDeadLetter {
  id: string;
  event_id: string;
  tenant_id: string;
  integration_id?: string;
  endpoint_id: string;
  destination_url: string;
  event_type: string;
  order_id?: string;
  attempts: number;
  last_error: string;
  last_status_code?: number | null;
  failed_at: string;
  next_action: string;
  correlation_id?: string;
}

export interface WebhookQueueStatus {
  provider: string;
  status: 'healthy' | 'degraded' | 'disabled';
  pending_jobs: number;
  processing_jobs?: number;
  dead_letters_count: number;
  error?: string;
}

export interface WebhookQueue {
  enqueue(job: QueuedWebhookJob): Promise<void>;
  dequeue(limit?: number): Promise<QueuedWebhookJob[]>;
  claim(workerId: string, limit?: number, leaseSeconds?: number): Promise<QueuedWebhookJob[]>;
  ack(jobId: string): Promise<void>;
  retry(jobId: string, delaySeconds: number, reason: string): Promise<void>;
  fail(jobId: string, reason: string, statusCode?: number | null): Promise<void>;
  recoverExpiredLeases(): Promise<number>;
  getPendingCount(tenantId?: string): Promise<number>;
  getDeadLetters(tenantId: string, limit?: number): Promise<WebhookDeadLetter[]>;
  getStatus(): Promise<WebhookQueueStatus>;
  clear(): Promise<void>;
}
