import { PublicRmsEvent } from '../events/event.types.js';

export interface EventReplayQuery {
  tenant_id: string;
  last_event_id?: string;
  since_timestamp?: string;
  limit?: number;
  types?: string[];
  branch_id?: string;
  allowed_branch_ids?: string[];
  permissions?: string[];
}

export interface EventReplayResult {
  events: PublicRmsEvent[];
  has_more: boolean;
  latest_event_id?: string;
}
