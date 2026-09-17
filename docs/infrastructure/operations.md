# RMS Production Operations & Monitoring

## System Health Monitoring

Perform health checks using the public health endpoint:
```http
GET /api/v1/health
```

### Healthy Response
```json
{
  "success": true,
  "service": "rms-api",
  "version": "v1",
  "status": "healthy",
  "infrastructure": {
    "rateLimitStore": {
      "provider": "in-memory",
      "status": "healthy"
    },
    "webhookQueue": {
      "provider": "in-memory",
      "status": "healthy",
      "pending_jobs": 0
    }
  }
}
```

## Webhook Delivery Observability

Admins can inspect the health of external webhook channels:
```http
GET /api/v1/admin/integrations/:id/webhook-health
Authorization: Bearer <ADMIN_API_KEY>
```

### Response
```json
{
  "success": true,
  "data": {
    "integration_id": "int_123",
    "status": "healthy",
    "total_deliveries": 1500,
    "successful_deliveries": 1495,
    "failed_deliveries": 5,
    "retry_count": 8,
    "pending_count": 0,
    "dead_letter_count": 0,
    "success_rate": 99,
    "failure_rate": 1,
    "avg_response_time_ms": 120
  }
}
```

## Dead Letter Inspection
```http
GET /api/v1/admin/integrations/:id/dead-letters
Authorization: Bearer <ADMIN_API_KEY>
```
