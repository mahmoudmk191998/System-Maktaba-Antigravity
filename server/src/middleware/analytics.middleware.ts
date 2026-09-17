import { Response, NextFunction } from 'express';
import { AuthenticatedRequest } from '../types/api.types.js';
import { defaultAnalyticsService, AnalyticsService } from '../services/analytics.service.js';
import { defaultMetricsStore } from '../infrastructure/metrics/metricsStore.js';

export function createAnalyticsMiddleware(
  analyticsService: AnalyticsService = defaultAnalyticsService
) {
  return (req: AuthenticatedRequest, res: Response, next: NextFunction): void => {
    const startTime = req.startTime || Date.now();

    res.on('finish', () => {
      const responseTime = Date.now() - startTime;
      const tenantId = req.apiClient?.tenantId || 'anonymous';
      const statusCode = res.statusCode;

      // Track metric counters
      defaultMetricsStore.incrementCounter('api_requests_total', 1, { tenant_id: tenantId });
      defaultMetricsStore.recordHistogram('api_request_duration_ms', responseTime, { tenant_id: tenantId });

      if (statusCode >= 400) {
        defaultMetricsStore.incrementCounter('api_errors_total', 1, {
          tenant_id: tenantId,
          status_code: statusCode.toString(),
        });
      }

      if (statusCode === 429) {
        defaultMetricsStore.incrementCounter('rate_limit_exceeded_total', 1, { tenant_id: tenantId });
      }

      // Only track in analytics events collection if authenticated client is present
      if (req.apiClient) {
        const clientId = req.apiClient.clientId;
        const endpoint = req.baseUrl ? `${req.baseUrl}${req.path}` : req.originalUrl.split('?')[0];
        const method = req.method;
        const requestId = req.requestId || 'req_unknown';

        analyticsService
          .recordUsageEvent({
            tenant_id: req.apiClient.tenantId,
            client_id: clientId,
            endpoint,
            method,
            status_code: statusCode,
            response_time_ms: responseTime,
            request_id: requestId,
            timestamp: new Date().toISOString(),
          })
          .catch(() => {});
      }
    });

    next();
  };
}

export const analyticsMiddleware = createAnalyticsMiddleware();
