import { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { MainLayout } from '@/components/layout';
import { useTenantBranch } from '@/hooks/useDatabase';
import { db } from '@/lib/firebase';
import { collection, query, where, getDocs, doc, writeBatch, increment, arrayUnion } from 'firebase/firestore';
import { format } from 'date-fns';
import { ar } from 'date-fns/locale';
import { cn } from '@/lib/utils';
import { 
  Calendar, Search, Filter, Eye, DollarSign, Clock, CheckCircle, 
  XCircle, ShoppingBag, Bike, Utensils, AlertCircle, Trash2, Printer, AlertTriangle
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent } from '@/components/ui/card';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { useAppStore } from '@/lib/store';
import { useFormatters } from '@/lib/formatters';
import { toast } from 'sonner';
import { useUserPermissions } from '@/hooks/usePermissions';

const statusConfig = {
  pending: { label: 'في الانتظار', color: 'bg-amber-500/10 text-amber-500 border-amber-500/20', icon: Clock },
  preparing: { label: 'قيد التحضير', color: 'bg-blue-500/10 text-blue-500 border-blue-500/20', icon: Clock },
  ready: { label: 'جاهز', color: 'bg-emerald-500/10 text-emerald-500 border-emerald-500/20', icon: CheckCircle },
  completed: { label: 'مكتمل', color: 'bg-gray-500/10 text-gray-500 border-gray-500/20', icon: CheckCircle },
  delivered: { label: 'تم التسليم', color: 'bg-indigo-500/10 text-indigo-500 border-indigo-500/20', icon: CheckCircle },
  cancelled: { label: 'ملغي', color: 'bg-rose-500/10 text-rose-500 border-rose-500/20', icon: XCircle }
};

const typeConfig = {
  dine_in: { label: 'صالة', icon: Utensils },
  takeaway: { label: 'تيك أواي', icon: ShoppingBag },
  delivery: { label: 'توصيل', icon: Bike }
};

export default function OrdersHistory() {
  const { tenantId, branchId } = useTenantBranch();
  const { settings } = useAppStore();
  const { currency } = useFormatters();
  const { isAdmin } = useUserPermissions();
  const [orders, setOrders] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');
  const [statusFilter, setStatusFilter] = useState<string>('all');
  const [typeFilter, setTypeFilter] = useState<string>('all');
  const [dateRange, setDateRange] = useState('month');
  const [customStartDate, setCustomStartDate] = useState(() => {
    const d = new Date(); d.setDate(1); return d.toISOString().split('T')[0];
  });
  const [customEndDate, setCustomEndDate] = useState(() => {
    return new Date().toISOString().split('T')[0];
  });
  
  // Custom dialog for order details
  const [selectedOrder, setSelectedOrder] = useState<any | null>(null);
  const [loadingItems, setLoadingItems] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);
  const [refreshTrigger, setRefreshTrigger] = useState(0);

  useEffect(() => {
    if (!tenantId || !branchId) return;

    const fetchOrders = async () => {
      setLoading(true);
      try {
        const now = new Date();
        const startDate = new Date();
        
        switch (dateRange) {
          case 'today':
            startDate.setHours(0, 0, 0, 0);
            break;
          case 'yesterday':
            startDate.setDate(now.getDate() - 1);
            startDate.setHours(0, 0, 0, 0);
            now.setHours(0, 0, 0, 0); 
            break;
          case 'week':
            startDate.setDate(now.getDate() - 7);
            break;
          case 'month':
            startDate.setMonth(now.getMonth() - 1);
            break;
          case 'year':
            startDate.setFullYear(now.getFullYear() - 1);
            break;
          case 'all':
            startDate.setFullYear(2020);
            break;
          case 'custom':
            startDate.setTime(new Date(customStartDate).getTime());
            startDate.setHours(0, 0, 0, 0);
            now.setTime(new Date(customEndDate).getTime());
            now.setHours(23, 59, 59, 999);
            break;
        }

        let q;
        if (dateRange === 'all') {
          q = query(
            collection(db, 'orders'),
            where('tenant_id', '==', tenantId),
            where('branch_id', '==', branchId)
          );
        } else {
          q = query(
            collection(db, 'orders'),
            where('tenant_id', '==', tenantId),
            where('branch_id', '==', branchId)
          );
        }
        
        const snap = await getDocs(q);
        const data = snap.docs.map(doc => ({ id: doc.id, ...(doc.data() as any) }));
        
        const filteredByDate = data.filter((o: any) => {
          if (dateRange === 'all') return true;
          if (!o.created_at && !o.createdAt) return false;
          // Handle both Firestore Timestamp and standard date string
          const rawDate = o.created_at?.toDate?.() || o.created_at || o.createdAt?.toDate?.() || o.createdAt;
          const oDate = new Date(rawDate);
          
          if (dateRange === 'yesterday') return oDate >= startDate && oDate < now;
          if (dateRange === 'custom') return oDate >= startDate && oDate <= now;
          return oDate >= startDate;
        });

        const sortedData = filteredByDate.sort((a: any, b: any) => {
          const rawA = a.created_at?.toDate?.() || a.created_at || a.createdAt?.toDate?.() || a.createdAt;
          const rawB = b.created_at?.toDate?.() || b.created_at || b.createdAt?.toDate?.() || b.createdAt;
          const tA = rawA ? new Date(rawA).getTime() : 0;
          const tB = rawB ? new Date(rawB).getTime() : 0;
          return tB - tA;
        });
        
        setOrders(sortedData);
      } catch (err) {
        console.error("Error fetching orders:", err);
      } finally {
        setLoading(false);
      }
    };

    fetchOrders();
  }, [tenantId, branchId, dateRange, customStartDate, customEndDate, refreshTrigger]);

  const handleViewOrder = async (order: any) => {
    setSelectedOrder(order);
    if (!order.items || order.items.length === 0) {
      setLoadingItems(true);
      try {
        const itemsQ = query(collection(db, 'order_items'), where('order_id', '==', order.id));
        const snap = await getDocs(itemsQ);
        const fetchedItems = snap.docs.map(d => ({ id: d.id, ...d.data() as any }));
        // Update the order in state and selectedOrder
        const itemsWithDetails = fetchedItems.map(item => {
          const itemPrice = Number(item.unit_price || item.unitPrice || item.price || 0);
          return {
            ...item,
            price: itemPrice,
            menuItem: { name: item.name, price: itemPrice },
            quantity: Number(item.quantity || 1),
            notes: item.notes
          };
        });
        setSelectedOrder((prev: any) => ({ ...prev, items: itemsWithDetails }));
      } catch (err) {
        console.error("Error fetching items:", err);
      } finally {
        setLoadingItems(false);
      }
    }
  };

  const handleRegisterWaste = async () => {
    if (!selectedOrder) return;
    if (!confirm('هل أنت متأكد من إلغاء هذا الطلب وتسجيل مكوناته في "الهالك والتوالف"؟ سيتم استرجاع الإيرادات وحفظ الطلب كملغي.')) return;
    
    setIsDeleting(true);
    try {
      const batch = writeBatch(db);
      
      const itemsQ = query(collection(db, 'order_items'), where('order_id', '==', selectedOrder.id));
      const itemsSnap = await getDocs(itemsQ);
      const itemsList = itemsSnap.docs.map(d => ({ id: d.id, ...d.data() as any }));
      
      // Update order to cancelled
      batch.update(doc(db, 'orders', selectedOrder.id), {
        status: 'cancelled',
        notes: (selectedOrder.notes || '') + ' - [تم إلغاء الطلب وتسجيله كهالك]',
        updated_at: new Date().toISOString()
      });

      // Delete payments
      const paymentsQ = query(collection(db, 'payments'), where('order_id', '==', selectedOrder.id));
      const paymentsSnap = await getDocs(paymentsQ);
      paymentsSnap.docs.forEach(d => batch.delete(d.ref));
      
      // Process inventory 
      if (itemsList.length > 0 && tenantId && branchId) {
        const recipesQ = query(collection(db, 'recipes'), where('tenant_id', '==', tenantId));
        const recipesSnap = await getDocs(recipesQ);
        const allRecipes = recipesSnap.docs.map(d => ({ id: d.id, ...d.data() as any }));

        const ingredientsQ = query(collection(db, 'recipe_ingredients'));
        const ingredientsSnap = await getDocs(ingredientsQ);
        const allIngredients = ingredientsSnap.docs.map(d => ({ id: d.id, ...d.data() as any }));
        
        for (const item of itemsList) {
          if (!item.menu_item_id && !item.id) continue;
          const mId = item.menu_item_id || item.item_id || item.id;
          const recipe = allRecipes.find(r => r.menu_item_id === mId);
          if (recipe) {
             const recipeIng = allIngredients.filter(ri => ri.recipe_id === recipe.id);
             for (const ing of recipeIng) {
                const wasteQty = Number(ing.quantity) * Number(item.quantity || 1);
                if (wasteQty > 0) {
                  const movRef = doc(collection(db, 'stock_movements'));
                  batch.set(movRef, {
                     tenant_id: tenantId,
                     branch_id: branchId,
                     item_id: ing.item_id,
                     movement_type: 'waste',
                     quantity: -wasteQty,
                     reason: 'mistake',
                     notes: `هالك من الطلب رقم #${selectedOrder.order_number || selectedOrder.orderNumber || selectedOrder.id.slice(0, 6)} - الصنف: ${item.name}`,
                     created_at: new Date().toISOString()
                  });

                  // Update branch stock immediately
                  const stockQ = query(collection(db, 'branch_stock'), where('branch_id', '==', branchId), where('item_id', '==', ing.item_id));
                  const exist = await getDocs(stockQ);
                  if (!exist.empty) {
                    const stockDoc = exist.docs[0];
                    batch.update(doc(db, 'branch_stock', stockDoc.id), {
                      quantity: increment(-wasteQty)
                    });
                  } else {
                    const newStockRef = doc(collection(db, 'branch_stock'));
                    batch.set(newStockRef, {
                      branch_id: branchId,
                      item_id: ing.item_id,
                      quantity: -wasteQty
                    });
                  }
                }
             }
          }
        }
      }
      
      await batch.commit();
      toast.success('تم إلغاء الطلب وتسجيل مكوناته كـ هالك بنجاح');
      setRefreshTrigger(prev => prev + 1);
      setSelectedOrder(null);
    } catch (error: any) {
      toast.error('حدث خطأ: ' + error.message);
    } finally {
      setIsDeleting(false);
    }
  };

  const handleDeleteOrder = async () => {
    if (!selectedOrder) return;
    if (!confirm('هل أنت متأكد من مسح هذا الطلب نهائياً؟ هذا الإجراء لا يمكن التراجع عنه وسيحذف كافة محتويات الطلب والمدفوعات المرتبطة به.')) return;
    
    setIsDeleting(true);
    try {
      const batch = writeBatch(db);
      
      const itemsQ = query(collection(db, 'order_items'), where('order_id', '==', selectedOrder.id));
      const itemsSnap = await getDocs(itemsQ);
      const itemsList = itemsSnap.docs.map(d => ({ id: d.id, ...d.data() as any }));
      itemsSnap.docs.forEach(d => batch.delete(d.ref));
      
      // Handle Inventory Restoring
      if (selectedOrder.status !== 'pending' && itemsList.length > 0 && tenantId && branchId) {
        const recipesQ = query(collection(db, 'recipes'), where('tenant_id', '==', tenantId));
        const recipesSnap = await getDocs(recipesQ);
        const allRecipes = recipesSnap.docs.map(d => ({ id: d.id, ...d.data() as any }));

        const ingredientsQ = query(collection(db, 'recipe_ingredients'));
        const ingredientsSnap = await getDocs(ingredientsQ);
        const allIngredients = ingredientsSnap.docs.map(d => ({ id: d.id, ...d.data() as any }));
        
        for (const item of itemsList) {
          if (!item.menu_item_id) continue;
          const recipe = allRecipes.find(r => r.menu_item_id === item.menu_item_id);
          if (recipe) {
             const recipeIng = allIngredients.filter(ri => ri.recipe_id === recipe.id);
             for (const ing of recipeIng) {
                const restoredQty = Number(ing.quantity) * Number(item.quantity);
                if (restoredQty > 0) {
                  const movRef = doc(collection(db, 'stock_movements'));
                  batch.set(movRef, {
                     tenant_id: tenantId,
                     branch_id: branchId,
                     item_id: ing.item_id,
                     movement_type: 'adjustment',
                     quantity: restoredQty,
                     notes: `استرجاع مخزون لطلب محذوف`,
                     created_at: new Date().toISOString()
                  });
                  
                  const stockQ = query(collection(db, 'branch_stock'), where('branch_id', '==', branchId), where('item_id', '==', ing.item_id));
                  const exist = await getDocs(stockQ);
                  if (!exist.empty) {
                    const stockDoc = exist.docs[0];
                    batch.update(doc(db, 'branch_stock', stockDoc.id), {
                      quantity: increment(restoredQty)
                    });
                  } else {
                     const newStockRef = doc(collection(db, 'branch_stock'));
                     batch.set(newStockRef, {
                       branch_id: branchId,
                       item_id: ing.item_id,
                       quantity: restoredQty
                     });
                  }
                }
             }
          }
        }
      }
      
      const paymentsQ = query(collection(db, 'payments'), where('order_id', '==', selectedOrder.id));
      const paymentsSnap = await getDocs(paymentsQ);
      paymentsSnap.docs.forEach(d => batch.delete(d.ref));
      
      // Store the deleted order number to be reused later
      const orderNumberStr = selectedOrder.order_number || selectedOrder.orderNumber || '';
      const match = orderNumberStr.match(/\d+/);
      if (match && branchId) {
        const orderNum = parseInt(match[0], 10);
        batch.set(doc(db, 'branch_counters', branchId), {
          reusable_numbers: arrayUnion(orderNum)
        }, { merge: true });
      }

      batch.delete(doc(db, 'orders', selectedOrder.id));
      
      await batch.commit();
      toast.success('تم حذف الطلب بنجاح');
      setSelectedOrder(null);
      setRefreshTrigger(prev => prev + 1);
    } catch (err) {
      console.error(err);
      toast.error('حدث خطأ أثناء الحذف');
    } finally {
      setIsDeleting(false);
    }
  };

  const printInvoice = () => {
    const printContent = document.getElementById('invoice-print-area');
    if (!printContent) return;
    const w = window.open('', '', 'width=400,height=600');
    if (!w) return;
    w.document.write(`<html dir="rtl"><head><meta charset="utf-8"><style>
      @import url('https://fonts.googleapis.com/css2?family=Cairo:wght@400;700;900&display=swap');
      * { margin: 0; padding: 0; box-sizing: border-box; font-family: 'Cairo', sans-serif; }
      @page { margin: 0; }
              body { width: 100%; max-width: 80mm; padding: 2mm; font-size: 12px; color: #000; background: #fff; margin: 0 auto; -webkit-print-color-adjust: exact; }
      .center { text-align: center; }
      .line { border-top: 1px dashed #000; margin: 6px 0; }
      .solid-line { border-top: 2px solid #000; margin: 6px 0; }
      .row { display: flex; justify-content: space-between; padding: 3px 0; }
      table { width: 100%; border-collapse: collapse; margin: 8px 0; }
      th { border-bottom: 1px dashed #000; padding: 4px 0; text-align: center; font-weight: 700; }
      th:first-child { text-align: right; }
      th:last-child { text-align: left; }
      td { padding: 4px 0; text-align: center; font-weight: 700; }
      td:first-child { text-align: right; }
      td:last-child { text-align: left; }
      .logo { max-width: 60mm; max-height: 25mm; object-fit: contain; margin-bottom: 8px; }
      .info-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 4px; margin: 8px 0; padding: 6px; border: 1px solid #000; border-radius: 4px; }
      .info-grid div { display: flex; flex-direction: column; }
      .info-grid span:first-child { color: #555; font-size: 10px; font-weight: normal; }
      .info-grid span:last-child { font-weight: 700; font-size: 12px; }
      .col-span-2 { grid-column: span 2 / span 2; }
      .invoice-container { width: 100%; }
      /* Print Overrides */
      .bg-muted\\/30, .bg-gray-50 { background: transparent !important; border: 1px solid #000 !important; }
      .bg-card { background: transparent !important; }
      .shadow-sm, .shadow-md, .shadow-lg, .shadow-xl { box-shadow: none !important; }
      .border-2 { border: none !important; }
      .rounded-xl, .rounded-lg, .rounded-md { border-radius: 0 !important; }
      .text-muted-foreground, .text-gray-500, .text-gray-600, .text-gray-700 { color: #555 !important; }
      .text-primary, .text-success, .text-emerald-500, .text-rose-500, .text-red-600, .text-amber-500 { color: #000 !important; }
      .border-dashed { border-style: dashed !important; border-color: #000 !important; }
      .page-break { page-break-before: always; margin-top: 10mm; }
    </style></head><body>
      <div class="invoice-container">${printContent.innerHTML}</div>
      <div class="page-break"></div>
      <div class="invoice-container">
        <div style="text-align:center; font-weight:bold; padding: 5px; border-bottom: 2px dashed #000; margin-bottom: 5px;">نسخة العميل</div>
        ${printContent.innerHTML}
      </div>
    </body></html>`);
    w.document.close();
    
    setTimeout(() => {
        w.print();
        w.close();
    }, 500);
  };

  const filteredOrders = orders.filter(order => {
    const matchesSearch = 
      (order.order_number?.toLowerCase() || order.orderNumber?.toLowerCase() || '').includes(searchTerm.toLowerCase()) ||
      (order.customer_name?.toLowerCase() || '').includes(searchTerm.toLowerCase());
      
    const matchesStatus = statusFilter === 'all' || order.status === statusFilter;
    const matchesType = typeFilter === 'all' || order.type === typeFilter;
    
    return matchesSearch && matchesStatus && matchesType;
  });

  const formatDate = (dateObj: any) => {
    if (!dateObj) return 'غير محدد';
    try {
      const date = dateObj.toDate ? dateObj.toDate() : new Date(dateObj);
      return format(date, 'dd MMM yyyy - hh:mm a', { locale: ar });
    } catch {
      return 'تاريخ غير صالح';
    }
  };

  return (
    <MainLayout title="سجل الطلبات" subtitle="مراجعة وتتبع الطلبات السابقة"
      actions={
        <div className="flex flex-wrap items-center gap-2 w-full md:w-auto">
          <Select value={dateRange} onValueChange={setDateRange}>
            <SelectTrigger className="w-[140px] md:w-[150px] bg-background border-white/10">
              <SelectValue placeholder="اختر الفترة" />
            </SelectTrigger>
            <SelectContent>
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
            <div className="flex items-center gap-1 md:gap-2">
              <input type="date" value={customStartDate} onChange={e => setCustomStartDate(e.target.value)} className="flex h-9 w-full rounded-md border border-white/10 bg-background/50 px-2 py-1 text-xs md:text-sm shadow-sm transition-colors max-w-[120px]" />
              <span className="text-muted-foreground">-</span>
              <input type="date" value={customEndDate} onChange={e => setCustomEndDate(e.target.value)} className="flex h-9 w-full rounded-md border border-white/10 bg-background/50 px-2 py-1 text-xs md:text-sm shadow-sm transition-colors max-w-[120px]" />
            </div>
          )}
        </div>
      }
    >
      {/* Filters Section */}
      <Card className="mb-6 border-white/10 bg-background/50 backdrop-blur-md">
        <CardContent className="p-4 flex flex-col md:flex-row gap-4">
          <div className="relative flex-1">
            <Search className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
            <Input 
              placeholder="ابحث برقم الطلب أو اسم العميل..." 
              className="pr-9 bg-background/50 border-white/10"
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
            />
          </div>
          
          <div className="flex gap-2 w-full md:w-auto">
            <select 
              className="flex-1 md:w-[150px] flex h-10 items-center justify-between rounded-md border border-white/10 bg-background/50 px-3 py-2 text-sm ring-offset-background placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50"
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value)}
            >
              <option value="all">كل الحالات</option>
              <option value="completed">مكتمل</option>
              <option value="pending">في الانتظار</option>
              <option value="preparing">قيد التحضير</option>
              <option value="ready">جاهز</option>
              <option value="delivered">تم التسليم</option>
              <option value="cancelled">ملغي</option>
            </select>
            
            <select 
              className="flex-1 md:w-[150px] flex h-10 items-center justify-between rounded-md border border-white/10 bg-background/50 px-3 py-2 text-sm ring-offset-background placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50"
              value={typeFilter}
              onChange={(e) => setTypeFilter(e.target.value)}
            >
              <option value="all">كل الأنواع</option>
              <option value="dine_in">صالة</option>
              <option value="takeaway">تيك أواي</option>
              <option value="delivery">توصيل</option>
            </select>
          </div>
        </CardContent>
      </Card>

      {/* Modern Table & Mobile Cards Layout */}
      <Card className="border-white/10 bg-background/50 backdrop-blur-md shadow-xl overflow-hidden rounded-xl">
        {loading ? (
          <div className="p-12 pl-12 flex justify-center items-center h-64 text-muted-foreground">
             <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary ml-3"></div>
             جاري تحميل السجل...
          </div>
        ) : (
          <>
            {/* Mobile Cards View (< md) */}
            <div className="md:hidden divide-y divide-white/5">
              {filteredOrders.length > 0 ? (
                filteredOrders.map((order) => {
                  const status = statusConfig[order.status as keyof typeof statusConfig] || statusConfig.pending;
                  const StatusIcon = status.icon;
                  const typeInfo = typeConfig[(order.type || order.order_type) as keyof typeof typeConfig] || typeConfig.dine_in;
                  const TypeIcon = typeInfo.icon;
                  const total = order.total || order.total_amount || 0;

                  return (
                    <div key={order.id} className="p-4 space-y-2.5">
                      <div className="flex items-start justify-between gap-2">
                        <div>
                          <p className="font-bold text-base text-foreground">
                            #{order.order_number || order.orderNumber || order.id.slice(0, 6)}
                          </p>
                          <div className="flex items-center gap-1.5 text-xs text-muted-foreground mt-0.5">
                            <TypeIcon className="w-3.5 h-3.5" />
                            <span>{typeInfo.label}</span>
                            <span>•</span>
                            <span>{formatDate(order.created_at || order.createdAt)}</span>
                          </div>
                        </div>
                        <Badge variant="outline" className={cn("gap-1 py-0.5 rounded-full text-xs", status.color)}>
                          <StatusIcon className="w-3 h-3" />
                          {status.label}
                        </Badge>
                      </div>

                      <div className="flex items-center justify-between pt-1">
                        <div>
                          <span className="text-xs text-muted-foreground">الإجمالي: </span>
                          <span className="font-bold text-base text-emerald-500">{currency(total)}</span>
                        </div>
                        <Button
                          variant="ghost"
                          size="sm"
                          className="h-8 gap-1 text-xs bg-white/5 hover:bg-primary/20 hover:text-primary rounded-lg px-3"
                          onClick={() => handleViewOrder(order)}
                        >
                          <Eye className="w-3.5 h-3.5" />
                          <span>عرض الفاتورة</span>
                        </Button>
                      </div>
                    </div>
                  );
                })
              ) : (
                <div className="px-6 py-12 text-center text-muted-foreground">
                  <AlertCircle className="w-12 h-12 mx-auto mb-3 opacity-20" />
                  <span className="block text-base">لم يتم العثور على أية طلبات مطابقة</span>
                </div>
              )}
            </div>

            {/* Desktop Table View (>= md) */}
            <div className="hidden md:block overflow-x-auto custom-scrollbar">
              <table className="w-full text-sm text-right">
                <thead className="bg-primary/5 border-b border-white/10 text-muted-foreground">
                  <tr>
                    <th className="px-6 py-4 font-semibold whitespace-nowrap">رقم الطلب</th>
                    <th className="px-6 py-4 font-semibold whitespace-nowrap">التاريخ والوقت</th>
                    <th className="px-6 py-4 font-semibold whitespace-nowrap">النوع</th>
                    <th className="px-6 py-4 font-semibold whitespace-nowrap">الحالة</th>
                    <th className="px-6 py-4 font-semibold whitespace-nowrap">الإجمالي</th>
                    <th className="px-6 py-4 font-semibold whitespace-nowrap text-center">الإجراءات</th>
                  </tr>
                </thead>
                <tbody>
                  <AnimatePresence>
                    {filteredOrders.length > 0 ? filteredOrders.map((order, idx) => {
                      const status = statusConfig[order.status as keyof typeof statusConfig] || statusConfig.pending;
                      const StatusIcon = status.icon;
                      const typeInfo = typeConfig[(order.type || order.order_type) as keyof typeof typeConfig] || typeConfig.dine_in;
                      const TypeIcon = typeInfo.icon;
                      const total = order.total || order.total_amount || 0;

                      return (
                        <motion.tr 
                          key={order.id}
                          initial={{ opacity: 0, y: 10 }}
                          animate={{ opacity: 1, y: 0 }}
                          transition={{ delay: idx * 0.02 }}
                          className="border-b border-white/5 hover:bg-white/[0.02] transition-colors"
                        >
                          <td className="px-6 py-4 whitespace-nowrap font-bold">
                            #{order.order_number || order.orderNumber || order.id.slice(0, 6)}
                          </td>
                          <td className="px-6 py-4 whitespace-nowrap text-muted-foreground flex items-center gap-2">
                            <Calendar className="w-4 h-4" />
                            {formatDate(order.created_at || order.createdAt)}
                          </td>
                          <td className="px-6 py-4 whitespace-nowrap">
                            <div className="flex items-center gap-1.5 text-muted-foreground">
                              <TypeIcon className="w-4 h-4" />
                              {typeInfo.label}
                            </div>
                          </td>
                          <td className="px-6 py-4 whitespace-nowrap">
                            <Badge variant="outline" className={cn("gap-1 py-1 rounded-full", status.color)}>
                              <StatusIcon className="w-3 h-3" />
                              {status.label}
                            </Badge>
                          </td>
                          <td className="px-6 py-4 whitespace-nowrap font-bold text-emerald-500">
                            {currency(total)}
                          </td>
                          <td className="px-6 py-4 whitespace-nowrap text-center">
                            <Button 
                              variant="ghost" 
                              size="sm" 
                              className="h-8 w-8 p-0 rounded-full hover:bg-primary/20 hover:text-primary transition-colors"
                              onClick={() => handleViewOrder(order)}
                            >
                              <Eye className="w-4 h-4" />
                            </Button>
                          </td>
                        </motion.tr>
                      );
                    }) : (
                      <tr>
                        <td colSpan={6} className="px-6 py-12 text-center text-muted-foreground">
                          <AlertCircle className="w-12 h-12 md:w-16 md:h-16 mx-auto mb-4 opacity-20" />
                          <span className="block text-lg">لم يتم العثور على أية طلبات مطابقة</span>
                        </td>
                      </tr>
                    )}
                  </AnimatePresence>
                </tbody>
              </table>
            </div>
          </>
        )}
      </Card>

      {/* Order Details Custom Dialog */}
      <Dialog open={!!selectedOrder} onOpenChange={(open) => !open && setSelectedOrder(null)}>
        <DialogContent className="sm:max-w-[500px] max-h-[90dvh] overflow-y-auto border-white/10 bg-background/95 backdrop-blur-xl">
          <DialogHeader>
            <DialogTitle className="flex items-center justify-between">
              <span className="text-xl">
                تفاصيل الطلب <span className="text-primary font-bold">#{selectedOrder?.order_number || selectedOrder?.orderNumber}</span>
              </span>
              {selectedOrder && (
                <Badge className={cn(
                  "ml-4 mr-auto border px-3", 
                  (statusConfig[selectedOrder.status as keyof typeof statusConfig] || statusConfig.pending).color
                )}>
                  {statusConfig[selectedOrder.status as keyof typeof statusConfig]?.label || 'قيد الانتظار'}
                </Badge>
              )}
            </DialogTitle>
          </DialogHeader>

          {selectedOrder && (
            <div className="space-y-4 py-4">
              <div id="invoice-print-area" className="border-2 rounded-xl p-4 sm:p-5 space-y-4 bg-white shadow-sm w-full max-w-sm mx-auto text-black print:p-0 print:border-none print:shadow-none">
                <div className="center text-center pb-2">
                  {settings.invoiceLogo ? (
                    <img src={settings.invoiceLogo} alt="Logo" className="logo mx-auto block max-w-32 max-h-16 object-contain mb-2" />
                  ) : (
                    <h1 className="text-3xl font-black mb-1">{settings.invoiceCompanyName || 'MK'}</h1>
                  )}
                  {settings.invoiceLogo && settings.invoiceCompanyName && (
                    <h1 className="text-xl font-black mb-1 text-black">{settings.invoiceCompanyName}</h1>
                  )}
                  
                  {settings.invoiceAddress && <p className="text-sm font-bold mb-1 text-black">{settings.invoiceAddress}</p>}
                  {settings.invoicePhone && <p className="text-sm font-bold mb-1 text-black">هاتف: {settings.invoicePhone}</p>}
                  {settings.invoiceTaxNumber && <p className="text-sm font-bold mb-1 text-black">الرقم الضريبي: {settings.invoiceTaxNumber}</p>}
                  
                  <div className="line border-t border-dashed border-gray-400 my-3" />
                  
                  <p className="text-base font-bold mb-1 text-black">فاتورة ضريبية مبسطة</p>
                  <p className="text-xs text-gray-600">
                    {formatDate(selectedOrder.created_at || selectedOrder.createdAt)}
                  </p>
                </div>
                
                <div className="info-grid grid grid-cols-2 gap-y-2 text-sm bg-gray-50 p-3 rounded-lg border border-gray-200">
                  <div><span className="text-gray-500 text-xs block">رقم الطلب</span><span className="font-bold text-base text-black">{selectedOrder.order_number || selectedOrder.orderNumber || selectedOrder.id?.slice(0, 6)}</span></div>
                  <div><span className="text-gray-500 text-xs block">طريقة الدفع</span><span className="font-bold text-base text-black">{(selectedOrder.payment_method || selectedOrder.paymentMethod) === 'card' ? 'بطاقة ائتمان' : (selectedOrder.payment_method || selectedOrder.paymentMethod) === 'split' ? 'دفع مقسم' : 'نقدي'}</span></div>
                  <div><span className="text-gray-500 text-xs block">نوع الطلب</span><span className="font-bold text-base text-black">{typeConfig[(selectedOrder.type || selectedOrder.order_type) as keyof typeof typeConfig]?.label || 'صالة'}</span></div>
                  {selectedOrder.table_number && <div><span className="text-gray-500 text-xs block">رقم الطاولة</span><span className="font-bold text-base text-black">{selectedOrder.table_number}</span></div>}
                  {selectedOrder.customer_name && <div className="col-span-2"><span className="text-gray-500 text-xs block">العميل</span><span className="font-bold text-base text-black">{selectedOrder.customer_name}</span></div>}
                  {(selectedOrder.type || selectedOrder.order_type) === 'delivery' && (selectedOrder.customerAddress || selectedOrder.customer_address) && <div className="col-span-2"><span className="text-gray-500 text-xs block">العنوان</span><span className="font-bold text-base text-black">{selectedOrder.customerAddress || selectedOrder.customer_address}</span></div>}
                  {selectedOrder.notes && <div className="col-span-2"><span className="text-gray-500 text-xs block">ملاحظات الطلب</span><span className="font-bold text-base text-black whitespace-pre-wrap">{selectedOrder.notes}</span></div>}
                </div>
                
                <table className="w-full text-sm mt-3 text-black">
                  <thead><tr className="border-b-2 border-dashed border-gray-300"><th className="text-right py-2 font-bold">الصنف</th><th className="text-center py-2 font-bold">الكمية</th><th className="text-center py-2 font-bold">السعر</th><th className="text-left py-2 font-bold">الصافي</th></tr></thead>
                  <tbody>
                    {loadingItems ? (
                      <tr><td colSpan={4} className="text-center py-4">جاري التحميل...</td></tr>
                    ) : (
                      (selectedOrder.items || []).map((item: any, i: number) => (
                        <tr key={i} className="border-b border-dashed border-gray-200">
                          <td className="py-2 font-bold text-black border-none"><span className="text-right inline-block w-full">{item.menuItem?.name || item.name}</span></td>
                          <td className="text-center py-2 text-black border-none">{item.quantity}</td>
                          <td className="text-center py-2 text-black border-none">{currency(item.price)}</td>
                          <td className="py-2 font-bold text-black border-none"><span className="text-left inline-block w-full">{currency(item.price * item.quantity)}</span></td>
                        </tr>
                      ))
                    )}
                  </tbody>
                </table>
                <div className="solid-line border-t-2 border-black mt-2 mb-2" />
                <div className="space-y-2 text-black">
                  <div className="row flex justify-between font-bold text-base"><span className="text-gray-700">المجموع الفرعي</span><span>{currency(((selectedOrder.total || selectedOrder.total_amount || 0) - (selectedOrder.tax || 0) - (selectedOrder.delivery_fee || selectedOrder.deliveryFee || 0) + (selectedOrder.discount || selectedOrder.discount_amount || 0)))}</span></div>
                  {selectedOrder.tax > 0 && <div className="row flex justify-between font-bold text-base"><span className="text-gray-700">الضريبة</span><span>{currency(selectedOrder.tax || 0)}</span></div>}
                  {(selectedOrder.discount || selectedOrder.discount_amount) > 0 && <div className="row flex justify-between font-bold text-base text-red-600"><span>الخصم الممنوح {selectedOrder.discountPercent > 0 ? `(${selectedOrder.discountPercent}%)` : ''}</span><span>- {currency(selectedOrder.discount || selectedOrder.discount_amount)}</span></div>}
                  {(selectedOrder.delivery_fee || selectedOrder.deliveryFee) > 0 && <div className="row flex justify-between font-bold text-base text-gray-700"><span>رسوم التوصيل</span><span>+ {currency(selectedOrder.delivery_fee || selectedOrder.deliveryFee)}</span></div>}
                  <div className="row flex justify-between text-xl font-black total pt-3 border-t-2 border-black mt-2"><span>الإجمالي المستحق</span><span className="text-black">{currency(selectedOrder.total || selectedOrder.total_amount || 0)}</span></div>
                </div>
                <div className="line border-t-2 border-dashed border-gray-400 my-4" />
                <div className="text-center pt-2 pb-1">
                  <p className="text-base font-bold mb-1 text-black">{settings.receiptWelcomeMessage || 'شكراً لزيارتكم 🍽️'}</p>
                  <p className="text-[11px] text-gray-500 mt-2">Powered by MK System</p>
                </div>
              </div>

              <div className="pt-4 flex gap-2 w-full">
                {isAdmin && (
                  <>
                    <Button variant="outline" className="flex-1 w-full border-amber-500/50 hover:bg-amber-500/20 text-amber-600" onClick={handleRegisterWaste} disabled={isDeleting}>
                      <AlertTriangle className="w-4 h-4 ml-1 sm:ml-2" /> هالك
                    </Button>
                    <Button variant="outline" className="flex-1 w-full border-rose-500/50 hover:bg-rose-500/20 text-rose-500" onClick={handleDeleteOrder} disabled={isDeleting}>
                      <Trash2 className="w-4 h-4 ml-1 sm:ml-2" /> حذف
                    </Button>
                  </>
                )}
                <Button variant="default" className="flex-1 w-full gap-2 border shadow-lg" onClick={printInvoice}>
                  <Printer className="w-4 h-4" /> فاتورة
                </Button>
                <Button variant="outline" className="flex-1 w-full" onClick={() => setSelectedOrder(null)}>إغلاق</Button>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </MainLayout>
  );
}
