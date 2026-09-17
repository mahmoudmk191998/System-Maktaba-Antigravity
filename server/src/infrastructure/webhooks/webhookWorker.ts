import crypto from 'crypto';
import { env } from '../../config/environment.js';
import { logger } from '../../utils/logger.js';
import { WebhookQueue, QueuedWebhookJob } from './webhookQueue.types.js';
import { defaultWebhookQueue } from './webhookQueue.js';
import { WebhookDeliveryAttempt } from '../../types/webhook.types.js';
import { CircuitBreaker } from '../circuit-breaker/circuitBreaker.types.js';
import { defaultCircuitBreaker } from '../circuit-breaker/circuitBreaker.js';

// HTTP status codes that must not be retried because the payload/auth is permanently rejected by client
const NON_RETRYABLE_STATUS_CODES = [400, 401, 403, 404, 409, 422];

export type DeliveryAttemptRecorder = (attempt: WebhookDeliveryAttempt) => Promise<void>;
export type EventStatusUpdater = (eventId: string, status: string, error?: string) => Promise<void>;

export class WebhookWorker {
  private queue: WebhookQueue;
  private circuitBreaker: CircuitBreaker;
  private isRunning: boolean = false;
  private pollTimer?: NodeJS.Timeout;
  private onAttemptRecorded?: DeliveryAttemptRecorder;
  private onEventStatusUpdated?: EventStatusUpdater;
  private fetchImpl: typeof fetch;
  private workerId: string;

  constructor(
    queue: WebhookQueue = defaultWebhookQueue,
    fetchImpl: typeof fetch = globalThis.fetch,
    circuitBreaker: CircuitBreaker = defaultCircuitBreaker,
    workerId: string = `worker_${uuidv4Like()}`
  ) {
    this.queue = queue;
    this.fetchImpl = fetchImpl;
    this.circuitBreaker = circuitBreaker;
    this.workerId = workerId;
  }

  setCallbacks(onAttempt: DeliveryAttemptRecorder, onStatusUpdate: EventStatusUpdater) {
    this.onAttemptRecorded = onAttempt;
    this.onEventStatusUpdated = onStatusUpdate;
  }

  start(intervalMs: number = env.WEBHOOK_POLL_INTERVAL_MS): void {
    if (this.isRunning) return;
    this.isRunning = true;
    this.pollTimer = setInterval(() => {
      this.processBatch(env.WEBHOOK_WORKER_CONCURRENCY).catch((err) => {
        logger.error(`WebhookWorker batch error: ${err?.message}`);
      });
    }, intervalMs);
    this.pollTimer.unref();
  }

  stop(): void {
    this.isRunning = false;
    if (this.pollTimer) {
      clearInterval(this.pollTimer);
    }
  }

  getWorkerId(): string {
    return this.workerId;
  }

  /**
   * Process a batch of claimed jobs using visibility timeout lease
   */
  async processBatch(limit: number = env.WEBHOOK_WORKER_CONCURRENCY): Promise<number> {
    const jobs = await this.queue.claim(this.workerId, limit, env.WEBHOOK_LEASE_SECONDS);
    if (jobs.length === 0) return 0;

    await Promise.allSettled(jobs.map((job) => this.deliverJob(job)));
    return jobs.length;
  }

  /**
   * Deliver a single queued webhook job with HMAC signature, lease, circuit breaker, and retry backoff
   */
  async deliverJob(job: QueuedWebhookJob): Promise<boolean> {
    // 1. Check Circuit Breaker
    const canAttempt = await this.circuitBreaker.canAttempt(job.tenant_id, job.endpoint_id);
    if (!canAttempt) {
      const reason = 'Circuit breaker is OPEN for endpoint; skipping request';
      await this.queue.retry(job.job_id, env.WEBHOOK_CIRCUIT_COOLDOWN_SECONDS, reason);
      if (this.onEventStatusUpdated) {
        await this.onEventStatusUpdated(job.event_id, 'retrying', reason);
      }
      return false;
    }

    const attemptId = `wha_${uuidv4Like()}`;
    const startTime = Date.now();
    const rawBody = JSON.stringify(job.payload);
    const timestamp = Math.floor(startTime / 1000).toString();

    // Compute HMAC signature: HMAC-SHA256(secret, timestamp + "." + rawBody)
    const signature = crypto
      .createHmac('sha256', job.secret)
      .update(`${timestamp}.${rawBody}`)
      .digest('hex');

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), env.WEBHOOK_REQUEST_TIMEOUT_MS);

    let statusCode: number | undefined;
    let responseBodyText: string | undefined;
    let errorMessage: string | undefined;
    let isSuccess = false;
    let retryAfterSeconds: number | undefined;

    try {
      const headers: Record<string, string> = {
        'Content-Type': 'application/json',
        'User-Agent': 'RMS-Webhook-Delivery/1.0',
        'X-RMS-Event-ID': job.event_id,
        'X-RMS-Event-Type': job.payload.event_type,
        'X-RMS-Timestamp': timestamp,
        'X-RMS-Signature': `t=${timestamp},v1=${signature}`,
      };

      if (job.correlation_id) {
        headers['X-RMS-Request-ID'] = job.correlation_id;
      }

      const response = await this.fetchImpl(job.url, {
        method: 'POST',
        headers,
        body: rawBody,
        signal: controller.signal,
      });

      clearTimeout(timeout);
      statusCode = response.status;

      try {
        const text = await response.text();
        responseBodyText = text.slice(0, 1000); // cap logged response body to 1KB
      } catch (_) {}

      // Check Retry-After header on 429
      if (statusCode === 429) {
        const retryHeader = response.headers.get('retry-after');
        if (retryHeader) {
          const parsed = parseInt(retryHeader, 10);
          if (!isNaN(parsed) && parsed > 0) {
            retryAfterSeconds = parsed;
          }
        }
      }

      isSuccess = response.ok;
    } catch (err: any) {
      clearTimeout(timeout);
      errorMessage = err?.name === 'AbortError' ? 'Webhook delivery timed out' : err?.message || 'Network error';
    }

    const durationMs = Date.now() - startTime;
    const attemptRecord: WebhookDeliveryAttempt = {
      id: attemptId,
      event_id: job.event_id,
      endpoint_id: job.endpoint_id,
      attempt_number: job.attempt_count,
      status_code: statusCode !== undefined ? statusCode : null,
      response_time_ms: durationMs,
      success: isSuccess,
      response_body: responseBodyText,
      error: isSuccess ? null : (errorMessage || (statusCode ? `HTTP ${statusCode}` : 'Delivery failure')),
      created_at: new Date().toISOString(),
    };

    if (this.onAttemptRecorded) {
      await this.onAttemptRecorded(attemptRecord).catch(() => {});
    }

    // 1. Success 2xx
    if (isSuccess) {
      await this.circuitBreaker.recordSuccess(job.tenant_id, job.endpoint_id);
      await this.queue.ack(job.job_id);
      if (this.onEventStatusUpdated) {
        await this.onEventStatusUpdated(job.event_id, 'delivered');
      }
      return true;
    }

    // 2. Failure: Record failure in Circuit Breaker
    await this.circuitBreaker.recordFailure(job.tenant_id, job.endpoint_id);

    // 3. Non-retryable 4xx
    if (statusCode && NON_RETRYABLE_STATUS_CODES.includes(statusCode)) {
      const reason = `Client rejected webhook with status ${statusCode} (Non-retryable)`;
      await this.queue.fail(job.job_id, reason, statusCode);
      if (this.onEventStatusUpdated) {
        await this.onEventStatusUpdated(job.event_id, 'permanently_failed', reason);
      }
      return false;
    }

    // 4. Retryable (5xx, 429, 408, network timeouts)
    if (job.attempt_count < job.max_attempts) {
      const baseDelay = env.WEBHOOK_BASE_DELAY_SECONDS;
      const exponentialDelay = baseDelay * Math.pow(2, job.attempt_count - 1);
      const jitter = Math.random() * 2;
      let delaySeconds = Math.min(env.WEBHOOK_MAX_DELAY_SECONDS, exponentialDelay + jitter);

      if (retryAfterSeconds) {
        delaySeconds = Math.max(delaySeconds, retryAfterSeconds);
      }

      const reason = errorMessage || `HTTP error ${statusCode}`;
      await this.queue.retry(job.job_id, delaySeconds, reason);
      if (this.onEventStatusUpdated) {
        await this.onEventStatusUpdated(job.event_id, 'retrying', reason);
      }
      return false;
    }

    // 5. Max attempts reached -> Dead Letter
    const finalReason = `Exceeded max retry attempts (${job.max_attempts}): ${errorMessage || `HTTP ${statusCode}`}`;
    await this.queue.fail(job.job_id, finalReason, statusCode);
    if (this.onEventStatusUpdated) {
      await this.onEventStatusUpdated(job.event_id, 'permanently_failed', finalReason);
    }
    return false;
  }
}

function uuidv4Like(): string {
  return crypto.randomBytes(16).toString('hex').slice(0, 20);
}

export const defaultWebhookWorker = new WebhookWorker();
