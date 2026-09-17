import { MetricsStore } from './metricsStore.types.js';
import { InMemoryMetricsStore } from './inMemoryMetricsStore.js';

export function createMetricsStore(): MetricsStore {
  return new InMemoryMetricsStore();
}

export const defaultMetricsStore: MetricsStore = createMetricsStore();
