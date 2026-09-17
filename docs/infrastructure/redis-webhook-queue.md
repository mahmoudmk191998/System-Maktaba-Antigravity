# Distributed Redis Webhook Queue Architecture

## Overview

The RMS Distributed Webhook Queue decouples order placement from external HTTP webhooks. It guarantees delivery across multiple API server nodes and background workers.

```
API Gateway #1 ──┐
API Gateway #2 ──┼── Redis (Sorted Sets + Hashes) ── Worker Pool (1..N)
API Gateway #3 ──┘                                        ↓
                                                   External HTTP Webhooks
```

## Atomic Queue Operations
- **Enqueue**: Hashes job metadata and inserts job ID into Sorted Set (`rms:webhook_queue:ready`) scored by scheduled delivery Unix timestamp.
- **Claim & Lease**: Atomically claims jobs where `scheduled_time <= now`, transitions state to `PROCESSING`, and sets a visibility timeout `lease_until = now + WEBHOOK_LEASE_SECONDS`.
- **Ack**: Deletes job hash and removes from tracking sets on HTTP 2xx.
- **Retry**: Re-inserts job into `ready` set scored with exponential backoff + jitter.
- **Fail / Dead Letter**: Moves exhausted jobs to `rms:webhook_queue:dead_letters:{tenant_id}`.

## Crash Recovery & Expired Leases
If a worker crashes mid-delivery, `recoverExpiredLeases()` detects jobs in `PROCESSING` whose `lease_until` has passed and automatically moves them back to `READY`. No event remains permanently stuck.
