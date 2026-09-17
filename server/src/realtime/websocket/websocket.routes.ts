import { IncomingMessage } from 'http';
import { WebSocketServer, WebSocket } from 'ws';
import { defaultWebsocketManager, WebsocketManager } from './websocketManager.js';
import { defaultApiClientService } from '../../services/apiClient.service.js';
import { parseCredentialString } from '../../utils/crypto.js';

export function setupWebsocketServer(
  wss: WebSocketServer,
  wsManager: WebsocketManager = defaultWebsocketManager
): void {
  wss.on('connection', async (ws: WebSocket, req: IncomingMessage) => {
    try {
      const url = new URL(req.url || '/', 'http://localhost');
      const token = url.searchParams.get('token') || url.searchParams.get('api_key');
      const authHeader = req.headers['authorization'];

      let rawCred: string | null = null;
      if (token) {
        rawCred = token.startsWith('Bearer ') ? token.slice(7).trim() : token.trim();
      } else if (authHeader && authHeader.startsWith('Bearer ')) {
        rawCred = authHeader.slice(7).trim();
      }

      if (!rawCred) {
        ws.close(1008, 'Missing authentication credential');
        return;
      }

      const parsed = parseCredentialString(rawCred);
      if (!parsed) {
        ws.close(1008, 'Invalid credential format');
        return;
      }

      const client = await defaultApiClientService.verifyCredentials(parsed.clientId, parsed.secret);

      // Verify origin
      const origin = req.headers.origin;
      if (origin && client.allowed_origins && client.allowed_origins.length > 0) {
        if (!client.allowed_origins.includes(origin)) {
          ws.close(1008, 'Origin not allowed');
          return;
        }
      }

      await wsManager.handleConnection(
        {
          tenantId: client.tenant_id,
          integrationId: client.client_id,
          clientId: client.client_id,
          allowedBranchIds: client.allowed_branch_ids || [],
          permissions: client.permissions || [],
        },
        ws
      );
    } catch (err: any) {
      ws.close(1008, err?.message || 'Authentication failed');
    }
  });
}
