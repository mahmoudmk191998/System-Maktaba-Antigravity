import { ApiPermission } from './permissions.types.js';

export type ApiClientStatus = 'active' | 'disabled' | 'revoked';
export type RateLimitTier = 'free' | 'standard' | 'premium';

export interface ApiClient {
  id: string;
  tenant_id: string;
  name: string;
  description?: string;
  client_id: string;
  client_secret_hash: string;
  secret_last4: string;
  status: ApiClientStatus;
  permissions: ApiPermission[];
  allowed_branch_ids: string[];
  allowed_origins: string[];
  rate_limit_tier?: RateLimitTier;
  created_at: string;
  updated_at: string;
  last_used_at: string | null;
  expires_at: string | null;
  revoked_at: string | null;
  created_by?: string;
}

export type PublicApiClient = Omit<ApiClient, 'client_secret_hash'>;

export interface CreateApiClientInput {
  tenant_id: string;
  name: string;
  description?: string;
  permissions: ApiPermission[];
  allowed_branch_ids?: string[];
  allowed_origins?: string[];
  rate_limit_tier?: RateLimitTier;
  expires_in_days?: number;
  expires_at?: string | null;
  created_by?: string;
}

export interface UpdateApiClientInput {
  name?: string;
  description?: string;
  permissions?: ApiPermission[];
  allowed_branch_ids?: string[];
  allowed_origins?: string[];
  rate_limit_tier?: RateLimitTier;
  expires_at?: string | null;
}

export interface CreateApiClientResult {
  client: PublicApiClient;
  client_id: string;
  client_secret: string;
  credential_header: string; // Ready-to-use Bearer token string
  warning: string;
}

export interface RotateSecretResult {
  client_id: string;
  client_secret: string;
  credential_header: string;
  rotated_at: string;
  warning: string;
}

export type ApiClientAuditAction =
  | 'client.created'
  | 'client.updated'
  | 'client.enabled'
  | 'client.disabled'
  | 'client.revoked'
  | 'client.secret_rotated';

export interface ApiClientAuditLog {
  id: string;
  tenant_id: string;
  client_id: string;
  action: ApiClientAuditAction;
  actor_id: string;
  metadata: Record<string, any>;
  created_at: string;
}
