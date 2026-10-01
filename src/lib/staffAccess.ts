import { ALL_PERMISSION_IDS, ROLE_TEMPLATES } from '@/lib/permissionsModel';

export const PERMISSIONS_SCHEMA_VERSION = 2;

export interface StaffAccessAssignment {
  fullName: string;
  email: string;
  tenantId: string;
  branchId: string | null;
  role: string;
  permissions: string[];
  status?: 'active' | 'disabled';
}

export function normalizeStaffEmail(email: string): string {
  return email.trim().toLowerCase();
}

export function normalizePermissionIds(permissions: readonly string[]): string[] {
  const allowed = new Set(ALL_PERMISSION_IDS);
  return Array.from(new Set(permissions.filter((permission) => allowed.has(permission)))).sort();
}

export function getRolePermissionIds(role: string): string[] {
  const template = ROLE_TEMPLATES[role];
  if (!template) return [];
  return template.permissions.includes('*')
    ? [...ALL_PERMISSION_IDS].sort()
    : normalizePermissionIds(template.permissions);
}

export function getPermissionDocumentId(userId: string, permission: string): string {
  return `${userId}__${permission}`;
}

export function buildStaffProfile(assignment: StaffAccessAssignment) {
  const email = normalizeStaffEmail(assignment.email);
  const permissions = normalizePermissionIds(assignment.permissions);

  return {
    full_name: assignment.fullName.trim(),
    email,
    tenant_id: assignment.tenantId,
    tenantId: assignment.tenantId,
    branch_id: assignment.branchId,
    branchId: assignment.branchId,
    role: assignment.role,
    permissions,
    permissions_version: PERMISSIONS_SCHEMA_VERSION,
    status: assignment.status ?? 'active',
  };
}

export function buildStaffInvitation(assignment: StaffAccessAssignment, invitedBy: string) {
  return {
    ...buildStaffProfile(assignment),
    invited_by: invitedBy,
    invitation_status: 'pending' as const,
    auth_provider: 'google.com' as const,
  };
}


/**
 * A permissions manager may only delegate authority they already possess.
 * Sovereign owners are the only exception.
 */
export function canDelegatePermissionSet(
  actorPermissions: readonly string[],
  targetPermissions: readonly string[],
  actorIsSovereign: boolean = false
): boolean {
  if (actorIsSovereign || actorPermissions.includes('*')) return true;

  const actor = new Set(normalizePermissionIds(actorPermissions));
  return normalizePermissionIds(targetPermissions).every((permission) => actor.has(permission));
}

export function canManageRoleAssignment(
  actorPermissions: readonly string[],
  targetRole: string,
  targetPermissions: readonly string[],
  actorIsSovereign: boolean = false
): boolean {
  if (actorIsSovereign || actorPermissions.includes('*')) return true;
  if (targetRole === 'owner' || targetRole === 'super_admin') return false;
  return canDelegatePermissionSet(actorPermissions, targetPermissions, false);
}
