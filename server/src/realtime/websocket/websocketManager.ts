import { WebSocket } from 'ws';
import { v4 as uuidv4 } from 'uuid';
import { IWsConnection, WsClientContext, WsClientMessage, WsServerMessage } from './websocket.types.js';
import { WebsocketConnection } from './websocketConnection.js';
import { IEventBus } from '../event-bus/eventBus.types.js';
import { defaultEventBus } from '../event-bus/eventBus.js';
import { EventReplayService, defaultEventReplayService } from '../replay/eventReplay.service.js';
import { AppError } from '../../utils/errors.js';

interface ConnectionEntry {
  connection: IWsConnection;
  unsubscribers: Map<string, () => void>;
}

export class WebsocketManager {
  private connections: Map<string, ConnectionEntry> = new Map();
  private maxConnectionsPerTenant: number;
  private maxConnectionsPerIntegration: number;
  private maxSubscriptionsPerConn: number;
  private eventBus: IEventBus;
  private replayService: EventReplayService;

  constructor(
    eventBus: IEventBus = defaultEventBus,
    replayService: EventReplayService = defaultEventReplayService,
    maxConnectionsPerTenant: number = 100,
    maxConnectionsPerIntegration: number = 20,
    maxSubscriptionsPerConn: number = 20
  ) {
    this.eventBus = eventBus;
    this.replayService = replayService;
    this.maxConnectionsPerTenant = maxConnectionsPerTenant;
    this.maxConnectionsPerIntegration = maxConnectionsPerIntegration;
    this.maxSubscriptionsPerConn = maxSubscriptionsPerConn;
  }

  async handleConnection(
    context: Omit<WsClientContext, 'connectionId' | 'connectedAt'>,
    ws: WebSocket
  ): Promise<IWsConnection> {
    // 1. Connection Limits Check
    const tenantConns = Array.from(this.connections.values()).filter(
      (c) => c.connection.context.tenantId === context.tenantId && c.connection.isOpen()
    );

    if (tenantConns.length >= this.maxConnectionsPerTenant) {
      ws.close(1008, 'Tenant connection limit exceeded');
      throw new AppError(
        `Connection limit exceeded: Maximum ${this.maxConnectionsPerTenant} WebSocket connections reached for this tenant`,
        429,
        'REALTIME_CONNECTION_LIMIT_EXCEEDED'
      );
    }

    const integrationConns = tenantConns.filter(
      (c) => c.connection.context.integrationId === context.integrationId
    );

    if (integrationConns.length >= this.maxConnectionsPerIntegration) {
      ws.close(1008, 'Integration connection limit exceeded');
      throw new AppError(
        `Connection limit exceeded: Maximum ${this.maxConnectionsPerIntegration} WebSocket connections reached for this integration`,
        429,
        'REALTIME_INTEGRATION_CONNECTION_LIMIT_EXCEEDED'
      );
    }

    const connectionId = `ws_${uuidv4().replace(/-/g, '').slice(0, 16)}`;
    const fullContext: WsClientContext = {
      ...context,
      connectionId,
      connectedAt: new Date().toISOString(),
    };

    const wsConn = new WebsocketConnection(connectionId, fullContext, ws, () => {
      this.removeConnection(connectionId);
    });

    const entry: ConnectionEntry = {
      connection: wsConn,
      unsubscribers: new Map(),
    };

    this.connections.set(connectionId, entry);

    // Initial connected message
    wsConn.sendMessage({
      type: 'connected',
      data: {
        connection_id: connectionId,
        tenant_id: context.tenantId,
        server_time: new Date().toISOString(),
      },
    });

    // Handle incoming messages
    ws.on('message', async (data: any) => {
      try {
        const text = typeof data === 'string' ? data : data.toString('utf-8');
        const msg = JSON.parse(text) as WsClientMessage;
        await this.handleClientMessage(connectionId, msg);
      } catch (err: any) {
        wsConn.sendMessage({
          type: 'error',
          error: { code: 'BAD_REQUEST', message: err?.message || 'Invalid message format' },
        });
      }
    });

    return wsConn;
  }

  private async handleClientMessage(connectionId: string, msg: WsClientMessage): Promise<void> {
    const entry = this.connections.get(connectionId);
    if (!entry) return;

    const { connection, unsubscribers } = entry;
    const { context } = connection;

    if (msg.action === 'ping') {
      connection.sendMessage({ type: 'pong', data: { timestamp: Date.now() } });
      return;
    }

    if (msg.action === 'subscribe') {
      if (unsubscribers.size >= this.maxSubscriptionsPerConn) {
        connection.sendMessage({
          type: 'error',
          error: {
            code: 'SUBSCRIPTION_LIMIT_EXCEEDED',
            message: `Maximum ${this.maxSubscriptionsPerConn} active subscriptions allowed per connection`,
          },
        });
        return;
      }

      // Branch authorization check
      if (msg.branch_id && context.allowedBranchIds.length > 0) {
        if (!context.allowedBranchIds.includes(msg.branch_id)) {
          connection.sendMessage({
            type: 'error',
            error: {
              code: 'FORBIDDEN_BRANCH',
              message: `Branch '${msg.branch_id}' is not authorized for this client`,
            },
          });
          return;
        }
      }

      const subKey = `${msg.types?.join(',') || '*'}:${msg.branch_id || '*'}`;
      if (unsubscribers.has(subKey)) {
        connection.sendMessage({ type: 'subscribed', data: { key: subKey, status: 'already_subscribed' } });
        return;
      }

      const unsub = this.eventBus.subscribe(
        {
          tenant_id: context.tenantId,
          integration_id: context.integrationId,
          types: msg.types,
          branch_id: msg.branch_id,
          allowed_branch_ids: context.allowedBranchIds,
          permissions: context.permissions,
        },
        (event) => {
          connection.sendEvent(event);
        }
      );

      unsubscribers.set(subKey, unsub);
      connection.sendMessage({ type: 'subscribed', data: { key: subKey, types: msg.types, branch_id: msg.branch_id } });

      // Handle optional replay on subscription
      if (msg.last_event_id) {
        const replay = await this.replayService.replayEvents({
          tenant_id: context.tenantId,
          last_event_id: msg.last_event_id,
          types: msg.types,
          branch_id: msg.branch_id,
          allowed_branch_ids: context.allowedBranchIds,
          permissions: context.permissions,
        });

        for (const evt of replay.events) {
          connection.sendEvent(evt);
        }
      }

      return;
    }

    if (msg.action === 'unsubscribe') {
      const subKey = `${msg.types?.join(',') || '*'}:${msg.branch_id || '*'}`;
      const unsub = unsubscribers.get(subKey);
      if (unsub) {
        unsub();
        unsubscribers.delete(subKey);
      }
      connection.sendMessage({ type: 'unsubscribed', data: { key: subKey } });
      return;
    }

    if (msg.action === 'replay' && msg.last_event_id) {
      const replay = await this.replayService.replayEvents({
        tenant_id: context.tenantId,
        last_event_id: msg.last_event_id,
        types: msg.types,
        branch_id: msg.branch_id,
        allowed_branch_ids: context.allowedBranchIds,
        permissions: context.permissions,
      });

      for (const evt of replay.events) {
        connection.sendEvent(evt);
      }

      connection.sendMessage({
        type: 'replayed',
        data: { count: replay.events.length, has_more: replay.has_more },
      });
      return;
    }
  }

  private removeConnection(connectionId: string): void {
    const entry = this.connections.get(connectionId);
    if (entry) {
      for (const unsub of entry.unsubscribers.values()) {
        unsub();
      }
      entry.unsubscribers.clear();
      this.connections.delete(connectionId);
    }
  }

  getActiveConnectionCount(tenantId?: string): number {
    if (!tenantId) return this.connections.size;
    return Array.from(this.connections.values()).filter(
      (c) => c.connection.context.tenantId === tenantId && c.connection.isOpen()
    ).length;
  }

  closeAll(): void {
    for (const [id, entry] of this.connections.entries()) {
      for (const unsub of entry.unsubscribers.values()) {
        unsub();
      }
      entry.unsubscribers.clear();
      entry.connection.close();
    }
    this.connections.clear();
  }
}

export const defaultWebsocketManager = new WebsocketManager();
