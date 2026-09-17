import { Response, NextFunction } from 'express';
import { env } from '../config/environment.js';
import { AuthenticatedRequest } from '../types/api.types.js';
import { RateLimitError } from '../utils/errors.js';
import { parseCredentialString } from '../utils/crypto.js';
import { defaultApiClientService } from '../services/apiClient.service.js';
import { defaultRateLimitStore } from '../infrastructure/rate-limit/rateLimitStore.js';
import { RateLimitStore } from '../infrastructure/rate-limit/rateLimitStore.types.js';

export function resolveClientRateLimit(tier?: string, fallbackLimit: number = env.API_RATE_LIMIT): number {
  if (tier === 'premium') {
    return env.API_RATE_LIMIT_PREMIUM;
  }
  if (tier === 'standard') {
    return env.API_RATE_LIMIT_STANDARD;
  }
  if (tier === 'free') {
    return env.API_RATE_LIMIT_DEFAULT;
  }
  return fallbackLimit;
}

export function createRateLimiter(
  maxRequests: number = env.API_RATE_LIMIT,
  windowMs: number = env.API_RATE_WINDOW_MS,
  store: RateLimitStore = defaultRateLimitStore
) {
  const windowSeconds = Math.max(1, Math.ceil(windowMs / 1000));

  return async (req: AuthenticatedRequest, res: Response, next: NextFunction): Promise<void> => {
    let key = req.apiClient?.clientId
      ? `tenant:${req.apiClient.tenantId}:client:${req.apiClient.clientId}`
      : undefined;
    let tier = req.apiClient?.rateLimitTier;

    if (!key && req.header('Authorization')) {
      const auth = req.header('Authorization')!;
      if (auth.startsWith('Bearer ')) {
        const parsed = parseCredentialString(auth.slice(7).trim());
        if (parsed?.clientId) {
          try {
            const client = await defaultApiClientService.getClientByClientId(parsed.clientId);
            if (client) {
              key = `tenant:${client.tenant_id}:client:${client.client_id}`;
              tier = client.rate_limit_tier;
            }
          } catch (_) {}
        }
      }
    }

    // Fallback key for unauthenticated requests (e.g. public health/catalog before auth)
    key = key || `ip:${req.ip || req.socket.remoteAddress || 'unknown'}`;

    const effectiveLimit = resolveClientRateLimit(tier, maxRequests);
    const result = await store.consume(key, effectiveLimit, windowSeconds);

    res.setHeader('X-RateLimit-Limit', result.limit.toString());
    res.setHeader('X-RateLimit-Remaining', result.remaining.toString());
    res.setHeader('X-RateLimit-Reset', result.resetAt.toString());

    if (!result.allowed) {
      const retryAfter = result.retryAfterSeconds || 60;
      res.setHeader('Retry-After', retryAfter.toString());
      return next(
        new RateLimitError(
          `Rate limit of ${effectiveLimit} requests per ${windowSeconds}s exceeded`
        )
      );
    }

    next();
  };
}

export function resetRateLimits(): void {
  defaultRateLimitStore.reset();
}
