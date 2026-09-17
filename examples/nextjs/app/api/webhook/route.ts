import { NextRequest, NextResponse } from 'next/server';
import { RmsApiClient } from '../../../../server/src/integration/index.js';

export async function POST(req: NextRequest) {
  const secret = process.env.RMS_WEBHOOK_SECRET!;
  const rawBody = await req.text();
  const timestamp = req.headers.get('x-rms-timestamp');
  const signature = req.headers.get('x-rms-signature');

  const check = RmsApiClient.verifyWebhookSignature(secret, rawBody, timestamp, signature);
  if (!check.isValid) {
    return NextResponse.json({ error: check.error }, { status: 401 });
  }

  const event = JSON.parse(rawBody);
  console.log(`[Next.js Webhook] Processed ${event.event_type} for order ${event.order_id}`);

  return NextResponse.json({ received: true });
}
