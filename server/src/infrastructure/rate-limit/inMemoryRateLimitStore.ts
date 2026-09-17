import { RateLimitResult, RateLimitStore, StoreStatus } from './rateLimitStore.types.js';

interface RateLimitBucket {
  count: number;
  resetAt: number; // Unix timestamp in ms
}

export class InMemoryRateLimitStore implements RateLimitStore {
  private buckets = new Map<string, RateLimitBucket>();

  async consume(key: string, limit: number, windowSeconds: number): Promise<RateLimitResult> {
    const now = Date.now();
    const windowMs = windowSeconds * 1000;
    let bucket = this.buckets.get(key);

    if (!bucket || now >= bucket.resetAt) {
      bucket = {
        count: 1,
        resetAt: now + windowMs,
      };
      this.buckets.set(key, bucket);
      return {
        allowed: true,
        limit,
        remaining: Math.max(0, limit - 1),
        resetAt: Math.ceil(bucket.resetAt / 1000),
      };
    }

    bucket.count += 1;
    const allowed = bucket.count <= limit;
    const remaining = Math.max(0, limit - bucket.count);
    const resetAtSeconds = Math.ceil(bucket.resetAt / 1000);
    const retryAfterSeconds = allowed ? undefined : Math.max(1, Math.ceil((bucket.resetAt - now) / 1000));

    return {
      allowed,
      limit,
      remaining,
      resetAt: resetAtSeconds,
      retryAfterSeconds,
    };
  }

  getStatus(): StoreStatus {
    return {
      provider: 'in-memory',
      status: 'healthy',
    };
  }

  async reset(key?: string): Promise<void> {
    if (key) {
      this.buckets.delete(key);
    } else {
      this.buckets.clear();
    }
  }
}
