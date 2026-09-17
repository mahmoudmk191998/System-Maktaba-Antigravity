import { RmsEvent, PublicRmsEvent } from './event.types.js';
import { ValidationError } from '../../utils/errors.js';

export function validateEventEnvelope(event: unknown): RmsEvent {
  if (!event || typeof event !== 'object') {
    throw new ValidationError('Invalid event envelope: must be an object');
  }

  const evt = event as Partial<RmsEvent>;

  if (!evt.id || typeof evt.id !== 'string') {
    throw new ValidationError('Invalid event envelope: missing id');
  }
  if (!evt.type || typeof evt.type !== 'string') {
    throw new ValidationError('Invalid event envelope: missing type');
  }
  if (!evt.tenant_id || typeof evt.tenant_id !== 'string') {
    throw new ValidationError('Invalid event envelope: missing tenant_id');
  }
  if (!evt.resource_type || typeof evt.resource_type !== 'string') {
    throw new ValidationError('Invalid event envelope: missing resource_type');
  }
  if (!evt.resource_id || typeof evt.resource_id !== 'string') {
    throw new ValidationError('Invalid event envelope: missing resource_id');
  }
  if (!evt.timestamp || typeof evt.timestamp !== 'string') {
    throw new ValidationError('Invalid event envelope: missing timestamp');
  }

  return evt as RmsEvent;
}

const SENSITIVE_KEYS = [
  'secret',
  'client_secret',
  'webhook_secret',
  'password',
  'password_hash',
  'private_key',
  'card_number',
  'cvv',
  'auth_token',
  'token',
];

export function sanitizePayloadData<T>(data: T): T {
  if (!data || typeof data !== 'object') return data;

  if (Array.isArray(data)) {
    return data.map((item) => sanitizePayloadData(item)) as unknown as T;
  }

  const clone: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(data as Record<string, unknown>)) {
    const isSensitive = SENSITIVE_KEYS.some((sk) => k.toLowerCase().includes(sk));
    if (isSensitive) {
      clone[k] = '<REDACTED>';
    } else if (typeof v === 'object' && v !== null) {
      clone[k] = sanitizePayloadData(v);
    } else {
      clone[k] = v;
    }
  }

  return clone as T;
}

export function toPublicEvent<T>(event: RmsEvent<T>): PublicRmsEvent<T> {
  return {
    id: event.id,
    type: event.type,
    version: event.version,
    tenant_id: event.tenant_id,
    integration_id: event.integration_id,
    branch_id: event.branch_id,
    resource_type: event.resource_type,
    resource_id: event.resource_id,
    request_id: event.request_id,
    timestamp: event.timestamp,
    data: sanitizePayloadData(event.data),
    metadata: event.metadata ? sanitizePayloadData(event.metadata) : undefined,
  };
}
