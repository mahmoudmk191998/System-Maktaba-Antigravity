import { useState, useEffect, useRef } from 'react';
import { Link, useLocation } from 'react-router-dom';
import mkLogo from '@/assets/mk-logo.png';
import { useAppStore } from '@/lib/store';
import { useIsMobile } from '@/hooks/use-mobile';
import { useUserPermissions } from '@/hooks/usePermissions';
import { useProfile } from '@/hooks/useProfile';
import { cn } from '@/lib/utils';
import {
  LayoutDashboard, ShoppingCart, ChefHat, CalendarDays, UtensilsCrossed,
  Package, Truck, Factory, Bike, Users, Percent, UserCog, BarChart3,
  Settings, FileText, Puzzle, BookOpen, ChevronRight, Building2, Menu, Shield, Receipt, ChevronDown, Clock, Gift, Wrench, Calculator, PhoneCall, Trash2, Eye, EyeOff, TrendingUp, Database
} from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import { Sheet, SheetContent, SheetTitle, SheetDescription } from '@/components/ui/sheet';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible';

const navGroups = [
  {
    title: 'الرئيسية',
    items: [
      { path: '/', label: 'لوحة التحكم', icon: LayoutDashboard, perms: ['dashboard.view'] },
    ]
  },
  {
    title: 'المبيعات والعملاء',
    items: [
      { path: '/pos', label: 'نقاط البيع', icon: ShoppingCart, perms: ['pos.view'] },
      { path: '/orders-history', label: 'سجل الطلبات', icon: Receipt, perms: ['pos.view'] },
      { path: '/customers', label: 'العملاء', icon: Users, perms: ['customers.view'] },
      { path: '/promotions', label: 'العروض والخصومات', icon: Percent, perms: ['promotions.view'] },
    ]
  },
  {
    title: 'المطبخ والإنتاج',
    items: [
      { path: '/kitchen', label: 'شاشة المطبخ', icon: ChefHat, perms: ['kitchen.view'] },
      { path: '/production', label: 'الإنتاج والتحضير', icon: Factory, perms: ['production.view'] },
      { path: '/menu', label: 'القائمة والوصفات', icon: UtensilsCrossed, perms: ['menu.view'] },
    ]
  },
  {
    title: 'المخزون والمشتريات',
    items: [
      { path: '/inventory', label: 'المخزون', icon: Package, perms: ['inventory.view'] },
      { path: '/waste', label: 'الهالك والتوالف', icon: Trash2, perms: ['inventory.waste'] },
      { path: '/purchasing', label: 'المشتريات', icon: Truck, perms: ['purchasing.view'] },
      { path: '/suppliers', label: 'الموردين', icon: Users, perms: ['suppliers.view'] },
    ]
  },
  {
    title: 'العمليات الداخلية',
    items: [
      { path: '/tables', label: 'الطاولات والحجوزات', icon: CalendarDays, perms: ['tables.view'] },
      { path: '/callcenter', label: 'مركز الاتصالات', icon: PhoneCall, perms: ['callcenter.view'] },
      { path: '/delivery', label: 'التوصيل والسائقين', icon: Bike, perms: ['delivery.view'] },
      { path: '/shifts', label: 'إدارة الورديات', icon: Clock, perms: ['hr.manage_shifts'] },
      { path: '/hr', label: 'الموارد البشرية', icon: UserCog, perms: ['hr.view_employees'] },
    ]
  },
  {
    title: 'المالية والتقارير',
    items: [
      { path: '/executive', label: 'اللوحة المالية والإغلاق', icon: TrendingUp, perms: ['financial_dashboard.view', 'reports.view', 'accounting.view'] },
      { path: '/reports', label: 'التقارير والتحليلات', icon: BarChart3, perms: ['reports.view'] },
      { path: '/accounting', label: 'الحسابات العامة', icon: Calculator, perms: ['accounting.view'] },
      { path: '/expenses', label: 'المصروفات', icon: Receipt, perms: ['expenses.view'] },
    ]
  },
  {
    title: 'النظام والإعدادات',
    items: [
      { path: '/settings', label: 'الإعدادات', icon: Settings, perms: ['settings.view'] },
      { path: '/backup', label: 'النسخ الاحتياطي والتعافي', icon: Database, perms: ['backup.view', 'settings.manage'] },
      { path: '/permissions', label: 'الصلاحيات', icon: Shield, perms: ['permissions.manage'] },
      { path: '/maintenance', label: 'الأصول والصيانة', icon: Wrench, perms: ['maintenance.view'] },
      { path: '/integrations', label: 'مركز التكاملات', icon: Puzzle, perms: ['integrations.view'] },
      { path: '/audit', label: 'سجل التدقيق', icon: FileText, perms: ['audit.view'] },
      { path: '/docs', label: 'دليل النظام', icon: BookOpen, perms: ['dashboard.view'] },
    ]
  }
];

const allNavItems = navGroups.flatMap(group => group.items);

function NavGroupMenu({ group, location, isAdmin, hasAnyPermission, onNavigate, sidebarCollapsed }: any) {
  const allowedItems = group.items.filter((item: any) => isAdmin || hasAnyPermission(item.perms));
  if (allowedItems.length === 0) return null;

  const isActiveGroup = allowedItems.some((item: any) => location.pathname === item.path);
  const [isOpen, setIsOpen] = useState(isActiveGroup);

  useEffect(() => {
    if (isActiveGroup && !sidebarCollapsed) {
      setIsOpen(true);
    }
  }, [isActiveGroup, sidebarCollapsed]);

  useEffect(() => {
    if (sidebarCollapsed) {
      setIsOpen(false);
    }
  }, [sidebarCollapsed]);

  if (allowedItems.length === 1 && group.title === 'الرئيسية') {
    const item = allowedItems[0];
    const isActive = location.pathname === item.path;
    const Icon = item.icon;

    const content = (
      <Link key={item.path} to={item.path} onClick={onNavigate}
        className={cn(
          'group relative flex items-center gap-3 px-2 py-2.5 rounded-xl transition-all duration-300 overflow-hidden outline-none min-h-[44px] touch-manipulation',
          isActive
            ? 'bg-gradient-to-l from-primary/15 to-primary/5 text-primary font-bold shadow-sm border border-primary/10'
            : 'text-sidebar-foreground/70 hover:bg-sidebar-accent/40 hover:text-sidebar-foreground my-0.5 border border-transparent'
        )}>
        {isActive && !sidebarCollapsed && <div className="absolute right-0 top-0 bottom-0 w-1 bg-primary rounded-l-full shadow-[0_0_12px_rgba(var(--primary),0.6)]" />}

        <div className={cn(
          "w-8 h-8 rounded-lg flex items-center justify-center transition-all duration-500 ease-out",
          isActive ? "bg-primary/20 text-primary scale-110 shadow-inner" : "bg-sidebar-accent/50 group-hover:bg-sidebar-accent group-hover:scale-110 group-hover:shadow-sm"
        )}>
          <Icon className="w-4 h-4" />
        </div>

        <span
          style={{ opacity: sidebarCollapsed ? 0 : 1, width: sidebarCollapsed ? 0 : 'auto', display: sidebarCollapsed ? 'none' : 'block' }}
          className="whitespace-nowrap transition-opacity duration-300 tracking-wide text-[14px]"
        >
          {item.label}
        </span>
      </Link>
    );

    if (sidebarCollapsed) {
      return (
        <Tooltip delayDuration={0}>
          <TooltipTrigger asChild>{content}</TooltipTrigger>
          <TooltipContent side="left" className="font-cairo font-bold shadow-xl border-primary/20">{item.label}</TooltipContent>
        </Tooltip>
      );
    }
    return content;
  }

  const GroupIcon = allowedItems[0].icon;

  const triggerContent = (
    <button
      className={cn(
        'w-full flex items-center gap-3 px-2 py-2.5 rounded-xl transition-all duration-300 group outline-none border border-transparent min-h-[44px] touch-manipulation',
        isOpen && !sidebarCollapsed ? 'text-primary bg-sidebar-accent/10' : 'text-sidebar-foreground/70 hover:bg-sidebar-accent/30 hover:text-sidebar-foreground'
      )}>
      <div className={cn(
        "w-8 h-8 rounded-lg flex items-center justify-center transition-all duration-500 ease-out",
        isOpen && !sidebarCollapsed ? "bg-primary/15 text-primary shadow-sm scale-110" : "bg-transparent group-hover:bg-sidebar-accent/50 group-hover:scale-110 group-hover:shadow-sm"
      )}>
        {GroupIcon && <GroupIcon className="w-4 h-4" />}
      </div>
      <div
        style={{ opacity: sidebarCollapsed ? 0 : 1, width: sidebarCollapsed ? 0 : 'auto', display: sidebarCollapsed ? 'none' : 'flex' }}
        className="flex-1 items-center justify-between overflow-hidden transition-opacity duration-300"
      >
        <span className="whitespace-nowrap text-right font-bold text-[13px] tracking-wide">{group.title}</span>
        <ChevronDown className={cn('w-4 h-4 transition-transform duration-500 ease-out opacity-60', isOpen && 'rotate-180 opacity-100')} />
      </div>
    </button>
  );

  return (
    <Collapsible open={sidebarCollapsed ? false : isOpen} onOpenChange={setIsOpen} className="space-y-1 mb-2">
      {sidebarCollapsed ? (
        <Tooltip delayDuration={0}>
          <TooltipTrigger asChild>
            <CollapsibleTrigger asChild>
              {triggerContent}
            </CollapsibleTrigger>
          </TooltipTrigger>
          <TooltipContent side="left" className="font-cairo font-bold shadow-xl border-primary/20">{group.title}</TooltipContent>
        </Tooltip>
      ) : (
        <CollapsibleTrigger asChild>
          {triggerContent}
        </CollapsibleTrigger>
      )}

      <CollapsibleContent className="overflow-hidden transition-all duration-500 ease-[cubic-bezier(0.2,0.8,0.2,1)] data-[state=closed]:animate-collapsible-up data-[state=open]:animate-collapsible-down">
        <div className="mr-7 pr-3 border-r border-border/20 ml-2 space-y-0.5 my-1 py-1 relative">
          <div className="absolute right-0 top-0 bottom-0 w-px bg-gradient-to-b from-transparent via-border/50 to-transparent" />

          {allowedItems.map((item: any, index: number) => {
            const isActive = location.pathname === item.path;

            return (
              <Link key={item.path} to={item.path} onClick={onNavigate}
                style={{ animationDelay: `${index * 40}ms` }}
                className={cn(
                  'relative flex items-center gap-3 px-3 py-2.5 rounded-lg text-[13px] transition-all duration-300 group overflow-hidden outline-none min-h-[40px] touch-manipulation',
                  isActive
                    ? 'bg-gradient-to-l from-primary/10 to-transparent text-primary font-bold'
                    : 'text-sidebar-foreground/60 hover:text-sidebar-foreground hover:bg-sidebar-accent/30 hover:translate-x-[-4px]'
                )}>

                {/* Micro active dot */}
                <div className={cn(
                  "absolute right-[-15px] rounded-full transition-all duration-500 ease-out",
                  isActive ? "w-1 h-5 bg-primary opacity-100 shadow-[0_0_8px_rgba(var(--primary),0.6)]" : "w-1.5 h-1.5 bg-sidebar-foreground/30 opacity-0 group-hover:opacity-100 scale-50 group-hover:scale-100"
                )} />

                <span className="whitespace-nowrap z-10 relative drop-shadow-sm">{item.label}</span>
              </Link>
            );
          })}
        </div>
      </CollapsibleContent>
    </Collapsible>
  );
}

export function SidebarContent({ onNavigate, isMobile }: { onNavigate?: () => void, isMobile?: boolean }) {
  const location = useLocation();
  const { profile } = useProfile();
  const { hasAnyPermission, isAdmin } = useUserPermissions();

  return (
    <div className="flex flex-col h-full bg-sidebar">
      {!isMobile ? (
        <div className="p-5 border-b border-sidebar-border/50 bg-gradient-to-b from-sidebar-accent/20 to-transparent">
          <div className="flex items-center gap-4">
            <div className="w-12 h-12 rounded-2xl bg-white shadow-sm overflow-hidden flex-shrink-0 border-2 border-sidebar-border/50">
              <img src={mkLogo} alt="MK" className="w-full h-full object-contain p-1" />
            </div>
            <div className="overflow-hidden flex-1">
              <h1 className="text-xl font-black text-sidebar-foreground tracking-tight whitespace-nowrap">إم كـي سيستم</h1>
              <p className="text-xs text-sidebar-foreground/60 whitespace-nowrap font-medium mt-0.5 opacity-80">
                {profile?.full_name || 'M K System'}
              </p>
            </div>
          </div>
        </div>
      ) : (
        <div className="p-4 border-b border-sidebar-border/50 bg-sidebar-accent/10 flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-white shadow-sm overflow-hidden flex-shrink-0 border border-sidebar-border/50">
            <img src={mkLogo} alt="MK" className="w-full h-full object-contain p-1" />
          </div>
          <div className="overflow-hidden flex-1">
            <h2 className="font-black text-base text-sidebar-foreground">إم كـي سيستم</h2>
            <p className="text-[11px] text-sidebar-foreground/60 truncate font-medium">
              {profile?.full_name || 'لوحة التحكم'}
            </p>
          </div>
        </div>
      )}

      <ScrollArea className="flex-1 py-4 px-3">
        <nav className="space-y-2">
          {navGroups.map((group) => (
            <NavGroupMenu
              key={group.title}
              group={group}
              location={location}
              isAdmin={isAdmin}
              hasAnyPermission={hasAnyPermission}
              onNavigate={onNavigate}
              sidebarCollapsed={false}
            />
          ))}
        </nav>
      </ScrollArea>

      <div className="p-4 border-t border-sidebar-border/50 bg-gradient-to-t from-sidebar-accent/10 to-transparent">
        <div className="flex items-center gap-3 p-3 rounded-xl bg-background/50 border border-border/50 shadow-sm transition-all duration-300 hover:shadow-md hover:border-border cursor-pointer group">
          <div className="w-10 h-10 rounded-full bg-primary/10 flex items-center justify-center flex-shrink-0 border border-primary/20 group-hover:bg-primary/20 transition-colors">
            <Building2 className="w-5 h-5 text-primary" />
          </div>
          <div className="flex-1 overflow-hidden transition-opacity duration-300 text-right">
            <p className="text-sm font-bold truncate text-sidebar-foreground">الفرع الرئيسي</p>
            <p className="text-[11px] text-muted-foreground truncate font-medium">فرع نشط • تبديل</p>
          </div>
        </div>
      </div>
    </div>
  );
}

export function Sidebar() {
  const location = useLocation();
  const { hasAnyPermission, isAdmin } = useUserPermissions();
  const { bottomNavVisible, setBottomNavVisible, toggleBottomNav } = useAppStore();
  const [activeGroup, setActiveGroup] = useState<string | null>(null);
  const navRef = useRef<HTMLElement>(null);

  // Global Keyboard Shortcut: Ctrl+B or Cmd+B to toggle bottom navigation bar
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'b') {
        const tag = (e.target as HTMLElement)?.tagName;
        if (tag === 'INPUT' || tag === 'TEXTAREA' || (e.target as HTMLElement)?.isContentEditable) return;
        e.preventDefault();
        toggleBottomNav();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [toggleBottomNav]);

  // Auto-close active group on navigation
  useEffect(() => {
    setActiveGroup(null);
  }, [location.pathname]);

  // Handle click outside to close the active group
  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (navRef.current && !navRef.current.contains(event.target as Node)) {
        setActiveGroup(null);
      }
    }
    
    if (activeGroup) {
      document.addEventListener('mousedown', handleClickOutside);
    }
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, [activeGroup]);

  return (
    <AnimatePresence>
      {bottomNavVisible ? (
        <div className="hidden md:flex fixed inset-x-0 bottom-6 z-[100] justify-center pointer-events-none">
          <motion.nav
            key="bottom-dock-nav"
            ref={navRef}
            initial={{ y: 50, opacity: 0, scale: 0.95 }}
            animate={{ y: 0, opacity: 1, scale: 1 }}
            exit={{ y: 50, opacity: 0, scale: 0.95 }}
            transition={{ duration: 0.25, ease: [0.2, 0.8, 0.2, 1] }}
            className="pointer-events-auto flex flex-col items-center gap-4"
          >
            {/* Pop-up Group Menu */}
            {activeGroup && (
              <div className="dynamic-island px-4 py-3 min-w-[200px] flex justify-center gap-2 animate-fade-in origin-bottom">
                {navGroups.find(g => g.title === activeGroup)?.items.filter(item => isAdmin || hasAnyPermission(item.perms)).map((item) => {
                  const isActive = location.pathname === item.path;
                  const Icon = item.icon;
                  return (
                    <Link
                      key={item.path}
                      to={item.path}
                      className={cn(
                        'flex items-center gap-2 px-4 py-2 rounded-2xl transition-all duration-300',
                        isActive ? 'bg-primary text-primary-foreground font-bold shadow-[0_0_15px_rgba(var(--primary),0.5)] scale-110' : 'hover:bg-white/10 text-white/70 hover:text-white'
                      )}
                    >
                      <Icon className="w-4 h-4" />
                      <span className="text-[13px] whitespace-nowrap">{item.label}</span>
                    </Link>
                  );
                })}
              </div>
            )}

            {/* Main Bottom Dock */}
            <div className="bg-card/70 backdrop-blur-[40px] px-4 py-3 rounded-full border border-white/10 shadow-[0_20px_50px_rgba(0,0,0,0.5),inset_0_1px_1px_rgba(255,255,255,0.1)] flex items-center justify-center gap-2">
              <Link to="/" className="w-12 h-12 rounded-full bg-gradient-to-tr from-primary to-primary/80 shadow-[0_0_20px_rgba(var(--primary),0.4)] flex items-center justify-center border border-white/20 hover:scale-110 transition-transform mr-2">
                <img src={mkLogo} alt="MK" className="w-8 h-8 object-contain bg-white rounded-full p-1" />
              </Link>
              <div className="w-px h-8 bg-white/10 mx-2" />

              {navGroups.map((group) => {
                const allowedItems = group.items.filter((item: any) => isAdmin || hasAnyPermission(item.perms));
                if (allowedItems.length === 0) return null;

                if (group.title === 'الرئيسية') return null; // handled via logo

                const GroupIcon = allowedItems[0].icon;
                const isActive = group.title === activeGroup || allowedItems.some(item => location.pathname === item.path);

                return (
                  <Tooltip key={group.title} delayDuration={0}>
                    <TooltipTrigger asChild>
                      <button
                        onClick={() => setActiveGroup(activeGroup === group.title ? null : group.title)}
                        className={cn(
                          'dock-item group relative outline-none',
                          isActive ? 'dock-item-active z-10 scale-110' : 'hover:scale-125 hover:z-20 hover:mx-2'
                        )}
                      >
                        <GroupIcon className="w-6 h-6 transition-transform group-hover:-translate-y-1" />
                        <span className="sr-only">{group.title}</span>
                      </button>
                    </TooltipTrigger>
                    <TooltipContent side="top" sideOffset={16} className="font-cairo font-bold rounded-2xl bg-black/90 backdrop-blur-md border-white/10 shadow-2xl z-[110]">
                      {group.title}
                    </TooltipContent>
                  </Tooltip>
                );
              })}

              {/* Hide Bottom Nav Button */}
              <div className="w-px h-8 bg-white/10 mx-1" />
              <Tooltip delayDuration={0}>
                <TooltipTrigger asChild>
                  <button
                    onClick={() => setBottomNavVisible(false)}
                    className="dock-item group relative outline-none hover:text-rose-400 p-2 rounded-full transition-all"
                    aria-label="إخفاء شريط القوائم"
                  >
                    <EyeOff className="w-5 h-5 text-white/50 group-hover:text-rose-400 group-hover:scale-110 transition-all" />
                    <span className="sr-only">إخفاء شريط القوائم</span>
                  </button>
                </TooltipTrigger>
                <TooltipContent side="top" sideOffset={16} className="font-cairo font-bold text-xs rounded-xl bg-black/90 backdrop-blur-md border-white/10 shadow-2xl z-[110]">
                  إخفاء شريط القوائم (Ctrl+B)
                </TooltipContent>
              </Tooltip>
            </div>
          </motion.nav>
        </div>
      ) : (
        /* Reveal / Restore Floating Button when Hidden */
        <div className="hidden md:flex fixed inset-x-0 bottom-3 z-[100] justify-center pointer-events-none">
          <motion.div
            key="bottom-reveal-btn"
            initial={{ y: 30, opacity: 0 }}
            animate={{ y: 0, opacity: 1 }}
            exit={{ y: 30, opacity: 0 }}
            transition={{ duration: 0.25, ease: 'easeOut' }}
            className="pointer-events-auto"
          >
            <Tooltip delayDuration={0}>
              <TooltipTrigger asChild>
                <button
                  onClick={() => setBottomNavVisible(true)}
                  className="flex items-center gap-2 px-4 py-2 rounded-full bg-card/85 hover:bg-card backdrop-blur-[40px] border border-white/20 shadow-[0_15px_35px_rgba(0,0,0,0.5)] text-foreground hover:text-primary transition-all duration-300 hover:scale-105 group text-xs font-bold font-cairo outline-none"
                >
                  <Eye className="w-4 h-4 text-primary group-hover:scale-110 transition-transform" />
                  <span>إظهار شريط القوائم</span>
                  <span className="text-[10px] px-1.5 py-0.5 rounded bg-white/10 font-mono text-muted-foreground border border-white/10">
                    Ctrl+B
                  </span>
                </button>
              </TooltipTrigger>
              <TooltipContent side="top" sideOffset={12} className="font-cairo font-bold text-xs rounded-xl bg-black/90 backdrop-blur-md border-white/10 z-[110]">
                إظهار شريط القوائم السفلي
              </TooltipContent>
            </Tooltip>
          </motion.div>
        </div>
      )}
    </AnimatePresence>
  );
}
