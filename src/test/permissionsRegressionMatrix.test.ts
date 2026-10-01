import { describe, expect, it } from 'vitest';
import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import {
  ALL_PERMISSION_IDS,
  PERMISSION_CATEGORIES,
  ROLE_TEMPLATES,
  calculateEffectivePermissions,
} from '@/lib/permissionsModel';
import {
  buildStaffInvitation,
  buildStaffProfile,
  getPermissionDocumentId,
  getRolePermissionIds,
  normalizePermissionIds,
  normalizeStaffEmail,
  PERMISSIONS_SCHEMA_VERSION,
} from '@/lib/staffAccess';

function walkSource(directory: string): string[] {
  return readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const path = join(directory, entry.name);
    return entry.isDirectory() ? walkSource(path) : (/\.tsx?$/.test(entry.name) ? [path] : []);
  });
}

describe('RBAC permission regression matrix', () => {
  it('has one unique, assignable definition for every permission', () => {
    const categoryIds = PERMISSION_CATEGORIES.flatMap((category) => category.permissions.map((permission) => permission.id));
    expect(new Set(categoryIds).size).toBe(categoryIds.length);
    expect(new Set(ALL_PERMISSION_IDS)).toEqual(new Set(categoryIds));

    for (const template of Object.values(ROLE_TEMPLATES)) {
      for (const permission of template.permissions) {
        expect(permission === '*' || ALL_PERMISSION_IDS.includes(permission)).toBe(true);
      }
    }
  });

  it.each([
    ['sales_staff', 'sales.create', true],
    ['sales_staff', 'sales.cancel', false],
    ['cashier', 'returns.refund', true],
    ['cashier', 'products.edit', false],
    ['inventory', 'inventory.edit', true],
    ['inventory', 'inventory.delete', false],
    ['purchasing_manager', 'purchases.approve', true],
    ['purchasing_manager', 'payroll.pay', false],
    ['accountant', 'payroll.pay', true],
    ['accountant', 'payroll.void', true],
    ['hr', 'leave.approve', true],
    ['hr', 'sales.create', false],
    ['viewer', 'products.view', true],
    ['viewer', 'products.create', false],
  ])('%s permission %s is %s', (role, permission, expected) => {
    expect(calculateEffectivePermissions(role).includes(permission)).toBe(expected);
  });

  it('keeps view/create/edit/delete/sell/refund independent', () => {
    const selected = normalizePermissionIds([
      'products.edit',
      'sales.create',
      'returns.refund',
    ]);

    expect(selected).toContain('products.edit');
    expect(selected).not.toContain('products.view');
    expect(selected).not.toContain('products.create');
    expect(selected).not.toContain('products.delete');
    expect(selected).toContain('sales.create');
    expect(selected).not.toContain('sales.cancel');
    expect(selected).toContain('returns.refund');
    expect(selected).not.toContain('returns.create');
  });

  it('rejects unknown or removed pseudo-permissions instead of persisting them', () => {
    expect(normalizePermissionIds([
      'products.view',
      'products.view',
      'customers.manage',
      'payroll.manage',
      'made_up.permission',
    ])).toEqual(['products.view']);
  });

  it('admin defaults are explicit and therefore individually revocable', () => {
    expect(getRolePermissionIds('admin')).toEqual([...ALL_PERMISSION_IDS].sort());
    const withoutDelete = calculateEffectivePermissions('admin', { revoked: ['products.delete'] });
    expect(withoutDelete).not.toContain('*');
    expect(withoutDelete).not.toContain('products.delete');
    expect(withoutDelete).toContain('products.edit');
  });

  it('every displayed permission has a runtime guard or Firestore enforcement reference', () => {
    const sourceFiles = walkSource(join(process.cwd(), 'src')).filter((path) =>
      !path.endsWith('permissionsModel.ts') && !path.includes(`${join('src', 'test')}`)
    );
    const runtimeText = sourceFiles.map((path) => readFileSync(path, 'utf8')).join('\n');
    const rulesText = readFileSync(join(process.cwd(), 'firestore.rules'), 'utf8');

    for (const permission of ALL_PERMISSION_IDS) {
      expect(runtimeText.includes(permission) || rulesText.includes(permission), `${permission} is not enforced`).toBe(true);
    }
  });

  it('does not use undefined permissions in direct UI or Firestore guards', () => {
    const sourceFiles = walkSource(join(process.cwd(), 'src')).filter((path) =>
      !path.endsWith('permissionsModel.ts') && !path.includes(`${join('src', 'test')}`)
    );
    const authorizationText = [
      ...sourceFiles.map((path) => readFileSync(path, 'utf8')),
      readFileSync(join(process.cwd(), 'firestore.rules'), 'utf8'),
    ].join('\n');
    const guardedPermissions = new Set<string>();

    for (const match of authorizationText.matchAll(/hasPermission\(\s*['"]([a-z0-9_.]+)['"]\s*\)/g)) {
      guardedPermissions.add(match[1]);
    }
    for (const call of authorizationText.matchAll(/hasAnyPermission\(\s*\[([\s\S]*?)\]\s*\)/g)) {
      for (const permission of call[1].matchAll(/['"]([a-z0-9_.]+)['"]/g)) {
        guardedPermissions.add(permission[1]);
      }
    }

    expect([...guardedPermissions].filter((permission) => !ALL_PERMISSION_IDS.includes(permission))).toEqual([]);
  });
});

describe('staff account provisioning regression matrix', () => {
  const assignment = {
    fullName: ' موظف Google ',
    email: ' Staff.User@Gmail.Com ',
    tenantId: 'tenant-a',
    branchId: 'branch-cairo',
    role: 'sales_staff',
    permissions: ['products.view', 'sales.create', 'unknown.permission'],
  };

  it('normalizes Gmail identity and carries tenant, branch, role and exact permissions', () => {
    const invitation = buildStaffInvitation(assignment, 'owner-1');
    const profile = buildStaffProfile(assignment);

    expect(normalizeStaffEmail(assignment.email)).toBe('staff.user@gmail.com');
    expect(invitation.email).toBe('staff.user@gmail.com');
    expect(invitation.invitation_status).toBe('pending');
    expect(invitation.invited_by).toBe('owner-1');
    expect(profile.tenant_id).toBe('tenant-a');
    expect(profile.tenantId).toBe('tenant-a');
    expect(profile.branch_id).toBe('branch-cairo');
    expect(profile.branchId).toBe('branch-cairo');
    expect(profile.role).toBe('sales_staff');
    expect(profile.permissions).toEqual(['products.view', 'sales.create']);
    expect(profile.permissions_version).toBe(PERMISSIONS_SCHEMA_VERSION);
  });

  it('uses deterministic compatibility document ids for role/permission mirrors', () => {
    expect(getPermissionDocumentId('firebase-uid', 'sales.create')).toBe('firebase-uid__sales.create');
  });

  it('contains no fake timestamp UID flow and claims invitations with the authenticated UID', () => {
    const pageSource = readFileSync(join(process.cwd(), 'src/pages/Permissions.tsx'), 'utf8');
    const provisioningSource = readFileSync(join(process.cwd(), 'src/services/auth/staffProvisioning.service.ts'), 'utf8');

    expect(pageSource).not.toContain('createdUid = `user_${Date.now()}`');
    expect(pageSource).toContain("'staff_invitations'");
    expect(provisioningSource).toContain("doc(db, 'profiles', user.uid)");
    expect(provisioningSource).toContain("doc(db, 'user_roles', user.uid)");
  });

  it('authorizes Firebase backend sessions from the stored profile, not tenant headers', () => {
    const authMiddleware = readFileSync(join(process.cwd(), 'server/src/middleware/auth.middleware.ts'), 'utf8');

    expect(authMiddleware).toContain("db.collection('profiles').doc(verifiedUid).get()");
    expect(authMiddleware).toContain("profile.status === 'disabled'");
    expect(authMiddleware).toContain("requestedTenantId !== tokenTenantId");
    expect(authMiddleware).toContain('permissions_version === 2');
    expect(authMiddleware).toContain('allowedBranchIds = branchId ? [String(branchId)] : []');
  });
});

describe('backend permission aliases', () => {
  it('maps granular dashboard permissions to the matching API routes only', async () => {
    const { hasPermissionMatch, PERMISSION_MAPPINGS } = await import('../../server/src/types/permissions.types');

    expect(hasPermissionMatch(['products.view'], 'menu:read')).toBe(true);
    expect(hasPermissionMatch(['sales.create'], 'orders:create')).toBe(true);
    expect(hasPermissionMatch(['sales.view'], 'orders:read')).toBe(true);
    expect(hasPermissionMatch(['integrations.manage'], 'api_clients:manage')).toBe(true);
    expect(hasPermissionMatch(['integrations.manage'], 'webhooks:manage')).toBe(true);
    expect(hasPermissionMatch(['promotions.view'], 'offers:read')).toBe(true);
    expect(hasPermissionMatch(['tables.manage'], 'reservations:create')).toBe(true);
    expect(hasPermissionMatch(['products.view'], 'settings:manage')).toBe(false);

    const frontendAliases = Object.entries(PERMISSION_MAPPINGS).flatMap(([permission, aliases]) => [
      permission,
      ...(Array.isArray(aliases) ? aliases : [aliases]),
    ]).filter((permission) => permission.includes('.') && !permission.includes(':'));
    expect(frontendAliases.filter((permission) => !ALL_PERMISSION_IDS.includes(permission))).toEqual([]);
  });
});

describe('Firestore authorization regression checks', () => {
  const rules = readFileSync(join(process.cwd(), 'firestore.rules'), 'utf8');

  it('does not contain the old authenticated-user-wide access grants', () => {
    expect(rules).not.toMatch(/allow\s+(?:read,\s*write|write|read):\s*if\s+isAuthenticated\(\)\s*;/);
    expect(rules).toContain("hasPermission('permissions.manage')");
    expect(rules).toContain('permissions_version');
  });

  it('enforces tenant isolation and exact invitation claims', () => {
    expect(rules).toContain('userTenantId() == tenantId');
    expect(rules).toContain('invitationAllowsProfile(profileId)');
    expect(rules).toContain('request.resource.data.permissions == get(');
    expect(rules).toContain("request.resource.data.claimed_uid == request.auth.uid");
    expect(rules).toContain('isBootstrapTenantOwner');
    expect(rules).toContain('request.resource.data.owner_uid == request.auth.uid');
  });

  it('keeps sensitive API and webhook data server-only through the default deny', () => {
    expect(rules).toContain("'api_clients'");
    expect(rules).toContain("'webhook_endpoints'");
    expect(rules).toMatch(/match \/\{document=\*\*\}[\s\S]*allow read, write: if false;/);
  });

  it('keeps daily closing create and void permissions independent', () => {
    const dashboard = readFileSync(join(process.cwd(), 'src/pages/ExecutiveDashboard.tsx'), 'utf8');

    expect(dashboard).toContain("hasPermission('daily_closing.create')");
    expect(dashboard).toContain("hasPermission('daily_closing.void')");
    expect(rules).toContain("hasPermission('daily_closing.create')");
    expect(rules).toContain("hasPermission('daily_closing.void')");
    expect(rules).toContain("'status', 'voidReason', 'voidedAt', 'voidedBy'");
  });
});
