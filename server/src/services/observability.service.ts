import { defaultMetricsStore } from '../infrastructure/metrics/metricsStore.js';
import { MetricsSnapshot, MetricsStore } from '../infrastructure/metrics/metricsStore.types.js';
import { defaultWebhookQueue } from '../infrastructure/webhooks/webhookQueue.js';
import { WebhookQueue } from '../infrastructure/webhooks/webhookQueue.types.js';
import { defaultRateLimitStore } from '../infrastructure/rate-limit/rateLimitStore.js';
import { RateLimitStore } from '../infrastructure/rate-limit/rateLimitStore.types.js';
import { env } from '../config/environment.js';

export interface ObservabilityReport {
  tenant_id?: string;
  scope: 'tenant' | 'global';
  timestamp: string;
  metrics: MetricsSnapshot;
  infrastructure: {
    rate_limit_store: {
      provider: string;
      status: string;
    };
    webhook_queue: {
      provider: string;
      status: string;
      pending_jobs: number;
    };
    workers: {
      enabled: boolean;
      concurrency: number;
      poll_interval_ms: number;
      lease_seconds: number;
    };
  };
}

export class ObservabilityService {
  private metricsStore: MetricsStore;
  private queue: WebhookQueue;
  private rateLimitStore: RateLimitStore;

  constructor(
    metricsStore: MetricsStore = defaultMetricsStore,
    queue: WebhookQueue = defaultWebhookQueue,
    rateLimitStore: RateLimitStore = defaultRateLimitStore
  ) {
    this.metricsStore = metricsStore;
    this.queue = queue;
    this.rateLimitStore = rateLimitStore;
  }

  async getObservabilityReport(tenantId?: string): Promise<ObservabilityReport> {
    const metrics = await this.metricsStore.getSnapshot(tenantId);
    const queueStatus = await this.queue.getStatus();
    const rateLimitStatus = this.rateLimitStore.getStatus();

    return {
      tenant_id: tenantId,
      scope: tenantId ? 'tenant' : 'global',
      timestamp: new Date().toISOString(),
      metrics,
      infrastructure: {
        rate_limit_store: {
          provider: rateLimitStatus.provider,
          status: rateLimitStatus.status,
        },
        webhook_queue: {
          provider: queueStatus.provider,
          status: queueStatus.status,
          pending_jobs: queueStatus.pending_jobs,
        },
        workers: {
          enabled: env.WEBHOOK_WORKER_ENABLED,
          concurrency: env.WEBHOOK_WORKER_CONCURRENCY,
          poll_interval_ms: env.WEBHOOK_POLL_INTERVAL_MS,
          lease_seconds: env.WEBHOOK_LEASE_SECONDS,
        },
      },
    };
  }
}

export const defaultObservabilityService = new ObservabilityService();
