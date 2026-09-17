import { useState, useMemo } from 'react';
import { MainLayout } from '@/components/layout';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Users, Plus, Edit, Trash2, Search, Briefcase, Mail, Phone, MapPin, Tag, Package, FileText, CheckCircle2, XCircle, TrendingUp, DollarSign, Building2, Eye, Truck } from "lucide-react";
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription } from '@/components/ui/dialog';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Checkbox } from '@/components/ui/checkbox';
import { useSuppliers, usePurchaseOrders, useTenantBranch } from '@/hooks/useDatabase';

export default function Suppliers() {
  const { tenantId } = useTenantBranch();
  const { suppliers, loading, add, update, remove } = useSuppliers(tenantId);
  const { orders } = usePurchaseOrders(tenantId); // Fetch purchase orders to compute stats

  const [searchQuery, setSearchQuery] = useState('');
  const [filterStatus, setFilterStatus] = useState('all');
  const [selectedSuppliers, setSelectedSuppliers] = useState<string[]>([]);
  const [isAddDialogOpen, setIsAddDialogOpen] = useState(false);
  const [editingSupplier, setEditingSupplier] = useState<any>(null);
  const [viewingSupplier, setViewingSupplier] = useState<any>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  // Form states
  const [formData, setFormData] = useState({
    name: '',
    company: '',
    phone: '',
    email: '',
    taxId: '',
    address: '',
    category: 'مواد غذائية',
    status: 'active',
    notes: ''
  });

  const resetForm = () => {
    setFormData({
      name: '',
      company: '',
      phone: '',
      email: '',
      taxId: '',
      address: '',
      category: 'مواد غذائية',
      status: 'active',
      notes: ''
    });
  };

  const handleInputChange = (field: string, value: string) => {
    setFormData(prev => ({ ...prev, [field]: value }));
  };

  const filteredSuppliers = useMemo(() => {
    return suppliers.filter(s => {
      const matchSearch = (s.name || '').toLowerCase().includes(searchQuery.toLowerCase()) || 
                          (s.company || '').toLowerCase().includes(searchQuery.toLowerCase()) ||
                          (s.phone || '').includes(searchQuery);
      const matchStatus = filterStatus === 'all' || s.status === filterStatus;
      return matchSearch && matchStatus;
    });
  }, [suppliers, searchQuery, filterStatus]);

  // Analytics
  const activeSuppliersCount = suppliers.filter(s => s.status === 'active').length;
  const totalPurchaseValue = useMemo(() => {
    return orders.reduce((sum, order) => sum + (Number(order.total_amount) || 0), 0);
  }, [orders]);

  const supplierStats = useMemo(() => {
    const stats: Record<string, { totalAmount: number, orderCount: number }> = {};
    orders.forEach(order => {
      if (!stats[order.supplier_id]) {
        stats[order.supplier_id] = { totalAmount: 0, orderCount: 0 };
      }
      stats[order.supplier_id].totalAmount += (Number(order.total_amount) || 0);
      stats[order.supplier_id].orderCount += 1;
    });
    return stats;
  }, [orders]);

  const handleAdd = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!formData.name) return;
    setIsSubmitting(true);
    const success = await add({ 
      ...formData,
      created_at: new Date().toISOString()
    });
    if (success) {
      setIsAddDialogOpen(false);
      resetForm();
    }
    setIsSubmitting(false);
  };

  const openEditDialog = (supplier: any) => {
    setEditingSupplier(supplier);
    setFormData({
      name: supplier.name || '',
      company: supplier.company || '',
      phone: supplier.phone || '',
      email: supplier.email || '',
      taxId: supplier.taxId || '',
      address: supplier.address || '',
      category: supplier.category || 'مواد غذائية',
      status: supplier.status || 'active',
      notes: supplier.notes || ''
    });
  };

  const handleUpdate = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingSupplier || !formData.name) return;
    setIsSubmitting(true);
    const success = await update(editingSupplier.id, {
      ...formData,
      updated_at: new Date().toISOString()
    });
    if (success) {
      setEditingSupplier(null);
      resetForm();
    }
    setIsSubmitting(false);
  };

  const handleDelete = async (id: string, name: string) => {
    if (window.confirm(`هل أنت متأكد من حذف المورد "${name}" نهائياً من النظام؟`)) {
      await remove(id);
      if (viewingSupplier?.id === id) setViewingSupplier(null);
    }
  };

  const handleBulkDeleteSuppliers = async () => {
    if (!window.confirm(`هل أنت متأكد من حذف ${selectedSuppliers.length} مورد؟`)) return;
    for (const id of selectedSuppliers) {
      await remove(id);
    }
    setSelectedSuppliers([]);
  };

  return (
    <MainLayout
      title="إدارة الموردين"
      subtitle="سجل شامل لبيانات الموردين والمقاولين وإدارة التعاملات المالية"
      actions={
        <Button onClick={() => { resetForm(); setIsAddDialogOpen(true); }} className="gap-2 w-full sm:w-auto min-h-[44px] sm:min-h-0 h-10 rounded-xl font-bold shadow-md">
          <Plus className="w-4 h-4" />
          مورد جديد
        </Button>
      }
    >
      <div className="grid gap-4 sm:gap-6 pb-20">
        {/* KPI Cards */}
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 sm:gap-4">
          <Card className="bg-primary/5 border-primary/20 shadow-sm">
            <CardContent className="p-4 sm:p-6">
              <div className="flex items-center justify-between gap-3">
                <div className="min-w-0 flex-1">
                  <p className="text-xs sm:text-sm font-medium text-muted-foreground mb-1 truncate">إجمالي الموردين</p>
                  <p className="text-2xl sm:text-3xl font-bold truncate">{suppliers.length}</p>
                </div>
                <div className="w-10 h-10 sm:w-12 sm:h-12 rounded-full bg-primary/10 flex items-center justify-center text-primary flex-shrink-0">
                  <Building2 className="w-5 h-5 sm:w-6 sm:h-6" />
                </div>
              </div>
            </CardContent>
          </Card>

          <Card className="bg-emerald-500/5 border-emerald-500/20 shadow-sm">
            <CardContent className="p-4 sm:p-6">
              <div className="flex items-center justify-between gap-3">
                <div className="min-w-0 flex-1">
                  <p className="text-xs sm:text-sm font-medium text-muted-foreground mb-1 truncate">الموردين النشطين</p>
                  <p className="text-2xl sm:text-3xl font-bold text-emerald-600 truncate">{activeSuppliersCount}</p>
                </div>
                <div className="w-10 h-10 sm:w-12 sm:h-12 rounded-full bg-emerald-500/10 flex items-center justify-center text-emerald-600 flex-shrink-0">
                  <CheckCircle2 className="w-5 h-5 sm:w-6 sm:h-6" />
                </div>
              </div>
            </CardContent>
          </Card>

          <Card className="bg-blue-500/5 border-blue-500/20 shadow-sm">
            <CardContent className="p-4 sm:p-6">
              <div className="flex items-center justify-between gap-3">
                <div className="min-w-0 flex-1">
                  <p className="text-xs sm:text-sm font-medium text-muted-foreground mb-1 truncate">إجمالي تعاملات الشراء</p>
                  <p className="text-xl sm:text-2xl font-bold text-blue-600 truncate">{totalPurchaseValue.toLocaleString('ar-EG')} <span className="text-xs font-normal">ج.م</span></p>
                </div>
                <div className="w-10 h-10 sm:w-12 sm:h-12 rounded-full bg-blue-500/10 flex items-center justify-center text-blue-600 flex-shrink-0">
                  <DollarSign className="w-5 h-5 sm:w-6 sm:h-6" />
                </div>
              </div>
            </CardContent>
          </Card>
        </div>

        {/* Main Content */}
        <Card className="shadow-sm border-0 border-t-4 border-t-primary">
          <CardHeader className="bg-card p-4 sm:p-6 pb-4 border-b">
            <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-3 sm:gap-4">
              <div>
                <CardTitle className="flex items-center gap-2 text-xl sm:text-2xl">
                  <Users className="w-5 h-5 sm:w-6 sm:h-6 text-primary flex-shrink-0" />
                  قاعدة بيانات الموردين
                </CardTitle>
                <CardDescription className="text-xs sm:text-base mt-1">عرض وتصنيف كافة الموردين المرتبطين بالمطعم والمخازن</CardDescription>
              </div>
              <div className="flex flex-col sm:flex-row gap-2.5 w-full md:w-auto">
                {selectedSuppliers.length > 0 && (
                  <Button onClick={handleBulkDeleteSuppliers} variant="destructive" className="gap-2 shrink-0 md:mr-auto min-h-[44px] sm:min-h-0 h-10 rounded-xl font-bold">
                    <Trash2 className="w-4 h-4" />
                    حذف ({selectedSuppliers.length})
                  </Button>
                )}
                <div className="relative w-full sm:w-80">
                  <Search className="absolute right-3 top-3 h-4 w-4 text-muted-foreground pointer-events-none" />
                  <Input
                    placeholder="ابحث باسم المورد أو الشركة أو الهاتف..."
                    className="pr-9 h-10 text-base sm:text-sm rounded-xl"
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                  />
                </div>
              </div>
            </div>
          </CardHeader>
          <CardContent className="p-3 sm:p-6">
            <Tabs defaultValue="all" className="w-full" onValueChange={setFilterStatus}>
              <TabsList className="grid grid-cols-3 w-full max-w-xs h-auto p-1 bg-muted/40 border rounded-xl mb-4 sm:mb-6">
                <TabsTrigger value="all" className="py-2 px-2 text-xs sm:text-sm font-semibold rounded-lg data-[state=active]:shadow-sm">الكل</TabsTrigger>
                <TabsTrigger value="active" className="py-2 px-2 text-xs sm:text-sm font-semibold rounded-lg text-emerald-600 data-[state=active]:bg-emerald-50 data-[state=active]:shadow-sm">نشط</TabsTrigger>
                <TabsTrigger value="inactive" className="py-2 px-2 text-xs sm:text-sm font-semibold rounded-lg text-rose-600 data-[state=active]:bg-rose-50 data-[state=active]:shadow-sm">غير نشط</TabsTrigger>
              </TabsList>
              
              {/* Desktop View: Table */}
              <div className="hidden md:block rounded-xl border border-border/50 overflow-x-auto shadow-sm">
                <Table>
                  <TableHeader className="bg-muted/30">
                    <TableRow>
                      <TableHead className="w-[40px] px-4">
                         <Checkbox
                           checked={filteredSuppliers.length > 0 && selectedSuppliers.length === filteredSuppliers.length}
                           onCheckedChange={(c) => {
                             if (c) setSelectedSuppliers(filteredSuppliers.map(su => su.id));
                             else setSelectedSuppliers([]);
                           }}
                         />
                      </TableHead>
                      <TableHead className="font-semibold px-4 w-1/4">المورد / الشركة</TableHead>
                      <TableHead className="font-semibold">التصنيف</TableHead>
                      <TableHead className="font-semibold">معلومات التواصل</TableHead>
                      <TableHead className="font-semibold text-center">الحالة</TableHead>
                      <TableHead className="font-semibold text-center">أوامر الشراء</TableHead>
                      <TableHead className="text-center font-semibold w-[120px]">الإجراءات</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {loading ? (
                      <TableRow>
                        <TableCell colSpan={7} className="h-32 text-center">
                          <div className="flex justify-center items-center">
                            <div className="w-8 h-8 border-4 border-primary border-t-transparent rounded-full animate-spin" />
                          </div>
                        </TableCell>
                      </TableRow>
                    ) : filteredSuppliers.length === 0 ? (
                      <TableRow>
                        <TableCell colSpan={7} className="h-32 text-center text-muted-foreground">
                          لا يوجد موردين مطابقين للبحث
                        </TableCell>
                      </TableRow>
                    ) : (
                      filteredSuppliers.map((supplier) => (
                        <TableRow key={supplier.id} className="hover:bg-muted/10 group transition-colors">
                          <TableCell className="px-4">
                            <div onClick={e => e.stopPropagation()}>
                              <Checkbox 
                                checked={selectedSuppliers.includes(supplier.id)}
                                onCheckedChange={(c) => {
                                  if (c) setSelectedSuppliers(prev => [...prev, supplier.id]);
                                  else setSelectedSuppliers(prev => prev.filter(id => id !== supplier.id));
                                }}
                              />
                            </div>
                          </TableCell>
                          <TableCell className="px-4">
                            <div className="flex items-center gap-3">
                              <div className="w-10 h-10 rounded-full bg-primary/10 flex items-center justify-center shrink-0">
                                <Truck className="w-5 h-5 text-primary" />
                              </div>
                              <div>
                                <p className="font-bold text-base">{supplier.name}</p>
                                {supplier.company && (
                                  <p className="text-sm text-muted-foreground flex items-center gap-1 mt-0.5">
                                    <Briefcase className="w-3 h-3" />
                                    {supplier.company}
                                  </p>
                                )}
                              </div>
                            </div>
                          </TableCell>
                          <TableCell>
                            <Badge variant="outline" className="bg-background">
                              {supplier.category || 'غير محدد'}
                            </Badge>
                          </TableCell>
                          <TableCell>
                            <div className="space-y-1">
                              {supplier.phone ? (
                                <p className="text-sm flex items-center gap-1.5" dir="ltr">
                                  <Phone className="w-3" />
                                  <span className="text-right w-full">{supplier.phone}</span>
                                </p>
                              ) : <span className="text-muted-foreground text-xs">-</span>}
                            </div>
                          </TableCell>
                          <TableCell className="text-center">
                             {supplier.status === 'inactive' ? (
                               <Badge variant="outline" className="text-rose-600 bg-rose-50 border-rose-200">غير نشط</Badge>
                             ) : (
                               <Badge variant="outline" className="text-emerald-600 bg-emerald-50 border-emerald-200">نشط</Badge>
                             )}
                          </TableCell>
                          <TableCell className="text-center">
                            <div className="flex flex-col items-center">
                              <span className="font-bold text-lg text-primary">{supplierStats[supplier.id]?.orderCount || 0}</span>
                              <span className="text-xs text-muted-foreground">طلبات</span>
                            </div>
                          </TableCell>
                          <TableCell className="text-center">
                            <div className="flex justify-center items-center gap-1 opacity-100 sm:opacity-0 sm:group-hover:opacity-100 transition-opacity">
                              <Button variant="ghost" size="icon" className="h-9 w-9 text-primary hover:bg-primary/10 rounded-full" 
                                onClick={() => setViewingSupplier(supplier)} title="عرض الملف">
                                <Eye className="w-4 h-4" />
                              </Button>
                              <Button variant="ghost" size="icon" className="h-9 w-9 text-blue-600 hover:bg-blue-500/10 rounded-full" 
                                onClick={() => openEditDialog(supplier)} title="تعديل">
                                <Edit className="w-4 h-4" />
                              </Button>
                              <Button variant="ghost" size="icon" className="h-9 w-9 text-destructive hover:bg-destructive/10 rounded-full" 
                                onClick={() => handleDelete(supplier.id, supplier.name)} title="حذف">
                                <Trash2 className="w-4 h-4" />
                              </Button>
                            </div>
                          </TableCell>
                        </TableRow>
                      ))
                    )}
                  </TableBody>
                </Table>
              </div>

              {/* Mobile View: Responsive Supplier Cards */}
              <div className="md:hidden space-y-3">
                {loading ? (
                  <div className="p-8 text-center bg-card border rounded-xl flex flex-col items-center justify-center gap-3">
                    <div className="w-7 h-7 border-2 border-primary border-t-transparent rounded-full animate-spin" />
                    <p className="text-xs text-muted-foreground">جاري تحميل الموردين...</p>
                  </div>
                ) : filteredSuppliers.length === 0 ? (
                  <div className="flex flex-col items-center justify-center p-6 text-center bg-card rounded-xl border border-dashed border-border text-muted-foreground">
                    <div className="w-12 h-12 rounded-full bg-muted flex items-center justify-center mb-3">
                      <Users className="w-6 h-6 opacity-30" />
                    </div>
                    <p className="text-sm font-bold text-foreground mb-1">لا يوجد موردين مطابقين</p>
                    <p className="text-xs">اضغط "مورد جديد" لتسجيل مورد جديد</p>
                  </div>
                ) : (
                  filteredSuppliers.map((supplier) => (
                    <div
                      key={supplier.id}
                      className="bg-card rounded-xl border border-border/70 p-3.5 shadow-sm space-y-3 hover:border-primary/40 transition-colors"
                    >
                      {/* Header: Avatar, Name, Company, Status */}
                      <div className="flex items-start justify-between gap-2">
                        <div className="flex items-center gap-2.5 min-w-0 flex-1">
                          <div className="w-10 h-10 rounded-full bg-primary/10 flex items-center justify-center text-primary shrink-0">
                            <Truck className="w-5 h-5" />
                          </div>
                          <div className="min-w-0 flex-1">
                            <p className="font-bold text-sm text-foreground truncate">{supplier.name}</p>
                            {supplier.company && (
                              <p className="text-[11px] text-muted-foreground truncate flex items-center gap-1">
                                <Briefcase className="w-3 h-3 flex-shrink-0" />
                                {supplier.company}
                              </p>
                            )}
                          </div>
                        </div>
                        <div className="flex-shrink-0">
                          {supplier.status === 'inactive' ? (
                            <Badge variant="outline" className="text-rose-600 bg-rose-50 border-rose-200 text-xs">غير نشط</Badge>
                          ) : (
                            <Badge variant="outline" className="text-emerald-600 bg-emerald-50 border-emerald-200 text-xs">نشط</Badge>
                          )}
                        </div>
                      </div>

                      {/* Details: Category, Phone, Orders */}
                      <div className="bg-muted/40 rounded-lg p-2.5 space-y-1.5 text-xs">
                        <div className="flex justify-between items-center">
                          <span className="text-muted-foreground">التصنيف:</span>
                          <Badge variant="outline" className="bg-background text-[11px]">{supplier.category || 'غير محدد'}</Badge>
                        </div>
                        {supplier.phone && (
                          <div className="flex justify-between items-center">
                            <span className="text-muted-foreground flex items-center gap-1">
                              <Phone className="w-3 h-3" /> الهاتف:
                            </span>
                            <span className="font-semibold text-foreground font-mono" dir="ltr">{supplier.phone}</span>
                          </div>
                        )}
                        <div className="flex justify-between items-center pt-1 border-t border-border/40">
                          <span className="text-muted-foreground">عدد أوامر الشراء:</span>
                          <span className="font-bold text-primary">{supplierStats[supplier.id]?.orderCount || 0} طلبات</span>
                        </div>
                        <div className="flex justify-between items-center">
                          <span className="text-muted-foreground">إجمالي التعامل:</span>
                          <span className="font-black text-foreground">{(supplierStats[supplier.id]?.totalAmount || 0).toLocaleString('ar-EG')} ج.م</span>
                        </div>
                      </div>

                      {/* Actions Footer */}
                      <div className="flex items-center gap-2 pt-1">
                        <Button
                          variant="outline"
                          size="sm"
                          className="flex-1 min-h-[44px] h-11 text-xs font-bold gap-1 text-primary border-primary/30 hover:bg-primary/10 rounded-xl"
                          onClick={() => setViewingSupplier(supplier)}
                        >
                          <Eye className="w-4 h-4" />
                          عرض الملف
                        </Button>
                        <Button
                          variant="outline"
                          size="sm"
                          className="min-h-[44px] h-11 px-3 text-xs font-bold gap-1 text-blue-600 border-blue-200 hover:bg-blue-50 rounded-xl"
                          onClick={() => openEditDialog(supplier)}
                          title="تعديل"
                        >
                          <Edit className="w-4 h-4" />
                        </Button>
                        <Button
                          variant="ghost"
                          size="icon"
                          className="min-h-[44px] min-w-[44px] h-11 w-11 text-destructive hover:bg-destructive/10 rounded-xl flex-shrink-0"
                          onClick={() => handleDelete(supplier.id, supplier.name)}
                          title="حذف"
                        >
                          <Trash2 className="w-4 h-4" />
                        </Button>
                      </div>
                    </div>
                  ))
                )}
              </div>
            </Tabs>
          </CardContent>
        </Card>
      </div>

      {/* Add / Edit Supplier Dialog */}
      <Dialog open={isAddDialogOpen || !!editingSupplier} onOpenChange={(open) => {
        if (!open) {
          setIsAddDialogOpen(false);
          setEditingSupplier(null);
        }
      }}>
        <DialogContent className="max-w-[95vw] sm:max-w-2xl max-h-[90dvh] overflow-y-auto rounded-2xl p-4 sm:p-6">
          <form onSubmit={editingSupplier ? handleUpdate : handleAdd}>
            <DialogHeader className="border-b pb-3 mb-4">
              <DialogTitle className="text-xl sm:text-2xl flex items-center gap-2">
                {editingSupplier ? <Edit className="w-5 h-5 sm:w-6 sm:h-6 text-primary flex-shrink-0" /> : <Plus className="w-5 h-5 sm:w-6 sm:h-6 text-primary flex-shrink-0" />}
                {editingSupplier ? 'تعديل بيانات المورد' : 'إضافة مورد جديد'}
              </DialogTitle>
              <DialogDescription className="text-xs sm:text-sm">
                أدخل كافة تفاصيل المورد والشركة لسهولة التواصل وتسجيل الفواتير.
              </DialogDescription>
            </DialogHeader>
            
            <div className="space-y-4 sm:space-y-6 py-1">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 sm:gap-4">
                <div className="space-y-1.5">
                  <Label className="text-xs sm:text-sm font-semibold">اسم المورد (أو المسؤول) <span className="text-red-500">*</span></Label>
                  <Input required placeholder="مثال: محمد أحمد" value={formData.name} onChange={e => handleInputChange('name', e.target.value)} disabled={isSubmitting} className="h-11 text-base sm:text-sm rounded-xl" />
                </div>
                <div className="space-y-1.5">
                  <Label className="text-xs sm:text-sm font-semibold">اسم الشركة / المؤسسة</Label>
                  <Input placeholder="مثال: شركة المراعي" value={formData.company} onChange={e => handleInputChange('company', e.target.value)} disabled={isSubmitting} className="h-11 text-base sm:text-sm rounded-xl" />
                </div>
                <div className="space-y-1.5">
                  <Label className="text-xs sm:text-sm font-semibold">تصنيف المورد</Label>
                  <Select value={formData.category} onValueChange={(v) => handleInputChange('category', v)}>
                    <SelectTrigger className="h-11 text-base sm:text-sm rounded-xl">
                       <SelectValue placeholder="اختر التصنيف..." />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="مواد غذائية">مواد غذائية ومشروبات</SelectItem>
                      <SelectItem value="لحوم ودواجن">لحوم ودواجن</SelectItem>
                      <SelectItem value="تغليف وتعبئة">تغليف وتعبئة (مستهلكات)</SelectItem>
                      <SelectItem value="معدات وصيانة">معدات وصيانة</SelectItem>
                      <SelectItem value="أخرى">أخرى</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-1.5">
                  <Label className="text-xs sm:text-sm font-semibold">حالة المورد</Label>
                  <Select value={formData.status} onValueChange={(v) => handleInputChange('status', v)}>
                    <SelectTrigger className="h-11 text-base sm:text-sm rounded-xl">
                       <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="active">نشط (يتعامل معه)</SelectItem>
                      <SelectItem value="inactive">غير نشط (متوقف)</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>

              <div className="p-3.5 sm:p-4 bg-muted/30 rounded-xl border space-y-3">
                 <h4 className="font-semibold text-xs sm:text-sm flex items-center gap-2 mb-1"><Phone className="w-4 h-4 text-primary"/> بيانات التواصل والضريبة</h4>
                 <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 sm:gap-4">
                  <div className="space-y-1.5">
                    <Label className="text-xs sm:text-sm font-semibold">رقم الهاتف</Label>
                    <Input placeholder="01xxxxxxxxx" value={formData.phone} onChange={e => handleInputChange('phone', e.target.value)} disabled={isSubmitting} dir="ltr" className="text-right h-11 text-base sm:text-sm rounded-xl" />
                  </div>
                  <div className="space-y-1.5">
                    <Label className="text-xs sm:text-sm font-semibold">البريد الإلكتروني</Label>
                    <Input type="email" placeholder="email@company.com" value={formData.email} onChange={e => handleInputChange('email', e.target.value)} disabled={isSubmitting} dir="ltr" className="text-right h-11 text-base sm:text-sm rounded-xl" />
                  </div>
                  <div className="space-y-1.5">
                    <Label className="text-xs sm:text-sm font-semibold">الرقم الضريبي (للفواتير)</Label>
                    <Input placeholder="123-456-789" value={formData.taxId} onChange={e => handleInputChange('taxId', e.target.value)} disabled={isSubmitting} dir="ltr" className="text-right h-11 text-base sm:text-sm rounded-xl" />
                  </div>
                  <div className="space-y-1.5">
                    <Label className="text-xs sm:text-sm font-semibold">العنوان الفعلي</Label>
                    <Input placeholder="أدخل العنوان بالتفصيل" value={formData.address} onChange={e => handleInputChange('address', e.target.value)} disabled={isSubmitting} className="h-11 text-base sm:text-sm rounded-xl" />
                  </div>
                </div>
              </div>

              <div className="space-y-1.5">
                <Label className="text-xs sm:text-sm font-semibold">ملاحظات إضافية</Label>
                <Input placeholder="أي معلومات تهمك مثل: موعد التوصيل، طرق الدفع المفضلة..." value={formData.notes} onChange={e => handleInputChange('notes', e.target.value)} disabled={isSubmitting} className="h-11 text-base sm:text-sm rounded-xl" />
              </div>
            </div>
            
            <DialogFooter className="mt-4 sm:mt-6 border-t pt-4 flex flex-col-reverse sm:flex-row gap-2 sm:gap-0">
              <Button type="button" variant="outline" className="min-h-[44px] rounded-xl font-bold" onClick={() => {setIsAddDialogOpen(false); setEditingSupplier(null);}} disabled={isSubmitting}>إلغاء</Button>
              <Button type="submit" disabled={isSubmitting} className="min-h-[44px] rounded-xl font-bold shadow-sm">{isSubmitting ? 'جاري الحفظ...' : (editingSupplier ? 'حفظ التحديثات' : 'إضافة المورد')}</Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      {/* Supplier Full Profile / View Dialog */}
      <Dialog open={!!viewingSupplier} onOpenChange={(open) => !open && setViewingSupplier(null)}>
        <DialogContent className="max-w-[95vw] sm:max-w-3xl rounded-2xl max-h-[90dvh] overflow-y-auto p-0 flex flex-col">
          {viewingSupplier && (
            <div className="flex flex-col h-full">
              <div className="bg-primary/5 p-4 sm:p-6 border-b flex flex-col sm:flex-row justify-between items-start sm:items-center gap-3">
                 <div className="flex items-center gap-3 sm:gap-4 min-w-0 flex-1">
                    <div className="w-12 h-12 sm:w-16 sm:h-16 rounded-2xl bg-primary/10 flex items-center justify-center shrink-0 border border-primary/20">
                      <Building2 className="w-6 h-6 sm:w-8 sm:h-8 text-primary" />
                    </div>
                    <div className="min-w-0 flex-1">
                      <h2 className="text-xl sm:text-2xl font-bold truncate">{viewingSupplier.name}</h2>
                      {viewingSupplier.company && <p className="text-sm sm:text-base text-muted-foreground truncate">{viewingSupplier.company}</p>}
                    </div>
                 </div>
                 {viewingSupplier.status === 'inactive' ? (
                    <Badge variant="outline" className="text-rose-600 bg-rose-50 border-rose-200 px-3 py-1 text-xs">توقف التعامل</Badge>
                 ) : (
                    <Badge variant="outline" className="text-emerald-600 bg-emerald-50 border-emerald-200 px-3 py-1 text-xs">يتعامل معه (نشط)</Badge>
                 )}
              </div>
              
              <div className="p-4 sm:p-6 grid grid-cols-1 md:grid-cols-2 gap-4 sm:gap-8 flex-1">
                <div className="space-y-4 sm:space-y-6">
                  <div>
                    <h3 className="font-semibold text-base sm:text-lg flex items-center gap-2 mb-2 sm:mb-3 border-b pb-2"><FileText className="w-4 h-4 sm:w-5 sm:h-5 text-primary"/> التوصيف المالي</h3>
                    <div className="space-y-3 bg-muted/20 p-3.5 sm:p-4 rounded-xl border">
                      <div className="flex justify-between items-center text-sm">
                        <span className="text-muted-foreground">عدد أوامر الشراء</span>
                        <span className="font-bold text-lg">{supplierStats[viewingSupplier.id]?.orderCount || 0}</span>
                      </div>
                      <div className="flex justify-between items-center pt-2.5 border-t">
                        <span className="text-muted-foreground text-sm">حجم التعامل الإجمالي</span>
                        <span className="font-bold text-lg sm:text-xl text-primary font-mono select-all">
                          {(supplierStats[viewingSupplier.id]?.totalAmount || 0).toLocaleString('ar-EG', {minimumFractionDigits: 2})} <span className="text-xs">ج.م</span>
                        </span>
                      </div>
                    </div>
                  </div>
                  
                  {viewingSupplier.notes && (
                    <div>
                      <h3 className="font-semibold text-sm flex items-center gap-2 mb-2 text-primary"><Tag className="w-4 h-4"/> ملاحظات الإدارة</h3>
                      <div className="bg-orange-50 dark:bg-orange-950/20 text-orange-800 dark:text-orange-200 p-3 rounded-xl text-xs sm:text-sm border border-orange-200 dark:border-orange-900">
                        {viewingSupplier.notes}
                      </div>
                    </div>
                  )}
                </div>

                <div className="space-y-3 sm:space-y-4">
                   <h3 className="font-semibold text-base sm:text-lg flex items-center gap-2 mb-2 sm:mb-3 border-b pb-2"><Phone className="w-4 h-4 sm:w-5 sm:h-5 text-primary"/> جهات الاتصال</h3>
                   
                   <div className="space-y-3 sm:space-y-4 pl-3 sm:pl-4 border-r-2 border-primary/20">
                     <div className="flex gap-2.5 sm:gap-3">
                       <Phone className="w-4 h-4 sm:w-5 sm:h-5 text-muted-foreground shrink-0 mt-0.5" />
                       <div>
                         <p className="text-xs text-muted-foreground">الهاتف المحمول</p>
                         <p className="font-medium text-sm font-mono" dir="ltr">{viewingSupplier.phone || 'غير مسجل'}</p>
                       </div>
                     </div>
                     <div className="flex gap-2.5 sm:gap-3">
                       <Mail className="w-4 h-4 sm:w-5 sm:h-5 text-muted-foreground shrink-0 mt-0.5" />
                       <div>
                         <p className="text-xs text-muted-foreground">البريد الإلكتروني</p>
                         <p className="font-medium text-sm" dir="ltr">{viewingSupplier.email || 'غير مسجل'}</p>
                       </div>
                     </div>
                     <div className="flex gap-2.5 sm:gap-3">
                       <MapPin className="w-4 h-4 sm:w-5 sm:h-5 text-muted-foreground shrink-0 mt-0.5" />
                       <div>
                         <p className="text-xs text-muted-foreground">مقر الشركة / العنوان</p>
                         <p className="font-medium text-sm">{viewingSupplier.address || 'غير مسجل'}</p>
                       </div>
                     </div>
                     <div className="flex gap-2.5 sm:gap-3">
                       <FileText className="w-4 h-4 sm:w-5 sm:h-5 text-muted-foreground shrink-0 mt-0.5" />
                       <div>
                         <p className="text-xs text-muted-foreground">الرقم الضريبي</p>
                         <p className="font-medium text-sm tracking-wider" dir="ltr">{viewingSupplier.taxId || 'غير مسجل'}</p>
                       </div>
                     </div>
                   </div>
                </div>
              </div>
              
              <div className="bg-muted/30 p-3.5 sm:p-4 border-t flex flex-col-reverse sm:flex-row justify-end gap-2.5 sm:gap-3">
                 <Button variant="outline" className="min-h-[44px] rounded-xl font-bold" onClick={() => setViewingSupplier(null)}>إغلاق الملف</Button>
                 <Button className="min-h-[44px] rounded-xl font-bold gap-2" onClick={() => { setViewingSupplier(null); openEditDialog(viewingSupplier); }}>
                    <Edit className="w-4 h-4" /> تعديل البيانات
                 </Button>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </MainLayout>
  );
}
