import { RmsEventStream, EventStreamOptions } from './events.js';

export class RmsRealtimeClient {
  private baseUrl: string;
  private apiKey: string;
  private defaultBranchId?: string;

  constructor(baseUrl: string, apiKey: string, defaultBranchId?: string) {
    this.baseUrl = baseUrl;
    this.apiKey = apiKey;
    this.defaultBranchId = defaultBranchId;
  }

  /**
   * Subscribe to real-time events via Server-Sent Events (SSE).
   */
  subscribe(options: EventStreamOptions = {}): RmsEventStream {
    return new RmsEventStream(this.baseUrl, this.apiKey, {
      branchId: options.branchId || this.defaultBranchId,
      ...options,
    });
  }

  /**
   * Stream order lifecycle updates for a specific order.
   */
  streamOrder(orderId: string, options: EventStreamOptions = {}): RmsEventStream {
    return this.subscribe({
      ...options,
      types: ['order.created', 'order.status_changed', 'order.cancelled', 'order.updated'],
    });
  }
}
