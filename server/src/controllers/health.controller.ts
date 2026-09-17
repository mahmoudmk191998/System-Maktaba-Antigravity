import { Request, Response } from 'express';
import { defaultRateLimitStore } from '../infrastructure/rate-limit/rateLimitStore.js';
import { defaultWebhookQueue } from '../infrastructure/webhooks/webhookQueue.js';
import { defaultEventBus } from '../realtime/event-bus/eventBus.js';
import { defaultSseManager } from '../realtime/sse/sseManager.js';
import { defaultWebsocketManager } from '../realtime/websocket/websocketManager.js';
import { env } from '../config/environment.js';

export async function getHealthCheck(req: Request, res: Response): Promise<void> {
  const rateLimitStatus = defaultRateLimitStore.getStatus();
  const webhookStatus = await defaultWebhookQueue.getStatus();
  const eventBusHealthy = defaultEventBus.isHealthy();

  const isDegraded =
    rateLimitStatus.status === 'degraded' ||
    webhookStatus.status === 'degraded' ||
    !eventBusHealthy;

  const redisStatus =
    env.RATE_LIMIT_STORE === 'redis'
      ? rateLimitStatus.status
      : env.WEBHOOK_QUEUE_PROVIDER === 'redis'
      ? webhookStatus.status
      : 'disabled';

  res.status(200).json({
    success: true,
    service: 'rms-api',
    version: 'v1',
    status: isDegraded ? 'degraded' : 'healthy',
    realtime: {
      status: eventBusHealthy ? 'healthy' : 'degraded',
      active_sse_connections: defaultSseManager.getActiveConnectionCount(),
      active_ws_connections: defaultWebsocketManager.getActiveConnectionCount(),
    },
    infrastructure: {
      rateLimitStore: {
        provider: rateLimitStatus.provider,
        status: rateLimitStatus.status,
      },
      webhookQueue: {
        provider: webhookStatus.provider,
        status: webhookStatus.status,
        pending_jobs: webhookStatus.pending_jobs,
      },
      workers: {
        enabled: env.WEBHOOK_WORKER_ENABLED,
        active: env.WEBHOOK_WORKER_ENABLED,
        concurrency: env.WEBHOOK_WORKER_CONCURRENCY,
      },
      redis: {
        status: redisStatus,
      },
    },
  });
}
