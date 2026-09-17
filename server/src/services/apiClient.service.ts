import { v4 as uuidv4 } from 'uuid';
import { getFirestoreDb } from '../config/firebase.js';
import { env } from '../config/environment.js';
import {
  ApiClient,
  ApiClientAuditAction,
  ApiClientAuditLog,
  ApiClientStatus,
  CreateApiClientInput,
  CreateApiClientResult,
  PublicApiClient,
  RotateSecretResult,
  UpdateApiClientInput,
} from '../types/client.types.js';
import { ApiPermission, isValidPermission } from '../types/permissions.types.js';
import {
  generateClientId,
  generateClientSecret,
  createCredentialString,
  hashSecret,
  verifySecret,
} from '../utils/crypto.js';
import { AppError, NotFoundError, UnauthorizedError, ValidationError } from '../utils/errors.js';
import { logger } from '../utils/logger.js';
import { defaultBranchesService, BranchesService } from './branches.service.js';

const COLLECTION_NAME = 'api_clients';
const AUDIT_COLLECTION = 'api_client_audit_logs';

// In-memory store fallback for testing
const inMemoryClients = new Map<string, ApiClient>();
const inMemoryAuditLogs = new Map<string, ApiClientAuditLog[]>();

export class ApiClientService {
  private useMemory: boolean;
  private branchesService: BranchesService;

  constructor(
    useMemory: boolean = env.NODE_ENV === 'test',
    branchesService: BranchesService = defaultBranchesService
  ) {
    this.useMemory = useMemory;
    this.branchesService = branchesService;
  }

  private async logAudit(
    tenantId: string,
    clientId: string,
    action: ApiClientAuditAction,
    actorId: string,
    metadata: Record<string, any> = {}
  ): Promise<void> {
    const logId = `aud_${uuidv4().replace(/-/g, '').slice(0, 16)}`;
    const log: ApiClientAuditLog = {
      id: logId,
      tenant_id: tenantId,
      client_id: clientId,
      action,
      actor_id: actorId,
      metadata, // NEVER contains raw secret
      created_at: new Date().toISOString(),
    };

    if (this.useMemory) {
      const logs = inMemoryAuditLogs.get(clientId) || [];
      logs.push(log);
      inMemoryAuditLogs.set(clientId, logs);
    } else {
      try {
        const db = getFirestoreDb();
        await db.collection(AUDIT_COLLECTION).doc(logId).set(log);
      } catch (_) {
        const logs = inMemoryAuditLogs.get(clientId) || [];
        logs.push(log);
        inMemoryAuditLogs.set(clientId, logs);
      }
    }
  }

  /**
   * Validate that all allowed branches belong to the authenticated tenant.
   */
  async validateBranches(tenantId: string, branchIds?: string[]): Promise<void> {
    if (!branchIds || branchIds.length === 0) return;

    for (const branchId of branchIds) {
      try {
        const branch = await this.branchesService.getBranchById(tenantId, branchId);
        if (!branch) {
          throw new ValidationError(`Branch '${branchId}' does not belong to tenant '${tenantId}'`);
        }
      } catch (err: any) {
        throw new ValidationError(err.message || `Branch '${branchId}' does not belong to tenant '${tenantId}'`);
      }
    }
  }

  /**
   * Validate that all permissions are in canonical registry.
   */
  validatePermissions(permissions: ApiPermission[]): void {
    for (const perm of permissions) {
      if (!isValidPermission(perm)) {
        throw new ValidationError(`Invalid permission '${perm}'`);
      }
    }
  }

  /**
   * Validate allowed origins: reject wildcard in production and invalid URLs.
   */
  validateOrigins(origins?: string[]): void {
    if (!origins || origins.length === 0) return;

    for (const origin of origins) {
      if (origin === '*' || origin.includes('*')) {
        throw new ValidationError(`Wildcard origin '*' is not allowed for security reasons`);
      }
      try {
        new URL(origin);
      } catch (_) {
        throw new ValidationError(`Malformed origin URL: '${origin}'`);
      }
    }
  }

  /**
   * Creates a new API client credential for a tenant restaurant.
   * Client secret is returned ONCE in plain text.
   */
  async createClient(
    input: CreateApiClientInput,
    actorId: string = 'system'
  ): Promise<CreateApiClientResult> {
    if (!input.tenant_id) {
      throw new ValidationError('tenant_id is required');
    }
    if (!input.name) {
      throw new ValidationError('Client name is required');
    }
    if (!input.permissions || !Array.isArray(input.permissions) || input.permissions.length === 0) {
      throw new ValidationError('permissions array is required and cannot be empty');
    }

    this.validatePermissions(input.permissions);
    this.validateOrigins(input.allowed_origins);

    const clientId = generateClientId();
    const rawSecret = generateClientSecret();
    const secretHash = await hashSecret(rawSecret);
    const secretLast4 = rawSecret.slice(-4);
    const now = new Date().toISOString();

    let expiresAt: string | null = null;
    if (input.expires_at !== undefined) {
      expiresAt = input.expires_at;
    } else if (input.expires_in_days !== undefined) {
      const expDate = new Date();
      expDate.setDate(expDate.getDate() + input.expires_in_days);
      expiresAt = expDate.toISOString();
    }

    const clientData: ApiClient = {
      id: clientId,
      tenant_id: input.tenant_id,
      name: input.name,
      description: input.description,
      client_id: clientId,
      client_secret_hash: secretHash,
      secret_last4: secretLast4,
      status: 'active',
      permissions: input.permissions,
      allowed_branch_ids: input.allowed_branch_ids || [],
      allowed_origins: input.allowed_origins || [],
      rate_limit_tier: input.rate_limit_tier || 'free',
      created_at: now,
      updated_at: now,
      last_used_at: null,
      expires_at: expiresAt,
      revoked_at: null,
      created_by: input.created_by || actorId,
    };

    // Always maintain local memory cache in sync with Firestore
    inMemoryClients.set(clientId, clientData);

    if (!this.useMemory) {
      try {
        const db = getFirestoreDb();
        await db.collection(COLLECTION_NAME).doc(clientId).set(clientData);
      } catch (err) {
        logger.error('Failed to persist API client to Firestore, kept in memory fallback', {
          details: err,
          client_id: clientId,
        });
      }
    }

    await this.logAudit(input.tenant_id, clientId, 'client.created', actorId, {
      name: input.name,
      permissions: input.permissions,
      allowed_branch_ids: clientData.allowed_branch_ids,
    });

    const { client_secret_hash, ...safeClient } = clientData;
    const credentialHeader = createCredentialString(clientId, rawSecret);

    return {
      client: safeClient,
      client_id: clientId,
      client_secret: rawSecret,
      credential_header: credentialHeader,
      warning: 'Store this secret securely. It will not be shown again.',
    };
  }

  /**
   * List all API Clients for a tenant (never exposes secrets or hashes).
   */
  async listClients(tenantId: string): Promise<PublicApiClient[]> {
    let clients: ApiClient[] = [];

    if (this.useMemory) {
      clients = Array.from(inMemoryClients.values()).filter((c) => c.tenant_id === tenantId);
    } else {
      try {
        const db = getFirestoreDb();
        const snapshot = await db
          .collection(COLLECTION_NAME)
          .where('tenant_id', '==', tenantId)
          .get();
        if (!snapshot.empty) {
          clients = snapshot.docs.map((doc) => doc.data() as ApiClient);
          for (const c of clients) {
            inMemoryClients.set(c.client_id, c);
          }
        } else {
          // Check memory cache fallback
          const memClients = Array.from(inMemoryClients.values()).filter((c) => c.tenant_id === tenantId);
          if (memClients.length > 0) {
            clients = memClients;
          }
        }
      } catch (err) {
        logger.warn('Failed to query Firestore api_clients, falling back to memory', { details: err, tenant_id: tenantId });
        clients = Array.from(inMemoryClients.values()).filter((c) => c.tenant_id === tenantId);
      }
    }

    // Sort newest first
    clients.sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());

    return clients.map(({ client_secret_hash, ...safeClient }) => safeClient);
  }

  /**
   * Retrieves an API Client by ID with strict tenant isolation.
   */
  async getClientById(tenantId: string, clientId: string): Promise<PublicApiClient> {
    const client = await this.getClientByClientId(clientId);
    if (!client || client.tenant_id !== tenantId) {
      throw new NotFoundError(`API Client '${clientId}' not found`);
    }

    const { client_secret_hash, ...safeClient } = client;
    return safeClient;
  }

  /**
   * Update an API Client's configuration.
   */
  async updateClient(
    tenantId: string,
    clientId: string,
    input: UpdateApiClientInput,
    actorId: string = 'system'
  ): Promise<PublicApiClient> {
    const client = await this.getClientByClientId(clientId);
    if (!client || client.tenant_id !== tenantId) {
      throw new NotFoundError(`API Client '${clientId}' not found`);
    }

    if (input.permissions) {
      this.validatePermissions(input.permissions);
      client.permissions = input.permissions;
    }

    if (input.allowed_branch_ids) {
      await this.validateBranches(tenantId, input.allowed_branch_ids);
      client.allowed_branch_ids = input.allowed_branch_ids;
    }

    if (input.allowed_origins) {
      this.validateOrigins(input.allowed_origins);
      client.allowed_origins = input.allowed_origins;
    }

    if (input.name) client.name = input.name;
    if (input.description !== undefined) client.description = input.description;
    if (input.expires_at !== undefined) client.expires_at = input.expires_at;
    if (input.rate_limit_tier !== undefined) client.rate_limit_tier = input.rate_limit_tier;

    const now = new Date().toISOString();
    client.updated_at = now;

    if (this.useMemory || inMemoryClients.has(clientId)) {
      inMemoryClients.set(clientId, client);
    }

    if (!this.useMemory) {
      try {
        const db = getFirestoreDb();
        await db.collection(COLLECTION_NAME).doc(clientId).update({
          name: client.name,
          description: client.description || null,
          permissions: client.permissions,
          allowed_branch_ids: client.allowed_branch_ids,
          allowed_origins: client.allowed_origins,
          rate_limit_tier: client.rate_limit_tier || 'free',
          expires_at: client.expires_at,
          updated_at: now,
        });
      } catch (_) {}
    }

    await this.logAudit(tenantId, clientId, 'client.updated', actorId, {
      updated_fields: Object.keys(input),
    });

    const { client_secret_hash, ...safeClient } = client;
    return safeClient;
  }

  /**
   * Enable client (cannot revive revoked client).
   */
  /**
   * Enable client (cannot revive revoked client).
   */
  async enableClient(
    tenantIdOrClientId: string,
    clientIdOrActorId?: string,
    optionalActorId?: string
  ): Promise<PublicApiClient> {
    const isSingleArg = !clientIdOrActorId || tenantIdOrClientId.startsWith('cli_');
    const clientId = isSingleArg ? tenantIdOrClientId : clientIdOrActorId!;
    const tenantId = isSingleArg ? undefined : tenantIdOrClientId;
    const actorId = isSingleArg ? (clientIdOrActorId || 'system') : (optionalActorId || 'system');

    const client = await this.getClientByClientId(clientId);
    if (!client || (tenantId && client.tenant_id !== tenantId)) {
      throw new NotFoundError(`API Client '${clientId}' not found`);
    }

    if (client.status === 'revoked') {
      throw new AppError(
        `Cannot enable client '${clientId}': Revoked credentials cannot be reactivated`,
        400,
        'CLIENT_REVOKED'
      );
    }

    const now = new Date().toISOString();
    client.status = 'active';
    client.updated_at = now;

    if (this.useMemory || inMemoryClients.has(clientId)) {
      inMemoryClients.set(clientId, client);
    }

    if (!this.useMemory) {
      try {
        const db = getFirestoreDb();
        await db.collection(COLLECTION_NAME).doc(clientId).update({
          status: 'active',
          updated_at: now,
        });
      } catch (_) {}
    }

    await this.logAudit(client.tenant_id, clientId, 'client.enabled', actorId);

    const { client_secret_hash, ...safeClient } = client;
    return safeClient;
  }

  /**
   * Disable client.
   */
  async disableClient(
    tenantIdOrClientId: string,
    clientIdOrActorId?: string,
    optionalActorId?: string
  ): Promise<PublicApiClient> {
    const isSingleArg = !clientIdOrActorId || tenantIdOrClientId.startsWith('cli_');
    const clientId = isSingleArg ? tenantIdOrClientId : clientIdOrActorId!;
    const tenantId = isSingleArg ? undefined : tenantIdOrClientId;
    const actorId = isSingleArg ? (clientIdOrActorId || 'system') : (optionalActorId || 'system');

    const client = await this.getClientByClientId(clientId);
    if (!client || (tenantId && client.tenant_id !== tenantId)) {
      throw new NotFoundError(`API Client '${clientId}' not found`);
    }

    if (client.status === 'revoked') {
      throw new AppError(`Cannot disable a revoked client`, 400, 'CLIENT_REVOKED');
    }

    const now = new Date().toISOString();
    client.status = 'disabled';
    client.updated_at = now;

    if (this.useMemory || inMemoryClients.has(clientId)) {
      inMemoryClients.set(clientId, client);
    }

    if (!this.useMemory) {
      try {
        const db = getFirestoreDb();
        await db.collection(COLLECTION_NAME).doc(clientId).update({
          status: 'disabled',
          updated_at: now,
        });
      } catch (_) {}
    }

    await this.logAudit(client.tenant_id, clientId, 'client.disabled', actorId);

    const { client_secret_hash, ...safeClient } = client;
    return safeClient;
  }

  /**
   * Revoke client permanently.
   */
  async revokeClient(
    tenantIdOrClientId: string,
    clientIdOrActorId?: string,
    optionalActorId?: string
  ): Promise<PublicApiClient> {
    const isSingleArg = !clientIdOrActorId || tenantIdOrClientId.startsWith('cli_');
    const clientId = isSingleArg ? tenantIdOrClientId : clientIdOrActorId!;
    const tenantId = isSingleArg ? undefined : tenantIdOrClientId;
    const actorId = isSingleArg ? (clientIdOrActorId || 'system') : (optionalActorId || 'system');

    const client = await this.getClientByClientId(clientId);
    if (!client || (tenantId && client.tenant_id !== tenantId)) {
      throw new NotFoundError(`API Client '${clientId}' not found`);
    }

    const now = new Date().toISOString();
    client.status = 'revoked';
    client.revoked_at = now;
    client.updated_at = now;

    if (this.useMemory || inMemoryClients.has(clientId)) {
      inMemoryClients.set(clientId, client);
    }

    if (!this.useMemory) {
      try {
        const db = getFirestoreDb();
        await db.collection(COLLECTION_NAME).doc(clientId).update({
          status: 'revoked',
          revoked_at: now,
          updated_at: now,
        });
      } catch (_) {}
    }

    await this.logAudit(client.tenant_id, clientId, 'client.revoked', actorId);

    const { client_secret_hash, ...safeClient } = client;
    return safeClient;
  }

  /**
   * Rotates client secret, immediately invalidating old secret, and returning new secret ONCE.
   */
  async rotateSecret(
    tenantIdOrClientId: string,
    clientIdOrActorId?: string,
    optionalActorId?: string
  ): Promise<RotateSecretResult> {
    const isSingleArg = !clientIdOrActorId || tenantIdOrClientId.startsWith('cli_');
    const clientId = isSingleArg ? tenantIdOrClientId : clientIdOrActorId!;
    const tenantId = isSingleArg ? undefined : tenantIdOrClientId;
    const actorId = isSingleArg ? (clientIdOrActorId || 'system') : (optionalActorId || 'system');

    const client = await this.getClientByClientId(clientId);
    if (!client || (tenantId && client.tenant_id !== tenantId)) {
      throw new NotFoundError(`API Client '${clientId}' not found`);
    }

    if (client.status === 'revoked') {
      throw new AppError(
        `Cannot rotate secret for client '${clientId}': Client has been revoked`,
        400,
        'CLIENT_REVOKED'
      );
    }

    const newSecret = generateClientSecret();
    const newHash = await hashSecret(newSecret);
    const secretLast4 = newSecret.slice(-4);
    const now = new Date().toISOString();

    client.client_secret_hash = newHash;
    client.secret_last4 = secretLast4;
    client.updated_at = now;

    if (this.useMemory || inMemoryClients.has(clientId)) {
      inMemoryClients.set(clientId, client);
    }

    if (!this.useMemory) {
      try {
        const db = getFirestoreDb();
        await db.collection(COLLECTION_NAME).doc(clientId).update({
          client_secret_hash: newHash,
          secret_last4: secretLast4,
          updated_at: now,
        });
      } catch (_) {}
    }

    await this.logAudit(client.tenant_id, clientId, 'client.secret_rotated', actorId, {
      secret_last4: secretLast4,
    });

    return {
      client_id: clientId,
      client_secret: newSecret,
      credential_header: createCredentialString(clientId, newSecret),
      rotated_at: now,
      warning: 'Store this secret securely. The previous secret is now invalid.',
    };
  }

  /**
   * Retrieves an API Client by its public client_id
   */
  async getClientByClientId(clientId: string): Promise<ApiClient | null> {
    if (this.useMemory || inMemoryClients.has(clientId)) {
      return inMemoryClients.get(clientId) || null;
    }

    try {
      const db = getFirestoreDb();
      const doc = await db.collection(COLLECTION_NAME).doc(clientId).get();
      if (!doc.exists) {
        return inMemoryClients.get(clientId) || null;
      }
      return doc.data() as ApiClient;
    } catch (err) {
      return inMemoryClients.get(clientId) || null;
    }
  }

  /**
   * Verifies credentials sent by external restaurant clients.
   * Performs status check, expiration check, and hash matching.
   */
  async verifyCredentials(clientId: string, rawSecret: string): Promise<ApiClient> {
    const client = await this.getClientByClientId(clientId);
    if (!client) {
      throw new UnauthorizedError('Invalid client credentials');
    }

    if (client.status === 'revoked') {
      throw new UnauthorizedError('This API credential has been revoked');
    }

    if (client.status === 'disabled') {
      throw new UnauthorizedError('This API credential is currently disabled');
    }

    if (client.expires_at && new Date(client.expires_at) < new Date()) {
      throw new UnauthorizedError('This API credential has expired');
    }

    const isMatch = await verifySecret(rawSecret, client.client_secret_hash);
    if (!isMatch) {
      throw new UnauthorizedError('Invalid client credentials');
    }

    // Update last_used_at asynchronously
    this.updateLastUsed(clientId).catch(() => {});

    return client;
  }

  /**
   * Updates last_used_at timestamp
   */
  async updateLastUsed(clientId: string): Promise<void> {
    const now = new Date().toISOString();
    const inMem = inMemoryClients.get(clientId);
    if (inMem) {
      inMem.last_used_at = now;
    }

    if (!this.useMemory) {
      try {
        const db = getFirestoreDb();
        await db.collection(COLLECTION_NAME).doc(clientId).update({
          last_used_at: now,
        });
      } catch (_) {}
    }
  }

  /**
   * Get audit logs for a client
   */
  async getAuditLogs(tenantId: string, clientId?: string): Promise<ApiClientAuditLog[]> {
    if (this.useMemory) {
      if (clientId) {
        return inMemoryAuditLogs.get(clientId) || [];
      }
      const all: ApiClientAuditLog[] = [];
      for (const logs of inMemoryAuditLogs.values()) {
        all.push(...logs.filter((l) => l.tenant_id === tenantId));
      }
      return all;
    }

    try {
      const db = getFirestoreDb();
      let query = db.collection(AUDIT_COLLECTION).where('tenant_id', '==', tenantId);
      if (clientId) {
        query = query.where('client_id', '==', clientId);
      }
      const snapshot = await query.orderBy('created_at', 'desc').get();
      return snapshot.docs.map((doc) => doc.data() as ApiClientAuditLog);
    } catch (_) {
      if (clientId) {
        return inMemoryAuditLogs.get(clientId) || [];
      }
      const all: ApiClientAuditLog[] = [];
      for (const logs of inMemoryAuditLogs.values()) {
        all.push(...logs.filter((l) => l.tenant_id === tenantId));
      }
      return all;
    }
  }

  clearMemory() {
    inMemoryClients.clear();
    inMemoryAuditLogs.clear();
  }
}

export const defaultApiClientService = new ApiClientService();
