import { RmsEvent, PublicRmsEvent } from '../events/event.types.js';
import { toPublicEvent } from '../events/eventValidator.js';

export interface IEventReplayStore {
  saveEvent(event: RmsEvent): Promise<void>;
  getEventsAfter(tenantId: string, lastEventId?: string, limit?: number): Promise<PublicRmsEvent[]>;
  clear(): void;
}

export class InMemoryEventReplayStore implements IEventReplayStore {
  // Tenant -> List of public events in chronological order
  private tenantEvents: Map<string, PublicRmsEvent[]> = new Map();
  private maxEventsPerTenant: number;

  constructor(maxEventsPerTenant: number = 1000) {
    this.maxEventsPerTenant = maxEventsPerTenant;
  }

  async saveEvent(event: RmsEvent): Promise<void> {
    const list = this.tenantEvents.get(event.tenant_id) || [];
    const publicEvent = toPublicEvent(event);

    list.push(publicEvent);
    if (list.length > this.maxEventsPerTenant) {
      list.shift(); // sliding window
    }

    this.tenantEvents.set(event.tenant_id, list);
  }

  async getEventsAfter(
    tenantId: string,
    lastEventId?: string,
    limit: number = 100
  ): Promise<PublicRmsEvent[]> {
    const list = this.tenantEvents.get(tenantId) || [];
    if (!lastEventId) {
      return list.slice(-limit);
    }

    const index = list.findIndex((e) => e.id === lastEventId);
    if (index === -1) {
      // Last-Event-ID is older than retention window; return all retained events up to limit
      return list.slice(0, limit);
    }

    return list.slice(index + 1, index + 1 + limit);
  }

  clear(): void {
    this.tenantEvents.clear();
  }
}

export const defaultEventReplayStore = new InMemoryEventReplayStore();
