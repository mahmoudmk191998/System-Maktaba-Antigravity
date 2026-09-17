import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useNotificationsStore } from '@/lib/notifications.store';
import type { AppNotification } from '@/types/notifications.types';
import { resolveNotificationRoute } from '@/lib/notificationRoutes';
import { useAuth } from '@/hooks/useAuth';
import { useUserPermissions } from '@/hooks/usePermissions';
import { useTenantBranch } from '@/hooks/useDatabase';
import {
  Bell,
  CheckCircle,
  Info,
  AlertTriangle,
  XCircle,
  Trash2,
  Check,
  Clock,
  Receipt,
  Boxes,
  Truck,
  Wallet,
  Banknote,
  ShieldAlert,
  ArrowLeft,
  ExternalLink,
} from 'lucide-react';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { cn } from '@/lib/utils';
import { formatDistanceToNow } from 'date-fns';
import { arEG } from 'date-fns/locale';
import { toast } from 'sonner';

export function NotificationBell() {
  const navigate = useNavigate();
  const { user } = useAuth();
  const { hasPermission, isAdmin, isOwner, userRole } = useUserPermissions();
  const { branchId } = useTenantBranch();

  const {
    notifications,
    unreadCount,
    markAsRead,
    markAllAsRead,
    removeNotification,
    initNotifications,
  } = useNotificationsStore();

  const [open, setOpen] = useState(false);

  // Initialize bounded real-time listener for current user and permissions
  useEffect(() => {
    if (!user?.uid) return;

    const cleanup = initNotifications({
      userId: user.uid,
      userBranchId: branchId || null,
      role: userRole || undefined,
      hasPermission,
      isAdmin,
      isOwner,
    });

    return () => {
      cleanup();
    };
  }, [user?.uid, branchId, userRole, isAdmin, isOwner, initNotifications]);

  const getCategoryIcon = (category: string, type: string) => {
    switch (category) {
      case 'orders':
        return <Receipt className="w-4 h-4 text-blue-500" />;
      case 'inventory':
      case 'waste':
        return <Boxes className="w-4 h-4 text-amber-500" />;
      case 'suppliers':
      case 'purchases':
        return <Truck className="w-4 h-4 text-indigo-500" />;
      case 'payroll':
      case 'advances':
        return <Wallet className="w-4 h-4 text-emerald-500" />;
      case 'expenses':
        return <Banknote className="w-4 h-4 text-rose-500" />;
      case 'security':
        return <ShieldAlert className="w-4 h-4 text-rose-600" />;
      case 'attendance':
        return <Clock className="w-4 h-4 text-purple-500" />;
      default:
        if (type === 'success') return <CheckCircle className="w-4 h-4 text-emerald-500" />;
        if (type === 'critical') return <XCircle className="w-4 h-4 text-rose-500" />;
        if (type === 'warning') return <AlertTriangle className="w-4 h-4 text-amber-500" />;
        return <Info className="w-4 h-4 text-blue-500" />;
    }
  };

  const getNotificationBg = (type: string, read: boolean) => {
    if (read) return 'bg-transparent border-transparent hover:bg-muted/40';
    switch (type) {
      case 'critical':
        return 'bg-rose-500/10 border-rose-500/30';
      case 'warning':
        return 'bg-amber-500/10 border-amber-500/30';
      case 'success':
        return 'bg-emerald-500/10 border-emerald-500/30';
      case 'info':
      default:
        return 'bg-primary/5 border-primary/20';
    }
  };

  const handleActionClick = (notif: AppNotification) => {
    try {
      if (user?.uid) {
        markAsRead(notif.id, user.uid);
      }

      // Security Re-check: ensure user still has permission before navigating
      if (notif.requiredPermission && !isAdmin && !isOwner) {
        if (!hasPermission(notif.requiredPermission)) {
          toast.error('ليس لديك الصلاحية المطلوبة للوصول لهذا الإجراء');
          return;
        }
      }

      const targetRoute = resolveNotificationRoute(notif);
      setOpen(false);
      navigate(targetRoute);
    } catch (err) {
      console.error('Failed to navigate to notification action route:', err);
      toast.error('تعذر فتح الصفحة المرتبطة بهذا الإشعار');
      setOpen(false);
      navigate('/');
    }
  };

  const handleMarkAllRead = () => {
    if (user?.uid) {
      markAllAsRead(user.uid);
    }
  };

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <button
          aria-label={`الإشعارات ${unreadCount > 0 ? `(${unreadCount} غير مقروء)` : ''}`}
          className="relative w-10 h-10 rounded-full border border-border/50 bg-background/50 backdrop-blur-sm flex items-center justify-center hover:bg-accent/80 transition-all outline-none"
        >
          <Bell className="w-5 h-5 text-foreground/80" />
          {unreadCount > 0 && (
            <span className="absolute -top-1 -right-1 flex h-4 min-w-4 px-1 items-center justify-center rounded-full bg-rose-500 text-[10px] font-bold text-white shadow-sm shadow-rose-500/30 ring-2 ring-background animate-in zoom-in">
              {unreadCount > 99 ? '99+' : unreadCount}
            </span>
          )}
        </button>
      </PopoverTrigger>

      <PopoverContent
        align="end"
        className="w-80 sm:w-96 p-0 rounded-2xl shadow-2xl border-border/50 overflow-hidden"
      >
        <div className="flex items-center justify-between p-4 border-b border-border/40 bg-card/60 backdrop-blur-md">
          <div className="flex items-center gap-2">
            <h3 className="font-black text-lg">مركز الإشعارات</h3>
            {unreadCount > 0 && (
              <Badge variant="secondary" className="text-xs px-2 py-0.5 rounded-full font-bold">
                {unreadCount} جديد
              </Badge>
            )}
          </div>
          {unreadCount > 0 && (
            <Button
              variant="ghost"
              size="sm"
              onClick={handleMarkAllRead}
              className="h-8 text-xs font-bold text-primary hover:bg-primary/10"
            >
              <Check className="w-3.5 h-3.5 ml-1" />
              تحديد الكل كمقروء
            </Button>
          )}
        </div>

        <ScrollArea className="h-[380px] bg-background/30 backdrop-blur-md">
          {notifications.length === 0 ? (
            <div className="flex flex-col items-center justify-center h-52 p-8 text-center opacity-70">
              <div className="w-12 h-12 rounded-full bg-muted/30 flex items-center justify-center mb-3">
                <Bell className="w-6 h-6 text-muted-foreground opacity-40" />
              </div>
              <p className="text-sm font-bold text-muted-foreground">لا توجد إشعارات حالية</p>
              <p className="text-xs text-muted-foreground/70 mt-1">
                سوف تتلقى تنبيهات فورية عند حدوث أنشطة هامة
              </p>
            </div>
          ) : (
            <div className="flex flex-col p-2 space-y-1.5">
              {notifications.map((notif: AppNotification) => (
                <div
                  key={notif.id}
                  onClick={() => handleActionClick(notif)}
                  className={cn(
                    'group relative flex items-start gap-3 p-3 rounded-xl border transition-all cursor-pointer',
                    getNotificationBg(notif.type, notif.read || false)
                  )}
                >
                  <div className="mt-0.5 shrink-0 p-2 rounded-lg bg-background/80 border border-border/30 shadow-xs">
                    {getCategoryIcon(notif.category, notif.type)}
                  </div>

                  <div className="flex-1 space-y-1 overflow-hidden">
                    <div className="flex items-center gap-1.5">
                      <p
                        className={cn(
                          'text-sm font-bold truncate leading-tight',
                          notif.read ? 'text-foreground/80' : 'text-foreground'
                        )}
                      >
                        {notif.title}
                      </p>
                      {notif.priority === 'critical' && (
                        <span className="text-[10px] bg-rose-500/20 text-rose-600 font-bold px-1.5 py-0.2 rounded shrink-0">
                          حرج
                        </span>
                      )}
                      {notif.priority === 'high' && (
                        <span className="text-[10px] bg-amber-500/20 text-amber-600 font-bold px-1.5 py-0.2 rounded shrink-0">
                          هام
                        </span>
                      )}
                    </div>

                    <p className="text-xs text-muted-foreground line-clamp-2 leading-relaxed">
                      {notif.message}
                    </p>

                    <div className="flex items-center justify-between pt-1">
                      <p className="text-[10px] text-muted-foreground/70 font-semibold flex items-center gap-1">
                        <Clock className="w-3 h-3" />
                        {formatDistanceToNow(new Date(notif.createdAt), {
                          addSuffix: true,
                          locale: arEG,
                        })}
                      </p>

                      {notif.actionRoute && (
                        <span className="text-[10px] text-primary font-bold flex items-center gap-0.5 hover:underline">
                          عرض
                          <ExternalLink className="w-2.5 h-2.5" />
                        </span>
                      )}
                    </div>
                  </div>

                  {/* Remove button */}
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      removeNotification(notif.id);
                    }}
                    title="حذف من العرض"
                    className="opacity-0 group-hover:opacity-100 p-1.5 rounded-md hover:bg-background/80 hover:text-rose-500 transition-all text-muted-foreground shrink-0"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                  </button>

                  {/* Unread indicator badge */}
                  {!notif.read && (
                    <div className="absolute top-3 left-2 w-2 h-2 rounded-full bg-primary ring-2 ring-background" />
                  )}
                </div>
              ))}
            </div>
          )}
        </ScrollArea>

        {/* Footer actions */}
        <div className="p-2.5 border-t border-border/40 bg-card/60 flex items-center justify-between gap-2">
          <Button
            variant="ghost"
            size="sm"
            onClick={() => {
              setOpen(false);
              navigate('/notifications');
            }}
            className="w-full h-8 text-xs font-bold text-foreground/80 hover:text-primary hover:bg-primary/10 transition-colors rounded-xl flex items-center justify-center gap-1.5"
          >
            عرض سجل الإشعارات بالكامل
            <ArrowLeft className="w-3.5 h-3.5" />
          </Button>
        </div>
      </PopoverContent>
    </Popover>
  );
}
