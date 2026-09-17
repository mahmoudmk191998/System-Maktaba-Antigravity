# WebSocket Protocol Guide

WebSockets offer a bidirectional connection for real-time order displays, POS devices, and interactive kiosks.

---

## 1. Connecting & Authentication

### Connection URL
```
wss://api.example-restaurant.com/api/v1/realtime/ws?token=rms_live_...
```
*(Or pass `Authorization: Bearer <API_KEY>` during WebSocket handshake headers).*

---

## 2. Client Protocol Messages

### A. Subscribe to Event Types
```json
{
  "action": "subscribe",
  "types": ["order.status_changed", "delivery.status_changed"],
  "branch_id": "branch_downtown_01",
  "last_event_id": "evt_prev123"
}
```

### B. Unsubscribe
```json
{
  "action": "unsubscribe",
  "types": ["order.status_changed"]
}
```

### C. Heartbeat Ping
```json
{
  "action": "ping"
}
```

### D. Replay Events
```json
{
  "action": "replay",
  "last_event_id": "evt_abc12345"
}
```

---

## 3. Server Response Messages

### A. Real-Time Event Frame
```json
{
  "type": "event",
  "event": {
    "id": "evt_1234567890",
    "type": "order.status_changed",
    "version": "1",
    "tenant_id": "tenant_sample",
    "resource_type": "order",
    "resource_id": "ord_8819",
    "request_id": "req_5512",
    "timestamp": "2026-08-20T12:30:00.000Z",
    "data": {
      "status": "ready_for_pickup"
    }
  }
}
```

### B. Heartbeat Pong
```json
{
  "type": "pong",
  "data": {
    "timestamp": 1724157000000
  }
}
```
