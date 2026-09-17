# Order Tracking & Status History

Expose safe order tracking to customers with full state history and PII redaction.

## Track Order Endpoint
```http
GET /api/v1/orders/:id/track
Authorization: Bearer <API_KEY>
```

### Response
```json
{
  "success": true,
  "data": {
    "order_id": "ord_123456",
    "order_number": "1042",
    "status": "preparing",
    "status_history": [
      { "status": "pending", "timestamp": "2026-08-20T12:00:00Z" },
      { "status": "confirmed", "timestamp": "2026-08-20T12:02:00Z" },
      { "status": "preparing", "timestamp": "2026-08-20T12:05:00Z" }
    ]
  }
}
```
