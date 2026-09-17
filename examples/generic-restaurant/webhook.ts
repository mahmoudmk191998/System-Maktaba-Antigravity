import { RmsApiClient } from '../../server/src/integration/index.js';

const RMS_WEBHOOK_SECRET = process.env.RMS_WEBHOOK_SECRET || 'whsec_sample_secret';

export function handleIncomingWebhook(
  rawBody: string,
  timestampHeader?: string | null,
  signatureHeader?: string | null
) {
  const result = RmsApiClient.verifyWebhookSignature(
    RMS_WEBHOOK_SECRET,
    rawBody,
    timestampHeader,
    signatureHeader,
    300 // 5 minutes tolerance
  );

  if (!result.isValid) {
    throw new Error(`Webhook Signature Verification Failed: ${result.error}`);
  }

  const payload = JSON.parse(rawBody);
  console.log(`[Webhook Event Received] Type: ${payload.event_type}, Order: ${payload.order_id}`);
  return { success: true, event: payload.event_type };
}
