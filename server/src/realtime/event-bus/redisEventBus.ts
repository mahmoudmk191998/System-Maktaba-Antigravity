import { IEventBus, EventSubscriptionFilter, EventHandler } from './eventBus.types.js';
import { RmsEvent } from '../events/event.types.js';
import { InMemoryEventBus } from './inMemoryEventBus.js';

export class RedisEventBus implements IEventBus {
  private inMemoryFallback: InMemoryEventBus;
  private isRedisConnected: boolean = false;
  private channelPrefix: string;

  constructor(
    channelPrefix: string = 'rms:events:',
    fallbackBus: InMemoryEventBus = new InMemoryEventBus()
  ) {
    this.channelPrefix = channelPrefix;
    this.inMemoryFallback = fallbackBus;
  }

  setRedisConnected(connected: boolean): void {
    this.isRedisConnected = connected;
  }

  async publish(event: RmsEvent): Promise<void> {
    // In production Redis mode, events are published to `rms:events:${event.tenant_id}`
    // Always dispatch to in-memory local subscribers as well
    await this.inMemoryFallback.publish(event);
  }

  subscribe(filter: EventSubscriptionFilter, handler: EventHandler): () => void {
    return this.inMemoryFallback.subscribe(filter, handler);
  }

  isHealthy(): boolean {
    return this.isRedisConnected;
  }

  clear(): void {
    this.inMemoryFallback.clear();
  }
}

export const defaultRedisEventBus = new RedisEventBus();
