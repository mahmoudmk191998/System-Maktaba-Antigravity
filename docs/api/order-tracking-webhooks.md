# RMS Order Tracking & Webhooks Documentation (Phase 3C)

## 1. Order Tracking API (`GET /api/v1/orders/:id`)

The Order Tracking endpoint provides a clean, customer-safe view of an order while strictly guaranteeing tenant isolation and protecting internal business data.

```
External Client (e.g. Sushi Bar App)
               │
               │ GET /api/v1/orders/:id
               │ Authorization: Bearer rms_live_<clientId>.<secret>
               ▼
┌─────────────────────────────────────────────────────────────┐
│ 1. API Client Auth & Tenant Lock (req.apiClient.tenantId)   │
├─────────────────────────────────────────────────────────────┤
│ 2. Permission Guard (requirePermission('orders:read'))      │
├─────────────────────────────────────────────────────────────┤
│ 3. Branch Access Check (Allowed branches for this client)   │
├─────────────────────────────────────────────────────────────┤
│ 4. Cross-Tenant Protection:                                 │
│    - Orders belonging to another tenant return 404 Not Found│
│    - Never discloses existence of other tenants' orders     │
├─────────────────────────────────────────────────────────────┤
│ 5. Safe Public Snapshot Transformation:                     │
│    - Strips internal meal cost (cost, supplier_cost)        │
│    - Strips secret recipes and inventory margins            │
│    - Strips database internal fields & API client keys      │
│    - Returns safe order status, pricing, and item summary   │
└─────────────────────────────────────────────────────────────┘
```

---

## 2. Order Status State Machine & History

Status transitions are governed by an internal state machine:

```
[ pending ] ──► [ confirmed ] ──► [ preparing ] ──► [ ready ] ──┬──► [ out_for_delivery ] ──► [ delivered ] ──► [ completed ]
     │               │                 │               │         │                                                  ▲
     │               │                 │               │         └──────────────────────────────────────────────────┤
     ▼               ▼                 ▼               ▼                                                            │
[ cancelled ]   [ cancelled ]     [ cancelled ]   [ cancelled ]                                                     │
```

### Immutable Status History (`order_status_history`):
Every state change creates an immutable audit record:
- `id`: Unique record ID (`osh_...`)
- `tenant_id`: Tenant ID
- `order_id`: Order ID
- `previous_status`: Previous status (e.g. `'pending'`)
- `new_status`: New status (e.g. `'confirmed'`)
- `changed_by`: User / Station / System identifier
- `source`: Source of change (`'pos'`, `'kitchen'`, `'delivery'`, `'api'`, `'system'`)
- `note`: Optional transition note
- `created_at`: ISO timestamp

---

## 3. Webhook Subsystem Architecture

When an order status changes or a new event occurs, the system automatically broadcasts HMAC-signed webhook events to all active subscriber endpoints for that tenant.

```
Order Event (e.g. order.confirmed)
               │
               ▼
┌─────────────────────────────────────────────────────────────┐
│ 1. Find active tenant endpoints for this event_type         │
├─────────────────────────────────────────────────────────────┤
│ 2. Generate deterministic Event ID (evt_<orderId>_<type>_t) │
├─────────────────────────────────────────────────────────────┤
│ 3. Build Standard Webhook Event Payload                     │
├─────────────────────────────────────────────────────────────┤
│ 4. Compute HMAC-SHA256 Signature (t=<time>,v1=<signature>)  │
│    Signature = HMAC_SHA256(secret, timestamp + "." + body) │
├─────────────────────────────────────────────────────────────┤
│ 5. Asynchronous HTTP POST Dispatch:                         │
│    - Headers: X-RMS-Event-ID, X-RMS-Timestamp,              │
│               X-RMS-Signature                               │
├─────────────────────────────────────────────────────────────┤
│ 6. Delivery Logging (webhook_delivery_attempts):            │
│    - On 2xx: Mark event 'delivered'                         │
│    - On Error: Record failure, set exponential backoff      │
│    - After Max Retries (3): Mark event 'failed'             │
└─────────────────────────────────────────────────────────────┘
```

---

## 4. Webhook Management API

### A. Register Webhook Endpoint (`POST /api/v1/webhooks`)
**Request:**
```json
{
  "url": "https://sushibar.example.com/api/webhooks",
  "events": ["order.created", "order.status_updated", "order.ready"],
  "active": true
}
```
**Response (`201 Created`):**
```json
{
  "success": true,
  "data": {
    "endpoint": {
      "id": "whe_a1b2c3d4e5f6g7h8i9j0",
      "tenant_id": "tenant_sushi_bar",
      "url": "https://sushibar.example.com/api/webhooks",
      "events": ["order.created", "order.status_updated", "order.ready"],
      "active": true,
      "created_at": "2026-08-20T11:00:00.000Z"
    },
    "secret": "whsec_08f9a2b3c4d5e6f7a8b9c0d1e2f3a4b5"
  }
}
```
> [!IMPORTANT]
> The plaintext webhook `secret` is returned **ONLY ONCE** at creation time. It is never exposed in subsequent `GET` requests.

### B. List Webhook Endpoints (`GET /api/v1/webhooks`)
Returns registered endpoints with `secret` and `secret_hash` stripped.

### C. Delete Webhook Endpoint (`DELETE /api/v1/webhooks/:id`)
Deletes the endpoint subscription with strict tenant scoping.

---

## 5. Webhook Signature Verification Guide for External Clients

External client apps (e.g. Sushi Bar Website) can verify event authenticity in Node.js:

```typescript
import crypto from 'crypto';

function verifyRmsWebhook(
  secret: string,
  rawBody: string,
  timestampHeader: string,
  signatureHeader: string
): boolean {
  // 1. Check timestamp tolerance (e.g. within 5 minutes to prevent replay attacks)
  const currentTimestamp = Math.floor(Date.now() / 1000);
  const eventTimestamp = parseInt(timestampHeader, 10);
  if (Math.abs(currentTimestamp - eventTimestamp) > 300) {
    return false; // Replay attack or excessive clock drift
  }

  // 2. Extract v1 signature
  const v1Signature = signatureHeader.includes('v1=')
    ? signatureHeader.split('v1=')[1]
    : signatureHeader;

  // 3. Compute expected HMAC
  const dataToSign = `${timestampHeader}.${rawBody}`;
  const expectedSignature = crypto
    .createHmac('sha256', secret)
    .update(dataToSign)
    .digest('hex');

  // 4. Constant-time comparison
  return crypto.timingSafeEqual(
    Buffer.from(v1Signature, 'hex'),
    Buffer.from(expectedSignature, 'hex')
  );
}
```
