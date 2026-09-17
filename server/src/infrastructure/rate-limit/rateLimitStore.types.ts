export interface RateLimitResult {
  allowed: boolean;
  limit: number;
  remaining: number;
  resetAt: number; // Unix timestamp in seconds
  retryAfterSeconds?: number;
}

export interface StoreStatus {
  provider: string;
  status: 'healthy' | 'degraded' | 'disabled';
  error?: string;
}

export interface RateLimitStore {
  /**
   * Consume 1 request against the key's quota within windowSeconds.
   */
  consume(key: string, limit: number, windowSeconds: number): Promise<RateLimitResult>;

  /**
   * Get store operational status for health check monitoring.
   */
  getStatus(): StoreStatus;

  /**
   * Reset/clear key or all keys (useful for testing and admin overrides).
   */
  reset(key?: string): Promise<void>;
}
