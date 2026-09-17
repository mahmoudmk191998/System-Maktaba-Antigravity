import { auth } from '@/lib/firebase';

const API_BASE_URL =
  import.meta.env.VITE_API_URL ||
  (import.meta.env.PROD
    ? 'https://my-bot-production-e396.up.railway.app/api/v1'
    : 'http://localhost:4000/api/v1');

export interface ApiClientItem {
  id: string;
  name: string;
  description?: string;
  client_id: string;
  secret_last4: string;
  status: 'active' | 'disabled' | 'revoked';
  permissions: string[];
  allowed_branch_ids: string[];
  allowed_origins?: string[];
  rate_limit_tier?: 'free' | 'standard' | 'premium';
  created_at: string;
  last_used_at: string | null;
  expires_at?: string | null;
}

export interface CreateApiClientPayload {
  name: string;
  description?: string;
  permissions?: string[];
  allowed_branch_ids?: string[];
  allowed_origins?: string[];
  rate_limit_tier?: 'free' | 'standard' | 'premium';
  expires_in_days?: number;
}

export interface CreateApiClientResponse {
  client: ApiClientItem;
  client_id: string;
  client_secret: string;
  credential_header: string;
  warning: string;
}

export interface RotateSecretResponse {
  client_id: string;
  client_secret: string;
  credential_header: string;
  rotated_at: string;
  warning: string;
}

async function getAuthHeaders(tenantId?: string | null): Promise<HeadersInit> {
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
  };

  if (tenantId) {
    headers['X-Tenant-ID'] = tenantId;
  }

  // Get current Firebase Auth ID token if user is authenticated
  if (auth.currentUser) {
    try {
      const token = await auth.currentUser.getIdToken();
      headers['Authorization'] = `Bearer ${token}`;
    } catch (err) {
      console.warn('Failed to retrieve Firebase Auth ID token:', err);
    }
  }

  return headers;
}

export const apiClientsService = {
  /**
   * List all API clients for the authenticated tenant.
   */
  async listClients(tenantId?: string | null): Promise<ApiClientItem[]> {
    const headers = await getAuthHeaders(tenantId);
    const response = await fetch(`${API_BASE_URL}/admin/api-clients`, {
      method: 'GET',
      headers,
    });

    const data = await response.json();
    if (!response.ok) {
      throw new Error(data.error?.message || 'فشل في جلب مفاتيح الـ REST API');
    }

    return data.data || [];
  },

  /**
   * Create a new API client with server-side cryptographically secure secret generation.
   */
  async createClient(
    payload: CreateApiClientPayload,
    tenantId?: string | null
  ): Promise<CreateApiClientResponse> {
    const headers = await getAuthHeaders(tenantId);
    const response = await fetch(`${API_BASE_URL}/admin/api-clients`, {
      method: 'POST',
      headers,
      body: JSON.stringify({
        ...payload,
        permissions: payload.permissions && payload.permissions.length > 0
          ? payload.permissions
          : ['menu:read', 'orders:create', 'orders:read'],
      }),
    });

    const data = await response.json();
    if (!response.ok) {
      throw new Error(data.error?.message || 'فشل في إنشاء مفتاح الـ API');
    }

    return data.data;
  },

  /**
   * Rotate client secret, invalidating old secret immediately.
   */
  async rotateSecret(clientId: string, tenantId?: string | null): Promise<RotateSecretResponse> {
    const headers = await getAuthHeaders(tenantId);
    const response = await fetch(`${API_BASE_URL}/admin/api-clients/${clientId}/rotate-secret`, {
      method: 'POST',
      headers,
    });

    const data = await response.json();
    if (!response.ok) {
      throw new Error(data.error?.message || 'فشل في تدوير المفتاح السري');
    }

    return data.data;
  },

  /**
   * Enable a disabled API client.
   */
  async enableClient(clientId: string, tenantId?: string | null): Promise<ApiClientItem> {
    const headers = await getAuthHeaders(tenantId);
    const response = await fetch(`${API_BASE_URL}/admin/api-clients/${clientId}/enable`, {
      method: 'POST',
      headers,
    });

    const data = await response.json();
    if (!response.ok) {
      throw new Error(data.error?.message || 'فشل في تفعيل مفتاح الـ API');
    }

    return data.data;
  },

  /**
   * Disable an active API client.
   */
  async disableClient(clientId: string, tenantId?: string | null): Promise<ApiClientItem> {
    const headers = await getAuthHeaders(tenantId);
    const response = await fetch(`${API_BASE_URL}/admin/api-clients/${clientId}/disable`, {
      method: 'POST',
      headers,
    });

    const data = await response.json();
    if (!response.ok) {
      throw new Error(data.error?.message || 'فشل في تعطيل مفتاح الـ API');
    }

    return data.data;
  },

  /**
   * Revoke an API client permanently.
   */
  async revokeClient(clientId: string, tenantId?: string | null): Promise<ApiClientItem> {
    const headers = await getAuthHeaders(tenantId);
    const response = await fetch(`${API_BASE_URL}/admin/api-clients/${clientId}/revoke`, {
      method: 'POST',
      headers,
    });

    const data = await response.json();
    if (!response.ok) {
      throw new Error(data.error?.message || 'فشل في إلغاء مفتاح الـ API');
    }

    return data.data;
  },
};
