# Universal Real-Time Event Platform

The **RMS Real-Time Event Platform** enables external applications—custom websites, mobile applications, kiosks, POS systems, and kitchen displays—to receive live, push-based events directly from the RMS backend.

---

## 1. High-Level Architecture

```
Browser / Mobile / Kiosk
        │
        ▼
External Application Backend
        │ (Bearer <API_KEY>)
        ▼
RMS Real-Time Gateway (/api/v1/realtime)
        │
        ├── SSE Gateway (GET /realtime/events)
        └── WebSocket Gateway (Upgrade /realtime/ws)
                  │
                  ▼
            RMS Event Bus
                  │
        ┌─────────┴─────────┐
        ▼                   ▼
Redis Pub/Sub         In-Memory Bus
 (Distributed)         (Fallback / Local)
        │
        ▼
   Tenant Event Engine (Tenant & Branch Filtering, Permission Guards)
        │
   ┌────┴───────────────────────────┐
   ▼                                ▼
Real-Time Subscribers          Sliding Replay Buffer
(SSE / WebSockets)             (Last-Event-ID recovery)
```

---

## 2. Key Capabilities & Guarantees

1. **Multi-Tenant Server-Side Isolation**: Tenant A never receives events from Tenant B.
2. **Branch Access Restrictions**: If an API credential is scoped to specific branches (`allowed_branch_ids`), it only receives events occurring at those branches.
3. **Permission Enforcement**: Subscribers only receive event types authorized by their API client permissions (`orders:read`, `menu:read`, `branches:read`, etc.).
4. **Authoritative PII & Secret Redaction**: Secrets, private keys, authentication tokens, and payment card numbers are automatically redacted before publishing.
5. **Horizontal Scalability with Distributed Redis Pub/Sub**: Multi-server RMS clusters coordinate event delivery via Redis channel namespaces (`rms:events:{tenant_id}`).
6. **Graceful Degraded Fallback**: If Redis becomes unavailable, the system automatically falls back to in-memory event routing without failing active HTTP requests.
7. **Connection Limits & Resource Protection**: Configurable limits prevent connection starvation per tenant and per integration.

---

## 3. Supported Real-Time Protocols

| Protocol | Endpoint | Best Suited For | Replay Support |
| :--- | :--- | :--- | :--- |
| **Server-Sent Events (SSE)** | `GET /api/v1/realtime/events` | Web dashboards, server-side subscribers, low overhead | `Last-Event-ID` header |
| **WebSocket** | `/api/v1/realtime/ws` | Bi-directional kiosks, interactive POS terminals | `replay` message action |

---

## 4. Security Architecture

### Recommended Integration Model:
```
Client Browser / Mobile
        │
        ▼ (Session Cookie / App JWT)
External Tenant Backend (e.g. Next.js / Node.js)
        │
        ▼ (Bearer <RMS_API_KEY>)
RMS Real-Time Gateway
```

> [!CAUTION]
> Never embed your RMS API credentials (`rms_live_...`) into browser client-side bundles or public mobile app code. Connect from your backend application, or use short-lived scoped credentials.
