import { defaultWebhookService, WebhookService } from './webhook.service.js';
import { defaultCircuitBreaker } from '../infrastructure/circuit-breaker/circuitBreaker.js';
import { CircuitBreaker } from '../infrastructure/circuit-breaker/circuitBreaker.types.js';
import { defaultIntegrationService, IntegrationService } from './integration.service.js';
import { defaultAnalyticsService, AnalyticsService } from './analytics.service.js';

export interface IntegrationHealthReport {
  integration_id: string;
  status: 'healthy' | 'degraded' | 'failing' | 'idle' | 'no_endpoint';
  health_score: number; // 0 to 100
  circuit_state: 'CLOSED' | 'OPEN' | 'HALF_OPEN';
  success_rate: number;
  failure_rate: number;
  average_latency_ms: number;
  pending_events: number;
  retry_count: number;
  dead_letter_count: number;
  last_success_at?: string;
  last_failure_at?: string;
  endpoint_url?: string;
}

export interface IntegrationDetailedMetrics {
  integration_id: string;
  tenant_id: string;
  name: string;
  type: string;
  request_count: number;
  success_count: number;
  count_4xx: number;
  count_5xx: number;
  average_latency_ms: number;
  p95_latency_ms: number;
  rate_limit_violations: number;
  webhook_success_rate: number;
  webhook_failures: number;
  dead_letter_count: number;
  circuit_state: 'CLOSED' | 'OPEN' | 'HALF_OPEN';
  health_score: number;
  last_successful_request?: string;
  last_webhook_delivery?: string;
}

export class IntegrationHealthService {
  private webhookService: WebhookService;
  private integrationService: IntegrationService;
  private circuitBreaker: CircuitBreaker;
  private analyticsService: AnalyticsService;

  constructor(
    webhookService: WebhookService = defaultWebhookService,
    integrationService: IntegrationService = defaultIntegrationService,
    circuitBreaker: CircuitBreaker = defaultCircuitBreaker,
    analyticsService: AnalyticsService = defaultAnalyticsService
  ) {
    this.webhookService = webhookService;
    this.integrationService = integrationService;
    this.circuitBreaker = circuitBreaker;
    this.analyticsService = analyticsService;
  }

  /**
   * Calculates comprehensive health and reliability metrics for an external integration
   */
  async getIntegrationHealth(
    tenantId: string,
    integrationId: string
  ): Promise<IntegrationHealthReport> {
    const integration = await this.integrationService.getIntegrationById(tenantId, integrationId);
    const webhookHealth = await this.webhookService.getIntegrationWebhookHealth(
      tenantId,
      integration.webhook_endpoint_id
    );

    let circuitState: 'CLOSED' | 'OPEN' | 'HALF_OPEN' = 'CLOSED';
    if (integration.webhook_endpoint_id) {
      const cbStatus = await this.circuitBreaker.getState(tenantId, integration.webhook_endpoint_id);
      circuitState = cbStatus.state;
    }

    // Deterministic Reliability Score (0 - 100)
    let healthScore = 100;
    const total = webhookHealth.total_deliveries;

    if (total > 0) {
      const successScore = (webhookHealth.successful_deliveries / total) * 50;
      const failurePenalty = (webhookHealth.failed_deliveries / total) * 30;

      let circuitPenalty = 0;
      if (circuitState === 'OPEN') circuitPenalty = 30;
      else if (circuitState === 'HALF_OPEN') circuitPenalty = 15;

      let latencyPenalty = 0;
      if (webhookHealth.avg_response_time_ms > 5000) latencyPenalty = 20;
      else if (webhookHealth.avg_response_time_ms > 2000) latencyPenalty = 10;

      const deadLetterPenalty = Math.min(20, webhookHealth.dead_letter_count * 5);

      healthScore = Math.max(
        0,
        Math.min(
          100,
          Math.round(50 + successScore - failurePenalty - circuitPenalty - latencyPenalty - deadLetterPenalty)
        )
      );
    } else {
      healthScore = 100; // New integration with 0 events
    }

    let overallStatus: IntegrationHealthReport['status'] = 'idle';
    if (webhookHealth.status === 'no_endpoint') {
      overallStatus = 'no_endpoint';
    } else if (circuitState === 'OPEN' || healthScore < 50 || webhookHealth.dead_letter_count > 0) {
      overallStatus = 'failing';
    } else if (circuitState === 'HALF_OPEN' || healthScore < 80) {
      overallStatus = 'degraded';
    } else if (total > 0) {
      overallStatus = 'healthy';
    }

    return {
      integration_id: integrationId,
      status: overallStatus,
      health_score: healthScore,
      circuit_state: circuitState,
      success_rate: webhookHealth.success_rate,
      failure_rate: webhookHealth.failure_rate,
      average_latency_ms: webhookHealth.avg_response_time_ms,
      pending_events: webhookHealth.pending_count,
      retry_count: webhookHealth.retry_count,
      dead_letter_count: webhookHealth.dead_letter_count,
      last_success_at: webhookHealth.last_success_at,
      last_failure_at: webhookHealth.last_failure_at,
      endpoint_url: webhookHealth.endpoint_url,
    };
  }

  /**
   * Fetches detailed integration-level observability metrics
   */
  async getIntegrationDetailedMetrics(
    tenantId: string,
    integrationId: string
  ): Promise<IntegrationDetailedMetrics> {
    const integration = await this.integrationService.getIntegrationById(tenantId, integrationId);
    const health = await this.getIntegrationHealth(tenantId, integrationId);
    const usage = await this.analyticsService.getClientUsageAnalytics(tenantId, integration.api_client_id);

    const responseTimes = usage.events.map((e) => e.response_time_ms || 0).sort((a, b) => a - b);
    const p95Index = Math.floor(responseTimes.length * 0.95);
    const p95Latency = responseTimes.length > 0 ? responseTimes[p95Index] : usage.avg_response_time_ms;

    const successfulEvents = usage.events.filter((e) => e.status_code >= 200 && e.status_code < 400);
    const lastSuccessfulRequest = successfulEvents.length > 0 ? successfulEvents[0].timestamp : undefined;

    return {
      integration_id: integrationId,
      tenant_id: tenantId,
      name: integration.name,
      type: integration.type,
      request_count: usage.total_requests,
      success_count: usage.successful_requests,
      count_4xx: usage.count_4xx,
      count_5xx: usage.count_5xx,
      average_latency_ms: usage.avg_response_time_ms,
      p95_latency_ms: p95Latency,
      rate_limit_violations: usage.rate_limit_violations,
      webhook_success_rate: health.success_rate,
      webhook_failures: health.failure_rate,
      dead_letter_count: health.dead_letter_count,
      circuit_state: health.circuit_state,
      health_score: health.health_score,
      last_successful_request: lastSuccessfulRequest,
      last_webhook_delivery: health.last_success_at,
    };
  }
}

export const defaultIntegrationHealthService = new IntegrationHealthService();
