import React, { useState, useEffect, useCallback } from 'react';
import { db } from '@/lib/firebase';
import { collection, query, where, onSnapshot, doc } from 'firebase/firestore';
import { useAuth } from './useAuth';
import { isOwnerRole, isAdminOrOwnerRole } from '@/lib/permissionsModel';

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
    let currentPerms: string[] = [];
    let currentStatus: 'active' | 'disabled' = 'active';

    let rolesLoaded = false;
    let permsLoaded = false;
    let profileLoaded = false;

    const updatePermissionsState = () => {
      if (!rolesLoaded || !permsLoaded || !profileLoaded) return;

      if (currentStatus === 'disabled') {
        // Disabled user loses all access immediately in real-time
        setRoles([]);
        setPermissions([]);
        setLoading(false);
        return;
      }

      setRoles(currentRoles);

      const hasAdminOrOwner = currentRoles.some((r) => isAdminOrOwnerRole(r));
      if (hasAdminOrOwner) {
        setPermissions(['*']); // wildcard = all permissions
      } else {
        setPermissions(currentPerms);
      }

      setLoading(false);
    };

    // 1. Listen to user profile status (Active / Disabled) in real-time
    const profileRef = doc(db, 'profiles', user.uid);
    const unsubscribeProfile = onSnapshot(
      profileRef,
      (snapshot) => {
        if (snapshot.exists()) {
          const data = snapshot.data();
          currentStatus = data.status === 'disabled' ? 'disabled' : 'active';
          setUserStatus(currentStatus);
        }
        profileLoaded = true;
        updatePermissionsState();
      },
      (error) => {
        console.error('Error listening to user profile status:', error);
        profileLoaded = true;
        updatePermissionsState();
      }
    );

    // 2. Listen to user roles in real-time
    const rolesRef = collection(db, 'user_roles');
    const rolesQ = query(rolesRef, where('user_id', '==', user.uid));
    const unsubscribeRoles = onSnapshot(
      rolesQ,
      (snapshot) => {
        currentRoles = snapshot.docs.map((doc) => doc.data().role);
        rolesLoaded = true;
        updatePermissionsState();
      },
      (error) => {
        console.error('Error listening to user roles:', error);
        rolesLoaded = true;
        updatePermissionsState();
      }
    );

    // 3. Listen to granular permissions in real-time
    const permsRef = collection(db, 'user_permissions');
    const permsQ = query(permsRef, where('user_id', '==', user.uid));
    const unsubscribePerms = onSnapshot(
      permsQ,
      (snapshot) => {
        currentPerms = snapshot.docs.map((doc) => doc.data().permission);
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
    (perm: string) => {
      if (userStatus === 'disabled') return false;
      if (permissions.includes('*')) return true;
      return permissions.includes(perm);
    },
    [permissions, userStatus]
  );

  const hasAnyPermission = useCallback(
    (perms: string[]) => {
      if (userStatus === 'disabled') return false;
      if (permissions.includes('*')) return true;
      return perms.some((p) => permissions.includes(p));
    },
    [permissions, userStatus]
  );

  const isAdmin = userStatus !== 'disabled' && roles.some((r) => isAdminOrOwnerRole(r));
  const isOwner = userStatus !== 'disabled' && roles.some((r) => isOwnerRole(r));
  const isDisabled = userStatus === 'disabled';
  const hasAnyRole = userStatus !== 'disabled' && roles.length > 0;

  const refresh = useCallback(() => {}, []);

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
 * Declarative UI Guard Component:
 * <Can permission="expenses.delete" fallback={<p>غير مصرح</p>}>
 *   <Button>حذف المصروف</Button>
 * </Can>
 */
export function Can({
  permission,
  permissions: permsList,
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

  if (permsList && hasAnyPermission(permsList)) {
    return <>{children}</>;
  }

  return <>{fallback}</>;
}

export const routePermissions: Record<string, string[]> = {
  '/': ['dashboard.view'],
  '/pos': ['pos.view'],
  '/kitchen': ['kitchen.view'],
  '/tables': ['tables.view'],
  '/menu': ['menu.view'],
  '/inventory': ['inventory.view'],
  '/waste': ['inventory.waste'],
  '/purchasing': ['purchasing.view'],
  '/production': ['production.view'],
  '/delivery': ['delivery.view'],
  '/callcenter': ['callcenter.view'],
  '/customers': ['customers.view'],
  '/loyalty': ['loyalty.view'],
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
  '/docs': ['dashboard.view'],
};
