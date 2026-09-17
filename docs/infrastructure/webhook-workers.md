# Webhook Background Workers & Lease Management

## Worker Lifecycle

```
Worker Start
     ↓
Poll Queue (interval: WEBHOOK_POLL_INTERVAL_MS)
     ↓
Claim Batch (concurrency: WEBHOOK_WORKER_CONCURRENCY, lease: WEBHOOK_LEASE_SECONDS)
     ↓
Check Circuit Breaker (CLOSED / HALF_OPEN)
     ↓
Deliver HTTP Webhook (HMAC-SHA256, timeout 10s)
     ↓
 ├── 2xx: ACK job + Record Circuit Success
 ├── Non-retryable (400, 401, 403, 404, 409, 422): FAIL job + Dead Letter
 └── Retryable (5xx, 429, timeouts): Backoff Retry + Record Circuit Failure
```

## Worker Coordination Configuration
```env
WEBHOOK_WORKER_ENABLED=true
WEBHOOK_WORKER_CONCURRENCY=5
WEBHOOK_LEASE_SECONDS=60
WEBHOOK_POLL_INTERVAL_MS=1000
```
