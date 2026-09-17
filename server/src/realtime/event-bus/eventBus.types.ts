import { RmsEvent, PublicRmsEvent } from '../events/event.types.js';

export interface EventSubscriptionFilter {
  tenant_id: string;
  integration_id?: string;
  types?: string[];
  branch_id?: string;
  allowed_branch_ids?: string[];
  permissions?: string[];
}

export type EventHandler = (event: PublicRmsEvent) => void | Promise<void>;

export interface IEventBus {
  publish(event: RmsEvent): Promise<void>;
  subscribe(filter: EventSubscriptionFilter, handler: EventHandler): () => void;
  isHealthy(): boolean;
  clear(): void;
}
