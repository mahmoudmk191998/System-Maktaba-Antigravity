# RMS — Restaurant Management System & REST API Platform

A multi-tenant Restaurant Management System (RMS) with a centralized POS frontend and an enterprise-grade REST API integration layer for external restaurant websites (e.g. Sushi Bar, mobile apps, online ordering portals).

---

## Architecture Overview

```
External Restaurant Apps / Websites (e.g. Sushi Bar)
                  │
                  ▼ (Official RmsApiClient SDK)
      HTTPS REST API (/api/v1)
                  │
                  ▼ (Tenant & Branch Isolation, Rate Limiting, Idempotency)
      RMS Backend (Express, Node.js, TypeScript)
                  │
                  ▼ (Firebase Admin SDK)
        Cloud Firestore & Storage
```

---

## Integration SDK (`@rms/sdk`)

The official TypeScript SDK is located at `server/src/integration/` and provides typed methods, error mapping, safe retry, and HMAC webhook verification.

### Installation & Initialization

```typescript
import { RmsApiClient } from './server/src/integration/index.js';

const client = new RmsApiClient({
  baseUrl: process.env.RMS_BASE_URL || 'http://localhost:4000/api/v1',
  apiKey: process.env.RMS_API_KEY || 'rms_live_cli_xxxx.rms_sec_yyyy',
  branchId: 'branch_sushi_main',
  timeoutMs: 10000,
});
```

### Complete Integration Flow (Sushi Bar Example)

```typescript
// 1. Fetch Menu & Categories
const menu = await client.getMenu();

// 2. Authoritative Price Preview (Server-Side)
const pricing = await client.previewPricing({
  branch_id: 'branch_sushi_main',
  order_type: 'delivery',
  delivery_zone_id: 'zone_zamalek',
  coupon_code: 'WELCOME20',
  items: [{ product_id: 'prod_california', quantity: 2 }]
});

// 3. Place Order with Idempotency Key
const order = await client.createOrder({
  branch_id: 'branch_sushi_main',
  order_type: 'delivery',
  delivery: { zone_id: 'zone_zamalek', address: '15 Brazil St, Zamalek' },
  customer: { name: 'Customer Name', phone: '01012345678' },
  items: [{ product_id: 'prod_california', quantity: 2 }],
  payment_method: 'cash'
}, 'unique_order_idempotency_key');

// 4. Live Order Tracking
const trackedOrder = await client.getOrder(order.order_id);
```

---

## Webhook Verification (HMAC-SHA256)

```typescript
import { RmsApiClient } from './server/src/integration/index.js';

const verification = RmsApiClient.verifyWebhookSignature(
  process.env.RMS_WEBHOOK_SECRET!,
  rawBodyString,
  req.headers['x-rms-timestamp'],
  req.headers['x-rms-signature'],
  300 // 5-minute replay window
);

if (!verification.isValid) {
  return res.status(401).send(verification.error);
}
```

---

## Environment Variables

| Variable | Description | Default |
| :--- | :--- | :--- |
| `PORT` | API Server port | `4000` |
| `NODE_ENV` | Environment mode (`development`, `test`, `production`) | `development` |
| `API_RATE_LIMIT_DEFAULT` | Requests / min for Free tier | `100` |
| `API_RATE_LIMIT_STANDARD` | Requests / min for Standard tier | `500` |
| `API_RATE_LIMIT_PREMIUM` | Requests / min for Premium tier | `2000` |
| `ALLOWED_ORIGINS` | Comma-separated list of allowed origins | `http://localhost:3000,http://localhost:5173` |

---

## Security Checklist for Production

- [x] **Store API Secrets Securely**: Never expose `rms_sec_` keys in client-side bundles or git repositories.
- [x] **Server-Authoritative Pricing**: External apps must never calculate totals or modify line prices.
- [x] **Idempotent Checkout**: Always pass `Idempotency-Key` headers on order submissions.
- [x] **Replay Protection**: Verify `X-RMS-Timestamp` within 300s window on all webhook endpoints.
- [x] **Tiered Rate Limiting**: Monitor `X-RateLimit-*` headers and handle `Retry-After` on HTTP 429.
