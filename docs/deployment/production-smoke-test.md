# RMS Production Deployment Smoke Test Specification

This document details the 15 end-to-end acceptance tests to validate a live production deployment of the **RMS (Restaurant Management System) Platform Backend**.

---

## Smoke Test Matrix

### Test 1: Platform Health & Infrastructure Check
- **Endpoint:** `GET /api/v1/health`
- **Auth:** Public (No authorization header required)
- **Expected Result:** HTTP 200 OK with `{ "status": "healthy" | "degraded", "service": "rms-api", "version": "v1", "infrastructure": {...} }`.
- **Failure Condition:** HTTP 404, HTTP 500, or process unresponsiveness.
- **Security Expectation:** Zero leakage of passwords, connection strings, secret keys, or environment variable values.

### Test 2: API Client Authentication & Header Tagging
- **Endpoint:** `GET /api/v1/branches`
- **Auth:** Valid `Authorization: Bearer <client_id>.<client_secret>`
- **Expected Result:** HTTP 200 OK with list of branches and response header `X-Request-ID`.
- **Failure Condition:** HTTP 401 Unauthorized with valid credentials.
- **Security Expectation:** Invalid credential formats return sanitized error envelopes without stack traces.

### Test 3: Multi-Tenant Isolation
- **Endpoint:** `GET /api/v1/orders/:order_id` (Where order belongs to Tenant B, requested by Tenant A)
- **Auth:** Bearer token for Tenant A
- **Expected Result:** HTTP 404 Not Found (Strictly forbidden from discovering existence of cross-tenant resource).
- **Failure Condition:** HTTP 200 OK or returning data belonging to other tenants.
- **Security Expectation:** Total separation of tenant boundaries in all read, write, and list operations.

### Test 4: Branch Authorization & Scoping
- **Endpoint:** `GET /api/v1/menu?branch_id=branch_unauthorized`
- **Auth:** Bearer token scoped exclusively to `branch_authorized`
- **Expected Result:** HTTP 403 Forbidden (`FORBIDDEN_BRANCH`).
- **Failure Condition:** HTTP 200 OK returning menu items for unauthorized branches.
- **Security Expectation:** API clients can only query and mutate branches explicitly granted in their integration profile.

### Test 5: Authoritative Menu & Catalog Retrieval
- **Endpoint:** `GET /api/v1/menu`
- **Auth:** Bearer token
- **Expected Result:** HTTP 200 OK with structured categories and active product objects.
- **Failure Condition:** Missing product data or inactive items marked active.
- **Security Expectation:** Cost prices, recipe margins, and internal supplier metadata are filtered out.

### Test 6: Delivery Zone Serviceability Check
- **Endpoint:** `POST /api/v1/delivery/check`
- **Body:** `{ "branch_id": "...", "customer_coordinates": { "lat": 30.0444, "lng": 31.2357 } }`
- **Expected Result:** HTTP 200 OK with `{ "eligible": boolean, "delivery_fee": number, "estimated_minutes": number }`.
- **Failure Condition:** HTTP 500 or calculation discrepancies.
- **Security Expectation:** Coordinates outside service polygons are safely flagged as ineligible without application crash.

### Test 7: Server-Side Authoritative Pricing Calculation
- **Endpoint:** `POST /api/v1/pricing/preview`
- **Body:** Order items with client-attempted custom discounts or manipulated totals.
- **Expected Result:** HTTP 200 OK with authoritative recalculation based on database price tables.
- **Failure Condition:** Server blindly trusts client-provided prices or totals.
- **Security Expectation:** Pricing calculations are strictly authoritative and ignore client-injected discount fields.

### Test 8: Order Creation & Financial Snapshotting
- **Endpoint:** `POST /api/v1/orders`
- **Headers:** `Idempotency-Key: <unique_uuid>`
- **Expected Result:** HTTP 201 Created with persisted `order_id`, sequential `order_number`, and immutable snapshots.
- **Failure Condition:** HTTP 400 with valid input or creation of order with unverified inventory.
- **Security Expectation:** Client cannot modify order status, payment status, or financial summaries during placement.

### Test 9: Idempotency Deduplication & Safe Replay
- **Endpoint:** `POST /api/v1/orders` (Executed twice with identical `Idempotency-Key` and payload)
- **Expected Result:** Exact same HTTP response and exact same `order_id` without creating duplicate records or incrementing counters.
- **Failure Condition:** Double charge, duplicate order creation, or different order IDs returned.
- **Security Expectation:** Idempotency keys are isolated per tenant and expire safely after TTL.

### Test 10: Webhook Delivery & HMAC Signature Verification
- **Trigger:** Order status update event dispatched to configured webhook endpoint.
- **Headers Verified:** `X-RMS-Signature: t=<ts>,v1=<hmac_sha256>`, `X-RMS-Event-ID`.
- **Expected Result:** Signature validates using integration webhook secret.
- **Failure Condition:** Malformed signature or failure to retry upon 5xx response.
- **Security Expectation:** Internal IP addresses (SSRF targets like `http://169.254.169.254` or `http://localhost`) are rejected.

### Test 11: Real-Time SSE Stream & Event Replay
- **Endpoint:** `GET /api/v1/realtime/events?types=orders.created`
- **Headers:** `Last-Event-ID: <prior_event_id>`
- **Expected Result:** HTTP 200 `text/event-stream` with heartbeat comments (`: ping`) and automatic backfill replay.
- **Failure Condition:** Connection dropped immediately or cross-tenant events leaked in event stream.
- **Security Expectation:** SSE streams are isolated strictly to client tenant and authorized branches.

### Test 12: Real-Time WebSocket Connection & Topic Filtering
- **Endpoint:** `GET /api/v1/realtime/ws?token=<bearer_token>`
- **Message:** `{"action": "subscribe", "types": ["orders.status_changed"], "branch_id": "branch_main"}`
- **Expected Result:** Receives `{"type": "connected"}` followed by `{"type": "subscribed"}` and pushed events.
- **Failure Condition:** Connection refused with valid token or subscription limit not enforced.
- **Security Expectation:** Max connection and subscription limits prevent socket exhaustion attacks.

### Test 13: Distributed Rate Limiting & Header Exposure
- **Endpoint:** `GET /api/v1/menu` (Burst traffic exceeding tier limit)
- **Headers Verified:** `X-RateLimit-Limit`, `X-RateLimit-Remaining`, `X-RateLimit-Reset`, `Retry-After`.
- **Expected Result:** HTTP 429 Too Many Requests once limit is exhausted.
- **Failure Condition:** Server allows unlimited requests without rate limit enforcement.
- **Security Expectation:** Rate limits are tracked per client/IP to mitigate denial-of-service attempts.

### Test 14: Revoked Integration Credential Block
- **Trigger:** Disable/Revoke integration in Admin portal.
- **Action:** Execute authenticated API request with the revoked credentials.
- **Expected Result:** Immediate HTTP 401 Unauthorized (`CLIENT_INACTIVE` or `CREDENTIAL_REVOKED`).
- **Failure Condition:** Revoked client continues to query or mutate restaurant data.
- **Security Expectation:** Status changes take immediate effect without stale authentication tokens.

### Test 15: Secret Rotation & Zero-Downtime Transition
- **Trigger:** Rotate integration secret in Admin portal.
- **Action:** Validate that old secret is invalidated and new secret authenticates successfully.
- **Expected Result:** New secret authenticates with HTTP 200; old secret is rejected with HTTP 401.
- **Failure Condition:** Both secrets permanently fail or old secret persists indefinitely.
- **Security Expectation:** Plaintext secret is revealed exactly once at generation time and never stored in plaintext.
