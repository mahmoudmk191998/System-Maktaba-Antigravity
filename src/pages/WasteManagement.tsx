import { useState, useMemo } from 'react';
import { MainLayout } from '@/components/layout';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Trash2, Plus, Edit, Search, DollarSign, FileDown, Printer, Filter, Calendar, AlertTriangle, PackageX, Package } from "lucide-react";
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Badge } from '@/components/ui/badge';
import { useTenantBranch, useInventoryItems, useStockMovements } from '@/hooks/useDatabase';
import { useUserPermissions } from '@/hooks/usePermissions';
import { useToast } from '@/hooks/use-toast';
import { isToday, isYesterday, isThisWeek, isThisMonth, parseISO } from 'date-fns';

export default function WasteManagement() {
  const { tenantId, branchId } = useTenantBranch();
  const { hasPermission, isAdmin } = useUserPermissions();
  const { items: inventoryItems } = useInventoryItems(tenantId);
  const { movements, addMovement, updateMovement, deleteMovement, loading } = useStockMovements(branchId);
  const { toast } = useToast();

  const canEdit = isAdmin || hasPermission('inventory.edit');
  const canDelete = isAdmin || hasPermission('inventory.delete');

  const [searchQuery, setSearchQuery] = useState('');
  const [dateFilter, setDateFilter] = useState('all');
  const [reasonFilter, setReasonFilter] = useState('all');
  const [isAddOpen, setIsAddOpen] = useState(false);
  const [isEditOpen, setIsEditOpen] = useState(false);
  const [editingRecord, setEditingRecord] = useState<any>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  // Form
  const [itemId, setItemId] = useState('');
  const [quantity, setQuantity] = useState('');
  const [reason, setReason] = useState('spoilage');
  const [notes, setNotes] = useState('');

  const filteredRecords = useMemo(() => {
    return movements
      .filter(m => m.movement_type === 'waste')
      .filter(r => {
        if (reasonFilter !== 'all' && r.reason !== reasonFilter) return false;
        
        if (dateFilter !== 'all') {
          const date = parseISO(r.created_at);
          if (dateFilter === 'today' && !isToday(date)) return false;
          if (dateFilter === 'yesterday' && !isYesterday(date)) return false;
          if (dateFilter === 'week' && !isThisWeek(date)) return false;
          if (dateFilter === 'month' && !isThisMonth(date)) return false;
        }

        if (searchQuery) {
          const s = searchQuery.toLowerCase();
          const itemName = inventoryItems.find((i: any) => i.id === r.item_id)?.name?.toLowerCase() || '';
          const recordNotes = (r.notes || '').toLowerCase();
          return itemName.includes(s) || recordNotes.includes(s);
        }

        return true;
      })
      .sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime()); // Sort newest first
  }, [movements, reasonFilter, dateFilter, searchQuery, inventoryItems]);

  const stats = useMemo(() => {
    let totalScore = 0;
    let totalQty = 0;
    const itemsMap: Record<string, { qty: number; cost: number; name: string }> = {};

    filteredRecords.forEach((record) => {
      const item = inventoryItems.find((i: any) => i.id === record.item_id);
      const costPerUnit = item ? (Number(item.cost_per_unit) || 0) : 0;
      const qty = Math.abs(Number(record.quantity));
      const lineCost = qty * costPerUnit;

      totalScore += lineCost;
      totalQty += qty;

      if (!itemsMap[record.item_id]) {
        itemsMap[record.item_id] = { qty: 0, cost: 0, name: item?.name || 'غير معروف' };
      }
      itemsMap[record.item_id].qty += qty;
      itemsMap[record.item_id].cost += lineCost;
    });

    let topWastedItem = null;
    let maxCost = -1;
    Object.values(itemsMap).forEach(v => {
      if (v.cost > maxCost) {
        maxCost = v.cost;
        topWastedItem = v;
      }
    });

    return {
      totalCost: totalScore,
      totalQty,
      topItem: topWastedItem
    };
  }, [filteredRecords, inventoryItems]);

  const formatCurrency = (val: number) => new Intl.NumberFormat('ar-EG', { style: 'currency', currency: 'EGP' }).format(val);

  const handleAdd = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!itemId || !quantity) return;
    setIsSubmitting(true);
    
    const qty = Math.abs(Number(quantity)); // Ensure it's positive before negating
    const success = await addMovement({
      item_id: itemId,
      movement_type: 'waste',
      quantity: -qty, // Negative quantity perfectly reduces inventory generic logic
      reason,
      notes,
    });

    if (success) {
      toast({ title: 'تمت الإضافة', description: 'تم تسجيل الهالك بنجاح' });
      setIsAddOpen(false);
      setItemId(''); setQuantity(''); setNotes('');
    } else {
      toast({ title: 'خطأ', description: 'حدث خطأ أثناء التسجيل', variant: 'destructive' });
    }
    setIsSubmitting(false);
  };

  const handleEditSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingRecord || !editingRecord.item_id || !editingRecord.quantity) return;
    setIsSubmitting(true);
    
    const qty = -Math.abs(Number(editingRecord.quantity)); // Negative because it's waste
    const success = await updateMovement(
      editingRecord.id, 
      editingRecord._original, 
      { ...editingRecord, quantity: qty }
    );

    if (success) {
      toast({ title: 'تم التحديث', description: 'تم تحديث سجل الهالك بنجاح' });
      setIsEditOpen(false);
      setEditingRecord(null);
    } else {
      toast({ title: 'خطأ', description: 'حدث خطأ أثناء التحديث', variant: 'destructive' });
    }
    setIsSubmitting(false);
  };

  const handleDelete = async (record: any) => {
    if (!confirm('هل أنت متأكد من حذف هذا السجل؟ سيتم إعادة الكمية المخصومة إلى المخزون.')) return;
    const success = await deleteMovement(record.id, record.item_id, record.quantity);
    if (success) {
      toast({ title: 'تم الحذف', description: 'تم حذف السجل واسترجاع الكمية إلى المخزون بنجاح' });
    } else {
      toast({ title: 'خطأ', description: 'حدث خطأ أثناء الحذف', variant: 'destructive' });
    }
  };

  const getItemName = (id: string) => inventoryItems.find((i: any) => i.id === id)?.name || 'غير معروف';

  const exportToCSV = () => {
    if (filteredRecords.length === 0) {
      toast({ title: 'لا يوجد بيانات', description: 'قم بتغيير الفلاتر لعرض بيانات للتصدير', variant: 'destructive' });
      return;
    }

    const headers = ['التاريخ', 'الصنف', 'الكمية المهدرة', 'السبب', 'التكلفة الإجمالية'];
    const csvContent = [
      headers.join(','),
      ...filteredRecords.map(r => {
        const item = inventoryItems.find((i: any) => i.id === r.item_id);
        const costPerUnit = item ? (Number(item.cost_per_unit) || 0) : 0;
        const totalLineCost = costPerUnit * Math.abs(Number(r.quantity));
        const reasonStr = r.reason === 'spoilage' ? 'تلف / انتهاء صلاحية' :
                          r.reason === 'mistake' ? 'خطأ تشغيلي أو سقوط' :
                          r.reason ? 'أخرى' : 'مسجلة من المخزون العام';
        
        return `"${new Date(r.created_at).toLocaleDateString('ar-EG')}","${item?.name || 'غير معروف'}",${Math.abs(Number(r.quantity))},"${reasonStr}",${totalLineCost.toFixed(2)}`;
      })
    ].join('\n');

    const blob = new Blob(['\ufeff' + csvContent], { type: 'text/csv;charset=utf-8;' });
    const link = document.createElement('a');
    const url = URL.createObjectURL(blob);
    link.setAttribute('href', url);
    link.setAttribute('download', `waste-report-${new Date().toISOString().split('T')[0]}.csv`);
    link.style.visibility = 'hidden';
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  const renderReasonBadge = (reasonVal?: string) => {
    if (!reasonVal || reasonVal === 'spoilage') {
      return <Badge variant="outline" className="bg-rose-50 text-rose-600 border-rose-200 text-xs">تلف / انتهاء صلاحية</Badge>;
    }
    if (reasonVal === 'mistake') {
      return <Badge variant="outline" className="bg-amber-50 text-amber-600 border-amber-200 text-xs">خطأ تشغيلي</Badge>;
    }
    return <Badge variant="outline" className="bg-slate-50 text-slate-600 border-slate-200 text-xs">أسباب أخرى</Badge>;
  };

  return (
    <MainLayout
      title="إدارة الهالك والتوالف"
      subtitle="تسجيل المواد التالفة أو الهالكة وخصمها من المخزون مع ذكر الأسباب."
      actions={
        <Button onClick={() => setIsAddOpen(true)} className="gap-2 w-full sm:w-auto min-h-[44px] sm:min-h-0 h-10 rounded-xl font-bold">
          <Plus className="w-4 h-4" />
          تسجيل هالك
        </Button>
      }
    >
      <div className="grid gap-4 sm:gap-6 pb-20">
        {/* KPI Cards */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3 sm:gap-4">
           <Card className="bg-gradient-to-br from-rose-50 to-white dark:from-rose-950/20 dark:to-background border-rose-100 dark:border-rose-900/50 shadow-sm transition-all hover:shadow-md duration-300">
             <CardContent className="p-4 sm:p-5 flex items-center gap-3 sm:gap-4">
               <div className="p-3 sm:p-4 bg-rose-100 dark:bg-rose-900/40 rounded-2xl text-rose-600 dark:text-rose-400 shadow-inner flex-shrink-0">
                 <DollarSign className="w-6 h-6 sm:w-7 sm:h-7" />
               </div>
               <div className="min-w-0 flex-1">
                 <p className="text-xs sm:text-sm font-semibold text-muted-foreground mb-1 truncate">إجمالي تكلفة التوالف</p>
                 <h3 className="text-2xl sm:text-3xl font-black text-foreground truncate">{formatCurrency(stats.totalCost)}</h3>
               </div>
             </CardContent>
           </Card>

           <Card className="bg-gradient-to-br from-amber-50 to-white dark:from-amber-950/20 dark:to-background border-amber-100 dark:border-amber-900/50 shadow-sm transition-all hover:shadow-md duration-300">
             <CardContent className="p-4 sm:p-5 flex items-center gap-3 sm:gap-4">
               <div className="p-3 sm:p-4 bg-amber-100 dark:bg-amber-900/40 rounded-2xl text-amber-600 dark:text-amber-400 shadow-inner flex-shrink-0">
                 <AlertTriangle className="w-6 h-6 sm:w-7 sm:h-7" />
               </div>
               <div className="min-w-0 flex-1">
                 <p className="text-xs sm:text-sm font-semibold text-muted-foreground mb-1 truncate">أكثر صنف إهداراً (تكلفةً)</p>
                 <h3 className="text-lg sm:text-xl font-bold text-foreground truncate">
                   {stats.topItem ? stats.topItem.name : 'لا يوجد'}
                 </h3>
                 {stats.topItem && <p className="text-xs font-bold text-muted-foreground mt-0.5">{formatCurrency(stats.topItem.cost)}</p>}
               </div>
             </CardContent>
           </Card>

           <Card className="bg-gradient-to-br from-sky-50 to-white dark:from-sky-950/20 dark:to-background border-sky-100 dark:border-sky-900/50 shadow-sm transition-all hover:shadow-md duration-300 sm:col-span-2 lg:col-span-1">
             <CardContent className="p-4 sm:p-5 flex items-center gap-3 sm:gap-4">
               <div className="p-3 sm:p-4 bg-sky-100 dark:bg-sky-900/40 rounded-2xl text-sky-600 dark:text-sky-400 shadow-inner flex-shrink-0">
                 <PackageX className="w-6 h-6 sm:w-7 sm:h-7" />
               </div>
               <div className="min-w-0 flex-1">
                 <p className="text-xs sm:text-sm font-semibold text-muted-foreground mb-1 truncate">إجمالي الكمية المُهدرة</p>
                 <h3 className="text-2xl sm:text-3xl font-black text-foreground truncate">{stats.totalQty.toFixed(2)}</h3>
               </div>
             </CardContent>
           </Card>
        </div>

        {/* Main Records Container */}
        <Card className="border-border/60 shadow-sm">
          <CardHeader className="p-4 sm:p-6">
            <div className="flex flex-col xl:flex-row justify-between items-start xl:items-center gap-3 sm:gap-4">
              <div>
                <CardTitle className="flex items-center gap-2 text-base sm:text-lg">
                  <Trash2 className="w-5 h-5 text-destructive flex-shrink-0" />
                  سجل الهالك المفلتر
                </CardTitle>
                <CardDescription className="text-xs sm:text-sm mt-1">عرض العمليات الخاصة بالهالك بناءً على الفلاتر</CardDescription>
              </div>

              {/* Filters & Search Toolbar */}
              <div className="flex flex-col sm:flex-row flex-wrap items-stretch sm:items-center gap-2 w-full xl:w-auto">
                <div className="flex items-center gap-2 w-full sm:w-auto">
                  <div className="relative flex-1 sm:w-36">
                    <Select value={dateFilter} onValueChange={setDateFilter}>
                      <SelectTrigger className="h-10 text-xs sm:text-sm rounded-xl">
                        <Calendar className="w-3.5 h-3.5 ml-1 text-muted-foreground" />
                        <SelectValue placeholder="الفترة" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="all">الكل</SelectItem>
                        <SelectItem value="today">اليوم</SelectItem>
                        <SelectItem value="yesterday">الأمس</SelectItem>
                        <SelectItem value="week">هذا الأسبوع</SelectItem>
                        <SelectItem value="month">هذا الشهر</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  
                  <div className="relative flex-1 sm:w-44">
                    <Select value={reasonFilter} onValueChange={setReasonFilter}>
                      <SelectTrigger className="h-10 text-xs sm:text-sm rounded-xl">
                        <Filter className="w-3.5 h-3.5 ml-1 text-muted-foreground" />
                        <SelectValue placeholder="السبب" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="all">كل الأسباب</SelectItem>
                        <SelectItem value="spoilage">تلف / انتهاء صلاحية</SelectItem>
                        <SelectItem value="mistake">خطأ تشغيلي</SelectItem>
                        <SelectItem value="other">أسباب أخرى</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>

                  <div className="flex items-center gap-1.5 sm:hidden">
                    <Button variant="outline" size="icon" onClick={exportToCSV} title="تصدير CSV" className="h-10 w-10 min-h-[44px] min-w-[44px] rounded-xl shrink-0">
                      <FileDown className="w-4 h-4" />
                    </Button>
                    <Button variant="outline" size="icon" onClick={() => window.print()} title="طباعة" className="h-10 w-10 min-h-[44px] min-w-[44px] rounded-xl shrink-0">
                      <Printer className="w-4 h-4" />
                    </Button>
                  </div>
                </div>

                <div className="relative flex-grow w-full sm:w-60 xl:w-64">
                  <Search className="absolute right-3 top-3 h-4 w-4 text-muted-foreground pointer-events-none" />
                  <Input
                    placeholder="بحث بالصنف أو الملاحظات..."
                    className="pr-9 h-10 text-base sm:text-sm rounded-xl"
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                  />
                </div>
                
                <div className="hidden sm:flex items-center gap-1.5">
                  <Button variant="outline" size="icon" onClick={exportToCSV} title="تصدير CSV" className="h-10 w-10 rounded-xl shrink-0">
                    <FileDown className="w-4 h-4" />
                  </Button>
                  <Button variant="outline" size="icon" onClick={() => window.print()} title="طباعة" className="h-10 w-10 rounded-xl shrink-0">
                    <Printer className="w-4 h-4" />
                  </Button>
                </div>
              </div>
            </div>
          </CardHeader>

          <CardContent className="p-3 sm:p-6 pt-0 sm:pt-0">
            {/* Desktop View: Table */}
            <div className="hidden md:block rounded-xl border border-border/50 overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>التاريخ</TableHead>
                    <TableHead>الصنف</TableHead>
                    <TableHead>الكمية المهدرة</TableHead>
                    <TableHead>السبب</TableHead>
                    <TableHead>إجمالي التكلفة</TableHead>
                    <TableHead className="w-24 text-left">إجراء</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {loading ? (
                    <TableRow>
                      <TableCell colSpan={6} className="h-24 text-center">
                        <div className="flex justify-center items-center">
                          <div className="w-6 h-6 border-2 border-primary border-t-transparent rounded-full animate-spin" />
                        </div>
                      </TableCell>
                    </TableRow>
                  ) : filteredRecords.length === 0 ? (
                    <TableRow>
                      <TableCell colSpan={6} className="h-24 text-center text-muted-foreground">
                        لا يوجد سجلات تطابق عوامل التصفية الحالية
                      </TableCell>
                    </TableRow>
                  ) : (
                    filteredRecords.map((record) => {
                      const item = inventoryItems.find((i: any) => i.id === record.item_id);
                      const costPerUnit = item ? (Number(item.cost_per_unit) || 0) : 0;
                      const lineCost = Math.abs(record.quantity) * costPerUnit;

                      return (
                        <TableRow key={record.id} className="hover:bg-muted/30 transition-colors">
                          <TableCell className="text-sm text-muted-foreground whitespace-nowrap">{new Date(record.created_at).toLocaleDateString('ar-EG')}</TableCell>
                          <TableCell className="font-medium whitespace-nowrap">{item?.name || 'غير معروف'}</TableCell>
                          <TableCell className="font-bold flex items-center gap-1">
                            {Math.abs(record.quantity)}
                            <span className="text-xs font-normal text-muted-foreground">{item?.unit}</span>
                          </TableCell>
                          <TableCell>
                            {renderReasonBadge(record.reason)}
                          </TableCell>
                          <TableCell className="font-semibold text-destructive">{formatCurrency(lineCost)}</TableCell>
                          <TableCell className="text-left">
                            <div className="flex items-center justify-end gap-1">
                              {canEdit && (
                                <Button variant="ghost" size="icon" className="h-8 w-8 text-muted-foreground hover:text-foreground rounded-full" onClick={() => { setEditingRecord({ ...record, quantity: Math.abs(record.quantity), _original: record }); setIsEditOpen(true); }} title="تعديل">
                                  <Edit className="w-4 h-4" />
                                </Button>
                              )}
                              {canDelete && (
                                <Button variant="ghost" size="icon" className="h-8 w-8 text-destructive hover:bg-destructive/10 rounded-full" onClick={() => handleDelete(record)} title="حذف">
                                  <Trash2 className="w-4 h-4" />
                                </Button>
                              )}
                            </div>
                          </TableCell>
                        </TableRow>
                      );
                    })
                  )}
                </TableBody>
              </Table>
            </div>

            {/* Mobile View: Responsive Waste Cards */}
            <div className="md:hidden space-y-3">
              {loading ? (
                <div className="p-8 text-center bg-card border rounded-xl flex flex-col items-center justify-center gap-3">
                  <div className="w-7 h-7 border-2 border-primary border-t-transparent rounded-full animate-spin" />
                  <p className="text-xs text-muted-foreground">جاري تحميل سجلات الهالك...</p>
                </div>
              ) : filteredRecords.length === 0 ? (
                <div className="flex flex-col items-center justify-center p-6 text-center bg-card rounded-xl border border-dashed border-border text-muted-foreground">
                  <div className="w-12 h-12 rounded-full bg-muted flex items-center justify-center mb-3">
                    <Trash2 className="w-6 h-6 opacity-30" />
                  </div>
                  <p className="text-sm font-bold text-foreground mb-1">لا توجد سجلات هالك</p>
                  <p className="text-xs">اضغط "تسجيل هالك" أو قم بتغيير الفلاتر</p>
                </div>
              ) : (
                filteredRecords.map((record) => {
                  const item = inventoryItems.find((i: any) => i.id === record.item_id);
                  const costPerUnit = item ? (Number(item.cost_per_unit) || 0) : 0;
                  const lineCost = Math.abs(record.quantity) * costPerUnit;

                  return (
                    <div
                      key={record.id}
                      className="bg-card rounded-xl border border-border/70 p-3.5 shadow-sm space-y-3 hover:border-destructive/30 transition-colors"
                    >
                      {/* Card Header: Item name + Date */}
                      <div className="flex items-start justify-between gap-2">
                        <div className="flex items-center gap-2 min-w-0 flex-1">
                          <div className="w-9 h-9 rounded-xl bg-destructive/10 flex items-center justify-center text-destructive flex-shrink-0">
                            <Package className="w-4 h-4" />
                          </div>
                          <div className="min-w-0 flex-1">
                            <p className="font-bold text-sm text-foreground truncate">{item?.name || 'غير معروف'}</p>
                            <p className="text-[11px] text-muted-foreground">{new Date(record.created_at).toLocaleDateString('ar-EG')}</p>
                          </div>
                        </div>
                        <div className="flex-shrink-0">
                          {renderReasonBadge(record.reason)}
                        </div>
                      </div>

                      {/* Card Metrics Grid */}
                      <div className="grid grid-cols-2 gap-2 text-center bg-muted/40 rounded-lg p-2.5">
                        <div className="border-l border-border/60 pl-2">
                          <p className="text-[10px] text-muted-foreground">الكمية المهدرة</p>
                          <p className="text-sm font-black text-foreground mt-0.5">
                            {Math.abs(record.quantity)} <span className="text-[11px] font-normal text-muted-foreground">{item?.unit}</span>
                          </p>
                        </div>
                        <div className="pr-2">
                          <p className="text-[10px] text-muted-foreground">التكلفة الإجمالية</p>
                          <p className="text-sm font-black text-destructive mt-0.5" dir="ltr">
                            {formatCurrency(lineCost)}
                          </p>
                        </div>
                      </div>

                      {/* Notes if available */}
                      {record.notes && (
                        <p className="text-xs text-muted-foreground bg-muted/20 px-2.5 py-1.5 rounded-lg border border-border/40 line-clamp-2">
                          {record.notes}
                        </p>
                      )}

                      {/* Card Actions Footer */}
                      {(canEdit || canDelete) && (
                        <div className="flex items-center gap-2 pt-1">
                          {canEdit && (
                            <Button
                              variant="outline"
                              size="sm"
                              className="flex-1 min-h-[44px] h-11 text-xs font-bold gap-1.5 text-blue-600 hover:bg-blue-50 dark:hover:bg-blue-900/20 rounded-xl"
                              onClick={() => { setEditingRecord({ ...record, quantity: Math.abs(record.quantity), _original: record }); setIsEditOpen(true); }}
                            >
                              <Edit className="w-4 h-4" />
                              تعديل
                            </Button>
                          )}
                          {canDelete && (
                            <Button
                              variant="ghost"
                              size="icon"
                              className="min-h-[44px] min-w-[44px] h-11 w-11 text-destructive hover:bg-destructive/10 rounded-xl flex-shrink-0"
                              onClick={() => handleDelete(record)}
                              title="حذف واسترجاع للمخزون"
                            >
                              <Trash2 className="w-4 h-4" />
                            </Button>
                          )}
                        </div>
                      )}
                    </div>
                  );
                })
              )}
            </div>

            <p className="text-xs text-muted-foreground mt-4 text-center">ملاحظة: سجل الهالك مرتبط بارتباط وثيق بالمخزون. يمكنك الآن تعديل أو حذف السجل وسينعكس ذلك على الرصيد الفعلي للمخزون.</p>
          </CardContent>
        </Card>
      </div>

      {/* Add Dialog */}
      <Dialog open={isAddOpen} onOpenChange={setIsAddOpen}>
        <DialogContent className="max-w-[95vw] sm:max-w-md max-h-[90dvh] overflow-y-auto rounded-2xl p-4 sm:p-6">
          <form onSubmit={handleAdd}>
            <DialogHeader className="pb-2">
              <DialogTitle className="text-base sm:text-lg font-bold">تسجيل هالك جديد</DialogTitle>
            </DialogHeader>
            <div className="space-y-4 py-3">
              <div className="space-y-1.5">
                <Label className="text-xs sm:text-sm font-semibold">الصنف *</Label>
                <Select value={itemId} onValueChange={setItemId} disabled={isSubmitting}>
                  <SelectTrigger className="w-full h-11 text-base sm:text-sm rounded-xl">
                    <SelectValue placeholder="اختر صنفاً" />
                  </SelectTrigger>
                  <SelectContent className="max-h-56">
                    {inventoryItems.map((i: any) => <SelectItem key={i.id} value={i.id} className="text-sm">{i.name}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs sm:text-sm font-semibold">الكمية المطلوبة للخصم *</Label>
                <Input 
                  type="number" 
                  step="0.01" 
                  required 
                  value={quantity} 
                  onChange={e => setQuantity(e.target.value)} 
                  disabled={isSubmitting} 
                  className="h-11 text-base sm:text-sm rounded-xl"
                  placeholder="0.00"
                />
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs sm:text-sm font-semibold">السبب</Label>
                <Select value={reason} onValueChange={setReason} disabled={isSubmitting}>
                  <SelectTrigger className="w-full h-11 text-base sm:text-sm rounded-xl">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="spoilage" className="text-sm">تلف / انتهاء صلاحية</SelectItem>
                    <SelectItem value="mistake" className="text-sm">خطأ تشغيلي أو سقوط</SelectItem>
                    <SelectItem value="other" className="text-sm">أسباب أخرى</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs sm:text-sm font-semibold">ملاحظات إضافية (اختياري)</Label>
                <Textarea 
                  value={notes} 
                  onChange={e => setNotes(e.target.value)} 
                  disabled={isSubmitting} 
                  className="text-base sm:text-sm rounded-xl min-h-[80px]"
                  placeholder="أدخل أي تفاصيل أو أسباب إضافية..."
                />
              </div>
            </div>
            <DialogFooter className="flex flex-col-reverse sm:flex-row gap-2 sm:gap-0 pt-2">
              <Button type="button" variant="outline" onClick={() => setIsAddOpen(false)} disabled={isSubmitting} className="min-h-[44px] rounded-xl font-bold">
                إلغاء
              </Button>
              <Button type="submit" disabled={isSubmitting} className="min-h-[44px] rounded-xl font-bold">
                {isSubmitting ? 'جاري الحفظ والخصم...' : 'حفظ'}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      {/* Edit Dialog */}
      <Dialog open={isEditOpen} onOpenChange={(open) => { setIsEditOpen(open); if(!open) setEditingRecord(null); }}>
        <DialogContent className="max-w-[95vw] sm:max-w-md max-h-[90dvh] overflow-y-auto rounded-2xl p-4 sm:p-6">
          <form onSubmit={handleEditSubmit}>
            <DialogHeader className="pb-2">
              <DialogTitle className="text-base sm:text-lg font-bold">تعديل سجل هالك</DialogTitle>
            </DialogHeader>
            {editingRecord && (
              <div className="space-y-4 py-3">
                <div className="space-y-1 text-muted-foreground bg-muted/40 p-3 rounded-xl text-xs sm:text-sm border border-border/60">
                  <span className="font-semibold text-foreground">الصنف: </span> {getItemName(editingRecord.item_id)}
                </div>
                <div className="space-y-1.5">
                  <Label className="text-xs sm:text-sm font-semibold">الكمية المطلوبة للخصم *</Label>
                  <Input 
                    type="number" 
                    step="0.01" 
                    min={0.01} 
                    required 
                    value={editingRecord.quantity} 
                    onChange={e => setEditingRecord((f: any) => ({ ...f, quantity: e.target.value }))} 
                    disabled={isSubmitting} 
                    className="h-11 text-base sm:text-sm rounded-xl"
                  />
                </div>
                <div className="space-y-1.5">
                  <Label className="text-xs sm:text-sm font-semibold">السبب</Label>
                  <Select value={editingRecord.reason || 'spoilage'} onValueChange={v => setEditingRecord((f: any) => ({ ...f, reason: v }))} disabled={isSubmitting}>
                    <SelectTrigger className="w-full h-11 text-base sm:text-sm rounded-xl">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="spoilage" className="text-sm">تلف / انتهاء صلاحية</SelectItem>
                      <SelectItem value="mistake" className="text-sm">خطأ تشغيلي أو سقوط</SelectItem>
                      <SelectItem value="other" className="text-sm">أسباب أخرى</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-1.5">
                  <Label className="text-xs sm:text-sm font-semibold">ملاحظات إضافية</Label>
                  <Textarea 
                    value={editingRecord.notes || ''} 
                    onChange={e => setEditingRecord((f: any) => ({ ...f, notes: e.target.value }))} 
                    disabled={isSubmitting} 
                    className="text-base sm:text-sm rounded-xl min-h-[80px]"
                  />
                </div>
              </div>
            )}
            <DialogFooter className="flex flex-col-reverse sm:flex-row gap-2 sm:gap-0 pt-2">
              <Button type="button" variant="outline" onClick={() => { setIsEditOpen(false); setEditingRecord(null); }} disabled={isSubmitting} className="min-h-[44px] rounded-xl font-bold">
                إلغاء
              </Button>
              <Button type="submit" disabled={isSubmitting} className="min-h-[44px] rounded-xl font-bold">
                {isSubmitting ? 'جاري التحديث...' : 'تحديث'}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </MainLayout>
  );
}
