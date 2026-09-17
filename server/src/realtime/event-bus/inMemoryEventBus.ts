import { IEventBus, EventSubscriptionFilter, EventHandler } from './eventBus.types.js';
import { RmsEvent } from '../events/event.types.js';
import { toPublicEvent } from '../events/eventValidator.js';
import { isAuthorizedForEvent } from '../events/eventRegistry.js';

interface RegisteredSubscriber {
  id: string;
  filter: EventSubscriptionFilter;
  handler: EventHandler;
}

export class InMemoryEventBus implements IEventBus {
  private subscribers: Map<string, RegisteredSubscriber> = new Map();
  private nextSubId = 1;

  async publish(event: RmsEvent): Promise<void> {
    const publicEvent = toPublicEvent(event);

    for (const sub of this.subscribers.values()) {
      // 1. Strict Tenant Isolation
      if (sub.filter.tenant_id !== event.tenant_id) {
        continue;
      }

      // 2. Event Type Filter
      if (sub.filter.types && sub.filter.types.length > 0) {
        if (!sub.filter.types.includes(event.type)) {
          continue;
        }
      }

      // 3. Branch Filter & Branch Access Restriction
      if (event.branch_id) {
        if (sub.filter.branch_id && sub.filter.branch_id !== event.branch_id) {
          continue;
        }
        if (
          sub.filter.allowed_branch_ids &&
          sub.filter.allowed_branch_ids.length > 0 &&
          !sub.filter.allowed_branch_ids.includes(event.branch_id)
        ) {
          continue;
        }
      }

      // 4. Permission Authorization Check
      if (sub.filter.permissions) {
        if (!isAuthorizedForEvent(event.type, sub.filter.permissions)) {
          continue;
        }
      }

      // 5. Dispatch safely
      try {
        await Promise.resolve(sub.handler(publicEvent));
      } catch (_) {
        // Individual subscriber error isolated
      }
    }
  }

  subscribe(filter: EventSubscriptionFilter, handler: EventHandler): () => void {
    const id = `sub_${this.nextSubId++}`;
    this.subscribers.set(id, { id, filter, handler });

    return () => {
      this.subscribers.delete(id);
    };
  }

  isHealthy(): boolean {
    return true;
  }

  clear(): void {
    this.subscribers.clear();
    this.nextSubId = 1;
  }
}

export const defaultInMemoryEventBus = new InMemoryEventBus();
