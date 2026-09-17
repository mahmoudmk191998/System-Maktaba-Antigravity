import { Response } from 'express';
import { ISseConnection, SseClientContext } from './sse.types.js';
import { PublicRmsEvent } from '../events/event.types.js';

export class SseConnection implements ISseConnection {
  readonly id: string;
  readonly context: SseClientContext;
  private res: Response;
  private closed: boolean = false;
  private heartbeatTimer: NodeJS.Timeout | null = null;

  constructor(
    id: string,
    context: SseClientContext,
    res: Response,
    heartbeatIntervalMs: number = 30000,
    onClose?: () => void
  ) {
    this.id = id;
    this.context = context;
    this.res = res;

    // Set standard SSE headers
    res.setHeader('Content-Type', 'text/event-stream');
    res.setHeader('Cache-Control', 'no-cache, no-transform');
    res.setHeader('Connection', 'keep-alive');
    res.setHeader('X-Accel-Buffering', 'no');
    res.flushHeaders?.();

    // Initial connection comment
    this.writeRaw(`: connected id=${id} tenant=${context.tenantId}\n\n`);

    // Setup heartbeat
    this.heartbeatTimer = setInterval(() => {
      if (!this.closed) {
        this.sendHeartbeat();
      }
    }, heartbeatIntervalMs);

    // Track disconnect
    res.on('close', () => {
      this.close();
      onClose?.();
    });
  }

  sendEvent(event: PublicRmsEvent): void {
    if (this.closed) return;
    const payload = `id: ${event.id}\nevent: ${event.type}\ndata: ${JSON.stringify(event)}\n\n`;
    this.writeRaw(payload);
  }

  sendHeartbeat(): void {
    if (this.closed) return;
    this.writeRaw(`: heartbeat ts=${Date.now()}\n\n`);
  }

  private writeRaw(data: string): void {
    try {
      this.res.write(data);
    } catch (_) {
      this.close();
    }
  }

  close(): void {
    if (this.closed) return;
    this.closed = true;
    if (this.heartbeatTimer) {
      clearInterval(this.heartbeatTimer);
      this.heartbeatTimer = null;
    }
    try {
      this.res.end();
    } catch (_) {}
  }

  isOpen(): boolean {
    return !this.closed;
  }
}
