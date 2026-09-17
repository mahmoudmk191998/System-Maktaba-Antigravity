import crypto from 'crypto';

export interface VerifyWebhookSignatureOptions {
  signatureHeader: string; // e.g. 't=1711234567,v1=abcdef...'
  rawBody: string | Buffer;
  secret: string; // e.g. 'whsec_...'
  toleranceSeconds?: number; // default 300 seconds (5 mins)
}

export function verifyWebhookSignature({
  signatureHeader,
  rawBody,
  secret,
  toleranceSeconds = 300,
}: VerifyWebhookSignatureOptions): boolean {
  if (!signatureHeader || !rawBody || !secret) {
    return false;
  }

  const elements = signatureHeader.split(',');
  let timestamp: string | undefined;
  let signature: string | undefined;

  for (const el of elements) {
    const [key, value] = el.split('=');
    if (key === 't') timestamp = value;
    if (key === 'v1') signature = value;
  }

  if (!timestamp || !signature) {
    return false;
  }

  const tsNumber = parseInt(timestamp, 10);
  if (isNaN(tsNumber)) {
    return false;
  }

  // Tolerance check
  const now = Math.floor(Date.now() / 1000);
  if (Math.abs(now - tsNumber) > toleranceSeconds) {
    return false;
  }

  const bodyStr = typeof rawBody === 'string' ? rawBody : rawBody.toString('utf-8');
  const payloadToSign = `${timestamp}.${bodyStr}`;

  const expectedSignature = crypto
    .createHmac('sha256', secret)
    .update(payloadToSign)
    .digest('hex');

  // Constant-time comparison
  try {
    return crypto.timingSafeEqual(
      Buffer.from(signature, 'hex'),
      Buffer.from(expectedSignature, 'hex')
    );
  } catch (_) {
    return false;
  }
}
