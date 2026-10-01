import { Response, NextFunction } from 'express';
import { defaultApiClientService, ApiClientService } from '../services/apiClient.service.js';
import { AuthenticatedRequest } from '../types/api.types.js';
import { parseCredentialString } from '../utils/crypto.js';
import { ForbiddenError, UnauthorizedError } from '../utils/errors.js';
import { getFirebaseAuth, getFirestoreDb } from '../config/firebase.js';
import { env } from '../config/environment.js';
import { ApiPermission, API_PERMISSIONS, hasPermissionMatch } from '../types/permissions.types.js';

const ADMIN_ALL_PERMISSIONS: string[] = ['*', ...API_PERMISSIONS];

export function createAuthMiddleware(clientService: ApiClientService = defaultApiClientService) {
  return async (req: AuthenticatedRequest, res: Response, next: NextFunction): Promise<void> => {
    try {
      if (req.apiClient) {
        return next();
      }

      const authHeader = req.header('Authorization');

      if (!authHeader) {
        throw new UnauthorizedError('Missing Authorization header. Use Bearer <credential>');
      }

      if (!authHeader.startsWith('Bearer ')) {
        throw new UnauthorizedError('Invalid authorization scheme. Bearer token is required');
      }

      const rawCredential = authHeader.slice('Bearer '.length).trim();
      if (!rawCredential) {
        throw new UnauthorizedError('Missing API credential token');
      }

      const parsed = parseCredentialString(rawCredential);
      let clientAllowedOrigins: string[] = [];

      if (parsed) {
        // Path 1: Verify against client credentials database
        const client = await clientService.verifyCredentials(parsed.clientId, parsed.secret);

        // Set verified request context
        req.apiClient = {
          clientId: client.client_id,
          tenantId: client.tenant_id,
          allowedBranchIds: client.allowed_branch_ids || [],
          permissions: client.permissions || [],
          rateLimitTier: client.rate_limit_tier,
        };

        clientAllowedOrigins = client.allowed_origins || [];
      } else {
        // If it starts with rms_live_ or contains colon, it was an invalid API key, not a JWT
        if (rawCredential.startsWith('rms_live_') || rawCredential.includes(':')) {
          throw new UnauthorizedError('Invalid client credentials');
        }

        // Path 2: Check for Firebase Auth ID token (Admin Dashboard session)
        let verifiedUid: string | null = null;
        let tokenTenantId: string | null = null;
        let firebasePermissions: string[] = [];
        let allowedBranchIds: string[] = [];

        // Test mode mock support
        if (env.NODE_ENV === 'test' && rawCredential.startsWith('mock_admin_token_')) {
          verifiedUid = rawCredential.replace('mock_admin_token_', '');
          tokenTenantId = (req.header('X-Tenant-ID') as string) || 'tenant_main';
          firebasePermissions = ADMIN_ALL_PERMISSIONS;
        } else if (rawCredential.split('.').length === 3) {
          try {
            const firebaseAuth = getFirebaseAuth();
            const decoded = await firebaseAuth.verifyIdToken(rawCredential);
            verifiedUid = decoded.uid;
          } catch (fbErr) {
            throw new UnauthorizedError('Invalid client credentials');
          }
        } else {
          throw new UnauthorizedError('Invalid client credentials');
        }

        if (!verifiedUid) {
          throw new UnauthorizedError('Invalid client credentials');
        }

        // Firebase sessions are authorized from the canonical profile. Never
        // trust an X-Tenant-ID header or a client-supplied role/permission set.
        if (env.NODE_ENV !== 'test') {
          try {
            const db = getFirestoreDb();
            const profileDoc = await db.collection('profiles').doc(verifiedUid).get();
            if (!profileDoc.exists) {
              throw new UnauthorizedError('User access profile is missing');
            }

            const profile = profileDoc.data() || {};
            if (profile.status === 'disabled') {
              throw new ForbiddenError('User account is disabled');
            }

            tokenTenantId = profile.tenant_id || profile.tenantId || null;
            if (!tokenTenantId) {
              throw new UnauthorizedError('User tenant assignment is missing');
            }

            const requestedTenantId = req.header('X-Tenant-ID');
            if (requestedTenantId && requestedTenantId !== tokenTenantId) {
              throw new ForbiddenError('Tenant mismatch for authenticated user');
            }

            let role = typeof profile.role === 'string' ? profile.role : null;
            if (!role) {
              const roleSnapshot = await db.collection('user_roles')
                .where('user_id', '==', verifiedUid)
                .limit(1)
                .get();
              role = roleSnapshot.empty ? null : roleSnapshot.docs[0].data().role;
            }

            if (role === 'owner' || role === 'super_admin') {
              firebasePermissions = ['*'];
            } else if (profile.permissions_version === 2 && Array.isArray(profile.permissions)) {
              firebasePermissions = profile.permissions.filter((permission: unknown): permission is string =>
                typeof permission === 'string'
              );
            } else if (role === 'admin') {
              // Compatibility for pre-v2 admin profiles. The permissions page
              // migrates these accounts to an explicit, revocable permission set.
              firebasePermissions = ADMIN_ALL_PERMISSIONS;
            } else {
              const permissionsSnapshot = await db.collection('user_permissions')
                .where('user_id', '==', verifiedUid)
                .get();
              firebasePermissions = permissionsSnapshot.docs
                .map((permissionDoc) => permissionDoc.data().permission)
                .filter((permission: unknown): permission is string => typeof permission === 'string');
            }

            const branchId = profile.branch_id || profile.branchId;
            allowedBranchIds = branchId ? [String(branchId)] : [];
          } catch (error) {
            if (error instanceof UnauthorizedError || error instanceof ForbiddenError) throw error;
            throw new UnauthorizedError('Unable to resolve user authorization profile');
          }
        }

        const resolvedTenantId = tokenTenantId || 'tenant_main';

        req.apiClient = {
          clientId: `usr_${verifiedUid}`,
          tenantId: resolvedTenantId,
          allowedBranchIds,
          permissions: firebasePermissions,
          rateLimitTier: 'premium',
        };
      }

      // Strict Origin Access Control:
      const requestOrigin = req.header('Origin');
      if (requestOrigin && clientAllowedOrigins.length > 0) {
        if (!clientAllowedOrigins.includes(requestOrigin)) {
          throw new ForbiddenError(
            `CORS Forbidden: Origin '${requestOrigin}' is not allowed for this API client`
          );
        }
      }

      const authenticatedTenantId = req.apiClient!.tenantId;

      // Strict Tenant Isolation Guard:
      // Prevent requests from attempting to supply a different tenant_id in body, query, or headers
      if (req.body && req.body.tenant_id && req.body.tenant_id !== authenticatedTenantId) {
        throw new ForbiddenError(
          `Tenant mismatch: You are authenticated for tenant '${authenticatedTenantId}' and cannot specify a different tenant_id`
        );
      }

      if (req.query && req.query.tenant_id && req.query.tenant_id !== authenticatedTenantId) {
        throw new ForbiddenError(
          `Tenant mismatch: You are authenticated for tenant '${authenticatedTenantId}' and cannot specify a different tenant_id`
        );
      }

      // Auto-inject authenticated tenant into request body if applicable
      if (req.body && typeof req.body === 'object') {
        req.body.tenant_id = authenticatedTenantId;
      }

      next();
    } catch (error) {
      next(error);
    }
  };
}

export const authenticateApiKey = createAuthMiddleware();

/**
 * Role-Based Access Control (RBAC) middleware.
 * Asserts that the authenticated client/user has the required permission.
 */
export function requirePermission(permission: ApiPermission | string) {
  return (req: AuthenticatedRequest, res: Response, next: NextFunction): void => {
    try {
      if (!req.apiClient) {
        throw new UnauthorizedError('Authentication required');
      }

      const clientPerms = req.apiClient.permissions || [];
      const hasAccess = hasPermissionMatch(clientPerms, permission);

      if (!hasAccess) {
        throw new ForbiddenError(
          `Permission denied: Missing required permission '${permission}'`
        );
      }

      next();
    } catch (error) {
      next(error);
    }
  };
}
