import http from 'http';
import { WebSocketServer } from 'ws';
import express from 'express';
import helmet from 'helmet';
import { env } from './config/environment.js';
import { initFirebaseAdmin } from './config/firebase.js';
import { createCorsMiddleware } from './middleware/cors.middleware.js';
import { errorHandler } from './middleware/error.middleware.js';
import { requestLoggerMiddleware } from './middleware/logger.middleware.js';
import { analyticsMiddleware } from './middleware/analytics.middleware.js';
import { createRateLimiter } from './middleware/rateLimiter.js';
import { requestIdMiddleware } from './middleware/requestId.js';
import { v1Router } from './routes/v1/index.js';
import { v2Router } from './routes/v2/index.js';
import { NotFoundError } from './utils/errors.js';
import { logger } from './utils/logger.js';
import { defaultWebhookService } from './services/webhook.service.js';
import { setupWebsocketServer } from './realtime/websocket/websocket.routes.js';
import { defaultWebsocketManager } from './realtime/websocket/websocketManager.js';
import { defaultSseManager } from './realtime/sse/sseManager.js';
import { defaultWebhookWorker } from './infrastructure/webhooks/webhookWorker.js';

export function createApp(): express.Application {
  const app = express();

  // 1. Security Headers via Helmet
  app.use(
    helmet({
      contentSecurityPolicy: env.NODE_ENV === 'production' ? undefined : false,
      crossOriginEmbedderPolicy: false,
    })
  );

  // 2. CORS Protection
  app.use(createCorsMiddleware());

  // 3. Body parsers with safe limits
  app.use(express.json({ limit: '1mb' }));
  app.use(express.urlencoded({ extended: true, limit: '1mb' }));

  // 4. Request ID tagging & performance timing
  app.use(requestIdMiddleware);

  // 5. Structured Request Logging
  app.use(requestLoggerMiddleware);

  // 6. Analytics Middleware (Non-blocking usage tracking)
  app.use(analyticsMiddleware);

  // 7. Configurable Rate Limiting
  app.use(createRateLimiter());

  // 8. Mount API Routes
  app.use('/api/v1', v1Router);
  app.use('/api/v2', v2Router);

  // 8. 404 handler for unmatched routes
  app.use((req, res, next) => {
    next(new NotFoundError(`Route ${req.method} ${req.originalUrl} not found`));
  });

  // 9. Centralized Error Handler
  app.use(errorHandler);

  return app;
}

export const app = createApp();

// Start server if run directly
if (process.env.NODE_ENV !== 'test') {
  initFirebaseAdmin();

  // 1. Start Webhook Worker if enabled
  if (env.WEBHOOK_WORKER_ENABLED) {
    defaultWebhookWorker.start(env.WEBHOOK_POLL_INTERVAL_MS);
    logger.info('⚙️ Distributed Webhook Worker started', {
      details: {
        concurrency: env.WEBHOOK_WORKER_CONCURRENCY,
        pollIntervalMs: env.WEBHOOK_POLL_INTERVAL_MS,
      },
    });
  }

  // 2. Durable webhook outbox worker sweep timer
  const sweepInterval = setInterval(() => {
    defaultWebhookService.dispatchDue().catch((error) =>
      logger.error('Webhook delivery sweep failed', {
        details: error instanceof Error ? error.message : error,
      })
    );
  }, 60_000);
  sweepInterval.unref();

  // 3. Create HTTP Server and bind WebSocket server
  const server = http.createServer(app);
  const wss = new WebSocketServer({ server, path: '/api/v1/realtime/ws' });
  setupWebsocketServer(wss, defaultWebsocketManager);

  // 4. Start HTTP Server bound to 0.0.0.0
  server.listen(env.PORT, '0.0.0.0', () => {
    logger.info(`🚀 RMS REST API Server is running`, {
      endpoint: `http://0.0.0.0:${env.PORT}/api/v1/health`,
      details: {
        port: env.PORT,
        host: '0.0.0.0',
        environment: env.NODE_ENV,
        rateLimit: env.API_RATE_LIMIT,
        rateWindowMs: env.API_RATE_WINDOW_MS,
        wsEndpoint: `ws://0.0.0.0:${env.PORT}/api/v1/realtime/ws`,
      },
    });
  });

  // 5. Graceful Shutdown Handlers (SIGTERM, SIGINT)
  let isShuttingDown = false;

  const gracefulShutdown = async (signal: string) => {
    if (isShuttingDown) return;
    isShuttingDown = true;
    logger.info(`Received ${signal}. Initiating graceful shutdown...`);

    // Force exit timeout after 10s if connections refuse to terminate
    const forceExitTimer = setTimeout(() => {
      logger.error('Forced shutdown timeout reached. Exiting immediately.');
      process.exit(1);
    }, 10_000);
    forceExitTimer.unref();

    try {
      // Step A: Stop background timers and workers
      clearInterval(sweepInterval);
      defaultWebhookWorker.stop();
      logger.info('Stopped background webhook workers');

      // Step B: Gracefully close WebSockets and SSE streams
      defaultWebsocketManager.closeAll();
      wss.close();
      defaultSseManager.closeAll();
      logger.info('Closed active WebSocket and SSE client connections');

      // Step C: Stop accepting new HTTP connections and finish in-flight requests
      await new Promise<void>((resolve) => {
        server.close((err) => {
          if (err) {
            logger.error('Error closing HTTP server', { details: err.message });
          } else {
            logger.info('HTTP server closed cleanly');
          }
          resolve();
        });
      });

      logger.info('✅ Graceful shutdown completed cleanly');
      process.exit(0);
    } catch (err) {
      logger.error('Error during graceful shutdown', {
        details: err instanceof Error ? err.message : err,
      });
      process.exit(1);
    }
  };

  process.on('SIGTERM', () => gracefulShutdown('SIGTERM'));
  process.on('SIGINT', () => gracefulShutdown('SIGINT'));
}

