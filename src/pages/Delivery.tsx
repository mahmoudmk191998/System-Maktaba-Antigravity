import { useState } from 'react';
import { MainLayout } from '@/components/layout';
import { useFormatters } from '@/lib/formatters';
import { cn } from '@/lib/utils';
import {
  Bike, Plus, Search, MapPin, Clock, CheckCircle, Phone, User, Package,
  Navigation, Star, Eye, Edit, Trash2, Calendar, TrendingUp, ThumbsUp
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs';
import { Avatar, AvatarFallback } from '@/components/ui/avatar';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { useDelivery, useTenantBranch } from '@/hooks/useDatabase';

const statusConfig: Record<string, { label: string; color: string }> = {
  preparing: { label: 'قيد التحضير', color: 'bg-warning/10 text-warning border-warning/20' },
  ready: { label: 'جاهز للتسليم', color: 'bg-info/10 text-info border-info/20' },
  on_way: { label: 'في الطريق', color: 'bg-primary/10 text-primary border-primary/20' },
  delivered: { label: 'تم التسليم', color: 'bg-success/10 text-success border-success/20' },
};

export default function Delivery() {
  const [searchQuery, setSearchQuery] = useState('');
  const [activeTab, setActiveTab] = useState('orders');

  const [isAddOpen, setIsAddOpen] = useState(false);
  const [newDriver, setNewDriver] = useState({ name: '', phone: '', vehicle: '' });
  const [editingDriver, setEditingDriver] = useState<any>(null);

  const [isAddZoneOpen, setIsAddZoneOpen] = useState(false);
  const [newZone, setNewZone] = useState({ name: '', fee: 0, minOrder: 0, estimatedTime: 30, isActive: true });
  const [editingZone, setEditingZone] = useState<any>(null);

  const [assignDriverOpen, setAssignDriverOpen] = useState(false);
  const [selectedOrder, setSelectedOrder] = useState<any>(null);
  const [selectedDriverId, setSelectedDriverId] = useState('');

  const [rateDeliveryOrder, setRateDeliveryOrder] = useState<any>(null);
  const [deliveryRating, setDeliveryRating] = useState(5);

  const { tenantId } = useTenantBranch();
  const { deliveryOrders: dbOrders, drivers: dbDrivers, deliveryZones: dbZones, addDriver, updateDriver, deleteDriver, addDeliveryZone, updateDeliveryZone, deleteDeliveryZone, updateDeliveryOrderStatus } = useDelivery(tenantId);
  const { currency, number, date: formatDate } = useFormatters();

  const deliveryOrders = dbOrders.map(o => ({
    id: o.id,
    orderNumber: o.order_number || `#${o.id.substring(0,4)}`,
    customer: o.customer_name || 'توصيل',
    phone: o.customer_phone || '',
    address: o.delivery_address || o.customer_address || 'غير محدد',
    total: Number(o.total) || 0,
    status: o.status || 'preparing',
    driver: o.driver_id || null,
    estimatedTime: o.estimated_time || '30 دقيقة',
    createdAt: o.created_at || new Date().toISOString()
  })).sort((a,b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());

  const drivers = dbDrivers.map(d => ({
    id: d.id,
    name: d.name || '',
    phone: d.phone || '',
    status: d.status || 'active',
    currentOrders: d.current_orders || 0,
    completedToday: d.completed_today || 0,
    totalDeliveries: d.total_deliveries || 0,
    rating: d.rating || 5.0,
    vehicle: d.vehicle || 'دراجة نارية'
  })).sort((a,b) => b.completedToday - a.completedToday);

  const deliveryZones = dbZones.length > 0 ? dbZones.map((z: any) => ({
    id: z.id,
    name: z.name || '',
    fee: Number(z.fee) || 0,
    minOrder: Number(z.minOrder) || 0,
    estimatedTime: z.estimatedTime || 30,
    isActive: z.isActive !== false
  })) : [];

  const handleAssignDriver = async () => {
    if (!selectedOrder || !selectedDriverId) return;
    await updateDeliveryOrderStatus(selectedOrder.id, 'on_way', selectedDriverId);
    setAssignDriverOpen(false);
    setSelectedOrder(null);
    setSelectedDriverId('');
  };

  const handleUpdateStatus = async (orderId: string, status: string) => {
    await updateDeliveryOrderStatus(orderId, status);
  };

  const submitRatingAndDeliver = async () => {
    if (!rateDeliveryOrder) return;
    await updateDeliveryOrderStatus(rateDeliveryOrder.id, 'delivered', rateDeliveryOrder.driver, { rating: deliveryRating });
    setRateDeliveryOrder(null);
    setDeliveryRating(5);
  };

  const activeOrders = deliveryOrders.filter(o => o.status !== 'delivered').length;
  const onWayOrders = deliveryOrders.filter(o => o.status === 'on_way').length;
  const deliveredToday = deliveryOrders.filter(o => o.status === 'delivered').length;
  const activeDrivers = drivers.filter(d => d.status === 'active').length;

  const filteredOrders = deliveryOrders.filter(o => {
    if (searchQuery) {
      return o.orderNumber.includes(searchQuery) || o.customer.includes(searchQuery) || o.phone.includes(searchQuery);
    }
    return true;
  });

  const filteredDrivers = drivers.filter(d => {
    if (searchQuery) return d.name.includes(searchQuery) || d.phone.includes(searchQuery);
    return true;
  });

  return (
    <MainLayout title="التوصيل والسائقين" subtitle="إدارة عمليات التوصيل وأداء السائقين بشكل احترافي"
      actions={
        <div className="flex items-center gap-2">
           {activeTab === 'drivers' && (
              <Button onClick={() => setIsAddOpen(true)} className="gap-2 text-xs md:text-sm shadow-sm">
                <Plus className="w-4 h-4" />
                <span className="hidden sm:inline">إضافة سائق</span>
              </Button>
           )}
           {activeTab === 'zones' && (
              <Button onClick={() => setIsAddZoneOpen(true)} className="gap-2 text-xs md:text-sm shadow-sm">
                <Plus className="w-4 h-4" />
                <span className="hidden sm:inline">إضافة منطقة</span>
              </Button>
           )}
        </div>
      }
    >
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-4 mb-6">
        <Card className="border-none shadow bg-gradient-to-br from-card to-card/50">
           <CardContent className="p-4 md:p-5">
             <div className="flex items-center gap-4">
                <div className="w-12 h-12 rounded-xl bg-primary/10 text-primary flex items-center justify-center shadow-sm">
                   <Package className="w-6 h-6" />
                </div>
                <div>
                  <p className="text-2xl md:text-3xl font-bold font-mono">{number(activeOrders)}</p>
                  <p className="text-xs md:text-sm text-muted-foreground font-medium mt-1">طلبات نشطة</p>
                </div>
             </div>
           </CardContent>
        </Card>
        <Card className="border-none shadow bg-gradient-to-br from-card to-card/50">
           <CardContent className="p-4 md:p-5">
             <div className="flex items-center gap-4">
               <div className="w-12 h-12 rounded-xl bg-info/10 text-info flex items-center justify-center shadow-sm">
                  <Navigation className="w-6 h-6" />
               </div>
               <div>
                  <p className="text-2xl md:text-3xl font-bold font-mono">{number(onWayOrders)}</p>
                  <p className="text-xs md:text-sm text-muted-foreground font-medium mt-1">في الطريق</p>
               </div>
             </div>
           </CardContent>
        </Card>
        <Card className="border-none shadow bg-gradient-to-br from-card to-card/50">
           <CardContent className="p-4 md:p-5">
             <div className="flex items-center gap-4">
                <div className="w-12 h-12 rounded-xl bg-success/10 text-success flex items-center justify-center shadow-sm">
                   <CheckCircle className="w-6 h-6" />
                </div>
                <div>
                   <p className="text-2xl md:text-3xl font-bold font-mono">{number(deliveredToday)}</p>
                   <p className="text-xs md:text-sm text-muted-foreground font-medium mt-1">مكتمل اليوم</p>
                </div>
             </div>
           </CardContent>
        </Card>
        <Card className="border-none shadow bg-gradient-to-br from-card to-card/50">
           <CardContent className="p-4 md:p-5">
             <div className="flex items-center gap-4">
                <div className="w-12 h-12 rounded-xl bg-warning/10 text-warning flex items-center justify-center shadow-sm">
                   <Bike className="w-6 h-6" />
                </div>
                <div>
                   <p className="text-2xl md:text-3xl font-bold font-mono">{number(activeDrivers)}</p>
                   <p className="text-xs md:text-sm text-muted-foreground font-medium mt-1">سائقين متاحين</p>
                </div>
             </div>
           </CardContent>
        </Card>
      </div>

      <div className="flex items-center gap-4 mb-6">
         <div className="relative flex-1 max-w-md">
            <Search className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
            <Input 
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="ابحث برقم الطلب، العميل، رقم الهاتف..."
              className="pr-9 h-11 bg-card shadow-sm border-none" 
            />
         </div>
      </div>

      <Tabs value={activeTab} onValueChange={setActiveTab} className="space-y-6">
        <TabsList className="bg-card shadow-sm border p-1 rounded-xl h-auto">
           <TabsTrigger value="orders" className="py-2.5 px-6 rounded-lg text-sm font-medium">الطلبات الحية</TabsTrigger>
           <TabsTrigger value="drivers" className="py-2.5 px-6 rounded-lg text-sm font-medium">لوحة السائقين المحترفة</TabsTrigger>
           <TabsTrigger value="zones" className="py-2.5 px-6 rounded-lg text-sm font-medium">مناطق التوصيل</TabsTrigger>
        </TabsList>

        <TabsContent value="orders" className="space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {filteredOrders.map((order) => {
              const status = statusConfig[order.status] || { label: order.status || 'غير محدد', color: 'bg-muted text-muted-foreground border-border' };
              const assignedDriver = drivers.find(d => d.id === order.driver);
              return (
                <Card key={order.id} className="overflow-hidden shadow-sm hover:shadow-md transition-shadow duration-200 border-none group">
                  <div className={cn("h-1.5 w-full", 
                    order.status === 'on_way' ? 'bg-primary' : 
                    order.status === 'ready' ? 'bg-info' : 
                    order.status === 'delivered' ? 'bg-success' : 'bg-warning')} 
                  />
                  <CardContent className="p-0">
                    <div className="p-4 md:p-5">
                       <div className="flex justify-between items-start mb-4">
                          <div className="flex items-center gap-2">
                             <div className="w-8 h-8 rounded-full bg-secondary text-secondary-foreground flex items-center justify-center font-bold text-xs ring-2 ring-background shadow-sm">
                               {order.customer.charAt(0)}
                             </div>
                             <div>
                                <h3 className="font-bold text-sm tracking-tight">{order.orderNumber}</h3>
                                <p className="text-[11px] text-muted-foreground flex items-center gap-1 mt-0.5">
                                   <Clock className="w-3 h-3" /> {formatDate(order.createdAt, 'time')}
                                </p>
                             </div>
                          </div>
                          <Badge variant="outline" className={cn('text-xs font-semibold px-2.5 py-0.5 border', status.color)}>
                            {status.label}
                          </Badge>
                       </div>

                       <div className="space-y-2.5 mb-5">
                          <div className="flex gap-2 text-sm">
                             <User className="w-4 h-4 text-muted-foreground shrink-0 mt-0.5" />
                             <div>
                               <p className="font-medium">{order.customer}</p>
                               {order.phone && <p className="text-xs text-muted-foreground mt-0.5">{order.phone}</p>}
                             </div>
                          </div>
                          <div className="flex gap-2 text-sm">
                             <MapPin className="w-4 h-4 text-muted-foreground shrink-0 mt-0.5" />
                             <p className="text-muted-foreground leading-snug">{order.address}</p>
                          </div>
                          {assignedDriver && (
                            <div className="flex gap-2 text-sm bg-primary/5 p-2 rounded-lg mt-2 border border-primary/10">
                               <Bike className="w-4 h-4 text-primary shrink-0 mt-0.5" />
                               <div>
                                 <p className="font-semibold text-primary text-xs">تم التعيين إلى</p>
                                 <p className="font-bold text-sm">{assignedDriver.name}</p>
                               </div>
                            </div>
                          )}
                       </div>

                       <div className="flex items-center justify-between mt-auto pt-3 border-t">
                          <div>
                            <p className="text-[10px] text-muted-foreground mb-0.5 uppercase tracking-wider font-semibold">الإجمالي</p>
                            <p className="text-base font-bold text-foreground">{currency(order.total)}</p>
                          </div>
                          <div className="flex items-center gap-2">
                             {order.status === 'preparing' && <Button size="sm" variant="outline" className="h-8 text-xs font-semibold border-warning/30 hover:bg-warning/10 hover:text-warning" onClick={() => handleUpdateStatus(order.id, 'ready')}>جاهز للتسليم</Button>}
                             {(order.status === 'preparing' || order.status === 'ready') && <Button size="sm" className="h-8 text-xs font-semibold shadow-sm" onClick={() => { setSelectedOrder(order); setAssignDriverOpen(true); }}>تعيين سائق</Button>}
                             {order.status === 'on_way' && <Button size="sm" className="h-8 text-xs font-semibold bg-success hover:bg-success/90 text-white shadow-sm" onClick={() => setRateDeliveryOrder(order)}>تم التسليم</Button>}
                          </div>
                       </div>
                    </div>
                  </CardContent>
                </Card>
              );
            })}
            {filteredOrders.length === 0 && (
               <div className="col-span-full py-20 flex flex-col items-center justify-center text-center">
                  <div className="w-16 h-16 bg-muted rounded-full flex items-center justify-center mb-4 text-muted-foreground/50">
                     <Package className="w-8 h-8" />
                  </div>
                  <h3 className="text-lg font-bold mb-1">لا توجد طلبات توصيل</h3>
                  <p className="text-muted-foreground text-sm max-w-sm">لم يتم العثور على أي طلبات توصيل تطابق معايير البحث الخاصة بك حالياً.</p>
               </div>
            )}
          </div>
        </TabsContent>

        <TabsContent value="drivers" className="space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-5">
            {filteredDrivers.map((driver) => (
              <Card key={driver.id} className={cn("overflow-hidden border-none shadow-sm hover:shadow-md transition-all duration-200", driver.status === 'offline' && 'opacity-70 grayscale-[30%]')}>
                <CardContent className="p-0">
                  <div className="bg-gradient-to-r from-card to-card p-5 relative">
                     <div className="absolute top-4 left-4 flex gap-1 z-10">
                        <Button variant="ghost" size="icon" className="h-7 w-7 text-muted-foreground hover:bg-primary/10 hover:text-primary transition-colors" onClick={() => setEditingDriver(driver)}>
                          <Edit className="w-3.5 h-3.5" />
                        </Button>
                        <Button variant="ghost" size="icon" className="h-7 w-7 text-muted-foreground hover:bg-destructive/10 hover:text-destructive transition-colors" onClick={async () => {
                          if (confirm('هل أنت متأكد من حذف هذا السائق؟')) await deleteDriver(driver.id);
                        }}>
                          <Trash2 className="w-3.5 h-3.5" />
                        </Button>
                     </div>
                     <div className="flex items-center gap-4 mb-5">
                        <div className="relative">
                          <Avatar className="w-16 h-16 ring-4 ring-background shadow-md">
                             <AvatarFallback className="bg-primary/10 text-primary text-xl font-bold">{driver.name.charAt(0)}</AvatarFallback>
                          </Avatar>
                          <div className={cn("absolute bottom-0 right-0 w-4 h-4 rounded-full border-2 border-background", driver.status === 'active' ? 'bg-success' : 'bg-muted-foreground')} />
                        </div>
                        <div>
                          <h3 className="font-bold text-lg mb-0.5 pr-8">{driver.name}</h3>
                          <div className="flex items-center gap-3 text-sm text-muted-foreground font-medium">
                            <span className="flex items-center gap-1"><Phone className="w-3 h-3" /> <span dir="ltr">{driver.phone}</span></span>
                            <span className="flex items-center gap-1"><Bike className="w-3.5 h-3.5" /> {driver.vehicle}</span>
                          </div>
                        </div>
                     </div>

                     <div className="grid grid-cols-3 gap-3 mb-2">
                        <div className="bg-primary/5 rounded-xl block p-3 text-center border border-primary/10">
                           <div className="text-secondary-foreground mb-1"><TrendingUp className="w-4 h-4 mx-auto opacity-70" /></div>
                           <p className="text-xl font-bold font-mono text-primary">{number(driver.completedToday)}</p>
                           <p className="text-[10px] font-bold text-muted-foreground uppercase mt-0.5">طلبات اليوم</p>
                        </div>
                        <div className="bg-muted rounded-xl p-3 text-center border">
                           <div className="text-muted-foreground mb-1"><Calendar className="w-4 h-4 mx-auto opacity-70" /></div>
                           <p className="text-xl font-bold font-mono">{number(driver.totalDeliveries)}</p>
                           <p className="text-[10px] font-bold text-muted-foreground uppercase mt-0.5">إجمالي الطلبات</p>
                        </div>
                        <div className="bg-warning/5 rounded-xl p-3 text-center border border-warning/10">
                           <div className="text-warning mb-1"><Star className="w-4 h-4 mx-auto fill-warning opacity-90" /></div>
                           <p className="text-xl font-bold font-mono text-warning/90">{driver.rating.toFixed(1)}</p>
                           <p className="text-[10px] font-bold text-muted-foreground uppercase mt-0.5">التقييم العام</p>
                        </div>
                     </div>
                  </div>
                </CardContent>
              </Card>
            ))}
            {filteredDrivers.length === 0 && (
               <div className="col-span-full py-16 flex flex-col items-center justify-center text-center">
                  <div className="w-16 h-16 bg-muted rounded-full flex items-center justify-center mb-4 text-muted-foreground/50">
                     <Bike className="w-8 h-8" />
                  </div>
                  <h3 className="text-lg font-bold mb-1">لا يوجد سائقين</h3>
                  <p className="text-muted-foreground text-sm max-w-sm">قم بإضافة سائقين جدد للبدء في تعيين طلبات التوصيل لهم.</p>
                  <Button onClick={() => setIsAddOpen(true)} className="mt-4 gap-2 shadow-sm"><Plus className="w-4 h-4" /> إضافة سائق جديد</Button>
               </div>
            )}
          </div>
        </TabsContent>

        <TabsContent value="zones" className="space-y-4">
          <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 xl:grid-cols-4 gap-4">
            {deliveryZones.map((zone) => (
              <Card key={zone.id} className="border-none shadow-sm hover:shadow-md transition-shadow group relative overflow-hidden">
                <div className="absolute top-0 right-0 w-2 h-full bg-gradient-to-b from-primary/60 to-primary/10"></div>
                <CardContent className="p-5 relative pl-4">
                  <div className="absolute top-3 left-3 flex gap-1 flex-row-reverse opacity-0 group-hover:opacity-100 transition-opacity">
                    <Button variant="ghost" size="icon" className="h-7 w-7 text-muted-foreground hover:text-primary hover:bg-primary/10" onClick={() => setEditingZone(zone)}><Edit className="w-3.5 h-3.5" /></Button>
                    <Button variant="ghost" size="icon" className="h-7 w-7 text-muted-foreground hover:text-destructive hover:bg-destructive/10" onClick={async () => { if(confirm('تأكيد الحذف؟')) await deleteDeliveryZone(zone.id); }}><Trash2 className="w-3.5 h-3.5" /></Button>
                  </div>
                  <div className="mb-4 pr-3">
                    <Badge variant={zone.isActive !== false ? 'default' : 'secondary'} className="mb-2 text-[10px] px-2 py-0">{zone.isActive !== false ? 'متوفر' : 'غير متوفر'}</Badge>
                    <h3 className="font-bold text-lg">{zone.name}</h3>
                  </div>
                  <div className="space-y-3 pr-3">
                     <div className="flex justify-between items-center bg-muted/50 p-2 rounded-lg">
                        <span className="text-xs text-muted-foreground font-medium">رسوم التوصيل</span>
                        <span className="font-bold text-primary">{currency(zone.fee)}</span>
                     </div>
                     <div className="flex justify-between items-center bg-muted/50 p-2 rounded-lg">
                        <span className="text-xs text-muted-foreground font-medium">الحد الأدنى</span>
                        <span className="font-bold">{currency(zone.minOrder)}</span>
                     </div>
                     <div className="flex justify-between items-center bg-muted/50 p-2 rounded-lg">
                        <span className="text-xs text-muted-foreground font-medium">الوقت التقريبي</span>
                        <span className="font-bold text-sm bg-background px-2 py-0.5 rounded border shadow-sm flex items-center gap-1.5"><Clock className="w-3 h-3 text-muted-foreground" /> {zone.estimatedTime} د</span>
                     </div>
                  </div>
                </CardContent>
              </Card>
            ))}
            {deliveryZones.length === 0 && (
               <div className="col-span-full text-center text-muted-foreground py-16 bg-card rounded-xl border border-dashed">
                 <MapPin className="w-8 h-8 mx-auto mb-3 opacity-20" />
                 <p className="font-medium text-lg text-foreground/70">لا توجد مناطق توصيل مضافة</p>
                 <p className="text-sm mt-1">قم بتعريف المناطق لتحديد رسوم التوصيل.</p>
                 <Button onClick={() => setIsAddZoneOpen(true)} className="mt-4 gap-2" variant="outline"><Plus className="w-4 h-4" /> إضافة منطقة</Button>
               </div>
            )}
          </div>
        </TabsContent>
      </Tabs>

      {/* RATING MODAL */}
      <Dialog open={!!rateDeliveryOrder} onOpenChange={(o) => !o && setRateDeliveryOrder(null)}>
         <DialogContent className="sm:max-w-md text-center border-none shadow-2xl overflow-hidden rounded-2xl">
            <div className="absolute top-0 left-0 w-full h-2 bg-gradient-to-r from-success to-info"></div>
            <DialogHeader className="pt-6 pb-2">
               <div className="w-16 h-16 bg-success/10 rounded-full flex items-center justify-center mx-auto mb-4 border border-success/20 shadow-inner">
                  <ThumbsUp className="w-8 h-8 text-success" />
               </div>
               <DialogTitle className="text-2xl font-bold text-center">تم التسليم بنجاح!</DialogTitle>
            </DialogHeader>
            <div className="py-4 space-y-6">
               <div>
                  <p className="text-sm text-muted-foreground mb-1">كيف كان أداء السائق؟</p>
                  <p className="font-bold text-lg text-primary">
                    {drivers.find(d => d.id === rateDeliveryOrder?.driver)?.name}
                  </p>
               </div>
               
               <div className="flex justify-center gap-2">
                  {[1, 2, 3, 4, 5].map((star) => (
                    <button 
                       key={star} 
                       onClick={() => setDeliveryRating(star)}
                       className="p-1 focus:outline-none transition-transform hover:scale-110 active:scale-95"
                    >
                      <Star className={cn("w-10 h-10 transition-colors", star <= deliveryRating ? "fill-warning text-warning drop-shadow-sm" : "text-muted stroke-1 fill-transparent")} />
                    </button>
                  ))}
               </div>
               <p className="text-sm font-bold text-warning h-4">
                  {deliveryRating === 5 ? 'ممتاز!' : deliveryRating === 4 ? 'جيد جداً' : deliveryRating === 3 ? 'مقبول' : deliveryRating === 2 ? 'ضعيف' : 'سيء للغاية'}
               </p>
            </div>
            <DialogFooter className="sm:justify-center pb-4 pt-2">
               <Button size="lg" className="w-full sm:w-auto min-w-[200px] gap-2 h-12 text-md shadow-md rounded-xl" onClick={submitRatingAndDeliver}>
                  تأكيد وحفظ التقييم
               </Button>
            </DialogFooter>
         </DialogContent>
      </Dialog>

      {/* ADD DRIVER MODAL */}
      <Dialog open={isAddOpen} onOpenChange={setIsAddOpen}>
        <DialogContent className="rounded-xl border-none shadow-xl max-w-[95vw] sm:max-w-md max-h-[90dvh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="text-xl">إضافة سائق جديد</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <label className="text-sm font-medium">الاسم الكامل</label>
              <Input
                value={newDriver.name}
                onChange={(e) => setNewDriver({ ...newDriver, name: e.target.value })}
                placeholder="أدخل اسم السائق"
                className="h-11"
              />
            </div>
            <div className="space-y-2">
              <label className="text-sm font-medium">رقم الهاتف</label>
              <Input
                value={newDriver.phone}
                onChange={(e) => setNewDriver({ ...newDriver, phone: e.target.value })}
                placeholder="رقم الهاتف للتواصل"
                dir="ltr"
                className="h-11 text-right"
              />
            </div>
            <div className="space-y-2">
              <label className="text-sm font-medium">نوع المركبة</label>
              <Input
                value={newDriver.vehicle}
                onChange={(e) => setNewDriver({ ...newDriver, vehicle: e.target.value })}
                placeholder="(مثال: دراجة نارية، سيارة)"
                className="h-11"
              />
            </div>
            <div className="pt-2">
              <Button
                className="w-full h-11 text-md shadow-sm"
                disabled={!newDriver.name || !newDriver.phone}
                onClick={async () => {
                  const success = await addDriver({
                    name: newDriver.name,
                    phone: newDriver.phone,
                    vehicle: newDriver.vehicle,
                    status: 'active',
                    current_orders: 0,
                    completed_today: 0,
                    total_deliveries: 0,
                    rating: 5.0,
                    ratings_count: 1
                  });
                  if (success) {
                    setIsAddOpen(false);
                    setNewDriver({ name: '', phone: '', vehicle: '' });
                  }
                }}
              >
                إضافة السائق
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
      
      {/* EDIT DRIVER MODAL */}
      <Dialog open={!!editingDriver} onOpenChange={(open) => !open && setEditingDriver(null)}>
        <DialogContent className="rounded-xl border-none shadow-xl max-w-[95vw] sm:max-w-md max-h-[90dvh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="text-xl">تعديل بيانات السائق</DialogTitle>
          </DialogHeader>
          {editingDriver && (
            <div className="space-y-4 py-4">
              <div className="space-y-2">
                <label className="text-sm font-medium">الاسم</label>
                <Input
                  value={editingDriver.name}
                  onChange={(e) => setEditingDriver({ ...editingDriver, name: e.target.value })}
                  placeholder="اسم السائق"
                  className="h-11"
                />
              </div>
              <div className="space-y-2">
                <label className="text-sm font-medium">رقم الهاتف</label>
                <Input
                  value={editingDriver.phone}
                  onChange={(e) => setEditingDriver({ ...editingDriver, phone: e.target.value })}
                  placeholder="رقم الهاتف"
                  dir="ltr"
                  className="h-11 text-right"
                />
              </div>
              <div className="space-y-2">
                <label className="text-sm font-medium">نوع المركبة</label>
                <Input
                  value={editingDriver.vehicle}
                  onChange={(e) => setEditingDriver({ ...editingDriver, vehicle: e.target.value })}
                  placeholder="(مثال: دراجة نارية، سيارة)"
                  className="h-11"
                />
              </div>
              <div className="pt-2">
                <Button
                  className="w-full h-11 text-md shadow-sm"
                  disabled={!editingDriver.name || !editingDriver.phone}
                  onClick={async () => {
                    const success = await updateDriver(editingDriver.id, {
                      name: editingDriver.name,
                      phone: editingDriver.phone,
                      vehicle: editingDriver.vehicle,
                    });
                    if (success) {
                      setEditingDriver(null);
                    }
                  }}
                >
                  حفظ التعديلات
                </Button>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>
      
      {/* ASSIGN DRIVER MODAL */}
      <Dialog open={assignDriverOpen} onOpenChange={setAssignDriverOpen}>
        <DialogContent className="rounded-xl border-none shadow-xl max-w-[95vw] sm:max-w-md max-h-[90dvh] overflow-y-auto">
          <DialogHeader>
             <DialogTitle className="text-xl flex items-center justify-center gap-2">
                <User className="w-5 h-5 text-primary" />
                تعيين سائق للتوصيل
             </DialogTitle>
          </DialogHeader>
          <div className="space-y-5 py-6">
            <div className="text-center mb-2">
               <p className="font-bold text-lg mb-1">{selectedOrder?.orderNumber}</p>
               <p className="text-sm text-muted-foreground">{selectedOrder?.customer} - {selectedOrder?.address}</p>
            </div>
            
            <div className="space-y-3">
              <label className="text-sm font-bold text-foreground block">اختر السائق المتاح</label>
              <div className="grid gap-2 max-h-56 overflow-y-auto p-1 custom-scrollbar">
                {drivers.filter(d => d.status === 'active').map(d => (
                  <label key={d.id} className={cn("relative flex items-center justify-between cursor-pointer p-3 rounded-lg border-2 transition-all", selectedDriverId === d.id ? "border-primary bg-primary/5" : "border-transparent bg-muted/50 hover:bg-muted")}>
                    <input 
                      type="radio" 
                      name="driver" 
                      value={d.id} 
                      className="peer sr-only" 
                      checked={selectedDriverId === d.id}
                      onChange={(e) => setSelectedDriverId(e.target.value)}
                    />
                    <div className="flex items-center gap-3">
                       <Avatar className="w-10 h-10 border border-background shadow-sm"><AvatarFallback className="bg-background text-sm font-bold">{d.name.charAt(0)}</AvatarFallback></Avatar>
                       <div>
                         <p className="font-bold text-sm">{d.name}</p>
                         <p className="text-xs text-muted-foreground flex items-center gap-1"><Bike className="w-3 h-3" /> {d.vehicle}</p>
                       </div>
                    </div>
                    {d.currentOrders > 0 ? (
                       <Badge variant="outline" className="text-[10px] text-warning border-warning/30 bg-warning/5">مشغول ({d.currentOrders})</Badge>
                    ) : (
                       <Badge variant="outline" className="text-[10px] text-success border-success/30 bg-success/5">متاح الآن</Badge>
                    )}
                    {selectedDriverId === d.id && (
                      <CheckCircle className="absolute left-3 w-5 h-5 text-primary opacity-100 transition-opacity" />
                    )}
                  </label>
                ))}
                {drivers.filter(d => d.status === 'active').length === 0 && (
                   <p className="text-center text-sm text-muted-foreground py-4">لا يوجد سائقين نشطين حالياً</p>
                )}
              </div>
            </div>
            <Button className="w-full h-12 text-md shadow-sm rounded-xl mt-2" onClick={handleAssignDriver} disabled={!selectedDriverId || drivers.filter(d => d.status === 'active').length === 0}>
               تأكيد اختيار السائق
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      {/* ZONES MODALS */}
      <Dialog open={isAddZoneOpen} onOpenChange={setIsAddZoneOpen}>
        <DialogContent className="rounded-xl border-none shadow-xl max-w-[95vw] sm:max-w-md max-h-[90dvh] overflow-y-auto">
          <DialogHeader><DialogTitle className="text-xl">إضافة منطقة جديدة</DialogTitle></DialogHeader>
          <div className="space-y-4 py-4">
            <div className="space-y-2"><label className="text-sm font-medium">اسم المنطقة</label><Input className="h-11" value={newZone.name} onChange={e => setNewZone({...newZone, name: e.target.value})} placeholder="مثال: وسط البلد" /></div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div className="space-y-2"><label className="text-sm font-medium">رسوم التوصيل</label><Input className="h-11" type="number" value={newZone.fee} onChange={e => setNewZone({...newZone, fee: Number(e.target.value)})} /></div>
              <div className="space-y-2"><label className="text-sm font-medium">الحد الأدنى للطلب</label><Input className="h-11" type="number" value={newZone.minOrder} onChange={e => setNewZone({...newZone, minOrder: Number(e.target.value)})} /></div>
            </div>
            <div className="space-y-2"><label className="text-sm font-medium">الوقت المتوقع (بالدقائق)</label><Input className="h-11" type="number" value={newZone.estimatedTime} onChange={e => setNewZone({...newZone, estimatedTime: Number(e.target.value)})} /></div>
            <div className="pt-2"><Button className="w-full h-11 text-md shadow-sm" disabled={!newZone.name} onClick={async () => {
              const s = await addDeliveryZone(newZone);
              if(s) { setIsAddZoneOpen(false); setNewZone({ name: '', fee: 0, minOrder: 0, estimatedTime: 30, isActive: true }); }
            }}>إضافة المنطقة</Button></div>
          </div>
        </DialogContent>
      </Dialog>

      <Dialog open={!!editingZone} onOpenChange={(o) => !o && setEditingZone(null)}>
        <DialogContent className="rounded-xl border-none shadow-xl max-w-[95vw] sm:max-w-md max-h-[90dvh] overflow-y-auto">
          <DialogHeader><DialogTitle className="text-xl">تعديل المنطقة</DialogTitle></DialogHeader>
          {editingZone && (
             <div className="space-y-4 py-4">
             <div className="space-y-2"><label className="text-sm font-medium">اسم المنطقة</label><Input className="h-11" value={editingZone.name} onChange={e => setEditingZone({...editingZone, name: e.target.value})} /></div>
             <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
               <div className="space-y-2"><label className="text-sm font-medium">رسوم التوصيل</label><Input className="h-11" type="number" value={editingZone.fee} onChange={e => setEditingZone({...editingZone, fee: Number(e.target.value)})} /></div>
               <div className="space-y-2"><label className="text-sm font-medium">الحد الأدنى للطلب</label><Input className="h-11" type="number" value={editingZone.minOrder} onChange={e => setEditingZone({...editingZone, minOrder: Number(e.target.value)})} /></div>
             </div>
             <div className="space-y-2"><label className="text-sm font-medium">الوقت المتوقع (بالدقائق)</label><Input className="h-11" type="number" value={editingZone.estimatedTime} onChange={e => setEditingZone({...editingZone, estimatedTime: Number(e.target.value)})} /></div>
             <div className="pt-2"><Button className="w-full h-11 text-md shadow-sm" disabled={!editingZone.name} onClick={async () => {
               const s = await updateDeliveryZone(editingZone.id, { name: editingZone.name, fee: editingZone.fee, minOrder: editingZone.minOrder, estimatedTime: editingZone.estimatedTime });
               if(s) setEditingZone(null);
             }}>حفظ بيانات المنطقة</Button></div>
           </div>
          )}
        </DialogContent>
      </Dialog>
    </MainLayout>
  );
}
