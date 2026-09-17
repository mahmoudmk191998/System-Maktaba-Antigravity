import { EventEmitter } from 'events';
import { PublicRmsEvent, RequestOptions } from './types.js';

export interface EventStreamOptions extends RequestOptions {
  types?: string[];
  branchId?: string;
  lastEventId?: string;
  reconnect?: boolean;
  maxReconnectAttempts?: number;
}

export class RmsEventStream extends EventEmitter {
  private url: string;
  private apiKey: string;
  private options: EventStreamOptions;
  private abortController: AbortController | null = null;
  private closed: boolean = false;
  private reconnectAttempts = 0;

  constructor(baseUrl: string, apiKey: string, options: EventStreamOptions = {}) {
    super();
    this.apiKey = apiKey.startsWith('Bearer ') ? apiKey : `Bearer ${apiKey}`;
    this.options = options;

    const query = new URLSearchParams();
    if (options.types && options.types.length > 0) {
      query.set('types', options.types.join(','));
    }
    if (options.branchId) {
      query.set('branch_id', options.branchId);
    }
    if (options.lastEventId) {
      query.set('last_event_id', options.lastEventId);
    }

    const cleanBase = baseUrl.replace(/\/+$/, '');
    this.url = `${cleanBase}/realtime/events${query.toString() ? `?${query.toString()}` : ''}`;

    this.connect();
  }

  private async connect(): Promise<void> {
    if (this.closed) return;

    this.abortController = new AbortController();

    try {
      const headers: Record<string, string> = {
        Authorization: this.apiKey,
        Accept: 'text/event-stream',
        ...(this.options.headers || {}),
      };

      if (this.options.lastEventId) {
        headers['Last-Event-ID'] = this.options.lastEventId;
      }
      if (this.options.branchId) {
        headers['X-Branch-ID'] = this.options.branchId;
      }

      const response = await fetch(this.url, {
        headers,
        signal: this.abortController.signal,
      });

      if (!response.ok) {
        this.emit('error', new Error(`SSE Connection failed with status ${response.status}`));
        this.handleReconnect();
        return;
      }

      this.reconnectAttempts = 0;
      this.emit('connected');

      if (!response.body) {
        this.emit('error', new Error('ReadableStream not supported on this platform'));
        return;
      }

      const reader = response.body.getReader();
      const decoder = new TextDecoder();
      let buffer = '';

      while (!this.closed) {
        const { value, done } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split('\n\n');
        buffer = lines.pop() || '';

        for (const block of lines) {
          this.parseSseBlock(block);
        }
      }
    } catch (err: any) {
      if (!this.closed && err.name !== 'AbortError') {
        this.emit('error', err);
        this.handleReconnect();
      }
    }
  }

  private parseSseBlock(block: string): void {
    const lines = block.split('\n');
    let eventData = '';
    let eventId = '';

    for (const line of lines) {
      if (line.startsWith('id: ')) {
        eventId = line.slice(4).trim();
        this.options.lastEventId = eventId;
      } else if (line.startsWith('data: ')) {
        eventData = line.slice(6).trim();
      }
    }

    if (eventData) {
      try {
        const parsed = JSON.parse(eventData) as PublicRmsEvent;
        this.emit('event', parsed);
        if (parsed.type) {
          this.emit(parsed.type, parsed);
        }
      } catch (_) {}
    }
  }

  private handleReconnect(): void {
    if (this.closed || this.options.reconnect === false) return;
    const maxAttempts = this.options.maxReconnectAttempts || 5;

    if (this.reconnectAttempts < maxAttempts) {
      this.reconnectAttempts++;
      const delay = Math.min(1000 * Math.pow(2, this.reconnectAttempts), 30000);
      setTimeout(() => this.connect(), delay);
    } else {
      this.emit('close');
    }
  }

  close(): void {
    this.closed = true;
    if (this.abortController) {
      this.abortController.abort();
      this.abortController = null;
    }
    this.emit('close');
    this.removeAllListeners();
  }
}
