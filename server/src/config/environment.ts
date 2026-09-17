import dotenv from 'dotenv';
import { z } from 'zod';

dotenv.config();

const envSchema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  PORT: z.coerce.number().default(4000),
  
  // Rate limiting config (configurable, not hardcoded)
  RATE_LIMIT_STORE: z.enum(['in-memory', 'redis']).default('in-memory'),
  API_RATE_LIMIT: z.coerce.number().default(100),
  API_RATE_LIMIT_DEFAULT: z.coerce.number().default(100),
  API_RATE_LIMIT_STANDARD: z.coerce.number().default(500),
  API_RATE_LIMIT_PREMIUM: z.coerce.number().default(2000),
  API_RATE_WINDOW_MS: z.coerce.number().default(60000), // 1 minute
  
  // Redis Configuration (Optional for distributed deployments)
  REDIS_URL: z.string().optional(),
  REDIS_RATE_LIMIT_PREFIX: z.string().default('rms:ratelimit:'),
  REDIS_QUEUE_PREFIX: z.string().default('rms:webhook_queue:'),
  
  // Webhook Queue & Worker Configuration
  WEBHOOK_QUEUE_PROVIDER: z.enum(['in-memory', 'redis']).default('in-memory'),
  WEBHOOK_WORKER_ENABLED: z.coerce.boolean().default(true),
  WEBHOOK_WORKER_CONCURRENCY: z.coerce.number().default(5),
  WEBHOOK_LEASE_SECONDS: z.coerce.number().default(60),
  WEBHOOK_POLL_INTERVAL_MS: z.coerce.number().default(1000),
  WEBHOOK_MAX_ATTEMPTS: z.coerce.number().default(5),
  WEBHOOK_BASE_DELAY_SECONDS: z.coerce.number().default(10),
  WEBHOOK_MAX_DELAY_SECONDS: z.coerce.number().default(300),
  WEBHOOK_REQUEST_TIMEOUT_MS: z.coerce.number().default(10000),

  // Circuit Breaker Configuration
  WEBHOOK_CIRCUIT_FAILURE_THRESHOLD: z.coerce.number().default(5),
  WEBHOOK_CIRCUIT_COOLDOWN_SECONDS: z.coerce.number().default(60),
  WEBHOOK_CIRCUIT_HALF_OPEN_REQUESTS: z.coerce.number().default(1),

  // CORS configuration
  ALLOWED_ORIGINS: z.string().default('http://localhost:3000,http://localhost:5173,http://localhost:4000,https://mksystem-rose.vercel.app,https://sushi-bar.pages.dev'),
  
  // Firebase Admin Credentials
  FIREBASE_PROJECT_ID: z.string().optional(),
  FIREBASE_CLIENT_EMAIL: z.string().optional(),
  FIREBASE_PRIVATE_KEY: z.string().optional(),
  
  // Optional path to service account json
  FIREBASE_SERVICE_ACCOUNT_PATH: z.string().optional(),
});

export type Environment = z.infer<typeof envSchema>;

function parseEnv(): Environment {
  const result = envSchema.safeParse(process.env);
  if (!result.success) {
    console.error('❌ Invalid environment variables:', result.error.format());
    throw new Error('Invalid environment configuration');
  }
  return result.data;
}

export const env = parseEnv();
