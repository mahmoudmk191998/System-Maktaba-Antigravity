/**
 * Production Logger Abstraction (Phase 11)
 * Suppresses debug logs in production and strictly redacts sensitive keys:
 * passwords, auth tokens, PIN codes, and private keys.
 */

const SENSITIVE_KEYS = ['password', 'token', 'secret', 'pin', 'privatekey', 'apikey', 'auth'];

export function redactSensitiveData(data: any): any {
  if (data === null || data === undefined) return data;
  if (typeof data !== 'object') return data;

  if (Array.isArray(data)) {
    return data.map(redactSensitiveData);
  }

  const sanitized: Record<string, any> = {};
  for (const [key, value] of Object.entries(data)) {
    const lowerKey = key.toLowerCase();
    const isSensitive = SENSITIVE_KEYS.some((s) => lowerKey.includes(s));
    if (isSensitive) {
      sanitized[key] = '[REDACTED]';
    } else if (typeof value === 'object') {
      sanitized[key] = redactSensitiveData(value);
    } else {
      sanitized[key] = value;
    }
  }
  return sanitized;
}

const isProduction = import.meta.env.PROD;

export const logger = {
  debug: (...args: any[]) => {
    if (!isProduction) {
      console.debug(...args.map(redactSensitiveData));
    }
  },
  info: (...args: any[]) => {
    console.info(...args.map(redactSensitiveData));
  },
  warn: (...args: any[]) => {
    console.warn(...args.map(redactSensitiveData));
  },
  error: (...args: any[]) => {
    console.error(...args.map(redactSensitiveData));
  },
};
