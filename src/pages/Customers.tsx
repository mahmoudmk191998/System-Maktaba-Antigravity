import { useState, useMemo, useEffect } from 'react';
import { MainLayout } from '@/components/layout';
import { useFormatters } from '@/lib/formatters';
import { cn } from '@/lib/utils';
import {
  Users, Plus, Search, Star, Gift, Wallet, TrendingUp,
  Phone, Mail, Calendar, Award, Eye, Edit, Trash2, ShoppingBag, UserPlus, X, MapPin, Map, LayoutList, History, Check, Tag, MoreVertical, Filter
} from 'lucide-react';

import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs';
import { Avatar, AvatarFallback } from '@/components/ui/avatar';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from '@/components/ui/dialog';
import { Checkbox } from '@/components/ui/checkbox';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Label } from '@/components/ui/label';
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";

import { useCustomers, useTenantBranch, useDelivery, useSettings } from '@/hooks/useDatabase';
import { useUserPermissions } from '@/hooks/usePermissions';
import { useAppStore } from '@/lib/store';

export interface CustomerAddress {
  id: string;
  name: string;
  address: string;
  delivery_zone_id: string;
}

const defaultLoyaltyTiers = [
  { id: 'bronze', name: 'برونزي', minPoints: 0, discount: 5, color: 'bg-amber-600' },
  { id: 'silver', name: 'فضي', minPoints: 500, discount: 10, color: 'bg-slate-400' },
  { id: 'gold', name: 'ذهبي', minPoints: 1500, discount: 15, color: 'bg-yellow-500' },
  { id: 'platinum', name: 'بلاتيني', minPoints: 5000, discount: 20, color: 'bg-slate-700' },
];

const tierColors: Record<string, string> = {
  bronze: 'bg-amber-600/10 text-amber-600 border-amber-600/30',
  silver: 'bg-slate-400/10 text-slate-600 border-slate-400/30',
  gold: 'bg-yellow-500/10 text-yellow-600 border-yellow-500/30',
  platinum: 'bg-slate-700/10 text-slate-700 border-slate-700/30',
};

function AddressManager({ addresses, setAddresses, deliveryZones, disabled }: { addresses: CustomerAddress[], setAddresses: (addrs: CustomerAddress[]) => void, deliveryZones: any[], disabled?: boolean }) {
  const [newAddr, setNewAddr] = useState({ name: '', address: '', delivery_zone_id: '' });

  const handleAdd = () => {
    if (!newAddr.address) return;
    setAddresses([...addresses, { ...newAddr, id: crypto.randomUUID() }]);
    setNewAddr({ name: '', address: '', delivery_zone_id: '' });
  };

  const handleRemove = (id: string) => {
    setAddresses(addresses.filter(a => a.id !== id));
  };

  return (
    <div className="space-y-4 border rounded-xl p-3.5 sm:p-5 bg-muted/20">
      <h4 className="font-semibold flex items-center gap-2"><MapPin className="w-4 h-4 text-primary" /> العناوين المحفوظة</h4>
      
      {addresses.length > 0 ? (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3 mb-4">
          {addresses.map(addr => (
            <div key={addr.id} className="flex items-start justify-between bg-card p-3 rounded-lg border shadow-sm group">
              <div className="flex gap-2 items-start min-w-0 flex-1">
                <Map className="w-4 h-4 text-muted-foreground mt-0.5 shrink-0" />
                <div className="text-sm min-w-0 flex-1">
                  <span className="font-bold flex items-center gap-1 break-words">{addr.name || 'عنوان العميل'} </span>
                  <p className="text-muted-foreground mt-1 text-xs break-words">{addr.address}</p>
                  {addr.delivery_zone_id && <Badge variant="secondary" className="mt-2 text-[10px]">{deliveryZones.find(z => z.id === addr.delivery_zone_id)?.name || 'منطقة التوصيل'}</Badge>}
                </div>
              </div>
              <Button type="button" variant="ghost" size="icon" onClick={() => handleRemove(addr.id)} className="h-8 w-8 text-destructive opacity-100 sm:opacity-0 group-hover:opacity-100 transition-opacity shrink-0 mr-1" disabled={disabled}>
                <X className="w-4 h-4" />
              </Button>
            </div>
          ))}
        </div>
      ) : (
        <p className="text-sm text-muted-foreground italic text-center py-2">لا يوجد عناوين مرتبطة بهذا العميل.</p>
      )}

      {!disabled && (
        <div className="bg-background p-3 sm:p-4 rounded-lg border shadow-sm">
          <p className="text-xs font-semibold mb-3">إضافة عنوان جديد</p>
          <div className="grid grid-cols-1 sm:grid-cols-12 gap-3">
            <div className="sm:col-span-3">
              <Input placeholder="وصف العنوان (المنزل، العمل)..." value={newAddr.name} onChange={e => setNewAddr({...newAddr, name: e.target.value})} className="h-10 sm:h-9 text-base sm:text-sm" />
            </div>
            <div className="sm:col-span-5">
              <Input placeholder="تفاصيل العنوان الفعلي شارع / بناية / شقة..." value={newAddr.address} onChange={e => setNewAddr({...newAddr, address: e.target.value})} className="h-10 sm:h-9 text-base sm:text-sm" />
            </div>
            <div className="sm:col-span-4">
              <Select value={newAddr.delivery_zone_id} onValueChange={(val) => setNewAddr({ ...newAddr, delivery_zone_id: val })}>
                 <SelectTrigger className="h-10 sm:h-9 text-base sm:text-sm">
                    <SelectValue placeholder="اختر منطقة التوصيل..." />
                 </SelectTrigger>
                 <SelectContent>
                    {deliveryZones.map((zone: any) => (
                      <SelectItem key={zone.id} value={zone.id}>{zone.name}</SelectItem>
                    ))}
                 </SelectContent>
              </Select>
            </div>
          </div>
          <Button type="button" onClick={handleAdd} disabled={!newAddr.address} className="w-full h-10 sm:h-9 mt-3 gap-2 font-medium text-sm">
            <Plus className="w-4 h-4" /> إضافة هذا العنوان
          </Button>
        </div>
      )}
    </div>
  );
}

export default function Customers() {
  const [searchQuery, setSearchQuery] = useState('');
  const [filterTier, setFilterTier] = useState('all');
  const [selectedCustomers, setSelectedCustomers] = useState<string[]>([]);
  
  const [isAddOpen, setIsAddOpen] = useState(false);
  // We added a "notes" field here
  const [newCustomer, setNewCustomer] = useState({ name: '', phone: '', email: '', notes: '', addresses: [] as CustomerAddress[] });
  const [editingCustomer, setEditingCustomer] = useState<any>(null);
  const [viewCustomer, setViewCustomer] = useState<any>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  
  const { settings, updateSettings } = useAppStore();
  const loyaltyTiers = settings?.loyaltyTiers || defaultLoyaltyTiers;
  const [editingTiers, setEditingTiers] = useState<typeof loyaltyTiers>([]);
  const [isEditingLoyalty, setIsEditingLoyalty] = useState(false);
  
  useEffect(() => {
    if (!isEditingLoyalty) {
      setEditingTiers(loyaltyTiers.map(t => ({ ...t })));
    }
  }, [loyaltyTiers, isEditingLoyalty]);
  
  const { tenantId } = useTenantBranch();
  const { updateTenantSettings } = useSettings(tenantId);
  const { customers: dbCustomers, addCustomer, updateCustomer, deleteCustomer, loading } = useCustomers(tenantId);
  const { deliveryZones } = useDelivery(tenantId);
  const { currency, number } = useFormatters();
  const { hasPermission } = useUserPermissions();

  const canCreateCustomer = hasPermission('customers.create');
  const canEditCustomer = hasPermission('customers.edit');
  const canDeleteCustomer = hasPermission('customers.delete');

  const customers = dbCustomers.map(c => {
    const pts = c.points || 0;
    const sortedTiers = [...loyaltyTiers].sort((a,b) => b.minPoints - a.minPoints);
    const computedTier = sortedTiers.find(t => pts >= t.minPoints)?.id || 'none';

    return {
      id: c.id,
      name: c.name || '',
      phone: c.phone || '',
      email: c.email || '',
      notes: c.notes || '', // NEW FIELD
      address: c.address || '',
      addresses: c.addresses && Array.isArray(c.addresses) && c.addresses.length > 0 
        ? c.addresses 
        : (c.address ? [{ id: crypto.randomUUID(), name: 'العنوان الأساسي', address: c.address, delivery_zone_id: c.delivery_zone_id || '' }] : []),
      delivery_zone_id: c.delivery_zone_id || '',
      tier: computedTier,
      points: pts,
      totalSpent: c.total_spent || 0,
      visits: c.visits || 0,
      lastVisit: c.last_visit || '',
      isVip: c.is_vip || false,
      created_at: c.created_at || new Date().toISOString()
    };
  });

  const filteredCustomers = useMemo(() => {
     return customers.filter(c => {
       const matchSearch = c.name.toLowerCase().includes(searchQuery.toLowerCase()) || c.phone.includes(searchQuery) || c.email.toLowerCase().includes(searchQuery.toLowerCase());
       const matchTier = filterTier === 'all' || 
                         (filterTier === 'vip' ? c.isVip : c.tier === filterTier);
       return matchSearch && matchTier;
     });
  }, [customers, searchQuery, filterTier]);

  const totalCustomers = customers.length;
  const vipCount = customers.filter(c => c.isVip).length;
  const totalPoints = customers.reduce((sum, c) => sum + c.points, 0);
  const averageSpend = totalCustomers > 0 ? customers.reduce((sum, c) => sum + c.totalSpent, 0) / totalCustomers : 0;

  const handleCreateCustomer = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newCustomer.name || !newCustomer.phone) return;
    setIsSubmitting(true);
    const firstAddr = newCustomer.addresses[0];
    const success = await addCustomer({
      name: newCustomer.name,
      phone: newCustomer.phone,
      email: newCustomer.email,
      notes: newCustomer.notes,
      addresses: newCustomer.addresses,
      address: firstAddr ? firstAddr.address : '',
      delivery_zone_id: firstAddr ? (firstAddr.delivery_zone_id || null) : null,
      tier: 'none',
      points: 0,
      total_spent: 0,
      visits: 0,
      is_vip: false,
      created_at: new Date().toISOString()
    });
    if (success) {
      setIsAddOpen(false);
      setNewCustomer({ name: '', phone: '', email: '', notes: '', addresses: [] });
    }
    setIsSubmitting(false);
  };

  const handleBulkDeleteCustomers = async () => {
    if (!window.confirm(`هل أنت متأكد من حذف ${selectedCustomers.length} عميل؟`)) return;
    for (const id of selectedCustomers) {
      await deleteCustomer(id);
    }
    setSelectedCustomers([]);
  };

  const handleUpdateCustomer = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingCustomer || !editingCustomer.name || !editingCustomer.phone) return;
    setIsSubmitting(true);
    const firstAddr = editingCustomer.addresses?.[0];
    const success = await updateCustomer(editingCustomer.id, {
      name: editingCustomer.name,
      phone: editingCustomer.phone,
      email: editingCustomer.email,
      notes: editingCustomer.notes,
      addresses: editingCustomer.addresses || [],
      address: firstAddr ? firstAddr.address : (editingCustomer.address || ''),
      delivery_zone_id: firstAddr ? (firstAddr.delivery_zone_id || null) : (editingCustomer.delivery_zone_id || null),
    });
    if (success) {
      setEditingCustomer(null);
    }
    setIsSubmitting(false);
  };

  const saveLoyaltyTiers = async () => {
    const newSettings = { ...settings, loyaltyTiers: editingTiers };
    if (updateTenantSettings) {
       await updateTenantSettings(newSettings);
    }
    await updateSettings({ loyaltyTiers: editingTiers });
    setIsEditingLoyalty(false);
  };

  return (
    <MainLayout 
      title="إدارة العملاء والولاء" 
      subtitle="قاعدة بيانات شاملة لعملائك ومستويات ولائهم"
      actions={
        canCreateCustomer && (
          <Button onClick={() => setIsAddOpen(true)} className="gap-2 shadow-md text-xs sm:text-sm h-9 sm:h-10">
            <UserPlus className="w-4 h-4" />
            <span>عميل جديد</span>
          </Button>
        )
      }
    >
      <div className="grid gap-6">
        {/* KPI Cards */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-4">
          <Card className="bg-primary/5 border-primary/20">
            <CardContent className="p-4 sm:p-5">
              <div className="flex items-center gap-3 sm:gap-4">
                <div className="w-11 h-11 sm:w-12 sm:h-12 rounded-full bg-primary/10 text-primary flex items-center justify-center shrink-0">
                  <Users className="w-5 h-5 sm:w-6 sm:h-6" />
                </div>
                <div className="min-w-0 flex-1">
                  <p className="text-xs sm:text-sm font-medium text-muted-foreground mb-0.5 sm:mb-1">إجمالي العملاء</p>
                  <p className="text-xl sm:text-2xl font-bold truncate">{number(totalCustomers)}</p>
                </div>
              </div>
            </CardContent>
          </Card>
          <Card className="bg-warning/5 border-warning/20">
            <CardContent className="p-4 sm:p-5">
              <div className="flex items-center gap-3 sm:gap-4">
                <div className="w-11 h-11 sm:w-12 sm:h-12 rounded-full bg-warning/10 text-warning flex items-center justify-center shrink-0">
                  <Star className="w-5 h-5 sm:w-6 sm:h-6" />
                </div>
                <div className="min-w-0 flex-1">
                  <p className="text-xs sm:text-sm font-medium text-muted-foreground mb-0.5 sm:mb-1">عملاء VIP</p>
                  <p className="text-xl sm:text-2xl font-bold text-warning truncate">{number(vipCount)}</p>
                </div>
              </div>
            </CardContent>
          </Card>
          <Card className="bg-success/5 border-success/20">
            <CardContent className="p-4 sm:p-5">
              <div className="flex items-center gap-3 sm:gap-4">
                <div className="w-11 h-11 sm:w-12 sm:h-12 rounded-full bg-success/10 text-success flex items-center justify-center shrink-0">
                  <Gift className="w-5 h-5 sm:w-6 sm:h-6" />
                </div>
                <div className="min-w-0 flex-1">
                  <p className="text-xs sm:text-sm font-medium text-muted-foreground mb-0.5 sm:mb-1">إجمالي نقاط الولاء</p>
                  <p className="text-xl sm:text-2xl font-bold text-success font-mono truncate">{number(totalPoints)}</p>
                </div>
              </div>
            </CardContent>
          </Card>
          <Card className="bg-info/5 border-info/20">
            <CardContent className="p-4 sm:p-5">
              <div className="flex items-center gap-3 sm:gap-4">
                <div className="w-11 h-11 sm:w-12 sm:h-12 rounded-full bg-info/10 text-info flex items-center justify-center shrink-0">
                  <TrendingUp className="w-5 h-5 sm:w-6 sm:h-6" />
                </div>
                <div className="min-w-0 flex-1">
                  <p className="text-xs sm:text-sm font-medium text-muted-foreground mb-0.5 sm:mb-1">متوسط إنفاق العميل</p>
                  <p className="text-lg sm:text-2xl font-bold text-info font-mono truncate">{currency(averageSpend)}</p>
                </div>
              </div>
            </CardContent>
          </Card>
        </div>

        <Tabs defaultValue="customers" className="w-full">
          <TabsList className="mb-6 h-auto flex-wrap bg-card border shadow-sm p-1 gap-1">
            <TabsTrigger value="customers" className="text-sm sm:text-base px-4 sm:px-6 h-9 sm:h-10 data-[state=active]:bg-primary/10 data-[state=active]:text-primary rounded-md">
              قاعدة بيانات العملاء
            </TabsTrigger>
            <TabsTrigger value="loyalty" className="text-sm sm:text-base px-4 sm:px-6 h-9 sm:h-10 data-[state=active]:bg-primary/10 data-[state=active]:text-primary rounded-md">
              إعدادات برنامج الولاء
            </TabsTrigger>
          </TabsList>

          <TabsContent value="customers" className="space-y-4">
             <Card className="shadow-sm border-0 border-t-4 border-t-primary">
                <CardHeader className="bg-card pb-4 border-b p-4 sm:p-6">
                   <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
                      <div>
                        <CardTitle className="flex items-center gap-2 text-xl sm:text-2xl">
                          <LayoutList className="w-5 h-5 sm:w-6 sm:h-6 text-primary" />
                          سجل العملاء
                        </CardTitle>
                        <CardDescription className="text-xs sm:text-base mt-1 sm:mt-2">بيانات تفصيلية لعملائك لسهولة المتابعة والبحث.</CardDescription>
                      </div>
                      <div className="flex flex-col sm:flex-row gap-3 w-full md:w-auto items-stretch sm:items-center">
                        {selectedCustomers.length > 0 && (
                          <Button onClick={handleBulkDeleteCustomers} variant="destructive" className="gap-2 shrink-0 h-10 w-full sm:w-auto">
                            <Trash2 className="w-4 h-4" />
                            حذف ({selectedCustomers.length})
                          </Button>
                        )}
                        <div className="relative w-full sm:w-64">
                          <Search className="absolute right-3 top-3 h-4 w-4 text-muted-foreground" />
                          <Input placeholder="بحث باسم العميل أو رقمه..." value={searchQuery} onChange={(e) => setSearchQuery(e.target.value)} className="pr-9 h-10 w-full text-base sm:text-sm" />
                        </div>
                        <Select value={filterTier} onValueChange={setFilterTier}>
                           <SelectTrigger className="w-full sm:w-48 h-10 text-base sm:text-sm">
                              <SelectValue placeholder="تصفية بالمستوى..." />
                           </SelectTrigger>
                           <SelectContent>
                              <SelectItem value="all">الكل</SelectItem>
                              <SelectItem value="vip">عملاء VIP فقط</SelectItem>
                              <SelectItem value="bronze">برونزي</SelectItem>
                              <SelectItem value="silver">فضي</SelectItem>
                              <SelectItem value="gold">ذهبي</SelectItem>
                              <SelectItem value="platinum">بلاتيني</SelectItem>
                           </SelectContent>
                        </Select>
                      </div>
                   </div>
                </CardHeader>
                <CardContent className="pt-0 px-0">
                   {/* Desktop Table View (>= md) */}
                   <div className="hidden md:block overflow-x-auto">
                     <Table>
                        <TableHeader className="bg-muted/30">
                           <TableRow>
                              <TableHead className="w-[40px] px-4">
                                <Checkbox
                                  checked={filteredCustomers.length > 0 && selectedCustomers.length === filteredCustomers.length}
                                  onCheckedChange={(c) => {
                                    if (c) setSelectedCustomers(filteredCustomers.map(cu => cu.id));
                                    else setSelectedCustomers([]);
                                  }}
                                />
                              </TableHead>
                              <TableHead className="px-6 py-4 font-semibold w-1/3">معلومات العميل</TableHead>
                              <TableHead className="font-semibold text-center">مستوى الولاء</TableHead>
                              <TableHead className="font-semibold text-center">نقاطه الحالية</TableHead>
                              <TableHead className="font-semibold text-center">إجمالي الإنفاق</TableHead>
                              <TableHead className="font-semibold text-center w-[150px]">الإجراءات</TableHead>
                           </TableRow>
                        </TableHeader>
                        <TableBody>
                           {loading ? (
                             <TableRow>
                               <TableCell colSpan={6} className="h-32 text-center">
                                 <div className="flex justify-center items-center">
                                   <div className="w-8 h-8 border-4 border-primary border-t-transparent rounded-full animate-spin" />
                                 </div>
                               </TableCell>
                             </TableRow>
                           ) : filteredCustomers.length === 0 ? (
                             <TableRow>
                               <TableCell colSpan={6} className="h-32 text-center text-muted-foreground">
                                 لا توجد نتائج مطابقة لبحثك.
                               </TableCell>
                             </TableRow>
                           ) : (
                             filteredCustomers.map(customer => (
                               <TableRow key={customer.id} className="hover:bg-muted/10 group transition-colors">
                                  <TableCell className="px-4">
                                    <div onClick={e => e.stopPropagation()}>
                                      <Checkbox 
                                        checked={selectedCustomers.includes(customer.id)}
                                        onCheckedChange={(c) => {
                                          if (c) setSelectedCustomers(prev => [...prev, customer.id]);
                                          else setSelectedCustomers(prev => prev.filter(id => id !== customer.id));
                                        }}
                                      />
                                    </div>
                                  </TableCell>
                                  <TableCell className="px-6">
                                     <div className="flex items-center gap-3">
                                        <Avatar className="w-12 h-12 border shadow-sm">
                                           <AvatarFallback className="text-lg bg-primary/10 text-primary uppercase">{customer.name.substring(0,2)}</AvatarFallback>
                                        </Avatar>
                                        <div>
                                           <div className="flex items-center gap-2 mb-1">
                                              <p className="font-bold text-base">{customer.name}</p>
                                              {customer.isVip && <Star className="w-3.5 h-3.5 text-warning fill-warning translate-y-0.5" title="VIP"/>}
                                           </div>
                                           <div className="flex items-center gap-3 text-sm text-muted-foreground">
                                              <span className="flex items-center gap-1 font-mono" dir="ltr"><Phone className="w-3 h-3" /> {customer.phone}</span>
                                           </div>
                                        </div>
                                     </div>
                                  </TableCell>
                                  <TableCell className="text-center">
                                     <Badge variant="outline" className={cn('px-3 py-1 font-medium', tierColors[customer.tier] || 'bg-muted/10 text-muted-foreground border-muted')}>
                                        {loyaltyTiers.find(t => t.id === customer.tier)?.name || 'عادي'}
                                     </Badge>
                                  </TableCell>
                                  <TableCell className="text-center font-bold text-primary font-mono">
                                     {number(customer.points)}
                                  </TableCell>
                                  <TableCell className="text-center">
                                     <span className="font-mono font-bold text-lg text-success">{currency(customer.totalSpent)}</span>
                                  </TableCell>
                                  <TableCell className="text-center">
                                     <div className="flex justify-center items-center gap-1 opacity-100 sm:opacity-0 group-hover:opacity-100 transition-opacity">
                                        <Button variant="ghost" size="icon" className="h-9 w-9 text-primary hover:bg-primary/10" 
                                          onClick={() => setViewCustomer(customer)} title="عرض الملف">
                                          <Eye className="w-4 h-4" />
                                        </Button>
                                        {canEditCustomer && (
                                          <Button variant="ghost" size="icon" className="h-9 w-9 text-blue-600 hover:bg-blue-500/10" 
                                            onClick={() => setEditingCustomer(customer)} title="تعديل">
                                            <Edit className="w-4 h-4" />
                                          </Button>
                                        )}
                                        {canDeleteCustomer && (
                                          <Button variant="ghost" size="icon" className="h-9 w-9 text-destructive hover:bg-destructive/10" 
                                            onClick={async () => {
                                              if (window.confirm(`هل أنت متأكد من حذف ${customer.name} بالكامل؟`)) {
                                                await deleteCustomer(customer.id);
                                                if (viewCustomer?.id === customer.id) setViewCustomer(null);
                                              }
                                            }} title="حذف">
                                            <Trash2 className="w-4 h-4" />
                                          </Button>
                                        )}
                                     </div>
                                  </TableCell>
                               </TableRow>
                             ))
                           )}
                        </TableBody>
                     </Table>
                   </div>

                   {/* Mobile Cards View (< md) */}
                   <div className="md:hidden space-y-3 p-3 sm:p-4">
                     {loading ? (
                       <div className="p-8 text-center">
                         <div className="w-8 h-8 border-4 border-primary border-t-transparent rounded-full animate-spin mx-auto mb-3" />
                         <p className="text-xs text-muted-foreground">جاري تحميل بيانات العملاء...</p>
                       </div>
                     ) : filteredCustomers.length === 0 ? (
                       <div className="p-8 text-center text-muted-foreground bg-muted/10 rounded-xl border border-dashed text-sm">
                         لا توجد نتائج مطابقة لبحثك.
                       </div>
                     ) : (
                       filteredCustomers.map(customer => {
                         const isSelected = selectedCustomers.includes(customer.id);
                         return (
                           <Card
                             key={customer.id}
                             className={cn(
                               "p-3.5 border transition-all relative overflow-hidden bg-card",
                               isSelected && "border-primary ring-1 ring-primary/30 bg-primary/5"
                             )}
                           >
                             {/* Top Section: Checkbox, Avatar, Name & Tier */}
                             <div className="flex items-start justify-between gap-2.5 mb-2.5">
                               <div className="flex items-start gap-2.5 min-w-0 flex-1">
                                 <div className="pt-1" onClick={e => e.stopPropagation()}>
                                   <Checkbox 
                                     checked={isSelected}
                                     onCheckedChange={(c) => {
                                       if (c) setSelectedCustomers(prev => [...prev, customer.id]);
                                       else setSelectedCustomers(prev => prev.filter(id => id !== customer.id));
                                     }}
                                     className="h-5 w-5 rounded"
                                   />
                                 </div>
                                 <Avatar className="w-11 h-11 border shadow-sm shrink-0">
                                   <AvatarFallback className="text-sm bg-primary/10 text-primary font-bold uppercase">
                                     {customer.name.substring(0,2)}
                                   </AvatarFallback>
                                 </Avatar>
                                 <div className="min-w-0 flex-1">
                                   <div className="flex items-center gap-1.5 flex-wrap">
                                     <h4 className="font-bold text-base text-foreground break-words leading-tight">
                                       {customer.name}
                                     </h4>
                                     {customer.isVip && (
                                       <Badge variant="outline" className="border-warning bg-warning/10 text-warning text-[10px] px-1.5 py-0 h-4">
                                         <Star className="w-2.5 h-2.5 ml-0.5 fill-warning" /> VIP
                                       </Badge>
                                     )}
                                   </div>
                                   <div className="flex items-center gap-2 mt-1 text-xs text-muted-foreground flex-wrap">
                                     <span className="flex items-center gap-1 font-mono" dir="ltr">
                                       <Phone className="w-3 h-3 text-muted-foreground" /> {customer.phone}
                                     </span>
                                   </div>
                                 </div>
                               </div>

                               {/* Loyalty Tier & Dropdown Actions */}
                               <div className="flex items-center gap-1 shrink-0">
                                 <Badge variant="outline" className={cn('text-[11px] px-2 py-0.5 font-medium', tierColors[customer.tier] || 'bg-muted/10 text-muted-foreground border-muted')}>
                                   {loyaltyTiers.find(t => t.id === customer.tier)?.name || 'عادي'}
                                 </Badge>

                                 <DropdownMenu>
                                   <DropdownMenuTrigger asChild>
                                     <Button variant="ghost" size="icon" className="h-9 w-9 text-muted-foreground hover:text-foreground">
                                       <MoreVertical className="w-4 h-4" />
                                     </Button>
                                   </DropdownMenuTrigger>
                                   <DropdownMenuContent align="end" className="w-40 font-cairo">
                                     <DropdownMenuItem onClick={() => setViewCustomer(customer)} className="gap-2 cursor-pointer">
                                       <Eye className="w-4 h-4 text-primary" /> عرض الملف
                                     </DropdownMenuItem>
                                     {canEditCustomer && (
                                       <DropdownMenuItem onClick={() => setEditingCustomer(customer)} className="gap-2 cursor-pointer">
                                         <Edit className="w-4 h-4 text-blue-600" /> تعديل البيانات
                                       </DropdownMenuItem>
                                     )}
                                     {canDeleteCustomer && (
                                       <DropdownMenuItem 
                                         onClick={async () => {
                                           if (window.confirm(`هل أنت متأكد من حذف ${customer.name} بالكامل؟`)) {
                                             await deleteCustomer(customer.id);
                                             if (viewCustomer?.id === customer.id) setViewCustomer(null);
                                           }
                                         }}
                                         className="gap-2 text-destructive focus:text-destructive cursor-pointer"
                                       >
                                         <Trash2 className="w-4 h-4" /> حذف العميل
                                       </DropdownMenuItem>
                                     )}
                                   </DropdownMenuContent>
                                 </DropdownMenu>
                               </div>
                             </div>

                             {/* Stats Grid: Visits, Spent, Points */}
                             <div className="grid grid-cols-3 gap-2 py-2 px-2.5 bg-muted/25 rounded-lg text-center my-2.5">
                               <div>
                                 <p className="text-[10px] text-muted-foreground font-semibold">الطلبات</p>
                                 <p className="text-sm font-bold text-foreground mt-0.5">{number(customer.visits)}</p>
                               </div>
                               <div className="border-x border-border/50">
                                 <p className="text-[10px] text-muted-foreground font-semibold">إجمالي الإنفاق</p>
                                 <p className="text-xs sm:text-sm font-black text-success font-mono mt-0.5 truncate px-1">
                                   {currency(customer.totalSpent)}
                                 </p>
                               </div>
                               <div>
                                 <p className="text-[10px] text-muted-foreground font-semibold">نقاط الولاء</p>
                                 <p className="text-sm font-bold text-primary font-mono mt-0.5">{number(customer.points)}</p>
                               </div>
                             </div>

                             {/* Actions Bar */}
                             <div className="flex items-center justify-between gap-2 pt-1">
                               <Button 
                                 variant="outline" 
                                 size="sm" 
                                 className="flex-1 h-9 gap-1.5 text-xs font-semibold text-primary border-primary/20 hover:bg-primary/5"
                                 onClick={() => setViewCustomer(customer)}
                               >
                                 <Eye className="w-3.5 h-3.5" /> عرض تفاصيل العميل
                               </Button>
                               {canEditCustomer && (
                                 <Button 
                                   variant="ghost" 
                                   size="sm" 
                                   className="h-9 px-2.5 text-xs text-blue-600 hover:bg-blue-50 hover:text-blue-700"
                                   onClick={() => setEditingCustomer(customer)}
                                 >
                                   <Edit className="w-3.5 h-3.5 ml-1" /> تعديل
                                 </Button>
                               )}
                             </div>
                           </Card>
                         );
                       })
                     )}
                   </div>
                </CardContent>
             </Card>
          </TabsContent>

          <TabsContent value="loyalty" className="space-y-4">
             <Card className="shadow-sm border-0 border-t-4 border-t-amber-500">
                <CardHeader className="bg-card border-b p-4 sm:p-6">
                  <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
                     <div>
                       <CardTitle className="flex items-center gap-2 text-xl sm:text-2xl">
                         <Award className="w-5 h-5 sm:w-6 sm:h-6 text-amber-500" />
                         مستويات الولاء
                       </CardTitle>
                       <CardDescription className="text-sm sm:text-base mt-1 sm:mt-2">تحكم في فئات عملائك والخصومات أو المزايا الخاصة بكل مستوى.</CardDescription>
                     </div>
                     {isEditingLoyalty ? (
                       <div className="flex gap-2 w-full sm:w-auto">
                         <Button variant="outline" className="flex-1 sm:flex-none" onClick={() => { setEditingTiers(loyaltyTiers.map(t => ({ ...t }))); setIsEditingLoyalty(false); }}>إلغاء</Button>
                         <Button onClick={saveLoyaltyTiers} className="flex-1 sm:flex-none gap-2"><Check className="w-4 h-4"/> حفظ التغييرات</Button>
                       </div>
                     ) : (
                       <Button variant="outline" className="gap-2 w-full sm:w-auto" onClick={() => { setEditingTiers(loyaltyTiers.map(t => ({ ...t }))); setIsEditingLoyalty(true); }}>
                         <Edit className="w-4 h-4" /> تعديل المستويات
                       </Button>
                     )}
                  </div>
                </CardHeader>
                <CardContent className="p-4 sm:p-6">
                   <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 sm:gap-6">
                   {editingTiers.map((tier, idx) => {
                     const tierCustomersCount = customers.filter(c => c.tier === tier.id).length;
                     return (
                       <Card key={tier.id} className={cn("overflow-hidden border-2 relative", tierColors[tier.id] ? tierColors[tier.id].split(' ')[2] : '')}>
                          <div className={cn("h-2 w-full", tier.color)}></div>
                          <CardContent className="p-4 sm:p-5 text-center relative z-10">
                            <div className={cn('w-14 h-14 sm:w-16 sm:h-16 rounded-full mx-auto mb-3 sm:mb-4 flex items-center justify-center text-white shadow-lg', tier.color)}>
                              <Award className="w-7 h-7 sm:w-8 sm:h-8" />
                            </div>
                            
                            {isEditingLoyalty ? (
                              <div className="space-y-3 sm:space-y-4 mt-3 sm:mt-4 text-right bg-background p-3 sm:p-4 rounded-lg shadow-inner">
                                <div>
                                   <Label className="text-xs sm:text-sm">اسم المستوى</Label>
                                   <Input className="mt-1 font-bold text-center text-sm" value={tier.name} onChange={(e) => {
                                     const newTiers = [...editingTiers];
                                     newTiers[idx] = { ...newTiers[idx], name: e.target.value };
                                     setEditingTiers(newTiers);
                                   }} />
                                </div>
                                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 sm:gap-3">
                                   <div>
                                     <Label className="text-xs sm:text-sm">النقاط للوصول</Label>
                                     <Input className="mt-1 text-center font-mono text-sm" type="number" value={tier.minPoints} onChange={(e) => {
                                       const newTiers = [...editingTiers];
                                       newTiers[idx] = { ...newTiers[idx], minPoints: Number(e.target.value) };
                                       setEditingTiers(newTiers);
                                     }} />
                                   </div>
                                   <div>
                                     <Label className="text-xs sm:text-sm text-primary">معدل الخصم %</Label>
                                     <Input className="mt-1 text-center font-mono border-primary/50 text-sm" type="number" max="100" min="0" value={tier.discount} onChange={(e) => {
                                       const newTiers = [...editingTiers];
                                       newTiers[idx] = { ...newTiers[idx], discount: Number(e.target.value) };
                                       setEditingTiers(newTiers);
                                     }} />
                                   </div>
                                </div>
                              </div>
                            ) : (
                              <>
                                <h3 className="font-bold text-xl sm:text-2xl mb-1">{tier.name}</h3>
                                <p className="text-xs sm:text-sm font-medium text-muted-foreground mb-3 sm:mb-4">تبدأ من <strong className="text-foreground">{number(tier.minPoints)}</strong> نقطة</p>
                                <Badge className="px-3 py-1 sm:px-4 sm:py-1.5 text-xs sm:text-sm bg-primary/10 text-primary hover:bg-primary/20 hover:text-primary mb-4 sm:mb-6">يحصل على خصم {tier.discount}%</Badge>
                                
                                <div className="p-2.5 sm:p-3 bg-muted/40 rounded-lg flex items-center justify-between mt-auto">
                                   <span className="text-xs sm:text-sm text-muted-foreground font-semibold">عدد العملاء</span>
                                   <span className="text-lg sm:text-xl font-bold">{tierCustomersCount}</span>
                                </div>
                              </>
                            )}
                          </CardContent>
                       </Card>
                     );
                   })}
                   </div>
                </CardContent>
             </Card>
          </TabsContent>
        </Tabs>
      </div>

      {/* Add / Edit Customer Dialog */}
      <Dialog open={isAddOpen || !!editingCustomer} onOpenChange={(open) => {
        if (!open) {
          setIsAddOpen(false);
          setEditingCustomer(null);
        }
      }}>
        <DialogContent className="max-w-[95vw] sm:max-w-xl md:max-w-3xl max-h-[90dvh] overflow-y-auto rounded-xl p-4 sm:p-6">
          <form onSubmit={editingCustomer ? handleUpdateCustomer : handleCreateCustomer}>
            <DialogHeader className="border-b pb-3 sm:pb-4 mb-4">
              <DialogTitle className="text-xl sm:text-2xl flex items-center gap-2">
                {editingCustomer ? <Edit className="w-5 h-5 sm:w-6 sm:h-6 text-primary" /> : <UserPlus className="w-5 h-5 sm:w-6 sm:h-6 text-primary" />}
                {editingCustomer ? 'تعديل بيانات العميل' : 'تسجيل عميل جديد'}
              </DialogTitle>
              <DialogDescription className="text-xs sm:text-sm">
                الرجاء إدخال البيانات الشخصية، وطرق التواصل مع العميل، وعناوينه لتسهيل التوصيل.
              </DialogDescription>
            </DialogHeader>
            
            <div className="space-y-4 sm:space-y-6 py-2">
               <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 sm:gap-4">
                  <div className="space-y-1.5 sm:space-y-2">
                     <Label className="text-xs sm:text-sm">اسم العميل <span className="text-red-500">*</span></Label>
                     <Input className="h-10 sm:h-9 text-base sm:text-sm" required placeholder="مثال: أحمد مصطفى" value={editingCustomer ? editingCustomer.name : newCustomer.name} onChange={(e) => editingCustomer ? setEditingCustomer({...editingCustomer, name: e.target.value}) : setNewCustomer({...newCustomer, name: e.target.value})} disabled={isSubmitting} />
                  </div>
                  <div className="space-y-1.5 sm:space-y-2">
                     <Label className="text-xs sm:text-sm">رقم الهاتف الأساسي <span className="text-red-500">*</span></Label>
                     <Input className="h-10 sm:h-9 text-base sm:text-sm" required placeholder="01xxxxxxxxx" value={editingCustomer ? editingCustomer.phone : newCustomer.phone} onChange={(e) => editingCustomer ? setEditingCustomer({...editingCustomer, phone: e.target.value}) : setNewCustomer({...newCustomer, phone: e.target.value})} disabled={isSubmitting} dir="ltr" />
                  </div>
                  <div className="space-y-1.5 sm:space-y-2">
                     <Label className="text-xs sm:text-sm">البريد الإلكتروني (اختياري)</Label>
                     <Input className="h-10 sm:h-9 text-base sm:text-sm" type="email" placeholder="email@example.com" value={editingCustomer ? editingCustomer.email : newCustomer.email} onChange={(e) => editingCustomer ? setEditingCustomer({...editingCustomer, email: e.target.value}) : setNewCustomer({...newCustomer, email: e.target.value})} disabled={isSubmitting} dir="ltr" />
                  </div>
                  <div className="space-y-1.5 sm:space-y-2">
                     <Label className="text-xs sm:text-sm">الرقم التعريفي (إن وُجد)</Label>
                     <Input className="h-10 sm:h-9 text-base sm:text-sm" disabled placeholder="بناء تلقائي بعد الحفظ" value={editingCustomer?.id?.substring(0,8) || ''} />
                  </div>
               </div>

               <AddressManager 
                  addresses={editingCustomer ? (editingCustomer.addresses || []) : newCustomer.addresses} 
                  setAddresses={addrs => editingCustomer ? setEditingCustomer({...editingCustomer, addresses: addrs}) : setNewCustomer({...newCustomer, addresses: addrs})} 
                  deliveryZones={deliveryZones}
                  disabled={isSubmitting}
               />

               <div className="space-y-1.5 sm:space-y-2">
                  <Label className="text-xs sm:text-sm">تفضيلات وملاحظات العميل</Label>
                  <Input className="h-10 sm:h-9 text-base sm:text-sm" placeholder="أدخل تفضيلاته: (لايحب المايونيز، يطلب دوماً إضافات..)" value={editingCustomer ? editingCustomer.notes : newCustomer.notes} onChange={(e) => editingCustomer ? setEditingCustomer({...editingCustomer, notes: e.target.value}) : setNewCustomer({...newCustomer, notes: e.target.value})} disabled={isSubmitting} />
               </div>
            </div>

            <DialogFooter className="mt-4 sm:mt-6 border-t pt-4 flex flex-col-reverse sm:flex-row gap-2 sm:gap-0">
               <Button type="button" variant="outline" className="w-full sm:w-auto px-6 h-10 sm:h-9" disabled={isSubmitting} onClick={() => {setIsAddOpen(false); setEditingCustomer(null);}}>إلغاء</Button>
               <Button type="submit" disabled={isSubmitting} className="w-full sm:w-auto px-8 h-10 sm:h-9">{isSubmitting ? 'جاري الحفظ...' : (editingCustomer ? 'حفظ التحديثات' : 'تسجيل العميل')}</Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      {/* Advanced Full Screen/Large Dialog for Customer View */}
      <Dialog open={!!viewCustomer} onOpenChange={(open) => !open && setViewCustomer(null)}>
        <DialogContent className="max-w-[95vw] md:max-w-4xl max-h-[90dvh] overflow-hidden flex flex-col p-0 bg-background rounded-xl">
          {viewCustomer && (
            <div className="flex flex-col h-full overflow-hidden">
               {/* Header Section */}
               <div className="bg-primary/5 p-4 sm:p-6 border-b flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 shrink-0">
                  <div className="flex items-center gap-3 sm:gap-5 w-full sm:w-auto min-w-0">
                     <Avatar className="w-14 h-14 sm:w-20 sm:h-20 border-2 sm:border-4 border-background shadow-md shrink-0">
                        <AvatarFallback className="text-xl sm:text-3xl bg-primary text-primary-foreground font-bold">{viewCustomer.name.substring(0,2)}</AvatarFallback>
                     </Avatar>
                     <div className="min-w-0 flex-1">
                        <div className="flex flex-wrap items-center gap-2 mb-1">
                           <h2 className="text-xl sm:text-3xl font-bold truncate">{viewCustomer.name}</h2>
                           {viewCustomer.isVip && <Badge variant="outline" className="border-warning bg-warning/10 text-warning px-2"><Star className="w-3 h-3 ml-1 fill-warning"/>VIP</Badge>}
                        </div>
                        <div className="flex flex-wrap gap-2 sm:gap-3 text-muted-foreground mt-1 sm:mt-2 font-medium">
                           <span className="flex items-center gap-1.5 bg-background px-2.5 py-0.5 sm:px-3 sm:py-1 rounded-full border shadow-sm text-xs sm:text-sm font-mono" dir="ltr"><Phone className="w-3 h-3 sm:w-3.5 sm:h-3.5 text-primary"/> {viewCustomer.phone}</span>
                           {viewCustomer.email && <span className="flex items-center gap-1.5 bg-background px-2.5 py-0.5 sm:px-3 sm:py-1 rounded-full border shadow-sm text-xs sm:text-sm truncate max-w-[180px] sm:max-w-none"><Mail className="w-3 h-3 sm:w-3.5 sm:h-3.5 text-primary"/> {viewCustomer.email}</span>}
                        </div>
                     </div>
                  </div>
                  <div className="flex sm:flex-col items-center sm:items-end justify-between w-full sm:w-auto gap-2 border-t sm:border-t-0 pt-2 sm:pt-0 shrink-0">
                     <Badge variant="outline" className={cn('px-3 py-1 sm:px-4 sm:py-2 text-xs sm:text-base shadow-sm bg-background', tierColors[viewCustomer.tier] || 'border-muted text-muted-foreground')}>
                        {loyaltyTiers.find(t => t.id === viewCustomer.tier)?.name || 'عادي'} 
                     </Badge>
                     <p className="text-xs sm:text-sm font-semibold text-muted-foreground">عضو منذ: {new Date(viewCustomer.created_at).toLocaleDateString('ar-EG')}</p>
                  </div>
               </div>

               <div className="p-4 sm:p-6 overflow-y-auto flex-1">
                  <Tabs defaultValue="overview" className="w-full">
                     <TabsList className="mb-4 sm:mb-6 grid w-full max-w-sm grid-cols-2">
                        <TabsTrigger value="overview" className="text-xs sm:text-sm">نظرة عامة والنشاط</TabsTrigger>
                        <TabsTrigger value="addresses" className="text-xs sm:text-sm">دليل العناوين</TabsTrigger>
                     </TabsList>

                     <TabsContent value="overview" className="space-y-4 sm:space-y-6 mt-0">
                        <div className="grid grid-cols-2 md:grid-cols-4 gap-2.5 sm:gap-4">
                           <Card className="bg-background shadow-sm">
                             <CardContent className="p-3 sm:p-4 text-center">
                               <ShoppingBag className="w-5 h-5 sm:w-6 sm:h-6 text-primary mx-auto mb-1.5 sm:mb-2 opacity-80" />
                               <p className="text-lg sm:text-2xl font-bold">{number(viewCustomer.visits)}</p>
                               <p className="text-[11px] sm:text-xs text-muted-foreground">عدد الطلبات المكتملة</p>
                             </CardContent>
                           </Card>
                           <Card className="bg-background shadow-sm">
                             <CardContent className="p-3 sm:p-4 text-center">
                               <Wallet className="w-5 h-5 sm:w-6 sm:h-6 text-success mx-auto mb-1.5 sm:mb-2 opacity-80" />
                               <p className="text-base sm:text-2xl font-bold text-success font-mono truncate px-0.5">{currency(viewCustomer.totalSpent)}</p>
                               <p className="text-[11px] sm:text-xs text-muted-foreground">حجم الإنفاق الإجمالي</p>
                             </CardContent>
                           </Card>
                           <Card className="bg-background shadow-sm">
                             <CardContent className="p-3 sm:p-4 text-center">
                               <Star className="w-5 h-5 sm:w-6 sm:h-6 text-warning mx-auto mb-1.5 sm:mb-2 opacity-80" />
                               <p className="text-lg sm:text-2xl font-bold text-warning font-mono">{number(viewCustomer.points)}</p>
                               <p className="text-[11px] sm:text-xs text-muted-foreground">رصيد النقاط المتاح</p>
                             </CardContent>
                           </Card>
                           <Card className="bg-background shadow-sm">
                             <CardContent className="p-3 sm:p-4 text-center">
                               <Calendar className="w-5 h-5 sm:w-6 sm:h-6 text-info mx-auto mb-1.5 sm:mb-2 opacity-80" />
                               <p className="text-xs sm:text-base font-bold text-info mt-1 sm:mt-2 truncate">{viewCustomer.lastVisit ? new Date(viewCustomer.lastVisit).toLocaleDateString('ar-EG') : 'بدون نشاط'}</p>
                               <p className="text-[11px] sm:text-xs text-muted-foreground leading-tight hover:underline cursor-help truncate" title={viewCustomer.lastVisit ? new Date(viewCustomer.lastVisit).toLocaleString('ar-EG') : ''}>تاريخ آخر طلب</p>
                             </CardContent>
                           </Card>
                        </div>

                        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 sm:gap-6 pt-2 sm:pt-4">
                           <div className="space-y-3 sm:space-y-4">
                              <h3 className="font-semibold text-base sm:text-lg flex items-center gap-2 border-b pb-2"><Tag className="w-4 h-4 sm:w-5 sm:h-5 text-primary"/> التفضيلات والملاحظات الإدارية</h3>
                              <div className="bg-orange-50 border border-orange-200 p-3.5 sm:p-5 rounded-xl min-h-[100px] sm:min-h-[120px]">
                                 {viewCustomer.notes ? (
                                    <p className="text-orange-900 leading-relaxed font-medium text-xs sm:text-sm break-words">{viewCustomer.notes}</p>
                                 ) : (
                                    <p className="text-orange-400/80 italic text-center mt-4 sm:mt-5 text-xs sm:text-sm">لا توجد ملاحظات أو تفضيلات مسجلة لهذا العميل حالياً.</p>
                                 )}
                              </div>
                           </div>

                           <div className="space-y-3 sm:space-y-4">
                              <h3 className="font-semibold text-base sm:text-lg flex items-center gap-2 border-b pb-2"><History className="w-4 h-4 sm:w-5 sm:h-5 text-primary" /> سجل الطلبات الحديثة (مستقبلاً)</h3>
                              <div className="border border-dashed border-muted-foreground/30 p-6 sm:p-10 rounded-xl flex items-center justify-center flex-col text-center bg-muted/10 min-h-[100px] sm:h-[120px]">
                                 <ShoppingBag className="w-6 h-6 sm:w-8 sm:h-8 text-muted-foreground/30 mb-2" />
                                 <p className="text-muted-foreground text-xs sm:text-sm">سيتم عرض قائمة بأحدث طلبات العميل هنا بناءً على ربط نقاط البيع (POS).</p>
                              </div>
                           </div>
                        </div>
                     </TabsContent>

                     <TabsContent value="addresses" className="mt-0">
                        {(!viewCustomer.addresses || viewCustomer.addresses.length === 0) ? (
                           <div className="p-8 sm:p-10 text-center border rounded-xl bg-muted/20">
                              <Map className="w-8 h-8 sm:w-10 sm:h-10 text-muted-foreground/30 mx-auto mb-3" />
                              <p className="text-base sm:text-lg font-semibold mb-1">لا يوجد عناوين دقيقة</p>
                              <p className="text-muted-foreground text-xs sm:text-sm">قم بتعديل ملف العميل لإضافة عناوين التوصيل بدقة.</p>
                           </div>
                        ) : (
                           <div className="grid grid-cols-1 md:grid-cols-2 gap-3 sm:gap-4">
                              {viewCustomer.addresses.map((addr: any) => (
                                <Card key={addr.id} className="shadow-sm border-l-4 border-l-primary hover:bg-muted/5 transition-colors">
                                  <CardContent className="p-3.5 sm:p-4">
                                     <div className="flex items-start gap-3">
                                        <div className="bg-primary/10 p-2 rounded-full shrink-0">
                                           <MapPin className="w-4 h-4 sm:w-5 sm:h-5 text-primary" />
                                        </div>
                                        <div className="min-w-0 flex-1">
                                           <h4 className="font-bold text-sm sm:text-base mb-1 truncate">{addr.name || 'عنوان مسجل'}</h4>
                                           <p className="text-muted-foreground text-xs sm:text-sm leading-relaxed mb-2.5 break-words">{addr.address}</p>
                                           <Badge variant="secondary" className="bg-muted text-xs">المنطقة: {deliveryZones.find(z => z.id === addr.delivery_zone_id)?.name || 'غير محدد'}</Badge>
                                        </div>
                                     </div>
                                  </CardContent>
                                </Card>
                              ))}
                           </div>
                        )}
                     </TabsContent>
                  </Tabs>
               </div>

               <div className="mt-auto p-3 sm:p-4 border-t bg-muted/30 flex flex-col-reverse sm:flex-row justify-end gap-2 sm:gap-3 shrink-0">
                  <Button variant="outline" className="w-full sm:w-auto px-6 h-10 sm:h-9" onClick={() => setViewCustomer(null)}>إغلاق الملف</Button>
                  {canEditCustomer && (
                     <Button className="w-full sm:w-auto px-8 gap-2 shadow-sm h-10 sm:h-9" onClick={() => { const cust = viewCustomer; setViewCustomer(null); setEditingCustomer(cust); }}>
                        <Edit className="w-4 h-4" /> تعديل هوية العميل
                     </Button>
                  )}
               </div>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </MainLayout>
  );
}
