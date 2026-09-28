import { deleteApp, initializeApp } from 'firebase/app';
import {
  createUserWithEmailAndPassword,
  deleteUser,
  getAuth,
  updateProfile,
  type User,
} from 'firebase/auth';
import {
  collection,
  deleteDoc,
  doc,
  getDoc,
  getDocs,
  query,
  setDoc,
  where,
  writeBatch,
} from 'firebase/firestore';
import { db, firebaseConfig } from '@/lib/firebase';
import {
  ALL_PERMISSION_IDS,
  ROLE_TEMPLATES,
  isOwnerRole,
} from '@/lib/permissionsModel';

export interface AccessStateInput {
  tenantId: string;
  userId: string;
  role: string;
  permissions: string[];
  branchId?: string | null;
  actorUid?: string | null;
  profile?: {
    full_name?: string;
    email?: string;
    status?: 'active' | 'disabled';
  };
}

export interface GoogleInviteInput {
  tenantId: string;
  name: string;
  email: string;
  role: string;
  permissions: string[];
  branchId?: string | null;
  actorUid?: string | null;
}

export interface GoogleInviteClaimResult {
  claimed: boolean;
  reason?: 'not_invited' | 'expired' | 'email_missing';
}

export function normalizeAccessEmail(email: string): string {
  return email.trim().toLowerCase();
}

export function getRolePermissions(role: string): string[] {
  if (isOwnerRole(role)) return ['*'];
  const template = ROLE_TEMPLATES[role];
  if (!template) return [];
  if (template.permissions.includes('*')) return [...ALL_PERMISSION_IDS];
  return [...new Set(template.permissions.filter((p) => ALL_PERMISSION_IDS.includes(p)))];
}

export function sanitizeAssignedPermissions(role: string, permissions: string[]): string[] {
  if (isOwnerRole(role)) return ['*'];
  return Array.from(
    new Set(
      permissions.filter((permission) => ALL_PERMISSION_IDS.includes(permission))
    )
  ).sort();
}

function permissionDocId(userId: string, permission: string): string {
  return `${userId}___${permission.replaceAll('/', '_')}`;
}

/**
 * Canonical access persistence.
 *
 * The profile document is the authorization source-of-truth because Firestore
 * Security Rules can read it synchronously. user_roles/user_permissions are kept
 * in sync as compatibility/read-model collections for existing UI/report code.
 */
export async function persistUserAccessState(input: AccessStateInput): Promise<void> {
  const {
    tenantId,
    userId,
    role,
    branchId = null,
    actorUid = null,
    profile = {},
  } = input;

  if (!tenantId || !userId) throw new Error('Tenant ID and User ID are required');

  const permissions = sanitizeAssignedPermissions(role, input.permissions);
  const now = new Date().toISOString();

  const [rolesSnap, permissionsSnap] = await Promise.all([
    getDocs(query(collection(db, 'user_roles'), where('user_id', '==', userId))),
    getDocs(query(collection(db, 'user_permissions'), where('user_id', '==', userId))),
  ]);

  const batch = writeBatch(db);

  batch.set(
    doc(db, 'profiles', userId),
    {
      ...profile,
      tenantId,
      tenant_id: tenantId,
      branchId,
      branch_id: branchId,
      role,
      permissions,
      permissions_initialized: true,
      status: profile.status || 'active',
      updated_at: now,
    },
    { merge: true }
  );

  rolesSnap.docs.forEach((roleDoc) => batch.delete(roleDoc.ref));
  batch.set(doc(db, 'user_roles', `${tenantId}___${userId}`), {
    tenantId,
    tenant_id: tenantId,
    userId,
    user_id: userId,
    role,
    updated_at: now,
  });

  permissionsSnap.docs.forEach((permissionDoc) => batch.delete(permissionDoc.ref));
  for (const permission of permissions) {
    batch.set(doc(db, 'user_permissions', permissionDocId(userId, permission)), {
      tenantId,
      tenant_id: tenantId,
      userId,
      user_id: userId,
      permission,
      grantedBy: actorUid,
      granted_by: actorUid,
      created_at: now,
      updated_at: now,
    });
  }

  await batch.commit();
}

/**
 * Creates a real Firebase Authentication account without signing the current
 * manager out by using a temporary secondary Firebase app.
 *
 * If Firestore provisioning fails, the newly-created Auth user is rolled back.
 */
export async function provisionPasswordEmployee(params: {
  tenantId: string;
  name: string;
  email: string;
  password: string;
  role: string;
  permissions?: string[];
  branchId?: string | null;
  actorUid?: string | null;
}): Promise<{ uid: string }> {
  const email = normalizeAccessEmail(params.email);
  const appName = `employee-provision-${Date.now()}-${Math.random().toString(36).slice(2)}`;
  const secondaryApp = initializeApp(firebaseConfig, appName);
  const secondaryAuth = getAuth(secondaryApp);
  let createdUser: User | null = null;

  try {
    const credential = await createUserWithEmailAndPassword(
      secondaryAuth,
      email,
      params.password
    );
    createdUser = credential.user;
    await updateProfile(createdUser, { displayName: params.name.trim() });

    const permissions =
      params.permissions ?? getRolePermissions(params.role);

    await persistUserAccessState({
      tenantId: params.tenantId,
      userId: createdUser.uid,
      role: params.role,
      permissions,
      branchId: params.branchId ?? null,
      actorUid: params.actorUid ?? null,
      profile: {
        full_name: params.name.trim(),
        email,
        status: 'active',
      },
    });

    return { uid: createdUser.uid };
  } catch (error) {
    if (createdUser) {
      try {
        await deleteUser(createdUser);
      } catch (rollbackError) {
        console.error('[Permissions] Failed to rollback orphan Auth user:', rollbackError);
      }
    }
    throw error;
  } finally {
    try {
      await secondaryAuth.signOut();
    } catch {
      // Best effort cleanup.
    }
    await deleteApp(secondaryApp).catch(() => undefined);
  }
}

/**
 * Google accounts cannot be provisioned from another user's browser session.
 * A real Google employee is therefore created as an invitation bound to the
 * exact email. The employee claims it using Google sign-in and receives their
 * real Firebase Auth UID.
 */
export async function createGoogleEmployeeInvite(input: GoogleInviteInput): Promise<void> {
  const email = normalizeAccessEmail(input.email);
  const permissions = sanitizeAssignedPermissions(input.role, input.permissions);
  const now = Date.now();
  const expiresAt = new Date(now + 7 * 24 * 60 * 60 * 1000).toISOString();

  await setDoc(doc(db, 'user_invites', email), {
    tenantId: input.tenantId,
    tenant_id: input.tenantId,
    full_name: input.name.trim(),
    email,
    role: input.role,
    permissions,
    permissions_initialized: true,
    branchId: input.branchId ?? null,
    branch_id: input.branchId ?? null,
    authMethod: 'google',
    status: 'pending',
    invitedBy: input.actorUid ?? null,
    invited_by: input.actorUid ?? null,
    created_at: new Date(now).toISOString(),
    expires_at: expiresAt,
  });
}

export async function claimGoogleEmployeeInvite(user: User): Promise<GoogleInviteClaimResult> {
  const rawEmail = user.email;
  if (!rawEmail) return { claimed: false, reason: 'email_missing' };

  const email = normalizeAccessEmail(rawEmail);
  const inviteRef = doc(db, 'user_invites', email);
  const inviteSnap = await getDoc(inviteRef);

  if (!inviteSnap.exists()) return { claimed: false, reason: 'not_invited' };

  const invite = inviteSnap.data() as any;
  if (
    invite.status !== 'pending' ||
    invite.authMethod !== 'google' ||
    (invite.expires_at && Date.parse(invite.expires_at) < Date.now())
  ) {
    return { claimed: false, reason: 'expired' };
  }

  const permissions = sanitizeAssignedPermissions(
    invite.role || 'viewer',
    Array.isArray(invite.permissions) ? invite.permissions : []
  );

  const now = new Date().toISOString();

  await setDoc(
    doc(db, 'profiles', user.uid),
    {
      tenantId: invite.tenantId || invite.tenant_id,
      tenant_id: invite.tenantId || invite.tenant_id,
      branchId: invite.branchId ?? invite.branch_id ?? null,
      branch_id: invite.branchId ?? invite.branch_id ?? null,
      full_name: invite.full_name || user.displayName || email.split('@')[0],
      email,
      role: invite.role || 'viewer',
      permissions,
      permissions_initialized: true,
      status: 'active',
      auth_method: 'google',
      invited_by: invite.invitedBy || invite.invited_by || null,
      created_at: invite.created_at || now,
      activated_at: now,
      updated_at: now,
    },
    { merge: true }
  );

  // The profile is authoritative. Compatibility access documents are intentionally
  // not written by the invited user because only permission managers may write them.
  await deleteDoc(inviteRef);

  return { claimed: true };
}

export async function hasUserProfile(userId: string): Promise<boolean> {
  const snapshot = await getDoc(doc(db, 'profiles', userId));
  return snapshot.exists();
}
