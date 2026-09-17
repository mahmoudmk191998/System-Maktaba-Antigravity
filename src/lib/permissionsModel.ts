export interface PermissionItem {
  id: string;
  label: string;
  description?: string;
}

export interface PermissionCategory {
  id: string;
  label: string;
  iconName: string;
  permissions: PermissionItem[];
}

export interface RoleTemplate {
  key: string;
  label: string;
  description: string;
  isSystem: boolean;
  permissions: string[];
}

export const PERMISSION_CATEGORIES: PermissionCategory[] = [
  {
    id: 'dashboard',
    label: 'لوحة التحكم والإحصائيات',
    iconName: 'LayoutDashboard',
    permissions: [
      { id: 'dashboard.view', label: 'عرض لوحة التحكم والمؤشرات الرئيسية' },
    ],
  },
  {
    id: 'sales',
    label: 'المبيعات ونقاط البيع (POS)',
    iconName: 'ShoppingCart',
    permissions: [
      { id: 'pos.view', label: 'استخدام شاشة نقطة البيع' },
      { id: 'pos.create_order', label: 'إنشاء طلبات جديدة' },
      { id: 'pos.edit_order', label: 'تعديل الطلبات الجارية' },
      { id: 'pos.cancel_order', label: 'إلغاء الطلبات' },
      { id: 'pos.apply_discount', label: 'تطبيق الخصومات والعروض' },
      { id: 'pos.refund', label: 'إجراء عمليات المرتجع' },
      { id: 'pos.open_drawer', label: 'فتح درج الكاشير نقدياً' },
      { id: 'pos.close_session', label: 'إغلاق وردية / جلسة الكاشير' },
      { id: 'orders.view', label: 'عرض سجل الطلبات والفواتير' },
      { id: 'orders.manage', label: 'إدارة وتعديل وحذف الفواتير القديمة' },
      { id: 'customers.view', label: 'استعراض بيانات العملاء' },
      { id: 'customers.manage', label: 'إضافة وتعديل وحذف العملاء' },
      { id: 'promotions.view', label: 'عرض العروض وقسائم الخصم' },
      { id: 'promotions.manage', label: 'إنشاء وتعديل العروض الترويجية' },
    ],
  },
  {
    id: 'kitchen',
    label: 'المطبخ والإنتاج والمنيو',
    iconName: 'ChefHat',
    permissions: [
      { id: 'kitchen.view', label: 'عرض شاشة المطبخ (KDS)' },
      { id: 'kitchen.manage_orders', label: 'تحديث حالة تحضير الطلبات' },
      { id: 'production.view', label: 'عرض شاشة أوامر التحضير والإنتاج' },
      { id: 'production.manage', label: 'بدء وإتمام دفعات الإنتاج' },
      { id: 'menu.view', label: 'استعراض قائمة الطعام والوصفات' },
      { id: 'menu.manage', label: 'إدارة الأصناف والأسعار ومكونات الوصفات' },
    ],
  },
  {
    id: 'inventory',
    label: 'المخزون والمشتريات والتوريد',
    iconName: 'Package',
    permissions: [
      { id: 'inventory.view', label: 'عرض أرصدة وحركات المخزون' },
      { id: 'inventory.add', label: 'إضافة خامات ومواد جديدة للمخزن' },
      { id: 'inventory.edit', label: 'تعديل بيانات الخامات والحدود الدنيا' },
      { id: 'inventory.delete', label: 'حذف خامات ومواد من المخزن' },
      { id: 'inventory.adjust', label: 'إجراء تسويات الجرد والمناقلات' },
      { id: 'inventory.waste', label: 'تسجيل وإدارة الهالك والتوالف' },
      { id: 'purchasing.view', label: 'عرض أوامر الشراء وفواتير الموردين' },
      { id: 'purchasing.manage', label: 'إنشاء وتعديل أوامر الشراء' },
      { id: 'purchasing.pay', label: 'تسجيل دفعات وسداد فواتير المشتريات' },
      { id: 'suppliers.view', label: 'عرض قائمة الموردين وأرصدتهم' },
      { id: 'suppliers.manage', label: 'إضافة وتعديل بيانات الموردين' },
      { id: 'suppliers.pay', label: 'تسجيل دفعات الحساب للموردين' },
    ],
  },
  {
    id: 'operations',
    label: 'العمليات الداخلية والتشغيل',
    iconName: 'CalendarDays',
    permissions: [
      { id: 'tables.view', label: 'عرض خريطة الصالة والطاولات' },
      { id: 'tables.manage', label: 'إدارة وتسكين الحجوزات والطاولات' },
      { id: 'callcenter.view', label: 'استخدام وحدة مركز الاتصال للطلبات' },
      { id: 'delivery.view', label: 'عرض شاشة التوصيل والسائقين' },
      { id: 'delivery.manage', label: 'إسناد الطلبات ومتابعة السائقين والمناطق' },
      { id: 'hr.manage_shifts', label: 'إدارة جدول وتوزيع الورديات' },
      { id: 'hr.view_employees', label: 'استعراض سجلات الموظفين' },
      { id: 'hr.manage_employees', label: 'إضافة وتعديل بيانات الموظفين وعقودهم' },
      { id: 'attendance.view', label: 'عرض سجل الحضور والانصراف' },
      { id: 'attendance.manage', label: 'تسجيل حضور وانصراف يدوي للموظفين' },
      { id: 'attendance.correct', label: 'تعديل واعتماد تصحيحات الحضور' },
      { id: 'leave.view', label: 'عرض طلبات وسجلات الإجازات' },
      { id: 'leave.create', label: 'تقديم وتسجيل إجازات للموظفين' },
      { id: 'leave.approve', label: 'اعتماد والموافقة على الإجازات' },
      { id: 'leave.reject', label: 'رفض طلبات الإجازات' },
      { id: 'leave.cancel', label: 'إلغاء الإجازات المعتمدة' },
      { id: 'leave.manage_balance', label: 'تعديل وإدارة رصيد الإجازات' },
    ],
  },
  {
    id: 'finance',
    label: 'المالية والمرتبات والتقارير',
    iconName: 'BarChart3',
    permissions: [
      { id: 'accounting.view', label: 'عرض دفاتر الحسابات وميزان المراجعة' },
      { id: 'expenses.view', label: 'عرض سجل المصروفات والنثريات' },
      { id: 'expenses.manage', label: 'إضافة وتعديل وسداد المصروفات' },
      { id: 'expenses.delete', label: 'حذف المصروفات المسجلة' },
      { id: 'payroll.view', label: 'عرض كشوف المرتبات والخصومات' },
      { id: 'payroll.pay', label: 'صرف الرواتب وإصدار سندات الصرف' },
      { id: 'payroll.void', label: 'إلغاء سندات صرف الرواتب (Void)' },
      { id: 'advances.view', label: 'عرض طلبات وأقساط السلف' },
      { id: 'advances.manage', label: 'الموافقة على السلف وصرفها وإلغاؤها' },
      { id: 'reports.view', label: 'استعراض التقارير والرسوم البيانية' },
      { id: 'reports.sales', label: 'تصدير وتحليل تقارير المبيعات والأرباح' },
      { id: 'reports.inventory', label: 'تصدير تقارير استهلاك وهالك المخزون' },
      { id: 'financial_dashboard.view', label: 'عرض اللوحة المالية والتنفيذية' },
      { id: 'daily_closing.view', label: 'عرض سجلات ومطابقة الإغلاق اليومي' },
      { id: 'daily_closing.create', label: 'إجراء وحفظ إغلاق اليوم المالي' },
      { id: 'daily_closing.update', label: 'تعديل أو مراجعة الإغلاق اليومي' },
      { id: 'daily_closing.void', label: 'إلغاء الإغلاق اليومي (Void)' },
    ],
  },
  {
    id: 'settings',
    label: 'النظام والأمان والإدارة العليا',
    iconName: 'Settings',
    permissions: [
      { id: 'settings.view', label: 'عرض إعدادات الفرع والضريبة والطابعات' },
      { id: 'settings.manage', label: 'تعديل الإعدادات الأساسية والمتقدمة' },
      { id: 'permissions.manage', label: 'إدارة المستخدمين والأدوار وتعيين الصلاحيات' },
      { id: 'maintenance.view', label: 'عرض سجل الصيانة والأصول' },
      { id: 'maintenance.manage', label: 'إدارة طلبات الصيانة ومتابعة المعدات' },
      { id: 'integrations.view', label: 'عرض وإدارة منصات التكاملات والـ API' },
      { id: 'audit.view', label: 'استعراض سجل التدقيق الأمني للعمليات' },
    ],
  },
  {
    id: 'backup',
    label: 'النسخ الاحتياطي والتعافي من الكوارث',
    iconName: 'Database',
    permissions: [
      { id: 'backup.view', label: 'استعراض سجل وحالة النسخ الاحتياطية' },
      { id: 'backup.create', label: 'إنشاء نسخة احتياطية جديدة (شاملة / موديول)' },
      { id: 'backup.download', label: 'تنزيل ملف النسخة الاحتياطية' },
      { id: 'backup.restore', label: 'تنفيذ استعادة البيانات (صلاحية حساسة للمالك والمدير)' },
      { id: 'backup.delete', label: 'حذف ملفات النسخ الاحتياطية القديمة' },
    ],
  },
];

export const ALL_PERMISSION_IDS: string[] = PERMISSION_CATEGORIES.flatMap(c => c.permissions.map(p => p.id));

export const ROLE_TEMPLATES: Record<string, RoleTemplate> = {
  owner: {
    key: 'owner',
    label: 'المالك (Owner)',
    description: 'كامل الصلاحيات والتحكم التام والسيادي في المنشأة وكافة الفروع',
    isSystem: true,
    permissions: ['*'],
  },
  admin: {
    key: 'admin',
    label: 'مدير النظام (Admin)',
    description: 'صلاحيات إدارية وتشغيلية واسعة لكافة أقسام النظام',
    isSystem: true,
    permissions: [...ALL_PERMISSION_IDS],
  },
  manager: {
    key: 'manager',
    label: 'مدير التشغيل / الفرع (Manager)',
    description: 'إدارة العمليات اليومية، المبيعات، المخزون، المشتريات، الموظفين، والمصروفات',
    isSystem: true,
    permissions: [
      'dashboard.view',
      'pos.view', 'pos.create_order', 'pos.edit_order', 'pos.cancel_order', 'pos.apply_discount', 'pos.refund', 'pos.open_drawer', 'pos.close_session',
      'orders.view', 'orders.manage',
      'customers.view', 'customers.manage',
      'promotions.view', 'promotions.manage',
      'kitchen.view', 'kitchen.manage_orders',
      'production.view', 'production.manage',
      'menu.view', 'menu.manage',
      'inventory.view', 'inventory.add', 'inventory.edit', 'inventory.adjust', 'inventory.waste',
      'purchasing.view', 'purchasing.manage', 'purchasing.pay',
      'suppliers.view', 'suppliers.manage', 'suppliers.pay',
      'tables.view', 'tables.manage',
      'callcenter.view',
      'delivery.view', 'delivery.manage',
      'hr.manage_shifts', 'hr.view_employees',
      'attendance.view', 'attendance.manage', 'attendance.correct',
      'leave.view', 'leave.create', 'leave.approve',
      'accounting.view', 'expenses.view', 'expenses.manage',
      'financial_dashboard.view', 'daily_closing.view', 'daily_closing.create', 'daily_closing.update',
      'reports.view', 'reports.sales', 'reports.inventory',
      'maintenance.view', 'maintenance.manage',
    ],
  },
  accountant: {
    key: 'accountant',
    label: 'المحاسب المالي (Accountant)',
    description: 'إدارة الحسابات، الرواتب، المصروفات، أرصدة الموردين، والتقارير المالية',
    isSystem: true,
    permissions: [
      'dashboard.view',
      'orders.view',
      'accounting.view',
      'expenses.view', 'expenses.manage', 'expenses.delete',
      'payroll.view', 'payroll.pay', 'payroll.void',
      'advances.view', 'advances.manage',
      'purchasing.view', 'purchasing.pay',
      'suppliers.view', 'suppliers.pay',
      'financial_dashboard.view', 'daily_closing.view', 'daily_closing.create', 'daily_closing.update',
      'reports.view', 'reports.sales', 'reports.inventory',
      'audit.view',
    ],
  },
  hr: {
    key: 'hr',
    label: 'مسؤول الموارد البشرية (HR)',
    description: 'إدارة ملفات الموظفين، الحضور والانصراف، الورديات، والسلف وكشوف المرتبات',
    isSystem: true,
    permissions: [
      'dashboard.view',
      'hr.view_employees', 'hr.manage_employees',
      'hr.manage_shifts',
      'attendance.view', 'attendance.manage', 'attendance.correct',
      'leave.view', 'leave.create', 'leave.approve', 'leave.reject', 'leave.cancel', 'leave.manage_balance',
      'payroll.view',
      'advances.view', 'advances.manage',
      'reports.view',
    ],
  },
  cashier: {
    key: 'cashier',
    label: 'الكاشير / المبيعات (Cashier)',
    description: 'استقبال العملاء، إصدار الفواتير، ونقاط البيع والصالة والتوصيل',
    isSystem: true,
    permissions: [
      'dashboard.view',
      'pos.view', 'pos.create_order', 'pos.edit_order', 'pos.apply_discount', 'pos.open_drawer', 'pos.close_session',
      'orders.view',
      'customers.view', 'customers.manage',
      'promotions.view',
      'tables.view',
      'callcenter.view',
      'delivery.view',
    ],
  },
  inventory: {
    key: 'inventory',
    label: 'مسؤول المخزن والتوريد (Inventory)',
    description: 'استلام ومراقبة الخامات، تسويات الجرد، المشتريات، والموردين، والهالك',
    isSystem: true,
    permissions: [
      'dashboard.view',
      'inventory.view', 'inventory.add', 'inventory.edit', 'inventory.adjust', 'inventory.waste',
      'purchasing.view', 'purchasing.manage',
      'suppliers.view', 'suppliers.manage',
      'reports.inventory',
    ],
  },
  kitchen: {
    key: 'kitchen',
    label: 'شيف / المطبخ والإنتاج (Kitchen)',
    description: 'متابعة شاشات تحضير الوجبات والإنتاج وتسجيل الهالك في المطبخ',
    isSystem: true,
    permissions: [
      'kitchen.view', 'kitchen.manage_orders',
      'production.view', 'production.manage',
      'menu.view',
      'inventory.waste',
    ],
  },
  viewer: {
    key: 'viewer',
    label: 'مشاهد فقط (Viewer / Read-Only)',
    description: 'استعراض البيانات والتقارير بدون أي صلاحيات لإجراء تعديلات أو كتابة',
    isSystem: true,
    permissions: [
      'dashboard.view',
      'orders.view',
      'menu.view',
      'inventory.view',
      'reports.view',
      'tables.view',
    ],
  },
};

/**
 * Calculates effective permissions for a user:
 * Base Role Template Permissions + Custom Overrides
 */
export function calculateEffectivePermissions(
  roleKey: string,
  customOverrides?: { granted?: string[]; revoked?: string[] }
): string[] {
  if (roleKey === 'owner' || roleKey === 'super_admin') {
    return ['*'];
  }

  const template = ROLE_TEMPLATES[roleKey];
  const basePerms = new Set<string>(template ? template.permissions : []);

  // Apply granted overrides
  if (customOverrides?.granted) {
    for (const p of customOverrides.granted) {
      basePerms.add(p);
    }
  }

  // Remove revoked overrides
  if (customOverrides?.revoked) {
    for (const p of customOverrides.revoked) {
      basePerms.delete(p);
    }
  }

  // If role is admin and no explicit revokes, grant wildcard
  if (roleKey === 'admin' && (!customOverrides?.revoked || customOverrides.revoked.length === 0)) {
    return ['*'];
  }

  return Array.from(basePerms);
}

export function getRoleLabel(roleKey: string): string {
  return ROLE_TEMPLATES[roleKey]?.label || roleKey;
}

export function isOwnerRole(roleKey: string): boolean {
  return roleKey === 'owner' || roleKey === 'super_admin';
}

export function isAdminOrOwnerRole(roleKey: string): boolean {
  return roleKey === 'owner' || roleKey === 'admin' || roleKey === 'super_admin';
}
