# Webhook Event Queue & Worker Architecture

## Overview

The RMS Webhook architecture guarantees asynchronous, non-blocking order workflows by queueing outgoing events and delegating delivery to a resilient background worker.

## Event Lifecycle

```
Order Status Transition (POST /orders or PATCH /orders/:id/status)
        ↓
Create webhook_event in Firestore (status: 'pending')
        ↓
Enqueue Job in WebhookQueue (Job ID, Payload, Secret, Max Attempts)
        ↓
HTTP Response Returned to Caller (Immediate, 0ms blocking)
        ↓
WebhookWorker Background Execution
        ↓
Deliver Webhook (10s timeout, HMAC-SHA256 signature)
 ├── 2xx: Delivered → ACK job → Event status 'delivered'
 ├── 4xx (400, 401, 403, 404, 409, 422): Non-retryable → Event status 'permanently_failed'
 └── 5xx / 429 / Timeouts: Retry with Exponential Backoff + Jitter
        ↓
If Max Attempts (5) Exceeded → Move to webhook_dead_letters
```

## Backoff Schedule
- **Attempt 1**: Immediate
- **Attempt 2**: 10 seconds + jitter
- **Attempt 3**: 20 seconds + jitter
- **Attempt 4**: 40 seconds + jitter
- **Attempt 5**: 80 seconds + jitter
- **For 429**: Respects `Retry-After` header if provided by external server.
