export interface MetricRecord {
  name: string;
  value: number;
  labels?: Record<string, string>;
  timestamp: string;
}

export interface MetricsSnapshot {
  api_requests_total: number;
  api_errors_total: number;
  api_request_duration_avg_ms: number;
  orders_created_total: number;
  orders_failed_total: number;
  webhook_deliveries_total: number;
  webhook_delivery_failures_total: number;
  webhook_retries_total: number;
  webhook_dead_letters_total: number;
  webhook_delivery_duration_avg_ms: number;
  rate_limit_exceeded_total: number;
  active_integrations: number;
  queue_depth: number;
  custom_metrics?: Record<string, number>;
}

export interface MetricsStore {
  incrementCounter(name: string, value?: number, labels?: Record<string, string>): void;
  setGauge(name: string, value: number, labels?: Record<string, string>): void;
  recordHistogram(name: string, value: number, labels?: Record<string, string>): void;
  getSnapshot(tenantId?: string): Promise<MetricsSnapshot>;
  reset(): void;
}
