import { useState, useMemo } from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import {
  LayoutDashboard, ShoppingCart, Package, Users, Compass,
  Search, X, Sun, Moon, LogOut, Receipt, Percent,
  Trash2, Truck, Clock, UserCog, BarChart3, Calculator,
  Settings, Shield, Wrench, Puzzle, FileText, BookOpen,
  TrendingUp, Database, RotateCcw, CreditCard, CheckSquare,
  FileSpreadsheet, Activity
} from 'lucide-react';
import { useUserPermissions } from '@/hooks/usePermissions';
import { useTheme } from '@/hooks/useTheme';
import { useAuth } from '@/hooks/useAuth';
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetDescription } from '@/components/ui/sheet';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';

export interface NavModule {
  path: string;
  label: string;
  icon: any;
  perms: string[];
  category: string;
  badge?: string;
}

export const allAppModules: NavModule[] = [
  // المبيعات والعملاء
  { path: '/pos', label: 'نقاط البيع (POS)', icon: ShoppingCart, perms: ['pos.view'], category: 'المبيعات والعملاء' },
  { path: '/orders-history', label: 'سجل فواتير المبيعات', icon: Receipt, perms: ['pos.view', 'sales.view'], category: 'المبيعات والعملاء' },
  { path: '/returns', label: 'مرتجعات واستبدال المبيعات', icon: RotateCcw, perms: ['returns.view', 'sales.view', 'pos.view'], category: 'المبيعات والعملاء' },
  { path: '/customers', label: 'العملاء والاشتراكات', icon: Users, perms: ['customers.view'], category: 'المبيعات والعملاء' },
  { path: '/receivables', label: 'الآجل والمديونيات', icon: CreditCard, perms: ['customers.view'], category: 'المبيعات والعملاء' },
  { path: '/promotions', label: 'العروض والخصومات', icon: Percent, perms: ['promotions.view'], category: 'المبيعات والعملاء' },

  // المنتجات والكتالوج
  { path: '/products', label: 'فهرس المنتجات والكتب', icon: BookOpen, perms: ['products.view', 'menu.view'], category: 'المنتجات والكتالوج' },

  // المخزون والتوريد
  { path: '/inventory', label: 'إدارة المخزون', icon: Package, perms: ['inventory.view'], category: 'المخزون والتوريد' },
  { path: '/purchasing', label: 'المشتريات والتوريد', icon: Truck, perms: ['purchasing.view'], category: 'المخزون والتوريد' },
  { path: '/suppliers', label: 'الموردين والناشرين', icon: Users, perms: ['suppliers.view'], category: 'المخزون والتوريد' },
  { path: '/waste', label: 'الهالك والتوالف', icon: Trash2, perms: ['inventory.waste'], category: 'المخزون والتوريد' },

  // الموارد البشرية والحوكمة
  { path: '/shifts', label: 'إدارة الورديات', icon: Clock, perms: ['hr.manage_shifts'], category: 'الموارد البشرية والحوكمة' },
  { path: '/hr', label: 'الموارد البشرية والموظفين', icon: UserCog, perms: ['hr.view_employees'], category: 'الموارد البشرية والحوكمة' },
  { path: '/approvals', label: 'مركز الموافقات', icon: CheckSquare, perms: ['approvals.view', 'governance.view'], category: 'الموارد البشرية والحوكمة' },
  { path: '/datacenter', label: 'مركز البيانات والاستيراد', icon: FileSpreadsheet, perms: ['datacenter.view', 'settings.manage'], category: 'الموارد البشرية والحوكمة' },
  { path: '/system-health', label: 'سلامة النظام والصيانة', icon: Activity, perms: ['system_health.view', 'settings.manage', 'accounting.view'], category: 'الموارد البشرية والحوكمة' },

  // المالية والتقارير
  { path: '/executive', label: 'اللوحة المالية والإغلاق', icon: TrendingUp, perms: ['financial_dashboard.view', 'reports.view', 'accounting.view'], category: 'المالية والتقارير' },
  { path: '/reports', label: 'التقارير والتحليلات', icon: BarChart3, perms: ['reports.view'], category: 'المالية والتقارير' },
  { path: '/accounting', label: 'الحسابات العامة', icon: Calculator, perms: ['accounting.view'], category: 'المالية والتقارير' },
  { path: '/expenses', label: 'المصروفات اليومية', icon: Receipt, perms: ['expenses.view'], category: 'المالية والتقارير' },

  // النظام والإدارة
  { path: '/settings', label: 'الإعدادات العامة', icon: Settings, perms: ['settings.view'], category: 'النظام والإدارة' },
  { path: '/backup', label: 'النسخ الاحتياطي والتعافي', icon: Database, perms: ['backup.view', 'settings.manage'], category: 'النظام والإدارة' },
  { path: '/permissions', label: 'إدارة الصلاحيات', icon: Shield, perms: ['permissions.manage'], category: 'النظام والإدارة' },
  { path: '/maintenance', label: 'الأصول والصيانة', icon: Wrench, perms: ['maintenance.view'], category: 'النظام والإدارة' },
  { path: '/integrations', label: 'مركز التكاملات', icon: Puzzle, perms: ['integrations.view'], category: 'النظام والإدارة' },
  { path: '/audit', label: 'سجل التدقيق', icon: FileText, perms: ['audit.view'], category: 'النظام والإدارة' },
  { path: '/docs', label: 'دليل النظام', icon: BookOpen, perms: ['dashboard.view'], category: 'النظام والإدارة' },
];

export function MobileBottomNav() {
  const location = useLocation();
  const navigate = useNavigate();
  const { hasAnyPermission, isAdmin } = useUserPermissions();
  const { theme, toggleTheme } = useTheme();
  const { signOut } = useAuth();
  const [isMoreOpen, setIsMoreOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');

  const pathname = location.pathname;

  // Active status helpers for primary 4 items
  const isHomeActive = pathname === '/';
  const isPosActive = pathname.startsWith('/pos');
  const isProductsActive = pathname.startsWith('/products');
  const isInventoryActive = pathname.startsWith('/inventory') || pathname.startsWith('/purchasing') || pathname.startsWith('/suppliers') || pathname.startsWith('/waste');
  const isMoreActive = !isHomeActive && !isPosActive && !isProductsActive && !isInventoryActive;

  // Filter allowed modules
  const allowedModules = useMemo(() => {
    return allAppModules.filter(m => isAdmin || hasAnyPermission(m.perms));
  }, [isAdmin, hasAnyPermission]);

  // Filter by search inside More Sheet
  const filteredModules = useMemo(() => {
    if (!searchQuery.trim()) return allowedModules;
    const q = searchQuery.toLowerCase();
    return allowedModules.filter(m =>
      m.label.toLowerCase().includes(q) ||
      m.category.toLowerCase().includes(q)
    );
  }, [allowedModules, searchQuery]);

  // Group modules by category for clean presentation
  const groupedModules = useMemo(() => {
    const groups: Record<string, NavModule[]> = {};
    filteredModules.forEach(m => {
      if (!groups[m.category]) groups[m.category] = [];
      groups[m.category].push(m);
    });
    return groups;
  }, [filteredModules]);

  const handleModuleClick = (path: string) => {
    setIsMoreOpen(false);
    setSearchQuery('');
    navigate(path);
  };

  const handleLogout = async () => {
    setIsMoreOpen(false);
    await signOut();
    navigate('/auth');
  };

  return (
    <>
      {/* Native App Bottom Dock - Strictly Mobile Only (md:hidden) */}
      <nav
        className="md:hidden fixed inset-x-0 bottom-0 z-50 bg-card/90 dark:bg-slate-950/95 backdrop-blur-2xl border-t border-border/70 shadow-[0_-4px_24px_rgba(0,0,0,0.08)] select-none pointer-events-auto"
        style={{ paddingBottom: 'env(safe-area-inset-bottom, 0px)' }}
        dir="rtl"
        aria-label="شريط التنقل الرئيسي للتطبيق"
      >
        <div className="flex items-center justify-around h-16 px-1 max-w-lg mx-auto">
          {/* 1. الرئيسية */}
          <Link
            to="/"
            className={cn(
              "flex flex-col items-center justify-center flex-1 h-full py-1 text-center transition-all duration-200 active:scale-90",
              isHomeActive
                ? "text-primary font-bold"
                : "text-muted-foreground hover:text-foreground"
            )}
          >
            <div className="relative flex items-center justify-center">
              <LayoutDashboard className={cn("w-5 h-5 transition-transform", isHomeActive && "scale-110 drop-shadow-sm")} />
              {isHomeActive && (
                <span className="absolute -bottom-1 w-1.5 h-1.5 rounded-full bg-primary animate-pulse" />
              )}
            </div>
            <span className="text-[10px] sm:text-[11px] mt-1 font-semibold leading-none tracking-tight">الرئيسية</span>
          </Link>

          {/* 2. نقاط البيع */}
          <Link
            to="/pos"
            className={cn(
              "flex flex-col items-center justify-center flex-1 h-full py-1 text-center transition-all duration-200 active:scale-90",
              isPosActive
                ? "text-primary font-bold"
                : "text-muted-foreground hover:text-foreground"
            )}
          >
            <div className="relative flex items-center justify-center">
              <ShoppingCart className={cn("w-5 h-5 transition-transform", isPosActive && "scale-110 drop-shadow-sm")} />
              {isPosActive && (
                <span className="absolute -bottom-1 w-1.5 h-1.5 rounded-full bg-primary animate-pulse" />
              )}
            </div>
            <span className="text-[10px] sm:text-[11px] mt-1 font-semibold leading-none tracking-tight">نقاط البيع</span>
          </Link>

          {/* 3. الكتب والمنتجات */}
          <Link
            to="/products"
            className={cn(
              "flex flex-col items-center justify-center flex-1 h-full py-1 text-center transition-all duration-200 active:scale-90",
              isProductsActive
                ? "text-primary font-bold"
                : "text-muted-foreground hover:text-foreground"
            )}
          >
            <div className="relative flex items-center justify-center">
              <BookOpen className={cn("w-5 h-5 transition-transform", isProductsActive && "scale-110 drop-shadow-sm")} />
              {isProductsActive && (
                <span className="absolute -bottom-1 w-1.5 h-1.5 rounded-full bg-primary animate-pulse" />
              )}
            </div>
            <span className="text-[10px] sm:text-[11px] mt-1 font-semibold leading-none tracking-tight">الكتب</span>
          </Link>

          {/* 4. المخزون */}
          <Link
            to="/inventory"
            className={cn(
              "flex flex-col items-center justify-center flex-1 h-full py-1 text-center transition-all duration-200 active:scale-90",
              isInventoryActive
                ? "text-primary font-bold"
                : "text-muted-foreground hover:text-foreground"
            )}
          >
            <div className="relative flex items-center justify-center">
              <Package className={cn("w-5 h-5 transition-transform", isInventoryActive && "scale-110 drop-shadow-sm")} />
              {isInventoryActive && (
                <span className="absolute -bottom-1 w-1.5 h-1.5 rounded-full bg-primary animate-pulse" />
              )}
            </div>
            <span className="text-[10px] sm:text-[11px] mt-1 font-semibold leading-none tracking-tight">المخزون</span>
          </Link>

          {/* 5. المزيد (Opens Native Bottom Sheet) */}
          <button
            type="button"
            onClick={() => setIsMoreOpen(true)}
            className={cn(
              "flex flex-col items-center justify-center flex-1 h-full py-1 text-center transition-all duration-200 active:scale-90 outline-none",
              (isMoreActive || isMoreOpen)
                ? "text-primary font-bold"
                : "text-muted-foreground hover:text-foreground"
            )}
            aria-label="فتح قائمة المزيد من أقسام التطبيق"
          >
            <div className="relative flex items-center justify-center">
              <Compass className={cn("w-5 h-5 transition-transform", (isMoreActive || isMoreOpen) && "scale-110 drop-shadow-sm")} />
              {isMoreActive && !isMoreOpen && (
                <span className="absolute -bottom-1 w-1.5 h-1.5 rounded-full bg-primary animate-pulse" />
              )}
            </div>
            <span className="text-[10px] sm:text-[11px] mt-1 font-semibold leading-none tracking-tight">المزيد</span>
          </button>
        </div>
      </nav>

      {/* More Menu Bottom Sheet (App Drawer) */}
      <Sheet open={isMoreOpen} onOpenChange={setIsMoreOpen}>
        <SheetContent
          side="bottom"
          className="p-0 max-h-[85dvh] h-[85dvh] rounded-t-[28px] border-t border-border/70 bg-card/95 dark:bg-slate-950/95 backdrop-blur-2xl flex flex-col font-cairo shadow-2xl"
          dir="rtl"
        >
          {/* Native Drag Handle */}
          <div className="w-12 h-1.5 rounded-full bg-muted-foreground/30 mx-auto mt-3 mb-1 flex-shrink-0" />

          <SheetHeader className="px-5 pt-2 pb-3 border-b border-border/50 text-right">
            <div className="flex items-center justify-between">
              <div>
                <SheetTitle className="text-lg font-black text-foreground tracking-tight">
                  أقسام وخدمات المكتبة
                </SheetTitle>
                <SheetDescription className="text-xs text-muted-foreground mt-0.5">
                  تصفح سريع لجميع وحدات إدارة المكتبة والقرطاسية
                </SheetDescription>
              </div>
              <Button
                variant="ghost"
                size="icon"
                onClick={() => setIsMoreOpen(false)}
                className="h-9 w-9 rounded-full text-muted-foreground hover:bg-muted/80"
              >
                <X className="w-5 h-5" />
              </Button>
            </div>

            {/* Quick In-Sheet Search */}
            <div className="relative mt-3">
              <Search className="absolute right-3 top-2.5 h-4 w-4 text-muted-foreground pointer-events-none" />
              <Input
                placeholder="ابحث عن قسم أو وظيفة..."
                value={searchQuery}
                onChange={e => setSearchQuery(e.target.value)}
                className="pr-9 h-10 text-xs sm:text-sm rounded-xl bg-muted/40 border-border/50"
              />
            </div>
          </SheetHeader>

          {/* Scrollable Modules Grid */}
          <div className="flex-1 overflow-y-auto px-4 py-4 space-y-6 custom-scrollbar">
            {Object.keys(groupedModules).length === 0 ? (
              <div className="text-center py-12 text-muted-foreground">
                <Search className="w-8 h-8 mx-auto opacity-30 mb-2" />
                <p className="text-sm font-semibold">لا يوجد قسم يطابق بحثك</p>
                <p className="text-xs text-muted-foreground/80 mt-1">جرب كلمات بحث أخرى</p>
              </div>
            ) : (
              Object.entries(groupedModules).map(([category, modules]) => (
                <div key={category} className="space-y-2.5">
                  <h3 className="text-xs font-bold text-muted-foreground px-1 uppercase tracking-wider">
                    {category}
                  </h3>
                  <div className="grid grid-cols-3 sm:grid-cols-4 gap-2.5">
                    {modules.map((mod) => {
                      const Icon = mod.icon;
                      const isCurrent = pathname === mod.path || pathname.startsWith(mod.path + '/');

                      return (
                        <button
                          key={mod.path}
                          type="button"
                          onClick={() => handleModuleClick(mod.path)}
                          className={cn(
                            "flex flex-col items-center justify-center p-3 rounded-2xl border text-center transition-all duration-200 active:scale-95 group outline-none",
                            isCurrent
                              ? "bg-primary/10 border-primary/40 text-primary shadow-sm"
                              : "bg-background/60 hover:bg-muted/40 border-border/50 text-foreground hover:border-primary/20"
                          )}
                        >
                          <div className={cn(
                            "w-11 h-11 rounded-2xl flex items-center justify-center mb-1.5 transition-transform group-hover:scale-105 shadow-sm",
                            isCurrent
                              ? "bg-primary text-primary-foreground shadow-[0_4px_12px_rgba(var(--primary),0.3)]"
                              : "bg-muted/60 text-muted-foreground group-hover:text-primary group-hover:bg-primary/10"
                          )}>
                            <Icon className="w-5 h-5" />
                          </div>
                          <span className="text-[11px] font-bold truncate max-w-full leading-tight">
                            {mod.label}
                          </span>
                        </button>
                      );
                    })}
                  </div>
                </div>
              ))
            )}
          </div>

          {/* Quick Footer Controls */}
          <div
            className="p-3 border-t border-border/50 bg-muted/20 flex items-center justify-between gap-2 flex-shrink-0"
            style={{ paddingBottom: 'calc(env(safe-area-inset-bottom, 0px) + 12px)' }}
          >
            <div className="flex items-center gap-2">
              <Button
                variant="outline"
                size="sm"
                className="h-10 rounded-xl gap-2 text-xs font-semibold"
                onClick={toggleTheme}
              >
                {theme === 'dark' ? (
                  <>
                    <Sun className="w-4 h-4 text-amber-500" />
                    <span>الوضع المضيء</span>
                  </>
                ) : (
                  <>
                    <Moon className="w-4 h-4 text-indigo-500" />
                    <span>الوضع المظلم</span>
                  </>
                )}
              </Button>
            </div>

            <Button
              variant="ghost"
              size="sm"
              className="h-10 rounded-xl gap-1.5 text-xs font-semibold text-destructive hover:bg-destructive/10"
              onClick={handleLogout}
            >
              <LogOut className="w-4 h-4" />
              <span>تسجيل الخروج</span>
            </Button>
          </div>
        </SheetContent>
      </Sheet>
    </>
  );
}

export default MobileBottomNav;
