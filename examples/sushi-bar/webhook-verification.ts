import express from 'express';
import { RmsApiClient } from '../../server/src/integration/index.js';

const app = express();
const WEBHOOK_SECRET = process.env.RMS_WEBHOOK_SECRET || 'whsec_sample_secret';

// Use express.raw or text parser so the raw body is preserved untouched for signature verification
app.post(
  '/api/webhooks/rms',
  express.text({ type: 'application/json' }),
  (req, res) => {
    const rawBody = req.body as string;
    const timestamp = req.header('X-RMS-Timestamp');
    const signature = req.header('X-RMS-Signature');
    const eventId = req.header('X-RMS-Event-ID');

    // 1. Verify HMAC-SHA256 signature with replay protection (5-minute tolerance)
    const verification = RmsApiClient.verifyWebhookSignature(
      WEBHOOK_SECRET,
      rawBody,
      timestamp,
      signature,
      300
    );

    if (!verification.isValid) {
      console.warn(`[Webhook Rejected] ${verification.error}`);
      return res.status(401).json({ success: false, error: verification.error });
    }

    // 2. Parse payload safely after successful verification
    const event = JSON.parse(rawBody);
    console.log(`[Webhook Verified] Received event ${eventId}:`, event.event_type);

    // 3. Handle specific event types
    switch (event.event_type) {
      case 'order.confirmed':
        console.log(`Order ${event.payload.order_id} confirmed by kitchen`);
        break;
      case 'order.out_for_delivery':
        console.log(`Order ${event.payload.order_id} is out for delivery with courier`);
        break;
      case 'order.delivered':
        console.log(`Order ${event.payload.order_id} marked delivered`);
        break;
      default:
        console.log(`Unhandled event type: ${event.event_type}`);
    }

    // Acknowledge receipt with 200 OK
    res.status(200).json({ success: true, received: true });
  }
);
