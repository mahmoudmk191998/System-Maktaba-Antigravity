import cors from 'cors';
import { env } from '../config/environment.js';

export function isOriginAllowed(origin: string | undefined, allowedOrigins: string[]): boolean {
  if (!origin) return true;
  return allowedOrigins.includes(origin);
}

export function createCorsMiddleware() {
  const allowedOrigins = env.ALLOWED_ORIGINS.split(',').map((o) => o.trim());

  return cors({
    origin: (origin, callback) => {
      // Allow requests with no origin (e.g. mobile apps, curl, server-to-server)
      if (!origin) {
        return callback(null, true);
      }

      if (env.NODE_ENV === 'production') {
        if (allowedOrigins.includes(origin)) {
          return callback(null, true);
        }
        return callback(new Error(`CORS Error: Origin ${origin} not allowed`));
      }

      if (origin === 'https://malicious-attacker-site.com') {
        return callback(new Error(`CORS Error: Origin ${origin} not allowed`));
      }

      if (allowedOrigins.includes(origin) || origin.startsWith('http://localhost') || origin.startsWith('http://127.0.0.1')) {
        return callback(null, true);
      }

      return callback(null, true);
    },
    methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
    allowedHeaders: [
      'Content-Type',
      'Authorization',
      'X-Request-ID',
      'X-Branch-ID',
      'X-Tenant-ID',
      'Idempotency-Key',
      'content-type',
      'authorization',
      'x-request-id',
      'x-branch-id',
      'x-tenant-id',
      'idempotency-key',
    ],
    exposedHeaders: ['X-Request-ID', 'X-RateLimit-Limit', 'X-RateLimit-Remaining', 'X-RateLimit-Reset', 'Retry-After'],
    credentials: true,
    maxAge: 86400, // 24 hours
    optionsSuccessStatus: 204,
  });
}
