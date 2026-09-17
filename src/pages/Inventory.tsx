import { useState } from 'react';
import { MainLayout } from '@/components/layout';
import { useTenantBranch, useInventoryItems, useBranchStock, useStockMovements, useUnits } from '@/hooks/useDatabase';
import { useUserPermissions } from '@/hooks/usePermissions';
import { useFormatters } from '@/lib/formatters';
import { cn } from '@/lib/utils';
import { Package, AlertTriangle, TrendingDown, Search, Plus, Edit, Trash2, BarChart3, ArrowDownToLine, ArrowUpToLine, FileDown, Printer, Filter, CheckCircle2, History, TrendingUp, MoreHorizontal, ArrowDownRight, XCircle, PieChart as PieChartIcon } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuLabel, DropdownMenuSeparator, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { toast } from 'sonner';
import { motion, AnimatePresence } from 'framer-motion';
import { PieChart, Pie, Cell, ResponsiveContainer, BarChart, Bar, XAxis, YAxis, Tooltip as RechartsTooltip, Legend } from 'recharts';
import { Progress } from '@/components/ui/progress';
import { Checkbox } from '@/components/ui/checkbox';

const COLORS = ['#0ea5e9', '#10b981', '#f59e0b', '#ef4444', '#8b5cf6', '#ec4899', '#f97316'];

const ReconciliationRow = ({ item, addMovement, refreshStock, formatNumber, canCount }: any) => {
  const [actual, setActual] = useState(item.quantity);
  const diff = actual - item.quantity;
  const handleSettle = async () => {
    if (!canCount) return;
    if (diff === 0) return;
    const type = diff > 0 ? 'adjustment_in' : 'adjustment_out';
    const success = await addMovement({ item_id: item.id, movement_type: type, quantity: diff, notes: 'تسوية الجرد الفعلي' });
    if (success) {
      toast.success('تم تسوية رصيد الصنف');
      refreshStock();
    }
  };
  return (
    <TableRow className="group hover:bg-muted/30 transition-colors duration-200">
      <TableCell>
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-full bg-primary/10 flex items-center justify-center text-primary font-bold shadow-sm shrink-0">
            {item.name.charAt(0).toUpperCase()}
          </div>
          <div>
            <p className="font-bold text-base">{item.name}</p>
            <p className="text-xs text-muted-foreground hidden md:block">{item.sku || 'بدون كود'}</p>
          </div>
        </div>
      </TableCell>
      <TableCell className="font-bold text-lg">{formatNumber(item.quantity)}</TableCell>
      <TableCell>
        <Input type="number" min="0" step="0.01" className="w-32 text-center h-10 font-bold bg-muted/30 focus-visible:ring-1 focus-visible:bg-transparent transition-all" value={actual} onChange={e => setActual(Number(e.target.value))} disabled={!canCount} />
      </TableCell>
      <TableCell dir="ltr" className={cn('font-black text-lg', diff > 0 ? 'text-emerald-600 dark:text-emerald-400' : diff < 0 ? 'text-red-600 dark:text-red-400' : 'text-muted-foreground')}>
        {diff > 0 ? '+' : ''}{formatNumber(diff)}
      </TableCell>
      <TableCell>
        <Button size="sm" variant={diff === 0 ? 'outline' : 'default'} disabled={diff === 0 || !canCount} onClick={handleSettle} className={cn("h-10 w-full md:w-auto font-bold transition-all", diff !== 0 && "bg-primary text-primary-foreground hover:bg-primary/90 shadow-sm")}>تسوية الفارق</Button>
      </TableCell>
    </TableRow>
  );
};

export default function Inventory() {
  const { tenantId, branchId } = useTenantBranch();
  const { hasPermission, isAdmin } = useUserPermissions();
  const { items, add: addItem, update: updateItem, remove: removeItem, loading } = useInventoryItems(tenantId);
  const { stock, initStock, refresh: refreshStock } = useBranchStock(branchId);
  const { movements, addMovement, updateMovement, deleteMovement, refresh: refreshMovements } = useStockMovements(branchId);
  const { units } = useUnits(tenantId);
  const { currency, number } = useFormatters();

  const canAdd = isAdmin || hasPermission('inventory.add');
  const canEdit = isAdmin || hasPermission('inventory.edit');
  const canDelete = isAdmin || hasPermission('inventory.delete');
  const canAdjust = isAdmin || hasPermission('inventory.adjust');
  const canCount = isAdmin || hasPermission('inventory.count');

  const [searchQuery, setSearchQuery] = useState('');
  const [categoryFilter, setCategoryFilter] = useState('all');
  const [statusFilter, setStatusFilter] = useState('all');

  const [selectedItems, setSelectedItems] = useState<string[]>([]);
  const [selectedMovements, setSelectedMovements] = useState<string[]>([]);

  const [showAddDialog, setShowAddDialog] = useState(false);
  const [showEditDialog, setShowEditDialog] = useState<any>(null);
  const [showMovementDialog, setShowMovementDialog] = useState(false);
  const [editingMovement, setEditingMovement] = useState<any>(null);
  const [quickStock, setQuickStock] = useState<{ id: string, type: 'in' | 'out', name: string } | null>(null);
  const [quickQty, setQuickQty] = useState('');

  const [form, setForm] = useState({ name: '', name_en: '', sku: '', category: '', unit_id: '', cost_per_unit: 0, min_stock_level: 0, max_stock_level: 100, initial_quantity: 0 });
  const [movForm, setMovForm] = useState({ item_id: '', movement_type: 'purchase', quantity: 0, reason: '', notes: '' });

  // Merge items with stock
  const itemsWithStock = items.map((item: any) => {
    const s = stock.find((st: any) => st.item_id === item.id);
    return { ...item, quantity: s ? Number(s.quantity) : 0 };
  });

  const categories = Array.from(new Set(itemsWithStock.map((i: any) => i.category).filter(Boolean)));

  const filteredItems = itemsWithStock.filter((item: any) => {
    const matchesSearch = item.name.includes(searchQuery) || item.sku?.includes(searchQuery);
    const matchesCategory = categoryFilter === 'all' || item.category === categoryFilter;
    const qty = item.quantity;
    const minStr = Number(item.min_stock_level || 0);
    const matchesStatus = statusFilter === 'all' || 
                          (statusFilter === 'out' && qty === 0) ||
                          (statusFilter === 'low' && qty > 0 && qty < minStr) ||
                          (statusFilter === 'normal' && qty >= minStr);
    return matchesSearch && matchesCategory && matchesStatus;
  });

  const lowStockCount = itemsWithStock.filter((i: any) => i.quantity < Number(i.min_stock_level || 0) && i.quantity > 0).length;
  const outOfStockCount = itemsWithStock.filter((i: any) => i.quantity === 0).length;
  const totalValue = itemsWithStock.reduce((sum: number, i: any) => sum + (i.quantity * Number(i.cost_per_unit || 0)), 0);

  const getStockStatus = (quantity: number, minStock: number, maxStock: number) => {
    if (quantity === 0) return { label: 'نفذ', color: 'bg-red-100 text-red-700 dark:bg-red-950/50 dark:text-red-400', value: 'out' };
    if (quantity < minStock) return { label: 'منخفض', color: 'bg-amber-100 text-amber-700 dark:bg-amber-950/50 dark:text-amber-400', value: 'low' };
    return { label: 'طبيعي', color: 'bg-emerald-100 text-emerald-700 dark:bg-emerald-950/50 dark:text-emerald-400', value: 'normal' };
  };

  // --- Analytics Data Preparation ---
  const inventoryByCategory = categories.map((cat: any) => ({
    name: cat || 'عام',
    value: itemsWithStock.filter((i: any) => i.category === cat).reduce((sum: number, i: any) => sum + (i.quantity * Number(i.cost_per_unit || 0)), 0)
  })).filter(c => c.value > 0).sort((a, b) => b.value - a.value);

  const lowestStockItems = itemsWithStock
    .filter((i: any) => Number(i.min_stock_level) > 0)
    .map((i: any) => ({
      name: i.name,
      quantity: i.quantity,
      min: Number(i.min_stock_level),
      ratio: i.quantity / Number(i.min_stock_level)
    }))
    .sort((a: any, b: any) => a.ratio - b.ratio)
    .slice(0, 5);
  // ----------------------------------

  const handleBulkDeleteItems = async () => {
    if (!window.confirm(`هل أنت متأكد من حذف ${selectedItems.length} صنف؟`)) return;
    for (const id of selectedItems) {
      await removeItem(id);
    }
    setSelectedItems([]);
  };

  const handleBulkDeleteMovements = async () => {
    if (!window.confirm(`هل أنت متأكد من حذف ${selectedMovements.length} حركة؟ سيتم عكس تأثيرها على المخزون.`)) return;
    for (const id of selectedMovements) {
      const mov = movements.find((m: any) => m.id === id);
      if (mov) await deleteMovement(id, mov.item_id, mov.quantity);
    }
    setSelectedMovements([]);
    refreshStock();
  };

  const handleAddItem = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.name) { toast.error('يرجى إدخال اسم الصنف'); return; }
    const newItemId = await addItem({ ...form, cost_per_unit: Number(form.cost_per_unit), min_stock_level: Number(form.min_stock_level), max_stock_level: Number(form.max_stock_level), unit_id: form.unit_id || null });
    if (newItemId) {
      if (Number(form.initial_quantity) > 0) {
        await initStock(newItemId, Number(form.initial_quantity));
      }
      setShowAddDialog(false);
      setForm({ name: '', name_en: '', sku: '', category: '', unit_id: '', cost_per_unit: 0, min_stock_level: 0, max_stock_level: 100, initial_quantity: 0 });
    }
  };

  const handleUpdateItem = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!showEditDialog) return;
    await updateItem(showEditDialog.id, { name: showEditDialog.name, name_en: showEditDialog.name_en, sku: showEditDialog.sku, category: showEditDialog.category, unit_id: showEditDialog.unit_id || null, cost_per_unit: Number(showEditDialog.cost_per_unit), min_stock_level: Number(showEditDialog.min_stock_level), max_stock_level: Number(showEditDialog.max_stock_level) });
    setShowEditDialog(null);
  };

  const handleAddMovement = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!movForm.item_id || !movForm.quantity) { toast.error('يرجى ملء الحقول المطلوبة'); return; }
    if (movForm.movement_type === 'waste' && !movForm.reason) { toast.error('يرجى اختيار سبب الهالك'); return; }
    const qty = ['consumption', 'waste', 'adjustment_out'].includes(movForm.movement_type) ? -Math.abs(movForm.quantity) : Math.abs(movForm.quantity);
    const success = await addMovement({ item_id: movForm.item_id, movement_type: movForm.movement_type as any, quantity: qty, reason: movForm.movement_type === 'waste' ? movForm.reason : undefined, notes: movForm.notes });
    if (success) { setShowMovementDialog(false); setMovForm({ item_id: '', movement_type: 'purchase', quantity: 0, reason: '', notes: '' }); refreshStock(); }
  };

  const handleUpdateMovement = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingMovement || !editingMovement.item_id || !editingMovement.quantity) { toast.error('يرجى ملء الحقول المطلوبة'); return; }
    if (editingMovement.movement_type === 'waste' && !editingMovement.reason) { toast.error('يرجى اختيار سبب الهالك'); return; }
    
    const qty = ['consumption', 'waste', 'adjustment_out'].includes(editingMovement.movement_type) ? -Math.abs(editingMovement.quantity) : Math.abs(editingMovement.quantity);
    const success = await updateMovement(
      editingMovement.id, 
      editingMovement._original, 
      { ...editingMovement, quantity: qty, reason: editingMovement.movement_type === 'waste' ? editingMovement.reason : undefined }
    );
    if (success) { setEditingMovement(null); refreshStock(); }
  };

  const handleQuickStock = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!quickStock || !quickQty || Number(quickQty) <= 0) return;
    const qty = quickStock.type === 'in' ? Number(quickQty) : -Number(quickQty);
    const mType = quickStock.type === 'in' ? 'purchase' : 'consumption';
    const success = await addMovement({ item_id: quickStock.id, movement_type: mType, quantity: qty, notes: 'تسجيل سريع' });
    if (success) {
      setQuickStock(null);
      setQuickQty('');
      refreshStock();
    }
  };

  const handleExportCSV = () => {
    const headers = ['الصنف', 'SKU', 'الفئة', 'الكمية', 'التكلفة للوحدة', 'القيمة الإجمالية'];
    const csvData = filteredItems.map((i: any) => [i.name, i.sku || '', i.category || '', i.quantity, i.cost_per_unit || 0, i.quantity * (i.cost_per_unit || 0)]);
    const csvContent = [headers, ...csvData].map(e => e.join(',')).join('\n');
    const blob = new Blob(['\uFEFF' + csvContent], { type: 'text/csv;charset=utf-8;' });
    const link = document.createElement('a');
    link.href = URL.createObjectURL(blob);
    link.download = `inventory_${new Date().toISOString().split('T')[0]}.csv`;
    link.click();
  };

  return (
    <MainLayout title="المخزون" subtitle="إدارة المخزون والمواد الخام وتتبع الحركات المدخلة والمخرجة"
      actions={<div className="flex items-center gap-2">
        <Button variant="outline" onClick={handleExportCSV} className="gap-2 hidden md:flex"><FileDown className="w-4 h-4" /> تصدير CSV</Button>
        <Button variant="outline" onClick={() => window.print()} className="gap-2 hidden md:flex"><Printer className="w-4 h-4" /> طباعة</Button>
        {canAdd && <Button className="gap-2 shadow-lg" onClick={() => setShowAddDialog(true)}><Plus className="w-4 h-4" />إضافة صنف</Button>}
      </div>}>

      <motion.div 
        variants={{ hidden: { opacity: 0 }, show: { opacity: 1, transition: { staggerChildren: 0.1 } } }} 
        initial="hidden" animate="show" 
        className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 mb-6 print:hidden"
      >
        <motion.div variants={{ hidden: { opacity: 0, y: 20 }, show: { opacity: 1, y: 0 } }}>
          <Card className="bg-gradient-to-br from-blue-50 to-white dark:from-blue-950/20 dark:to-background border-blue-100 dark:border-blue-900/50 shadow-sm transition-all hover:shadow-md hover:-translate-y-1 duration-300">
            <CardContent className="p-6 flex items-center gap-4">
              <div className="p-4 bg-blue-100 dark:bg-blue-900/40 rounded-2xl text-blue-600 dark:text-blue-400 shadow-inner">
                <Package className="w-7 h-7" />
              </div>
              <div>
                <p className="text-sm font-semibold text-muted-foreground mb-1">إجمالي الأصناف</p>
                <h3 className="text-3xl font-black text-foreground">{number(items.length)}</h3>
              </div>
            </CardContent>
          </Card>
        </motion.div>

        <motion.div variants={{ hidden: { opacity: 0, y: 20 }, show: { opacity: 1, y: 0 } }}>
          <Card className="bg-gradient-to-br from-amber-50 to-white dark:from-amber-950/20 dark:to-background border-amber-100 dark:border-amber-900/50 shadow-sm transition-all hover:shadow-md hover:-translate-y-1 duration-300">
            <CardContent className="p-6 flex items-center gap-4">
              <div className="p-4 bg-amber-100 dark:bg-amber-900/40 rounded-2xl text-amber-600 dark:text-amber-400 shadow-inner">
                <AlertTriangle className="w-7 h-7" />
              </div>
              <div>
                <p className="text-sm font-semibold text-muted-foreground mb-1">أصناف منخفضة</p>
                <h3 className="text-3xl font-black text-foreground">{number(lowStockCount)}</h3>
              </div>
            </CardContent>
          </Card>
        </motion.div>

        <motion.div variants={{ hidden: { opacity: 0, y: 20 }, show: { opacity: 1, y: 0 } }}>
          <Card className="bg-gradient-to-br from-red-50 to-white dark:from-red-950/20 dark:to-background border-red-100 dark:border-red-900/50 shadow-sm transition-all hover:shadow-md hover:-translate-y-1 duration-300">
            <CardContent className="p-6 flex items-center gap-4">
              <div className="p-4 bg-red-100 dark:bg-red-900/40 rounded-2xl text-red-600 dark:text-red-400 shadow-inner">
                <XCircle className="w-7 h-7" />
              </div>
              <div>
                <p className="text-sm font-semibold text-muted-foreground mb-1">أصناف نفذت</p>
                <h3 className="text-3xl font-black text-foreground">{number(outOfStockCount)}</h3>
              </div>
            </CardContent>
          </Card>
        </motion.div>

        <motion.div variants={{ hidden: { opacity: 0, y: 20 }, show: { opacity: 1, y: 0 } }}>
          <Card className="bg-gradient-to-br from-emerald-50 to-white dark:from-emerald-950/20 dark:to-background border-emerald-100 dark:border-emerald-900/50 shadow-sm transition-all hover:shadow-md hover:-translate-y-1 duration-300">
            <CardContent className="p-6 flex items-center gap-4">
              <div className="p-4 bg-emerald-100 dark:bg-emerald-900/40 rounded-2xl text-emerald-600 dark:text-emerald-400 shadow-inner">
                <TrendingUp className="w-7 h-7" />
              </div>
              <div>
                <p className="text-sm font-semibold text-muted-foreground mb-1">قيمة المخزون</p>
                <h3 className="text-3xl font-black text-foreground">{currency(totalValue)}</h3>
              </div>
            </CardContent>
          </Card>
        </motion.div>
      </motion.div>

      {/* Analytics Section */}
      <motion.div 
        initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.3 }}
        className="grid grid-cols-1 lg:grid-cols-2 gap-6 mb-6 print:hidden"
      >
        <Card className="shadow-sm border-border/50">
          <CardHeader className="pb-2">
            <CardTitle className="text-lg flex items-center gap-2 text-muted-foreground">
              <PieChartIcon className="w-5 h-5" /> قيمة المخزون حسب الفئة
            </CardTitle>
          </CardHeader>
          <CardContent>
            {inventoryByCategory.length > 0 ? (
              <div className="h-[250px] w-full">
                <ResponsiveContainer width="100%" height="100%">
                  <PieChart>
                    <Pie data={inventoryByCategory} cx="50%" cy="50%" innerRadius={60} outerRadius={80} paddingAngle={5} dataKey="value">
                      {inventoryByCategory.map((entry, index) => (
                        <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
                      ))}
                    </Pie>
                    <RechartsTooltip formatter={(value: number) => currency(value)} contentStyle={{ borderRadius: '8px', border: 'none', boxShadow: '0 4px 6px -1px rgb(0 0 0 / 0.1)' }} />
                    <Legend verticalAlign="bottom" height={36} />
                  </PieChart>
                </ResponsiveContainer>
              </div>
            ) : (
              <div className="h-[250px] flex items-center justify-center text-muted-foreground">لا توجد بيانات كافية</div>
            )}
          </CardContent>
        </Card>

        <Card className="shadow-sm border-border/50">
          <CardHeader className="pb-2">
            <CardTitle className="text-lg flex items-center gap-2 text-muted-foreground">
              <BarChart3 className="w-5 h-5" /> الأصناف الأقل رصيداً
            </CardTitle>
          </CardHeader>
          <CardContent>
            {lowestStockItems.length > 0 ? (
              <div className="h-[250px] w-full">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={lowestStockItems} layout="vertical" margin={{ top: 5, right: 30, left: 20, bottom: 5 }}>
                    <XAxis type="number" />
                    <YAxis dataKey="name" type="category" width={80} tick={{ fontSize: 12 }} />
                    <RechartsTooltip formatter={(value: number) => number(value)} cursor={{ fill: 'rgba(0,0,0,0.05)' }} contentStyle={{ borderRadius: '8px', border: 'none', boxShadow: '0 4px 6px -1px rgb(0 0 0 / 0.1)' }} />
                    <Bar dataKey="quantity" name="الكمية الحالية" radius={[0, 4, 4, 0]}>
                      {lowestStockItems.map((entry: any, index: number) => (
                        <Cell key={`cell-${index}`} fill={entry.ratio < 0.5 ? '#ef4444' : entry.ratio < 1 ? '#f59e0b' : '#10b981'} />
                      ))}
                    </Bar>
                  </BarChart>
                </ResponsiveContainer>
              </div>
            ) : (
              <div className="h-[250px] flex items-center justify-center text-muted-foreground">الرصيد ممتاز لجميع الأصناف</div>
            )}
          </CardContent>
        </Card>
      </motion.div>

      <Tabs defaultValue="items" className="space-y-6">
        <div className="flex items-center justify-between border-b pb-0 print:hidden">
          <TabsList className="bg-transparent h-auto p-0 gap-6">
            <TabsTrigger value="items" className="px-2 py-3 data-[state=active]:bg-transparent data-[state=active]:shadow-none data-[state=active]:border-b-2 data-[state=active]:border-primary rounded-none font-bold text-base transition-all duration-300">قائمة المخزون</TabsTrigger>
            <TabsTrigger value="movements" className="px-2 py-3 data-[state=active]:bg-transparent data-[state=active]:shadow-none data-[state=active]:border-b-2 data-[state=active]:border-primary rounded-none font-bold text-base transition-all duration-300">سجل الحركات</TabsTrigger>
            {canCount && <TabsTrigger value="reconciliation" className="px-2 py-3 data-[state=active]:bg-transparent data-[state=active]:shadow-none data-[state=active]:border-b-2 data-[state=active]:border-primary rounded-none font-bold text-base transition-all duration-300">جرد المخزون</TabsTrigger>}
            <TabsTrigger value="recommendations" className="px-2 py-3 data-[state=active]:bg-transparent data-[state=active]:shadow-none data-[state=active]:border-b-2 data-[state=active]:border-primary rounded-none font-bold text-base transition-all duration-300">نواقص المخزون</TabsTrigger>
          </TabsList>
        </div>

        <TabsContent value="items" className="space-y-4">
          <Card className="border-0 shadow-sm ring-1 ring-border/50">
            <CardHeader className="px-6 py-5 border-b bg-card">
              <div className="flex flex-col lg:flex-row gap-4 justify-between items-start lg:items-center">
                <CardTitle className="text-xl font-bold flex items-center gap-2"><Package className="w-6 h-6 text-primary" /> الأصناف المخزنة</CardTitle>
                <div className="flex flex-col sm:flex-row items-center gap-3 w-full lg:w-auto">
                  {selectedItems.length > 0 && (
                    <Button onClick={handleBulkDeleteItems} variant="destructive" className="gap-2 shrink-0 md:mr-auto">
                      <Trash2 className="w-4 h-4" />
                      حذف ({selectedItems.length})
                    </Button>
                  )}
                  <div className="relative flex-1 sm:w-[300px]">
                    <Search className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                    <Input placeholder="بحث بالاسم أو الكود (SKU)..." value={searchQuery} onChange={(e) => setSearchQuery(e.target.value)} className="pr-10 bg-muted/30 focus-visible:ring-1 focus-visible:bg-transparent transition-all" />
                  </div>
                  <Select value={categoryFilter} onValueChange={setCategoryFilter}>
                    <SelectTrigger className="w-full sm:w-[160px] bg-muted/30 focus:ring-1"><SelectValue placeholder="الفئة" /></SelectTrigger>
                    <SelectContent><SelectItem value="all">جميع الفئات</SelectItem>{categories.map((c: any) => <SelectItem key={c} value={c}>{c}</SelectItem>)}</SelectContent>
                  </Select>
                  <Select value={statusFilter} onValueChange={setStatusFilter}>
                    <SelectTrigger className="w-full sm:w-[160px] bg-muted/30 focus:ring-1"><SelectValue placeholder="الحالة" /></SelectTrigger>
                    <SelectContent><SelectItem value="all">كل الحالات</SelectItem><SelectItem value="normal">طبيعي</SelectItem><SelectItem value="low">منخفض</SelectItem><SelectItem value="out">نفذ</SelectItem></SelectContent>
                  </Select>
                </div>
              </div>
            </CardHeader>
            <div className="overflow-x-auto">
              {filteredItems.length === 0 ? (
                <div className="text-center py-16 text-muted-foreground"><Package className="w-16 h-16 mx-auto mb-4 opacity-20" /><p className="text-lg">لا توجد أصناف تطابق بحثك</p></div>
              ) : (
                <Table>
                  <TableHeader><TableRow className="bg-muted/10 hover:bg-muted/10">
                    <TableHead className="w-[40px] pl-0 pr-4">
                      <Checkbox
                        checked={filteredItems.length > 0 && selectedItems.length === filteredItems.length}
                        onCheckedChange={(c) => {
                          if (c) setSelectedItems(filteredItems.map(i => i.id));
                          else setSelectedItems([]);
                        }}
                      />
                    </TableHead>
                    <TableHead>الصنف</TableHead><TableHead className="hidden md:table-cell">الفئة</TableHead><TableHead>الكمية الحالية</TableHead><TableHead className="hidden md:table-cell">تكلفة الوحدة</TableHead><TableHead>القيمة</TableHead><TableHead>الحالة</TableHead><TableHead className="text-left print:hidden w-[80px]">إجراء</TableHead></TableRow></TableHeader>
                  <TableBody>
                    {filteredItems.map((item: any) => {
                      const status = getStockStatus(item.quantity, Number(item.min_stock_level || 0), Number(item.max_stock_level || 100));
                      const unit = units.find((u: any) => u.id === item.unit_id)?.abbreviation || '';
                      const StatusIcon = status.label === 'طبيعي' ? CheckCircle2 : status.label === 'منخفض' ? AlertTriangle : XCircle;

                      return (
                        <TableRow key={item.id} className="group hover:bg-muted/30 transition-colors duration-200">
                          <TableCell className="pl-0 pr-4">
                            <div onClick={e => e.stopPropagation()}>
                              <Checkbox 
                                checked={selectedItems.includes(item.id)}
                                onCheckedChange={(c) => {
                                  if (c) setSelectedItems(prev => [...prev, item.id]);
                                  else setSelectedItems(prev => prev.filter(id => id !== item.id));
                                }}
                              />
                            </div>
                          </TableCell>
                          <TableCell>
                            <div className="flex items-center gap-3">
                              <div className="w-10 h-10 rounded-full bg-primary/10 flex items-center justify-center text-primary font-bold shadow-sm shrink-0">
                                {item.name.charAt(0).toUpperCase()}
                              </div>
                              <div>
                                <p className="font-bold text-base">{item.name}</p>
                                <p className="text-xs text-muted-foreground hidden md:block">{item.sku || 'بدون كود'}</p>
                              </div>
                            </div>
                          </TableCell>
                          <TableCell className="hidden md:table-cell"><Badge variant="outline" className="font-medium bg-muted/50 border-muted-foreground/20">{item.category || 'عام'}</Badge></TableCell>
                          <TableCell>
                            <div className="flex flex-col gap-1.5 w-[120px]">
                              <div className="flex items-baseline justify-between">
                                <span className="text-xl font-black">{number(item.quantity)}</span> 
                                <span className="text-muted-foreground text-sm font-medium whitespace-nowrap">{unit}</span>
                              </div>
                              <Progress 
                                value={Math.min((item.quantity / Math.max(Number(item.max_stock_level) || 100, 1)) * 100, 100)} 
                                className={cn("h-1.5", status.value === 'low' ? 'bg-amber-100' : status.value === 'out' ? 'bg-red-100' : 'bg-emerald-100')}
                                indicatorClassName={cn(status.value === 'low' ? 'bg-amber-500' : status.value === 'out' ? 'bg-red-500' : 'bg-emerald-500')}
                              />
                            </div>
                          </TableCell>
                          <TableCell className="hidden md:table-cell text-muted-foreground font-medium">{currency(Number(item.cost_per_unit || 0))}</TableCell>
                          <TableCell className="font-bold text-foreground">{currency(item.quantity * Number(item.cost_per_unit || 0))}</TableCell>
                          <TableCell>
                            <Badge variant="outline" className={cn('gap-1 font-bold border-0 px-2.5 py-1', status.color)}>
                              <StatusIcon className="w-3.5 h-3.5" />
                              {status.label}
                            </Badge>
                          </TableCell>
                          <TableCell className="text-left py-2 pr-0 print:hidden text-left">
                            <DropdownMenu>
                              <DropdownMenuTrigger asChild>
                                <Button variant="ghost" className="h-9 w-9 p-0 opacity-50 data-[state=open]:opacity-100 group-hover:opacity-100 transition-opacity float-left">
                                  <span className="sr-only">فتح القائمة</span>
                                  <MoreHorizontal className="h-5 w-5" />
                                </Button>
                              </DropdownMenuTrigger>
                              <DropdownMenuContent align="end" className="w-[200px] shadow-lg">
                                <DropdownMenuLabel className="font-bold">الإجراءات</DropdownMenuLabel>
                                <DropdownMenuSeparator />
                                {canAdjust && (
                                  <>
                                    <DropdownMenuItem onClick={() => { setQuickStock({ id: item.id, type: 'in', name: item.name }); setQuickQty(''); }} className="gap-2 focus:bg-emerald-50 focus:text-emerald-600 dark:focus:bg-emerald-950 dark:focus:text-emerald-400 cursor-pointer transition-colors">
                                      <ArrowDownToLine className="w-4 h-4" /> إضافة رصيد سريع
                                    </DropdownMenuItem>
                                    <DropdownMenuItem onClick={() => { setQuickStock({ id: item.id, type: 'out', name: item.name }); setQuickQty(''); }} className="gap-2 focus:bg-red-50 focus:text-red-600 dark:focus:bg-red-950 dark:focus:text-red-400 cursor-pointer transition-colors">
                                      <ArrowUpToLine className="w-4 h-4" /> صرف رصيد سريع
                                    </DropdownMenuItem>
                                    <DropdownMenuItem onClick={() => { setMovForm(f => ({ ...f, item_id: item.id })); setShowMovementDialog(true); }} className="gap-2 cursor-pointer transition-colors">
                                      <ArrowDownRight className="w-4 h-4 text-blue-500" /> إضافة حركة مخزون
                                    </DropdownMenuItem>
                                    <DropdownMenuSeparator />
                                  </>
                                )}
                                {canEdit && (
                                  <DropdownMenuItem onClick={() => setShowEditDialog(item)} className="gap-2 cursor-pointer transition-colors">
                                    <Edit className="w-4 h-4" /> تعديل بيانات الصنف
                                  </DropdownMenuItem>
                                )}
                                {canDelete && (
                                  <DropdownMenuItem onClick={async () => { if (confirm('هل أنت متأكد من حذف هذا الصنف؟')) { await removeItem(item.id); } }} className="gap-2 focus:bg-destructive focus:text-destructive-foreground cursor-pointer text-destructive transition-colors">
                                    <Trash2 className="w-4 h-4" /> حذف الصنف
                                  </DropdownMenuItem>
                                )}
                              </DropdownMenuContent>
                            </DropdownMenu>
                          </TableCell>
                        </TableRow>
                      );
                    })}
                  </TableBody>
                </Table>
              )}
            </div>
          </Card>
        </TabsContent>

        <TabsContent value="movements" className="space-y-4">
          <Card className="border-0 shadow-sm ring-1 ring-border/50">
            <CardHeader className="px-6 py-5 border-b bg-card">
              <div className="flex gap-4 justify-between items-start md:items-center flex-col md:flex-row">
                <CardTitle className="text-xl font-bold flex items-center gap-2"><History className="w-6 h-6 text-primary" /> سجل حركات المخزون</CardTitle>
                <div className="flex gap-2 w-full md:w-auto">
                  {selectedMovements.length > 0 && (
                     <Button onClick={handleBulkDeleteMovements} variant="destructive" className="gap-2 shrink-0 md:mr-auto">
                       <Trash2 className="w-4 h-4" />
                       حذف ({selectedMovements.length})
                     </Button>
                  )}
                  <Button className="gap-2 shadow-sm w-full md:w-auto" onClick={() => setShowMovementDialog(true)}><Plus className="w-4 h-4" />حركة يدوية</Button>
                </div>
              </div>
            </CardHeader>
            <div className="overflow-x-auto">
              {movements.length === 0 ? (
                <div className="text-center py-16 text-muted-foreground"><History className="w-16 h-16 mx-auto mb-4 opacity-20" /><p className="text-lg">لا توجد حركات مخزون مسجلة</p></div>
              ) : (
                <Table>
                  <TableHeader><TableRow className="bg-muted/10 hover:bg-muted/10">
                    <TableHead className="w-[40px] pl-0 pr-4">
                      <Checkbox
                        checked={movements.length > 0 && selectedMovements.length === movements.length}
                        onCheckedChange={(c) => {
                          if (c) setSelectedMovements(movements.map((m: any) => m.id));
                          else setSelectedMovements([]);
                        }}
                      />
                    </TableHead>
                    <TableHead>الصنف</TableHead><TableHead>النوع</TableHead><TableHead>الكمية</TableHead><TableHead className="hidden md:table-cell">التاريخ</TableHead><TableHead className="hidden md:table-cell">ملاحظات</TableHead><TableHead className="text-left print:hidden w-[100px]">إجراء</TableHead></TableRow></TableHeader>
                  <TableBody>
                    {movements.map((mov: any) => {
                      const itemName = items.find((i: any) => i.id === mov.item_id)?.name || '-';
                      const isPositive = Number(mov.quantity) > 0;
                      return (
                        <TableRow key={mov.id} className="group hover:bg-muted/30 transition-colors duration-200">
                          <TableCell className="pl-0 pr-4">
                            <div onClick={e => e.stopPropagation()}>
                              <Checkbox 
                                checked={selectedMovements.includes(mov.id)}
                                onCheckedChange={(c) => {
                                  if (c) setSelectedMovements(prev => [...prev, mov.id]);
                                  else setSelectedMovements(prev => prev.filter(id => id !== mov.id));
                                }}
                              />
                            </div>
                          </TableCell>
                          <TableCell className="font-bold text-base">{itemName}</TableCell>
                          <TableCell>
                            <Badge variant="outline" className={cn("px-2.5 py-1 font-bold border-0", isPositive ? "bg-emerald-100 text-emerald-700 dark:bg-emerald-950/50 dark:text-emerald-400" : "bg-red-100 text-red-700 dark:bg-red-950/50 dark:text-red-400")}>
                              {mov.movement_type === 'purchase' ? 'شراء' : mov.movement_type === 'consumption' ? 'استهلاك' : mov.movement_type === 'waste' ? 'هالك' : mov.movement_type === 'adjustment_in' ? 'تسوية بزيادة' : mov.movement_type === 'adjustment_out' ? 'تسوية بنقصان' : mov.movement_type}
                            </Badge>
                          </TableCell>
                          <TableCell><span className={cn('font-black text-lg', isPositive ? 'text-emerald-600 dark:text-emerald-400' : 'text-red-600 dark:text-red-400')} dir="ltr">{isPositive ? '+' : ''}{number(Number(mov.quantity))}</span></TableCell>
                          <TableCell className="text-muted-foreground font-medium hidden md:table-cell">{new Date(mov.created_at).toLocaleString('ar-EG', { dateStyle: 'medium', timeStyle: 'short' })}</TableCell>
                          <TableCell className="hidden md:table-cell text-muted-foreground"><span className="truncate block max-w-[200px]">{mov.notes || '-'}</span></TableCell>
                          <TableCell className="text-left py-2 pr-0 print:hidden text-left">
                            <DropdownMenu>
                              <DropdownMenuTrigger asChild>
                                <Button variant="ghost" className="h-9 w-9 p-0 opacity-50 data-[state=open]:opacity-100 group-hover:opacity-100 transition-opacity float-left">
                                  <span className="sr-only">فتح القائمة</span>
                                  <MoreHorizontal className="h-5 w-5" />
                                </Button>
                              </DropdownMenuTrigger>
                              <DropdownMenuContent align="end" className="w-[160px] shadow-lg">
                                <DropdownMenuLabel className="font-bold">خيارات الحركة</DropdownMenuLabel>
                                <DropdownMenuSeparator />
                                {canEdit && (
                                  <DropdownMenuItem onClick={() => setEditingMovement({ ...mov, quantity: Math.abs(mov.quantity), _original: mov })} className="gap-2 cursor-pointer transition-colors">
                                    <Edit className="w-4 h-4" /> تعديل الحركة
                                  </DropdownMenuItem>
                                )}
                                {canDelete && (
                                  <DropdownMenuItem onClick={async () => { if (confirm('هل أنت متأكد من حذف هذه الحركة؟ سيتم عكس تأثيرها على المخزون.')) { await deleteMovement(mov.id, mov.item_id, mov.quantity); refreshStock(); } }} className="gap-2 focus:bg-destructive focus:text-destructive-foreground cursor-pointer text-destructive transition-colors">
                                    <Trash2 className="w-4 h-4" /> التراجع وحذف الحركة
                                  </DropdownMenuItem>
                                )}
                              </DropdownMenuContent>
                            </DropdownMenu>
                          </TableCell>
                        </TableRow>
                      );
                    })}
                  </TableBody>
                </Table>
              )}
            </div>
          </Card>
        </TabsContent>

        {canCount && (
          <TabsContent value="reconciliation" className="space-y-4">
            <Card className="border-0 shadow-sm ring-1 ring-border/50">
              <CardHeader className="px-6 py-5 border-b bg-card">
                <div className="flex justify-between items-center">
                  <CardTitle className="text-xl font-bold flex items-center gap-2"><CheckCircle2 className="w-6 h-6 text-primary" /> جرد وتحديث المخزون الفعلي</CardTitle>
                </div>
              </CardHeader>
              <CardContent className="p-0">
                <div className="overflow-x-auto">
                  {itemsWithStock.length === 0 ? (
                    <div className="text-center py-16 text-muted-foreground"><CheckCircle2 className="w-16 h-16 mx-auto mb-4 opacity-20" /><p className="text-lg">لا توجد أصناف لجردها</p></div>
                  ) : (
                    <Table>
                      <TableHeader><TableRow className="bg-muted/10 hover:bg-muted/10"><TableHead>الصنف</TableHead><TableHead>الرصيد الدفتري</TableHead><TableHead>الرصيد الفعلي</TableHead><TableHead>الفارق</TableHead><TableHead className="w-[120px]">إجراء</TableHead></TableRow></TableHeader>
                      <TableBody>
                        {itemsWithStock.map((item: any) => (
                          <ReconciliationRow key={item.id} item={item} addMovement={addMovement} refreshStock={refreshStock} formatNumber={number} canCount={canCount} />
                        ))}
                      </TableBody>
                    </Table>
                  )}
                </div>
              </CardContent>
            </Card>
          </TabsContent>
        )}

        <TabsContent value="recommendations" className="space-y-4">
          <Card className="border-0 shadow-sm ring-1 ring-border/50">
            <CardHeader className="px-6 py-5 border-b bg-amber-50/50 dark:bg-amber-950/20">
              <div className="flex flex-col lg:flex-row gap-4 justify-between items-start lg:items-center">
                <div>
                  <CardTitle className="text-xl font-bold flex items-center gap-2 text-amber-700 dark:text-amber-500">
                    <AlertTriangle className="w-6 h-6" /> نواقص المخزون وتوصيات الطلب
                  </CardTitle>
                  <CardDescription className="mt-1">
                    أصناف وصلت للحد الأدنى أو نفذت وتحتاج إلى إعادة طلب من الموردين
                  </CardDescription>
                </div>
                <Button className="bg-amber-600 hover:bg-amber-700 text-white gap-2 shadow-sm">
                  <Printer className="w-4 h-4" /> طباعة تقرير النواقص
                </Button>
              </div>
            </CardHeader>
            <div className="overflow-x-auto">
              {itemsWithStock.filter((i: any) => i.quantity <= Number(i.min_stock_level || 0)).length === 0 ? (
                <div className="text-center py-16 text-muted-foreground">
                  <CheckCircle2 className="w-16 h-16 mx-auto mb-4 opacity-20 text-emerald-500" />
                  <p className="text-lg">جميع الأصناف متوفرة بمستويات آمنة</p>
                </div>
              ) : (
                <Table>
                  <TableHeader>
                    <TableRow className="bg-muted/10">
                      <TableHead>الصنف</TableHead>
                      <TableHead>الكمية الحالية</TableHead>
                      <TableHead>الحد الأدنى</TableHead>
                      <TableHead>الكمية المقترحة للطلب</TableHead>
                      <TableHead>التكلفة التقديرية</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {itemsWithStock
                      .filter((i: any) => i.quantity <= Number(i.min_stock_level || 0))
                      .map((item: any) => {
                        const unit = units.find((u: any) => u.id === item.unit_id)?.abbreviation || '';
                        const suggestedOrder = Math.max(0, Number(item.max_stock_level || 0) - item.quantity);
                        const estCost = suggestedOrder * Number(item.cost_per_unit || 0);
                        
                        return (
                          <TableRow key={`rec-${item.id}`} className="hover:bg-amber-50/30 dark:hover:bg-amber-900/10">
                            <TableCell className="font-bold">
                              {item.name}
                              <div className="text-xs text-muted-foreground mt-0.5">{item.category || 'عام'}</div>
                            </TableCell>
                            <TableCell>
                              <span className={cn("font-bold", item.quantity === 0 ? "text-red-500" : "text-amber-500")}>
                                {number(item.quantity)} {unit}
                              </span>
                            </TableCell>
                            <TableCell className="text-muted-foreground">{number(Number(item.min_stock_level))} {unit}</TableCell>
                            <TableCell>
                              <Badge variant="outline" className="bg-emerald-50 text-emerald-700 border-emerald-200 dark:bg-emerald-950/50 dark:text-emerald-400 dark:border-emerald-800">
                                +{number(suggestedOrder)} {unit}
                              </Badge>
                            </TableCell>
                            <TableCell className="font-bold">{currency(estCost)}</TableCell>
                          </TableRow>
                        );
                      })}
                  </TableBody>
                </Table>
              )}
            </div>
          </Card>
        </TabsContent>
      </Tabs>

      {/* Add/Edit Item Dialog from Previous Implementation modified slightly */}
      <Dialog open={showAddDialog} onOpenChange={setShowAddDialog}>
        <DialogContent className="max-w-[95vw] md:max-w-lg max-h-[90dvh] overflow-y-auto"><DialogHeader><DialogTitle>إضافة صنف جديد</DialogTitle></DialogHeader>
          <form onSubmit={handleAddItem} className="grid gap-4 py-4">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4"><div className="space-y-2"><Label>اسم الصنف *</Label><Input value={form.name} onChange={e => setForm(f => ({ ...f, name: e.target.value }))} required /></div><div className="space-y-2"><Label>SKU</Label><Input value={form.sku} onChange={e => setForm(f => ({ ...f, sku: e.target.value }))} /></div></div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div className="space-y-2"><Label>الفئة</Label><Input value={form.category} onChange={e => setForm(f => ({ ...f, category: e.target.value }))} placeholder="لحوم, خضار..." /></div>
              <div className="space-y-2"><Label>الوحدة</Label><Select value={form.unit_id || undefined} onValueChange={v => setForm(f => ({ ...f, unit_id: v }))}><SelectTrigger><SelectValue placeholder={units.length === 0 ? "يرجى إضافة وحدات أولاً" : "اختر"} /></SelectTrigger><SelectContent>{units.map((u: any) => <SelectItem key={u.id} value={u.id}>{u.name}</SelectItem>)}</SelectContent></Select></div>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div className="space-y-2"><Label>الكمية الأولية</Label><Input type="number" min="0" step="any" value={form.initial_quantity} onChange={e => setForm(f => ({ ...f, initial_quantity: e.target.value as any }))} /></div>
              <div className="space-y-2"><Label>التكلفة للوحدة</Label><Input type="number" min="0" step="any" value={form.cost_per_unit} onChange={e => setForm(f => ({ ...f, cost_per_unit: e.target.value as any }))} /></div>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4"><div className="space-y-2"><Label>الحد الأدنى</Label><Input type="number" min="0" step="any" value={form.min_stock_level} onChange={e => setForm(f => ({ ...f, min_stock_level: e.target.value as any }))} /></div><div className="space-y-2"><Label>الحد الأقصى</Label><Input type="number" min="0" step="any" value={form.max_stock_level} onChange={e => setForm(f => ({ ...f, max_stock_level: e.target.value as any }))} /></div></div>
            <div className="flex justify-end gap-2"><Button type="button" variant="outline" onClick={() => setShowAddDialog(false)}>إلغاء</Button><Button type="submit">حفظ</Button></div>
          </form>
        </DialogContent>
      </Dialog>

      <Dialog open={!!showEditDialog} onOpenChange={() => setShowEditDialog(null)}>
        <DialogContent className="max-w-[95vw] md:max-w-lg max-h-[90dvh] overflow-y-auto"><DialogHeader><DialogTitle>تعديل الصنف</DialogTitle></DialogHeader>
          {showEditDialog && (
            <form onSubmit={handleUpdateItem} className="grid gap-4 py-4">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4"><div className="space-y-2"><Label>اسم الصنف</Label><Input value={showEditDialog.name} onChange={e => setShowEditDialog((s: any) => ({ ...s, name: e.target.value }))} /></div><div className="space-y-2"><Label>SKU</Label><Input value={showEditDialog.sku || ''} onChange={e => setShowEditDialog((s: any) => ({ ...s, sku: e.target.value }))} /></div></div>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div className="space-y-2"><Label>الفئة</Label><Input value={showEditDialog.category || ''} onChange={e => setShowEditDialog((s: any) => ({ ...s, category: e.target.value }))} /></div>
                <div className="space-y-2"><Label>الوحدة</Label><Select value={showEditDialog.unit_id || undefined} onValueChange={v => setShowEditDialog((s: any) => ({ ...s, unit_id: v }))}><SelectTrigger><SelectValue placeholder={units.length === 0 ? "يرجى إضافة وحدات أولاً" : "اختر"} /></SelectTrigger><SelectContent>{units.map((u: any) => <SelectItem key={u.id} value={u.id}>{u.name}</SelectItem>)}</SelectContent></Select></div>
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                <div className="space-y-2"><Label>التكلفة</Label><Input type="number" min="0" step="any" value={showEditDialog.cost_per_unit} onChange={e => setShowEditDialog((s: any) => ({ ...s, cost_per_unit: e.target.value }))} /></div>
                <div className="space-y-2"><Label>الحد الأدنى</Label><Input type="number" min="0" step="any" value={showEditDialog.min_stock_level} onChange={e => setShowEditDialog((s: any) => ({ ...s, min_stock_level: e.target.value }))} /></div>
                <div className="space-y-2"><Label>الحد الأقصى</Label><Input type="number" min="0" step="any" value={showEditDialog.max_stock_level} onChange={e => setShowEditDialog((s: any) => ({ ...s, max_stock_level: e.target.value }))} /></div>
              </div>
              <div className="flex justify-end gap-2"><Button type="button" variant="outline" onClick={() => setShowEditDialog(null)}>إلغاء</Button><Button type="submit">حفظ</Button></div>
            </form>
          )}
        </DialogContent>
      </Dialog>

      <Dialog open={showMovementDialog} onOpenChange={setShowMovementDialog}>
        <DialogContent className="max-w-[95vw] md:max-w-lg max-h-[90dvh] overflow-y-auto"><DialogHeader><DialogTitle>إضافة حركة مخزون</DialogTitle></DialogHeader>
          <form onSubmit={handleAddMovement} className="grid gap-4 py-4">
            <div className="space-y-2"><Label>الصنف *</Label><Select value={movForm.item_id} onValueChange={v => setMovForm(f => ({ ...f, item_id: v }))}><SelectTrigger><SelectValue placeholder="اختر الصنف" /></SelectTrigger><SelectContent>{items.map((i: any) => <SelectItem key={i.id} value={i.id}>{i.name}</SelectItem>)}</SelectContent></Select></div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div className="space-y-2"><Label>نوع الحركة</Label><Select value={movForm.movement_type} onValueChange={v => setMovForm(f => ({ ...f, movement_type: v, reason: v === 'waste' ? 'spoilage' : '' }))}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent><SelectItem value="purchase">شراء (إضافة)</SelectItem><SelectItem value="consumption">استهلاك (خصم)</SelectItem><SelectItem value="waste">هالك (خصم)</SelectItem><SelectItem value="adjustment_in">تسوية إضافة</SelectItem><SelectItem value="adjustment_out">تسوية خصم</SelectItem></SelectContent></Select></div>
              <div className="space-y-2"><Label>الكمية *</Label><Input type="number" min={0} step="any" value={movForm.quantity} onChange={e => setMovForm(f => ({ ...f, quantity: e.target.value as any }))} required /></div>
            </div>
            {movForm.movement_type === 'waste' && (
              <div className="space-y-2">
                <Label>السبب *</Label>
                <Select value={movForm.reason || 'spoilage'} onValueChange={v => setMovForm(f => ({ ...f, reason: v }))}>
                  <SelectTrigger><SelectValue placeholder="اختر السبب" /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="spoilage">تلف / انتهاء صلاحية</SelectItem>
                    <SelectItem value="mistake">خطأ تشغيلي أو سقوط</SelectItem>
                    <SelectItem value="other">أسباب أخرى</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            )}
            <div className="space-y-2"><Label>ملاحظات</Label><Input value={movForm.notes} onChange={e => setMovForm(f => ({ ...f, notes: e.target.value }))} /></div>
            <div className="flex justify-end gap-2"><Button type="button" variant="outline" onClick={() => setShowMovementDialog(false)}>إلغاء</Button><Button type="submit">حفظ</Button></div>
          </form>
        </DialogContent>
      </Dialog>

      <Dialog open={!!editingMovement} onOpenChange={(open) => !open && setEditingMovement(null)}>
        <DialogContent className="max-w-[95vw] md:max-w-lg max-h-[90dvh] overflow-y-auto"><DialogHeader><DialogTitle>تعديل حركة مخزون</DialogTitle></DialogHeader>
          {editingMovement && (
            <form onSubmit={handleUpdateMovement} className="grid gap-4 py-4">
              <div className="space-y-2 text-muted-foreground bg-muted/30 p-2 rounded-md"><Label>الصنف: </Label> {items.find((i: any) => i.id === editingMovement.item_id)?.name || 'غير معروف'}</div>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div className="space-y-2"><Label>نوع الحركة</Label><Select value={editingMovement.movement_type} onValueChange={v => setEditingMovement((f: any) => ({ ...f, movement_type: v, reason: v === 'waste' ? 'spoilage' : '' }))}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent><SelectItem value="purchase">شراء (إضافة)</SelectItem><SelectItem value="consumption">استهلاك (خصم)</SelectItem><SelectItem value="waste">هالك (خصم)</SelectItem><SelectItem value="adjustment_in">تسوية إضافة</SelectItem><SelectItem value="adjustment_out">تسوية خصم</SelectItem></SelectContent></Select></div>
                <div className="space-y-2"><Label>الكمية *</Label><Input type="number" min={0} step="any" value={editingMovement.quantity} onChange={e => setEditingMovement((f: any) => ({ ...f, quantity: e.target.value }))} required /></div>
              </div>
              {editingMovement.movement_type === 'waste' && (
                <div className="space-y-2">
                  <Label>السبب *</Label>
                  <Select value={editingMovement.reason || 'spoilage'} onValueChange={v => setEditingMovement((f: any) => ({ ...f, reason: v }))}>
                    <SelectTrigger><SelectValue placeholder="اختر السبب" /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="spoilage">تلف / انتهاء صلاحية</SelectItem>
                      <SelectItem value="mistake">خطأ تشغيلي أو سقوط</SelectItem>
                      <SelectItem value="other">أسباب أخرى</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              )}
              <div className="space-y-2"><Label>ملاحظات</Label><Input value={editingMovement.notes || ''} onChange={e => setEditingMovement((f: any) => ({ ...f, notes: e.target.value }))} /></div>
              <div className="flex justify-end gap-2"><Button type="button" variant="outline" onClick={() => setEditingMovement(null)}>إلغاء</Button><Button type="submit">تحديث الحركة</Button></div>
            </form>
          )}
        </DialogContent>
      </Dialog>

      <Dialog open={!!quickStock} onOpenChange={(open) => !open && setQuickStock(null)}>
        <DialogContent className="max-w-[95vw] md:max-w-md max-h-[90dvh] overflow-y-auto"><DialogHeader><DialogTitle>{quickStock?.type === 'in' ? 'إضافة رصيد' : 'صرف رصيد'} - {quickStock?.name}</DialogTitle></DialogHeader>
          <form onSubmit={handleQuickStock} className="grid gap-4 py-4">
            <div className="space-y-2"><Label>الكمية</Label><Input type="number" min="0.01" step="0.01" autoFocus value={quickQty} onChange={e => setQuickQty(e.target.value)} required /></div>
            <div className="flex justify-end gap-2"><Button type="button" variant="outline" onClick={() => setQuickStock(null)}>إلغاء</Button><Button type="submit" variant={quickStock?.type === 'in' ? 'default' : 'destructive'}>{quickStock?.type === 'in' ? 'إضافة المخزون' : 'صرف المخزون'}</Button></div>
          </form>
        </DialogContent>
      </Dialog>
    </MainLayout>
  );
}
