import type { User } from 'firebase/auth';
import {
  collection,
  doc,
  getDocs,
  query,
  runTransaction,
  where,
  writeBatch,
} from 'firebase/firestore';
import { db } from '@/lib/firebase';
import {
  buildStaffProfile,
  getPermissionDocumentId,
  normalizePermissionIds,
  normalizeStaffEmail,
  type StaffAccessAssignment,
} from '@/lib/staffAccess';

export interface ActiveStaffAccessInput extends StaffAccessAssignment {
  userId: string;
  grantedBy: string;
}

export async function replaceActiveStaffAccess(input: ActiveStaffAccessInput): Promise<void> {
  const roleQuery = query(collection(db, 'user_roles'), where('user_id', '==', input.userId));
  const permissionQuery = query(collection(db, 'user_permissions'), where('user_id', '==', input.userId));
  const [rolesSnapshot, permissionsSnapshot] = await Promise.all([
    getDocs(roleQuery),
    getDocs(permissionQuery),
  ]);

  const now = new Date().toISOString();
  const permissions = normalizePermissionIds(input.permissions);
  const batch = writeBatch(db);

  batch.set(
    doc(db, 'profiles', input.userId),
    {
      ...buildStaffProfile({ ...input, permissions }),
      updated_at: now,
    },
    { merge: true }
  );

  rolesSnapshot.docs.forEach((roleDocument) => batch.delete(roleDocument.ref));
  batch.set(doc(db, 'user_roles', input.userId), {
    user_id: input.userId,
    role: input.role,
    tenant_id: input.tenantId,
    updated_at: now,
  });

  permissionsSnapshot.docs.forEach((permissionDocument) => batch.delete(permissionDocument.ref));
  permissions.forEach((permission) => {
    batch.set(doc(db, 'user_permissions', getPermissionDocumentId(input.userId, permission)), {
      tenant_id: input.tenantId,
      user_id: input.userId,
      permission,
      granted_by: input.grantedBy,
      created_at: now,
    });
  });

  await batch.commit();
}

/**
 * Claims a pending Google staff invitation using the authenticated Firebase UID.
 * The invitation is the authority for tenant, branch, role and permissions; none
 * of those values are accepted from the signing-in browser.
 */
export async function claimPendingStaffInvitation(user: User): Promise<boolean> {
  if (!user.email) return false;

  const email = normalizeStaffEmail(user.email);
  const invitationRef = doc(db, 'staff_invitations', email);
  const profileRef = doc(db, 'profiles', user.uid);

  const claimed = await runTransaction(db, async (transaction) => {
    const [profileSnapshot, invitationSnapshot] = await Promise.all([
      transaction.get(profileRef),
      transaction.get(invitationRef),
    ]);

    if (!invitationSnapshot.exists()) return null;

    const invitation = invitationSnapshot.data();
    if (
      profileSnapshot.exists() &&
      invitation.invitation_status === 'claimed' &&
      invitation.claimed_uid === user.uid
    ) {
      const profile = profileSnapshot.data();
      return {
        fullName: String(profile.full_name || user.displayName || email.split('@')[0]),
        email,
        tenantId: String(profile.tenant_id || profile.tenantId || ''),
        branchId: profile.branch_id || profile.branchId || null,
        role: String(profile.role || 'viewer'),
        permissions: Array.isArray(profile.permissions) ? profile.permissions : [],
        status: profile.status === 'disabled' ? 'disabled' : 'active',
      } satisfies StaffAccessAssignment;
    }

    if (profileSnapshot.exists()) return null;

    if (
      invitation.invitation_status !== 'pending' ||
      normalizeStaffEmail(String(invitation.email || '')) !== email ||
      !invitation.tenant_id ||
      !invitation.role
    ) {
      throw new Error('دعوة الموظف غير مكتملة أو لم تعد صالحة');
    }

    const assignment: StaffAccessAssignment = {
      fullName: String(invitation.full_name || user.displayName || email.split('@')[0]),
      email,
      tenantId: String(invitation.tenant_id),
      branchId: invitation.branch_id ? String(invitation.branch_id) : null,
      role: String(invitation.role),
      permissions: Array.isArray(invitation.permissions) ? invitation.permissions : [],
      status: invitation.status === 'disabled' ? 'disabled' : 'active',
    };
    const now = new Date().toISOString();

    transaction.set(profileRef, {
      ...buildStaffProfile(assignment),
      auth_provider: 'google.com',
      invitation_email: email,
      created_at: now,
      updated_at: now,
    });
    transaction.update(invitationRef, {
      invitation_status: 'claimed',
      claimed_uid: user.uid,
      claimed_at: now,
      updated_at: now,
    });

    return assignment;
  });

  if (!claimed) return false;

  // The profile is the authorization source. These deterministic mirror records
  // preserve compatibility with existing reports and administrative screens.
  const mirrorBatch = writeBatch(db);
  const now = new Date().toISOString();
  mirrorBatch.set(doc(db, 'user_roles', user.uid), {
    user_id: user.uid,
    role: claimed.role,
    tenant_id: claimed.tenantId,
    updated_at: now,
  });
  normalizePermissionIds(claimed.permissions).forEach((permission) => {
    mirrorBatch.set(doc(db, 'user_permissions', getPermissionDocumentId(user.uid, permission)), {
      tenant_id: claimed.tenantId,
      user_id: user.uid,
      permission,
      granted_by: 'staff_invitation',
      created_at: now,
    });
  });
  await mirrorBatch.commit();

  return true;
}
