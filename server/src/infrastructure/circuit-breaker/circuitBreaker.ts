import { CircuitBreaker } from './circuitBreaker.types.js';
import { InMemoryCircuitBreaker } from './inMemoryCircuitBreaker.js';

export function createCircuitBreaker(): CircuitBreaker {
  return new InMemoryCircuitBreaker();
}

export const defaultCircuitBreaker: CircuitBreaker = createCircuitBreaker();
