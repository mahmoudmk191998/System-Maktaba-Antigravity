import { useState, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { MainLayout } from '@/components/layout';
import { useNotificationsStore } from '@/lib/notifications.store';
import type { AppNotification, NotificationCategory } from '@/types/notifications.types';
import { resolveNotificationRoute } from '@/lib/notificationRoutes';
import { useAuth } from '@/hooks/useAuth';
import { useUserPermissions } from '@/hooks/usePermissions';
import {
  Bell,
  CheckCircle,
  Info,
  AlertTriangle,
  XCircle,
  Check,
  Clock,
  Receipt,
  Boxes,
  Truck,
  Wallet,
  Banknote,
  ShieldAlert,
  Search,
  ExternalLink,
  ChevronRight,
  ChevronLeft,
  Filter,
} from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { cn } from '@/lib/utils';
import { formatDistanceToNow, format } from 'date-fns';
import { arEG } from 'date-fns/locale';
import { toast } from 'sonner';

const ITEMS_PER_PAGE = 20;

export default function NotificationsHistory() {
  const navigate = useNavigate();
  const { user } = useAuth();
  const { hasPermission, isAdmin, isOwner } = useUserPermissions();

  const { notifications, unreadCount, markAsRead, markAllAsRead } = useNotificationsStore();

  const [activeTab, setActiveTab] = useState<'all' | 'unread' | 'active' | 'important'>('all');
  const [selectedCategory, setSelectedCategory] = useState<string>('all');
  const [searchQuery, setSearchQuery] = useState('');
  const [currentPage, setCurrentPage] = useState(1);

  // Category items definition
  const categories = [
    { id: 'all', label: 'كل الأقسام' },
    { id: 'orders', label: 'المبيعات والطلبات', icon: Receipt },
    { id: 'inventory', label: 'المخزون والهالك', icon: Boxes },
    { id: 'suppliers', label: 'الموردين والمشتريات', icon: Truck },
    { id: 'payroll', label: 'المرتبات والسلف', icon: Wallet },
    { id: 'expenses', label: 'المصروفات', icon: Banknote },
    { id: 'attendance', label: 'الحضور والانصراف', icon: Clock },
    { id: 'security', label: 'الأمان والصلاحيات', icon: ShieldAlert },
  ];

  // Filtered notifications
  const filteredNotifications = useMemo(() => {
    return notifications.filter((notif) => {
      // 1. Tab filter
      if (activeTab === 'unread' && notif.read) return false;
      if (activeTab === 'active' && notif.status !== 'active') return false;
      if (activeTab === 'important' && notif.priority !== 'high' && notif.priority !== 'critical') {
        return false;
      }

      // 2. Category filter
      if (selectedCategory !== 'all') {
        if (selectedCategory === 'inventory' && notif.category !== 'inventory' && notif.category !== 'waste') {
          return false;
        } else if (selectedCategory === 'suppliers' && notif.category !== 'suppliers' && notif.category !== 'purchases') {
          return false;
        } else if (selectedCategory === 'payroll' && notif.category !== 'payroll' && notif.category !== 'advances') {
          return false;
        } else if (selectedCategory !== 'inventory' && selectedCategory !== 'suppliers' && selectedCategory !== 'payroll' && notif.category !== selectedCategory) {
          return false;
        }
      }

      // 3. Search text
      if (searchQuery.trim()) {
        const q = searchQuery.toLowerCase();
        const matchesTitle = notif.title.toLowerCase().includes(q);
        const matchesMsg = notif.message.toLowerCase().includes(q);
        if (!matchesTitle && !matchesMsg) return false;
      }

      return true;
    });
  }, [notifications, activeTab, selectedCategory, searchQuery]);

  // Pagination calculation
  const totalPages = Math.max(1, Math.ceil(filteredNotifications.length / ITEMS_PER_PAGE));
  const paginatedNotifications = useMemo(() => {
    const start = (currentPage - 1) * ITEMS_PER_PAGE;
    return filteredNotifications.slice(start, start + ITEMS_PER_PAGE);
  }, [filteredNotifications, currentPage]);

  const handleActionClick = (notif: AppNotification) => {
    try {
      if (user?.uid) {
        markAsRead(notif.id, user.uid);
      }

      if (notif.requiredPermission && !isAdmin && !isOwner) {
        if (!hasPermission(notif.requiredPermission)) {
          toast.error('ليس لديك الصلاحية المطلوبة للوصول لهذا الإجراء');
          return;
        }
      }

      const targetRoute = resolveNotificationRoute(notif);
      navigate(targetRoute);
    } catch (err) {
      console.error('Failed to navigate to notification route:', err);
      toast.error('تعذر فتح الصفحة المرتبطة بهذا الإشعار');
      navigate('/');
    }
  };

  const getCategoryIcon = (category: string, type: string) => {
    switch (category) {
      case 'orders':
        return <Receipt className="w-5 h-5 text-blue-500" />;
      case 'inventory':
      case 'waste':
        return <Boxes className="w-5 h-5 text-amber-500" />;
      case 'suppliers':
      case 'purchases':
        return <Truck className="w-5 h-5 text-indigo-500" />;
      case 'payroll':
      case 'advances':
        return <Wallet className="w-5 h-5 text-emerald-500" />;
      case 'expenses':
        return <Banknote className="w-5 h-5 text-rose-500" />;
      case 'security':
        return <ShieldAlert className="w-5 h-5 text-rose-600" />;
      case 'attendance':
        return <Clock className="w-5 h-5 text-purple-500" />;
      default:
        if (type === 'success') return <CheckCircle className="w-5 h-5 text-emerald-500" />;
        if (type === 'critical') return <XCircle className="w-5 h-5 text-rose-500" />;
        if (type === 'warning') return <AlertTriangle className="w-5 h-5 text-amber-500" />;
        return <Info className="w-5 h-5 text-blue-500" />;
    }
  };

  return (
    <MainLayout
      title="مركز الإشعارات والتنبيهات"
      subtitle="سجل كامل بجميع التنبيهات الذكية وأنشطة النظام المرتبطة بصلاحياتك وفروعك"
      actions={
        unreadCount > 0 ? (
          <Button
            onClick={() => user?.uid && markAllAsRead(user.uid)}
            variant="outline"
            className="gap-2 font-bold"
          >
            <Check className="w-4 h-4 text-primary" />
            تحديد الكل كمقروء ({unreadCount})
          </Button>
        ) : undefined
      }
    >
      <div className="space-y-6">
        {/* Filter Controls Card */}
        <Card className="border-border/50 shadow-sm bg-card/60 backdrop-blur-sm">
          <CardContent className="p-4 sm:p-6 space-y-4">
            <div className="flex flex-col md:flex-row gap-4 justify-between items-start md:items-center">
              {/* Tabs */}
              <Tabs
                value={activeTab}
                onValueChange={(val: any) => {
                  setActiveTab(val);
                  setCurrentPage(1);
                }}
                className="w-full md:w-auto"
              >
                <TabsList className="grid grid-cols-4 w-full md:w-auto">
                  <TabsTrigger value="all" className="font-bold text-xs sm:text-sm">
                    الكل ({notifications.length})
                  </TabsTrigger>
                  <TabsTrigger value="unread" className="font-bold text-xs sm:text-sm">
                    غير مقروء ({unreadCount})
                  </TabsTrigger>
                  <TabsTrigger value="active" className="font-bold text-xs sm:text-sm">
                    تنبيهات نشطة
                  </TabsTrigger>
                  <TabsTrigger value="important" className="font-bold text-xs sm:text-sm">
                    هام وحرج
                  </TabsTrigger>
                </TabsList>
              </Tabs>

              {/* Search Bar */}
              <div className="relative w-full md:w-72">
                <Search className="w-4 h-4 absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
                <Input
                  placeholder="بحث في الإشعارات..."
                  value={searchQuery}
                  onChange={(e) => {
                    setSearchQuery(e.target.value);
                    setCurrentPage(1);
                  }}
                  className="pr-9 h-10 rounded-xl bg-background/50 text-sm"
                />
              </div>
            </div>

            {/* Category Filter Pills */}
            <div className="flex items-center gap-1.5 overflow-x-auto pb-1 pt-1 no-scrollbar">
              <span className="text-xs font-bold text-muted-foreground ml-2 flex items-center gap-1 shrink-0">
                <Filter className="w-3.5 h-3.5" />
                الأقسام:
              </span>
              {categories.map((cat) => (
                <button
                  key={cat.id}
                  onClick={() => {
                    setSelectedCategory(cat.id);
                    setCurrentPage(1);
                  }}
                  className={cn(
                    'px-3 py-1.5 rounded-full text-xs font-bold transition-all shrink-0 flex items-center gap-1.5 border',
                    selectedCategory === cat.id
                      ? 'bg-primary text-primary-foreground border-primary shadow-sm'
                      : 'bg-background/80 text-muted-foreground border-border/50 hover:border-primary/40 hover:text-foreground'
                  )}
                >
                  {cat.icon && <cat.icon className="w-3 h-3" />}
                  {cat.label}
                </button>
              ))}
            </div>
          </CardContent>
        </Card>

        {/* Notifications List */}
        <Card className="border-border/50 shadow-sm overflow-hidden">
          <CardHeader className="p-4 sm:p-6 border-b border-border/30 bg-muted/20">
            <div className="flex items-center justify-between">
              <div>
                <CardTitle className="text-base sm:text-lg font-black">
                  قائمة الإشعارات
                </CardTitle>
                <CardDescription className="text-xs mt-1">
                  عرض {paginatedNotifications.length} من إجمالي {filteredNotifications.length} إشعار
                </CardDescription>
              </div>

              {filteredNotifications.length > 0 && (
                <span className="text-xs font-bold text-muted-foreground">
                  الصفحة {currentPage} من {totalPages}
                </span>
              )}
            </div>
          </CardHeader>

          <CardContent className="p-0">
            {paginatedNotifications.length === 0 ? (
              <div className="flex flex-col items-center justify-center p-12 text-center">
                <div className="w-16 h-16 rounded-full bg-muted/30 flex items-center justify-center mb-4">
                  <Bell className="w-8 h-8 text-muted-foreground opacity-30" />
                </div>
                <h4 className="text-base font-bold text-foreground">لا توجد إشعارات تطابق الاختيار</h4>
                <p className="text-xs text-muted-foreground max-w-sm mt-1">
                  لا توجد نتائج مسجلة وفق التبويب أو القسم المحدد حالياً.
                </p>
                {(selectedCategory !== 'all' || searchQuery || activeTab !== 'all') && (
                  <Button
                    variant="link"
                    size="sm"
                    onClick={() => {
                      setSelectedCategory('all');
                      setSearchQuery('');
                      setActiveTab('all');
                      setCurrentPage(1);
                    }}
                    className="mt-3 text-xs font-bold"
                  >
                    إعادة ضبط الفلاتر
                  </Button>
                )}
              </div>
            ) : (
              <div className="divide-y divide-border/40">
                {paginatedNotifications.map((notif) => (
                  <div
                    key={notif.id}
                    onClick={() => handleActionClick(notif)}
                    className={cn(
                      'p-4 sm:p-5 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 transition-all cursor-pointer hover:bg-accent/40',
                      !notif.read ? 'bg-primary/5 dark:bg-primary/10 font-medium' : 'bg-transparent'
                    )}
                  >
                    <div className="flex items-start gap-4 flex-1">
                      <div className="p-3 rounded-2xl bg-card border border-border/40 shadow-xs mt-0.5 shrink-0">
                        {getCategoryIcon(notif.category, notif.type)}
                      </div>

                      <div className="space-y-1.5 flex-1">
                        <div className="flex flex-wrap items-center gap-2">
                          <h4 className={cn('text-sm sm:text-base font-bold', notif.read ? 'text-foreground/80' : 'text-foreground')}>
                            {notif.title}
                          </h4>

                          {/* Priority Badge */}
                          {notif.priority === 'critical' && (
                            <Badge variant="destructive" className="text-[10px] px-2 py-0.2 font-black">
                              حرج
                            </Badge>
                          )}
                          {notif.priority === 'high' && (
                            <Badge className="bg-amber-500 hover:bg-amber-600 text-white text-[10px] px-2 py-0.2 font-black">
                              هام
                            </Badge>
                          )}

                          {/* Status Badge */}
                          {notif.status === 'resolved' ? (
                            <Badge variant="outline" className="text-[10px] text-emerald-600 border-emerald-500/30">
                              تم الحل
                            </Badge>
                          ) : notif.status === 'active' && (notif.priority === 'high' || notif.priority === 'critical') ? (
                            <Badge variant="outline" className="text-[10px] text-rose-600 border-rose-500/30 animate-pulse">
                              نشط
                            </Badge>
                          ) : null}

                          {/* Unread Tag */}
                          {!notif.read && (
                            <span className="w-2 h-2 rounded-full bg-primary inline-block" />
                          )}
                        </div>

                        <p className="text-xs sm:text-sm text-muted-foreground leading-relaxed max-w-3xl">
                          {notif.message}
                        </p>

                        <div className="flex flex-wrap items-center gap-3 pt-1 text-[11px] text-muted-foreground/70">
                          <span className="flex items-center gap-1 font-semibold">
                            <Clock className="w-3 h-3" />
                            {formatDistanceToNow(new Date(notif.createdAt), {
                              addSuffix: true,
                              locale: arEG,
                            })}
                          </span>
                          <span>•</span>
                          <span>{format(new Date(notif.createdAt), 'yyyy/MM/dd HH:mm')}</span>
                        </div>
                      </div>
                    </div>

                    {/* Action button */}
                    <div className="flex items-center gap-2 self-end sm:self-center shrink-0">
                      {!notif.read && (
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={(e) => {
                            e.stopPropagation();
                            if (user?.uid) markAsRead(notif.id, user.uid);
                          }}
                          className="h-8 text-xs font-bold text-muted-foreground hover:text-foreground"
                        >
                          <Check className="w-3.5 h-3.5 ml-1" />
                          مقروء
                        </Button>
                      )}

                      {notif.actionRoute && (
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={(e) => {
                            e.stopPropagation();
                            handleActionClick(notif);
                          }}
                          className="h-8 text-xs font-bold gap-1 rounded-xl"
                        >
                          عرض الإجراء
                          <ExternalLink className="w-3 h-3" />
                        </Button>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </CardContent>

          {/* Pagination Controls */}
          {totalPages > 1 && (
            <div className="p-4 border-t border-border/30 bg-muted/20 flex items-center justify-between">
              <Button
                variant="outline"
                size="sm"
                disabled={currentPage === 1}
                onClick={() => setCurrentPage((p) => Math.max(1, p - 1))}
                className="gap-1 font-bold text-xs"
              >
                <ChevronRight className="w-4 h-4" />
                الصفحة السابقة
              </Button>

              <span className="text-xs font-bold text-muted-foreground">
                صفحة {currentPage} من {totalPages}
              </span>

              <Button
                variant="outline"
                size="sm"
                disabled={currentPage === totalPages}
                onClick={() => setCurrentPage((p) => Math.min(totalPages, p + 1))}
                className="gap-1 font-bold text-xs"
              >
                الصفحة التالية
                <ChevronLeft className="w-4 h-4" />
              </Button>
            </div>
          )}
        </Card>
      </div>
    </MainLayout>
  );
}
