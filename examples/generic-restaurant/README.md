# Generic Restaurant Universal Integration

This example demonstrates how any external restaurant website, kiosk, or mobile backend can connect to the RMS platform using the Universal Integration Architecture.

## Architecture Pattern

```
User (Browser / Mobile App)
          ↓
External Server / Backend (Next.js Server Actions / Express API)
          ↓
HTTPS REST API with Bearer Token (Authorization: Bearer rms_live_...)
          ↓
RMS Backend (Deterministic Pricing & Snapshots)
```

## Security Best Practices
1. **Never expose RMS API keys in browser bundles**: Call the RMS API exclusively from your server/backend environment.
2. **Server-Side Pricing**: Never compute discounts, taxes, or delivery fees locally on the client. Always call `rms.previewPricing()`.
3. **Idempotent Ordering**: Provide a unique `idempotency_key` (e.g. UUIDv4) for every checkout attempt.
4. **Webhook HMAC**: Verify the HMAC-SHA256 signature using `RmsApiClient.verifyWebhookSignature()` with the raw request body.
