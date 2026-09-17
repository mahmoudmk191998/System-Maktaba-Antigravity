import { MainLayout } from '@/components/layout';
import { useFormatters } from '@/lib/formatters';
import { useTenantBranch, useDashboardStats } from '@/hooks/useDatabase';
import { useAuth } from '@/hooks/useAuth';
import { useProfile } from '@/hooks/useProfile';
import {
  DollarSign, ShoppingCart, TrendingUp, Clock, CheckCircle, AlertTriangle, CalendarDays, PlusCircle, CreditCard, Users, Store, Bike, ArrowUpRight, ArrowLeft
} from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { motion } from 'framer-motion';
import { KPICard } from '@/components/dashboard';
import { Area, AreaChart, ResponsiveContainer, Tooltip, XAxis, YAxis, CartesianGrid, PieChart, Pie, Cell, Legend } from 'recharts';
import { useNavigate } from 'react-router-dom';
import { useNotificationsStore } from '@/lib/notifications.store';
import { resolveNotificationRoute } from '@/lib/notificationRoutes';

export default function Dashboard() {
  const { currency, number } = useFormatters();
  const { tenantId, branchId } = useTenantBranch();
  const { stats, loading } = useDashboardStats(tenantId, branchId);
  const { user } = useAuth();
  const { profile } = useProfile();
  const navigate = useNavigate();

  // Calculate percentage changes
  const calcChange = (today: number, yesterday: number) => {
    if (yesterday === 0) return today > 0 ? 100 : 0;
    return ((today - yesterday) / yesterday) * 100;
  };

  const salesChange = calcChange(stats.todaySales, stats.yesterdaySales);
  const ordersChange = calcChange(stats.ordersCount, stats.yesterdayOrdersCount);
  const completedChange = calcChange(stats.completedOrders, stats.yesterdayCompletedOrders);

  const kpis = [
    { title: 'مبيعات اليوم', value: currency(stats.todaySales), change: salesChange, changeLabel: 'مقارنة بالأمس', icon: DollarSign, iconColor: 'success' as const },
    { title: 'عدد الطلبات', value: number(stats.ordersCount), change: ordersChange, changeLabel: 'مقارنة بالأمس', icon: ShoppingCart, iconColor: 'primary' as const },
    { title: 'متوسط قيمة الطلب', value: currency(stats.averageOrderValue), icon: TrendingUp, iconColor: 'info' as const },
    { title: 'طلبات مكتملة', value: number(stats.completedOrders), change: completedChange, changeLabel: 'مقارنة بالأمس', icon: CheckCircle, iconColor: 'warning' as const },
  ];

  const displayName = profile?.full_name || user?.displayName || (user?.email ? user.email.split('@')[0] : 'أهلاً بك');
  const currentDate = new Intl.DateTimeFormat('ar-EG', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' }).format(new Date());

  const COLORS = ['#3b82f6', '#10b981', '#8b5cf6', '#f59e0b', '#ef4444'];
  const { activeAlerts } = useNotificationsStore();

  return (
    <MainLayout title="لوحة التحكم" subtitle="نظرة عامة على أداء ومؤشرات المطعم">
      {/* Active High-Priority Alerts Banner */}
      {activeAlerts && activeAlerts.length > 0 && (
        <div className="mb-6 p-4 rounded-2xl bg-amber-500/10 border border-amber-500/30 backdrop-blur-md shadow-sm">
          <div className="flex items-center justify-between gap-4 mb-2.5">
            <div className="flex items-center gap-2 text-amber-600 dark:text-amber-400 font-black text-sm sm:text-base">
              <AlertTriangle className="w-5 h-5 shrink-0" />
              <span>تنبيهات تحتاج انتباهك ({activeAlerts.length})</span>
            </div>
            <button
              onClick={() => navigate('/notifications')}
              className="text-xs font-bold text-primary hover:underline flex items-center gap-1"
            >
              عرض الكل
              <ArrowLeft className="w-3.5 h-3.5" />
            </button>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2.5">
            {activeAlerts.slice(0, 3).map((alert) => (
              <div
                key={alert.id}
                onClick={() => navigate(resolveNotificationRoute(alert))}
                className="p-3 rounded-xl bg-card/80 border border-border/40 hover:border-amber-500/50 transition-all cursor-pointer flex items-start gap-2.5 group shadow-xs"
              >
                <div className="mt-1 w-2 h-2 rounded-full bg-amber-500 shrink-0" />
                <div className="flex-1 overflow-hidden">
                  <p className="text-xs font-bold text-foreground truncate group-hover:text-primary transition-colors">
                    {alert.title}
                  </p>
                  <p className="text-[11px] text-muted-foreground line-clamp-1 mt-0.5">
                    {alert.message}
                  </p>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Premium Hero Section */}
      <div className="mb-8 relative overflow-hidden rounded-[36px] border border-white/10 bg-gradient-to-br from-card/80 to-background/40 backdrop-blur-2xl shadow-[0_20px_50px_rgba(0,0,0,0.3)] group">
        {/* Ambient Animated Gradient Spotlight */}
        <div className="absolute -top-32 -right-32 w-96 h-96 bg-gradient-to-br from-cyan-500/20 via-blue-600/10 to-transparent blur-[80px] rounded-full opacity-60 group-hover:opacity-100 transition-opacity duration-1000 pointer-events-none" />
        <div className="absolute -bottom-32 -left-32 w-96 h-96 bg-gradient-to-tr from-indigo-500/20 via-purple-600/10 to-transparent blur-[80px] rounded-full opacity-40 group-hover:opacity-80 transition-opacity duration-1000 pointer-events-none" />

        {/* Inner Content Border Container */}
        <div className="relative bg-card/40 backdrop-blur-md rounded-[24px] sm:rounded-[32px] border border-white/5 m-1 p-4 sm:p-8 md:p-12 flex flex-col lg:flex-row items-center justify-between gap-6 sm:gap-8 z-10">

          {/* Text Content */}
          <div className="flex flex-col items-center lg:items-start text-center lg:text-right gap-4 sm:gap-5">

            {/* Live indicator Badge */}
            <div className="inline-flex items-center gap-2 sm:gap-3 px-3 sm:px-4 py-1.5 sm:py-2 rounded-full bg-black/20 border border-white/10 text-xs font-bold tracking-widest shadow-inner backdrop-blur-xl">
              <span className="relative flex h-2.5 w-2.5">
                <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-cyan-400 opacity-75"></span>
                <span className="relative inline-flex rounded-full h-2.5 w-2.5 bg-cyan-500"></span>
              </span>
              <span className="text-white/80 uppercase">الأنظمة متصلة</span>
              <span className="w-px h-4 bg-white/20 mx-1"></span>
              <span className="text-primary/90 flex items-center gap-1.5">
                <CalendarDays className="w-3.5 h-3.5" />
                {currentDate}
              </span>
            </div>

            <h1 className="text-2xl sm:text-4xl md:text-5xl font-black text-foreground tracking-tight leading-tight drop-shadow-sm">
              نظرة عامة على{' '}
              <span className="text-transparent bg-clip-text bg-gradient-to-l from-cyan-400 via-blue-500 to-indigo-500 drop-shadow-md">
                أداء اليوم
              </span>
            </h1>

            <p className="text-muted-foreground/90 text-sm md:text-lg max-w-2xl font-medium leading-relaxed">
              مرحباً <span className="font-bold text-white bg-white/10 px-2 py-0.5 rounded-md mx-1">{displayName}</span> 👋 جميع مؤشراتك جاهزة للمراجعة.
              تفقد الإحصائيات الحية لتعزيز الإنتاجية ودعم اتخاذ قراراتك أسرع من أي وقت مضى.
            </p>
          </div>

          {/* Abstract Graphic Element (Hidden on small screens) */}
          <div className="hidden lg:flex items-center justify-center relative shrink-0">
            <div className="w-40 h-40 rounded-full border border-white/5 bg-gradient-to-br from-white/5 to-transparent backdrop-blur-lg flex items-center justify-center shadow-inner relative overflow-hidden group-hover:border-cyan-500/30 transition-colors duration-700">
              {/* Internal rings */}
              <div className="absolute inset-3 border border-dashed border-cyan-400/20 rounded-full animate-[spin_10s_linear_infinite]"></div>
              <div className="absolute inset-6 border border-blue-500/20 rounded-full"></div>
              <div className="absolute inset-10 border border-indigo-500/10 rounded-full animate-[spin_15s_linear_infinite_reverse]"></div>

              <Store className="w-12 h-12 text-cyan-400 drop-shadow-[0_0_15px_rgba(34,211,238,0.5)] z-10" />
            </div>
          </div>

        </div>
      </div>

      {/* KPI Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-4 md:gap-6 mb-8">
        {kpis.map((kpi, index) => (
          <motion.div key={kpi.title} initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: index * 0.1 }}>
            <KPICard {...kpi} loading={loading} />
          </motion.div>
        ))}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 mb-8">
        {/* Revenue Chart */}
        <Card className="lg:col-span-2 shadow-sm border-border/50 bg-card/50 backdrop-blur-md rounded-3xl overflow-hidden">
          <CardHeader className="pb-2 border-b border-border/30 bg-card/40">
            <CardTitle className="text-lg font-black flex items-center gap-2">
              <TrendingUp className="w-5 h-5 text-primary" />
              إيرادات آخر 7 أيام
            </CardTitle>
          </CardHeader>
          <CardContent className="pt-6">
            {!stats.revenueData || stats.revenueData.length === 0 ? (
              <div className="h-[300px] flex items-center justify-center text-muted-foreground">جاري تحميل البيانات...</div>
            ) : (
              <div className="h-[300px] w-full">
                <ResponsiveContainer width="100%" height="100%">
                  <AreaChart data={stats.revenueData} margin={{ top: 10, right: 10, left: 0, bottom: 0 }}>
                    <defs>
                      <linearGradient id="colorRevenue" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="5%" stopColor="#3b82f6" stopOpacity={0.3} />
                        <stop offset="95%" stopColor="#3b82f6" stopOpacity={0} />
                      </linearGradient>
                    </defs>
                    <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#e5e7eb" opacity={0.5} />
                    <XAxis dataKey="date" axisLine={false} tickLine={false} tick={{ fill: '#6b7280', fontSize: 12, fontWeight: 'bold' }} dy={10} />
                    <YAxis axisLine={false} tickLine={false} tick={{ fill: '#6b7280', fontSize: 12, fontWeight: 'bold' }} tickFormatter={(value) => `${value}`} dx={-10} />
                    <Tooltip
                      contentStyle={{ borderRadius: '16px', border: '1px solid rgba(255,255,255,0.2)', boxShadow: '0 10px 15px -3px rgb(0 0 0 / 0.1)', backgroundColor: 'rgba(255, 255, 255, 0.95)', backdropFilter: 'blur(8px)' }}
                      formatter={(value: number) => [<span className="font-bold text-blue-600">{currency(value)}</span>, <span className="text-gray-500">الإيرادات</span>]}
                      labelStyle={{ color: '#111827', fontWeight: '900', marginBottom: '8px' }}
                    />
                    <Area type="monotone" dataKey="revenue" stroke="#3b82f6" strokeWidth={4} fillOpacity={1} fill="url(#colorRevenue)" animationDuration={1500} />
                  </AreaChart>
                </ResponsiveContainer>
              </div>
            )}
          </CardContent>
        </Card>

        {/* Order Distribution Chart */}
        <Card className="shadow-sm border-border/50 bg-card/50 backdrop-blur-md rounded-3xl overflow-hidden">
          <CardHeader className="pb-2 border-b border-border/30 bg-card/40">
            <CardTitle className="text-lg font-black flex items-center gap-2">
              <Store className="w-5 h-5 text-indigo-500" />
              توزيع الطلبات (اليوم)
            </CardTitle>
          </CardHeader>
          <CardContent className="pt-6">
            {!stats.orderDistribution || stats.orderDistribution.length === 0 ? (
              <div className="h-[300px] flex items-center justify-center text-muted-foreground">لا توجد طلبات اليوم</div>
            ) : (
              <div className="h-[300px] w-full relative">
                <ResponsiveContainer width="100%" height="100%">
                  <PieChart>
                    <Pie
                      data={stats.orderDistribution}
                      cx="50%"
                      cy="45%"
                      innerRadius={70}
                      outerRadius={100}
                      paddingAngle={5}
                      dataKey="value"
                      animationDuration={1500}
                    >
                      {stats.orderDistribution.map((entry, index) => (
                        <Cell key={`cell-${index}`} fill={entry.fill || COLORS[index % COLORS.length]} />
                      ))}
                    </Pie>
                    <Tooltip
                      formatter={(value: number) => [number(value) + ' طلب', 'العدد']}
                      contentStyle={{ borderRadius: '12px', border: 'none', boxShadow: '0 4px 6px -1px rgb(0 0 0 / 0.1)', fontWeight: 'bold' }}
                    />
                    <Legend verticalAlign="bottom" height={36} wrapperStyle={{ fontWeight: 'bold', fontSize: '13px' }} />
                  </PieChart>
                </ResponsiveContainer>
                {/* Center text for Donut */}
                <div className="absolute top-[45%] left-1/2 -translate-x-1/2 -translate-y-1/2 text-center pointer-events-none">
                  <p className="text-3xl font-black text-foreground">{number(stats.ordersCount)}</p>
                  <p className="text-xs text-muted-foreground font-bold">إجمالي الطلبات</p>
                </div>
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 mb-6">
        {/* Top Selling Items */}
        <Card className="lg:col-span-1 shadow-sm border-border/50 bg-card/50 backdrop-blur-md rounded-3xl overflow-hidden">
          <CardHeader className="pb-4 border-b border-border/30 bg-card/40">
            <CardTitle className="text-lg font-black flex items-center gap-2">
              <ArrowUpRight className="w-5 h-5 text-emerald-500" />
              الأصناف الأكثر مبيعاً
            </CardTitle>
          </CardHeader>
          <CardContent className="pt-4 px-4">
            {!stats.topSellingItems || stats.topSellingItems.length === 0 ? (
              <p className="text-center text-muted-foreground py-8">لا توجد بيانات بعد</p>
            ) : (
              <div className="space-y-4">
                {stats.topSellingItems.map((item: any, index: number) => (
                  <div key={item.name} className="flex items-center gap-4 p-3 hover:bg-muted/40 rounded-2xl transition-all hover:scale-105 shadow-sm border border-transparent hover:border-border/50">
                    <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-emerald-400 to-emerald-600 text-white font-black flex items-center justify-center text-lg shadow-md">{index + 1}</div>
                    <div className="flex-1 min-w-0">
                      <p className="font-bold truncate text-foreground">{item.name}</p>
                      <p className="text-xs text-muted-foreground font-semibold">{number(item.count)} طلب</p>
                    </div>
                    <p className="font-black text-success text-base">{currency(item.revenue)}</p>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>

        {/* Recent Orders */}
        <Card className="lg:col-span-1 shadow-sm border-border/50 bg-card/50 backdrop-blur-md rounded-3xl overflow-hidden">
          <CardHeader className="pb-4 border-b border-border/30 bg-card/40">
            <CardTitle className="text-lg font-black flex items-center gap-2">
              <Clock className="w-5 h-5 text-amber-500" />
              الطلبات الأخيرة
            </CardTitle>
          </CardHeader>
          <CardContent className="pt-4 px-4">
            {!stats.recentOrders || stats.recentOrders.length === 0 ? (
              <p className="text-center text-muted-foreground py-8">لا توجد طلبات بعد</p>
            ) : (
              <div className="space-y-3">
                {stats.recentOrders.map((order: any) => {
                  const getStatusBadge = (status: string) => {
                    switch (status) {
                      case 'completed': return { label: 'مكتمل', className: 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400' };
                      case 'delivered': return { label: 'تم التسليم', className: 'bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400' };
                      case 'ready': return { label: 'جاهز', className: 'bg-indigo-100 text-indigo-700 dark:bg-indigo-900/30 dark:text-indigo-400' };
                      case 'preparing': return { label: 'قيد التحضير', className: 'bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400' };
                      case 'cancelled': return { label: 'ملغي', className: 'bg-rose-100 text-rose-700 dark:bg-rose-900/30 dark:text-rose-400' };
                      case 'pending':
                      default: return { label: 'في الانتظار', className: 'bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-400' };
                    }
                  };
                  const getOrderTypeInfo = (type: string) => {
                    switch (type) {
                      case 'dine_in': return { icon: Store, text: 'صالة', color: 'text-blue-500' };
                      case 'delivery': return { icon: Bike, text: 'توصيل', color: 'text-purple-500' };
                      case 'takeaway': default: return { icon: ShoppingCart, text: 'تيك أواي', color: 'text-emerald-500' };
                    }
                  };
                  const statusBadge = getStatusBadge(order.status);
                  const typeInfo = getOrderTypeInfo(order.order_type);

                  return (
                    <div key={order.id} className="flex items-center justify-between p-3.5 bg-card border border-border/50 rounded-2xl hover:border-primary/30 transition-all hover:shadow-md cursor-pointer" onClick={() => navigate('/pos')}>
                      <div className="flex items-center gap-3">
                        <div className={`w-10 h-10 rounded-full bg-muted flex items-center justify-center ${typeInfo.color}`}>
                          <typeInfo.icon className="w-5 h-5" />
                        </div>
                        <div>
                          <p className="font-bold text-sm">#{order.order_number}</p>
                          <p className="text-xs text-muted-foreground font-semibold mt-0.5">
                            {typeInfo.text}
                          </p>
                        </div>
                      </div>
                      <div className="text-left flex flex-col items-end gap-1.5">
                        <p className="font-black text-foreground text-sm">{currency(Number(order.total || 0))}</p>
                        <span className={`text-[10px] px-2.5 py-0.5 rounded-full font-bold ${statusBadge.className}`}>
                          {statusBadge.label}
                        </span>
                      </div>
                    </div>
                  )
                })}
              </div>
            )}
          </CardContent>
        </Card>

        {/* System Alerts */}
        <div className="lg:col-span-1 grid grid-cols-1 sm:grid-cols-2 gap-3 sm:gap-4">
          <div className="col-span-1 sm:col-span-2 p-4 sm:p-6 bg-gradient-to-br from-indigo-500/10 to-indigo-600/5 dark:from-indigo-500/20 dark:to-indigo-600/10 rounded-3xl border border-indigo-200/50 dark:border-indigo-800/50 flex flex-col justify-center relative overflow-hidden group hover:border-indigo-500/50 transition-colors">
            <div className="absolute -right-6 -top-6 w-32 h-32 bg-indigo-500/10 rounded-full blur-2xl group-hover:bg-indigo-500/20 transition-colors pointer-events-none" />
            <div className="flex items-center gap-3 mb-2">
              <div className="p-2.5 bg-indigo-100 dark:bg-indigo-900/50 text-indigo-600 dark:text-indigo-400 rounded-xl">
                <CalendarDays className="w-6 h-6" />
              </div>
              <p className="text-base font-bold text-indigo-900 dark:text-indigo-300">حجوزات اليوم</p>
            </div>
            <p className="text-4xl font-black text-indigo-700 dark:text-indigo-400 mt-2">{number(stats.reservationsToday)}</p>
          </div>

          <div className="p-5 bg-gradient-to-br from-amber-500/10 to-amber-600/5 dark:from-amber-500/20 dark:to-amber-600/10 rounded-3xl border border-amber-200/50 dark:border-amber-800/50 text-center flex flex-col items-center justify-center transition-transform hover:scale-[1.03]">
            <Clock className="w-8 h-8 text-amber-500 mb-3" />
            <p className="text-3xl font-black text-amber-700 dark:text-amber-400 mb-1">{number(stats.pendingOrders)}</p>
            <p className="text-xs font-bold text-amber-900/60 dark:text-amber-300/60 uppercase">قيد الانتظار</p>
          </div>

          <div className="p-5 bg-gradient-to-br from-red-500/10 to-red-600/5 dark:from-red-500/20 dark:to-red-600/10 rounded-3xl border border-red-200/50 dark:border-red-800/50 text-center flex flex-col items-center justify-center transition-transform hover:scale-[1.03]">
            <AlertTriangle className="w-8 h-8 text-red-500 mb-3" />
            <p className="text-3xl font-black text-red-700 dark:text-red-400 mb-1">{number(stats.lowStockItems)}</p>
            <p className="text-xs font-bold text-red-900/60 dark:text-red-300/60 uppercase">نواقص المخزون</p>
          </div>
        </div>
      </div>
    </MainLayout>
  );
}
