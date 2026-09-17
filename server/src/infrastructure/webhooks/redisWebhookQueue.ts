import {
  QueuedWebhookJob,
  WebhookDeadLetter,
  WebhookQueue,
  WebhookQueueStatus,
} from './webhookQueue.types.js';
import { InMemoryWebhookQueue } from './inMemoryWebhookQueue.js';
import { logger } from '../../utils/logger.js';

export interface RedisQueueClientInterface {
  hset(key: string, ...fieldValues: (string | number)[]): Promise<number>;
  hget(key: string, field: string): Promise<string | null>;
  hgetall(key: string): Promise<Record<string, string>>;
  hdel(key: string, ...fields: string[]): Promise<number>;
  zadd(key: string, score: number, member: string): Promise<number>;
  zrangebyscore(key: string, min: number | string, max: number | string, ...args: (string | number)[]): Promise<string[]>;
  zrem(key: string, ...members: string[]): Promise<number>;
  zcard(key: string): Promise<number>;
  eval(script: string, numkeys: number, ...args: (string | number)[]): Promise<any>;
}

export class RedisWebhookQueue implements WebhookQueue {
  private fallbackQueue = new InMemoryWebhookQueue();
  private redisClient?: RedisQueueClientInterface;
  private prefix: string;
  private isDegraded: boolean = false;
  private lastError?: string;

  constructor(redisClient?: RedisQueueClientInterface, prefix: string = 'rms:webhook_queue:') {
    this.redisClient = redisClient;
    this.prefix = prefix;
    if (!redisClient) {
      this.isDegraded = true;
      this.lastError = 'Redis client not connected, operating in in-memory fallback mode';
    }
  }

  setClient(client: RedisQueueClientInterface | undefined): void {
    this.redisClient = client;
    this.isDegraded = !client;
    if (!client) {
      this.lastError = 'Redis client disconnected';
    } else {
      this.lastError = undefined;
    }
  }

  async enqueue(job: QueuedWebhookJob): Promise<void> {
    if (this.redisClient && !this.isDegraded) {
      try {
        const jobKey = `${this.prefix}job:${job.job_id}`;
        const readyZset = `${this.prefix}ready`;
        const score = new Date(job.next_attempt_at).getTime();

        job.state = 'ready';
        await this.redisClient.hset(jobKey, 'data', JSON.stringify(job));
        await this.redisClient.zadd(readyZset, score, job.job_id);
        return;
      } catch (err: any) {
        this.isDegraded = true;
        this.lastError = err?.message || 'Redis enqueue failure';
        logger.warn(`Redis Webhook Queue enqueue error, falling back to memory: ${this.lastError}`);
      }
    }

    await this.fallbackQueue.enqueue(job);
  }

  async dequeue(limit: number = 10): Promise<QueuedWebhookJob[]> {
    return this.claim('default_worker', limit, 60);
  }

  async claim(workerId: string, limit: number = 10, leaseSeconds: number = 60): Promise<QueuedWebhookJob[]> {
    if (this.redisClient && !this.isDegraded) {
      try {
        const nowMs = Date.now();
        const leaseUntilMs = nowMs + leaseSeconds * 1000;
        const leaseUntilIso = new Date(leaseUntilMs).toISOString();
        const readyZset = `${this.prefix}ready`;
        const processingZset = `${this.prefix}processing`;

        // 1. Recover expired leases first
        await this.recoverExpiredLeases();

        // 2. Fetch ready jobs
        const readyJobIds = await this.redisClient.zrangebyscore(readyZset, 0, nowMs, 'LIMIT', 0, limit);
        if (readyJobIds.length === 0) return [];

        const claimed: QueuedWebhookJob[] = [];
        for (const jobId of readyJobIds) {
          const jobKey = `${this.prefix}job:${jobId}`;
          const raw = await this.redisClient.hget(jobKey, 'data');
          if (raw) {
            const job: QueuedWebhookJob = JSON.parse(raw);
            job.state = 'processing';
            job.claimed_by = workerId;
            job.lease_until = leaseUntilIso;

            // Move from ready to processing ZSET
            await this.redisClient.zrem(readyZset, jobId);
            await this.redisClient.zadd(processingZset, leaseUntilMs, jobId);
            await this.redisClient.hset(jobKey, 'data', JSON.stringify(job));
            claimed.push(job);
          }
        }
        return claimed;
      } catch (err: any) {
        this.isDegraded = true;
        this.lastError = err?.message || 'Redis claim failure';
        logger.warn(`Redis Webhook Queue claim error, falling back: ${this.lastError}`);
      }
    }

    return this.fallbackQueue.claim(workerId, limit, leaseSeconds);
  }

  async ack(jobId: string): Promise<void> {
    if (this.redisClient && !this.isDegraded) {
      try {
        const jobKey = `${this.prefix}job:${jobId}`;
        const readyZset = `${this.prefix}ready`;
        const processingZset = `${this.prefix}processing`;

        await this.redisClient.zrem(readyZset, jobId);
        await this.redisClient.zrem(processingZset, jobId);
        await this.redisClient.hdel(jobKey, 'data');
        return;
      } catch (err: any) {
        this.isDegraded = true;
        this.lastError = err?.message;
      }
    }

    await this.fallbackQueue.ack(jobId);
  }

  async retry(jobId: string, delaySeconds: number, reason: string): Promise<void> {
    if (this.redisClient && !this.isDegraded) {
      try {
        const jobKey = `${this.prefix}job:${jobId}`;
        const readyZset = `${this.prefix}ready`;
        const processingZset = `${this.prefix}processing`;
        const raw = await this.redisClient.hget(jobKey, 'data');

        if (raw) {
          const job: QueuedWebhookJob = JSON.parse(raw);
          const nextTimeMs = Date.now() + delaySeconds * 1000;
          job.attempt_count += 1;
          job.next_attempt_at = new Date(nextTimeMs).toISOString();
          job.state = 'ready';
          job.claimed_by = undefined;
          job.lease_until = undefined;

          await this.redisClient.zrem(processingZset, jobId);
          await this.redisClient.zadd(readyZset, nextTimeMs, jobId);
          await this.redisClient.hset(jobKey, 'data', JSON.stringify(job));
          return;
        }
      } catch (err: any) {
        this.isDegraded = true;
        this.lastError = err?.message;
      }
    }

    await this.fallbackQueue.retry(jobId, delaySeconds, reason);
  }

  async fail(jobId: string, reason: string, statusCode?: number | null): Promise<void> {
    if (this.redisClient && !this.isDegraded) {
      try {
        const jobKey = `${this.prefix}job:${jobId}`;
        const readyZset = `${this.prefix}ready`;
        const processingZset = `${this.prefix}processing`;
        const raw = await this.redisClient.hget(jobKey, 'data');

        if (raw) {
          const job: QueuedWebhookJob = JSON.parse(raw);
          await this.redisClient.zrem(readyZset, jobId);
          await this.redisClient.zrem(processingZset, jobId);
          await this.redisClient.hdel(jobKey, 'data');

          const deadLetter: WebhookDeadLetter = {
            id: `wdl_${job.job_id}`,
            event_id: job.event_id,
            tenant_id: job.tenant_id,
            integration_id: job.integration_id,
            endpoint_id: job.endpoint_id,
            destination_url: job.url,
            event_type: job.payload.event_type,
            order_id: job.payload.data?.order_id || (job.payload as any).order_id,
            attempts: job.attempt_count,
            last_error: reason,
            last_status_code: statusCode,
            failed_at: new Date().toISOString(),
            next_action: 'inspect_endpoint_or_manual_retry',
            correlation_id: job.correlation_id,
          };

          const deadLetterKey = `${this.prefix}dead_letters:${job.tenant_id}`;
          await this.redisClient.hset(deadLetterKey, deadLetter.id, JSON.stringify(deadLetter));
          return;
        }
      } catch (err: any) {
        this.isDegraded = true;
        this.lastError = err?.message;
      }
    }

    await this.fallbackQueue.fail(jobId, reason, statusCode);
  }

  async recoverExpiredLeases(): Promise<number> {
    if (this.redisClient && !this.isDegraded) {
      try {
        const nowMs = Date.now();
        const readyZset = `${this.prefix}ready`;
        const processingZset = `${this.prefix}processing`;

        const expiredJobIds = await this.redisClient.zrangebyscore(processingZset, 0, nowMs);
        if (expiredJobIds.length === 0) return 0;

        for (const jobId of expiredJobIds) {
          const jobKey = `${this.prefix}job:${jobId}`;
          const raw = await this.redisClient.hget(jobKey, 'data');
          if (raw) {
            const job: QueuedWebhookJob = JSON.parse(raw);
            job.state = 'ready';
            job.claimed_by = undefined;
            job.lease_until = undefined;

            await this.redisClient.zrem(processingZset, jobId);
            await this.redisClient.zadd(readyZset, nowMs, jobId);
            await this.redisClient.hset(jobKey, 'data', JSON.stringify(job));
          }
        }
        return expiredJobIds.length;
      } catch (_) {
        return this.fallbackQueue.recoverExpiredLeases();
      }
    }

    return this.fallbackQueue.recoverExpiredLeases();
  }

  async getPendingCount(tenantId?: string): Promise<number> {
    if (this.redisClient && !this.isDegraded) {
      try {
        const readyZset = `${this.prefix}ready`;
        return await this.redisClient.zcard(readyZset);
      } catch (_) {}
    }
    return this.fallbackQueue.getPendingCount(tenantId);
  }

  async getDeadLetters(tenantId: string, limit: number = 50): Promise<WebhookDeadLetter[]> {
    if (this.redisClient && !this.isDegraded) {
      try {
        const deadLetterKey = `${this.prefix}dead_letters:${tenantId}`;
        const map = await this.redisClient.hgetall(deadLetterKey);
        if (map && Object.keys(map).length > 0) {
          return Object.values(map)
            .map((v) => JSON.parse(v) as WebhookDeadLetter)
            .slice(-limit)
            .reverse();
        }
      } catch (_) {}
    }
    return this.fallbackQueue.getDeadLetters(tenantId, limit);
  }

  async getStatus(): Promise<WebhookQueueStatus> {
    if (!this.redisClient || this.isDegraded) {
      return {
        provider: 'redis',
        status: 'degraded',
        pending_jobs: await this.fallbackQueue.getPendingCount(),
        dead_letters_count: (await this.fallbackQueue.getDeadLetters('')).length,
        error: this.lastError || 'Operating in in-memory fallback mode',
      };
    }

    const readyZset = `${this.prefix}ready`;
    const processingZset = `${this.prefix}processing`;
    const pending = await this.redisClient.zcard(readyZset).catch(() => 0);
    const processing = await this.redisClient.zcard(processingZset).catch(() => 0);

    return {
      provider: 'redis',
      status: 'healthy',
      pending_jobs: pending,
      processing_jobs: processing,
      dead_letters_count: 0,
    };
  }

  async clear(): Promise<void> {
    await this.fallbackQueue.clear();
  }
}
