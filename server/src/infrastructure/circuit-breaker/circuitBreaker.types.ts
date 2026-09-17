export type CircuitState = 'CLOSED' | 'OPEN' | 'HALF_OPEN';

export interface CircuitBreakerConfig {
  failureThreshold: number; // e.g. 5 failures
  cooldownSeconds: number; // e.g. 60 seconds
  halfOpenRequests: number; // e.g. 1 probe request
}

export interface CircuitBreakerStatus {
  state: CircuitState;
  consecutive_failures: number;
  consecutive_successes: number;
  opened_at?: string;
  cooldown_until?: string;
  probe_requests_allowed: number;
}

export interface CircuitBreaker {
  canAttempt(tenantId: string, endpointId: string): Promise<boolean>;
  recordSuccess(tenantId: string, endpointId: string): Promise<void>;
  recordFailure(tenantId: string, endpointId: string): Promise<void>;
  getState(tenantId: string, endpointId: string): Promise<CircuitBreakerStatus>;
  reset(tenantId?: string, endpointId?: string): Promise<void>;
}
