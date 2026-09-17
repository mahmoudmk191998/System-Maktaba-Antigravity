import { Response, Request } from 'express';
import { PublicRmsEvent } from '../events/event.types.js';

export interface SseClientContext {
  connectionId: string;
  tenantId: string;
  integrationId: string;
  clientId: string;
  allowedBranchIds: string[];
  permissions: string[];
  types?: string[];
  branchId?: string;
  requestId: string;
  connectedAt: string;
}

export interface ISseConnection {
  readonly id: string;
  readonly context: SseClientContext;
  sendEvent(event: PublicRmsEvent): void;
  sendHeartbeat(): void;
  close(): void;
  isOpen(): boolean;
}
