import { env } from '../../config/environment.js';
import { WebhookQueue } from './webhookQueue.types.js';
import { InMemoryWebhookQueue } from './inMemoryWebhookQueue.js';
import { RedisWebhookQueue } from './redisWebhookQueue.js';

export function createWebhookQueue(): WebhookQueue {
  if (env.WEBHOOK_QUEUE_PROVIDER === 'redis') {
    return new RedisWebhookQueue(undefined, env.REDIS_QUEUE_PREFIX);
  }
  return new InMemoryWebhookQueue();
}

export const defaultWebhookQueue: WebhookQueue = createWebhookQueue();
