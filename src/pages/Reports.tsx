import { useState, useEffect, useMemo } from 'react';
import { MainLayout } from '@/components/layout';
import { useTenantBranch, useInventoryItems, useBranchStock, useStockMovements } from '@/hooks/useDatabase';
import { useFormatters } from '@/lib/formatters';
import { db } from '@/lib/firebase';
import { collection, query, where, getDocs } from 'firebase/firestore';
import { getExpenses } from '@/services/expenses';
import {
  BarChart3, TrendingUp, Download, DollarSign, ShoppingCart, 
  Users, Activity, Percent, Package, AlertTriangle, Printer, Clock,
  Banknote, CreditCard, Search, Tag, BarChart as BarChartIcon
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { 
  AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip as RechartsTooltip, 
  ResponsiveContainer, BarChart, Bar, PieChart, Pie, Cell, Legend
} from 'recharts';
import { cn } from '@/lib/utils';
import { toast } from 'sonner';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';

// Define colors for charts
const COLORS = ['#3b82f6', '#10b981', '#f59e0b', '#ef4444', '#8b5cf6', '#ec4899', '#06b6d4', '#f97316'];

export default function Reports() {
  const { tenantId, branchId } = useTenantBranch();
  const { items: inventory } = useInventoryItems(tenantId);
  const { stock } = useBranchStock(branchId);
  const { movements } = useStockMovements(branchId);
  const { currency, number } = useFormatters();

  const [dateRange, setDateRange] = useState('month');
  const [customStartDate, setCustomStartDate] = useState(() => {
    const d = new Date(); d.setDate(1); return d.toISOString().split('T')[0];
  });
  const [customEndDate, setCustomEndDate] = useState(() => {
    return new Date().toISOString().split('T')[0];
  });
  const [loading, setLoading] = useState(true);
  const [profitSearchTerm, setProfitSearchTerm] = useState('');

  const [orders, setOrders] = useState<any[]>([]);
  const [orderItems, setOrderItems] = useState<any[]>([]);
  const [expenses, setExpenses] = useState<any[]>([]);

  useEffect(() => {
    if (!tenantId) return;

    const fetchReportsData = async () => {
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

        let ordersQ = query(
          collection(db, 'orders'), 
          where('tenant_id', '==', tenantId)
        );
        const ordersSnap = await getDocs(ordersQ);
        
        let fetchedOrders = ordersSnap.docs.map(d => ({ id: d.id, ...d.data() } as any));
        
        fetchedOrders = fetchedOrders.filter(o => {
          if (!o.created_at) return false;
          // Orders from POS are pending but paid, so we include them in revenue
          if (o.status !== 'completed' && o.payment_status !== 'paid') return false; 
          
          const oDate = new Date(o.created_at);
          if (dateRange === 'yesterday') return oDate >= startDate && oDate < now;
          if (dateRange === 'custom') return oDate >= startDate && oDate <= now;
          return oDate >= startDate;
        });
        
        setOrders(fetchedOrders);

        let fetchedItems: any[] = [];
        
        try {
          // As an optimization, fetch all order items (can be optimized heavily in prod)
          const itemsQ = query(collection(db, 'order_items')); 
          const itemsSnap = await getDocs(itemsQ);
          const allItems = itemsSnap.docs.map(d => ({ id: d.id, ...d.data() } as any));
          
          const orderIds = new Set(fetchedOrders.map(o => o.id));
          fetchedItems = allItems.filter(item => orderIds.has(item.order_id));
        } catch (e) {
          console.error("Error fetching items", e);
        }
        
        setOrderItems(fetchedItems);

        // Fetch Expenses
        try {
          const allExps = await getExpenses(tenantId);
          
          const filteredExps = allExps.filter(e => {
            if (!e.date) return false;
            // date is YYYY-MM-DD
            const eDate = new Date(e.date);
            if (dateRange === 'yesterday') return eDate >= startDate && eDate < now;
            if (dateRange === 'custom') return eDate >= startDate && eDate <= now;
            return eDate >= startDate;
          });
          setExpenses(filteredExps);
        } catch (e) {
          console.error("Error fetching expenses", e);
        }

      } catch (error) {
        console.error("Error fetching report data", error);
        toast.error("فشل في تحميل التقارير");
      } finally {
        setLoading(false);
      }
    };

    fetchReportsData();
  }, [tenantId, dateRange, customStartDate, customEndDate]);


  const stats = useMemo(() => {
    // Determine the date bounds for filtering waste
    const now = new Date();
    const startDate = new Date();
    switch (dateRange) {
      case 'today': startDate.setHours(0, 0, 0, 0); break;
      case 'yesterday': startDate.setDate(now.getDate() - 1); startDate.setHours(0, 0, 0, 0); now.setHours(0, 0, 0, 0); break;
      case 'week': startDate.setDate(now.getDate() - 7); break;
      case 'month': startDate.setMonth(now.getMonth() - 1); break;
      case 'year': startDate.setFullYear(now.getFullYear() - 1); break;
      case 'all': startDate.setFullYear(2020); break;
      case 'custom': startDate.setTime(new Date(customStartDate).getTime()); startDate.setHours(0, 0, 0, 0); now.setTime(new Date(customEndDate).getTime()); now.setHours(23, 59, 59, 999); break;
    }

    let sales = 0;
    let electronicRevenue = 0;
    let tax = 0;
    let discount = 0;
    const uniqueCustomers = new Set();

    orders.forEach(o => {
      const pm = o.payment_method || 'cash';
      const parsedTotal = Number(o.total || 0);
      const deliveryFee = Number(o.delivery_fee || o.deliveryFee || 0);
      const orderTotal = Math.max(0, parsedTotal - deliveryFee); // Exclude delivery fee from revenue

      if (pm === 'card' || pm === 'wallet') {
        electronicRevenue += orderTotal;
      } else {
        sales += orderTotal;
      }

      tax += Number(o.tax_amount || 0);
      discount += Number(o.discount_amount || 0);
      if (o.customer_id) uniqueCustomers.add(o.customer_id);
      else if (o.customer_name) uniqueCustomers.add(o.customer_name);
    });

    let totalExpenses = 0;
    expenses.forEach(e => {
      totalExpenses += Number(e.amount || 0);
    });

    let rawGrossProfit = 0;
    orderItems.forEach(item => {
      const sellingPrice = Number(item.unit_price || 0);
      const costPrice = Number(item.cost || 0);
      const qty = Number(item.quantity || 1);
      rawGrossProfit += (sellingPrice - costPrice) * qty;
    });

    let wasteCost = 0;
    movements.filter(m => m.movement_type === 'waste').forEach(w => {
      if (!w.created_at) return;
      const wDate = new Date(w.created_at);
      let inRange = false;
      if (dateRange === 'yesterday') inRange = wDate >= startDate && wDate < now;
      else if (dateRange === 'custom') inRange = wDate >= startDate && wDate <= now;
      else inRange = wDate >= startDate;

      if (inRange) {
        const item = inventory.find((i: any) => i.id === w.item_id);
        const unitCost = item ? (Number(item.cost_per_unit) || 0) : 0;
        wasteCost += Math.abs(Number(w.quantity || 0)) * unitCost;
      }
    });

    const grossProfit = rawGrossProfit - discount;

    return {
      revenue: sales,
      electronicRevenue,
      orders: orders.length,
      aov: orders.length > 0 ? (sales + electronicRevenue) / orders.length : 0,
      customers: uniqueCustomers.size,
      tax,
      discount,
      wasteCost,
      grossProfit,
      totalExpenses,
      netProfit: grossProfit - totalExpenses - wasteCost,
    };
  }, [orders, orderItems, expenses, movements, inventory, dateRange, customStartDate, customEndDate]);


  const timelineData = useMemo(() => {
    const map = new Map<string, number>();
    orders.forEach(o => {
      if (!o.created_at) return;
      
      let dateKey = '';
      const d = new Date(o.created_at);
      
      if (dateRange === 'today' || dateRange === 'yesterday') {
        dateKey = d.toLocaleTimeString('ar-EG', { hour: 'numeric', hour12: true });
      } else if (dateRange === 'custom' && customStartDate === customEndDate) {
        dateKey = d.toLocaleTimeString('ar-EG', { hour: 'numeric', hour12: true });
      } else {
        dateKey = d.toLocaleDateString('ar-EG', { month: 'short', day: 'numeric' });
      }
      
      const parsedTotal = Number(o.total || 0);
      const deliveryFee = Number(o.delivery_fee || o.deliveryFee || 0);
      map.set(dateKey, (map.get(dateKey) || 0) + Math.max(0, parsedTotal - deliveryFee));
    });

    const entries = Array.from(map.entries());
    return entries.map(([name, sales]) => ({ name, sales })).reverse().slice(0, 30).reverse();
  }, [orders, dateRange]);


  const peakHoursData = useMemo(() => {
    const hours = new Array(24).fill(0);
    orders.forEach(o => {
      if (!o.created_at) return;
      const hour = new Date(o.created_at).getHours();
      hours[hour] += 1;
    });

    return hours.map((count, i) => {
      const ampm = i >= 12 ? 'م' : 'ص';
      const hStr = i % 12 === 0 ? 12 : i % 12;
      return { time: `${hStr} ${ampm}`, orders: count };
    }).filter(h => h.orders > 0);
  }, [orders]);


  const paymentData = useMemo(() => {
    const map = new Map<string, number>();
    orders.forEach(o => {
      const pm = o.payment_method === 'cash' || !o.payment_method ? 'كاش' : o.payment_method === 'card' ? 'بطاقة ائتمان' : o.payment_method === 'wallet' ? 'محفظة الكترونية' : 'أخرى';
      const parsedTotal = Number(o.total || 0);
      const deliveryFee = Number(o.delivery_fee || o.deliveryFee || 0);
      map.set(pm, (map.get(pm) || 0) + Math.max(0, parsedTotal - deliveryFee));
    });
    return Array.from(map.entries()).map(([name, value]) => ({ name, value }));
  }, [orders]);

  const salesByOrderTypeData = useMemo(() => {
    const map = new Map<string, number>();
    orders.forEach(o => {
      const type = o.order_type === 'dine_in' ? 'صلة طعام (محلي)' : 
                   o.order_type === 'takeaway' ? 'سفري' : 
                   o.order_type === 'delivery' ? 'توصيل' : 'غير محدد';
      const parsedTotal = Number(o.total || 0);
      const deliveryFee = Number(o.delivery_fee || o.deliveryFee || 0);
      const netTotal = Math.max(0, parsedTotal - deliveryFee);
      map.set(type, (map.get(type) || 0) + netTotal);
    });
    return Array.from(map.entries()).map(([name, value]) => ({ name, value }));
  }, [orders]);


  const topItems = useMemo(() => {
    const itemMap = new Map<string, { name: string; count: number; revenue: number }>();
    const ordersMap = new Map(orders.map(o => [o.id, o]));
    
    orderItems.forEach(item => {
      const order = ordersMap.get(item.order_id);
      let itemDiscountAmount = 0;
      
      const qty = Number(item.quantity || 1);
      const originalUnitPrice = Number(item.unit_price || 0);
      const grossRev = qty * originalUnitPrice;

      if (order && Number(order.discount_amount || 0) > 0) {
         // Subtotal before discount
         const subtotal = Number(order.subtotal || order.sub_total || (Number(order.total) + Number(order.discount_amount || 0)));
         if (subtotal > 0) {
            const discountRatio = Number(order.discount_amount || 0) / subtotal;
            itemDiscountAmount = grossRev * discountRatio;
         }
      }

      const netRev = grossRev - itemDiscountAmount;

      const ex = itemMap.get(item.name) || { name: item.name, count: 0, revenue: 0 };
      ex.count += qty;
      ex.revenue += netRev;
      itemMap.set(item.name, ex);
    });

    return Array.from(itemMap.values()).sort((a, b) => b.revenue - a.revenue).slice(0, 10);
  }, [orderItems, orders]);

  const profitItems = useMemo(() => {
    const itemMap = new Map<string, { name: string; category: string; count: number; revenue: number; totalCost: number; profit: number; unitPrice: number; unitCost: number }>();
    const ordersMap = new Map(orders.map(o => [o.id, o]));
    
    orderItems.forEach(item => {
      const order = ordersMap.get(item.order_id);
      
      const qty = Number(item.quantity || 1);
      const originalUnitPrice = Number(item.unit_price || 0);
      const unitCost = Number(item.cost || 0);
      const grossRev = qty * originalUnitPrice;
      
      let itemDiscountAmount = 0;
      if (order && Number(order.discount_amount || 0) > 0) {
         const subtotal = Number(order.subtotal || order.sub_total || (Number(order.total) + Number(order.discount_amount || 0)));
         if (subtotal > 0) {
            const discountRatio = Number(order.discount_amount || 0) / subtotal;
            itemDiscountAmount = grossRev * discountRatio;
         }
      }

      const netRev = grossRev - itemDiscountAmount;
      const effectiveUnitPrice = netRev / qty;

      const catName = item.category_name || item.categoryName || item.category || 'غير محدد';
      const ex = itemMap.get(item.name) || { name: item.name, category: catName, count: 0, revenue: 0, totalCost: 0, profit: 0, unitPrice: originalUnitPrice, unitCost: unitCost };
      
      ex.count += qty;
      ex.revenue += netRev;
      ex.totalCost += qty * unitCost;
      ex.profit += (netRev - (qty * unitCost));
      // Optionally update unitPrice to show average, but keeping original for reference
      // ex.unitPrice = originalUnitPrice;
      // ex.unitCost = unitCost;
      
      itemMap.set(item.name, ex);
    });

    return Array.from(itemMap.values()).map(item => ({
      ...item,
      profitMargin: item.revenue > 0 ? (item.profit / item.revenue) * 100 : 0
    })).sort((a, b) => b.profit - a.profit);
  }, [orderItems, orders]);

  const filteredProfitItems = useMemo(() => {
     return profitItems.filter(item => 
       item.name.toLowerCase().includes(profitSearchTerm.toLowerCase()) || 
       item.category.toLowerCase().includes(profitSearchTerm.toLowerCase())
     );
  }, [profitItems, profitSearchTerm]);

  const profitSummary = useMemo(() => {
    let totalProfit = 0;
    let totalRevenue = 0;
    let topProfitItem = { name: '-', profit: 0 };
    let topVolumeItem = { name: '-', count: 0 };

    profitItems.forEach(item => {
      totalProfit += item.profit;
      totalRevenue += item.revenue;
      
      if (item.profit > topProfitItem.profit) topProfitItem = item;
      if (item.count > topVolumeItem.count) topVolumeItem = item;
    });

    const averageMargin = totalRevenue > 0 ? (totalProfit / totalRevenue) * 100 : 0;
    const top10Profit = profitItems.slice(0, 10);
    const top5Volume = [...profitItems].sort((a, b) => b.count - a.count).slice(0, 5);

    return { totalProfit, averageMargin, topProfitItem, topVolumeItem, top10Profit, top5Volume };
  }, [profitItems]);

  const handleExportProfitCSV = () => {
    const headers = ['الصنف', 'الفئة', 'سعر البيع للوحدة', 'التكلفة للوحدة', 'ربح الوحدة', 'هامش الربح (%)', 'الكمية المباعة', 'إجمالي الإيرادات', 'إجمالي التكلفة', 'إجمالي صافي الربح'].join(',');
    const rows = filteredProfitItems.map(o => {
      const margin = o.profitMargin.toFixed(1) + '%';
      return `${o.name},${o.category},${o.unitPrice},${o.unitCost},${o.unitPrice - o.unitCost},${margin},${o.count},${o.revenue},${o.totalCost},${o.profit}`;
    });
    
    const csvContent = "data:text/csv;charset=utf-8,\uFEFF" + [headers, ...rows].join('\n');
    const encodedUri = encodeURI(csvContent);
    const link = document.createElement('a');
    link.setAttribute('href', encodedUri);
    link.setAttribute('download', `item_profit_report_${new Date().toLocaleDateString('ar-EG').replace(/\//g, '-')}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };


  const lowStockItems = useMemo(() => {
    // Merge items with stock
    const itemsWithStock = inventory.map((item: any) => {
      const s = stock.find((st: any) => st.item_id === item.id);
      return { ...item, quantity: s ? Number(s.quantity) : 0 };
    });

    return itemsWithStock
      .filter(item => {
        const qty = Number(item.quantity || 0);
        const minQty = Number(item.min_stock_level || 10);
        return qty <= minQty;
      })
      .sort((a, b) => Number(a.quantity) - Number(b.quantity))
      .slice(0, 10);
  }, [inventory, stock]);


  const handleExportCSV = () => {
    const headers = ['التاريخ', 'رقم الطلب', 'الإجمالي', 'الضريبة', 'الخصم', 'طريقة الدفع'].join(',');
    const rows = orders.map(o => {
      const date = o.created_at ? new Date(o.created_at).toLocaleString('ar-EG') : '';
      const pmLabel = o.payment_method === 'cash' || !o.payment_method ? 'كاش' : o.payment_method === 'card' ? 'بطاقة ائتمان' : o.payment_method === 'wallet' ? 'محفظة الكترونية' : 'أخرى';
      const parsedTotal = Number(o.total || 0);
      const deliveryFee = Number(o.delivery_fee || o.deliveryFee || 0);
      const netTotal = Math.max(0, parsedTotal - deliveryFee);
      return `${date},${o.id},${netTotal},${o.tax_amount || 0},${o.discount_amount || 0},${pmLabel}`;
    });
    
    const csvContent = "data:text/csv;charset=utf-8,\uFEFF" + [headers, ...rows].join('\n');
    const encodedUri = encodeURI(csvContent);
    const link = document.createElement('a');
    link.setAttribute('href', encodedUri);
    link.setAttribute('download', `sales_report_${new Date().toLocaleDateString('ar-EG').replace(/\//g, '-')}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };
  
  const handlePrint = () => {
    window.print();
  };

  return (
    <MainLayout title="التقارير والتحليلات" subtitle="نظرة شاملة على أداء عملياتك التجارية"
      actions={
        <div className="flex flex-wrap items-center gap-2 print:hidden w-full md:w-auto">
          <Select value={dateRange} onValueChange={setDateRange}>
            <SelectTrigger className="w-[140px] md:w-[150px] bg-background">
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
              <input type="date" value={customStartDate} onChange={e => setCustomStartDate(e.target.value)} className="flex h-9 w-full rounded-md border border-input bg-background px-2 py-1 text-xs md:text-sm shadow-sm transition-colors max-w-[120px]" />
              <span className="text-muted-foreground">-</span>
              <input type="date" value={customEndDate} onChange={e => setCustomEndDate(e.target.value)} className="flex h-9 w-full rounded-md border border-input bg-background px-2 py-1 text-xs md:text-sm shadow-sm transition-colors max-w-[120px]" />
            </div>
          )}

          <Button variant="outline" className="gap-2 px-2 md:px-4 shrink-0" onClick={handlePrint}><Printer className="w-4 h-4" /><span className="hidden sm:inline">طباعة</span></Button>
          <Button className="gap-2 px-2 md:px-4 shrink-0" onClick={handleExportCSV}><Download className="w-4 h-4" /><span className="hidden sm:inline">تصدير CSV</span></Button>
        </div>
      }>

      <Tabs defaultValue="overview" className="space-y-6">
        <TabsList className="bg-muted/50 w-full justify-start overflow-x-auto print:hidden">
          <TabsTrigger value="overview" className="gap-2"><Activity className="w-4 h-4" />نظرة عامة</TabsTrigger>
          <TabsTrigger value="sales" className="gap-2"><TrendingUp className="w-4 h-4" />المبيعات التفصيلية</TabsTrigger>
          <TabsTrigger value="products" className="gap-2"><Package className="w-4 h-4" />أداء المنتجات والمخزون</TabsTrigger>
          <TabsTrigger value="profit" className="gap-2"><DollarSign className="w-4 h-4" />صافي أرباح الأصناف</TabsTrigger>
        </TabsList>

        {loading ? (
          <div className="h-64 flex items-center justify-center">
            <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary"></div>
          </div>
        ) : (
          <>
            <TabsContent value="overview" className="space-y-6">
              <div className="grid grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4 md:gap-5">
                <Card className="hover:shadow-xl hover:shadow-primary/5 transition-all duration-300 hover:-translate-y-1 group relative overflow-hidden border-primary/10">
                  <div className="absolute -left-6 -bottom-6 opacity-[0.03] group-hover:opacity-[0.06] group-hover:scale-110 transition-all duration-500 pointer-events-none">
                    <Banknote className="w-40 h-40 text-primary" />
                  </div>
                  <CardContent className="p-4 md:p-6 relative z-10">
                    <div className="flex items-center justify-between mb-5">
                       <p className="text-sm font-medium text-muted-foreground group-hover:text-primary/80 transition-colors">الإيرادات (كاش)</p>
                       <div className="w-12 h-12 rounded-2xl bg-gradient-to-br from-primary/20 to-primary/5 flex items-center justify-center text-primary shadow-inner border border-primary/20 group-hover:scale-110 group-hover:rotate-3 transition-transform backdrop-blur-sm"><Banknote className="w-6 h-6" /></div>
                    </div>
                    <div><p className="text-2xl md:text-3xl font-extrabold tracking-tight drop-shadow-sm">{currency(stats.revenue)}</p></div>
                  </CardContent>
                </Card>
                <Card className="hover:shadow-xl hover:shadow-info/5 transition-all duration-300 hover:-translate-y-1 group relative overflow-hidden border-info/10">
                  <div className="absolute -left-6 -bottom-6 opacity-[0.03] group-hover:opacity-[0.06] group-hover:scale-110 transition-all duration-500 pointer-events-none">
                    <CreditCard className="w-40 h-40 text-info" />
                  </div>
                  <CardContent className="p-4 md:p-6 relative z-10">
                    <div className="flex items-center justify-between mb-5">
                       <p className="text-sm font-medium text-muted-foreground group-hover:text-info/80 transition-colors">الدفع الإلكتروني</p>
                       <div className="w-12 h-12 rounded-2xl bg-gradient-to-br from-info/20 to-info/5 flex items-center justify-center text-info shadow-inner border border-info/20 group-hover:scale-110 group-hover:rotate-3 transition-transform backdrop-blur-sm"><CreditCard className="w-6 h-6" /></div>
                    </div>
                    <div><p className="text-2xl md:text-3xl font-extrabold tracking-tight drop-shadow-sm">{currency(stats.electronicRevenue)}</p></div>
                  </CardContent>
                </Card>
                <Card className="hover:shadow-xl hover:shadow-destructive/5 transition-all duration-300 hover:-translate-y-1 group relative overflow-hidden border-destructive/20 bg-destructive/5">
                  <div className="absolute -left-6 -bottom-6 opacity-[0.03] group-hover:opacity-[0.06] group-hover:scale-110 transition-all duration-500 pointer-events-none">
                    <Activity className="w-40 h-40 text-destructive" />
                  </div>
                  <CardContent className="p-4 md:p-6 relative z-10">
                    <div className="flex items-center justify-between mb-5">
                       <p className="text-sm font-medium text-destructive/80 group-hover:text-destructive transition-colors">إجمالي المصروفات</p>
                       <div className="w-12 h-12 rounded-2xl bg-gradient-to-br from-destructive/20 to-destructive/5 flex items-center justify-center text-destructive shadow-inner border border-destructive/20 group-hover:scale-110 group-hover:rotate-3 transition-transform backdrop-blur-sm"><Activity className="w-6 h-6" /></div>
                    </div>
                    <div><p className="text-2xl md:text-3xl font-extrabold text-destructive tracking-tight drop-shadow-sm">{currency(stats.totalExpenses)}</p></div>
                  </CardContent>
                </Card>
                <Card className="hover:shadow-xl hover:shadow-destructive/5 transition-all duration-300 hover:-translate-y-1 group relative overflow-hidden border-destructive/20 bg-destructive/5">
                  <div className="absolute -left-6 -bottom-6 opacity-[0.03] group-hover:opacity-[0.06] group-hover:scale-110 transition-all duration-500 pointer-events-none">
                    <AlertTriangle className="w-40 h-40 text-destructive" />
                  </div>
                  <CardContent className="p-4 md:p-6 relative z-10">
                    <div className="flex items-center justify-between mb-5">
                       <p className="text-sm font-medium text-destructive/80 group-hover:text-destructive transition-colors">تكلفة التوالف</p>
                       <div className="w-12 h-12 rounded-2xl bg-gradient-to-br from-destructive/20 to-destructive/5 flex items-center justify-center text-destructive shadow-inner border border-destructive/20 group-hover:scale-110 group-hover:-rotate-3 transition-transform backdrop-blur-sm"><AlertTriangle className="w-6 h-6" /></div>
                    </div>
                    <div><p className="text-2xl md:text-3xl font-extrabold text-destructive tracking-tight drop-shadow-sm">{currency(stats.wasteCost)}</p></div>
                  </CardContent>
                </Card>
                <Card className="hover:shadow-xl hover:shadow-success/5 transition-all duration-300 hover:-translate-y-1 group relative overflow-hidden border-success/30 bg-success/5 lg:col-span-2 xl:col-span-1">
                  <div className="absolute -left-6 -bottom-6 opacity-[0.03] group-hover:opacity-[0.06] group-hover:scale-110 transition-all duration-500 pointer-events-none">
                    <TrendingUp className="w-40 h-40 text-success" />
                  </div>
                  <CardContent className="p-4 md:p-6 relative z-10">
                    <div className="flex items-center justify-between mb-5">
                      <p className="text-sm font-bold text-success/80 group-hover:text-success transition-colors">صافي الربح الحقيقي</p>
                      <div className="w-12 h-12 rounded-2xl bg-gradient-to-br from-success/30 to-success/10 flex items-center justify-center text-success shadow-inner border border-success/30 group-hover:scale-110 group-hover:-rotate-3 transition-transform backdrop-blur-sm"><TrendingUp className="w-6 h-6" /></div>
                    </div>
                    <div><p className="text-2xl md:text-3xl font-extrabold text-success tracking-tight drop-shadow-sm">{currency(stats.netProfit)}</p></div>
                  </CardContent>
                </Card>
                <Card className="hover:shadow-xl hover:shadow-amber-500/5 transition-all duration-300 hover:-translate-y-1 group relative overflow-hidden border-amber-500/10">
                  <div className="absolute -left-6 -bottom-6 opacity-[0.03] group-hover:opacity-[0.06] group-hover:scale-110 transition-all duration-500 pointer-events-none">
                    <BarChart3 className="w-40 h-40 text-amber-500" />
                  </div>
                  <CardContent className="p-4 md:p-6 relative z-10">
                    <div className="flex items-center justify-between mb-5">
                      <p className="text-sm font-medium text-muted-foreground group-hover:text-amber-600 transition-colors">متوسط الطلب</p>
                      <div className="w-12 h-12 rounded-2xl bg-gradient-to-br from-amber-500/20 to-amber-500/5 flex items-center justify-center text-amber-600 shadow-inner border border-amber-500/20 group-hover:scale-110 group-hover:rotate-3 transition-transform backdrop-blur-sm"><BarChart3 className="w-6 h-6" /></div>
                    </div>
                    <div><p className="text-2xl md:text-3xl font-extrabold tracking-tight drop-shadow-sm">{currency(stats.aov)}</p></div>
                  </CardContent>
                </Card>
                <Card className="hover:shadow-xl hover:shadow-purple-500/5 transition-all duration-300 hover:-translate-y-1 group relative overflow-hidden border-purple-500/10">
                  <div className="absolute -left-6 -bottom-6 opacity-[0.03] group-hover:opacity-[0.06] group-hover:scale-110 transition-all duration-500 pointer-events-none">
                    <ShoppingCart className="w-40 h-40 text-purple-500" />
                  </div>
                  <CardContent className="p-4 md:p-6 relative z-10">
                    <div className="flex items-center justify-between mb-5">
                      <p className="text-sm font-medium text-muted-foreground group-hover:text-purple-600 transition-colors">عدد الطلبات</p>
                      <div className="w-12 h-12 rounded-2xl bg-gradient-to-br from-purple-500/20 to-purple-500/5 flex items-center justify-center text-purple-600 shadow-inner border border-purple-500/20 group-hover:scale-110 group-hover:-rotate-3 transition-transform backdrop-blur-sm"><ShoppingCart className="w-6 h-6" /></div>
                    </div>
                    <div><p className="text-2xl md:text-3xl font-extrabold tracking-tight drop-shadow-sm">{number(stats.orders)}</p></div>
                  </CardContent>
                </Card>
              </div>

              <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
                <Card className="lg:col-span-2">
                  <CardHeader><CardTitle>تدرج المبيعات</CardTitle><CardDescription>مؤشر أداء الإيرادات عبر الزمن</CardDescription></CardHeader>
                  <CardContent>
                    {timelineData.length === 0 ? (
                      <p className="text-center text-muted-foreground py-12">لا توجد مبيعات في هذه الفترة.</p>
                    ) : (
                      <div className="h-[280px]">
                        <ResponsiveContainer width="100%" height="100%">
                          <AreaChart data={timelineData} margin={{ top: 10, right: 10, left: 10, bottom: 0 }}>
                            <defs><linearGradient id="salesGrad" x1="0" y1="0" x2="0" y2="1"><stop offset="5%" stopColor="hsl(var(--primary))" stopOpacity={0.3} /><stop offset="95%" stopColor="hsl(var(--primary))" stopOpacity={0} /></linearGradient></defs>
                            <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="hsl(var(--border))" />
                            <XAxis dataKey="name" tick={{ fontSize: 11 }} axisLine={false} tickLine={false} />
                            <YAxis tick={{ fontSize: 11 }} axisLine={false} tickLine={false} tickFormatter={(v) => `${number(v)}`} />
                            <RechartsTooltip contentStyle={{ backgroundColor: 'hsl(var(--card))', border: '1px solid hsl(var(--border))', borderRadius: '8px', color: 'hsl(var(--foreground))' }} formatter={(value: number) => [currency(value), 'إيرادات']} />
                            <Area type="monotone" dataKey="sales" stroke="hsl(var(--primary))" strokeWidth={3} fill="url(#salesGrad)" />
                          </AreaChart>
                        </ResponsiveContainer>
                      </div>
                    )}
                  </CardContent>
                </Card>

                <Card>
                  <CardHeader><CardTitle>طرق الدفع</CardTitle><CardDescription>توزيع الإيرادات حسب وسيلة الدفع</CardDescription></CardHeader>
                  <CardContent>
                    {paymentData.length === 0 ? (
                      <p className="text-center text-muted-foreground py-12">لا توجد بيانات</p>
                    ) : (
                      <div className="h-[280px]">
                        <ResponsiveContainer width="100%" height="100%">
                          <PieChart>
                            <Pie data={paymentData} cx="50%" cy="45%" innerRadius={60} outerRadius={80} paddingAngle={5} dataKey="value">
                              {paymentData.map((entry, index) => (
                                <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
                              ))}
                            </Pie>
                            <RechartsTooltip formatter={(value: number) => currency(value)} contentStyle={{ borderRadius: '8px' }} />
                            <Legend verticalAlign="bottom" height={36} iconType="circle" />
                          </PieChart>
                        </ResponsiveContainer>
                      </div>
                    )}
                  </CardContent>
                </Card>
              </div>
            </TabsContent>

            <TabsContent value="sales" className="space-y-6">
              <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                <Card className="hover:shadow-md transition-shadow">
                  <CardContent className="p-4">
                    <div className="flex justify-between items-center mb-2">
                       <p className="text-sm text-muted-foreground font-medium">إجمالي المبيعات</p>
                       <div className="w-8 h-8 rounded-full bg-primary/10 flex items-center justify-center text-primary"><Banknote className="w-4 h-4" /></div>
                    </div>
                    <p className="text-2xl font-bold">{currency(stats.revenue + stats.electronicRevenue)}</p>
                  </CardContent>
                </Card>
                <Card className="hover:shadow-md transition-shadow">
                  <CardContent className="p-4">
                    <div className="flex justify-between items-center mb-2">
                       <p className="text-sm text-muted-foreground font-medium">عدد الطلبات</p>
                       <div className="w-8 h-8 rounded-full bg-blue-100 flex items-center justify-center text-blue-600"><ShoppingCart className="w-4 h-4" /></div>
                    </div>
                    <p className="text-2xl font-bold">{stats.orders}</p>
                  </CardContent>
                </Card>
                <Card className="hover:shadow-md transition-shadow">
                  <CardContent className="p-4">
                    <div className="flex justify-between items-center mb-2">
                       <p className="text-sm text-muted-foreground font-medium">متوسط قيمة الطلب</p>
                       <div className="w-8 h-8 rounded-full bg-amber-100 flex items-center justify-center text-amber-600"><BarChart3 className="w-4 h-4" /></div>
                    </div>
                    <p className="text-2xl font-bold">{currency(stats.aov)}</p>
                  </CardContent>
                </Card>
                <Card className="hover:shadow-md transition-shadow">
                  <CardContent className="p-4">
                    <div className="flex justify-between items-center mb-2">
                       <p className="text-sm text-muted-foreground font-medium">قيمة الخصومات</p>
                       <div className="w-8 h-8 rounded-full bg-destructive/10 flex items-center justify-center text-destructive"><Percent className="w-4 h-4" /></div>
                    </div>
                    <p className="text-2xl font-bold text-destructive">{currency(stats.discount)}</p>
                  </CardContent>
                </Card>
              </div>

              <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                <Card>
                  <CardHeader><CardTitle>أوقات الذروة</CardTitle><CardDescription>حركة الطلبات المكتملة موزعة على ساعات اليوم</CardDescription></CardHeader>
                  <CardContent>
                    {peakHoursData.length === 0 ? (
                      <p className="text-center text-muted-foreground py-12">لا توجد بيانات لتحديد ساعات الذروة.</p>
                    ) : (
                      <div className="h-[280px]">
                        <ResponsiveContainer width="100%" height="100%">
                          <BarChart data={peakHoursData} margin={{ top: 20, right: 30, left: 20, bottom: 5 }}>
                            <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="hsl(var(--border))" />
                            <XAxis dataKey="time" tick={{ fontSize: 12 }} axisLine={false} tickLine={false} />
                            <YAxis tick={{ fontSize: 12 }} axisLine={false} tickLine={false} allowDecimals={false} />
                            <RechartsTooltip cursor={{fill: 'hsl(var(--muted)/0.5)'}} contentStyle={{ borderRadius: '8px' }} formatter={(value: number) => [number(value), 'طلب']} />
                            <Bar dataKey="orders" fill="hsl(var(--primary))" radius={[4, 4, 0, 0]} barSize={40} />
                          </BarChart>
                        </ResponsiveContainer>
                      </div>
                    )}
                  </CardContent>
                </Card>

                <Card>
                  <CardHeader><CardTitle>المبيعات حسب نوع الطلب</CardTitle><CardDescription>مقارنة الإيرادات بين الأنواع المختلفة (محلي، سفري، توصيل)</CardDescription></CardHeader>
                  <CardContent>
                    {salesByOrderTypeData.length === 0 ? (
                      <p className="text-center text-muted-foreground py-12">لا توجد بيانات</p>
                    ) : (
                      <div className="h-[280px]">
                        <ResponsiveContainer width="100%" height="100%">
                          <PieChart>
                            <Pie data={salesByOrderTypeData} cx="50%" cy="45%" innerRadius={60} outerRadius={80} paddingAngle={5} dataKey="value">
                              {salesByOrderTypeData.map((entry, index) => (
                                <Cell key={`cell-${index}`} fill={COLORS[(index + 4) % COLORS.length]} />
                              ))}
                            </Pie>
                            <RechartsTooltip formatter={(value: number) => currency(value)} contentStyle={{ borderRadius: '8px' }} />
                            <Legend verticalAlign="bottom" height={36} iconType="circle" />
                          </PieChart>
                        </ResponsiveContainer>
                      </div>
                    )}
                  </CardContent>
                </Card>
              </div>

              <Card>
                <CardHeader>
                  <CardTitle>أحدث الطلبات التفصيلية</CardTitle>
                  <CardDescription>آخر 50 طلب ضمن الفترة المحددة ({orders.length} طلب إجمالي)</CardDescription>
                </CardHeader>
                <CardContent>
                  <div className="overflow-x-auto">
                    <Table>
                      <TableHeader>
                        <TableRow className="bg-muted/10 hover:bg-muted/10">
                          <TableHead className="w-24">رقم الطلب</TableHead>
                          <TableHead>الوقت / التاريخ</TableHead>
                          <TableHead>العميل</TableHead>
                          <TableHead className="text-center">نوع الطلب</TableHead>
                          <TableHead className="text-center">طريقة الدفع</TableHead>
                          <TableHead className="text-left">الإجمالي (شامل)</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {orders.length === 0 ? (
                          <TableRow>
                            <TableCell colSpan={6} className="text-center py-8 text-muted-foreground">لا توجد طلبات في هذه الفترة</TableCell>
                          </TableRow>
                        ) : (
                          [...orders]
                            .sort((a, b) => new Date(b.created_at || 0).getTime() - new Date(a.created_at || 0).getTime())
                            .slice(0, 50)
                            .map((order, i) => {
                              const d = new Date(order.created_at);
                              const typeLabel = order.order_type === 'dine_in' ? 'محلي' : 
                                                order.order_type === 'takeaway' ? 'سفري' : 
                                                order.order_type === 'delivery' ? 'توصيل' : 'غير محدد';
                              
                              const pmLabel = order.payment_method === 'cash' || !order.payment_method ? 'كاش' : 
                                              order.payment_method === 'card' ? 'بطاقة ائتمان' : 
                                              order.payment_method === 'wallet' ? 'محفظة' : 'أخرى';

                              return (
                                <TableRow key={order.id || i} className="hover:bg-muted/5 transition-colors">
                                  <TableCell className="font-medium text-xs text-muted-foreground uppercase">#{order.order_number || order.orderNumber || order.id?.slice(0, 8)}</TableCell>
                                  <TableCell className="text-sm">{d.toLocaleString('ar-EG', { dateStyle: 'short', timeStyle: 'short' })}</TableCell>
                                  <TableCell className="font-medium">{order.customer_name || 'عميل عام'}</TableCell>
                                  <TableCell className="text-center"><Badge variant="outline" className="font-normal">{typeLabel}</Badge></TableCell>
                                  <TableCell className="text-center text-sm">{pmLabel}</TableCell>
                                  <TableCell className="text-left font-bold text-primary">{currency(Number(order.total || 0))}</TableCell>
                                </TableRow>
                              );
                            })
                        )}
                      </TableBody>
                    </Table>
                  </div>
                </CardContent>
              </Card>
            </TabsContent>

            <TabsContent value="products" className="space-y-6">
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                <Card>
                  <CardHeader><CardTitle>المنتجات الأكثر مبيعاً</CardTitle><CardDescription>أفضل 10 منتجات تحرك عجلة المبيعات</CardDescription></CardHeader>
                  <CardContent>
                    {topItems.length === 0 ? (
                      <p className="text-center text-muted-foreground py-8">لا توجد بيانات مبيعات</p>
                    ) : (
                      <Table>
                        <TableHeader>
                          <TableRow>
                            <TableHead className="w-12 text-center">#</TableHead>
                            <TableHead>المنتج</TableHead>
                            <TableHead className="text-center">الكمية المباعة</TableHead>
                            <TableHead className="text-left">الإيرادات</TableHead>
                          </TableRow>
                        </TableHeader>
                        <TableBody>
                          {topItems.map((item, index) => (
                            <TableRow key={index}>
                              <TableCell className="font-medium text-center">{index + 1}</TableCell>
                              <TableCell className="font-bold">{item.name}</TableCell>
                              <TableCell className="text-center"><Badge variant="outline">{number(item.count)}</Badge></TableCell>
                              <TableCell className="text-left font-bold text-success">{currency(item.revenue)}</TableCell>
                            </TableRow>
                          ))}
                        </TableBody>
                      </Table>
                    )}
                  </CardContent>
                </Card>

                <Card>
                  <CardHeader><div className="flex items-center gap-2 text-destructive"><AlertTriangle className="w-5 h-5"/><CardTitle>نواقص المخزون</CardTitle></div><CardDescription>مواد المخزون القريبة من النفاد (تتجاوز الحد الأدنى)</CardDescription></CardHeader>
                  <CardContent>
                    {lowStockItems.length === 0 ? (
                      <div className="flex flex-col items-center justify-center py-12 text-success gap-2">
                        <div className="w-12 h-12 rounded-full bg-success/10 flex items-center justify-center text-success"><Package className="w-6 h-6"/></div>
                        <p className="font-medium">المخزون بوضع جيد!</p>
                      </div>
                    ) : (
                      <Table>
                        <TableHeader>
                          <TableRow>
                            <TableHead>المادة المخزنية</TableHead>
                            <TableHead className="text-center">الوحدة</TableHead>
                            <TableHead className="text-center">الكمية المتوفرة</TableHead>
                            <TableHead className="text-left">الحد الأدنى</TableHead>
                          </TableRow>
                        </TableHeader>
                        <TableBody>
                          {lowStockItems.map((item, index) => (
                            <TableRow key={index} className="bg-destructive/5 hover:bg-destructive/10">
                              <TableCell className="font-bold">{item.name}</TableCell>
                              <TableCell className="text-center text-xs text-muted-foreground">{item.unit || item.unitName || '-'}</TableCell>
                              <TableCell className="text-center font-bold text-destructive">{number(Number(item.quantity) || 0)}</TableCell>
                              <TableCell className="text-left text-xs">{number(Number(item.min_stock_level) || 0)}</TableCell>
                            </TableRow>
                          ))}
                        </TableBody>
                      </Table>
                    )}
                  </CardContent>
                </Card>
              </div>
            </TabsContent>

            <TabsContent value="profit" className="space-y-6">
              <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                <Card className="hover:shadow-md transition-shadow border-success/30 bg-success/5">
                  <CardContent className="p-4">
                    <div className="flex justify-between items-center mb-2">
                       <p className="text-sm font-bold text-success">إجمالي صافي الربح</p>
                       <div className="w-8 h-8 rounded-full bg-success/20 flex items-center justify-center text-success"><DollarSign className="w-4 h-4" /></div>
                    </div>
                    <p className="text-2xl font-bold text-success">{currency(profitSummary.totalProfit)}</p>
                  </CardContent>
                </Card>
                <Card className="hover:shadow-md transition-shadow bg-blue-50/50 dark:bg-blue-900/10 border-blue-200 dark:border-blue-800">
                  <CardContent className="p-4">
                    <div className="flex justify-between items-center mb-2">
                       <p className="text-sm font-bold text-blue-600 dark:text-blue-400">متوسط هامش الربح</p>
                       <div className="w-8 h-8 rounded-full bg-blue-100 dark:bg-blue-900/50 flex items-center justify-center text-blue-600 dark:text-blue-400"><Percent className="w-4 h-4" /></div>
                    </div>
                    <p className="text-2xl font-bold text-blue-600 dark:text-blue-400">{profitSummary.averageMargin.toFixed(1)}%</p>
                  </CardContent>
                </Card>
                <Card className="hover:shadow-md transition-shadow">
                  <CardContent className="p-4">
                     <div className="flex justify-between items-center mb-2">
                       <p className="text-sm text-muted-foreground font-medium">أعلى صنف ربحية</p>
                       <div className="w-8 h-8 rounded-full bg-amber-100 dark:bg-amber-900/50 flex items-center justify-center text-amber-600 dark:text-amber-400"><BarChartIcon className="w-4 h-4" /></div>
                    </div>
                    <p className="text-lg font-bold truncate">{profitSummary.topProfitItem.name}</p>
                    <p className="text-xs text-success font-bold mt-1">{currency(profitSummary.topProfitItem.profit)}</p>
                  </CardContent>
                </Card>
                <Card className="hover:shadow-md transition-shadow">
                  <CardContent className="p-4">
                     <div className="flex justify-between items-center mb-2">
                       <p className="text-sm text-muted-foreground font-medium">الأكثر مبيعاً بالمقدار</p>
                       <div className="w-8 h-8 rounded-full bg-indigo-100 dark:bg-indigo-900/50 flex items-center justify-center text-indigo-600 dark:text-indigo-400"><Tag className="w-4 h-4" /></div>
                    </div>
                    <p className="text-lg font-bold truncate">{profitSummary.topVolumeItem.name}</p>
                    <p className="text-xs text-indigo-600 dark:text-indigo-400 font-bold mt-1">{number(profitSummary.topVolumeItem.count)} طلب</p>
                  </CardContent>
                </Card>
              </div>

              <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                 <Card>
                   <CardHeader><CardTitle>أعلى 10 أصناف ربحية</CardTitle><CardDescription>مساهمة الأصناف في الربح الصافي</CardDescription></CardHeader>
                   <CardContent>
                     {profitSummary.top10Profit.length === 0 ? <p className="text-center py-8 text-muted-foreground">لا توجد مبيعات</p> : (
                       <div className="h-[300px]">
                         <ResponsiveContainer width="100%" height="100%">
                           <BarChart data={profitSummary.top10Profit} layout="vertical" margin={{ top: 5, right: 30, left: 20, bottom: 5 }}>
                             <CartesianGrid strokeDasharray="3 3" horizontal={true} vertical={false} stroke="hsl(var(--border))" />
                             <XAxis type="number" tickFormatter={(v) => `${(v/1000).toFixed(1)}k`} axisLine={false} tickLine={false} />
                             <YAxis type="category" dataKey="name" tick={{ fontSize: 11 }} width={90} axisLine={false} tickLine={false} />
                             <RechartsTooltip cursor={{fill: 'hsl(var(--muted)/0.5)'}} formatter={(value: number) => [currency(value), 'صافي الربح']} contentStyle={{ borderRadius: '8px' }} />
                             <Bar dataKey="profit" fill="#10b981" radius={[0, 4, 4, 0]} barSize={25} />
                           </BarChart>
                         </ResponsiveContainer>
                       </div>
                     )}
                   </CardContent>
                 </Card>

                 <Card>
                   <CardHeader><CardTitle>الأصناف الأكثر طلباً</CardTitle><CardDescription>حصة المبيعات من الوحدات المباعة لافضل 5 أصناف</CardDescription></CardHeader>
                   <CardContent>
                     {profitSummary.top5Volume.length === 0 ? <p className="text-center py-8 text-muted-foreground">لا توجد مبيعات</p> : (
                       <div className="h-[300px]">
                         <ResponsiveContainer width="100%" height="100%">
                           <PieChart>
                             <Pie data={profitSummary.top5Volume} cx="50%" cy="45%" innerRadius={60} outerRadius={80} paddingAngle={5} dataKey="count" nameKey="name">
                               {profitSummary.top5Volume.map((entry, index) => (
                                 <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
                               ))}
                             </Pie>
                             <RechartsTooltip formatter={(value: number) => [number(value) + ' طلب', 'الكمية المباعة']} contentStyle={{ borderRadius: '8px' }} />
                             <Legend verticalAlign="bottom" height={36} iconType="circle" />
                           </PieChart>
                         </ResponsiveContainer>
                       </div>
                     )}
                   </CardContent>
                 </Card>
              </div>

              <Card>
                <CardHeader className="flex flex-col md:flex-row items-start md:items-center justify-between gap-4">
                  <div>
                    <CardTitle>تحليل صافي أرباح الأصناف التفصيلي</CardTitle>
                    <CardDescription>عرض تفصيلي لربحية كل صنف (سعر البيع ناقص سعر التكلفة)</CardDescription>
                  </div>
                  <div className="flex items-center gap-2 w-full md:w-auto">
                    <div className="relative flex-1 md:w-64">
                      <Search className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground w-4 h-4" />
                      <input 
                        type="text" 
                        placeholder="ابحث عن صنف أو فئة..." 
                        value={profitSearchTerm}
                        onChange={(e) => setProfitSearchTerm(e.target.value)}
                        className="w-full h-10 pl-3 pr-10 rounded-md border border-input bg-background text-sm ring-offset-background placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2" 
                      />
                    </div>
                    <Button variant="outline" size="icon" onClick={handleExportProfitCSV} title="تصدير كملف CSV">
                      <Download className="w-4 h-4" />
                    </Button>
                  </div>
                </CardHeader>
                <CardContent>
                  {filteredProfitItems.length === 0 ? (
                    <p className="text-center text-muted-foreground py-8">لا توجد بيانات مطابقة للبحث</p>
                  ) : (
                    <div className="overflow-x-auto">
                      <Table>
                        <TableHeader>
                          <TableRow className="bg-muted/10 hover:bg-muted/10">
                            <TableHead className="w-12 text-center">#</TableHead>
                            <TableHead>الصنف</TableHead>
                            <TableHead className="text-center">سعر البيع</TableHead>
                            <TableHead className="text-center">التكلفة</TableHead>
                            <TableHead className="text-center text-success">ربح الوحدة</TableHead>
                            <TableHead className="text-center">هامش الربح</TableHead>
                            <TableHead className="text-center">الكمية المباعة</TableHead>
                            <TableHead className="text-left text-success font-bold">إجمالي صافي الربح</TableHead>
                          </TableRow>
                        </TableHeader>
                        <TableBody>
                          {filteredProfitItems.map((item, index) => {
                            const isHighMargin = item.profitMargin >= 30;
                            const isLowMargin = item.profitMargin < 15;
                            return (
                            <TableRow key={index} className="hover:bg-muted/10 group">
                              <TableCell className="text-center text-muted-foreground">{index + 1}</TableCell>
                              <TableCell>
                                <p className="font-bold">{item.name}</p>
                                <p className="text-[10px] text-muted-foreground">{item.category}</p>
                              </TableCell>
                              <TableCell className="text-center">{currency(item.unitPrice)}</TableCell>
                              <TableCell className="text-center text-destructive">{currency(item.unitCost)}</TableCell>
                              <TableCell className="text-center font-bold text-success">{currency(item.unitPrice - item.unitCost)}</TableCell>
                              <TableCell className="text-center">
                                <Badge variant="outline" className={
                                  isHighMargin ? 'bg-success/10 text-success border-success/30' : 
                                  isLowMargin ? 'bg-destructive/10 text-destructive border-destructive/30' : 
                                  'bg-blue-500/10 text-blue-500 border-blue-500/30'
                                }>
                                  {item.profitMargin.toFixed(1)}%
                                </Badge>
                              </TableCell>
                              <TableCell className="text-center"><Badge variant="outline">{number(item.count)}</Badge></TableCell>
                              <TableCell className="text-left text-success font-bold text-lg">{currency(item.profit)}</TableCell>
                            </TableRow>
                          )})}
                        </TableBody>
                       </Table>
                     </div>
                  )}
                 </CardContent>
                </Card>
             </TabsContent>
          </>
        )}
      </Tabs>
      
      {/* Styles for printing inside component to simplify */}
      <style>{`
        @media print {
          body { background: white !important; }
          .print\\:hidden { display: none !important; }
          .shadow-sm, .shadow-md, .shadow-none { box-shadow: none !important; border: 1px solid #e2e8f0; }
          .bg-muted, .bg-background { background: white !important; }
        }
      `}</style>
    </MainLayout>
  );
}
