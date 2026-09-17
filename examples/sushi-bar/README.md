# Sushi Bar External Website — RMS API Integration Example

This example demonstrates how an external restaurant website (e.g. **Sushi Bar**) integrates with the RMS REST API using the official TypeScript SDK.

## Architecture

```
Sushi Bar Customer Browser / App
               │
               ▼
Sushi Bar Next.js / Node.js Backend
               │ (RmsApiClient SDK)
               │ Authorization: Bearer rms_live_cli_xxxx.rms_sec_yyyy
               ▼
RMS Central REST API (/api/v1)
               │ (Server-Side Deterministic Engine)
               ▼
Firestore & Restaurant POS
```

## Security Guarantees

1. **No Firebase Credentials on Client**: Sushi Bar never receives direct Firestore or Firebase Admin credentials.
2. **Server-Authoritative Pricing**: Sushi Bar never calculates prices or discounts client-side; it calls `previewPricing()` and submits raw item IDs to `createOrder()`.
3. **Idempotency**: All order submissions include an `Idempotency-Key` header to prevent double charges on connection dropouts.
4. **HMAC Webhook Verification**: Order status updates received at Sushi Bar's webhook endpoint are verified using `RmsApiClient.verifyWebhookSignature()`.

## Files in this Example

- `rms-client.ts` — SDK client initialization with environment variables.
- `menu.ts` — Fetching active branches, categories, products, and addons.
- `checkout.ts` — Pricing preview and idempotent order creation.
- `order-tracking.ts` — Fetching real-time customer-safe order status.
- `webhook-verification.ts` — Express.js handler for receiving and validating order status webhooks.
