# @rms/sdk

The official, universal TypeScript/JavaScript SDK for the **Restaurant Management System (RMS)** REST API platform.

[![npm version](https://img.shields.io/npm/v/@rms/sdk.svg)](https://www.npmjs.com/package/@rms/sdk)
[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](https://opensource.org/licenses/MIT)

## Features

- **TypeScript-First**: Full type definitions, autocomplete, and strict parameter typing.
- **Universal Multi-Tenant Support**: Works for any restaurant website, kiosk, mobile application, POS terminal, or third-party integrator.
- **Authoritative Pricing & Snapshots**: Integrate directly with the RMS server-side pricing engine.
- **Idempotency Built-In**: Safe order submissions with automatic deduplication.
- **HMAC Webhook Verification**: Constant-time signature verification with replay attack protection.
- **Production Resilience**: Configurable automatic exponential backoff retries and typed error handling.

---

## Installation

```bash
npm install @rms/sdk
```

Or using yarn / pnpm / bun:

```bash
pnpm add @rms/sdk
# or
yarn add @rms/sdk
# or
bun add @rms/sdk
```

### Supported Runtimes
- **Node.js**: `v18.0.0` or higher
- **Modern Edge Runtimes**: Next.js App Router (Server Actions & Route Handlers), Cloudflare Workers, Deno, Bun.

---

## Quickstart

```typescript
import { RmsApiClient } from '@rms/sdk';

const rms = new RmsApiClient({
  baseUrl: process.env.RMS_API_URL || 'https://api.your-restaurant.com/api/v1',
  apiKey: process.env.RMS_API_KEY!,
  timeoutMs: 10000,
  maxRetries: 2,
});

// 1. Fetch Menu Catalog
const menu = await rms.getMenu();
console.log('Categories:', menu.categories);

// 2. Fetch Branches
const branches = await rms.getBranches();
console.log('Available branches:', branches);
```

---

## Usage Examples

### 1. Authoritative Pricing Preview

Preview total costs including branch taxes, delivery fees, and coupons before placing an order:

```typescript
const preview = await rms.previewPricing({
  branch_id: 'branch_downtown_01',
  order_type: 'delivery',
  items: [
    {
      product_id: 'prod_98765',
      quantity: 2,
      addons: [{ addon_id: 'addon_extra_sauce', quantity: 1 }],
    },
  ],
  coupon_code: 'WELCOME10',
});

console.log('Subtotal:', preview.subtotal);
console.log('Tax:', preview.tax);
console.log('Delivery Fee:', preview.delivery_fee);
console.log('Total:', preview.total);
```

---

### 2. Idempotent Order Creation

Submit an order safely using a unique `Idempotency-Key` to prevent accidental duplicate charges or duplicate orders:

```typescript
import { RmsConflictError, RmsValidationError } from '@rms/sdk';

try {
  const order = await rms.createOrder(
    {
      branch_id: 'branch_downtown_01',
      order_type: 'delivery',
      items: [
        {
          product_id: 'prod_98765',
          quantity: 2,
        },
      ],
      customer: {
        name: 'Jane Doe',
        phone: '+1-555-0199',
        email: 'jane@example.com',
      },
      delivery_address: {
        street: '123 Main Street',
        city: 'Metropolis',
        notes: 'Ring doorbell twice',
      },
      payment_method: 'credit_card',
    },
    {
      idempotencyKey: 'order_checkout_sess_abc12345',
    }
  );

  console.log('Order created:', order.order_id, 'Order #:', order.order_number);
} catch (error) {
  if (error instanceof RmsConflictError) {
    console.error('Duplicate submission conflict:', error.message);
  } else if (error instanceof RmsValidationError) {
    console.error('Validation error:', error.message, error.details);
  } else {
    console.error('Order creation failed:', error);
  }
}
```

---

### 3. Webhook Signature Verification

Verify incoming webhook payloads from the RMS platform using constant-time HMAC-SHA256 signature verification:

```typescript
import { verifyWebhookSignature } from '@rms/sdk';

// In an Express / Next.js API Route:
export async function POST(req: Request) {
  const signatureHeader = req.headers.get('X-RMS-Signature') || '';
  const rawBody = await req.text();
  const webhookSecret = process.env.RMS_WEBHOOK_SECRET!;

  const isValid = verifyWebhookSignature({
    signatureHeader,
    rawBody,
    secret: webhookSecret,
    toleranceSeconds: 300, // Reject timestamps older than 5 minutes
  });

  if (!isValid) {
    return new Response('Invalid webhook signature', { status: 401 });
  }

  const event = JSON.parse(rawBody);
  console.log(`Received event: ${event.event} for tenant: ${event.tenant_id}`);
  
  return new Response('Webhook received', { status: 200 });
}
```

---

## Error Handling

The SDK exposes typed error classes extending `RmsError`:

| Error Class | HTTP Status | Description |
| :--- | :--- | :--- |
| `RmsAuthError` | 401 | Missing or invalid API key credential. |
| `RmsPermissionError` | 403 | Client lacks required permission or branch access. |
| `RmsNotFoundError` | 404 | Resource (product, branch, order) not found. |
| `RmsValidationError` | 400 | Request body or parameter schema validation error. |
| `RmsConflictError` | 409 | Idempotency payload conflict or state transition conflict. |
| `RmsRateLimitError` | 429 | Rate limit exceeded. Check `retryAfterSeconds`. |
| `RmsServerError` | 500, 502, 503 | Server-side or infrastructure error. |

```typescript
import { RmsRateLimitError } from '@rms/sdk';

try {
  await rms.getMenu();
} catch (error) {
  if (error instanceof RmsRateLimitError) {
    console.warn(`Rate limited. Retry after ${error.retryAfterSeconds} seconds.`);
  }
}
```

---

## Security Best Practices

1. **Never expose your API Key or Webhook Secret in client-side code / browser bundles**.
2. **Store credentials securely** using environment variables (`process.env.RMS_API_KEY`).
3. **Always supply an `Idempotency-Key`** when executing state-modifying requests such as `createOrder()`.
4. **Always pass the raw request body string** to `verifyWebhookSignature` (never parse and re-stringify JSON before verification).

---

## License

MIT © RMS Engineering Team
