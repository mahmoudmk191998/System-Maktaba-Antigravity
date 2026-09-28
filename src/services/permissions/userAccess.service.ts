import { db } from '@/lib/firebase';
import {
  collection,
  deleteDoc,
  doc,
  getDoc,
  getDocs,
  query,
  serverTimestamp,
  setDoc,
  writeBatch,
  where,
} from 'firebase/firestore';
import type { User } from 'firebase/auth';

export interface PermissionInvitePayload {
  email: string;
  fullName: string;
  tenantId: string;
  branchId: string | null;
  role: string;
  permissions: string[];
  invitedBy?: string | null;
}

export interface PendingUserInvitation extends PermissionInvitePayload {
  id: string;
  status: 'pending';
  createdAt?: unknown;
}

export function normalizeInviteEmail(email: string): string {
  return email.trim().toLowerCase();
}

export function inviteDocumentId(email: string): string {
  // Valid email addresses do not contain '/', so the normalized email can be
  // used directly. Keeping the document ID equal to Firebase Auth's email lets
  // Firestore security rules verify invitation ownership without a query.
  return normalizeInviteEmail(email).replaceAll('/', '_');
}

export function permissionDocumentId(userId: string, permission: string): string {
  return `${userId}___${permission.replaceAll('/', '_')}`;
}

export async function createGoogleUserInvitation(
  payload: PermissionInvitePayload
): Promise<void> {
  const email = normalizeInviteEmail(payload.email);
  if (!email || !payload.tenantId) throw new Error('بيانات الدعوة غير مكتملة');

  await setDoc(
    doc(db, 'user_invitations', inviteDocumentId(email)),
    {
      email,
      full_name: payload.fullName.trim(),
      tenant_id: payload.tenantId,
      tenantId: payload.tenantId,
      branch_id: payload.branchId,
      branchId: payload.branchId,
      role: payload.role,
      permissions: Array.from(new Set(payload.permissions)),
      status: 'pending',
      auth_provider: 'google',
      invited_by: payload.invitedBy || null,
      created_at: serverTimestamp(),
      updated_at: serverTimestamp(),
    },
    { merge: true }
  );
}

export async function fetchPendingInvitations(
  tenantId: string
): Promise<PendingUserInvitation[]> {
  if (!tenantId) return [];

  const found = new Map<string, PendingUserInvitation>();
  for (const field of ['tenant_id', 'tenantId'] as const) {
    const snap = await getDocs(
      query(
        collection(db, 'user_invitations'),
        where(field, '==', tenantId),
        where('status', '==', 'pending')
      )
    );

    snap.forEach((inviteDoc) => {
      const data = inviteDoc.data() as any;
      const email = normalizeInviteEmail(data.email || '');
      if (!email) return;

      found.set(inviteDoc.id, {
        id: inviteDoc.id,
        email,
        fullName: data.full_name || data.fullName || email.split('@')[0],
        tenantId: data.tenant_id || data.tenantId || tenantId,
        branchId: data.branch_id ?? data.branchId ?? null,
        role: data.role || 'viewer',
        permissions: Array.isArray(data.permissions) ? data.permissions : [],
        status: 'pending',
        createdAt: data.created_at,
      });
    });
  }

  return Array.from(found.values());
}

export async function cancelGoogleUserInvitation(email: string): Promise<void> {
  await deleteDoc(doc(db, 'user_invitations', inviteDocumentId(email)));
}

/**
 * Claims an invitation after Google Authentication succeeds.
 * The invitation email MUST exactly match Firebase Auth's verified email.
 * The real Firebase UID becomes the profile/user-role/user-permission owner.
 */
export async function claimGoogleInvitation(
  user: User
): Promise<{ claimed: boolean; tenantId?: string }> {
  const email = normalizeInviteEmail(user.email || '');
  if (!email) return { claimed: false };

  const inviteRef = doc(db, 'user_invitations', inviteDocumentId(email));
  const inviteSnap = await getDoc(inviteRef);
  if (!inviteSnap.exists()) return { claimed: false };

  const invite = inviteSnap.data() as any;
  if (invite.status !== 'pending') return { claimed: false };

  const tenantId = invite.tenant_id || invite.tenantId;
  if (!tenantId) throw new Error('الدعوة غير مرتبطة بمؤسسة صحيحة');

  const permissions: string[] = Array.isArray(invite.permissions)
    ? Array.from(new Set(invite.permissions))
    : [];

  const batch = writeBatch(db);
  const now = new Date().toISOString();

  batch.set(
    doc(db, 'profiles', user.uid),
    {
      full_name:
        invite.full_name ||
        invite.fullName ||
        user.displayName ||
        email.split('@')[0],
      email,
      tenant_id: tenantId,
      tenantId,
      branch_id: invite.branch_id ?? invite.branchId ?? null,
      branchId: invite.branch_id ?? invite.branchId ?? null,
      role: invite.role || 'viewer',
      status: 'active',
      permission_mode: 'explicit',
      auth_provider: 'google',
      updated_at: now,
      created_at: invite.created_at || now,
    },
    { merge: true }
  );

  // Keep one deterministic role document per user so stale duplicate roles
  // cannot silently grant access.
  batch.set(
    doc(db, 'user_roles', user.uid),
    {
      user_id: user.uid,
      role: invite.role || 'viewer',
      tenant_id: tenantId,
      tenantId,
      updated_at: now,
      created_at: now,
    },
    { merge: true }
  );

  permissions.forEach((permission) => {
    batch.set(
      doc(db, 'user_permissions', permissionDocumentId(user.uid, permission)),
      {
        user_id: user.uid,
        tenant_id: tenantId,
        tenantId,
        permission,
        granted_by: invite.invited_by || null,
        created_at: now,
      },
      { merge: true }
    );
  });

  batch.set(
    inviteRef,
    {
      status: 'accepted',
      accepted_uid: user.uid,
      accepted_at: serverTimestamp(),
      updated_at: serverTimestamp(),
    },
    { merge: true }
  );

  await batch.commit();
  return { claimed: true, tenantId };
}

export async function replaceUserPermissions(
  tenantId: string,
  userId: string,
  permissions: string[],
  grantedBy?: string | null
): Promise<void> {
  const existingQ = query(
    collection(db, 'user_permissions'),
    where('user_id', '==', userId)
  );
  const existing = await getDocs(existingQ);

  const batch = writeBatch(db);
  existing.forEach((permissionDoc) => batch.delete(permissionDoc.ref));

  const now = new Date().toISOString();
  Array.from(new Set(permissions)).forEach((permission) => {
    batch.set(
      doc(db, 'user_permissions', permissionDocumentId(userId, permission)),
      {
        user_id: userId,
        tenant_id: tenantId,
        tenantId,
        permission,
        granted_by: grantedBy || null,
        created_at: now,
      }
    );
  });

  batch.set(
    doc(db, 'profiles', userId),
    {
      permission_mode: 'explicit',
      updated_at: now,
    },
    { merge: true }
  );

  await batch.commit();
}
