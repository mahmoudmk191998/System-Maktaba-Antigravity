import { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { MainLayout } from '@/components/layout';
import { useTenantBranch, useTables, useReservations } from '@/hooks/useDatabase';
import { useUserPermissions } from '@/hooks/usePermissions';
import { cn } from '@/lib/utils';
import { Users, Clock, Plus, Calendar, Phone, Edit, Trash2, LayoutGrid, MapPin, CheckCircle, SprayCan, Check, MoreVertical, Coffee, ArrowRightCircle } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card, CardContent, CardHeader } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuLabel, DropdownMenuSeparator, DropdownMenuTrigger } from '@/components/ui/dropdown-menu';
import { Progress } from '@/components/ui/progress';
import { format, isToday, isTomorrow } from 'date-fns';
import { ar } from 'date-fns/locale';
import { Search, Filter } from 'lucide-react';
import { Checkbox } from '@/components/ui/checkbox';
import { toast } from 'sonner';

const statusLabels: Record<string, string> = { confirmed: 'تم الوصول', pending: 'في الانتظار', waitlist: 'قائمة الانتظار', cancelled: 'ملغي', completed: 'مكتمل', no_show: 'لم يحضر' };
const statusColors: Record<string, string> = { confirmed: 'bg-emerald-500/10 text-emerald-500 border-emerald-500/30', pending: 'bg-amber-500/10 text-amber-500 border-amber-500/30', waitlist: 'bg-blue-500/10 text-blue-500 border-blue-500/30', cancelled: 'bg-rose-500/10 text-rose-500 border-rose-500/30', completed: 'bg-indigo-500/10 text-indigo-500 border-indigo-500/30' };

const tableStatusColors: Record<string, any> = {
  available: { border: 'border-emerald-500/30', bg: 'bg-emerald-500/5', text: 'text-emerald-500', fill: 'bg-emerald-500' },
  occupied: { border: 'border-rose-500/30', bg: 'bg-rose-500/5', text: 'text-rose-500', fill: 'bg-rose-500' },
  reserved: { border: 'border-amber-500/30', bg: 'bg-amber-500/5', text: 'text-amber-500', fill: 'bg-amber-500' },
  cleaning: { border: 'border-blue-500/30', bg: 'bg-blue-500/5', text: 'text-blue-500', fill: 'bg-blue-500' }
};

export default function TablesReservations() {
  const { branchId } = useTenantBranch();
  const { tables, add: addTable, update: updateTable, remove: removeTable } = useTables(branchId);
  const { reservations, add: addReservation, update: updateReservation, remove: removeReservation } = useReservations(branchId);
  const { hasPermission } = useUserPermissions();

  const canManageTables = hasPermission('tables.manage');

  const [showNewReservation, setShowNewReservation] = useState(false);
  const [showEditReservation, setShowEditReservation] = useState<any>(null);
  const [showAddTable, setShowAddTable] = useState(false);
  const [showEditTable, setShowEditTable] = useState<any>(null);
  
  // Table Filters
  const [selectedTables, setSelectedTables] = useState<string[]>([]);
  const [selectedZone, setSelectedZone] = useState('الكل');
  const [tableStatusFilter, setTableStatusFilter] = useState('all');

  // Reservation Filters
  const [selectedReservations, setSelectedReservations] = useState<string[]>([]);
  const [resSearchQuery, setResSearchQuery] = useState('');
  const [resStatusFilter, setResStatusFilter] = useState('all');

  // Reservation form
  const [resForm, setResForm] = useState({ customer_name: '', customer_phone: '', guests_count: 2, reservation_date: '', reservation_time: '', notes: '', status: 'pending' });
  // Table form
  const [tableForm, setTableForm] = useState({ table_number: 1, seats: 4, status: 'available', zone_id: 'القاعة الرئيسية' });

  const zones = ['الكل', ...Array.from(new Set(tables.map((t: any) => t.zone_id || 'القاعة الرئيسية').filter(Boolean)))];
  
  const filteredTables = tables.filter((t: any) => {
    const matchesZone = selectedZone === 'الكل' || (t.zone_id || 'القاعة الرئيسية') === selectedZone;
    const matchesStatus = tableStatusFilter === 'all' || t.status === tableStatusFilter;
    return matchesZone && matchesStatus;
  });

  const filteredReservations = reservations.filter((r: any) => {
    const matchesSearch = r.customer_name?.toLowerCase().includes(resSearchQuery.toLowerCase()) || r.customer_phone?.includes(resSearchQuery);
    const matchesStatus = resStatusFilter === 'all' || r.status === resStatusFilter;
    return matchesSearch && matchesStatus;
  }).sort((a: any, b: any) => new Date(`${b.reservation_date}T${b.reservation_time}`).getTime() - new Date(`${a.reservation_date}T${a.reservation_time}`).getTime());

  // Dashboard Stats
  const totalSeats = tables.reduce((sum: number, t: any) => sum + (t.seats || 0), 0);
  const occupiedSeats = tables.filter((t: any) => t.status === 'occupied').reduce((sum: number, t: any) => sum + (t.seats || 0), 0);
  const occupancyRate = totalSeats > 0 ? Math.round((occupiedSeats / totalSeats) * 100) : 0;
  
  const tablesAvailable = tables.filter((t: any) => t.status === 'available').length;
  const tablesOccupied = tables.filter((t: any) => t.status === 'occupied').length;
  const tablesCleaning = tables.filter((t: any) => t.status === 'cleaning').length;

  const handleQuickTableStatus = async (e: React.MouseEvent, tableId: string, newStatus: string) => {
    e.stopPropagation();
    await updateTable(tableId, { status: newStatus });
    toast.success(`تم تغيير حالة الطاولة إلى ${newStatus === 'available' ? 'متاحة' : newStatus === 'occupied' ? 'مشغولة' : newStatus === 'cleaning' ? 'قيد التنظيف' : 'محجوزة'}`);
  };

  const handleQuickCheckIn = async (e: React.MouseEvent, resId: string) => {
    e.stopPropagation();
    await updateReservation(resId, { status: 'confirmed' });
    toast.success('تم تأكيد الحجز وتسجيل وصول العميل بنجاح!');
  };

  const handleAddReservation = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!resForm.customer_name || !resForm.customer_phone || !resForm.reservation_date || !resForm.reservation_time) {
      toast.error('يرجى ملء جميع الحقول المطلوبة');
      return;
    }
    const success = await addReservation(resForm);
    if (success) { setShowNewReservation(false); setResForm({ customer_name: '', customer_phone: '', guests_count: 2, reservation_date: '', reservation_time: '', notes: '' }); }
  };

  const handleBulkDeleteTables = async () => {
    if (!window.confirm(`هل أنت متأكد من حذف ${selectedTables.length} طاولة؟`)) return;
    for (const id of selectedTables) {
      await removeTable(id);
    }
    setSelectedTables([]);
  };

  const handleBulkDeleteReservations = async () => {
    if (!window.confirm(`هل أنت متأكد من حذف ${selectedReservations.length} حجز؟`)) return;
    for (const id of selectedReservations) {
      await removeReservation(id);
    }
    setSelectedReservations([]);
  };

  const handleAddTable = async (e: React.FormEvent) => {
    e.preventDefault();
    const success = await addTable(tableForm);
    if (success) { setShowAddTable(false); setTableForm({ table_number: 1, seats: 4, status: 'available' }); }
  };

  const handleUpdateTable = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!showEditTable) return;
    await updateTable(showEditTable.id, { table_number: showEditTable.table_number, seats: showEditTable.seats, status: showEditTable.status, zone_id: showEditTable.zone_id });
    setShowEditTable(null);
  };

  const handleUpdateReservation = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!showEditReservation) return;
    await updateReservation(showEditReservation.id, { 
      customer_name: showEditReservation.customer_name, 
      customer_phone: showEditReservation.customer_phone, 
      guests_count: showEditReservation.guests_count, 
      reservation_date: showEditReservation.reservation_date, 
      reservation_time: showEditReservation.reservation_time, 
      notes: showEditReservation.notes,
      status: showEditReservation.status 
    });
    setShowEditReservation(null);
  };

  const formatReservationDate = (dateStr: string) => {
    try {
      const date = new Date(dateStr);
      if (isToday(date)) return 'اليوم';
      if (isTomorrow(date)) return 'غداً';
      return format(date, 'd MMMM yyyy', { locale: ar });
    } catch {
      return dateStr;
    }
  };

  return (
    <MainLayout title="الطاولات والحجوزات" subtitle="إدارة مخطط الطاولات والحجوزات"
      actions={
        <div className="flex gap-2">
          {canManageTables && <Button variant="outline" className="gap-2 text-xs md:text-sm" onClick={() => setShowAddTable(true)}><Plus className="w-4 h-4" />طاولة جديدة</Button>}
          <Button className="gap-2 text-xs md:text-sm" onClick={() => setShowNewReservation(true)}><Plus className="w-4 h-4" />حجز جديد</Button>
        </div>
      }
    >
      <Tabs defaultValue="floor-plan" className="space-y-6">
        <TabsList className="flex-wrap h-auto">
          <TabsTrigger value="floor-plan" className="gap-2"><LayoutGrid className="w-4 h-4" />مخطط الطاولات</TabsTrigger>
          <TabsTrigger value="reservations" className="gap-2"><Calendar className="w-4 h-4" />الحجوزات</TabsTrigger>
        </TabsList>

        <TabsContent value="floor-plan" className="space-y-6">
          <div className="flex flex-col md:flex-row gap-4 items-center justify-between bg-card p-3 rounded-xl border shadow-sm">
            <div className="flex gap-2 overflow-x-auto w-full md:w-auto pb-2 md:pb-0 hide-scrollbar">
              {zones.map((zone: string) => (
                <Button key={zone} variant={selectedZone === zone ? "default" : "outline"} size="sm" onClick={() => setSelectedZone(zone)} className="whitespace-nowrap rounded-full">
                  {zone}
                </Button>
              ))}
            </div>
            {selectedTables.length > 0 && (
              <Button onClick={handleBulkDeleteTables} variant="destructive" size="sm" className="gap-2 shrink-0 md:mr-auto">
                <Trash2 className="w-4 h-4" />
                حذف المحدد ({selectedTables.length})
              </Button>
            )}
            <Select value={tableStatusFilter} onValueChange={setTableStatusFilter}>
              <SelectTrigger className="w-full md:w-[180px] h-9">
                <div className="flex items-center gap-2"><Filter className="w-4 h-4" /><span>الحالة: {tableStatusFilter === 'all' ? 'الكل' : tableStatusFilter === 'available' ? 'متاحة' : tableStatusFilter === 'occupied' ? 'مشغولة' : 'محجوزة'}</span></div>
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">الكل</SelectItem>
                <SelectItem value="available">متاحة</SelectItem>
                <SelectItem value="occupied">مشغولة</SelectItem>
                <SelectItem value="reserved">محجوزة</SelectItem>
                <SelectItem value="cleaning">قيد التنظيف</SelectItem>
              </SelectContent>
            </Select>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-4 mb-6">
            <Card className="bg-primary/5 border-primary/20">
              <CardContent className="p-4 flex flex-col justify-center">
                <div className="flex justify-between items-center mb-2">
                  <p className="text-sm font-medium text-muted-foreground">نسبة الإشغال</p>
                  <Users className="w-4 h-4 text-primary" />
                </div>
                <div className="flex items-end gap-2">
                  <p className="text-3xl font-black text-primary">{occupancyRate}%</p>
                  <span className="text-sm text-muted-foreground mb-1">({occupiedSeats} من {totalSeats} مقعد)</span>
                </div>
                <Progress value={occupancyRate} className="h-1.5 mt-3" indicatorColor="bg-primary" />
              </CardContent>
            </Card>
            <Card className="bg-emerald-500/5 border-emerald-500/20">
              <CardContent className="p-4 flex flex-col justify-center">
                <div className="flex justify-between items-center mb-2">
                  <p className="text-sm font-medium text-emerald-600/80">طاولات متاحة</p>
                  <CheckCircle className="w-4 h-4 text-emerald-500" />
                </div>
                <p className="text-3xl font-black text-emerald-500">{tablesAvailable}</p>
              </CardContent>
            </Card>
            <Card className="bg-rose-500/5 border-rose-500/20">
              <CardContent className="p-4 flex flex-col justify-center">
                <div className="flex justify-between items-center mb-2">
                  <p className="text-sm font-medium text-rose-600/80">مأهولة حالياً</p>
                  <Coffee className="w-4 h-4 text-rose-500" />
                </div>
                <p className="text-3xl font-black text-rose-500">{tablesOccupied}</p>
              </CardContent>
            </Card>
            <Card className="bg-blue-500/5 border-blue-500/20">
              <CardContent className="p-4 flex flex-col justify-center">
                <div className="flex justify-between items-center mb-2">
                  <p className="text-sm font-medium text-blue-600/80">قيد التنظيف</p>
                  <SprayCan className="w-4 h-4 text-blue-500" />
                </div>
                <p className="text-3xl font-black text-blue-500">{tablesCleaning}</p>
              </CardContent>
            </Card>
          </div>

          {filteredTables.length === 0 ? (
            <div className="text-center py-16 text-muted-foreground bg-card/50 rounded-2xl border border-dashed">
              <LayoutGrid className="w-16 h-16 mx-auto mb-4 opacity-20" />
              <p className="text-lg font-medium">لا توجد طاولات تطابق البحث</p>
              <p className="text-sm mb-4">أضف طاولات أو قم بتغيير الفلاتر</p>
              {canManageTables && <Button onClick={() => setShowAddTable(true)} className="gap-2"><Plus className="w-4 h-4" />إضافة طاولة</Button>}
            </div>
          ) : (
            <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 gap-4 md:gap-6">
              <AnimatePresence>
                {filteredTables.map((table: any, index: number) => {
                  const sColor = tableStatusColors[table.status] || tableStatusColors.available;
                  return (
                    <motion.div key={table.id} layout initial={{ opacity: 0, scale: 0.9 }} animate={{ opacity: 1, scale: 1 }} exit={{ opacity: 0, scale: 0.9 }} transition={{ delay: index * 0.03 }} className="group">
                      <Card 
                        className={cn(
                          'cursor-pointer h-32 md:h-40 transition-all duration-300 hover:shadow-lg relative overflow-hidden backdrop-blur-md', 
                          sColor.border, sColor.bg,
                          table.seats > 4 ? 'rounded-[2rem]' : 'rounded-2xl' // Circular/Oval for big tables conceptually
                        )}
                        onClick={() => {
                          if (canManageTables && window.innerWidth >= 768) setShowEditTable({ ...table });
                        }}
                      >
                        <div className={cn("absolute top-0 right-0 w-full h-1.5 transition-colors duration-300", sColor.fill)} />
                        
                        {canManageTables && (
                          <div 
                            className="absolute top-3 right-3 z-10" 
                            onClick={e => e.stopPropagation()}
                          >
                            <Checkbox 
                              checked={selectedTables.includes(table.id)}
                              onCheckedChange={(checked) => {
                                if (checked) {
                                  setSelectedTables(prev => [...prev, table.id]);
                                } else {
                                  setSelectedTables(prev => prev.filter(id => id !== table.id));
                                }
                              }}
                            />
                          </div>
                        )}
                        
                        <CardContent className="p-3 md:p-4 h-full flex flex-col items-center justify-between text-center">
                          <div className="flex justify-between w-full items-start">
                             <div className="flex items-center gap-1.5 text-xs text-muted-foreground bg-background/60 backdrop-blur px-2 py-0.5 rounded-full shadow-sm">
                               <Users className="w-3.5 h-3.5" />
                               <span className="font-medium">{table.seats}</span>
                             </div>
                             
                             {canManageTables && (
                               <DropdownMenu>
                                  <DropdownMenuTrigger asChild>
                                    <Button variant="ghost" size="icon" className="h-6 w-6 rounded-full opacity-60 hover:opacity-100 hover:bg-background/80" onClick={(e) => e.stopPropagation()}>
                                      <MoreVertical className="w-4 h-4" />
                                    </Button>
                                  </DropdownMenuTrigger>
                                  <DropdownMenuContent align="end" className="w-40">
                                    <DropdownMenuLabel className="text-xs">تغيير الحالة السريع</DropdownMenuLabel>
                                    <DropdownMenuSeparator />
                                    <DropdownMenuItem onClick={(e) => handleQuickTableStatus(e as any, table.id, 'available')} className="gap-2 text-emerald-500"><CheckCircle className="w-4 h-4"/> متاحة</DropdownMenuItem>
                                    <DropdownMenuItem onClick={(e) => handleQuickTableStatus(e as any, table.id, 'occupied')} className="gap-2 text-rose-500"><Coffee className="w-4 h-4"/> مشغولة</DropdownMenuItem>
                                    <DropdownMenuItem onClick={(e) => handleQuickTableStatus(e as any, table.id, 'cleaning')} className="gap-2 text-blue-500"><SprayCan className="w-4 h-4"/> قيد التنظيف</DropdownMenuItem>
                                    <DropdownMenuSeparator />
                                    <DropdownMenuItem onClick={(e) => { e.stopPropagation(); setShowEditTable({ ...table }); }} className="gap-2"><Edit className="w-4 h-4" />تعديل الطاولة</DropdownMenuItem>
                                    <DropdownMenuItem onClick={async (e) => { 
                                      e.stopPropagation(); 
                                      if (window.confirm('هل أنت متأكد من حذف هذه الطاولة؟')) {
                                        await removeTable(table.id);
                                        toast.success('تم حذف الطاولة');
                                      }
                                    }} className="gap-2 text-rose-500 focus:text-rose-500"><Trash2 className="w-4 h-4" />حذف الطاولة</DropdownMenuItem>
                                  </DropdownMenuContent>
                               </DropdownMenu>
                             )}
                          </div>

                          <div className="flex flex-col items-center justify-center flex-1">
                            <span className={cn("text-3xl md:text-5xl font-black transition-colors duration-300 drop-shadow-sm", sColor.text)}>{table.table_number}</span>
                            {table.zone_id && table.zone_id !== 'القاعة الرئيسية' && (
                              <div className="flex items-center gap-1 text-[10px] text-muted-foreground mt-1.5 bg-background/40 px-2 py-0.5 rounded-full border border-white/5">
                                <MapPin className="w-2.5 h-2.5" />
                                <span className="truncate max-w-[80px]">{table.zone_id}</span>
                              </div>
                            )}
                          </div>
                          
                          <Badge variant="outline" className={cn('mt-2 text-[10px] items-center gap-1.5 md:text-xs shadow-sm bg-background/80 backdrop-blur-md font-bold', sColor.border, sColor.text)}>
                            {table.status === 'available' && <CheckCircle className="w-3 h-3" />}
                            {table.status === 'occupied' && <Coffee className="w-3 h-3" />}
                            {table.status === 'cleaning' && <SprayCan className="w-3 h-3" />}
                            {table.status === 'reserved' && <Calendar className="w-3 h-3" />}
                            {table.status === 'available' ? 'متاحة' : table.status === 'occupied' ? 'مشغولة' : table.status === 'cleaning' ? 'تنظيف' : 'محجوزة'}
                          </Badge>
                        </CardContent>
                      </Card>
                    </motion.div>
                  );
                })}
              </AnimatePresence>
            </div>
          )}
          <div className="flex flex-wrap items-center justify-center gap-4 pt-6 border-t border-white/5">
            <div className="flex items-center gap-2"><div className="w-4 h-4 rounded-full bg-emerald-500/20 border-2 border-emerald-500" /><span className="text-sm font-medium">متاحة</span></div>
            <div className="flex items-center gap-2"><div className="w-4 h-4 rounded-full bg-rose-500/20 border-2 border-rose-500" /><span className="text-sm font-medium">مشغولة</span></div>
            <div className="flex items-center gap-2"><div className="w-4 h-4 rounded-full bg-blue-500/20 border-2 border-blue-500" /><span className="text-sm font-medium">قيد التنظيف</span></div>
            <div className="flex items-center gap-2"><div className="w-4 h-4 rounded-full bg-amber-500/20 border-2 border-amber-500" /><span className="text-sm font-medium">محجوزة</span></div>
          </div>
        </TabsContent>

        <TabsContent value="reservations" className="space-y-6">
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-4 mb-6">
            <Card className="bg-primary/5 border-primary/20"><CardContent className="p-4 text-center"><p className="text-3xl font-black text-primary">{reservations.length}</p><p className="text-sm font-medium text-muted-foreground mt-1">إجمالي الحجوزات</p></CardContent></Card>
            <Card className="bg-emerald-500/5 border-emerald-500/20"><CardContent className="p-4 text-center"><p className="text-3xl font-black text-emerald-500">{reservations.filter((r: any) => r.status === 'confirmed').length}</p><p className="text-sm font-medium text-muted-foreground mt-1">المسجلة والتامة</p></CardContent></Card>
            <Card className="bg-amber-500/5 border-amber-500/20"><CardContent className="p-4 text-center"><p className="text-3xl font-black text-amber-500">{reservations.filter((r: any) => r.status === 'pending').length}</p><p className="text-sm font-medium text-muted-foreground mt-1">ترقب الوصول</p></CardContent></Card>
            <Card className="bg-blue-500/5 border-blue-500/20"><CardContent className="p-4 text-center"><p className="text-3xl font-black text-blue-500">{reservations.reduce((sum: number, r: any) => sum + (r.guests_count || 0), 0)}</p><p className="text-sm font-medium text-muted-foreground mt-1">إجمالي الضيوف</p></CardContent></Card>
          </div>

          <div className="flex flex-col md:flex-row gap-4 items-center justify-between bg-card p-3 rounded-xl border shadow-sm">
            <div className="relative w-full md:w-96">
              <Search className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
              <Input placeholder="بحث باسم العميل أو رقم الهاتف..." className="pl-3 pr-9 h-10 w-full bg-background rounded-lg" value={resSearchQuery} onChange={(e) => setResSearchQuery(e.target.value)} />
            </div>
            
            <Select value={resStatusFilter} onValueChange={setResStatusFilter}>
              <SelectTrigger className="w-full md:w-[180px] h-10">
                <div className="flex items-center gap-2"><Filter className="w-4 h-4" /><span>{resStatusFilter === 'all' ? 'جميع الحالات' : statusLabels[resStatusFilter]}</span></div>
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">جميع الحالات</SelectItem>
                {Object.entries(statusLabels).map(([key, label]) => (
                  <SelectItem key={key} value={key}>{label}</SelectItem>
                ))}
              </SelectContent>
            </Select>
            {selectedReservations.length > 0 && (
              <Button onClick={handleBulkDeleteReservations} variant="destructive" className="gap-2 shrink-0 md:mr-auto">
                <Trash2 className="w-4 h-4" />
                حذف المحدد ({selectedReservations.length})
              </Button>
            )}
          </div>

          {filteredReservations.length === 0 ? (
            <div className="text-center py-16 text-muted-foreground bg-card/50 rounded-2xl border border-dashed"><Calendar className="w-16 h-16 mx-auto mb-4 opacity-20" /><p className="text-lg font-medium">لا توجد حجوزات تطابق البحث</p></div>
          ) : (
            <div className="grid gap-3">
              <AnimatePresence>
                {filteredReservations.map((res: any, index: number) => {
                  const isTodayRes = isToday(new Date(res.reservation_date));
                  const isPending = res.status === 'pending';
                  
                  return (
                    <motion.div key={res.id} layout initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, scale: 0.95 }} transition={{ delay: index * 0.05 }}>
                      <Card className={cn(
                        "hover:shadow-md transition-shadow group overflow-hidden relative",
                        isTodayRes && isPending ? "border-amber-500/40 bg-amber-500/5 ring-1 ring-amber-500/20" : ""
                      )}>
                        {isTodayRes && isPending && <div className="absolute top-0 left-0 w-1.5 h-full bg-amber-500" />}
                        <CardContent className="p-4 md:p-5">
                          <div className="flex flex-col md:flex-row items-start md:items-center gap-4">
                            <div className="flex items-center self-start md:self-center mt-1 md:mt-0 px-2" onClick={e => e.stopPropagation()}>
                               <Checkbox 
                                 checked={selectedReservations.includes(res.id)}
                                 onCheckedChange={(checked) => {
                                   if (checked) {
                                      setSelectedReservations(prev => [...prev, res.id]);
                                   } else {
                                      setSelectedReservations(prev => prev.filter(id => id !== res.id));
                                   }
                                 }}
                               />
                            </div>
                            <div className={cn("w-14 h-14 rounded-2xl flex items-center justify-center font-bold text-2xl hidden md:flex border shadow-sm", statusColors[res.status] || 'bg-primary/10 text-primary')}>
                              {res.customer_name?.charAt(0)}
                            </div>
                            <div className="flex-1 min-w-0 w-full">
                              <div className="flex items-center justify-between md:justify-start gap-4 mb-2 flex-wrap">
                                <h4 className="font-bold text-lg md:text-xl text-foreground flex items-center gap-2">
                                  {res.customer_name}
                                  {isTodayRes && <Badge variant="default" className="text-[10px] h-5 bg-primary text-primary-foreground">حجز اليوم</Badge>}
                                </h4>
                                <Badge variant="outline" className={cn('text-xs px-2.5 py-1 border font-medium', statusColors[res.status] || '')}>{statusLabels[res.status] || res.status}</Badge>
                              </div>
                              <div className="flex items-center gap-x-5 gap-y-2 text-sm text-foreground/80 flex-wrap mt-2">
                                <span className="flex items-center gap-2"><Phone className="w-4 h-4 text-muted-foreground" />{res.customer_phone}</span>
                                <span className="flex items-center gap-2 font-medium bg-background px-2.5 py-1 rounded-md border shadow-sm"><Users className="w-4 h-4 text-muted-foreground" />{res.guests_count} أشخاص</span>
                                <span className={cn(
                                  "flex items-center gap-2 font-medium px-2.5 py-1 rounded-md border shadow-sm",
                                  isTodayRes ? "bg-amber-500/10 text-amber-600 border-amber-500/20" : "bg-background"
                                )}>
                                  <Calendar className="w-4 h-4 opacity-70" />{formatReservationDate(res.reservation_date)}
                                </span>
                                <span className="flex items-center gap-2 font-bold px-2.5 py-1 rounded-md border shadow-sm bg-primary/5 text-primary border-primary/20"><Clock className="w-4 h-4" />{res.reservation_time}</span>
                              </div>
                              {res.notes && (
                                <div className="mt-3 text-sm bg-amber-500/10 text-amber-600 px-3 py-2 rounded-lg border border-amber-500/20 flex items-start gap-2">
                                  <MoreVertical className="w-4 h-4 shrink-0 mt-0.5" />
                                  <span><strong className="font-bold">ملاحظات:</strong> {res.notes}</span>
                                </div>
                              )}
                            </div>
                            <div className="flex items-center gap-2 w-full md:w-auto justify-end mt-4 md:mt-0 pt-4 md:pt-0 border-t md:border-t-0 border-white/5 opacity-100 md:opacity-0 group-hover:opacity-100 transition-opacity">
                              {isPending && isTodayRes && (
                                <Button size="sm" className="gap-2 bg-emerald-500 hover:bg-emerald-600 text-white shadow-emerald-500/20" onClick={(e) => handleQuickCheckIn(e, res.id)}>
                                  <ArrowRightCircle className="w-4 h-4" /> وصول العميل
                                </Button>
                              )}
                              <Button variant="outline" size="icon" className="h-9 w-9 bg-background hover:bg-muted shadow-sm" title="تعديل الحجز" onClick={() => setShowEditReservation({...res})}><Edit className="w-4 h-4" /></Button>
                              <Button variant="outline" size="icon" className="h-9 w-9 text-rose-500 border-rose-500/30 hover:bg-rose-500/10 shadow-sm" title="إلغاء أو حذف" onClick={() => { if(window.confirm('حذف هذا الحجز؟')) removeReservation(res.id); }}><Trash2 className="w-4 h-4" /></Button>
                            </div>
                          </div>
                        </CardContent>
                      </Card>
                    </motion.div>
                  );
                })}
              </AnimatePresence>
            </div>
          )}
        </TabsContent>
      </Tabs>

      {/* Add Reservation Dialog */}
      <Dialog open={showNewReservation} onOpenChange={setShowNewReservation}>
        <DialogContent className="max-w-[95vw] md:max-w-lg max-h-[90dvh] overflow-y-auto">
          <DialogHeader><DialogTitle>إضافة حجز جديد</DialogTitle></DialogHeader>
          <form onSubmit={handleAddReservation} className="space-y-4 py-4">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="space-y-2"><Label>اسم العميل *</Label><Input value={resForm.customer_name} onChange={e => setResForm(f => ({ ...f, customer_name: e.target.value }))} placeholder="أدخل اسم العميل" required /></div>
              <div className="space-y-2"><Label>رقم الهاتف *</Label><Input value={resForm.customer_phone} onChange={e => setResForm(f => ({ ...f, customer_phone: e.target.value }))} placeholder="01xxxxxxxxx" type="tel" required /></div>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
              <div className="space-y-2"><Label>الأشخاص</Label><Input type="number" min={1} value={resForm.guests_count} onChange={e => setResForm(f => ({ ...f, guests_count: Number(e.target.value) }))} /></div>
              <div className="space-y-2"><Label>التاريخ *</Label><Input type="date" value={resForm.reservation_date} onChange={e => setResForm(f => ({ ...f, reservation_date: e.target.value }))} required /></div>
              <div className="space-y-2"><Label>الوقت *</Label><Input type="time" value={resForm.reservation_time} onChange={e => setResForm(f => ({ ...f, reservation_time: e.target.value }))} required /></div>
            </div>
            <div className="space-y-2"><Label>ملاحظات</Label><Textarea value={resForm.notes} onChange={e => setResForm(f => ({ ...f, notes: e.target.value }))} placeholder="أي ملاحظات خاصة" /></div>
            <div className="flex justify-end gap-2 pt-4"><Button type="button" variant="outline" onClick={() => setShowNewReservation(false)}>إلغاء</Button><Button type="submit">حفظ الحجز</Button></div>
          </form>
        </DialogContent>
      </Dialog>

      {/* Add Table Dialog */}
      <Dialog open={showAddTable} onOpenChange={setShowAddTable}>
        <DialogContent className="max-w-[95vw] md:max-w-md max-h-[90dvh] overflow-y-auto">
          <DialogHeader><DialogTitle>إضافة طاولة جديدة</DialogTitle></DialogHeader>
          <form onSubmit={handleAddTable} className="space-y-4 py-4">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div className="space-y-2"><Label>رقم/اسم الطاولة</Label><Input type="text" value={tableForm.table_number} onChange={e => setTableForm(f => ({ ...f, table_number: e.target.value as any }))} required /></div>
              <div className="space-y-2"><Label>عدد المقاعد</Label><Input type="number" min={1} value={tableForm.seats} onChange={e => setTableForm(f => ({ ...f, seats: Number(e.target.value) }))} required /></div>
              <div className="space-y-2 sm:col-span-2"><Label>الجناح / المنطقة</Label><Input type="text" placeholder="مثال: القاعة الرئيسية، التراس..." value={tableForm.zone_id} onChange={e => setTableForm(f => ({ ...f, zone_id: e.target.value }))} /></div>
            </div>
            <div className="flex justify-end gap-2"><Button type="button" variant="outline" onClick={() => setShowAddTable(false)}>إلغاء</Button><Button type="submit">إضافة</Button></div>
          </form>
        </DialogContent>
      </Dialog>

      {/* Edit Table Dialog */}
      <Dialog open={!!showEditTable} onOpenChange={() => setShowEditTable(null)}>
        <DialogContent className="max-w-[95vw] md:max-w-md max-h-[90dvh] overflow-y-auto">
          <DialogHeader><DialogTitle>تعديل الطاولة</DialogTitle></DialogHeader>
          {showEditTable && (
            <form onSubmit={handleUpdateTable} className="space-y-4 py-4">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div className="space-y-2"><Label>رقم/اسم الطاولة</Label><Input type="text" value={showEditTable.table_number} onChange={e => setShowEditTable((t: any) => ({ ...t, table_number: e.target.value }))} required /></div>
                <div className="space-y-2"><Label>عدد المقاعد</Label><Input type="number" min={1} value={showEditTable.seats} onChange={e => setShowEditTable((t: any) => ({ ...t, seats: Number(e.target.value) }))} required /></div>
                <div className="space-y-2 sm:col-span-2"><Label>الجناح / المنطقة</Label><Input type="text" value={showEditTable.zone_id || ''} onChange={e => setShowEditTable((t: any) => ({ ...t, zone_id: e.target.value }))} /></div>
              </div>
              <div className="space-y-2">
                <Label>الحالة</Label>
                <Select value={showEditTable.status} onValueChange={(v) => setShowEditTable((t: any) => ({ ...t, status: v }))}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="available">متاحة</SelectItem>
                    <SelectItem value="occupied">مشغولة</SelectItem>
                    <SelectItem value="cleaning">قيد التنظيف</SelectItem>
                    <SelectItem value="reserved">محجوزة</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="flex justify-end gap-2 pt-4"><Button type="button" variant="outline" onClick={() => setShowEditTable(null)}>إلغاء</Button><Button type="submit">حفظ التغييرات</Button></div>
            </form>
          )}
        </DialogContent>
      </Dialog>

      {/* Edit Reservation Dialog */}
      <Dialog open={!!showEditReservation} onOpenChange={() => setShowEditReservation(null)}>
        <DialogContent className="max-w-[95vw] md:max-w-lg max-h-[90dvh] overflow-y-auto">
          <DialogHeader><DialogTitle>تعديل الحجز</DialogTitle></DialogHeader>
          {showEditReservation && (
            <form onSubmit={handleUpdateReservation} className="space-y-4 py-4">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="space-y-2"><Label>اسم العميل *</Label><Input value={showEditReservation.customer_name} onChange={e => setShowEditReservation((r: any) => ({ ...r, customer_name: e.target.value }))} required /></div>
                <div className="space-y-2"><Label>رقم الهاتف *</Label><Input value={showEditReservation.customer_phone} onChange={e => setShowEditReservation((r: any) => ({ ...r, customer_phone: e.target.value }))} type="tel" required /></div>
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                <div className="space-y-2"><Label>الأشخاص</Label><Input type="number" min={1} value={showEditReservation.guests_count} onChange={e => setShowEditReservation((r: any) => ({ ...r, guests_count: Number(e.target.value) }))} /></div>
                <div className="space-y-2"><Label>التاريخ *</Label><Input type="date" value={showEditReservation.reservation_date} onChange={e => setShowEditReservation((r: any) => ({ ...r, reservation_date: e.target.value }))} required /></div>
                <div className="space-y-2"><Label>الوقت *</Label><Input type="time" value={showEditReservation.reservation_time} onChange={e => setShowEditReservation((r: any) => ({ ...r, reservation_time: e.target.value }))} required /></div>
              </div>
              <div className="space-y-2">
                <Label>حالة الحجز</Label>
                <Select value={showEditReservation.status} onValueChange={(v) => setShowEditReservation((r: any) => ({ ...r, status: v }))}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {Object.entries(statusLabels).map(([key, label]) => (
                      <SelectItem key={key} value={key}>{label}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2"><Label>ملاحظات</Label><Textarea value={showEditReservation.notes || ''} onChange={e => setShowEditReservation((r: any) => ({ ...r, notes: e.target.value }))} /></div>
              <div className="flex justify-end gap-2 pt-4"><Button type="button" variant="outline" onClick={() => setShowEditReservation(null)}>إلغاء</Button><Button type="submit">حفظ التغييرات</Button></div>
            </form>
          )}
        </DialogContent>
      </Dialog>
    </MainLayout>
  );
}
