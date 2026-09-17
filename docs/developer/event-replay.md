# Event Replay & Disconnect Recovery

The RMS Real-Time Platform includes an automatic sliding-window replay buffer to ensure no events are lost during transient network interruptions.

---

## 1. How Replay Works

Every event has a monotonically ordered, unique ID (`evt_...`).

When an external client reconnects after a disconnect:
1. The client supplies the ID of the last event it successfully received via the `Last-Event-ID` header (SSE) or `last_event_id` property (WebSocket).
2. The server locates that event in the tenant's sliding buffer.
3. The server replays all events published *after* that ID in exact chronological order.
4. The connection seamlessly transitions back into live stream mode.

```
Client Stream:      evt_101 ──► evt_102 ──► [NETWORK DROP]
                                                   │
Client Reconnect:   Last-Event-ID: evt_102 ────────┘
Server Response:    evt_103 ──► evt_104 ──► [LIVE STREAM ACTIVE]
```

---

## 2. Retention & Sliding Window Configuration

The replay store maintains events per tenant according to configured retention limits:

| Environment Variable | Default Value | Description |
| :--- | :--- | :--- |
| `REALTIME_EVENT_REPLAY_ENABLED` | `true` | Enables sliding window replay. |
| `REALTIME_EVENT_REPLAY_MAX_EVENTS` | `1000` | Maximum retained events per tenant in memory / Redis. |
| `REALTIME_EVENT_REPLAY_RETENTION_SECONDS` | `86400` | Retention window duration (24 hours). |

---

## 3. Authorization & Security

Event replay is strictly subject to the same multi-tenant, branch-isolation, and permission checks as the live stream:
- Tenant A cannot replay Tenant B events.
- Clients restricted to specific branches cannot replay events belonging to other branches.
- Clients lacking permissions for specific event types (e.g. `menu:read`) will have those event types omitted from replay responses.
