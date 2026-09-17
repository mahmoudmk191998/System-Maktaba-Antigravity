import { env } from '../../config/environment.js';
import { RateLimitStore } from './rateLimitStore.types.js';
import { InMemoryRateLimitStore } from './inMemoryRateLimitStore.js';
import { RedisRateLimitStore } from './redisRateLimitStore.js';

export function createRateLimitStore(): RateLimitStore {
  if (env.RATE_LIMIT_STORE === 'redis') {
    return new RedisRateLimitStore(undefined, env.REDIS_RATE_LIMIT_PREFIX);
  }
  return new InMemoryRateLimitStore();
}

export const defaultRateLimitStore: RateLimitStore = createRateLimitStore();
