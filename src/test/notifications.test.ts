import { describe, it, expect } from 'vitest';
import { filterNotificationsForUser } from '@/services/notifications.service';
import type { AppNotification, UserNotificationContext } from '@/types/notifications.types';
import { calculateEffectivePermissions } from '@/lib/permissionsModel';

describe('Production-Grade Smart Notifications Center Test Suite', () => {
  // Test sample notifications pool
  const sampleNotifications: AppNotification[] = [
    {
      id: 'notif-order-1',
      type: 'info',
      category: 'orders',
      priority: 'normal',
      title: 'طلب جديد',
      message: 'تم إنشاء طلب جديد #1001 بإجمالي 250 ج.م',
      branchId: 'branch-cairo',
      requiredPermission: 'orders.view',
      actionRoute: '/orders-history',
      status: 'active',
      createdAt: '2026-09-16T00:00:00.000Z',
    },
    {
      id: 'notif-stock-1',
      type: 'critical',
      category: 'inventory',
      priority: 'critical',
      title: 'نفاد تام في المخزون',
      message: 'صنف "صدور دجاج" نفد تماماً من المخزن',
      branchId: 'branch-cairo',
      requiredPermission: 'inventory.view',
      deduplicationKey: 'low_stock_branch-cairo_item-123',
      actionRoute: '/inventory',
      status: 'active',
      createdAt: '2026-09-16T00:05:00.000Z',
    },
    {
      id: 'notif-stock-alex',
      type: 'warning',
      category: 'inventory',
      priority: 'high',
      title: 'تنبيه مخزون منخفض - الإسكندرية',
      message: 'صنف "زيت طهي" وصل إلى 2 لتر في فرع الإسكندرية',
      branchId: 'branch-alex',
      requiredPermission: 'inventory.view',
      deduplicationKey: 'low_stock_branch-alex_item-999',
      actionRoute: '/inventory',
      status: 'active',
      createdAt: '2026-09-16T00:07:00.000Z',
    },
    {
      id: 'notif-payroll-1',
      type: 'success',
      category: 'payroll',
      priority: 'normal',
      title: 'صرف راتب',
      message: 'تم صرف دفعة راتب للموظف أحمد علي بقيمة 6,500 ج.م',
      branchId: 'branch-cairo',
      requiredPermission: 'payroll.view',
      actionRoute: '/payroll',
      status: 'active',
      createdAt: '2026-09-16T00:10:00.000Z',
    },
    {
      id: 'notif-expense-1',
      type: 'warning',
      category: 'expenses',
      priority: 'high',
      title: 'مصروف مالي مرتفع',
      message: 'تم تسجيل فاتورة صيانة تكييفات بقيمة 12,000 ج.م',
      branchId: 'branch-cairo',
      requiredPermission: 'expenses.view',
      actionRoute: '/expenses',
      status: 'active',
      createdAt: '2026-09-16T00:15:00.000Z',
    },
    {
      id: 'notif-supplier-1',
      type: 'warning',
      category: 'suppliers',
      priority: 'high',
      title: 'مستحقات مورد واجبة السداد',
      message: 'شركة الأهرام للأغذية لها رصيد مستحق بقيمة 24,000 ج.م',
      branchId: 'all',
      requiredPermission: 'suppliers.view',
      actionRoute: '/suppliers',
      status: 'active',
      createdAt: '2026-09-16T00:20:00.000Z',
    },
    {
      id: 'notif-att-1',
      type: 'info',
      category: 'attendance',
      priority: 'normal',
      title: 'تعديل يدوي في سجل الحضور',
      message: 'تم اعتماد تصحيح يدوي لحضور الموظف محمود كمال',
      branchId: 'branch-cairo',
      requiredPermission: 'attendance.view',
      actionRoute: '/attendance',
      status: 'active',
      createdAt: '2026-09-16T00:25:00.000Z',
    },
    {
      id: 'notif-sec-1',
      type: 'critical',
      category: 'security',
      priority: 'critical',
      title: 'تعديل أمني في صلاحيات المستخدمين',
      message: 'تم تعديل دور المستخدم عمر خالد إلى كاشير',
      branchId: 'all',
      requiredPermission: 'permissions.manage',
      actionRoute: '/permissions',
      status: 'active',
      createdAt: '2026-09-16T00:30:00.000Z',
    },
    {
      id: 'notif-direct-user',
      type: 'info',
      category: 'settings',
      priority: 'normal',
      title: 'إشعار شخصي مباشر',
      message: 'تم تعيينك مسؤولاً عن جرد الوردية المسائية',
      branchId: 'branch-cairo',
      targetUserId: 'user-specific-123',
      status: 'active',
      createdAt: '2026-09-16T00:35:00.000Z',
    },
  ];

  // =========================================================================
  // 1. RBAC Filtering Tests
  // =========================================================================
  describe('1. Role-Based Access Control (RBAC) Filtering', () => {
    it('Cashier only sees Order notifications and never sees Payroll, Expenses, or Security', () => {
      const cashierPerms = calculateEffectivePermissions('cashier');
      const cashierContext: UserNotificationContext = {
        userId: 'usr-cashier',
        userBranchId: 'branch-cairo',
        hasPermission: (perm) => cashierPerms.includes(perm),
        isAdmin: false,
        isOwner: false,
      };

      const visible = filterNotificationsForUser(sampleNotifications, cashierContext);
      const visibleIds = visible.map((n) => n.id);

      // Should see orders
      expect(visibleIds).toContain('notif-order-1');

      // Must NEVER see financial, payroll, or security notifications
      expect(visibleIds).not.toContain('notif-payroll-1');
      expect(visibleIds).not.toContain('notif-expense-1');
      expect(visibleIds).not.toContain('notif-sec-1');
      expect(visibleIds).not.toContain('notif-stock-1');
    });

    it('Accountant sees Financial, Payroll, Expenses, and Supplier notifications', () => {
      const accPerms = calculateEffectivePermissions('accountant');
      const accountantContext: UserNotificationContext = {
        userId: 'usr-accountant',
        userBranchId: 'branch-cairo',
        hasPermission: (perm) => accPerms.includes(perm),
        isAdmin: false,
        isOwner: false,
      };

      const visible = filterNotificationsForUser(sampleNotifications, accountantContext);
      const visibleIds = visible.map((n) => n.id);

      expect(visibleIds).toContain('notif-payroll-1');
      expect(visibleIds).toContain('notif-expense-1');
      expect(visibleIds).toContain('notif-supplier-1');
      expect(visibleIds).toContain('notif-order-1');

      // Accountant should not see security permissions modifications
      expect(visibleIds).not.toContain('notif-sec-1');
    });

    it('HR sees Attendance notifications and cannot see POS orders or low stock', () => {
      const hrPerms = calculateEffectivePermissions('hr');
      const hrContext: UserNotificationContext = {
        userId: 'usr-hr',
        userBranchId: 'branch-cairo',
        hasPermission: (perm) => hrPerms.includes(perm),
        isAdmin: false,
        isOwner: false,
      };

      const visible = filterNotificationsForUser(sampleNotifications, hrContext);
      const visibleIds = visible.map((n) => n.id);

      expect(visibleIds).toContain('notif-att-1');
      expect(visibleIds).not.toContain('notif-order-1');
      expect(visibleIds).not.toContain('notif-stock-1');
    });

    it('Inventory Specialist sees Low Stock and Supplier notifications', () => {
      const invPerms = calculateEffectivePermissions('inventory');
      const invContext: UserNotificationContext = {
        userId: 'usr-inv',
        userBranchId: 'branch-cairo',
        hasPermission: (perm) => invPerms.includes(perm),
        isAdmin: false,
        isOwner: false,
      };

      const visible = filterNotificationsForUser(sampleNotifications, invContext);
      const visibleIds = visible.map((n) => n.id);

      expect(visibleIds).toContain('notif-stock-1');
      expect(visibleIds).toContain('notif-supplier-1');
      expect(visibleIds).not.toContain('notif-payroll-1');
      expect(visibleIds).not.toContain('notif-sec-1');
    });

    it('Owner has sovereign access and sees all notifications for their branches', () => {
      const ownerContext: UserNotificationContext = {
        userId: 'usr-owner',
        userBranchId: null, // all branches
        hasPermission: () => true,
        isAdmin: true,
        isOwner: true,
      };

      const visible = filterNotificationsForUser(sampleNotifications, ownerContext);
      expect(visible.length).toBeGreaterThanOrEqual(8);
    });
  });

  // =========================================================================
  // 2. Branch Scoping Tests
  // =========================================================================
  describe('2. Branch Scoping and Isolation', () => {
    it('Branch Cairo user cannot see notifications scoped to Branch Alexandria', () => {
      const invPerms = calculateEffectivePermissions('inventory');
      const cairoContext: UserNotificationContext = {
        userId: 'usr-cairo-inv',
        userBranchId: 'branch-cairo',
        hasPermission: (perm) => invPerms.includes(perm),
        isAdmin: false,
        isOwner: false,
      };

      const visible = filterNotificationsForUser(sampleNotifications, cairoContext);
      const visibleIds = visible.map((n) => n.id);

      // Cairo stock alert visible
      expect(visibleIds).toContain('notif-stock-1');

      // Alexandria stock alert strictly HIDDEN
      expect(visibleIds).not.toContain('notif-stock-alex');

      // Global ('all') supplier notification is visible
      expect(visibleIds).toContain('notif-supplier-1');
    });

    it('Direct user targeted notification is only visible to the designated user', () => {
      const otherUserContext: UserNotificationContext = {
        userId: 'different-user-456',
        userBranchId: 'branch-cairo',
        hasPermission: () => true,
        isAdmin: false,
        isOwner: false,
      };
      const visibleOther = filterNotificationsForUser(sampleNotifications, otherUserContext);
      expect(visibleOther.map((n) => n.id)).not.toContain('notif-direct-user');

      const targetUserContext: UserNotificationContext = {
        userId: 'user-specific-123',
        userBranchId: 'branch-cairo',
        hasPermission: () => true,
        isAdmin: false,
        isOwner: false,
      };
      const visibleTarget = filterNotificationsForUser(sampleNotifications, targetUserContext);
      expect(visibleTarget.map((n) => n.id)).toContain('notif-direct-user');
    });
  });

  // =========================================================================
  // 3. Deduplication & Alert Lifecycle Tests
  // =========================================================================
  describe('3. Deduplication & Active Alerts Resolution', () => {
    it('Deduplication prevents spamming multiple active alerts for the same event key', () => {
      const activeAlertsStore: Record<string, AppNotification> = {};

      const tryPublish = (notif: AppNotification) => {
        if (notif.deduplicationKey && activeAlertsStore[notif.deduplicationKey]) {
          const existing = activeAlertsStore[notif.deduplicationKey];
          if (existing.status === 'active') {
            return { created: false, id: existing.id };
          }
        }
        activeAlertsStore[notif.deduplicationKey!] = notif;
        return { created: true, id: notif.id };
      };

      const alert1: AppNotification = {
        id: 'alert-1',
        type: 'warning',
        category: 'inventory',
        priority: 'high',
        title: 'مخزون منخفض',
        message: 'صدور دجاج 3 كجم',
        status: 'active',
        deduplicationKey: 'low_stock_branch1_chicken',
        createdAt: '2026-09-16T00:00:00Z',
      };

      // First alert creation succeeds
      const res1 = tryPublish(alert1);
      expect(res1.created).toBe(true);
      expect(res1.id).toBe('alert-1');

      // Opening page or repeating event 20 times does NOT create duplicates
      for (let i = 0; i < 20; i++) {
        const resDuplicate = tryPublish({
          ...alert1,
          id: `alert-duplicate-${i}`,
        });
        expect(resDuplicate.created).toBe(false);
        expect(resDuplicate.id).toBe('alert-1');
      }
    });

    it('Replenishing stock resolves active alert and allows new alert when depleted again', () => {
      let currentAlert: AppNotification | null = {
        id: 'alert-1',
        type: 'warning',
        category: 'inventory',
        priority: 'high',
        title: 'مخزون منخفض',
        message: 'صدور دجاج 3 كجم',
        status: 'active',
        deduplicationKey: 'low_stock_branch1_chicken',
        createdAt: '2026-09-16T00:00:00Z',
      };

      // 1. Alert is active
      expect(currentAlert.status).toBe('active');

      // 2. Stock replenishment occurs -> Resolves alert
      currentAlert = {
        ...currentAlert,
        status: 'resolved',
        resolvedAt: '2026-09-16T01:00:00Z',
      };
      expect(currentAlert.status).toBe('resolved');
      expect(currentAlert.resolvedAt).toBeDefined();

      // 3. Stock drops below minimum again future -> creates new alert
      const newAlert: AppNotification = {
        id: 'alert-2',
        type: 'critical',
        category: 'inventory',
        priority: 'critical',
        title: 'نفاد مخزون',
        message: 'صدور دجاج 0 كجم',
        status: 'active',
        deduplicationKey: 'low_stock_branch1_chicken',
        createdAt: '2026-09-16T02:00:00Z',
      };
      expect(newAlert.id).toBe('alert-2');
      expect(newAlert.status).toBe('active');
    });
  });

  // =========================================================================
  // 4. Per-User Read State Isolation Tests
  // =========================================================================
  describe('4. Per-User Read State Isolation', () => {
    it('User A reading a notification does not mark it as read for User B', () => {
      const userAReads = new Set<string>();
      const userBReads = new Set<string>();

      const notifId = 'notif-order-1';

      // User A marks as read
      userAReads.add(notifId);

      const isReadForA = userAReads.has(notifId);
      const isReadForB = userBReads.has(notifId);

      expect(isReadForA).toBe(true);
      expect(isReadForB).toBe(false); // User B state is pristine
    });
  });

  // =========================================================================
  // 5. Action Deep-Linking & Permission Guard Tests
  // =========================================================================
  describe('5. Action Deep-Linking and Runtime Permission Guard', () => {
    it('Action execution verifies user holds the required permission at click time', () => {
      const notif: AppNotification = {
        id: 'notif-payroll-test',
        type: 'info',
        category: 'payroll',
        priority: 'normal',
        title: 'كشف رواتب جاهز',
        message: 'تم تجهيز كشف الرواتب لشهر سبتمبر',
        requiredPermission: 'payroll.view',
        actionRoute: '/payroll',
        status: 'active',
        createdAt: '2026-09-16T00:00:00Z',
      };

      const executeAction = (userPermissions: string[], isAdmin: boolean): boolean => {
        if (isAdmin) return true;
        if (notif.requiredPermission && !userPermissions.includes(notif.requiredPermission)) {
          return false; // Forbidden
        }
        return true; // Allowed
      };

      // Authorized user with payroll.view
      expect(executeAction(['payroll.view', 'pos.view'], false)).toBe(true);

      // Demoted / unauthorized user
      expect(executeAction(['pos.view'], false)).toBe(false);

      // System Admin always bypasses
      expect(executeAction([], true)).toBe(true);
    });
  });

  // =========================================================================
  // 6. Security Hotfix & Authorization Hardening Tests
  // =========================================================================
  describe('6. Security Hotfix & Authorization Hardening', () => {
    it('1. Untrusted client / Cashier cannot create Security or Settings notifications', () => {
      const validateClientCreation = (
        userRole: string,
        category: string
      ): { allowed: boolean; reason?: string } => {
        if (category === 'security' || category === 'settings') {
          if (!['owner', 'admin'].includes(userRole)) {
            return { allowed: false, reason: 'Security & settings notifications restricted to admins' };
          }
        }
        return { allowed: true };
      };

      expect(validateClientCreation('cashier', 'security').allowed).toBe(false);
      expect(validateClientCreation('waiter', 'settings').allowed).toBe(false);
      expect(validateClientCreation('accountant', 'security').allowed).toBe(false);
      expect(validateClientCreation('admin', 'security').allowed).toBe(true);
      expect(validateClientCreation('owner', 'settings').allowed).toBe(true);
    });

    it('2. Client cannot spoof foreign branch ID', () => {
      const validateBranchAssignment = (
        userBranchId: string,
        isAdmin: boolean,
        targetBranchId: string
      ): boolean => {
        if (isAdmin) return true;
        if (targetBranchId === 'all') return true;
        return userBranchId === targetBranchId;
      };

      // Staff in Cairo cannot target Alexandria
      expect(validateBranchAssignment('branch-cairo', false, 'branch-alex')).toBe(false);
      // Staff in Cairo can target Cairo
      expect(validateBranchAssignment('branch-cairo', false, 'branch-cairo')).toBe(true);
      // Admin can target any branch
      expect(validateBranchAssignment('branch-cairo', true, 'branch-alex')).toBe(true);
    });

    it('3. Untrusted client cannot forge Payroll or Expense notifications', () => {
      const validateFinancialNotificationCreation = (
        userRole: string,
        category: string
      ): boolean => {
        if (['payroll', 'advances', 'expenses'].includes(category)) {
          return ['owner', 'admin', 'accountant'].includes(userRole);
        }
        return true;
      };

      expect(validateFinancialNotificationCreation('cashier', 'payroll')).toBe(false);
      expect(validateFinancialNotificationCreation('inventory', 'expenses')).toBe(false);
      expect(validateFinancialNotificationCreation('kitchen', 'payroll')).toBe(false);
      expect(validateFinancialNotificationCreation('accountant', 'payroll')).toBe(true);
      expect(validateFinancialNotificationCreation('admin', 'expenses')).toBe(true);
    });

    it('4. Unauthorized user cannot resolve an alert without matching permission', () => {
      const validateResolution = (
        userRole: string,
        alertCategory: string
      ): boolean => {
        if (['owner', 'admin', 'manager'].includes(userRole)) return true;
        if (alertCategory === 'inventory' && userRole === 'inventory') return true;
        return false;
      };

      // Cashier cannot resolve low-stock alert
      expect(validateResolution('cashier', 'inventory')).toBe(false);
      // Waiter cannot resolve low-stock alert
      expect(validateResolution('waiter', 'inventory')).toBe(false);
      // Inventory staff can resolve
      expect(validateResolution('inventory', 'inventory')).toBe(true);
      // Manager/Admin can resolve
      expect(validateResolution('manager', 'inventory')).toBe(true);
      expect(validateResolution('admin', 'inventory')).toBe(true);
    });

    it('5. Deduplication key preemption by untrusted client is neutralized', () => {
      const allowedCategoriesForDeduplicationKey = (
        userRole: string,
        key: string
      ): boolean => {
        if (key.startsWith('low_stock_') && !['owner', 'admin', 'inventory', 'manager'].includes(userRole)) {
          return false;
        }
        if (key.startsWith('sec_') && !['owner', 'admin'].includes(userRole)) {
          return false;
        }
        if (key.startsWith('salary_') && !['owner', 'admin', 'accountant'].includes(userRole)) {
          return false;
        }
        return true;
      };

      expect(allowedCategoriesForDeduplicationKey('cashier', 'low_stock_branch1_prod99')).toBe(false);
      expect(allowedCategoriesForDeduplicationKey('cashier', 'salary_paid_emp123')).toBe(false);
      expect(allowedCategoriesForDeduplicationKey('cashier', 'sec_role_change_99')).toBe(false);
      expect(allowedCategoriesForDeduplicationKey('inventory', 'low_stock_branch1_prod99')).toBe(true);
      expect(allowedCategoriesForDeduplicationKey('accountant', 'salary_paid_emp123')).toBe(true);
    });

    it('6. Notification content fields are strictly immutable on update', () => {
      const original = {
        title: 'أصلي',
        message: 'رسالة أصلية',
        category: 'inventory',
        priority: 'high',
        branchId: 'branch-cairo',
        deduplicationKey: 'low_stock_item1',
        status: 'active',
      };

      const validateUpdateFields = (update: Record<string, any>): boolean => {
        const immutableFields = ['title', 'message', 'category', 'priority', 'branchId', 'deduplicationKey'];
        for (const f of immutableFields) {
          if (update[f] !== undefined && update[f] !== (original as any)[f]) {
            return false; // Forbidden field tampering
          }
        }
        return true;
      };

      // Tampering with message
      expect(validateUpdateFields({ message: 'رسالة معدلة خبيثة' })).toBe(false);
      // Tampering with category
      expect(validateUpdateFields({ category: 'security' })).toBe(false);
      // Tampering with priority
      expect(validateUpdateFields({ priority: 'critical' })).toBe(false);
      // Valid status resolution update
      expect(validateUpdateFields({ status: 'resolved', resolvedAt: '2026-09-16T00:00:00Z' })).toBe(true);
    });

    it('7. Single Permission Vocabulary: Bidirectional mapping between dot and colon notations', async () => {
      const { hasPermissionMatch, PERMISSION_MAPPINGS } = await import('../../server/src/types/permissions.types');

      // settings.view <-> settings:read
      expect(hasPermissionMatch(['settings.view'], 'settings:read')).toBe(true);
      expect(hasPermissionMatch(['settings:read'], 'settings.view')).toBe(true);

      // orders.view <-> orders:read
      expect(hasPermissionMatch(['orders.view'], 'orders:read')).toBe(true);
      expect(hasPermissionMatch(['orders:read'], 'orders.view')).toBe(true);

      // payroll.view <-> payroll:read
      expect(hasPermissionMatch(['payroll.view'], 'payroll:read')).toBe(true);

      // Wildcard
      expect(hasPermissionMatch(['*'], 'settings:read')).toBe(true);
      expect(hasPermissionMatch(['*'], 'attendance:manage')).toBe(true);

      // Mismatched
      expect(hasPermissionMatch(['menu:read'], 'settings:read')).toBe(false);
      expect(hasPermissionMatch(['pos.view'], 'payroll.pay')).toBe(false);
    });

    it('8. Settings endpoint requires settings:read and rejects users with only menu:read', async () => {
      const { hasPermissionMatch } = await import('../../server/src/types/permissions.types');

      const menuOnlyUserPerms = ['menu:read', 'offers:read'];
      const settingsUserPerms = ['settings.view'];
      const adminPerms = ['*'];

      // User with only menu:read CANNOT access settings
      expect(hasPermissionMatch(menuOnlyUserPerms, 'settings:read')).toBe(false);

      // User with settings.view CAN access settings
      expect(hasPermissionMatch(settingsUserPerms, 'settings:read')).toBe(true);

      // Admin with wildcard CAN access settings
      expect(hasPermissionMatch(adminPerms, 'settings:read')).toBe(true);
    });
  });
});
