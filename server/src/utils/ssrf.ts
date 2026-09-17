import { env } from '../config/environment.js';

const BLOCKED_HOSTNAMES = [
  'localhost',
  '127.0.0.1',
  '0.0.0.0',
  '::1',
  'metadata.google.internal',
  '169.254.169.254', // AWS/GCP metadata service
  'instance-data',
];

const PRIVATE_IP_PATTERNS = [
  /^10\./, // 10.0.0.0/8
  /^127\./, // 127.0.0.0/8
  /^192\.168\./, // 192.168.0.0/16
  /^172\.(1[6-9]|2[0-9]|3[0-1])\./, // 172.16.0.0/12
  /^169\.254\./, // 169.254.0.0/16 link-local
  /^fc00:/i, // IPv6 unique local
  /^fe80:/i, // IPv6 link-local
];

export function validateSafeWebhookUrl(urlStr: string): { isValid: boolean; error?: string } {
  let parsed: URL;
  try {
    parsed = new URL(urlStr);
  } catch (_) {
    return { isValid: false, error: 'Malformed or invalid URL' };
  }

  // 1. Protocol validation: HTTPS required in production
  if (env.NODE_ENV === 'production') {
    if (parsed.protocol !== 'https:') {
      return { isValid: false, error: 'Webhook URLs must use HTTPS in production' };
    }
  } else {
    if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
      return { isValid: false, error: 'Webhook URLs must use HTTP or HTTPS' };
    }
  }

  const hostname = parsed.hostname.toLowerCase();

  // 2. SSRF Protection: Block loopback and internal metadata hostnames
  if (BLOCKED_HOSTNAMES.includes(hostname) || hostname.endsWith('.localhost') || hostname.endsWith('.internal')) {
    return { isValid: false, error: `Webhook destination '${hostname}' is disallowed (SSRF protection: loopback or internal host)` };
  }

  // 3. SSRF Protection: Block private IP ranges
  for (const pattern of PRIVATE_IP_PATTERNS) {
    if (pattern.test(hostname)) {
      return { isValid: false, error: `Webhook destination '${hostname}' is disallowed (SSRF protection: private IP range)` };
    }
  }

  // 4. Disallow ports commonly associated with internal services if specified
  const port = parsed.port ? parseInt(parsed.port, 10) : null;
  const DISALLOWED_PORTS = [22, 25, 111, 2375, 2376, 3306, 5432, 6379, 8080, 9200, 27017];
  if (port && DISALLOWED_PORTS.includes(port)) {
    return { isValid: false, error: `Webhook port ${port} is disallowed` };
  }

  return { isValid: true };
}
