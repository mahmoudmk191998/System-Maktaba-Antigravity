export interface ApiUsageEvent {
  id: string;
  tenant_id: string;
  client_id: string;
  endpoint: string;
  method: string;
  status_code: number;
  response_time_ms: number;
  request_id: string;
  timestamp: string;
}

export interface UsageFilterOptions {
  startDate?: string;
  endDate?: string;
  endpoint?: string;
  statusCode?: number;
  page?: number;
  pageSize?: number;
}

export interface ClientUsageSummary {
  client_id: string;
  tenant_id: string;
  total_requests: number;
  successful_requests: number;
  failed_requests: number;
  count_4xx: number;
  count_5xx: number;
  rate_limit_violations: number;
  avg_response_time_ms: number;
  events: ApiUsageEvent[];
  page: number;
  page_size: number;
  total_events: number;
}
