# RMS Secure Server-Side Order Creation Documentation (Phases 3B Hardening + 3C)

## 1. Overview & Lifecycle

The `POST /api/v1/orders` endpoint creates authoritative, immutable orders in the central Restaurant Management System (RMS). External clients (e.g. Sushi Bar Website) can never manipulate financial data, product prices, discounts, delivery fees, or order numbers.

```
External Client / App
        │
        │ POST /api/v1/orders
        │ Header: Idempotency-Key: <uuid>
        │ Header: Authorization: Bearer rms_live_<clientId>.<secret>
        ▼
┌─────────────────────────────────────────────────────────────┐
│ 1. API Client Auth & Tenant Lock (req.apiClient.tenantId)   │
├─────────────────────────────────────────────────────────────┤
│ 2. Permission Guard (requirePermission('orders:create'))    │
├─────────────────────────────────────────────────────────────┤
│ 3. Branch Access Guard (requireBranchAccess('branch_id'))   │
├─────────────────────────────────────────────────────────────┤
│ 4. Zod Strict Schema Validation                             │
│    (Strictly rejects client price/subtotal/discount/tax)    │
├─────────────────────────────────────────────────────────────┤
│ 5. Idempotency Deduplication Check (SHA-256 Fingerprint)    │
│    - Same key + Same body → Return cached 201 response      │
│    - Same key + Different body → Return 409 Conflict        │
├─────────────────────────────────────────────────────────────┤
│ 6. Pre-Check Product Availability & Inventory (Recipes)     │
├─────────────────────────────────────────────────────────────┤
│ 7. Phase 3A Deterministic Server-Side Pricing Engine        │
│    (Authoritative unit prices, addons, discounts, taxes)    │
├─────────────────────────────────────────────────────────────┤
│ 8. Atomic Sequential Order Number (#1, #2, ...)             │
├─────────────────────────────────────────────────────────────┤
│ 9. Immutable Database Snapshot Persistence                  │
│    - Collection 'orders' (Primary Snapshot)                 │
│    - Collection 'order_items' (POS Kitchen Compatibility)   │
│    - Collection 'idempotency_records'                       │
├─────────────────────────────────────────────────────────────┤
│ 10. Clean Public Response (201 Created)                     │
└─────────────────────────────────────────────────────────────┘
```

---

## 2. Idempotency & Deduplication Strategy

- **Header:** `Idempotency-Key` (e.g. `4f7b0c8e-289e-4c77-96a6-f7614e591745`).
- **Scope:** Scoped per `tenant_id` and `client_id` (`${tenant_id}_${client_id}_${idempotency_key}`).
- **Fingerprinting:** Recursively normalizes object key sorting and computes a deterministic `SHA-256` hash of the request payload.
- **Behavior:**
  - If a network retry occurs with the **same payload and key**, the server immediately returns the previously created order without re-pricing or generating duplicate order numbers.
  - If the client attempts to use the **same key with a different payload**, the server returns `409 Conflict` (`IDEMPOTENCY_KEY_REUSED`).

---

## 3. Immutability & Financial Source of Truth

Once an order is created, its stored `pricing_snapshot`, `items`, `customer_snapshot`, and `delivery_snapshot` become **permanent and immutable**:

1. If the restaurant later increases the price of a menu item, historical orders retain their original purchase price.
2. If discounts or tax rates change in restaurant settings, past order totals remain untouched.
3. If a customer edits their saved address in a user profile, the historical delivery order preserves the exact delivery address at the moment of ordering.

---

## 4. Integration with Existing POS & Kitchen Views

To ensure full backward compatibility with the existing React POS application and Kitchen Display Systems:
- The main order document is written to the `orders` collection matching existing fields (`tenant_id`, `branch_id`, `order_number`, `order_type`, `subtotal`, `discount_amount`, `total`, `status: 'pending'`, `payment_status: 'pending'`).
- Individual line items are also written to the `order_items` collection for legacy live-query compatibility.

---

## 5. Security Summary & Tamper Prevention

| Vector | Protection Mechanism |
| :--- | :--- |
| **Price Tampering** | Client `price`, `unit_price`, `subtotal`, `discount`, `tax` fields are rejected by strict Zod schema validation. Authoritative prices are resolved from Firestore. |
| **Tenant Hijacking** | `tenant_id` is extracted strictly from the authenticated API Key context. Cross-tenant lookups return `404 Not Found`. |
| **Branch Hijacking** | `branch_id` is validated against `req.apiClient.allowedBranchIds`. Unauthorized branches return `403 Forbidden`. |
| **State Tampering** | Client cannot send initial `status: 'completed'` or `payment_status: 'paid'`. Initial status is always server-assigned as `pending`. |
| **Double Submissions** | Deduplicated atomically via the `Idempotency-Key` engine. |

---

## 6. Example API Request & Response

### Request:
```http
POST /api/v1/orders
Authorization: Bearer rms_live_<clientId>.<secret>
Idempotency-Key: c9b248a3-8321-4f11-9a74-b5ebc7e63b65
Content-Type: application/json

{
  "branch_id": "branch_sushi_main",
  "order_type": "delivery",
  "items": [
    {
      "product_id": "prod_california",
      "quantity": 2,
      "addon_ids": ["addon_extra_ginger", "addon_spicy_mayo"],
      "notes": "Extra wasabi on the side"
    }
  ],
  "customer": {
    "name": "أحمد محمود",
    "phone": "01012345678",
    "address": "شارع 26 يوليو، الزمالك"
  },
  "delivery": {
    "zone_id": "zone_zamalek"
  },
  "coupon_code": "WELCOME20",
  "payment_method": "cash",
  "notes": "يرجى رن الجرس بهدوء"
}
```

---

## Phase 3B hardening and Phase 3C

Order, line-items, branch counter, and idempotency response are committed in one Firestore transaction. The idempotency record is read inside that transaction, so concurrent retries return one result or `409 IDEMPOTENCY_KEY_REUSED`. Production never falls back to process memory: failures return `503 PERSISTENCE_FAILED`, so the same key can be safely retried.

`GET /api/v1/orders/:id` is tenant/branch scoped and returns a sanitized tracking view without phone, address, client IDs, idempotency keys, or internal pricing data. Status changes require `orders:update` and follow: `pending → preparing|cancelled`, `preparing → ready|cancelled`, `ready → completed|cancelled`.

Webhook subscriptions require `webhooks:manage` and support `order.created` and `order.status_changed`. Events have `evt_` IDs. Every delivery is deduplicated per event/subscription, signed as `X-RMS-Signature: sha256=<HMAC-SHA256(body)>`, carries `X-RMS-Event-ID`, records delivery status, and retries exponentially up to six times. The subscription secret is returned only once, at creation.

### Response (`201 Created`):
```json
{
  "success": true,
  "data": {
    "order_id": "ord_8b417c8a149c450f83e2",
    "order_number": "#105",
    "status": "pending",
    "payment_status": "pending",
    "pricing": {
      "subtotal": 600,
      "discount_total": 100,
      "delivery_fee": 45,
      "tax_rate": 14,
      "tax_amount": 70,
      "grand_total": 615,
      "currency": "EGP"
    },
    "items_count": 1,
    "created_at": "2026-08-20T09:47:00.000Z"
  },
  "request_id": "827bb7c8-04a7-4d56-aff4-fe93e9b53275"
}
```
