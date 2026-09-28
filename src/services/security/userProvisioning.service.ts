import { initializeApp, deleteApp } from 'firebase/app';
import {
  createUserWithEmailAndPassword,
  deleteUser,
  getAuth,
  signOut,
  updateProfile,
  type User,
} from 'firebase/auth';
import {
  collection,
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
  calculateEffectivePermissions,
  isOwnerRole,
} from '@/lib/permissionsModel';

export interface ProvisionUserInput {
  name: string;
  email: string;
  tenantId: string;
  branchId: string | null;
  role: string;
  permissions?: string[];
  grantedBy: string | null;
}

export interface GoogleInvitation extends ProvisionUserInput {
  id: string;
  status: 'pending' | 'accepted' | 'cancelled';
  createdAt: string;
  acceptedUid?: string | null;
}

export function normalizeAccountEmail(email: string): string {
  return email.trim().toLowerCase();
}

export function invitationDocId(email: string): string {
  // Gmail / Google Workspace addresses are safe Firestore document IDs.
  // Replace slash defensively for non-standard providers.
  return normalizeAccountEmail(email).replace(/\//g, '%2F');
}

export function permissionDocId(userId: string, permission: string): string {
  return `${userId}__${permission.replace(/\//g, '_')}`;
}

export function primaryRoleDocId(userId: string): string {
  return `${userId}__primary`;
}

export function sanitizePermissionList(role: string, permissions?: string[]): string[] {
  if (isOwnerRole(role)) return ['*'];

  const requested = permissions ?? calculateEffectivePermissions(role);
  const allowed = new Set(ALL_PERMISSION_IDS);
  return Array.from(new Set(requested.filter((p) => allowed.has(p)))).sort();
}

export async function persistExactUserAccess(input: {
  targetUid: string;
  tenantId: string;
  role: string;
  permissions: string[];
  grantedBy: string | null;
}): Promise<string[]> {
  const { targetUid, tenantId, role, grantedBy } = input;
  const exactPermissions = sanitizePermissionList(role, input.permissions);
  const now = new Date().toISOString();

  const [roleSnap, permissionSnap] = await Promise.all([
    getDocs(query(collection(db, 'user_roles'), where('user_id', '==', targetUid))),
    getDocs(query(collection(db, 'user_permissions'), where('user_id', '==', targetUid))),
  ]);

  const batch = writeBatch(db);

  // Remove legacy/random duplicate records first.
  roleSnap.docs.forEach((roleDoc) => batch.delete(roleDoc.ref));
  permissionSnap.docs.forEach((permissionDoc) => batch.delete(permissionDoc.ref));

  batch.set(doc(db, 'user_roles', primaryRoleDocId(targetUid)), {
    user_id: targetUid,
    userId: targetUid,
    tenant_id: tenantId,
    tenantId,
    role,
    updated_at: now,
    updatedAt: now,
  });

  exactPermissions.forEach((permission) => {
    batch.set(doc(db, 'user_permissions', permissionDocId(targetUid, permission)), {
      user_id: targetUid,
      userId: targetUid,
      tenant_id: tenantId,
      tenantId,
      permission,
      granted_by: grantedBy,
      grantedBy,
      created_at: now,
      createdAt: now,
    });
  });

  // The profile mirror is the authoritative list Firestore Rules can evaluate
  // without querying a collection by field. It also represents an intentional
  // empty list correctly.
  batch.set(
    doc(db, 'profiles', targetUid),
    {
      role,
      permissions: exactPermissions,
      tenant_id: tenantId,
      tenantId,
      updated_at: now,
      updatedAt: now,
    },
    { merge: true }
  );

  await batch.commit();
  return exactPermissions;
}

export async function createPasswordStaffAccount(
  input: ProvisionUserInput & { password: string }
): Promise<{ uid: string; permissions: string[] }> {
  const email = normalizeAccountEmail(input.email);
  const secondaryApp = initializeApp(
    firebaseConfig,
    `staff-provision-${Date.now()}-${Math.random().toString(36).slice(2)}`
  );
  const secondaryAuth = getAuth(secondaryApp);

  let createdUser: User | null = null;

  try {
    const credential = await createUserWithEmailAndPassword(
      secondaryAuth,
      email,
      input.password
    );
    createdUser = credential.user;
    await updateProfile(createdUser, { displayName: input.name.trim() });

    const now = new Date().toISOString();
    const exactPermissions = sanitizePermissionList(input.role, input.permissions);

    await setDoc(doc(db, 'profiles', createdUser.uid), {
      full_name: input.name.trim(),
      email,
      tenant_id: input.tenantId,
      tenantId: input.tenantId,
      branch_id: input.branchId,
      branchId: input.branchId,
      role: input.role,
      permissions: exactPermissions,
      status: 'active',
      auth_provider: 'password',
      created_at: now,
      createdAt: now,
      updated_at: now,
      updatedAt: now,
    });

    await persistExactUserAccess({
      targetUid: createdUser.uid,
      tenantId: input.tenantId,
      role: input.role,
      permissions: exactPermissions,
      grantedBy: input.grantedBy,
    });

    await signOut(secondaryAuth).catch(() => {});
    return { uid: createdUser.uid, permissions: exactPermissions };
  } catch (error) {
    // Do not leave an orphan Authentication account if Firestore provisioning fails.
    if (createdUser) {
      await deleteUser(createdUser).catch(() => {});
    }
    throw error;
  } finally {
    await deleteApp(secondaryApp).catch(() => {});
  }
}

export async function createGoogleStaffInvitation(
  input: ProvisionUserInput
): Promise<GoogleInvitation> {
  const email = normalizeAccountEmail(input.email);
  const id = invitationDocId(email);
  const now = new Date().toISOString();
  const exactPermissions = sanitizePermissionList(input.role, input.permissions);

  // Prevent silently attaching an invitation to an already provisioned identity.
  const existingProfiles = await getDocs(
    query(collection(db, 'profiles'), where('email', '==', email))
  );
  if (!existingProfiles.empty) {
    throw new Error('يوجد حساب مسجل بالفعل بهذا البريد الإلكتروني');
  }

  const invitation: GoogleInvitation = {
    id,
    name: input.name.trim(),
    email,
    tenantId: input.tenantId,
    branchId: input.branchId,
    role: input.role,
    permissions: exactPermissions,
    grantedBy: input.grantedBy,
    status: 'pending',
    createdAt: now,
    acceptedUid: null,
  };

  await setDoc(doc(db, 'user_invitations', id), {
    full_name: invitation.name,
    email,
    tenant_id: input.tenantId,
    tenantId: input.tenantId,
    branch_id: input.branchId,
    branchId: input.branchId,
    role: input.role,
    permissions: exactPermissions,
    status: 'pending',
    invited_by: input.grantedBy,
    invitedBy: input.grantedBy,
    created_at: now,
    createdAt: now,
    updated_at: now,
    updatedAt: now,
  });

  return invitation;
}

export async function claimGoogleStaffInvitation(
  firebaseUser: User
): Promise<
  | { success: true; existing: boolean; tenantId?: string }
  | { success: false; reason: 'missing_email' | 'not_invited' | 'cancelled' }
> {
  if (!firebaseUser.email) {
    return { success: false, reason: 'missing_email' };
  }

  const existingProfile = await getDoc(doc(db, 'profiles', firebaseUser.uid));
  if (existingProfile.exists()) {
    return {
      success: true,
      existing: true,
      tenantId:
        existingProfile.data().tenantId || existingProfile.data().tenant_id || undefined,
    };
  }

  const email = normalizeAccountEmail(firebaseUser.email);
  const inviteRef = doc(db, 'user_invitations', invitationDocId(email));
  const inviteSnap = await getDoc(inviteRef);

  if (!inviteSnap.exists()) {
    return { success: false, reason: 'not_invited' };
  }

  const invite = inviteSnap.data();
  if (invite.status !== 'pending') {
    return { success: false, reason: 'cancelled' };
  }

  if (normalizeAccountEmail(invite.email || '') !== email) {
    return { success: false, reason: 'not_invited' };
  }

  const tenantId = invite.tenantId || invite.tenant_id;
  if (!tenantId) {
    return { success: false, reason: 'not_invited' };
  }

  const role = invite.role || 'viewer';
  const exactPermissions = sanitizePermissionList(
    role,
    Array.isArray(invite.permissions) ? invite.permissions : undefined
  );
  const now = new Date().toISOString();

  const batch = writeBatch(db);
  batch.set(doc(db, 'profiles', firebaseUser.uid), {
    full_name:
      invite.full_name ||
      firebaseUser.displayName ||
      email.split('@')[0],
    email,
    tenant_id: tenantId,
    tenantId,
    branch_id: invite.branchId ?? invite.branch_id ?? null,
    branchId: invite.branchId ?? invite.branch_id ?? null,
    role,
    permissions: exactPermissions,
    status: 'active',
    auth_provider: 'google',
    created_at: now,
    createdAt: now,
    updated_at: now,
    updatedAt: now,
  });

  batch.set(doc(db, 'user_roles', primaryRoleDocId(firebaseUser.uid)), {
    user_id: firebaseUser.uid,
    userId: firebaseUser.uid,
    tenant_id: tenantId,
    tenantId,
    role,
    created_at: now,
    createdAt: now,
  });

  exactPermissions.forEach((permission) => {
    batch.set(doc(db, 'user_permissions', permissionDocId(firebaseUser.uid, permission)), {
      user_id: firebaseUser.uid,
      userId: firebaseUser.uid,
      tenant_id: tenantId,
      tenantId,
      permission,
      granted_by: invite.invited_by || invite.invitedBy || null,
      grantedBy: invite.invited_by || invite.invitedBy || null,
      created_at: now,
      createdAt: now,
    });
  });

  batch.update(inviteRef, {
    status: 'accepted',
    accepted_uid: firebaseUser.uid,
    acceptedUid: firebaseUser.uid,
    accepted_at: now,
    acceptedAt: now,
    updated_at: now,
    updatedAt: now,
  });

  await batch.commit();

  return { success: true, existing: false, tenantId };
}
