import { RateLimitResult, RateLimitStore, StoreStatus } from './rateLimitStore.types.js';
import { InMemoryRateLimitStore } from './inMemoryRateLimitStore.js';
import { logger } from '../../utils/logger.js';

export interface RedisClientInterface {
  eval(script: string, numkeys: number, ...args: (string | number)[]): Promise<[number, number]>;
  del(...keys: string[]): Promise<number>;
  ping(): Promise<string>;
}

export class RedisRateLimitStore implements RateLimitStore {
  private fallbackStore = new InMemoryRateLimitStore();
  private redisClient?: RedisClientInterface;
  private keyPrefix: string;
  private isDegraded = false;
  private lastError?: string;

  // Atomic Lua script: INCR and set EXPIRE on first hit, returns [current_count, ttl_seconds]
  private static readonly LUA_SCRIPT = `
    local key = KEYS[1]
    local limit = tonumber(ARGV[1])
    local window = tonumber(ARGV[2])
    local current = redis.call('INCR', key)
    if current == 1 then
      redis.call('EXPIRE', key, window)
    end
    local ttl = redis.call('TTL', key)
    if ttl == -1 then
      redis.call('EXPIRE', key, window)
      ttl = window
    end
    return { current, ttl }
  `;

  constructor(redisClient?: RedisClientInterface, keyPrefix: string = 'rms:ratelimit:') {
    this.redisClient = redisClient;
    this.keyPrefix = keyPrefix;
    if (!redisClient) {
      this.isDegraded = true;
      this.lastError = 'Redis client not initialized or connected';
    }
  }

  setClient(client: RedisClientInterface | undefined): void {
    this.redisClient = client;
    this.isDegraded = !client;
    if (!client) {
      this.lastError = 'Redis client disconnected';
    } else {
      this.lastError = undefined;
    }
  }

  async consume(key: string, limit: number, windowSeconds: number): Promise<RateLimitResult> {
    if (this.redisClient && !this.isDegraded) {
      try {
        const fullKey = `${this.keyPrefix}${key}`;
        const [count, ttl] = await this.redisClient.eval(
          RedisRateLimitStore.LUA_SCRIPT,
          1,
          fullKey,
          limit,
          windowSeconds
        );

        const currentCount = Number(count);
        const ttlSeconds = Math.max(1, Number(ttl));
        const allowed = currentCount <= limit;
        const remaining = Math.max(0, limit - currentCount);
        const resetAt = Math.floor(Date.now() / 1000) + ttlSeconds;
        const retryAfterSeconds = allowed ? undefined : ttlSeconds;

        return {
          allowed,
          limit,
          remaining,
          resetAt,
          retryAfterSeconds,
        };
      } catch (err: any) {
        this.isDegraded = true;
        this.lastError = err?.message || 'Redis communication failure';
        logger.warn(`Redis rate limit error, falling back to in-memory store: ${this.lastError}`);
      }
    }

    // Seamless Fallback
    return this.fallbackStore.consume(key, limit, windowSeconds);
  }

  getStatus(): StoreStatus {
    if (!this.redisClient || this.isDegraded) {
      return {
        provider: 'redis',
        status: 'degraded',
        error: this.lastError || 'Operating in in-memory fallback mode',
      };
    }

    return {
      provider: 'redis',
      status: 'healthy',
    };
  }

  async reset(key?: string): Promise<void> {
    await this.fallbackStore.reset(key);
    if (this.redisClient && !this.isDegraded) {
      try {
        if (key) {
          await this.redisClient.del(`${this.keyPrefix}${key}`);
        }
      } catch (_) {}
    }
  }
}
