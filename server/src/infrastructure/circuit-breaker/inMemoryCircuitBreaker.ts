import {
  CircuitBreaker,
  CircuitBreakerConfig,
  CircuitBreakerStatus,
  CircuitState,
} from './circuitBreaker.types.js';
import { env } from '../../config/environment.js';

interface EndpointCircuitData {
  state: CircuitState;
  consecutiveFailures: number;
  consecutiveSuccesses: number;
  openedAt?: number;
  cooldownUntil?: number;
  activeProbes: number;
}

export class InMemoryCircuitBreaker implements CircuitBreaker {
  private circuits = new Map<string, EndpointCircuitData>();
  private config: CircuitBreakerConfig;

  constructor(config?: Partial<CircuitBreakerConfig>) {
    this.config = {
      failureThreshold: config?.failureThreshold ?? env.WEBHOOK_CIRCUIT_FAILURE_THRESHOLD,
      cooldownSeconds: config?.cooldownSeconds ?? env.WEBHOOK_CIRCUIT_COOLDOWN_SECONDS,
      halfOpenRequests: config?.halfOpenRequests ?? env.WEBHOOK_CIRCUIT_HALF_OPEN_REQUESTS,
    };
  }

  private getKey(tenantId: string, endpointId: string): string {
    return `${tenantId}:${endpointId}`;
  }

  private getOrCreate(key: string): EndpointCircuitData {
    let data = this.circuits.get(key);
    if (!data) {
      data = {
        state: 'CLOSED',
        consecutiveFailures: 0,
        consecutiveSuccesses: 0,
        activeProbes: 0,
      };
      this.circuits.set(key, data);
    }
    return data;
  }

  async canAttempt(tenantId: string, endpointId: string): Promise<boolean> {
    const key = this.getKey(tenantId, endpointId);
    const data = this.getOrCreate(key);
    const now = Date.now();

    if (data.state === 'CLOSED') {
      return true;
    }

    if (data.state === 'OPEN') {
      if (data.cooldownUntil && now >= data.cooldownUntil) {
        // Transition from OPEN to HALF_OPEN
        data.state = 'HALF_OPEN';
        data.activeProbes = 0;
        this.circuits.set(key, data);
      } else {
        return false;
      }
    }

    if (data.state === 'HALF_OPEN') {
      if (data.activeProbes < this.config.halfOpenRequests) {
        data.activeProbes += 1;
        this.circuits.set(key, data);
        return true;
      }
      return false;
    }

    return true;
  }

  async recordSuccess(tenantId: string, endpointId: string): Promise<void> {
    const key = this.getKey(tenantId, endpointId);
    const data = this.getOrCreate(key);

    data.consecutiveSuccesses += 1;
    data.consecutiveFailures = 0;

    if (data.state === 'HALF_OPEN') {
      // Recovery to CLOSED
      data.state = 'CLOSED';
      data.openedAt = undefined;
      data.cooldownUntil = undefined;
      data.activeProbes = 0;
    }

    this.circuits.set(key, data);
  }

  async recordFailure(tenantId: string, endpointId: string): Promise<void> {
    const key = this.getKey(tenantId, endpointId);
    const data = this.getOrCreate(key);
    const now = Date.now();

    data.consecutiveFailures += 1;
    data.consecutiveSuccesses = 0;

    if (data.state === 'CLOSED') {
      if (data.consecutiveFailures >= this.config.failureThreshold) {
        data.state = 'OPEN';
        data.openedAt = now;
        data.cooldownUntil = now + this.config.cooldownSeconds * 1000;
      }
    } else if (data.state === 'HALF_OPEN') {
      // Immediate reversion to OPEN with cooldown renewal
      data.state = 'OPEN';
      data.openedAt = now;
      data.cooldownUntil = now + this.config.cooldownSeconds * 1000;
      data.activeProbes = 0;
    }

    this.circuits.set(key, data);
  }

  async getState(tenantId: string, endpointId: string): Promise<CircuitBreakerStatus> {
    const key = this.getKey(tenantId, endpointId);
    const data = this.getOrCreate(key);
    const now = Date.now();

    let effectiveState = data.state;
    if (data.state === 'OPEN' && data.cooldownUntil && now >= data.cooldownUntil) {
      effectiveState = 'HALF_OPEN';
    }

    return {
      state: effectiveState,
      consecutive_failures: data.consecutiveFailures,
      consecutive_successes: data.consecutiveSuccesses,
      opened_at: data.openedAt ? new Date(data.openedAt).toISOString() : undefined,
      cooldown_until: data.cooldownUntil ? new Date(data.cooldownUntil).toISOString() : undefined,
      probe_requests_allowed: this.config.halfOpenRequests,
    };
  }

  async reset(tenantId?: string, endpointId?: string): Promise<void> {
    if (tenantId && endpointId) {
      this.circuits.delete(this.getKey(tenantId, endpointId));
    } else {
      this.circuits.clear();
    }
  }
}
