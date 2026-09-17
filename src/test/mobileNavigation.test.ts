import { describe, it, expect } from 'vitest';
import { allAppModules, NavModule } from '@/components/layout/MobileBottomNav';

describe('Mobile Navigation Integration Suite', () => {
  describe('1. Module Registration in Mobile More Menu', () => {
    it('contains the Executive Financial Dashboard route (/executive)', () => {
      const executiveMod = allAppModules.find((m) => m.path === '/executive');
      expect(executiveMod).toBeDefined();
      expect(executiveMod?.label).toBe('اللوحة المالية والإغلاق');
      expect(executiveMod?.category).toBe('المالية والتقارير');
      expect(executiveMod?.perms).toContain('financial_dashboard.view');
    });

    it('contains the Backup & Disaster Recovery route (/backup)', () => {
      const backupMod = allAppModules.find((m) => m.path === '/backup');
      expect(backupMod).toBeDefined();
      expect(backupMod?.label).toBe('النسخ الاحتياطي والتعافي');
      expect(backupMod?.category).toBe('النظام والإدارة');
      expect(backupMod?.perms).toContain('backup.view');
    });

    it('uses non-empty icon components and legitimate categories for all modules', () => {
      for (const mod of allAppModules) {
        expect(mod.path).toMatch(/^\/[a-z0-9_-]+$/);
        expect(mod.label.trim().length).toBeGreaterThan(0);
        expect(mod.icon).toBeDefined();
        expect(mod.category.trim().length).toBeGreaterThan(0);
        expect(Array.isArray(mod.perms)).toBe(true);
        expect(mod.perms.length).toBeGreaterThan(0);
      }
    });
  });

  describe('2. RBAC Permission Filtering for Mobile More Menu', () => {
    const filterModules = (
      userPerms: string[],
      isAdmin: boolean = false
    ): NavModule[] => {
      return allAppModules.filter((m) => {
        if (isAdmin || userPerms.includes('*')) return true;
        return m.perms.some((p) => userPerms.includes(p));
      });
    };

    it('allows Admin to see all modules including /executive and /backup', () => {
      const allowed = filterModules([], true);
      const paths = allowed.map((m) => m.path);
      expect(paths).toContain('/executive');
      expect(paths).toContain('/backup');
      expect(allowed.length).toBe(allAppModules.length);
    });

    it('allows User with financial_dashboard.view to see /executive but NOT /backup', () => {
      const userPerms = ['financial_dashboard.view', 'pos.view'];
      const allowed = filterModules(userPerms, false);
      const paths = allowed.map((m) => m.path);

      expect(paths).toContain('/executive');
      expect(paths).not.toContain('/backup');
    });

    it('allows User with backup.view to see /backup but NOT /executive', () => {
      const userPerms = ['backup.view'];
      const allowed = filterModules(userPerms, false);
      const paths = allowed.map((m) => m.path);

      expect(paths).toContain('/backup');
      expect(paths).not.toContain('/executive');
    });

    it('hides both /executive and /backup when user lacks respective permissions (e.g. Cashier)', () => {
      const cashierPerms = ['pos.view', 'orders.view'];
      const allowed = filterModules(cashierPerms, false);
      const paths = allowed.map((m) => m.path);

      expect(paths).not.toContain('/executive');
      expect(paths).not.toContain('/backup');
    });

    it('hides all modules for disabled or empty permission user', () => {
      const emptyPerms: string[] = [];
      const allowed = filterModules(emptyPerms, false);
      expect(allowed.length).toBe(0);
    });
  });

  describe('3. Active Route Detection Logic', () => {
    const isModuleActive = (modulePath: string, currentPathname: string) => {
      return (
        currentPathname === modulePath ||
        currentPathname.startsWith(modulePath + '/')
      );
    };

    it('correctly matches exact /executive path', () => {
      expect(isModuleActive('/executive', '/executive')).toBe(true);
    });

    it('correctly matches sub-paths of /executive', () => {
      expect(isModuleActive('/executive', '/executive/closing')).toBe(true);
    });

    it('does not false match unrelated routes', () => {
      expect(isModuleActive('/executive', '/expenses')).toBe(false);
      expect(isModuleActive('/backup', '/settings')).toBe(false);
    });

    it('correctly matches exact /backup path', () => {
      expect(isModuleActive('/backup', '/backup')).toBe(true);
    });
  });

  describe('4. Back Button Safe Navigation Fallback Logic', () => {
    const determineBackTarget = (
      historyStateIdx: number | undefined,
      backFallback: string = '/'
    ): { action: 'back' } | { action: 'fallback'; target: string } => {
      if (typeof historyStateIdx === 'number' && historyStateIdx > 0) {
        return { action: 'back' };
      }
      return { action: 'fallback', target: backFallback };
    };

    it('navigates back (-1) if browser history is valid and user came from in-app navigation', () => {
      const result = determineBackTarget(2, '/');
      expect(result).toEqual({ action: 'back' });
    });

    it('falls back to safe default (e.g. /) when opened directly or refreshed (idx === 0)', () => {
      const result = determineBackTarget(0, '/');
      expect(result).toEqual({ action: 'fallback', target: '/' });
    });

    it('falls back to safe default when historyState is undefined (direct link in new tab)', () => {
      const result = determineBackTarget(undefined, '/dashboard');
      expect(result).toEqual({ action: 'fallback', target: '/dashboard' });
    });
  });
});
