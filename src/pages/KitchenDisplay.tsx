import { useState, useEffect, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { MainLayout } from '@/components/layout';
import { useKitchenOrders, useTenantBranch, useMenuCategories, confirmKitchenOrder } from '@/hooks/useDatabase';
import { cn } from '@/lib/utils';
import {
  Clock, CheckCircle, AlertCircle, RefreshCw, ChefHat, Utensils, Bike, ShoppingBag, Bell, Hash, Volume2, VolumeX, Timer, User, Clock8, ListTodo, Activity, Flame, TrendingUp, LayoutGrid, List
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardHeader } from '@/components/ui/card';
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';

const statusConfig = {
  pending: { label: 'في الانتظار', color: 'bg-amber-500/10 text-amber-500 border-amber-500/20', icon: Clock },
  preparing: { label: 'قيد التحضير', color: 'bg-blue-500/10 text-blue-500 border-blue-500/20', icon: RefreshCw },
  ready: { label: 'جاهز', color: 'bg-emerald-500/10 text-emerald-500 border-emerald-500/20', icon: CheckCircle },
  completed: { label: 'مكتمل', color: 'bg-gray-500/10 text-gray-500 border-gray-500/20', icon: CheckCircle },
  delivered: { label: 'تم التسليم', color: 'bg-indigo-500/10 text-indigo-500 border-indigo-500/20', icon: CheckCircle },
};

export default function KitchenDisplay() {
  const [selectedStation, setSelectedStation] = useState('all');
  const [filter, setFilter] = useState<'all' | 'pending' | 'preparing' | 'ready' | 'completed' | 'delivered'>('all');
  const [orderType, setOrderType] = useState<'all' | 'dine_in' | 'takeaway' | 'delivery'>('all');
  const [soundEnabled, setSoundEnabled] = useState(true);
  const [viewMode, setViewMode] = useState<'tickets' | 'consolidated'>('tickets');
  const [currentTime, setCurrentTime] = useState(new Date());

  const [dateRange, setDateRange] = useState('default'); // 'default' means no dateRangeObj passed (only active)
  const [customStartDate, setCustomStartDate] = useState(() => {
    const d = new Date(); d.setDate(1); return d.toISOString().split('T')[0];
  });
  const [customEndDate, setCustomEndDate] = useState(() => {
    return new Date().toISOString().split('T')[0];
  });
  const [dateRangeObj, setDateRangeObj] = useState<{start: Date, end: Date} | undefined>(undefined);

  useEffect(() => {
    if (dateRange === 'default') {
      setDateRangeObj(undefined);
      return;
    }

    const now = new Date();
    let startDate = new Date();
    let endDate = new Date();

    if (dateRange === 'today') {
      startDate.setHours(0, 0, 0, 0);
    } else if (dateRange === 'yesterday') {
      startDate.setDate(now.getDate() - 1);
      startDate.setHours(0, 0, 0, 0);
      endDate = new Date(startDate);
      endDate.setHours(23, 59, 59, 999);
    } else if (dateRange === 'week') {
      startDate.setDate(now.getDate() - 7);
      startDate.setHours(0, 0, 0, 0);
    } else if (dateRange === 'month') {
      startDate.setDate(1);
      startDate.setHours(0, 0, 0, 0);
    } else if (dateRange === 'year') {
      startDate.setMonth(0, 1);
      startDate.setHours(0, 0, 0, 0);
    } else if (dateRange === 'all') {
      startDate = new Date(2020, 0, 1);
    } else if (dateRange === 'custom') {
      startDate = new Date(customStartDate);
      startDate.setHours(0, 0, 0, 0);
      endDate = new Date(customEndDate);
      endDate.setHours(23, 59, 59, 999);
    }

    if (dateRange !== 'yesterday' && dateRange !== 'custom') {
      endDate = new Date();
      endDate.setHours(23, 59, 59, 999);
    }

    setDateRangeObj({ start: startDate, end: endDate });
  }, [dateRange, customStartDate, customEndDate]);

  const { tenantId, branchId } = useTenantBranch();
  const { tickets, loading, updateItemStatus, updateOrderStatus, refresh } = useKitchenOrders(tenantId, branchId, dateRangeObj);
  const { categories } = useMenuCategories(tenantId);
  
  const prevTicketsLength = useRef(0);

  // Live timer tick every second
  useEffect(() => {
    const timer = setInterval(() => setCurrentTime(new Date()), 1000); 
    return () => clearInterval(timer);
  }, []);

  // Sound alert for new pending tickets
  useEffect(() => {
    const pendingTicketsCount = tickets.filter(t => t.status === 'pending').length;
    if (soundEnabled && pendingTicketsCount > prevTicketsLength.current) {
      // Play sound
      const audio = new Audio('/notification.mp3'); 
      try {
        audio.play().catch(() => {
          // Play synth beep if file blocked or not found
          const ctx = new (window.AudioContext || (window as any).webkitAudioContext)();
          const osc = ctx.createOscillator();
          osc.type = 'sine';
          osc.frequency.setValueAtTime(880, ctx.currentTime);
          osc.connect(ctx.destination);
          osc.start();
          osc.stop(ctx.currentTime + 0.1);
          setTimeout(() => {
            const osc2 = ctx.createOscillator();
            osc2.type = 'sine';
            osc2.frequency.setValueAtTime(1046, ctx.currentTime);
            osc2.connect(ctx.destination);
            osc2.start();
            osc2.stop(ctx.currentTime + 0.3);
          }, 150);
        });
      } catch (e) {}
    }
    prevTicketsLength.current = pendingTicketsCount;
  }, [tickets, soundEnabled]);

  const stations = [
    { id: 'all', name: 'الكل', icon: ChefHat },
    ...categories.map(cat => ({
      id: cat.id,
      name: cat.name,
      icon: Utensils
    }))
  ];

  const getElapsedMinutes = (ticket: any) => {
    const isFinished = ticket.status === 'ready' || ticket.status === 'completed' || ticket.status === 'delivered';
    const end = isFinished && ticket.updatedAt ? ticket.updatedAt : currentTime;
    return Math.floor(Math.max(0, end.getTime() - ticket.createdAt.getTime()) / 60000);
  };
  const formatElapsedTime = (ticket: any) => {
    const isFinished = ticket.status === 'ready' || ticket.status === 'completed' || ticket.status === 'delivered';
    const end = isFinished && ticket.updatedAt ? ticket.updatedAt : currentTime;
    const diff = Math.max(0, end.getTime() - ticket.createdAt.getTime());
    const m = Math.floor(diff / 60000);
    const s = Math.floor((diff % 60000) / 1000);
    return `${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`;
  };
  const getUrgencyColor = (minutes: number) => minutes > 20 ? 'border-r-rose-500 shadow-rose-500/20' : minutes > 10 ? 'border-r-amber-500 shadow-amber-500/20' : 'border-r-emerald-500 shadow-emerald-500/20';

  let filteredTickets = tickets.filter((ticket) => {
    const statusMatch = filter === 'all' ? true : ticket.status === filter || ticket.items.some((item: any) => item.status === filter);
    const typeMatch = orderType === 'all' ? true : ticket.type === orderType;
    return statusMatch && typeMatch;
  });
  
  // Filter by station (category)
  if (selectedStation !== 'all') {
    filteredTickets = filteredTickets.filter(ticket => 
      ticket.items.some((item: any) => item.categoryId === selectedStation)
    );
  }

  const cycleItemStatus = (item: any) => {
    if (item.status === 'pending') updateItemStatus(item.id, 'preparing');
    else if (item.status === 'preparing') updateItemStatus(item.id, 'ready');
    else if (item.status === 'ready') updateItemStatus(item.id, 'pending');
  };

  // Stats Logic
  const activeAndPreparingTickets = filteredTickets.filter(t => t.status === 'pending' || t.status === 'preparing');
  const pendingCount = activeAndPreparingTickets.filter(t => t.status === 'pending').length;
  const preparingCount = activeAndPreparingTickets.filter(t => t.status === 'preparing').length;
  const readyCount = filteredTickets.filter(t => t.status === 'ready').length;
  const avgPrepTime = activeAndPreparingTickets.length > 0
    ? Math.round(activeAndPreparingTickets.reduce((sum, t) => sum + getElapsedMinutes(t), 0) / activeAndPreparingTickets.length)
    : 0;

  // Consolidated Items Logic
  const consolidatedItems = Object.values(
    filteredTickets
      .filter(ticket => ticket.status === 'pending' || ticket.status === 'preparing')
      .flatMap(ticket => 
        ticket.items
          .filter((i: any) => selectedStation === 'all' || i.categoryId === selectedStation)
          .map((i: any) => ({ ...i, orderNumber: ticket.orderNumber, elapsedMins: getElapsedMinutes(ticket), ticketStatus: ticket.status }))
      )
      .reduce((acc: any, item: any) => {
        if (!acc[item.name]) acc[item.name] = { name: item.name, total: 0, items: [] };
        acc[item.name].total += item.quantity;
        acc[item.name].items.push(item);
        return acc;
      }, {})
  ).sort((a: any, b: any) => b.total - a.total);

  const markOrderReady = async (ticket: any) => {
    for (const item of ticket.items) {
      if (item.status !== 'ready' && item.status !== 'completed') {
         await updateItemStatus(item.id, 'ready');
      }
    }
    const success = await confirmKitchenOrder(ticket.id);
    if (success && refresh) {
      refresh();
    } else {
      updateOrderStatus(ticket.id, 'ready');
    }
  };

  const revertOrder = async (ticket: any) => {
    updateOrderStatus(ticket.id, 'preparing');
  };

  return (
    <MainLayout title="شاشة المطبخ" subtitle="إدارة تذاكر المطبخ بلمسة احترافية"
      actions={
        <div className="flex gap-2 items-center">
          <Select value={dateRange} onValueChange={setDateRange}>
            <SelectTrigger className="w-[140px] md:w-[150px] bg-background/50 backdrop-blur-md border-white/10 hidden sm:flex">
              <SelectValue placeholder="التاريخ" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="default">الطلبات النشطة (تلقائي)</SelectItem>
              <SelectItem value="today">اليوم</SelectItem>
              <SelectItem value="yesterday">الأمس</SelectItem>
              <SelectItem value="week">آخر 7 أيام</SelectItem>
              <SelectItem value="month">هذا الشهر</SelectItem>
              <SelectItem value="year">هذا العام</SelectItem>
              <SelectItem value="all">كل الأوقات</SelectItem>
              <SelectItem value="custom">فترة مخصصة</SelectItem>
            </SelectContent>
          </Select>

          {dateRange === 'custom' && (
            <div className="hidden lg:flex items-center gap-1 md:gap-2">
              <input type="date" value={customStartDate} onChange={e => setCustomStartDate(e.target.value)} className="flex h-10 w-full rounded-md border border-white/10 bg-background/50 backdrop-blur-md px-2 py-1 text-xs md:text-sm shadow-sm transition-colors max-w-[120px]" />
              <span className="text-muted-foreground">-</span>
              <input type="date" value={customEndDate} onChange={e => setCustomEndDate(e.target.value)} className="flex h-10 w-full rounded-md border border-white/10 bg-background/50 backdrop-blur-md px-2 py-1 text-xs md:text-sm shadow-sm transition-colors max-w-[120px]" />
            </div>
          )}

          <Button 
            variant={soundEnabled ? "default" : "outline"} 
            className={cn("gap-2 text-xs md:text-sm transition-all", !soundEnabled && "bg-background/50 backdrop-blur-md border-white/10 hover:bg-white/10 text-muted-foreground")}
            onClick={() => setSoundEnabled(!soundEnabled)}
          >
            {soundEnabled ? <Volume2 className="w-4 h-4" /> : <VolumeX className="w-4 h-4" />}
            <span className="hidden sm:inline">{soundEnabled ? 'صوت التنبيهات' : 'الصوت معطل'}</span>
          </Button>
          <Button variant="outline" className="gap-2 text-xs md:text-sm bg-background/50 backdrop-blur-md border-white/10 hover:bg-white/10">
            <Bell className="w-4 h-4" />
            <span className="hidden sm:inline">تنبيه الصالة</span>
          </Button>
          <div className="flex bg-background/50 backdrop-blur-md rounded-md border border-white/10 p-0.5 ml-2">
            <Button variant={viewMode === 'tickets' ? 'default' : 'ghost'} size="sm" onClick={() => setViewMode('tickets')} className={cn("h-8 rounded", viewMode !== 'tickets' && 'hover:bg-white/10')}>
              <LayoutGrid className="w-4 h-4 ml-1" /> تذاكر
            </Button>
            <Button variant={viewMode === 'consolidated' ? 'default' : 'ghost'} size="sm" onClick={() => setViewMode('consolidated')} className={cn("h-8 rounded", viewMode !== 'consolidated' && 'hover:bg-white/10')}>
              <List className="w-4 h-4 ml-1" /> تجميع
            </Button>
          </div>
        </div>
      }
    >
      {/* Live KDS Stats Dashboard */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-4 mb-6">
        <div className="bg-background/40 backdrop-blur-xl border border-white/10 p-4 rounded-2xl flex items-center gap-4">
          <div className="w-12 h-12 rounded-xl bg-primary/20 flex items-center justify-center text-primary">
            <Activity className="w-6 h-6" />
          </div>
          <div>
            <p className="text-sm text-muted-foreground">الطلبات النشطة</p>
            <p className="text-2xl font-black">{activeAndPreparingTickets.length}</p>
          </div>
        </div>
        <div className="bg-amber-500/10 backdrop-blur-xl border border-amber-500/20 p-4 rounded-2xl flex items-center gap-4">
          <div className="w-12 h-12 rounded-xl bg-amber-500/20 flex items-center justify-center text-amber-500">
            <Clock className="w-6 h-6" />
          </div>
          <div>
            <p className="text-sm text-amber-500/80">في الانتظار</p>
            <p className="text-2xl font-black text-amber-500">{pendingCount}</p>
          </div>
        </div>
        <div className="bg-blue-500/10 backdrop-blur-xl border border-blue-500/20 p-4 rounded-2xl flex items-center gap-4">
          <div className="w-12 h-12 rounded-xl bg-blue-500/20 flex items-center justify-center text-blue-500">
            <Flame className="w-6 h-6" />
          </div>
          <div>
            <p className="text-sm text-blue-500/80">قيد التحضير</p>
            <p className="text-2xl font-black text-blue-500">{preparingCount}</p>
          </div>
        </div>
        <div className="bg-background/40 backdrop-blur-xl border border-white/10 p-4 rounded-2xl flex items-center gap-4">
          <div className="w-12 h-12 rounded-xl bg-white/5 border flex items-center justify-center text-foreground">
            <TrendingUp className="w-6 h-6" />
          </div>
          <div>
            <p className="text-sm text-muted-foreground">متوسط التأخير</p>
            <p className="text-2xl font-black" dir="ltr">{avgPrepTime} <span className="text-sm font-normal text-muted-foreground">دقيقة</span></p>
          </div>
        </div>
      </div>

      <div className="flex flex-col md:flex-row items-start md:items-center justify-between gap-4 mb-8">
        <Tabs value={selectedStation} onValueChange={setSelectedStation} className="w-full md:w-auto overflow-x-auto pb-2 custom-scrollbar">
          <TabsList className="h-12 flex-nowrap bg-background/40 backdrop-blur-xl border border-white/10 p-1 rounded-xl">
            {stations.map((station) => {
              const Icon = station.icon;
              return (
                <TabsTrigger key={station.id} value={station.id} className="gap-2 px-4 h-10 text-sm rounded-lg data-[state=active]:bg-primary/20 data-[state=active]:text-primary data-[state=active]:shadow-lg transition-all duration-300 whitespace-nowrap">
                  {station.name === 'الكل' ? <ChefHat className="w-4 h-4" /> : <Icon className="w-4 h-4" />}
                  {station.name}
                </TabsTrigger>
              );
            })}
          </TabsList>
        </Tabs>
        
        <div className="flex flex-col sm:flex-row gap-3 w-full md:w-auto">
          <Tabs value={orderType} onValueChange={(v) => setOrderType(v as any)} className="w-full sm:w-auto">
            <TabsList className="h-12 bg-background/40 backdrop-blur-xl border border-white/10 p-1 rounded-xl w-full">
              <TabsTrigger value="all" className="rounded-lg h-10 w-full data-[state=active]:bg-white/10">كل الطلبات</TabsTrigger>
              <TabsTrigger value="dine_in" className="rounded-lg h-10 w-full data-[state=active]:bg-white/10">صالة</TabsTrigger>
              <TabsTrigger value="takeaway" className="rounded-lg h-10 w-full data-[state=active]:bg-white/10">تيك أواي</TabsTrigger>
              <TabsTrigger value="delivery" className="rounded-lg h-10 w-full data-[state=active]:bg-white/10">توصيل</TabsTrigger>
            </TabsList>
          </Tabs>

          <Tabs value={filter} onValueChange={(v) => setFilter(v as any)} className="w-full sm:w-auto">
            <TabsList className="h-12 bg-background/40 backdrop-blur-xl border border-white/10 p-1 rounded-xl w-full">
              <TabsTrigger value="all" className="rounded-lg h-10 w-full data-[state=active]:bg-white/10">الحالة</TabsTrigger>
              <TabsTrigger value="pending" className="rounded-lg h-10 w-full text-amber-500 data-[state=active]:bg-amber-500/20 data-[state=active]:text-amber-400">انتظار</TabsTrigger>
              <TabsTrigger value="preparing" className="rounded-lg h-10 w-full text-blue-500 data-[state=active]:bg-blue-500/20 data-[state=active]:text-blue-400">تحضير</TabsTrigger>
              <TabsTrigger value="ready" className="rounded-lg h-10 w-full text-emerald-500 data-[state=active]:bg-emerald-500/20 data-[state=active]:text-emerald-400">جاهز</TabsTrigger>
              <TabsTrigger value="completed" className="rounded-lg h-10 w-full text-gray-400 data-[state=active]:bg-white/10 data-[state=active]:text-white">مكتمل</TabsTrigger>
              <TabsTrigger value="delivered" className="rounded-lg h-10 w-full text-indigo-400 data-[state=active]:bg-indigo-500/20 data-[state=active]:text-indigo-400">تم التسليم</TabsTrigger>
            </TabsList>
          </Tabs>
        </div>
      </div>
      
      {/* Mobile Custom Date Display */}
      {dateRange === 'custom' && (
        <div className="lg:hidden flex items-center justify-between gap-2 mb-6 p-3 bg-background/40 backdrop-blur-xl border border-white/10 rounded-xl">
          <input type="date" value={customStartDate} onChange={e => setCustomStartDate(e.target.value)} className="flex h-10 w-full rounded-md border border-white/10 bg-background/50 px-2 py-1 text-sm shadow-sm transition-colors" />
          <span className="text-muted-foreground font-bold">-</span>
          <input type="date" value={customEndDate} onChange={e => setCustomEndDate(e.target.value)} className="flex h-10 w-full rounded-md border border-white/10 bg-background/50 px-2 py-1 text-sm shadow-sm transition-colors" />
        </div>
      )}

      <div className={cn(viewMode === 'consolidated' ? "flex flex-col gap-4" : "grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6")}>
        {loading ? (
          <div className="col-span-full py-20 flex flex-col items-center justify-center text-muted-foreground">
             <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary mb-4"></div>
             <div>جاري تحميل الطلبات...</div>
          </div>
        ) : viewMode === 'consolidated' ? (
          <AnimatePresence>
            {consolidatedItems.length === 0 ? (
               <div className="col-span-full flex justify-center p-12 text-muted-foreground">لا يوجد عناصر نشطة في هذا القسم حاليا.</div>
            ) : consolidatedItems.map((group: any, idx: number) => (
              <motion.div 
                key={group.name} 
                initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} 
                className="bg-background/40 backdrop-blur-md border border-white/10 rounded-xl p-4 flex flex-col md:flex-row md:items-center justify-between gap-4"
              >
                <div className="flex items-center gap-4">
                  <span className="w-14 h-14 bg-primary/20 text-primary flex items-center justify-center rounded-xl text-2xl font-black border border-primary/20 shadow-inner">
                    {group.total}×
                  </span>
                  <div>
                    <h3 className="text-xl font-bold">{group.name}</h3>
                    <p className="text-sm text-muted-foreground flex gap-2 overflow-x-auto custom-scrollbar pt-1">
                      {group.items.map((i:any, iIdx:number) => (
                        <span key={iIdx} className={cn(
                          "px-2 py-0.5 rounded text-xs border whitespace-nowrap",
                          i.elapsedMins > 20 ? "bg-rose-500/10 text-rose-500 border-rose-500/20" : 
                          i.elapsedMins > 10 ? "bg-amber-500/10 text-amber-500 border-amber-500/20" : 
                          "bg-foreground/5 text-muted-foreground border-border"
                        )}>
                          تذكرة #{i.orderNumber.replace('#', '')} ({i.quantity}×)
                        </span>
                      ))}
                    </p>
                  </div>
                </div>
                <div className="flex flex-wrap gap-2 md:justify-end shrink-0">
                   {group.items.filter((i:any)=>i.notes).length > 0 && (
                     <Badge variant="destructive" className="animate-pulse shadow-sm px-3 flex gap-1">
                       <AlertCircle className="w-4 h-4"/>
                       انتبه: يوجد ملاحظات ({group.items.filter((i:any)=>i.notes).length})
                     </Badge>
                   )}
                </div>
              </motion.div>
            ))}
          </AnimatePresence>
        ) : (
          <AnimatePresence>
            {filteredTickets.map((ticket, index) => {
              const elapsedMins = getElapsedMinutes(ticket);
              const formattedTime = formatElapsedTime(ticket);
              const urgencyColor = getUrgencyColor(elapsedMins);
              const isFinished = ticket.status === 'ready' || ticket.status === 'completed' || ticket.status === 'delivered';
              const isUrgent = elapsedMins > 15 && !isFinished;
              const isCriticallyUrgent = elapsedMins > 20 && !isFinished;
              
              const filteredItems = ticket.items.filter((i: any) => selectedStation === 'all' || i.categoryId === selectedStation);
              if (selectedStation !== 'all' && filteredItems.length === 0) return null;

              const totalItems = filteredItems.length;
              const readyItems = filteredItems.filter((i: any) => i.status === 'ready' || i.status === 'completed').length;
              const progressPct = totalItems > 0 ? Math.round((readyItems / totalItems) * 100) : 0;

              // Check if any items have special notes (allergies/instructions)
              const hasNotes = ticket.items.some((i: any) => i.notes && i.notes.trim().length > 0);

              const getOrderColorMap = (type: string) => {
                switch (type) {
                  case 'dine_in': return { bg: 'bg-blue-500/10', border: 'border-blue-500/30', glow: 'shadow-blue-500/20', text: 'text-blue-500', headerBg: 'bg-blue-500/5', iconBg: 'bg-blue-500/20' };
                  case 'takeaway': return { bg: 'bg-amber-500/10', border: 'border-amber-500/30', glow: 'shadow-amber-500/20', text: 'text-amber-500', headerBg: 'bg-amber-500/5', iconBg: 'bg-amber-500/20' };
                  case 'delivery': return { bg: 'bg-purple-500/10', border: 'border-purple-500/30', glow: 'shadow-purple-500/20', text: 'text-purple-500', headerBg: 'bg-purple-500/5', iconBg: 'bg-purple-500/20' };
                  default: return { bg: 'bg-white/5', border: 'border-white/10', glow: 'shadow-white/5', text: 'text-foreground', headerBg: 'bg-white/5', iconBg: 'bg-white/10' };
                }
              };

              const colors = getOrderColorMap(ticket.type);

              return (
                <motion.div 
                  key={ticket.id} 
                  layout
                  initial={{ opacity: 0, scale: 0.9, y: 20 }} 
                  animate={{ opacity: 1, scale: 1, y: 0 }} 
                  exit={{ opacity: 0, scale: 0.9, y: 20 }}
                  transition={{ type: "spring", stiffness: 300, damping: 24, delay: index * 0.05 }}
                  className="h-full flex flex-col"
                >
                  <Card className={cn(
                    'h-full flex flex-col rounded-2xl overflow-hidden glass-panel border shadow-md relative', 
                    colors.border,
                    isCriticallyUrgent ? 'animate-pulse ring-2 ring-rose-500/60 shadow-rose-500/30' :
                    isUrgent ? 'animate-pulse-soft ring-1 ring-rose-500/40 shadow-rose-500/10' : colors.glow
                  )}>
                    {/* Visual Critical Border Indicator */}
                    {isCriticallyUrgent && <div className="absolute top-0 right-0 w-2 h-full bg-rose-500" />}
                    {hasNotes && !isFinished && <div className="absolute top-0 left-0 w-full h-1 bg-amber-500/50 animate-pulse" />}
                    
                    <CardHeader className={cn("pb-4 p-5 border-b backdrop-blur-md", colors.headerBg, colors.border)}>
                      <div className="flex items-start justify-between mb-3 gap-2">
                        <div className="flex flex-col gap-1.5 flex-1 min-w-0">
                          <div className="flex items-center gap-2 flex-wrap">
                            <Badge variant="outline" className={cn("px-2.5 py-1 font-bold text-lg border-2", colors.text, colors.border, colors.bg)}>
                              #{ticket.orderNumber.replace('#', '')}
                            </Badge>
                            {hasNotes && (
                              <Badge variant="destructive" className="px-2 py-0.5 text-xs animate-bounce bg-amber-500 text-black border-none">
                                <AlertCircle className="w-3 h-3 ml-1" /> ملاحظات
                              </Badge>
                            )}
                          </div>
                          <div className="flex items-center gap-4 text-sm text-foreground/80 mt-1">
                            <div className="flex items-center gap-1.5">
                              <Clock8 className="w-4 h-4 text-muted-foreground" />
                              <span className="font-semibold">{ticket.createdAt.toLocaleTimeString('ar-EG', { hour: '2-digit', minute: '2-digit' })}</span>
                            </div>
                            {ticket.customerName && (
                              <div className="flex items-center gap-1.5 truncate">
                                <User className="w-4 h-4 text-muted-foreground" />
                                <span className="font-medium truncate">{ticket.customerName}</span>
                              </div>
                            )}
                          </div>
                        </div>
                        <div className="flex flex-col items-end gap-2 flex-shrink-0">
                          <div className={cn(
                            "flex items-center gap-1.5 px-3 py-1.5 rounded-full text-sm font-bold border shadow-sm",
                            isCriticallyUrgent ? "bg-rose-500 text-white border-rose-600 animate-pulse" : 
                            elapsedMins > 20 ? "bg-rose-500/10 text-rose-500 border-rose-500/20" : 
                            elapsedMins > 10 ? "bg-amber-500/10 text-amber-500 border-amber-500/20" : 
                            "bg-emerald-500/10 text-emerald-500 border-emerald-500/20"
                          )}>
                            <Timer className={cn("w-4 h-4", isUrgent && "animate-pulse")} />
                            <span className="tabular-nums tracking-widest">{formattedTime}</span>
                          </div>
                          {ticket.priority === 'high' && (
                            <Badge variant="destructive" className="animate-pulse shadow-sm px-2">
                              أولوية قصوى
                            </Badge>
                          )}
                        </div>
                      </div>
                      
                      {/* Order Type and Table Badges */}
                      <div className="flex gap-2 flex-wrap items-center mt-1 border-t border-white/5 pt-3">
                        {ticket.type === 'delivery' && <Badge variant="secondary" className="gap-1.5 bg-purple-500/20 hover:bg-purple-500/30 text-purple-400 border-purple-500/30 rounded-lg"><Bike className="w-3.5 h-3.5" />توصيل</Badge>}
                        {ticket.type === 'takeaway' && <Badge variant="secondary" className="gap-1.5 bg-amber-500/20 hover:bg-amber-500/30 text-amber-400 border-amber-500/30 rounded-lg"><ShoppingBag className="w-3.5 h-3.5" />تيك أواي</Badge>}
                        {ticket.type === 'dine_in' && <Badge variant="secondary" className="gap-1.5 bg-blue-500/20 hover:bg-blue-500/30 text-blue-400 border-blue-500/30 rounded-lg"><Utensils className="w-3.5 h-3.5" />صالة</Badge>}
                        {ticket.tableNumber && <Badge variant="secondary" className="bg-white/10 hover:bg-white/15 border-white/20 text-white rounded-lg font-bold">طاولة {ticket.tableNumber}</Badge>}
                      </div>

                      {/* Progress Bar Container */}
                      <div className="mt-4 flex flex-col gap-1.5">
                        <div className="flex justify-between items-center text-xs font-medium px-1">
                          <span className="text-muted-foreground flex items-center gap-1"><ListTodo className="w-3.5 h-3.5" /> الأصناف المنجزة</span>
                          <span className={cn(readyItems === totalItems ? "text-emerald-400 font-bold" : "text-foreground")}>{readyItems} / {totalItems}</span>
                        </div>
                        <div className="w-full h-2.5 bg-black/30 rounded-full overflow-hidden border border-white/5">
                          <motion.div 
                            className={cn("h-full rounded-full transition-all duration-500", progressPct === 100 ? "bg-emerald-500" : isUrgent ? "bg-rose-500" : "bg-primary")}
                            initial={{ width: 0 }}
                            animate={{ width: `${progressPct}%` }}
                          />
                        </div>
                      </div>
                    </CardHeader>
                    
                    <CardContent className="flex-1 flex flex-col p-4 bg-background/40">
                      <div className="space-y-3 mb-4 flex-1 overflow-y-auto custom-scrollbar pr-1 pb-2" style={{ maxHeight: '40vh' }}>
                        {filteredItems.map((item: any, itemIndex: number) => {
                          const status = statusConfig[item.status as keyof typeof statusConfig] || statusConfig.pending;
                          const isReady = item.status === 'ready' || item.status === 'completed';
                          
                          return (
                            <motion.button
                              whileHover={{ scale: 1.02, x: -4 }}
                              whileTap={{ scale: 0.95 }}
                              key={item.id || itemIndex} 
                              onClick={() => cycleItemStatus(item)}
                              className={cn(
                                'w-full text-right flex items-start gap-3 p-3 rounded-xl border shadow-sm transition-all duration-300 relative overflow-hidden group', 
                                isReady ? 'bg-black/20 hover:bg-black/30 border-white/5 grayscale-[50%] opacity-60' : 
                                item.notes ? 'bg-amber-500/5 hover:bg-amber-500/10 border-amber-500/30' : 
                                `bg-background/80 hover:shadow-md ${status.color}`
                              )}
                            >
                              <div className={cn(
                                "flex-shrink-0 w-6 h-6 rounded-md flex items-center justify-center mt-1 border-2 transition-all duration-300",
                                isReady ? "bg-emerald-500 border-emerald-500 text-white scale-110 shadow-sm shadow-emerald-500/20" : "border-muted-foreground/30 bg-background/50 text-transparent"
                              )}>
                                <CheckCircle className="w-4 h-4 shadow-sm" />
                              </div>
                              <div className="flex-1 min-w-0">
                                <div className="flex items-start gap-3 mb-1">
                                  <span className={cn(
                                    "font-black text-xl px-2.5 py-1 rounded-lg shadow-sm border border-black/5 dark:border-white/5 bg-background flex-shrink-0 leading-none mt-0.5",
                                    isReady ? "bg-white/10 text-foreground/50" : "bg-primary/10 text-primary border-primary/20",
                                  )}>
                                    {item.quantity}×
                                  </span>
                                  <span className={cn(
                                    "font-bold text-lg leading-tight transition-all duration-300 mt-1", 
                                    isReady && "line-through text-muted-foreground decoration-2 decoration-emerald-500/50"
                                  )}>{item.name}</span>
                                </div>
                                {item.notes && (
                                  <div className={cn(
                                    "mt-2.5 p-2 rounded-lg inline-block w-full backdrop-blur-sm border-r-4 font-bold text-sm transition-all duration-300 shadow-inner",
                                    isReady ? "bg-muted/30 text-muted-foreground border-r-muted-foreground" : "text-amber-500 bg-amber-500/10 border-r-amber-500"
                                  )}>
                                    <AlertCircle className="w-3.5 h-3.5 inline-block mr-0.5 ml-1.5 opacity-80" />
                                    {item.notes}
                                  </div>
                                )}
                              </div>
                              
                              {/* Glowing edge effect on hover */}
                              <div className={cn(
                                "absolute inset-0 border-2 border-transparent transition-colors opacity-0 group-hover:opacity-10 rounded-xl",
                                !isReady && "group-hover:border-current"
                              )}></div>
                            </motion.button>
                          );
                        })}
                      </div>
                      
                      <div className="flex gap-2 pt-3 mt-auto border-t border-white/5">
                        <Button 
                          variant="outline" 
                          size="lg" 
                          className="w-16 h-14 bg-background/50 backdrop-blur-md border-white/10 hover:bg-white/10 text-muted-foreground flex-shrink-0 shadow-sm" 
                          onClick={() => revertOrder(ticket)} 
                          disabled={ticket.status === 'pending' || readyItems === 0}
                          title="تراجع عن الصنف الأخير"
                        >
                          <RefreshCw className="w-5 h-5" />
                        </Button>
                        <Button 
                          size="lg" 
                          className={cn(
                            "flex-1 h-14 text-base font-bold transition-all duration-300 border-0 shadow-md",
                            progressPct === 100 ? "bg-emerald-500 hover:bg-emerald-600 text-white shadow-emerald-500/30" : "bg-primary hover:bg-primary/90 text-white shadow-primary/30"
                          )}
                          onClick={() => markOrderReady(ticket)} 
                          disabled={ticket.status === 'ready' || ticket.status === 'completed' || ticket.status === 'delivered'}
                        >
                          <CheckCircle className={cn("w-5 h-5 ml-2 transition-transform duration-300", progressPct === 100 && "scale-110")} />
                          {progressPct === 100 ? 'تسليم وإنجاز (Bump)' : 'تجهيز كافة الأصناف (Bump All)'}
                        </Button>
                      </div>
                    </CardContent>
                  </Card>
                </motion.div>
              );
            })}
          </AnimatePresence>
        )}
      </div>

      {!loading && filteredTickets.length === 0 && (
        <motion.div 
          initial={{ opacity: 0, scale: 0.9 }}
          animate={{ opacity: 1, scale: 1 }}
          className="flex flex-col items-center justify-center py-32 text-center"
        >
          <div className="w-32 h-32 rounded-full bg-white/5 flex items-center justify-center mb-6">
            <ChefHat className="w-16 h-16 text-muted-foreground/30" />
          </div>
          <h3 className="text-2xl font-bold bg-clip-text text-transparent bg-gradient-to-r from-gray-200 to-gray-500 mb-2">لا توجد تذاكر حالياً</h3>
          <p className="text-muted-foreground max-w-sm">المطبخ هادئ الآن. ستظهر الطلبات الجديدة هنا فور استلامها.</p>
        </motion.div>
      )}
    </MainLayout>
  );
}
