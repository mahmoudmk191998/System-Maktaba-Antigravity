import { MetricsSnapshot, MetricsStore } from './metricsStore.types.js';

interface HistogramData {
  sum: number;
  count: number;
}

export class InMemoryMetricsStore implements MetricsStore {
  private counters = new Map<string, number>();
  private gauges = new Map<string, number>();
  private histograms = new Map<string, HistogramData>();

  private formatKey(name: string, labels?: Record<string, string>): string {
    if (!labels || Object.keys(labels).length === 0) return name;
    const labelStr = Object.entries(labels)
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([k, v]) => `${k}="${v}"`)
      .join(',');
    return `${name}{${labelStr}}`;
  }

  incrementCounter(name: string, value: number = 1, labels?: Record<string, string>): void {
    const key = this.formatKey(name, labels);
    const curr = this.counters.get(key) || 0;
    this.counters.set(key, curr + value);

    // Also track global counter without labels
    if (labels) {
      const baseCurr = this.counters.get(name) || 0;
      this.counters.set(name, baseCurr + value);
    }
  }

  setGauge(name: string, value: number, labels?: Record<string, string>): void {
    const key = this.formatKey(name, labels);
    this.gauges.set(key, value);
    if (labels) {
      this.gauges.set(name, value);
    }
  }

  recordHistogram(name: string, value: number, labels?: Record<string, string>): void {
    const key = this.formatKey(name, labels);
    const data = this.histograms.get(key) || { sum: 0, count: 0 };
    data.sum += value;
    data.count += 1;
    this.histograms.set(key, data);

    if (labels) {
      const baseData = this.histograms.get(name) || { sum: 0, count: 0 };
      baseData.sum += value;
      baseData.count += 1;
      this.histograms.set(name, baseData);
    }
  }

  async getSnapshot(tenantId?: string): Promise<MetricsSnapshot> {
    const prefix = tenantId ? `tenant_id="${tenantId}"` : '';

    const getCounter = (name: string): number => {
      if (!tenantId) return this.counters.get(name) || 0;
      let total = 0;
      for (const [key, val] of this.counters.entries()) {
        if (key.startsWith(name) && key.includes(prefix)) {
          total += val;
        }
      }
      return total;
    };

    const getAvg = (name: string): number => {
      const data = this.histograms.get(name);
      if (!data || data.count === 0) return 0;
      return Math.round((data.sum / data.count) * 100) / 100;
    };

    return {
      api_requests_total: getCounter('api_requests_total'),
      api_errors_total: getCounter('api_errors_total'),
      api_request_duration_avg_ms: getAvg('api_request_duration_ms'),
      orders_created_total: getCounter('orders_created_total'),
      orders_failed_total: getCounter('orders_failed_total'),
      webhook_deliveries_total: getCounter('webhook_deliveries_total'),
      webhook_delivery_failures_total: getCounter('webhook_delivery_failures_total'),
      webhook_retries_total: getCounter('webhook_retries_total'),
      webhook_dead_letters_total: getCounter('webhook_dead_letters_total'),
      webhook_delivery_duration_avg_ms: getAvg('webhook_delivery_duration_ms'),
      rate_limit_exceeded_total: getCounter('rate_limit_exceeded_total'),
      active_integrations: this.gauges.get(tenantId ? `active_integrations{tenant_id="${tenantId}"}` : 'active_integrations') || 0,
      queue_depth: this.gauges.get('queue_depth') || 0,
    };
  }

  reset(): void {
    this.counters.clear();
    this.gauges.clear();
    this.histograms.clear();
  }
}
