import { describe, expect, it } from 'vitest';
import {
  ALL_PERMISSION_IDS,
  PERMISSION_CATEGORIES,
  ROLE_TEMPLATES,
} from '@/lib/permissionsModel';
import { routePermissions } from '@/hooks/usePermissions';
import {
  inviteDocumentId,
  normalizeInviteEmail,
  permissionDocumentId,
} from '@/services/permissions/userAccess.service';

describe('Permission registry integrity audit', () => {
  it('contains unique permission IDs only', () => {
    const ids = PERMISSION_CATEGORIES.flatMap((category) =>
      category.permissions.map((permission) => permission.id)
    );
    expect(new Set(ids).size).toBe(ids.length);
    expect(new Set(ALL_PERMISSION_IDS).size).toBe(ALL_PERMISSION_IDS.length);
  });

  it('every role template references only registered permissions or sovereign wildcard', () => {
    for (const [roleKey, role] of Object.entries(ROLE_TEMPLATES)) {
      for (const permission of role.permissions) {
        expect(
          permission === '*' || ALL_PERMISSION_IDS.includes(permission),
          `${roleKey} references unknown permission ${permission}`
        ).toBe(true);
      }
    }
  });

  it('every protected route references registered permissions', () => {
    for (const [route, permissions] of Object.entries(routePermissions)) {
      expect(permissions.length, `${route} has no permission mapping`).toBeGreaterThan(0);
      permissions.forEach((permission) => {
        expect(
          ALL_PERMISSION_IDS.includes(permission),
          `${route} references unknown permission ${permission}`
        ).toBe(true);
      });
    }
  });

  it('does not expose restaurant-era permissions in the active registry', () => {
    [
      'kitchen.view',
      'kitchen.manage_orders',
      'production.view',
      'production.manage',
      'menu.view',
      'menu.manage',
      'tables.view',
      'tables.manage',
      'delivery.view',
      'delivery.manage',
      'callcenter.view',
      'customers.manage',
    ].forEach((legacyPermission) => {
      expect(ALL_PERMISSION_IDS).not.toContain(legacyPermission);
    });
  });

  it('supports truly separate edit/delete and view/manage permissions', () => {
    expect(ALL_PERMISSION_IDS).toContain('products.edit');
    expect(ALL_PERMISSION_IDS).toContain('products.delete');
    expect(ALL_PERMISSION_IDS).toContain('products.archive');
    expect(ALL_PERMISSION_IDS).toContain('expenses.manage');
    expect(ALL_PERMISSION_IDS).toContain('expenses.delete');
    expect(ALL_PERMISSION_IDS).toContain('maintenance.view');
    expect(ALL_PERMISSION_IDS).toContain('maintenance.manage');
    expect(ALL_PERMISSION_IDS).toContain('integrations.view');
    expect(ALL_PERMISSION_IDS).toContain('integrations.manage');
    expect(ALL_PERMISSION_IDS).toContain('settings.data_reset');
  });

  it('normalizes Gmail invitations and deterministic permission document IDs', () => {
    expect(normalizeInviteEmail('  Employee@GMAIL.com ')).toBe('employee@gmail.com');
    expect(inviteDocumentId('  Employee@GMAIL.com ')).toBe('employee@gmail.com');
    expect(permissionDocumentId('uid-123', 'products.edit')).toBe(
      'uid-123___products.edit'
    );
  });
});
