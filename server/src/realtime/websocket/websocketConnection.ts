import { WebSocket } from 'ws';
import { IWsConnection, WsClientContext, WsServerMessage } from './websocket.types.js';
import { PublicRmsEvent } from '../events/event.types.js';

export class WebsocketConnection implements IWsConnection {
  readonly id: string;
  readonly context: WsClientContext;
  private ws: WebSocket;
  private closed: boolean = false;

  constructor(id: string, context: WsClientContext, ws: WebSocket, onClose?: () => void) {
    this.id = id;
    this.context = context;
    this.ws = ws;

    ws.on('close', () => {
      this.closed = true;
      onClose?.();
    });

    ws.on('error', () => {
      this.close();
    });
  }

  sendMessage(msg: WsServerMessage): void {
    if (this.closed || this.ws.readyState !== WebSocket.OPEN) return;
    try {
      this.ws.send(JSON.stringify(msg));
    } catch (_) {
      this.close();
    }
  }

  sendEvent(event: PublicRmsEvent): void {
    this.sendMessage({ type: 'event', event });
  }

  close(code?: number, reason?: string): void {
    if (this.closed) return;
    this.closed = true;
    try {
      this.ws.close(code || 1000, reason);
    } catch (_) {}
  }

  isOpen(): boolean {
    return !this.closed && this.ws.readyState === WebSocket.OPEN;
  }
}
