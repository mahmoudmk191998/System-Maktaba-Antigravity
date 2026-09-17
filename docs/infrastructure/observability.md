# RMS Observability & Reliability Metrics

## Admin Observability API

Platform administrators and restaurant managers can inspect real-time platform health and performance:

```http
GET /api/v1/admin/observability
Authorization: Bearer <API_KEY>
```

### Metrics Returned
- `api_requests_total`: Total inbound HTTP requests.
- `api_errors_total`: Inbound HTTP error count.
- `api_request_duration_avg_ms`: Average API response time.
- `orders_created_total`: Total successful orders created.
- `orders_failed_total`: Orders rejected or failed.
- `webhook_deliveries_total`: Total webhook delivery attempts.
- `webhook_delivery_failures_total`: Total failed deliveries.
- `webhook_retries_total`: Retried events count.
- `webhook_dead_letters_total`: Exhausted / permanently failed events.
- `webhook_delivery_duration_avg_ms`: Webhook roundtrip latency.
- `rate_limit_exceeded_total`: HTTP 429 occurrences.
- `active_integrations`: Number of active external integrations.
- `queue_depth`: Number of ready/pending webhook jobs.

## Integration Health & Reliability Scoring (0-100)

```http
GET /api/v1/admin/integrations/:id/webhook-health
Authorization: Bearer <API_KEY>
```

### Scoring Formula:
`Health Score = max(0, min(100, 50 + SuccessPoints - FailurePenalty - CircuitPenalty - LatencyPenalty - DeadLetterPenalty))`
- `SuccessPoints`: `(successful / total) * 50`
- `FailurePenalty`: `(failed / total) * 30`
- `CircuitPenalty`: `OPEN = 30`, `HALF_OPEN = 15`, `CLOSED = 0`
- `LatencyPenalty`: `> 5000ms = 20`, `> 2000ms = 10`
- `DeadLetterPenalty`: `min(20, dead_letters * 5)`
