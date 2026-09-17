import { EventReplayQuery, EventReplayResult } from './eventReplay.types.js';
import { IEventReplayStore, defaultEventReplayStore } from './eventReplayStore.js';
import { isAuthorizedForEvent } from '../events/eventRegistry.js';

export class EventReplayService {
  private store: IEventReplayStore;

  constructor(store: IEventReplayStore = defaultEventReplayStore) {
    this.store = store;
  }

  async replayEvents(query: EventReplayQuery): Promise<EventReplayResult> {
    const rawEvents = await this.store.getEventsAfter(
      query.tenant_id,
      query.last_event_id,
      query.limit || 100
    );

    // Apply authorization, branch, and type filtering
    const filtered = rawEvents.filter((evt) => {
      // 1. Strict Tenant Isolation
      if (evt.tenant_id !== query.tenant_id) return false;

      // 2. Event Type Filter
      if (query.types && query.types.length > 0 && !query.types.includes(evt.type)) {
        return false;
      }

      // 3. Branch Filter & Branch Access Restriction
      if (evt.branch_id) {
        if (query.branch_id && query.branch_id !== evt.branch_id) {
          return false;
        }
        if (
          query.allowed_branch_ids &&
          query.allowed_branch_ids.length > 0 &&
          !query.allowed_branch_ids.includes(evt.branch_id)
        ) {
          return false;
        }
      }

      // 4. Permissions check
      if (query.permissions) {
        if (!isAuthorizedForEvent(evt.type, query.permissions)) {
          return false;
        }
      }

      return true;
    });

    const latestEventId = filtered.length > 0 ? filtered[filtered.length - 1].id : undefined;

    return {
      events: filtered,
      has_more: rawEvents.length >= (query.limit || 100),
      latest_event_id: latestEventId,
    };
  }
}

export const defaultEventReplayService = new EventReplayService();
