# Webhooks & Signature Verification

Subscribe to real-time order lifecycle events delivered via secure HTTP POST.

## Headers Sent with Delivery
- `X-RMS-Event-ID`: Unique event identifier (e.g. `evt_...`)
- `X-RMS-Event-Type`: Type of event (e.g. `order.status_updated`)
- `X-RMS-Timestamp`: Unix timestamp (seconds)
- `X-RMS-Signature`: `t=<timestamp>,v1=<hmac_sha256_hex>`
- `X-RMS-Request-ID`: Correlation trace identifier

## Verifying Signatures in Node.js
```typescript
import { verifyWebhookSignature } from '@rms/sdk';

const isValid = verifyWebhookSignature({
  signatureHeader: req.headers['x-rms-signature'],
  rawBody: req.rawBody,
  secret: process.env.RMS_WEBHOOK_SECRET!,
});

if (!isValid) {
  return res.status(401).send('Invalid signature');
}
```
