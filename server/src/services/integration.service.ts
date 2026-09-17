import crypto from 'crypto';
import { v4 as uuidv4 } from 'uuid';
import { env } from '../config/environment.js';
import { getFirestoreDb } from '../config/firebase.js';
import { NotFoundError, AppError } from '../utils/errors.js';
import {
  OnboardIntegrationInput,
  OnboardIntegrationResult,
  RotateIntegrationSecretResult,
  UniversalIntegration,
  UpdateIntegrationInput,
} from '../types/integration.types.js';
import { WebhookEventType } from '../types/webhook.types.js';
import { ApiClientService, defaultApiClientService } from './apiClient.service.js';
import { WebhookService, defaultWebhookService } from './webhook.service.js';

const INTEGRATIONS_COLLECTION = 'integrations';

// In-memory test store
const inMemoryIntegrations = new Map<string, UniversalIntegration>();

export class IntegrationService {
  private useMemory: boolean;
  private apiClientService: ApiClientService;
  private webhookService: WebhookService;

  constructor(
    useMemory: boolean = env.NODE_ENV === 'test',
    apiClientService: ApiClientService = defaultApiClientService,
    webhookService: WebhookService = defaultWebhookService
  ) {
    this.useMemory = useMemory;
    this.apiClientService = apiClientService;
    this.webhookService = webhookService;
  }

  /**
   * Onboard a universal integration: creates integration, API credentials, and optional Webhook in one step.
   */
  async onboardIntegration(
    tenantId: string,
    input: OnboardIntegrationInput
  ): Promise<OnboardIntegrationResult> {
    const integrationId = `int_${uuidv4().replace(/-/g, '').slice(0, 20)}`;
    const now = new Date().toISOString();

    // 1. Create underlying API Client with matched configurations
    const clientResult = await this.apiClientService.createClient({
      tenant_id: tenantId,
      name: input.name,
      description: input.description || `Universal Integration [${input.type}]: ${input.name}`,
      permissions: input.permissions,
      allowed_branch_ids: input.allowed_branch_ids || [],
      allowed_origins: input.allowed_origins || [],
      rate_limit_tier: input.rate_limit_tier || 'standard',
      expires_in_days: input.expires_in_days,
      created_by: input.created_by,
    });

    // 2. Optionally configure Webhook endpoint if requested
    let webhookSecret: string | undefined = undefined;
    let webhookEndpointId: string | undefined = undefined;

    if (input.webhook_url) {
      const webhookRes = await this.webhookService.createEndpoint(
        tenantId,
        clientResult.client_id,
        {
          url: input.webhook_url,
          events: (input.webhook_events && input.webhook_events.length > 0
            ? input.webhook_events
            : ['order.created', 'order.status_updated']) as WebhookEventType[],
          active: true,
        }
      );
      webhookSecret = webhookRes.secret;
      webhookEndpointId = webhookRes.endpoint.id;
    }

    // 3. Construct Universal Integration record
    const integration: UniversalIntegration = {
      id: integrationId,
      tenant_id: tenantId,
      name: input.name,
      type: input.type,
      description: input.description,
      api_client_id: clientResult.client_id,
      allowed_branch_ids: input.allowed_branch_ids || [],
      allowed_origins: input.allowed_origins || [],
      permissions: input.permissions,
      rate_limit_tier: input.rate_limit_tier || 'standard',
      webhook_endpoint_id: webhookEndpointId,
      webhook_url: input.webhook_url,
      webhook_events: input.webhook_events,
      status: 'active',
      created_at: now,
      updated_at: now,
      created_by: input.created_by,
      metadata: input.metadata || {},
    };

    // 4. Persist
    if (this.useMemory) {
      inMemoryIntegrations.set(integrationId, integration);
    } else {
      try {
        const db = getFirestoreDb();
        await db.collection(INTEGRATIONS_COLLECTION).doc(integrationId).set(integration);
      } catch (_) {
        inMemoryIntegrations.set(integrationId, integration);
      }
    }

    return {
      integration,
      api_client_id: clientResult.client_id,
      api_key: clientResult.credential_header,
      secret_last4: clientResult.client_secret.slice(-4),
      webhook_secret: webhookSecret,
      instructions: {
        auth_header: `Authorization: Bearer ${clientResult.credential_header}`,
        architecture_flow: 'Browser / App UI -> External Website Backend (Server Action/Express) -> RMS Standalone API',
        sdk_usage: `const rms = new RmsApiClient({ baseUrl: 'https://api.your-rms.com/api/v1', apiKey: '${clientResult.credential_header}' });`,
      },
    };
  }

  /**
   * List all universal integrations for a tenant
   */
  async listIntegrations(
    tenantId: string,
    filters?: { type?: string; status?: string }
  ): Promise<UniversalIntegration[]> {
    if (this.useMemory) {
      return Array.from(inMemoryIntegrations.values()).filter((item) => {
        if (item.tenant_id !== tenantId) return false;
        if (filters?.type && item.type !== filters.type) return false;
        if (filters?.status && item.status !== filters.status) return false;
        return true;
      });
    }

    try {
      const db = getFirestoreDb();
      let query: FirebaseFirestore.Query = db
        .collection(INTEGRATIONS_COLLECTION)
        .where('tenant_id', '==', tenantId);

      if (filters?.type) {
        query = query.where('type', '==', filters.type);
      }
      if (filters?.status) {
        query = query.where('status', '==', filters.status);
      }

      const snapshot = await query.get();
      return snapshot.docs.map((doc) => doc.data() as UniversalIntegration);
    } catch (_) {
      return Array.from(inMemoryIntegrations.values()).filter(
        (i) => i.tenant_id === tenantId
      );
    }
  }

  /**
   * Fetch single universal integration by ID
   */
  async getIntegrationById(
    tenantId: string,
    integrationId: string
  ): Promise<UniversalIntegration> {
    let integration: UniversalIntegration | undefined;

    if (this.useMemory) {
      integration = inMemoryIntegrations.get(integrationId);
    } else {
      try {
        const db = getFirestoreDb();
        const doc = await db.collection(INTEGRATIONS_COLLECTION).doc(integrationId).get();
        if (doc.exists) {
          integration = doc.data() as UniversalIntegration;
        }
      } catch (_) {
        integration = inMemoryIntegrations.get(integrationId);
      }
    }

    if (!integration || integration.tenant_id !== tenantId) {
      throw new NotFoundError(`Universal Integration '${integrationId}' not found`);
    }

    return integration;
  }

  /**
   * Update integration metadata and synchronize with API client
   */
  async updateIntegration(
    tenantId: string,
    integrationId: string,
    input: UpdateIntegrationInput
  ): Promise<UniversalIntegration> {
    const existing = await this.getIntegrationById(tenantId, integrationId);
    const now = new Date().toISOString();

    const updated: UniversalIntegration = {
      ...existing,
      name: input.name ?? existing.name,
      description: input.description ?? existing.description,
      type: input.type ?? existing.type,
      allowed_branch_ids: input.allowed_branch_ids ?? existing.allowed_branch_ids,
      allowed_origins: input.allowed_origins ?? existing.allowed_origins,
      permissions: input.permissions ?? existing.permissions,
      rate_limit_tier: input.rate_limit_tier ?? existing.rate_limit_tier,
      status: input.status ?? existing.status,
      metadata: input.metadata ? { ...existing.metadata, ...input.metadata } : existing.metadata,
      updated_at: now,
    };

    // Synchronize updates to underlying API client
    await this.apiClientService.updateClient(tenantId, existing.api_client_id, {
      name: updated.name,
      description: updated.description,
      permissions: updated.permissions,
      allowed_branch_ids: updated.allowed_branch_ids,
      allowed_origins: updated.allowed_origins,
      rate_limit_tier: updated.rate_limit_tier,
    });

    if (input.status && input.status !== existing.status) {
      if (input.status === 'disabled') {
        await this.apiClientService.disableClient(tenantId, existing.api_client_id);
      } else if (input.status === 'active' && existing.status === 'disabled') {
        await this.apiClientService.enableClient(tenantId, existing.api_client_id);
      } else if (input.status === 'revoked') {
        await this.apiClientService.revokeClient(tenantId, existing.api_client_id);
      }
    }

    if (this.useMemory) {
      inMemoryIntegrations.set(integrationId, updated);
    } else {
      try {
        const db = getFirestoreDb();
        await db.collection(INTEGRATIONS_COLLECTION).doc(integrationId).set(updated, { merge: true });
      } catch (_) {
        inMemoryIntegrations.set(integrationId, updated);
      }
    }

    return updated;
  }

  /**
   * Revoke universal integration and disable associated API client
   */
  async revokeIntegration(
    tenantId: string,
    integrationId: string
  ): Promise<{ message: string; integration: UniversalIntegration }> {
    const existing = await this.getIntegrationById(tenantId, integrationId);

    const revoked = await this.updateIntegration(tenantId, integrationId, {
      status: 'revoked',
    });

    // Also revoke underlying client
    await this.apiClientService.revokeClient(tenantId, existing.api_client_id);

    return {
      message: `Universal Integration '${integrationId}' has been revoked`,
      integration: revoked,
    };
  }

  /**
   * Rotate integration secret
   */
  async rotateSecret(
    tenantId: string,
    integrationId: string
  ): Promise<RotateIntegrationSecretResult> {
    const integration = await this.getIntegrationById(tenantId, integrationId);
    if (integration.status !== 'active') {
      throw new AppError(`Cannot rotate secret for inactive integration (${integration.status})`, 400);
    }

    const rotated = await this.apiClientService.rotateSecret(tenantId, integration.api_client_id);

    return {
      integration_id: integrationId,
      api_client_id: integration.api_client_id,
      api_key: rotated.credential_header,
      secret_last4: rotated.client_secret.slice(-4),
      rotated_at: rotated.rotated_at,
    };
  }

  clearMemory(): void {
    inMemoryIntegrations.clear();
  }
}

export const defaultIntegrationService = new IntegrationService();
