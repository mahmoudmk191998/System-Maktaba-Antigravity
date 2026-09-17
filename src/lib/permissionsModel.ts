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
    label: 'لوحة التحكم والمؤشرات',
    iconName: 'LayoutDashboard',
    permissions: [
      { id: 'dashboard.view', label: 'عرض لوحة التحكم الرئيسية ومؤشرات الإعارة' },
      { id: 'financial_dashboard.view', label: 'عرض اللوحة المالية والتنفيذية' },
    ],
  },
  {
    id: 'circulation',
    label: 'خدمات الإعارة ومكتب التداول (Circulation Desk)',
    iconName: 'BookOpenCheck',
    permissions: [
      { id: 'circulation.view', label: 'استخدام مكتب خدمات الإعارة (Circulation Desk)' },
      { id: 'pos.view', label: 'الوصول لشاشات التداول السريع والإعارة' },
      { id: 'pos.create_order', label: 'إنشاء عمليات إعارة سريعة' },
      { id: 'pos.edit_order', label: 'تعديل بيانات عمليات الإعارة الجارية' },
      { id: 'pos.cancel_order', label: 'إلغاء عمليات الإعارة' },
      { id: 'pos.apply_discount', label: 'تطبيق الإعفاءات وتخفيضات الرسوم' },
      { id: 'pos.refund', label: 'استرداد الرسوم والمدفوعات' },
      { id: 'pos.open_drawer', label: 'فتح درج الخزينة نقدياً' },
      { id: 'pos.close_session', label: 'إغلاق وردية / جلسة الإعارة' },
      { id: 'loans.view', label: 'عرض سجلات وحركات الإعارات' },
      { id: 'loans.checkout', label: 'تنفيذ إعارة كتب للأعضاء' },
      { id: 'loans.return', label: 'استلام الكتب المرتجعة وتقييم حالتها' },
      { id: 'loans.renew', label: 'تجديد فترات الإعارة' },
      { id: 'orders.view', label: 'استعراض سجلات التداول والإعارات التاريخية' },
      { id: 'orders.manage', label: 'إدارة وتعديل سجلات التداول' },
      { id: 'holds.view', label: 'عرض قائمة الحجوزات والانتظار' },
      { id: 'holds.manage', label: 'إدارة وترتيب أولويات الحجوزات' },
      { id: 'fines.view', label: 'عرض سجل الغرامات ومستحقات التأخير' },
      { id: 'fines.collect', label: 'تحصيل الغرامات وإصدار سندات القبض' },
      { id: 'fines.waive', label: 'إعفاء وإسقاط الغرامات (صلاحية إدارية)' },
    ],
  },
  {
    id: 'catalog',
    label: 'الفهرسة والتصنيف وإدارة الكتب (Catalog)',
    iconName: 'BookMarked',
    permissions: [
      { id: 'books.view', label: 'استعراض فهرس العناوين والكتب' },
      { id: 'books.create', label: 'إضافة عناوين وكتب جديدة للفهرس' },
      { id: 'books.edit', label: 'تعديل بيانات الكتب وبطاقات الفهرسة' },
      { id: 'books.delete', label: 'أرشفة واستبعاد العناوين' },
      { id: 'book_copies.view', label: 'عرض سجل النسخ الفعلية وأرقام التسجيل' },
      { id: 'book_copies.manage', label: 'توليد الباركود وتعيين الأرفف للنسخ' },
      { id: 'categories.manage', label: 'إدارة تصنيفات الكتب وشجرة ديوي' },
      { id: 'authors.manage', label: 'إدارة المؤلفين وبياناتهم وسيرهم' },
      { id: 'publishers.manage', label: 'إدارة دور النشر وجهات الإصدار' },
      { id: 'shelves.manage', label: 'إدارة الأرفف والمواقع وقاعات المكتبة' },
      { id: 'menu.view', label: 'استعراض الفهرس العام (قراءة)' },
      { id: 'menu.manage', label: 'إدارة الفهرس والتصنيفات' },
    ],
  },
  {
    id: 'members',
    label: 'الأعضاء والاشتراكات (Members & Patrons)',
    iconName: 'Users',
    permissions: [
      { id: 'members.view', label: 'استعراض سجلات وبيانات الأعضاء' },
      { id: 'members.create', label: 'تسجيل أعضاء جدد وإصدار بطاقات العضوية' },
      { id: 'members.edit', label: 'تعديل بيانات الأعضاء وخطط اشتراكهم' },
      { id: 'members.delete', label: 'أرشفة وحذف حسابات الأعضاء' },
      { id: 'members.suspend', label: 'حظر وتعليق العضويات المخالفة' },
      { id: 'membership_plans.manage', label: 'إدارة خطط وسياسات العضوية' },
      { id: 'customers.view', label: 'استعراض سجلات المستفيدين' },
      { id: 'customers.manage', label: 'إدارة سجلات المستفيدين' },
      { id: 'promotions.view', label: 'عرض خطط العضوية والخصومات' },
      { id: 'promotions.manage', label: 'إدارة باقات العضوية والامتيازات' },
    ],
  },
  {
    id: 'acquisitions',
    label: 'التزويد وتنمية المقتنيات (Acquisitions & Suppliers)',
    iconName: 'Truck',
    permissions: [
      { id: 'acquisitions.view', label: 'عرض أوامر وفواتير تزويد الكتب' },
      { id: 'acquisitions.create', label: 'إنشاء طلبات تزويد وشراء كتب جديدة' },
      { id: 'acquisitions.approve', label: 'اعتماد أوامر الشراء والموازنات' },
      { id: 'acquisitions.receive', label: 'استلام الشحنات وتوليد نسخ الكتب آلياً' },
      { id: 'purchasing.view', label: 'عرض سجلات المشتريات والتوريد' },
      { id: 'purchasing.manage', label: 'إنشاء وإدارة أوامر الشراء' },
      { id: 'purchasing.pay', label: 'تسجيل دفعات سداد الموردين والناشرين' },
      { id: 'suppliers.view', label: 'عرض قائمة الناشرين والموردين' },
      { id: 'suppliers.manage', label: 'إضافة وتعديل بيانات الناشرين والموردين' },
      { id: 'suppliers.pay', label: 'صرف مستحقات الموردين' },
    ],
  },
  {
    id: 'inventory',
    label: 'الجرد والمناقلات والتوالف (Inventory & Transfers)',
    iconName: 'PackageCheck',
    permissions: [
      { id: 'inventory.view', label: 'عرض أرصدة وحركات المقتنيات' },
      { id: 'inventory.add', label: 'إضافة خامات ومقتنيات جديدة' },
      { id: 'inventory.edit', label: 'تعديل بيانات المقتنيات' },
      { id: 'inventory.delete', label: 'استبعاد مقتنيات من العهدة' },
      { id: 'inventory.adjust', label: 'إجراء تسويات الجرد والمناقلات' },
      { id: 'inventory.audit', label: 'بدء واعتماد جلسات الجرد الإلكتروني للفرع' },
      { id: 'inventory.waste', label: 'إدارة الكتب التالفة والهالكة' },
      { id: 'transfers.manage', label: 'إدارة ومتابعة نقل الكتب بين الفروع' },
      { id: 'lost_damaged.manage', label: 'تسجيل الكتب المفقودة والتالفة والتعويضات' },
    ],
  },
  {
    id: 'operations',
    label: 'الموارد البشرية والتشغيل والورديات (HR & Operations)',
    iconName: 'UserCog',
    permissions: [
      { id: 'hr.manage_shifts', label: 'إدارة جدول وتوزيع ورديات العمل' },
      { id: 'hr.view_employees', label: 'استعراض سجلات الموظفين' },
      { id: 'hr.manage_employees', label: 'إضافة وتعديل بيانات الموظفين' },
      { id: 'attendance.view', label: 'عرض سجل الحضور والانصراف' },
      { id: 'attendance.manage', label: 'تسجيل حضور وانصراف يدوي' },
      { id: 'attendance.correct', label: 'تعديل واعتماد تصحيحات الحضور' },
      { id: 'leave.view', label: 'عرض طلبات وسجلات الإجازات' },
      { id: 'leave.create', label: 'تقديم وتسجيل إجازات للموظفين' },
      { id: 'leave.approve', label: 'اعتماد والموافقة على الإجازات' },
      { id: 'leave.reject', label: 'رفض طلبات الإجازات' },
      { id: 'leave.cancel', label: 'إلغاء الإجازات المعتمدة' },
      { id: 'leave.manage_balance', label: 'تعديل وإدارة رصيد الإجازات' },
      { id: 'tables.view', label: 'عرض قاعات ومقاعد القراءة' },
      { id: 'tables.manage', label: 'إدارة حجز مقاعد وقاعات البحث' },
      { id: 'callcenter.view', label: 'استخدام مكتب خدمة ودعم المستفيدين' },
      { id: 'delivery.view', label: 'متابعة خدمة التوصيل المنزلي للكتب' },
      { id: 'delivery.manage', label: 'إدارة وتوجيه إرساليات الكتب' },
      { id: 'kitchen.view', label: 'شاشة معالجة وتجهيز المقتنيات الواردة' },
      { id: 'kitchen.manage_orders', label: 'تحديث حالة تجهيز المقتنيات' },
      { id: 'production.view', label: 'شاشة التجليد والصيانة الفنية للكتب' },
      { id: 'production.manage', label: 'بدء وإتمام دفعات التجليد والصيانة' },
    ],
  },
  {
    id: 'finance',
    label: 'المالية والمرتبات والحسابات (Finance & Payroll)',
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
      { id: 'reports.view', label: 'استعراض تقارير المكتبة والإحصائيات' },
      { id: 'reports.sales', label: 'تحليل وتصدير تقارير التداول والإيرادات' },
      { id: 'reports.inventory', label: 'تصدير تقارير الجرد وعجز الكتب' },
      { id: 'daily_closing.view', label: 'عرض سجلات ومطابقة الإغلاق اليومي للخزينة' },
      { id: 'daily_closing.create', label: 'إجراء وحفظ إغلاق اليوم المالي' },
      { id: 'daily_closing.update', label: 'تعديل ومراجعة الإغلاق اليومي' },
      { id: 'daily_closing.void', label: 'إلغاء الإغلاق اليومي (Void)' },
    ],
  },
  {
    id: 'settings',
    label: 'إعدادات النظام والأمان (Settings & Security)',
    iconName: 'Settings',
    permissions: [
      { id: 'settings.view', label: 'عرض إعدادات الفروع وسياسات الإعارة' },
      { id: 'settings.manage', label: 'تعديل السياسات العامة وإعدادات الباركود' },
      { id: 'permissions.manage', label: 'إدارة المستخدمين والأدوار والصلاحيات' },
      { id: 'maintenance.view', label: 'عرض سجل صيانة الأجهزة والأثاث' },
      { id: 'maintenance.manage', label: 'إدارة طلبات صيانة ماسحات الباركود والأجهزة' },
      { id: 'integrations.view', label: 'إدارة منصات الربط وواجهات الـ API' },
      { id: 'audit.view', label: 'استعراض سجل التدقيق الأمني للعمليات' },
    ],
  },
  {
    id: 'backup',
    label: 'النسخ الاحتياطي واستعادة النظام (Backup & Recovery)',
    iconName: 'Database',
    permissions: [
      { id: 'backup.view', label: 'استعراض سجل وحالة النسخ الاحتياطية' },
      { id: 'backup.create', label: 'إنشاء نسخة احتياطية شاملة لقواعد البيانات' },
      { id: 'backup.download', label: 'تنزيل ملف النسخة الاحتياطية المشفر' },
      { id: 'backup.restore', label: 'تنفيذ استعادة بيانات المنشأة (صلاحية سيادية)' },
      { id: 'backup.delete', label: 'حذف ملفات النسخ الاحتياطية القديمة' },
    ],
  },
];

export const ALL_PERMISSION_IDS: string[] = PERMISSION_CATEGORIES.flatMap((c) =>
  c.permissions.map((p) => p.id)
);

export const ROLE_TEMPLATES: Record<string, RoleTemplate> = {
  owner: {
    key: 'owner',
    label: 'مالك المكتبة / المؤسسة (Library Owner)',
    description: 'كامل الصلاحيات والتحكم السيادي المطلق في المنشأة وكافة الفروع والفهارس',
    isSystem: true,
    permissions: ['*'],
  },
  admin: {
    key: 'admin',
    label: 'مدير عام النظام (Super Admin)',
    description: 'كامل الصلاحيات الإدارية والتشغيلية والفنية لكافة قطاعات المنظومة',
    isSystem: true,
    permissions: [...ALL_PERMISSION_IDS],
  },
  manager: {
    key: 'manager',
    label: 'مدير المكتبة / الفرع (Library Manager)',
    description: 'إدارة العمليات التشغيلية، الإعارات، الفهرسة، المقتنيات، الموظفين، والمصروفات اليومية',
    isSystem: true,
    permissions: [
      'dashboard.view',
      'circulation.view', 'pos.view', 'pos.create_order', 'pos.edit_order', 'pos.cancel_order',
      'pos.apply_discount', 'pos.refund', 'pos.open_drawer', 'pos.close_session',
      'loans.view', 'loans.checkout', 'loans.return', 'loans.renew',
      'orders.view', 'orders.manage',
      'holds.view', 'holds.manage',
      'fines.view', 'fines.collect', 'fines.waive',
      'books.view', 'books.create', 'books.edit', 'book_copies.view', 'book_copies.manage',
      'categories.manage', 'authors.manage', 'publishers.manage', 'shelves.manage',
      'members.view', 'members.create', 'members.edit', 'members.suspend',
      'customers.view', 'customers.manage',
      'promotions.view', 'promotions.manage',
      'acquisitions.view', 'acquisitions.create', 'acquisitions.receive',
      'purchasing.view', 'purchasing.manage', 'purchasing.pay',
      'suppliers.view', 'suppliers.manage', 'suppliers.pay',
      'inventory.view', 'inventory.add', 'inventory.edit', 'inventory.adjust', 'inventory.audit', 'inventory.waste',
      'transfers.manage', 'lost_damaged.manage',
      'hr.manage_shifts', 'hr.view_employees',
      'attendance.view', 'attendance.manage', 'attendance.correct',
      'leave.view', 'leave.create', 'leave.approve',
      'accounting.view', 'expenses.view', 'expenses.manage',
      'financial_dashboard.view', 'daily_closing.view', 'daily_closing.create', 'daily_closing.update',
      'reports.view', 'reports.sales', 'reports.inventory',
      'maintenance.view', 'maintenance.manage',
      'callcenter.view',
      'tables.view', 'tables.manage',
      'delivery.view', 'delivery.manage',
      'menu.view', 'menu.manage',
      'kitchen.view', 'kitchen.manage_orders',
      'production.view', 'production.manage',
    ],
  },
  librarian: {
    key: 'librarian',
    label: 'أمين المكتبة الرئيسي (Chief Librarian)',
    description: 'مسؤول الفهرسة الشاملة، إدارة مكتب الإعارة، خدمة المستفيدين، وتنمية المقتنيات',
    isSystem: true,
    permissions: [
      'dashboard.view',
      'circulation.view', 'pos.view', 'pos.create_order', 'pos.edit_order',
      'loans.view', 'loans.checkout', 'loans.return', 'loans.renew',
      'orders.view',
      'holds.view', 'holds.manage',
      'fines.view', 'fines.collect',
      'books.view', 'books.create', 'books.edit', 'book_copies.view', 'book_copies.manage',
      'categories.manage', 'authors.manage', 'publishers.manage', 'shelves.manage',
      'members.view', 'members.create', 'members.edit',
      'customers.view', 'customers.manage',
      'acquisitions.view', 'acquisitions.create', 'acquisitions.receive',
      'purchasing.view', 'purchasing.manage',
      'suppliers.view',
      'inventory.view', 'inventory.audit', 'transfers.manage', 'lost_damaged.manage',
      'reports.view', 'reports.sales', 'reports.inventory',
    ],
  },
  circulation_staff: {
    key: 'circulation_staff',
    label: 'موظف الإعارة والتداول (Circulation Desk Staff)',
    description: 'تسجيل الإعارات والمرتجعات، مسح بطاقات الأعضاء، وتجديد الكتب وتحصيل الغرامات',
    isSystem: true,
    permissions: [
      'dashboard.view',
      'circulation.view', 'pos.view', 'pos.create_order',
      'loans.view', 'loans.checkout', 'loans.return', 'loans.renew',
      'orders.view',
      'holds.view',
      'fines.view', 'fines.collect',
      'books.view', 'book_copies.view',
      'members.view', 'members.create',
      'customers.view', 'customers.manage',
    ],
  },
  cashier: {
    key: 'cashier',
    label: 'الكاشير / الإعارة (Cashier / Circulation)',
    description: 'خدمة المستعيرين وتسجيل خروج الكتب وتحصيل رسوم الاشتراكات والغرامات',
    isSystem: true,
    permissions: [
      'dashboard.view',
      'pos.view', 'pos.create_order', 'pos.edit_order', 'pos.apply_discount', 'pos.open_drawer', 'pos.close_session',
      'circulation.view',
      'loans.view', 'loans.checkout', 'loans.return', 'loans.renew',
      'orders.view',
      'customers.view', 'customers.manage',
      'members.view', 'members.create',
      'fines.view', 'fines.collect',
      'promotions.view',
      'callcenter.view',
      'delivery.view',
    ],
  },
  cataloger: {
    key: 'cataloger',
    label: 'مفهرس الكتب (Cataloger / Processing)',
    description: 'إدخال بطاقات الكتب، توليد أرقام التسجيل والباركود، وتصنيف الأرفف والمؤلفين',
    isSystem: true,
    permissions: [
      'dashboard.view',
      'books.view', 'books.create', 'books.edit', 'book_copies.view', 'book_copies.manage',
      'categories.manage', 'authors.manage', 'publishers.manage', 'shelves.manage',
      'acquisitions.view', 'acquisitions.receive',
      'inventory.view',
    ],
  },
  inventory: {
    key: 'inventory',
    label: 'مسؤول الجرد والمستودع (Inventory & Stock)',
    description: 'جلسات جرد الأرفف، تسجيل التوالف والمفقودات، استلام شحنات الكتب، والمناقلات بين الفروع',
    isSystem: true,
    permissions: [
      'dashboard.view',
      'inventory.view', 'inventory.add', 'inventory.edit', 'inventory.adjust', 'inventory.audit', 'inventory.waste',
      'transfers.manage', 'lost_damaged.manage',
      'purchasing.view', 'purchasing.manage',
      'acquisitions.view', 'acquisitions.receive',
      'suppliers.view', 'suppliers.manage',
      'reports.inventory',
    ],
  },
  accountant: {
    key: 'accountant',
    label: 'المحاسب المالي (Accountant)',
    description: 'إدارة الدفاتر المحاسبية، الرواتب، المصروفات، سداد الموردين والناشرين، والإغلاق اليومي',
    isSystem: true,
    permissions: [
      'dashboard.view',
      'orders.view',
      'loans.view',
      'fines.view', 'fines.collect',
      'accounting.view',
      'expenses.view', 'expenses.manage', 'expenses.delete',
      'payroll.view', 'payroll.pay', 'payroll.void',
      'advances.view', 'advances.manage',
      'purchasing.view', 'purchasing.pay',
      'acquisitions.view',
      'suppliers.view', 'suppliers.pay',
      'financial_dashboard.view', 'daily_closing.view', 'daily_closing.create', 'daily_closing.update',
      'reports.view', 'reports.sales', 'reports.inventory',
      'audit.view',
    ],
  },
  hr: {
    key: 'hr',
    label: 'مسؤول الموارد البشرية (HR Manager)',
    description: 'إدارة شؤون الموظفين، الحضور والانصراف، جدول الورديات، الإجازات، والسلف والمرتبات',
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
  viewer: {
    key: 'viewer',
    label: 'مشاهد فقط (Viewer / Read-Only)',
    description: 'استعراض الفهرس والتقارير العامة بدون صلاحيات تعديل أو إنشاء',
    isSystem: true,
    permissions: [
      'dashboard.view',
      'books.view',
      'book_copies.view',
      'loans.view',
      'orders.view',
      'menu.view',
      'inventory.view',
      'reports.view',
      'tables.view',
    ],
  },
};

export function calculateEffectivePermissions(
  roleKey: string,
  customOverrides?: { granted?: string[]; revoked?: string[] }
): string[] {
  if (roleKey === 'owner' || roleKey === 'super_admin') {
    return ['*'];
  }

  const template = ROLE_TEMPLATES[roleKey];
  const basePerms = new Set<string>(template ? template.permissions : []);

  if (customOverrides?.granted) {
    for (const p of customOverrides.granted) {
      basePerms.add(p);
    }
  }

  if (customOverrides?.revoked) {
    for (const p of customOverrides.revoked) {
      basePerms.delete(p);
    }
  }

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
