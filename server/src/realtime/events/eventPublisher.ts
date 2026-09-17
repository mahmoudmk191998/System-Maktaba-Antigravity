import { v4 as uuidv4 } from 'uuid';
import { RmsEvent, EventPublishOptions } from './event.types.js';
import { IEventBus } from '../event-bus/eventBus.types.js';
import { defaultEventBus } from '../event-bus/eventBus.js';
import { IEventReplayStore, defaultEventReplayStore } from '../replay/eventReplayStore.js';
import { sanitizeRequestId } from '../../middleware/requestId.js';

export class EventPublisher {
  private eventBus: IEventBus;
  private replayStore: IEventReplayStore;

  constructor(
    eventBus: IEventBus = defaultEventBus,
    replayStore: IEventReplayStore = defaultEventReplayStore
  ) {
    this.eventBus = eventBus;
    this.replayStore = replayStore;
  }

  async publish<T>(
    tenantId: string,
    type: string,
    resourceType: string,
    resourceId: string,
    data: T,
    options: EventPublishOptions = {}
  ): Promise<RmsEvent<T>> {
    const eventId = `evt_${uuidv4().replace(/-/g, '').slice(0, 20)}`;
    const safeRequestId = sanitizeRequestId(options.request_id);

    const event: RmsEvent<T> = {
      id: eventId,
      type,
      version: '1',
      tenant_id: tenantId,
      integration_id: options.integration_id,
      branch_id: options.branch_id,
      resource_type: resourceType,
      resource_id: resourceId,
      request_id: safeRequestId,
      timestamp: new Date().toISOString(),
      data,
      metadata: options.metadata,
    };

    // 1. Store in sliding replay buffer
    await this.replayStore.saveEvent(event);

    // 2. Publish to distributed event bus
    await this.eventBus.publish(event);

    return event;
  }
}

export const defaultEventPublisher = new EventPublisher();
