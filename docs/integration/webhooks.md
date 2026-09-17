# Webhooks & HMAC Verification

RMS delivers real-time notifications for order status transitions directly to your webhook HTTPS endpoint.

## Webhook Security Headers

Every webhook POST request includes:

- `X-RMS-Event-ID`: Unique event identifier (e.g. `evt_ord123_order_confirmed_1718000000`).
- `X-RMS-Timestamp`: Unix timestamp in seconds.
- `X-RMS-Signature`: HMAC signature in format `t=<timestamp>,v1=<signature>`.

## Signature Formula

$$\text{Signature} = \text{HMAC-SHA256}(\text{WebhookSecret}, \text{Timestamp} + "." + \text{RawBody})$$

## Verification with SDK

```typescript
import { RmsApiClient } from '@rms/sdk';

const result = RmsApiClient.verifyWebhookSignature(
  process.env.RMS_WEBHOOK_SECRET!,
  req.rawBody,
  req.headers['x-rms-timestamp'],
  req.headers['x-rms-signature'],
  300 // 5-minute replay tolerance
);

if (!result.isValid) {
  return res.status(401).send(result.error);
}
```
