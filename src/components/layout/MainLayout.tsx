import { ReactNode, useState, useEffect } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { motion } from 'framer-motion';
import { useIsMobile } from '@/hooks/use-mobile';
import { useAuth } from '@/hooks/useAuth';
import { useTheme } from '@/hooks/useTheme';
import { useProfile } from '@/hooks/useProfile';
import { Sidebar, SidebarContent } from './Sidebar';
import { MobileBottomNav } from './MobileBottomNav';
import { NotificationBell } from '@/components/notifications/NotificationBell';
import { User, Wifi, WifiOff, LogOut, Moon, Sun, Lock, Clock, CalendarDays, Download, Menu, Eye, EyeOff, ArrowRight } from 'lucide-react';
import { Sheet, SheetContent, SheetTrigger, SheetTitle, SheetDescription } from '@/components/ui/sheet';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import { formatDate } from '@/lib/formatters';
import { useAppStore } from '@/lib/store';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { ConnectivityBanner } from '@/components/retail/ConnectivityBanner';
import { offlineQueueService } from '@/services/offline';
import { toast } from 'sonner';

interface MainLayoutProps {
  children: ReactNode;
  title?: string;
  subtitle?: string;
  actions?: ReactNode;
  showBack?: boolean;
  onBack?: () => void;
  backFallback?: string;
  fullBleed?: boolean;
}

function LiveClock() {
  const [time, setTime] = useState(new Date());

  useEffect(() => {
    const timer = setInterval(() => setTime(new Date()), 1000);
    return () => clearInterval(timer);
  }, []);

  let hoursNum = time.getHours();
  const ampm = hoursNum >= 12 ? 'م' : 'ص';
  hoursNum = hoursNum % 12 || 12; // convert to 12-hour format
  
  const hours = hoursNum.toString().padStart(2, '0');
  const minutes = time.getMinutes().toString().padStart(2, '0');
  const seconds = time.getSeconds().toString().padStart(2, '0');

  const gregorianDate = new Intl.DateTimeFormat('ar-EG', { 
    weekday: 'long', 
    day: 'numeric', 
    month: 'long', 
    year: 'numeric' 
  }).format(time);

  return (
    <div className="hidden xl:flex items-center gap-1.5 p-1 rounded-full bg-gradient-to-r from-background to-secondary/10 border border-border/40 shadow-sm backdrop-blur-md group hover:border-primary/30 transition-all duration-300 hover:shadow-md">
      
      {/* Date Badge */}
      <div className="flex items-center gap-2 px-3 py-1 rounded-full bg-white/40 dark:bg-black/20 border border-white/20 dark:border-white/5 shadow-inner">
        <CalendarDays className="w-3.5 h-3.5 text-primary opacity-80" />
        <span className="text-[12px] font-extrabold text-foreground/80 tracking-wide mt-0.5">{gregorianDate}</span>
      </div>

      {/* Internal Divider */}
      <div className="w-px h-4 bg-border/60 mx-0.5 opacity-50" />

      {/* Time Badge */}
      <div className="flex items-center gap-1.5 px-3 py-1 rounded-full bg-white/40 dark:bg-black/20 border border-white/20 dark:border-white/5 shadow-inner" dir="ltr">
        <div className="flex items-center justify-center w-5 h-5 rounded-full bg-primary/10 text-primary group-hover:scale-110 transition-transform shadow-sm">
          <Clock className="w-3 h-3" />
        </div>
        <div className="flex items-center font-mono font-bold tracking-wider text-slate-800 dark:text-slate-200 mt-0.5">
          <span className="text-[13px]">{hours}</span>
          <span className="text-primary/70 animate-[pulse_1.5s_ease-in-out_infinite] mx-0.5">:</span>
          <span className="text-[13px]">{minutes}</span>
          <span className="text-primary/70 animate-[pulse_1.5s_ease-in-out_infinite] mx-0.5">:</span>
          <span className="text-[11px] text-muted-foreground font-medium opacity-80 drop-shadow-sm">{seconds}</span>
        </div>
        <span className="text-[10px] font-extrabold text-primary bg-primary/10 px-1.5 py-0.5 rounded shadow-sm ml-1 mt-0.5">{ampm}</span>
      </div>

    </div>
  );
}

export function MainLayout({ children, title, subtitle, actions, showBack, onBack, backFallback, fullBleed }: MainLayoutProps) {
  const { sidebarCollapsed, settings, bottomNavVisible, toggleBottomNav } = useAppStore();
  const isMobile = useIsMobile();
  const isOnline = navigator.onLine;
  const { signOut, user } = useAuth();
  const { profile } = useProfile();
  const { theme, toggleTheme } = useTheme();
  const navigate = useNavigate();
  const location = useLocation();

  const [menuOpen, setMenuOpen] = useState(false);
  const [deferredPrompt, setDeferredPrompt] = useState<any>(null);

  const handleBack = () => {
    if (onBack) {
      onBack();
      return;
    }
    // Check if there is valid in-app history in this session
    if (window.history.state && typeof window.history.state.idx === 'number' && window.history.state.idx > 0) {
      navigate(-1);
    } else {
      navigate(backFallback || '/');
    }
  };

  useEffect(() => {
    const handleBeforeInstallPrompt = (e: any) => {
      e.preventDefault();
      setDeferredPrompt(e);
    };
    window.addEventListener('beforeinstallprompt', handleBeforeInstallPrompt);
    return () => {
      window.removeEventListener('beforeinstallprompt', handleBeforeInstallPrompt);
    };
  }, []);

  const handleInstallClick = async () => {
    if (deferredPrompt) {
      deferredPrompt.prompt();
      const { outcome } = await deferredPrompt.userChoice;
      if (outcome === 'accepted') {
        setDeferredPrompt(null);
      }
    }
  };

  const handleSignOut = async () => {
    try {
      const counts = await offlineQueueService.getCounts();
      const pendingTotal = counts.pending + counts.syncing + counts.awaiting_confirmation;
      if (pendingTotal > 0) {
        toast.warning(
          `تنبيه: يوجد ${pendingTotal} عملية غير متزامنة على هذا الجهاز. تم الاحتفاظ بالبيانات محلياً ولن تُحذف.`
        );
      }
    } catch {}
    await signOut();
    navigate('/auth');
  };

  const displayName = profile?.full_name || (user as any)?.displayName || user?.email?.split('@')[0] || 'User';
  const initials = displayName.charAt(0) || 'U';
  const isPOS = location.pathname === '/pos';

  return (
    <div className={cn("bg-background", isPOS ? "h-[100dvh] max-h-[100dvh] overflow-hidden" : "min-h-[100dvh]")}>
      {!isPOS && <Sidebar />}
      {!isPOS && <ConnectivityBanner />}

      <motion.main
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ duration: 0.5, ease: [0.2, 0.8, 0.2, 1] }}
        className={cn(
          isPOS
            ? "h-[100dvh] max-h-[100dvh] overflow-hidden p-0 w-full relative"
            : cn(
                "min-h-[100dvh] pt-2 md:pt-4 px-2 md:px-6 w-full max-w-[1800px] mx-auto relative transition-all duration-300 pb-24",
                bottomNavVisible ? "md:pb-28" : "md:pb-12"
              )
        )}
      >
        {/* Top Header - Omitted on POS */}
        {!isPOS && (
        <header className={cn(
          "sticky top-0 z-40 transition-all duration-500",
          isMobile 
            ? "glass border-b border-border/40 shadow-[0_4px_30px_rgba(0,0,0,0.03)] safe-area-top" 
            : "mt-4 mx-6 rounded-[24px] glass-panel shadow-[0_8px_32px_rgba(0,0,0,0.04)]"
        )}>
          <div className="flex items-center justify-between px-3 md:px-6 h-14 md:h-20">
            {/* Title Section */}
            <div className="min-w-0 flex-1 flex items-center gap-2 md:gap-3">
              {isMobile && (
                <Sheet open={menuOpen} onOpenChange={setMenuOpen}>
                  <SheetTrigger asChild>
                    <Button variant="ghost" size="icon" className="h-10 w-10 shrink-0 rounded-xl hover:bg-muted/80 touch-manipulation" aria-label="قائمة التنقل">
                      <Menu className="w-5 h-5 text-foreground" />
                    </Button>
                  </SheetTrigger>
                  <SheetContent side="right" className="p-0 w-72 max-w-[85vw] border-l border-border/40 font-cairo">
                    <SheetTitle className="sr-only">قائمة التنقل</SheetTitle>
                    <SheetDescription className="sr-only">عناصر التنقل للنظام</SheetDescription>
                    <SidebarContent isMobile={true} onNavigate={() => setMenuOpen(false)} />
                  </SheetContent>
                </Sheet>
              )}

              {/* Mobile Back Button: Active on subpages or when showBack is explicitly requested */}
              {isMobile && (showBack ?? (location.pathname !== '/' && location.pathname !== '/pos')) && (
                <Button
                  variant="ghost"
                  size="icon"
                  onClick={handleBack}
                  className="h-10 w-10 shrink-0 rounded-xl hover:bg-muted/80 touch-manipulation text-foreground"
                  aria-label="الرجوع"
                  title="الرجوع"
                >
                  <ArrowRight className="w-5 h-5 rtl:rotate-0 ltr:rotate-180" />
                </Button>
              )}

              <div className="flex flex-col min-w-0">
                {title && <h1 className="text-base sm:text-lg md:text-2xl font-black bg-gradient-to-l from-foreground to-foreground/70 bg-clip-text text-transparent truncate tracking-tight">{title}</h1>}
                {subtitle && <p className="text-[11px] sm:text-[13px] text-muted-foreground truncate hidden sm:block font-medium mt-0.5 opacity-80">{subtitle}</p>}
              </div>
            </div>

            {/* Actions Section */}
            <div className="flex items-center gap-3 md:gap-5 flex-shrink-0">
              {!isMobile && actions}

              {/* Status & Time Group */}
              <div className="hidden lg:flex items-center gap-3 mr-2 border-l border-border/50 pl-4">
                {/* Live Clock Component */}
                <LiveClock />

                {/* Connection Status Pill with Sync Center Trigger */}
                <ConnectivityBanner compact />
              </div>

              {/* Install App Button */}
              {deferredPrompt && (
                <Button 
                  onClick={handleInstallClick} 
                  variant="default" 
                  size="sm" 
                  className="hidden sm:flex gap-2 rounded-full shadow-lg shadow-primary/20 hover:-translate-y-0.5 transition-all text-xs font-bold"
                >
                  <Download className="w-3.5 h-3.5" />
                  تثبيت النظام
                </Button>
              )}

              {/* Notification Bell */}
              <NotificationBell />

              {/* Theme Toggle */}
              <Button 
                variant="outline" 
                size="icon" 
                className="h-10 w-10 rounded-full border-border/50 shadow-sm hover:shadow-md hover:border-primary/30 transition-all duration-300 bg-background/50 backdrop-blur-sm" 
                onClick={toggleTheme}
              >
                {theme === 'dark' ? <Sun className="w-4 h-4 text-amber-500 animate-in spin-in-12" /> : <Moon className="w-4 h-4 text-indigo-500 animate-in spin-in-12" />}
              </Button>

              {/* Bottom Nav Toggle */}
              <Tooltip>
                <TooltipTrigger asChild>
                  <Button
                    variant="outline"
                    size="icon"
                    className="hidden md:flex h-10 w-10 rounded-full border-border/50 shadow-sm hover:shadow-md hover:border-primary/30 transition-all duration-300 bg-background/50 backdrop-blur-sm"
                    onClick={toggleBottomNav}
                    aria-label="تبديل إظهار شريط القوائم"
                  >
                    {bottomNavVisible ? (
                      <EyeOff className="w-4 h-4 text-muted-foreground hover:text-foreground transition-colors" />
                    ) : (
                      <Eye className="w-4 h-4 text-primary animate-pulse" />
                    )}
                  </Button>
                </TooltipTrigger>
                <TooltipContent side="bottom" className="font-cairo text-xs font-bold">
                  {bottomNavVisible ? 'إخفاء شريط القوائم السفلي (Ctrl+B)' : 'إظهار شريط القوائم السفلي (Ctrl+B)'}
                </TooltipContent>
              </Tooltip>

              {/* User Dropdown */}
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button variant="ghost" className="h-10 p-1 lg:pl-4 rounded-full border border-border/50 shadow-sm bg-background/50 hover:bg-accent/80 hover:shadow-md transition-all duration-300 gap-3 group outline-none overflow-hidden">
                    <div className="w-8 h-8 rounded-full shrink-0 bg-gradient-to-tr from-primary to-primary/80 shadow-md text-primary-foreground flex items-center justify-center font-bold text-sm border border-white/20 group-hover:scale-105 transition-transform">
                      {initials}
                    </div>
                    <span className="hidden lg:inline text-[13px] font-bold text-foreground truncate">{displayName}</span>
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="start" className="w-64 p-2 rounded-2xl shadow-2xl border-border/50 backdrop-blur-xl bg-background/95">
                  <DropdownMenuLabel className="p-3">
                    <div className="flex items-center gap-3">
                      <div className="w-10 h-10 rounded-full bg-primary/10 flex items-center justify-center text-primary font-bold text-lg">
                        {initials}
                      </div>
                      <div className="flex-1 overflow-hidden">
                        <p className="font-bold text-sm truncate">{displayName}</p>
                        <p className="text-[11px] text-muted-foreground truncate">{user?.email}</p>
                      </div>
                    </div>
                  </DropdownMenuLabel>
                  <DropdownMenuSeparator className="opacity-50" />
                  <div className="p-1">
                    <DropdownMenuItem className="rounded-xl px-3 py-2.5 cursor-pointer text-[13px] font-medium transition-colors hover:bg-primary/5 hover:text-primary">
                      <User className="w-4 h-4 ml-2 opacity-70" />
                      إعدادات الحساب
                    </DropdownMenuItem>
                    <DropdownMenuItem
                      className="rounded-xl px-3 py-2.5 cursor-pointer text-[13px] font-medium transition-colors hover:bg-primary/5 hover:text-primary"
                      onClick={toggleBottomNav}
                    >
                      {bottomNavVisible ? (
                        <>
                          <EyeOff className="w-4 h-4 ml-2 opacity-70" />
                          إخفاء شريط القوائم (Ctrl+B)
                        </>
                      ) : (
                        <>
                          <Eye className="w-4 h-4 ml-2 opacity-70" />
                          إظهار شريط القوائم (Ctrl+B)
                        </>
                      )}
                    </DropdownMenuItem>
                    <DropdownMenuItem className="rounded-xl px-3 py-2.5 cursor-pointer text-[13px] font-medium text-red-500 transition-colors hover:bg-red-500/10 hover:text-red-600 focus:bg-red-500/10 focus:text-red-600 mt-1" onClick={handleSignOut}>
                      <LogOut className="w-4 h-4 ml-2 opacity-70" />
                      تسجيل الخروج
                    </DropdownMenuItem>
                  </div>
                </DropdownMenuContent>
              </DropdownMenu>

            </div>
          </div>
          {/* Mobile Actions Below Header */}
          {isMobile && actions && (
            <div className="px-3 sm:px-4 pb-3 flex items-center gap-2 overflow-x-auto no-scrollbar max-w-full">
              {actions}
            </div>
          )}
        </header>
        )}

        {isPOS || fullBleed ? (
          children
        ) : (
          <div className="p-2 sm:p-4 md:p-6 pb-6 md:pb-12">
            <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.3 }}>
              {children}
            </motion.div>
          </div>
        )}
      </motion.main>

      {/* Native Mobile Bottom Navigation Dock */}
      {!isPOS && <MobileBottomNav />}
    </div>
  );
}
