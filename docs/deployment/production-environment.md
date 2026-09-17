# RMS Production Environment Variables Specification

This document provides the authoritative reference for configuring environment variables when deploying the **RMS (Restaurant Management System) Backend** to production hosting platforms (Render, Railway, Fly.io, Google Cloud Run).

---

## 1. Environment Variable Matrix

| Variable | Category | Required / Optional | Default Value | Description & Security Expectations |
| :--- | :--- | :--- | :--- | :--- |
| `NODE_ENV` | Core | **Required** | `production` | Set to `production` to activate Helmet security headers, CSP, and strict CORS. |
| `PORT` | Core | **Required** | `4000` | HTTP port for the Express/WebSocket server to bind. Injected automatically by PaaS providers (Render/Railway/Cloud Run). |
| `ALLOWED_ORIGINS` | Security | **Required** | None | Comma-separated list of allowed browser domains. Wildcard `*` is strictly disallowed in production. |
| `FIREBASE_PROJECT_ID` | Database | **Required** | None | Google Firebase project ID for Firestore database. |
| `FIREBASE_CLIENT_EMAIL` | Database | **Required** | None | Service account email generated in Google Cloud Console. |
| `FIREBASE_PRIVATE_KEY` | Database | **Required** | None | RSA private key from Firebase service account. Must include `-----BEGIN PRIVATE KEY-----` and `\n` line endings. |
| `FIREBASE_SERVICE_ACCOUNT_PATH`| Database | Optional | None | Absolute path to service account JSON file on disk (alternative to inline env vars). |
| `RATE_LIMIT_STORE` | Rate Limiting | Optional | `in-memory` | `in-memory` (single node) or `redis` (multi-instance distributed clusters). |
| `API_RATE_LIMIT_DEFAULT` | Rate Limiting | Optional | `100` | Base tier request allowance per window. |
| `API_RATE_LIMIT_STANDARD`| Rate Limiting | Optional | `500` | Standard tier request allowance per window. |
| `API_RATE_LIMIT_PREMIUM` | Rate Limiting | Optional | `2000` | Premium tier request allowance per window. |
| `API_RATE_WINDOW_MS` | Rate Limiting | Optional | `60000` | Rate limiting rolling sliding window duration in milliseconds (1 minute). |
| `REDIS_URL` | Cache/PubSub | Optional | None | Redis connection URI (`rediss://default:password@host:6379`). Required when using `redis` store/queue/bus. |
| `REDIS_RATE_LIMIT_PREFIX`| Cache/PubSub | Optional | `rms:ratelimit:` | Namespace key prefix for Redis rate limiting keys. |
| `REDIS_QUEUE_PREFIX` | Cache/PubSub | Optional | `rms:webhook_queue:`| Namespace key prefix for Redis webhook queue keys. |
| `WEBHOOK_QUEUE_PROVIDER` | Webhooks | Optional | `in-memory` | `in-memory` (local) or `redis` (distributed durable queue). |
| `WEBHOOK_WORKER_ENABLED` | Webhooks | Optional | `true` | Enables background worker pool for sweeping and dispatching outbound webhooks. |
| `WEBHOOK_WORKER_CONCURRENCY`| Webhooks | Optional | `5` | Maximum concurrent outbound webhook HTTP requests dispatched simultaneously. |
| `WEBHOOK_LEASE_SECONDS` | Webhooks | Optional | `60` | Visibility timeout lock duration for claimed webhook jobs. |
| `WEBHOOK_POLL_INTERVAL_MS`| Webhooks | Optional | `1000` | Background queue polling frequency in milliseconds. |
| `WEBHOOK_MAX_ATTEMPTS` | Webhooks | Optional | `5` | Maximum retry attempts before moving a failing webhook event to Dead Letter. |
| `WEBHOOK_BASE_DELAY_SECONDS`| Webhooks | Optional | `10` | Base exponential backoff multiplier for retries. |
| `WEBHOOK_MAX_DELAY_SECONDS`| Webhooks | Optional | `300` | Maximum retry delay cap (5 minutes). |
| `WEBHOOK_REQUEST_TIMEOUT_MS`| Webhooks | Optional | `10000` | HTTP request timeout for outbound webhook destination calls (10 seconds). |
| `WEBHOOK_CIRCUIT_FAILURE_THRESHOLD`| Circuit Breaker | Optional | `5` | Consecutive failures required to trip the circuit open for a client endpoint. |
| `WEBHOOK_CIRCUIT_COOLDOWN_SECONDS`| Circuit Breaker | Optional | `60` | Duration the circuit breaker remains OPEN before testing recovery in HALF-OPEN. |
| `WEBHOOK_CIRCUIT_HALF_OPEN_REQUESTS`| Circuit Breaker | Optional | `1` | Number of probe requests allowed through in HALF-OPEN state. |
| `REALTIME_EVENT_BUS_PROVIDER`| Realtime | Optional | `in-memory` | `in-memory` (single node) or `redis` (multi-node Redis Pub/Sub cluster). |
| `REALTIME_EVENT_REPLAY_ENABLED`| Realtime | Optional | `true` | Enables event history replay via `Last-Event-ID` header and WebSocket replay action. |
| `REALTIME_EVENT_REPLAY_MAX_EVENTS`| Realtime | Optional | `1000` | Maximum buffered events preserved in memory/cache for replay. |
| `REALTIME_EVENT_REPLAY_RETENTION_SECONDS`| Realtime | Optional | `86400` | Event replay retention lifetime (24 hours). |
| `REALTIME_MAX_CONNECTIONS_PER_TENANT`| Realtime | Optional | `100` | Maximum simultaneous SSE and WebSocket connections per restaurant tenant. |
| `REALTIME_MAX_CONNECTIONS_PER_INTEGRATION`| Realtime | Optional | `20` | Maximum simultaneous connections per external integration client ID. |
| `REALTIME_MAX_SUBSCRIPTIONS_PER_CONNECTION`| Realtime | Optional | `20` | Maximum filter topic subscriptions allowed on a single connection. |

---

## 2. Mandatory vs Safe Defaults

### Mandatory Variables (Must be provided for application to start in production):
1. `NODE_ENV=production`
2. `PORT=4000`
3. `FIREBASE_PROJECT_ID`, `FIREBASE_CLIENT_EMAIL`, `FIREBASE_PRIVATE_KEY` (or `FIREBASE_SERVICE_ACCOUNT_PATH`)
4. `ALLOWED_ORIGINS` (Specifying all trusted customer frontend domains)

### Safe Defaults (Graceful fallbacks operate automatically if omitted):
- Rate limiting defaults to `in-memory` sliding window counters.
- Webhook queue defaults to `in-memory` retry queue with automatic lease management and dead letters.
- Real-time event bus defaults to local Node.js EventEmitter with in-memory replay buffer.
- If Redis is specified in `REDIS_URL` but becomes temporarily unreachable, health checks report `degraded` and the system seamlessly falls back to memory without crashing.

---

## 3. Strict Secret Handling Requirements

> [!CAUTION]
> **Zero Credential Exposure Rule**
> - Never commit `.env` or service account keys into Git.
> - Never pass `FIREBASE_PRIVATE_KEY` or `RMS_CLIENT_SECRET` to the frontend or Vite client bundle (`VITE_*`).
> - In cloud hosting provider dashboards, configure these values as encrypted **Environment Secrets**.
