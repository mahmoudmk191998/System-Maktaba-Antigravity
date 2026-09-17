import { Response } from 'express';
import { v4 as uuidv4 } from 'uuid';
import { ISseConnection, SseClientContext } from './sse.types.js';
import { SseConnection } from './sseConnection.js';
import { IEventBus } from '../event-bus/eventBus.types.js';
import { defaultEventBus } from '../event-bus/eventBus.js';
import { EventReplayService, defaultEventReplayService } from '../replay/eventReplay.service.js';
import { AppError, ForbiddenError } from '../../utils/errors.js';

export class SseManager {
  private connections: Map<string, { connection: ISseConnection; unsubscribe: () => void }> = new Map();
  private maxConnectionsPerTenant: number;
  private maxConnectionsPerIntegration: number;
  private eventBus: IEventBus;
  private replayService: EventReplayService;

  constructor(
    eventBus: IEventBus = defaultEventBus,
    replayService: EventReplayService = defaultEventReplayService,
    maxConnectionsPerTenant: number = 100,
    maxConnectionsPerIntegration: number = 20
  ) {
    this.eventBus = eventBus;
    this.replayService = replayService;
    this.maxConnectionsPerTenant = maxConnectionsPerTenant;
    this.maxConnectionsPerIntegration = maxConnectionsPerIntegration;
  }

  async handleConnection(
    context: Omit<SseClientContext, 'connectionId' | 'connectedAt'>,
    res: Response,
    lastEventId?: string
  ): Promise<ISseConnection> {
    // 1. Connection Limits Check
    const tenantConns = Array.from(this.connections.values()).filter(
      (c) => c.connection.context.tenantId === context.tenantId && c.connection.isOpen()
    );

    if (tenantConns.length >= this.maxConnectionsPerTenant) {
      throw new AppError(
        `Connection limit exceeded: Maximum ${this.maxConnectionsPerTenant} SSE connections reached for this tenant`,
        429,
        'REALTIME_CONNECTION_LIMIT_EXCEEDED'
      );
    }

    const integrationConns = tenantConns.filter(
      (c) => c.connection.context.integrationId === context.integrationId
    );

    if (integrationConns.length >= this.maxConnectionsPerIntegration) {
      throw new AppError(
        `Connection limit exceeded: Maximum ${this.maxConnectionsPerIntegration} SSE connections reached for this integration`,
        429,
        'REALTIME_INTEGRATION_CONNECTION_LIMIT_EXCEEDED'
      );
    }

    const connectionId = `sse_${uuidv4().replace(/-/g, '').slice(0, 16)}`;
    const fullContext: SseClientContext = {
      ...context,
      connectionId,
      connectedAt: new Date().toISOString(),
    };

    // 2. Instantiate Connection
    const sseConn = new SseConnection(
      connectionId,
      fullContext,
      res,
      30000,
      () => this.removeConnection(connectionId)
    );

    // 3. Subscribe to Event Bus
    const unsubscribe = this.eventBus.subscribe(
      {
        tenant_id: context.tenantId,
        integration_id: context.integrationId,
        types: context.types,
        branch_id: context.branchId,
        allowed_branch_ids: context.allowedBranchIds,
        permissions: context.permissions,
      },
      (event) => {
        sseConn.sendEvent(event);
      }
    );

    this.connections.set(connectionId, { connection: sseConn, unsubscribe });

    // 4. Handle Event Replay (Last-Event-ID)
    if (lastEventId) {
      const replay = await this.replayService.replayEvents({
        tenant_id: context.tenantId,
        last_event_id: lastEventId,
        types: context.types,
        branch_id: context.branchId,
        allowed_branch_ids: context.allowedBranchIds,
        permissions: context.permissions,
      });

      for (const evt of replay.events) {
        sseConn.sendEvent(evt);
      }
    }

    return sseConn;
  }

  private removeConnection(connectionId: string): void {
    const entry = this.connections.get(connectionId);
    if (entry) {
      entry.unsubscribe();
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
      entry.unsubscribe();
      entry.connection.close();
    }
    this.connections.clear();
  }
}

export const defaultSseManager = new SseManager();
