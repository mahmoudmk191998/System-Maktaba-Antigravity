import crypto from 'crypto';
import bcrypt from 'bcryptjs';

const SALT_ROUNDS = 10;

export function generateClientId(): string {
  const random = crypto.randomBytes(12).toString('hex');
  return `cli_${random}`;
}

export function generateClientSecret(): string {
  const random = crypto.randomBytes(24).toString('hex');
  return `rms_sec_${random}`;
}

export function createCredentialString(clientId: string, clientSecret: string): string {
  return `rms_live_${clientId}.${clientSecret}`;
}

export function parseCredentialString(credential: string): { clientId: string; secret: string } | null {
  if (!credential) return null;

  // Format 1: rms_live_<clientId>.<secret>
  if (credential.startsWith('rms_live_')) {
    const withoutPrefix = credential.slice('rms_live_'.length);
    const dotIndex = withoutPrefix.indexOf('.');
    if (dotIndex > 0) {
      const clientId = withoutPrefix.slice(0, dotIndex);
      const secret = withoutPrefix.slice(dotIndex + 1);
      if (clientId && secret) {
        return { clientId, secret };
      }
    }
  }

  // Format 2: <clientId>:<secret>
  const colonIndex = credential.indexOf(':');
  if (colonIndex > 0) {
    const clientId = credential.slice(0, colonIndex);
    const secret = credential.slice(colonIndex + 1);
    if (clientId && secret) {
      return { clientId, secret };
    }
  }

  return null;
}

export async function hashSecret(secret: string): Promise<string> {
  return bcrypt.hash(secret, SALT_ROUNDS);
}

export async function verifySecret(secret: string, hash: string): Promise<boolean> {
  return bcrypt.compare(secret, hash);
}

export function hashPinWithSalt(pin: string, customSalt?: string): string {
  const salt = customSalt || crypto.randomBytes(16).toString('hex');
  const hash = crypto.createHash('sha256').update(`${salt}:${pin}`).digest('hex');
  return `v1$${salt}$${hash}`;
}

export async function verifyEmployeePin(pin: string, storedHash: string): Promise<boolean> {
  if (!storedHash) return false;
  if (storedHash.startsWith('v1$')) {
    const parts = storedHash.split('$');
    if (parts.length !== 3) return false;
    const salt = parts[1];
    const expected = hashPinWithSalt(pin, salt);
    return expected === storedHash;
  }
  if (storedHash.startsWith('$2a$') || storedHash.startsWith('$2b$')) {
    return bcrypt.compare(pin, storedHash);
  }
  // Plaintext backward-compatibility fallback
  return storedHash === pin;
}
