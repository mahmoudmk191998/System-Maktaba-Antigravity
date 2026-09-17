import { Response, NextFunction } from 'express';
import { AuthenticatedRequest } from '../types/api.types.js';
import { logger } from '../utils/logger.js';

export function requestLoggerMiddleware(req: AuthenticatedRequest, res: Response, next: NextFunction): void {
  const start = req.startTime || Date.now();

  res.on('finish', () => {
    const responseTime = Date.now() - start;
    
    // Do not log secret parameters
    logger.info('HTTP Request processed', {
      request_id: req.requestId,
      client_id: req.apiClient?.clientId,
      tenant_id: req.apiClient?.tenantId,
      endpoint: req.originalUrl || req.url,
      method: req.method,
      status: res.statusCode,
      response_time_ms: responseTime,
    });
  });

  next();
}
