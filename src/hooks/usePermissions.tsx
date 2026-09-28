import React, { useState, useEffect, useCallback } from 'react';
import { db } from '@/lib/firebase';
import { collection, query, where, onSnapshot, doc } from 'firebase/firestore';
import { useAuth } from './useAuth';
import {
  ALL_PERMISSION_IDS,
  ROLE_TEMPLATES,
  isOwnerRole,
  isAdminOrOwnerRole,
} from '@/lib/permissionsModel';

export interface PermissionsHookResult {
  permissions: string[];
  roles: string[];
  loading: boolean;
  hasPermission: (perm: string) => boolean;
  hasAnyPermission: (perms: string[]) => boolean;
  can: (perm: string) => boolean;
  canAny: (perms: string[]) => boolean;
  isAdmin: boolean;
  isOwner: boolean;
  isDisabled: boolean;
  hasAnyRole: boolean;
  userStatus: 'active' | 'disabled';
  refresh: () => void;
}

function roleDefaultPermissions(role: string | undefined): string[] {
  if (!role) return [];
  if (isOwnerRole(role)) return ['*'];

  const template = ROLE_TEMPLATES[role];
  if (!template) return [];
  if (template.permissions.includes('*')) return [...ALL_PERMISSION_IDS];
  return [...template.permissions];
}

export function useUserPermissions(): PermissionsHookResult {
  const { user } = useAuth();
  const [permissions, setPermissions] = useState<string[]>([]);
  const [roles, setRoles] = useState<string[]>([]);
  const [userStatus, setUserStatus] = useState<'active' | 'disabled'>('active');
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!user) {
      setPermissions([]);
      setRoles([]);
      setUserStatus('active');
      setLoading(false);
      return;
    }

    setLoading(true);

    let currentRoles: string[] = [];
    let compatibilityPerms: string[] = [];
    let profileRole: string | null = null;
    let profilePermissions: string[] | null = null;
    let profilePermissionsInitialized = false;
    let currentStatus: 'active' | 'disabled' = 'active';

    let rolesLoaded = false;
    let permsLoaded = false;
    let profileLoaded = false;

    const updatePermissionsState = () => {
      if (!rolesLoaded || !permsLoaded || !profileLoaded) return;

      if (currentStatus === 'disabled') {
        setRoles([]);
        setPermissions([]);
        setLoading(false);
        return;
      }

      const mergedRoles = Array.from(
        new Set([profileRole, ...currentRoles].filter(Boolean) as string[])
      );
      setRoles(mergedRoles);

      // Owner/Super Admin are the only sovereign wildcard roles.
      // Regular Admin accounts can now be customized granularly like any other
      // account when profile.permissions has been initialized.
      if (mergedRoles.some((role) => isOwnerRole(role))) {
        setPermissions(['*']);
        setLoading(false);
        return;
      }

      let effectivePermissions: string[];

      if (profilePermissionsInitialized) {
        // Canonical source-of-truth written by the permissions center.
        effectivePermissions = profilePermissions || [];
      } else if (compatibilityPerms.length > 0) {
        // Legacy users created before profile.permissions existed.
        effectivePermissions = compatibilityPerms;
      } else {
        // Last-resort compatibility fallback for old role-only accounts.
        effectivePermissions = roleDefaultPermissions(mergedRoles[0]);
      }

      setPermissions(Array.from(new Set(effectivePermissions)));
      setLoading(false);
    };

    // 1. Canonical profile state: status, role and effective permission array.
    const profileRef = doc(db, 'profiles', user.uid);
    const unsubscribeProfile = onSnapshot(
      profileRef,
      (snapshot) => {
        if (snapshot.exists()) {
          const data = snapshot.data();
          currentStatus = data.status === 'disabled' ? 'disabled' : 'active';
          profileRole = typeof data.role === 'string' ? data.role : null;
          profilePermissions = Array.isArray(data.permissions)
            ? data.permissions.filter((p: unknown): p is string => typeof p === 'string')
            : null;
          profilePermissionsInitialized =
            data.permissions_initialized === true || Array.isArray(data.permissions);
          setUserStatus(currentStatus);
        } else {
          currentStatus = 'active';
          profileRole = null;
          profilePermissions = null;
          profilePermissionsInitialized = false;
        }
        profileLoaded = true;
        updatePermissionsState();
      },
      (error) => {
        console.error('Error listening to user profile access state:', error);
        profileLoaded = true;
        updatePermissionsState();
      }
    );

    // 2. Compatibility role read-model.
    const rolesQ = query(
      collection(db, 'user_roles'),
      where('user_id', '==', user.uid)
    );
    const unsubscribeRoles = onSnapshot(
      rolesQ,
      (snapshot) => {
        currentRoles = snapshot.docs
          .map((roleDoc) => roleDoc.data().role)
          .filter((role): role is string => typeof role === 'string');
        rolesLoaded = true;
        updatePermissionsState();
      },
      (error) => {
        console.error('Error listening to user roles:', error);
        rolesLoaded = true;
        updatePermissionsState();
      }
    );

    // 3. Compatibility granular permission read-model.
    const permsQ = query(
      collection(db, 'user_permissions'),
      where('user_id', '==', user.uid)
    );
    const unsubscribePerms = onSnapshot(
      permsQ,
      (snapshot) => {
        compatibilityPerms = snapshot.docs
          .map((permissionDoc) => permissionDoc.data().permission)
          .filter(
            (permission): permission is string => typeof permission === 'string'
          );
        permsLoaded = true;
        updatePermissionsState();
      },
      (error) => {
        console.error('Error listening to user permissions:', error);
        permsLoaded = true;
        updatePermissionsState();
      }
    );

    return () => {
      unsubscribeProfile();
      unsubscribeRoles();
      unsubscribePerms();
    };
  }, [user]);

  const hasPermission = useCallback(
    (permission: string) => {
      if (userStatus === 'disabled') return false;
      if (permissions.includes('*')) return true;
      return permissions.includes(permission);
    },
    [permissions, userStatus]
  );

  const hasAnyPermission = useCallback(
    (requiredPermissions: string[]) => {
      if (userStatus === 'disabled') return false;
      if (permissions.includes('*')) return true;
      return requiredPermissions.some((permission) =>
        permissions.includes(permission)
      );
    },
    [permissions, userStatus]
  );

  const isOwner =
    userStatus !== 'disabled' && roles.some((role) => isOwnerRole(role));
  const isAdmin =
    userStatus !== 'disabled' &&
    roles.some((role) => isAdminOrOwnerRole(role));
  const isDisabled = userStatus === 'disabled';
  const hasAnyRole = userStatus !== 'disabled' && roles.length > 0;

  const refresh = useCallback(() => {
    // Firestore listeners are realtime; retained for API compatibility.
  }, []);

  return {
    permissions,
    roles,
    loading,
    hasPermission,
    hasAnyPermission,
    can: hasPermission,
    canAny: hasAnyPermission,
    isAdmin,
    isOwner,
    isDisabled,
    hasAnyRole,
    userStatus,
    refresh,
  };
}

/**
 * Declarative UI guard:
 * <Can permission="expenses.delete"><Button>حذف</Button></Can>
 */
export function Can({
  permission,
  permissions: permissionsList,
  fallback = null,
  children,
}: {
  permission?: string;
  permissions?: string[];
  fallback?: React.ReactNode;
  children: React.ReactNode;
}) {
  const { hasPermission, hasAnyPermission } = useUserPermissions();

  if (permission && hasPermission(permission)) {
    return <>{children}</>;
  }

  if (permissionsList && hasAnyPermission(permissionsList)) {
    return <>{children}</>;
  }

  return <>{fallback}</>;
}

/**
 * Route permission registry kept in sync with App.tsx.
 * Legacy restaurant routes were removed instead of exposing fake permissions.
 */
export const routePermissions: Record<string, string[]> = {
  '/': ['dashboard.view'],
  '/pos': ['pos.view'],
  '/orders-history': ['sales.view'],
  '/sales': ['sales.view'],
  '/returns': ['returns.view'],
  '/products': ['products.view'],
  '/inventory': ['inventory.view'],
  '/waste': ['inventory.waste'],
  '/purchasing': ['purchases.view'],
  '/customers': ['customers.view'],
  '/receivables': ['receivables.view'],
  '/promotions': ['promotions.view'],
  '/shifts': ['hr.manage_shifts'],
  '/hr': ['hr.view_employees'],
  '/reports': ['reports.view'],
  '/accounting': ['accounting.view'],
  '/expenses': ['expenses.view'],
  '/settings': ['settings.view'],
  '/permissions': ['permissions.manage'],
  '/maintenance': ['maintenance.view'],
  '/integrations': ['integrations.view'],
  '/audit': ['audit.view'],
  '/backup': ['backup.view'],
  '/approvals': ['approvals.view'],
  '/datacenter': ['datacenter.view'],
  '/system-health': ['system_health.view'],
  '/executive': ['financial_dashboard.view'],
  '/docs': ['dashboard.view'],
};
