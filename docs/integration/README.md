# Universal RMS Integration Guide & Developer Portal

Welcome to the Universal Restaurant Management System (RMS) Integration Platform. This portal documents how external websites, mobile apps, kiosks, and third-party services connect to the RMS platform for any restaurant tenant.

## Integration Topics

1. [Universal Integration Onboarding](./onboarding.md) — Onboard new channels, manage credentials, and configure rate limits.
2. [Authentication & Credentials](./authentication.md) — API keys, scopes, headers, and client management.
3. [Catalog & Menu](./menu.md) — Retrieving categories, items, and branch availability.
4. [Delivery & Zones](./delivery.md) — Delivery zones, coverage checking, and fees.
5. [Server-Authoritative Pricing](./pricing.md) — Calculating deterministic subtotals, coupons, taxes, and grand totals.
6. [Order Creation & Idempotency](./orders.md) — Secure order placement with deduplication guarantees.
7. [Order Tracking](./tracking.md) — Polling and fetching real-time, customer-safe order updates.
8. [Webhooks & HMAC Verification](./webhooks.md) — Real-time event subscription with HMAC-SHA256 signatures.
9. [Security & Best Practices](./security.md) — Best practices, PII protection, rate limits, and CORS.
10. [Reference Example (Sushi Bar)](./sushi-bar-example.md) — Reference implementation walkthrough.

## Official Universal TypeScript SDK

```typescript
import { RmsApiClient } from '@rms/sdk';

const rms = new RmsApiClient({
  baseUrl: 'https://api.your-rms.com/api/v1',
  apiKey: process.env.RMS_API_KEY!,
});

// Generic operations for any restaurant tenant
const menu = await rms.getMenu();
const pricing = await rms.previewPricing({
  branch_id: 'branch_1',
  order_type: 'delivery',
  items: [{ product_id: 'prod_1', quantity: 2 }],
});
```
