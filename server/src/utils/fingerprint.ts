import crypto from 'crypto';

/**
 * Recursively sort object keys and normalize values to ensure deterministic hashing.
 */
function normalizePayload(obj: any): any {
  if (obj === null || typeof obj !== 'object') {
    return obj;
  }

  if (Array.isArray(obj)) {
    return obj.map(normalizePayload);
  }

  const sortedKeys = Object.keys(obj).sort();
  const normalized: Record<string, any> = {};

  for (const key of sortedKeys) {
    if (obj[key] !== undefined) {
      normalized[key] = normalizePayload(obj[key]);
    }
  }

  return normalized;
}

/**
 * Generate a deterministic SHA-256 hash of a request payload.
 */
export function generateRequestFingerprint(payload: any): string {
  const normalized = normalizePayload(payload);
  const jsonString = JSON.stringify(normalized);
  return crypto.createHash('sha256').update(jsonString).digest('hex');
}
