export interface LogEntry {
  level: 'info' | 'warn' | 'error' | 'debug';
  message: string;
  request_id?: string;
  client_id?: string;
  tenant_id?: string;
  endpoint?: string;
  method?: string;
  status?: number;
  response_time_ms?: number;
  timestamp: string;
  details?: any;
}

const SENSITIVE_KEYS = [
  'password',
  'client_secret',
  'client_secret_hash',
  'token',
  'authorization',
  'private_key',
  'secret',
  'api_key',
  'webhook_secret',
  'cookie',
  'card_number',
  'cvv',
  'credit_card',
];

export function sanitize(data: any): any {
  if (!data || typeof data !== 'object') return data;
  if (Array.isArray(data)) return data.map(sanitize);

  const cleaned: Record<string, any> = {};
  for (const [key, value] of Object.entries(data)) {
    const lowerKey = key.toLowerCase();
    if (SENSITIVE_KEYS.some((s) => lowerKey.includes(s))) {
      cleaned[key] = '[REDACTED]';
    } else if (typeof value === 'object' && value !== null) {
      cleaned[key] = sanitize(value);
    } else {
      cleaned[key] = value;
    }
  }
  return cleaned;
}

export const logger = {
  info(message: string, context: Partial<LogEntry> = {}) {
    outputLog('info', message, context);
  },
  warn(message: string, context: Partial<LogEntry> = {}) {
    outputLog('warn', message, context);
  },
  error(message: string, context: Partial<LogEntry> = {}) {
    outputLog('error', message, context);
  },
  debug(message: string, context: Partial<LogEntry> = {}) {
    if (process.env.NODE_ENV === 'development' || process.env.NODE_ENV === 'test') {
      outputLog('debug', message, context);
    }
  },
};

function outputLog(level: LogEntry['level'], message: string, context: Partial<LogEntry>) {
  const entry: LogEntry = {
    level,
    message,
    timestamp: new Date().toISOString(),
    ...context,
    details: context.details ? sanitize(context.details) : undefined,
  };

  const output = JSON.stringify(entry);
  if (level === 'error') {
    console.error(output);
  } else if (level === 'warn') {
    console.warn(output);
  } else {
    console.log(output);
  }
}
