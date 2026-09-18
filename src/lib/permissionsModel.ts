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
    id: 'products',
    label: 'فهرس المنتجات والأدوات والكتب',
    iconName: 'BookOpen',
    permissions: [
      { id: 'products.view', label: 'استعراض فهرس المنتجات والكتب والأدوات' },
      { id: 'products.create', label: 'إضافة منتجات وأصناف وكتب جديدة' },
      { id: 'products.edit', label: 'تعديل بيانات المنتجات والأسعار والباركود' },
      { id: 'products.delete', label: 'حذف المنتجات غير المرتبطة بعمليات سابقة' },
      { id: 'products.archive', label: 'أرشفة وتعطيل الأصناف مع الاحتفاظ بالسجل التاريخي' },
      { id: 'categories.manage', label: 'إدارة التصنيفات الرئيسية والفرعية' },
      { id: 'brands.manage', label: 'إدارة العلامات التجارية ودور النشر' },
      { id: 'units.manage', label: 'إدارة وحدات القياس ومعاملات التحويل' },
    ],
  },
  {
    id: 'sales',
    label: 'المبيعات ونقاط البيع (POS)',
    iconName: 'ShoppingCart',
    permissions: [
      { id: 'pos.view', label: 'استخدام شاشة نقطة البيع' },
      { id: 'pos.access', label: 'الوصول إلى نقطة البيع السريعة' },
      { id: 'pos.create_order', label: 'إصدار فواتير بيع جديدة' },
      { id: 'pos.edit_order', label: 'تعديل المبيعات الجارية' },
      { id: 'pos.cancel_order', label: 'إلغاء المبيعات' },
      { id: 'pos.apply_discount', label: 'تطبيق الخصومات وقسائم الشراء' },
      { id: 'pos.refund', label: 'إجراء عمليات المرتجع والاستبدال' },
      { id: 'pos.open_drawer', label: 'فتح درج الكاشير نقدياً' },
      { id: 'pos.close_session', label: 'إغلاق وردية / جلسة الكاشير' },
      { id: 'pos.override_price', label: 'تعديل سعر البيع يدوياً' },
      { id: 'orders.view', label: 'عرض سجل الفواتير والمبيعات' },
      { id: 'orders.manage', label: 'إدارة وتعديل الفواتير السابقة' },
      { id: 'sales.view', label: 'استعراض حركات وفواتير المبيعات' },
      { id: 'sales.create', label: 'إنشاء عملية بيع تجزئة أو جملة' },
      { id: 'sales.cancel', label: 'إلغاء فواتير المبيعات' },
      { id: 'sales.refund', label: 'اعتماد مرتجعات المبيعات' },
      { id: 'sales.discount', label: 'منح خصومات استثنائية' },
      { id: 'sales.override_price', label: 'تعديل أسعار البيع في نقطة البيع' },
      { id: 'sales.wholesale', label: 'إصدار فواتير بيع بسعر الجملة' },
      { id: 'sales.sell_below_minimum', label: 'تجاوز والبيع تحت الحد الأدنى للسعر' },
      { id: 'sales.reprint_receipt', label: 'إعادة طباعة إيصالات المبيعات الحرارية' },
      { id: 'cash_register.open', label: 'فتح وردية وتسجيل عهدة الكاشير' },
      { id: 'cash_register.close', label: 'إغلاق وردية الكاشير واعتماد جرد الدرج' },
      { id: 'customer.create_from_pos', label: 'إضافة عميل جديد مباشرة من نقطة البيع' },
      { id: 'promotions.view', label: 'عرض العروض وقسائم الخصم' },
      { id: 'promotions.manage', label: 'إنشاء وتعديل العروض الترويجية والخصومات' },
    ],
  },
  {
    id: 'customers',
    label: 'العملاء والبيع الآجل وقوائم الأسعار',
    iconName: 'Users',
    permissions: [
      { id: 'customers.view', label: 'استعراض بيانات العملاء وأرصدتهم' },
      { id: 'customers.create', label: 'إضافة عملاء جدد وتحديد نوعهم' },
      { id: 'customers.edit', label: 'تعديل بيانات العملاء والتصنيف' },
      { id: 'customers.delete', label: 'حذف العملاء غير المرتبطين بعمليات' },
      { id: 'customers.archive', label: 'أرشفة وتعطيل حسابات العملاء' },
      { id: 'customers.accounts.view', label: 'كشف حساب العميل والمطابقة وسجل الحركات' },
      { id: 'customers.credit.manage', label: 'إدارة وتعديل السقف الائتماني وفترات السداد' },
      { id: 'customers.credit_override', label: 'تجاوز الحد الائتماني والبيع لعميل متأخر' },
      { id: 'customers.payment.create', label: 'تسجيل وقبض دفعات وحسابات العملاء' },
      { id: 'customers.payment.reverse', label: 'إلغاء وعكس سندات قبض العملاء' },
      { id: 'customers.adjust_balance', label: 'تسوية وتعديل رصيد حساب العميل استثنائياً' },
      { id: 'price_lists.view', label: 'عرض قوائم أسعار الجملة والمدارس والشركات' },
      { id: 'price_lists.manage', label: 'إنشاء وتعديل وتعيين قوائم الأسعار' },
      { id: 'receivables.view', label: 'عرض تقارير أعمار الديون والمستحقات والتحصيل' },
      { id: 'receivables.manage', label: 'متابعة وإدارة ديون العملاء وجدولة السداد' },
      { id: 'sales.credit', label: 'إصدار فواتير بيع بالآجل (Credit Sale)' },
      { id: 'sales.customer_credit', label: 'سداد الفواتير من الرصيد الدائن / مقدم العميل' },
    ],
  },
  {
    id: 'returns',
    label: 'المرتجعات والاستبدال والاسترداد',
    iconName: 'RotateCcw',
    permissions: [
      { id: 'returns.view', label: 'استعراض سجل فواتير المرتجعات والاستبدال' },
      { id: 'returns.create', label: 'إنشاء عملية إرجاع أو استبدال مبيعات' },
      { id: 'returns.refund', label: 'اعتماد وصرف المبالغ المستردة للعملاء' },
      { id: 'returns.exchange', label: 'إجراء عمليات الاستبدال وإصدار الفواتير البديلة' },
      { id: 'returns.override_policy', label: 'تجاوز سياسة المرتجعات (فترة الإرجاع والموافقات)' },
      { id: 'returns.cross_branch', label: 'قبول ومعالجة مرتجعات من فروع أخرى' },
      { id: 'returns.damaged_accept', label: 'استلام مرتجعات تالفة وتوجيهها لسجل الهالك' },
      { id: 'returns.cancel', label: 'إلغاء عمليات المرتجع المسجلة' },
      { id: 'refunds.manual_method', label: 'تحديد وتغيير طريقة رد المبلغ يدوياً' },
    ],
  },
  {
    id: 'inventory',
    label: 'المخزون والجرد والمناقلات',
    iconName: 'Package',
    permissions: [
      { id: 'inventory.view', label: 'عرض أرصدة وحركات المخزون والحدود الدنيا' },
      { id: 'inventory.add', label: 'إضافة أرصدة وأصناف للمستودع' },
      { id: 'inventory.edit', label: 'تعديل بيانات وأرصدة المخزن' },
      { id: 'inventory.delete', label: 'حذف أرصدة مخزنية' },
      { id: 'inventory.adjust', label: 'إجراء تسويات الجرد اليدوية' },
      { id: 'inventory.opening_balance', label: 'تسجيل الرصيد الافتتاحي للمنتجات والمخازن' },
      { id: 'inventory.count', label: 'إجراء جلسات الجرد الفعلي (Stocktake)' },
      { id: 'inventory.count.post', label: 'ترحيل واعتماد فروق الجرد الفعلي للمخزون' },
      { id: 'inventory.waste', label: 'تسجيل التوالف والهالك والتالف المدرسي' },
      { id: 'inventory.damage', label: 'تسجيل واعتماد التوالف والهالك والمفقودات' },
      { id: 'transfers.view', label: 'عرض مناقلات البضائع بين الفروع' },
      { id: 'transfers.create', label: 'إنشاء وإرسال مناقلة بضاعة لفرع آخر' },
      { id: 'transfers.approve', label: 'الموافقة على طلبات المناقلة' },
      { id: 'transfers.dispatch', label: 'شحن وإرسال بضاعة المناقلات بين المخازن' },
      { id: 'transfers.receive', label: 'استلام وفحص بضاعة المناقلة الواردة' },
    ],
  },
  {
    id: 'purchases',
    label: 'المشتريات والتوريد والموردين',
    iconName: 'Truck',
    permissions: [
      { id: 'suppliers.view', label: 'عرض قائمة الموردين ودور النشر وأرصدتهم' },
      { id: 'suppliers.create', label: 'إضافة موردين ودور نشر جديدة' },
      { id: 'suppliers.edit', label: 'تعديل بيانات وشروط دفع الموردين' },
      { id: 'suppliers.manage', label: 'إدارة شاملة لبيانات الموردين' },
      { id: 'suppliers.archive', label: 'أرشفة وتعطيل حسابات الموردين' },
      { id: 'supplier_accounts.view', label: 'كشف حساب المورد والمطابقة وسجل الحركات' },
      { id: 'suppliers.pay', label: 'تسجيل دفعات الحساب للموردين والناشرين' },
      { id: 'supplier_payments.create', label: 'تسجيل وإصدار سندات سداد ودفعات للمورد' },
      { id: 'supplier_payments.override', label: 'تجاوز سقف السداد أو الدفع مقدماً بدون رصيد' },
      { id: 'purchasing.view', label: 'عرض أوامر الشراء وفواتير الموردين' },
      { id: 'purchasing.manage', label: 'إنشاء وتعديل أوامر الشراء' },
      { id: 'purchasing.pay', label: 'تسجيل دفعات وسداد فواتير المشتريات' },
      { id: 'purchases.view', label: 'عرض فواتير وأوامر الشراء والتوريد' },
      { id: 'purchases.create', label: 'إنشاء مسودة أمر شراء جديد' },
      { id: 'purchases.edit', label: 'تعديل مسودات أوامر الشراء' },
      { id: 'purchases.submit', label: 'إرسال أمر الشراء للاعتماد' },
      { id: 'purchases.approve', label: 'اعتماد أوامر الشراء والتعميد' },
      { id: 'purchases.receive', label: 'فحص واستلام البضاعة وإصدار إذن الاستلام (GRN)' },
      { id: 'purchases.cancel', label: 'إلغاء أمر الشراء غير المستلم' },
      { id: 'purchase_returns.view', label: 'استعراض سجل مرتجعات المشتريات للموردين' },
      { id: 'purchase_returns.create', label: 'إنشاء إذن إرجاع بضاعة لمورد أو دار نشر' },
      { id: 'purchase_returns.approve', label: 'اعتماد وصرف مرتجع المشتريات مخزنياً ومالياً' },
    ],
  },
  {
    id: 'finance',
    label: 'المالية والمصروفات والتقارير',
    iconName: 'BarChart3',
    permissions: [
      { id: 'accounting.view', label: 'عرض دفاتر الحسابات وشجرة الحسابات والقيود اليومية' },
      { id: 'accounting.manage_chart', label: 'إدارة وتعديل وإضافة حسابات شجرة الحسابات' },
      { id: 'accounting.create_entry', label: 'إنشاء وترحيل قيود اليومية اليدوية' },
      { id: 'accounting.reverse_entry', label: 'عكس القيود المحاسبية المرحلة' },
      { id: 'accounting.manage_periods', label: 'إدارة الفترات والسنوات المالية والإقفال الشهري والسنوي' },
      { id: 'accounting.reconcile', label: 'إجراء مطابقات الأستاذ العام مع دفاتر العملاء والموردين والمخزون' },
      { id: 'accounting.opening_balances', label: 'تسجيل واعتماد الأرصدة الافتتاحية وترحيلها' },
      { id: 'financial_reports.view', label: 'استعراض القوائم المالية (ميزان المراجعة، قائمة الدخل، الميزانية العمومية، التدفقات)' },
      { id: 'treasury.view', label: 'استعراض حسابات الخزائن والأدراج النقدية' },
      { id: 'treasury.manage', label: 'التحويل بين الخزائن وحسابات النقدية' },
      { id: 'bank_accounts.manage', label: 'إدارة ومطابقة الحسابات البنكية ومقاصة البطاقات' },
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
      { id: 'reports.inventory', label: 'تصدير تقارير حركة وتقييم المخزون والراكد' },
      { id: 'financial_dashboard.view', label: 'عرض اللوحة المالية والتنفيذية' },
      { id: 'daily_closing.view', label: 'عرض سجلات ومطابقة الإغلاق اليومي' },
      { id: 'daily_closing.create', label: 'إجراء وحفظ إغلاق اليوم المالي' },
      { id: 'daily_closing.update', label: 'تعديل أو مراجعة الإغلاق اليومي' },
      { id: 'daily_closing.void', label: 'إلغاء الإغلاق اليومي (Void)' },
    ],
  },
  {
    id: 'analytics_bi',
    label: 'ذكاء الأعمال والتحليلات المتقدمة (BI)',
    iconName: 'TrendingUp',
    permissions: [
      { id: 'analytics.view', label: 'استعراض لوحات ذكاء الأعمال والتقارير التنفيذية' },
      { id: 'analytics.export', label: 'تصدير التقارير والبيانات التحليلية (Excel/CSV)' },
      { id: 'analytics.view_costs', label: 'الاطلاع على التكاليف وهوامش الربح الحساسة (فك الحجب)' },
      { id: 'analytics.demand_reorder', label: 'محرك ذكاء الطلب واقتراحات إعادة التوريد الذكية' },
      { id: 'analytics.partner_intelligence', label: 'تحليلات الموردين وتصنيف العملاء السلوكي (RFM)' },
      { id: 'analytics.rebuild_aggregates', label: 'إعادة بناء واحتساب المجاميع الإحصائية اليومية' },
    ],
  },
  {
    id: 'hr',
    label: 'الموارد البشرية وشؤون الموظفين',
    iconName: 'Users',
    permissions: [
      { id: 'hr.view_employees', label: 'استعراض سجلات الموظفين' },
      { id: 'hr.manage_employees', label: 'إضافة وتعديل بيانات الموظفين وعقودهم' },
      { id: 'hr.manage_shifts', label: 'إدارة جدول وتوزيع الورديات' },
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
    id: 'operations_legacy',
    label: 'العمليات والخدمات العامة',
    iconName: 'CalendarDays',
    permissions: [
      { id: 'tables.view', label: 'عرض شاشة الصالة (توافق سابق)' },
      { id: 'tables.manage', label: 'إدارة الحجوزات (توافق سابق)' },
      { id: 'callcenter.view', label: 'مركز الاتصال (توافق سابق)' },
      { id: 'delivery.view', label: 'شاشة التوصيل (توافق سابق)' },
      { id: 'delivery.manage', label: 'إدارة التوصيل (توافق سابق)' },
      { id: 'kitchen.view', label: 'عرض المطبخ (توافق سابق)' },
      { id: 'kitchen.manage_orders', label: 'إدارة طلبات المطبخ (توافق سابق)' },
      { id: 'production.view', label: 'عرض الإنتاج (توافق سابق)' },
      { id: 'production.manage', label: 'إدارة الإنتاج (توافق سابق)' },
      { id: 'menu.view', label: 'عرض القائمة القديمة (توافق سابق)' },
      { id: 'menu.manage', label: 'إدارة القائمة القديمة (توافق سابق)' },
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
  {
    id: 'governance',
    label: 'الحوكمة وإدارة البيانات وسلامة النظام',
    iconName: 'ShieldCheck',
    permissions: [
      { id: 'governance.view', label: 'عرض شاشات ومؤشرات الحوكمة' },
      { id: 'approvals.view', label: 'استعراض طلبات وسجلات وسلسلة الموافقات' },
      { id: 'approvals.action', label: 'الموافقة أو رفض أو طلب تصحيح العمليات الحساسة' },
      { id: 'approvals.manage_policy', label: 'إعداد سياسات وسلاسل الموافقات وسقوف المبالغ' },
      { id: 'datacenter.view', label: 'استعراض مركز استيراد وتصدير البيانات' },
      { id: 'datacenter.import', label: 'تنفيذ عمليات استيراد المنتجات والعملاء والموردين' },
      { id: 'datacenter.export', label: 'تصدير بيانات الكتالوج والأرصدة والشركاء' },
      { id: 'system_health.view', label: 'استعراض لوحة سلامة النظام والفحوصات التشخيصية' },
      { id: 'system_health.repair', label: 'إجراء عمليات الإصلاح وإعادة المحاولة للعمليات المعلقة' },
      { id: 'attachments.manage', label: 'رفع وإدارة المستندات والمرفقات الرسمية' },
      { id: 'feature_flags.manage', label: 'إدارة وتفعيل رايات الميزات الإضافية (Feature Flags)' },
      { id: 'settings_audit.view', label: 'استعراض سجل تدقيق تغييرات الإعدادات الحساسة' },
    ],
  },
];

export const ALL_PERMISSION_IDS: string[] = Array.from(
  new Set(PERMISSION_CATEGORIES.flatMap((c) => c.permissions.map((p) => p.id)))
);

export const ROLE_TEMPLATES: Record<string, RoleTemplate> = {
  owner: {
    key: 'owner',
    label: 'المالك (Owner)',
    description: 'كامل الصلاحيات والتحكم التام والسيادي في المنشأة وكافة الفروع',
    isSystem: true,
    permissions: ['*'],
  },
  super_admin: {
    key: 'super_admin',
    label: 'المدير العام الأعلى (Super Admin)',
    description: 'تحكم سيادي كامل في كافة الفروع والتنظيم الإداري والمالي',
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
    label: 'مدير التشغيل / الفرع (Branch Manager)',
    description: 'إدارة العمليات اليومية، المبيعات، المخزون، المشتريات، الموظفين، والمصروفات',
    isSystem: true,
    permissions: [
      'dashboard.view',
      'products.view', 'products.create', 'products.edit', 'categories.manage', 'brands.manage', 'units.manage',
      'pos.view', 'pos.create_order', 'pos.edit_order', 'pos.cancel_order', 'pos.apply_discount', 'pos.refund', 'pos.open_drawer', 'pos.close_session',
      'orders.view', 'orders.manage',
      'sales.view', 'sales.create', 'sales.refund', 'sales.discount', 'sales.wholesale', 'sales.credit', 'sales.customer_credit',
      'returns.view', 'returns.create', 'returns.refund', 'returns.exchange', 'returns.override_policy', 'returns.cross_branch', 'returns.damaged_accept', 'returns.cancel', 'refunds.manual_method',
      'customers.view', 'customers.manage', 'customers.create', 'customers.edit', 'customers.archive', 'customers.accounts.view', 'customers.credit.manage', 'customers.credit_override', 'customers.payment.create', 'customers.payment.reverse', 'customers.adjust_balance',
      'price_lists.view', 'price_lists.manage',
      'receivables.view', 'receivables.manage',
      'promotions.view', 'promotions.manage',
      'inventory.view', 'inventory.add', 'inventory.edit', 'inventory.adjust', 'inventory.opening_balance', 'inventory.count', 'inventory.count.post', 'inventory.waste', 'inventory.damage',
      'transfers.view', 'transfers.create', 'transfers.approve', 'transfers.dispatch', 'transfers.receive',
      'purchasing.view', 'purchasing.manage', 'purchasing.pay',
      'purchases.view', 'purchases.create', 'purchases.edit', 'purchases.submit', 'purchases.approve', 'purchases.receive', 'purchases.cancel',
      'purchase_returns.view', 'purchase_returns.create', 'purchase_returns.approve',
      'suppliers.view', 'suppliers.create', 'suppliers.edit', 'suppliers.manage', 'suppliers.archive', 'suppliers.pay', 'supplier_accounts.view', 'supplier_payments.create',
      'hr.manage_shifts', 'hr.view_employees',
      'attendance.view', 'attendance.manage', 'attendance.correct',
      'leave.view', 'leave.create', 'leave.approve',
      'accounting.view', 'accounting.create_entry', 'accounting.reconcile', 'financial_reports.view', 'treasury.view', 'treasury.manage', 'bank_accounts.manage', 'expenses.view', 'expenses.manage',
      'financial_dashboard.view', 'daily_closing.view', 'daily_closing.create', 'daily_closing.update',
      'reports.view', 'reports.sales', 'reports.inventory',
      'analytics.view', 'analytics.export', 'analytics.view_costs', 'analytics.demand_reorder', 'analytics.partner_intelligence',
      'maintenance.view', 'maintenance.manage',
      'governance.view', 'approvals.view', 'approvals.action', 'datacenter.view', 'datacenter.export', 'system_health.view', 'attachments.manage',
      // Legacy compatibility
      'kitchen.view', 'kitchen.manage_orders', 'production.view', 'production.manage', 'menu.view', 'menu.manage', 'tables.view', 'tables.manage', 'callcenter.view', 'delivery.view', 'delivery.manage',
    ],
  },
  cashier: {
    key: 'cashier',
    label: 'الكاشير ومبيعات التجزئة (Cashier / Retail Staff)',
    description: 'استقبال العملاء، الباركود، إصدار الفواتير، مرتجعات المبيعات، وقبض المبالغ',
    isSystem: true,
    permissions: [
      'dashboard.view',
      'products.view',
      'pos.view', 'pos.access', 'pos.create_order', 'pos.edit_order', 'pos.apply_discount', 'pos.open_drawer', 'pos.close_session',
      'orders.view',
      'sales.view', 'sales.create', 'sales.reprint_receipt', 'sales.wholesale', 'sales.credit', 'sales.customer_credit',
      'returns.view', 'returns.create', 'returns.refund', 'returns.exchange',
      'cash_register.open', 'cash_register.close',
      'customers.view', 'customers.manage', 'customer.create_from_pos', 'customers.create', 'customers.payment.create',
      'price_lists.view',
      'promotions.view',
      // Legacy compatibility
      'tables.view', 'callcenter.view', 'delivery.view',
    ],
  },
  sales_staff: {
    key: 'sales_staff',
    label: 'موظف مبيعات وصالة (Sales Staff)',
    description: 'البحث في الفهرس ومساعدة الزبائن وإنشاء المبيعات بدون صلاحية الخصم أو تعديل السعر',
    isSystem: true,
    permissions: [
      'dashboard.view',
      'products.view',
      'pos.view', 'pos.create_order',
      'orders.view',
      'sales.view', 'sales.create',
      'customers.view',
      'promotions.view',
    ],
  },
  inventory: {
    key: 'inventory',
    label: 'مسؤول المخزن والجرد (Inventory Manager)',
    description: 'استلام وتخزين الأدوات والكتب، تسويات الجرد، المناقلات بين الفروع، والهالك',
    isSystem: true,
    permissions: [
      'dashboard.view',
      'products.view', 'products.create', 'products.edit', 'categories.manage', 'brands.manage', 'units.manage',
      'inventory.view', 'inventory.add', 'inventory.edit', 'inventory.adjust', 'inventory.opening_balance', 'inventory.count', 'inventory.count.post', 'inventory.waste', 'inventory.damage',
      'transfers.view', 'transfers.create', 'transfers.approve', 'transfers.dispatch', 'transfers.receive',
      'purchasing.view', 'purchasing.manage',
      'purchases.view', 'purchases.create', 'purchases.edit', 'purchases.receive',
      'purchase_returns.view', 'purchase_returns.create',
      'suppliers.view', 'suppliers.manage',
      'reports.inventory',
    ],
  },
  purchasing_manager: {
    key: 'purchasing_manager',
    label: 'مدير المشتريات والتوريد (Purchasing Manager)',
    description: 'إصدار أوامر الشراء لدور النشر ومصانع الأدوات المكتبية، ومتابعة الاستلام وسداد الموردين',
    isSystem: true,
    permissions: [
      'dashboard.view',
      'products.view',
      'purchasing.view', 'purchasing.manage', 'purchasing.pay',
      'purchases.view', 'purchases.create', 'purchases.edit', 'purchases.submit', 'purchases.approve', 'purchases.receive', 'purchases.cancel',
      'purchase_returns.view', 'purchase_returns.create', 'purchase_returns.approve',
      'suppliers.view', 'suppliers.create', 'suppliers.edit', 'suppliers.manage', 'suppliers.archive', 'suppliers.pay', 'supplier_accounts.view', 'supplier_payments.create', 'supplier_payments.override',
      'inventory.view',
      'reports.inventory',
    ],
  },
  accountant: {
    key: 'accountant',
    label: 'المحاسب المالي (Accountant)',
    description: 'إدارة الدفاتر المحاسبية، القيود، شجرة الحسابات، القوائم المالية، الرواتب، المصروفات، والتقارير المالية',
    isSystem: true,
    permissions: [
      'dashboard.view',
      'orders.view',
      'sales.view',
      'accounting.view', 'accounting.manage_chart', 'accounting.create_entry', 'accounting.reverse_entry', 'accounting.manage_periods', 'accounting.reconcile', 'accounting.opening_balances',
      'financial_reports.view', 'treasury.view', 'treasury.manage', 'bank_accounts.manage',
      'expenses.view', 'expenses.manage', 'expenses.delete',
      'payroll.view', 'payroll.pay', 'payroll.void',
      'advances.view', 'advances.manage',
      'purchasing.view', 'purchasing.pay',
      'purchases.view',
      'purchase_returns.view',
      'suppliers.view', 'suppliers.pay', 'supplier_accounts.view', 'supplier_payments.create',
      'customers.view', 'customers.accounts.view', 'customers.payment.create', 'customers.payment.reverse', 'customers.adjust_balance', 'receivables.view', 'receivables.manage', 'price_lists.view',
      'financial_dashboard.view', 'daily_closing.view', 'daily_closing.create', 'daily_closing.update',
      'reports.view', 'reports.sales', 'reports.inventory',
      'analytics.view', 'analytics.export', 'analytics.view_costs',
      'governance.view', 'approvals.view', 'datacenter.view', 'datacenter.export', 'system_health.view', 'attachments.manage',
      'audit.view',
    ],
  },
  hr: {
    key: 'hr',
    label: 'مسؤول الموارد البشرية (HR Manager)',
    description: 'إدارة ملفات الموظفين، الحضور والانصراف، جدول الورديات، الإجازات، والسلف وكشوف المرتبات',
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
  kitchen: {
    key: 'kitchen',
    label: 'المطبخ والإنتاج (Kitchen - Legacy)',
    description: 'شاشة المطبخ والإنتاج السابقة (قيد الإحلال التدريجي)',
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
      'products.view',
      'orders.view',
      'sales.view',
      'inventory.view',
      'reports.view',
      // Legacy compatibility
      'menu.view', 'tables.view',
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
