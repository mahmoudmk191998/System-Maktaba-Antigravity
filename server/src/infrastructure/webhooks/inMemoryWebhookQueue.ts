import {
  QueuedWebhookJob,
  WebhookDeadLetter,
  WebhookQueue,
  WebhookQueueStatus,
} from './webhookQueue.types.js';

export class InMemoryWebhookQueue implements WebhookQueue {
  private jobs = new Map<string, QueuedWebhookJob>();
  private deadLetters: WebhookDeadLetter[] = [];

  async enqueue(job: QueuedWebhookJob): Promise<void> {
    // Deduplication guard by event_id + endpoint_id
    const existing = Array.from(this.jobs.values()).find(
      (j) => j.event_id === job.event_id && j.endpoint_id === job.endpoint_id
    );
    if (!existing) {
      job.state = 'ready';
      this.jobs.set(job.job_id, job);
    }
  }

  async dequeue(limit: number = 10): Promise<QueuedWebhookJob[]> {
    return this.claim('default_worker', limit, 60);
  }

  async claim(workerId: string, limit: number = 10, leaseSeconds: number = 60): Promise<QueuedWebhookJob[]> {
    const now = new Date().toISOString();
    const leaseUntil = new Date(Date.now() + leaseSeconds * 1000).toISOString();
    const claimed: QueuedWebhookJob[] = [];

    for (const job of this.jobs.values()) {
      const isReady = !job.state || job.state === 'ready';
      const isExpiredLease = job.state === 'processing' && job.lease_until && job.lease_until <= now;

      if ((isReady || isExpiredLease) && job.next_attempt_at <= now) {
        job.state = 'processing';
        job.claimed_by = workerId;
        job.lease_until = leaseUntil;
        this.jobs.set(job.job_id, job);
        claimed.push({ ...job });
        if (claimed.length >= limit) break;
      }
    }

    return claimed;
  }

  async ack(jobId: string): Promise<void> {
    this.jobs.delete(jobId);
  }

  async retry(jobId: string, delaySeconds: number, reason: string): Promise<void> {
    const job = this.jobs.get(jobId);
    if (job) {
      const nextTime = new Date(Date.now() + delaySeconds * 1000).toISOString();
      job.attempt_count += 1;
      job.next_attempt_at = nextTime;
      job.state = 'ready';
      job.claimed_by = undefined;
      job.lease_until = undefined;
      this.jobs.set(jobId, job);
    }
  }

  async fail(jobId: string, reason: string, statusCode?: number | null): Promise<void> {
    const job = this.jobs.get(jobId);
    if (job) {
      this.jobs.delete(jobId);
      this.deadLetters.push({
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
      });
    }
  }

  async recoverExpiredLeases(): Promise<number> {
    const now = new Date().toISOString();
    let recoveredCount = 0;

    for (const job of this.jobs.values()) {
      if (job.state === 'processing' && job.lease_until && job.lease_until <= now) {
        job.state = 'ready';
        job.claimed_by = undefined;
        job.lease_until = undefined;
        this.jobs.set(job.job_id, job);
        recoveredCount += 1;
      }
    }

    return recoveredCount;
  }

  async getPendingCount(tenantId?: string): Promise<number> {
    if (!tenantId) return this.jobs.size;
    return Array.from(this.jobs.values()).filter((j) => j.tenant_id === tenantId).length;
  }

  async getDeadLetters(tenantId: string, limit: number = 50): Promise<WebhookDeadLetter[]> {
    return this.deadLetters
      .filter((dl) => dl.tenant_id === tenantId)
      .slice(-limit)
      .reverse();
  }

  async getStatus(): Promise<WebhookQueueStatus> {
    const processing = Array.from(this.jobs.values()).filter((j) => j.state === 'processing').length;
    return {
      provider: 'in-memory',
      status: 'healthy',
      pending_jobs: this.jobs.size,
      processing_jobs: processing,
      dead_letters_count: this.deadLetters.length,
    };
  }

  async clear(): Promise<void> {
    this.jobs.clear();
    this.deadLetters = [];
  }
}
