import { WebSocket } from 'ws';
import { PublicRmsEvent } from '../events/event.types.js';

export type WsClientAction = 'subscribe' | 'unsubscribe' | 'ping' | 'replay';

export interface WsClientMessage {
  action: WsClientAction;
  types?: string[];
  branch_id?: string;
  last_event_id?: string;
}

export interface WsServerMessage {
  type: 'event' | 'pong' | 'subscribed' | 'unsubscribed' | 'error' | 'replayed' | 'connected';
  event?: PublicRmsEvent;
  data?: unknown;
  error?: {
    code: string;
    message: string;
  };
}

export interface WsClientContext {
  connectionId: string;
  tenantId: string;
  integrationId: string;
  clientId: string;
  allowedBranchIds: string[];
  permissions: string[];
  connectedAt: string;
}

export interface IWsConnection {
  readonly id: string;
  readonly context: WsClientContext;
  sendMessage(msg: WsServerMessage): void;
  sendEvent(event: PublicRmsEvent): void;
  close(code?: number, reason?: string): void;
  isOpen(): boolean;
}
