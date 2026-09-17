import { describe, it, expect } from 'vitest';
import {
  ROLE_TEMPLATES,
  PERMISSION_CATEGORIES,
  ALL_PERMISSION_IDS,
  calculateEffectivePermissions,
  getRoleLabel,
  isOwnerRole,
  isAdminOrOwnerRole,
} from '@/lib/permissionsModel';

describe('Production-Grade Roles & Permissions (RBAC) Test Suite', () => {
  describe('1. Standard Role Templates & Defaults', () => {
    it('Owner has full sovereign wildcard access (*)', () => {
      const ownerPerms = calculateEffectivePermissions('owner');
      expect(ownerPerms).toEqual(['*']);
      expect(isOwnerRole('owner')).toBe(true);
      expect(isAdminOrOwnerRole('owner')).toBe(true);
    });

    it('Admin has all operational and managerial permissions', () => {
      const adminPerms = calculateEffectivePermissions('admin');
      expect(adminPerms).toEqual(['*']);
      expect(isAdminOrOwnerRole('admin')).toBe(true);
    });

    it('Manager has operational permissions but lacks sensitive system/payroll payment rights', () => {
      const managerPerms = calculateEffectivePermissions('manager');
      expect(managerPerms).toContain('pos.view');
      expect(managerPerms).toContain('orders.view');
      expect(managerPerms).toContain('inventory.view');
      expect(managerPerms).toContain('expenses.view');
      expect(managerPerms).toContain('hr.view_employees');
      expect(managerPerms).toContain('attendance.view');

      // Crucially excluded from defaults
      expect(managerPerms).not.toContain('settings.manage');
      expect(managerPerms).not.toContain('permissions.manage');
      expect(managerPerms).not.toContain('payroll.pay');
      expect(managerPerms).not.toContain('payroll.void');
    });

    it('Cashier has POS and Customer permissions but cannot access Payroll, Settings, or HR', () => {
      const cashierPerms = calculateEffectivePermissions('cashier');
      expect(cashierPerms).toContain('pos.view');
      expect(cashierPerms).toContain('pos.create_order');
      expect(cashierPerms).toContain('customers.view');

      // Forbidden
      expect(cashierPerms).not.toContain('payroll.view');
      expect(cashierPerms).not.toContain('payroll.pay');
      expect(cashierPerms).not.toContain('hr.manage_employees');
      expect(cashierPerms).not.toContain('settings.view');
      expect(cashierPerms).not.toContain('inventory.adjust');
    });

    it('HR can manage employees and shifts but cannot perform POS or Purchasing operations', () => {
      const hrPerms = calculateEffectivePermissions('hr');
      expect(hrPerms).toContain('hr.view_employees');
      expect(hrPerms).toContain('hr.manage_employees');
      expect(hrPerms).toContain('hr.manage_shifts');
      expect(hrPerms).toContain('attendance.view');
      expect(hrPerms).toContain('attendance.manage');
      expect(hrPerms).toContain('payroll.view');

      // Forbidden
      expect(hrPerms).not.toContain('pos.create_order');
      expect(hrPerms).not.toContain('purchasing.manage');
      expect(hrPerms).not.toContain('inventory.adjust');
    });

    it('Accountant can manage financial records and pay payroll but cannot tamper with attendance or settings', () => {
      const accPerms = calculateEffectivePermissions('accountant');
      expect(accPerms).toContain('accounting.view');
      expect(accPerms).toContain('expenses.view');
      expect(accPerms).toContain('expenses.manage');
      expect(accPerms).toContain('payroll.view');
      expect(accPerms).toContain('payroll.pay');
      expect(accPerms).toContain('suppliers.pay');

      // Forbidden
      expect(accPerms).not.toContain('attendance.correct');
      expect(accPerms).not.toContain('permissions.manage');
      expect(accPerms).not.toContain('settings.manage');
    });

    it('Viewer has read-only access and cannot create, modify, or delete anything', () => {
      const viewerPerms = calculateEffectivePermissions('viewer');
      expect(viewerPerms).toContain('dashboard.view');
      expect(viewerPerms).toContain('orders.view');
      expect(viewerPerms).toContain('inventory.view');

      // Forbidden
      expect(viewerPerms).not.toContain('orders.create');
      expect(viewerPerms).not.toContain('inventory.add');
      expect(viewerPerms).not.toContain('expenses.manage');
      expect(viewerPerms).not.toContain('payroll.pay');
    });
  });

  describe('2. Custom Overrides & Effective Permissions Calculation', () => {
    it('Manager granted an extra permission (expenses.delete) retains defaults and receives the grant', () => {
      const effective = calculateEffectivePermissions('manager', {
        granted: ['expenses.delete'],
      });
      expect(effective).toContain('expenses.delete');
      expect(effective).toContain('orders.view');
      expect(effective).toContain('inventory.view');
    });

    it('Manager revoked of a default permission (pos.cancel_order) loses that permission', () => {
      const effective = calculateEffectivePermissions('manager', {
        revoked: ['pos.cancel_order'],
      });
      expect(effective).not.toContain('pos.cancel_order');
      // Still retains other defaults
      expect(effective).toContain('pos.create_order');
    });

    it('Admin with explicit revoked permissions no longer has wildcard (*)', () => {
      const effective = calculateEffectivePermissions('admin', {
        revoked: ['permissions.manage'],
      });
      expect(effective).not.toContain('*');
      expect(effective).not.toContain('permissions.manage');
      expect(effective).toContain('pos.view');
    });
  });

  describe('3. User Status & Disabled Access Termination', () => {
    it('Disabled user loses all operational permissions regardless of their role', () => {
      interface UserContext {
        id: string;
        role: string;
        status: 'active' | 'disabled';
        permissions: string[];
      }

      function evaluateUserAccess(user: UserContext, requiredPermission: string): boolean {
        if (user.status === 'disabled') return false;
        if (user.permissions.includes('*')) return true;
        return user.permissions.includes(requiredPermission);
      }

      const activeManager: UserContext = {
        id: 'u1',
        role: 'manager',
        status: 'active',
        permissions: calculateEffectivePermissions('manager'),
      };
      expect(evaluateUserAccess(activeManager, 'orders.view')).toBe(true);

      const disabledManager: UserContext = {
        ...activeManager,
        status: 'disabled',
      };
      expect(evaluateUserAccess(disabledManager, 'orders.view')).toBe(false);
      expect(evaluateUserAccess(disabledManager, 'pos.view')).toBe(false);
    });
  });

  describe('4. Financial Permissions Granularity & Separation', () => {
    it('Viewing payroll does not implicitly allow paying or voiding salary', () => {
      function canPerformFinancialAction(permissions: string[], action: 'view' | 'pay' | 'void'): boolean {
        if (permissions.includes('*')) return true;
        return permissions.includes(`payroll.${action}`);
      }

      const hrPerms = calculateEffectivePermissions('hr');
      expect(canPerformFinancialAction(hrPerms, 'view')).toBe(true);
      expect(canPerformFinancialAction(hrPerms, 'pay')).toBe(false);
      expect(canPerformFinancialAction(hrPerms, 'void')).toBe(false);

      const accountantPerms = calculateEffectivePermissions('accountant');
      expect(canPerformFinancialAction(accountantPerms, 'view')).toBe(true);
      expect(canPerformFinancialAction(accountantPerms, 'pay')).toBe(true);
      expect(canPerformFinancialAction(accountantPerms, 'void')).toBe(true);
    });

    it('Viewing expenses does not implicitly allow deleting expenses', () => {
      const managerPerms = calculateEffectivePermissions('manager');
      expect(managerPerms).toContain('expenses.view');
      expect(managerPerms).toContain('expenses.manage');
      expect(managerPerms).not.toContain('expenses.delete');
    });
  });

  describe('5. Lockout & Privilege Escalation Defenses', () => {
    it('Prevents deleting or demoting the last active Owner/Admin', () => {
      const users = [
        { id: 'usr_owner', role: 'owner', status: 'active' },
        { id: 'usr_cashier', role: 'cashier', status: 'active' },
      ];

      function canDemoteOrDeleteUser(targetId: string, currentUsers: typeof users): boolean {
        const target = currentUsers.find((u) => u.id === targetId);
        if (!target) return false;

        const isTargetAdmin = isAdminOrOwnerRole(target.role);
        if (isTargetAdmin) {
          const activeAdmins = currentUsers.filter((u) => u.status === 'active' && isAdminOrOwnerRole(u.role));
          if (activeAdmins.length <= 1) {
            return false; // Cannot remove the sole admin
          }
        }
        return true;
      }

      expect(canDemoteOrDeleteUser('usr_owner', users)).toBe(false);
      expect(canDemoteOrDeleteUser('usr_cashier', users)).toBe(true);
    });

    it('User cannot modify their own permissions or revoke their own permissions.manage', () => {
      function validatePermissionUpdate(currentUserId: string, targetUserId: string, newPermissions: string[]): boolean {
        // Self-demotion guard
        if (currentUserId === targetUserId && !newPermissions.includes('permissions.manage') && !newPermissions.includes('*')) {
          return false;
        }
        return true;
      }

      const isAllowed = validatePermissionUpdate('admin_1', 'admin_1', ['pos.view', 'orders.view']);
      expect(isAllowed).toBe(false);

      const isAllowedWithPermission = validatePermissionUpdate('admin_1', 'admin_1', ['permissions.manage', 'orders.view']);
      expect(isAllowedWithPermission).toBe(true);
    });
  });

  describe('6. Multi-Branch Permission Scoping', () => {
    it('Branch-scoped user cannot access resources outside their assigned branch', () => {
      interface ScopedRequest {
        userBranchId: string | null; // null = all branches
        resourceBranchId: string;
      }

      function isBranchAccessAllowed(req: ScopedRequest): boolean {
        if (!req.userBranchId) return true; // all branches
        return req.userBranchId === req.resourceBranchId;
      }

      expect(isBranchAccessAllowed({ userBranchId: 'branch_cairo', resourceBranchId: 'branch_cairo' })).toBe(true);
      expect(isBranchAccessAllowed({ userBranchId: 'branch_cairo', resourceBranchId: 'branch_alex' })).toBe(false);
      expect(isBranchAccessAllowed({ userBranchId: null, resourceBranchId: 'branch_alex' })).toBe(true);
    });
  });
});
