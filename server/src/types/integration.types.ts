import { ApiPermission } from './permissions.types.js';
import { RateLimitTier } from './client.types.js';

export const INTEGRATION_TYPES = [
  'custom_website',
  'mobile_app',
  'kiosk',
  'delivery_aggregator',
  'pos_terminal',
  'third_party_service',
  'other',
] as const;

export type IntegrationType = (typeof INTEGRATION_TYPES)[number];
export type IntegrationStatus = 'active' | 'disabled' | 'revoked';

export interface UniversalIntegration {
  id: string; // int_...
  tenant_id: string;
  name: string;
  type: IntegrationType;
  description?: string;
  api_client_id: string;
  allowed_branch_ids: string[];
  allowed_origins: string[];
  permissions: ApiPermission[];
  rate_limit_tier: RateLimitTier;
  webhook_endpoint_id?: string;
  webhook_url?: string;
  webhook_events?: string[];
  status: IntegrationStatus;
  created_at: string;
  updated_at: string;
  created_by?: string;
  metadata?: Record<string, any>;
}

export interface OnboardIntegrationInput {
  tenant_id?: string;
  name: string;
  type: IntegrationType;
  description?: string;
  allowed_branch_ids?: string[];
  allowed_origins?: string[];
  permissions: ApiPermission[];
  rate_limit_tier?: RateLimitTier;
  webhook_url?: string;
  webhook_events?: string[];
  expires_in_days?: number;
  created_by?: string;
  metadata?: Record<string, any>;
}

export interface UpdateIntegrationInput {
  name?: string;
  description?: string;
  type?: IntegrationType;
  allowed_branch_ids?: string[];
  allowed_origins?: string[];
  permissions?: ApiPermission[];
  rate_limit_tier?: RateLimitTier;
  status?: IntegrationStatus;
  metadata?: Record<string, any>;
}

export interface OnboardIntegrationResult {
  integration: UniversalIntegration;
  api_client_id: string;
  api_key: string;
  secret_last4: string;
  webhook_secret?: string;
  instructions: {
    auth_header: string;
    architecture_flow: string;
    sdk_usage: string;
  };
}

export interface RotateIntegrationSecretResult {
  integration_id: string;
  api_client_id: string;
  api_key: string;
  secret_last4: string;
  rotated_at: string;
}
