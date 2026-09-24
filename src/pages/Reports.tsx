import React, { useState, useEffect, useMemo, useCallback } from 'react';
import { MainLayout } from '@/components/layout';
import { useTenantBranch } from '@/hooks/useDatabase';
import { useAppStore } from '@/lib/store';
import { useFormatters } from '@/lib/formatters';
import {
  BarChart3,
  TrendingUp,
  DollarSign,
  Package,
  ShoppingCart,
  Users,
  Building2,
  Calendar,
  RefreshCw,
  Download,
  ArrowUpRight,
  ArrowDownRight,
  CreditCard,
  Wallet,
  Percent,
  AlertTriangle,
  Layers,
  Search,
  Eye,
  EyeOff,
  CheckCircle2,
  Clock,
  Sparkles,
  PieChart as PieIcon,
  Tag
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import {
  ResponsiveContainer,
  AreaChart,
  Area,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip as RechartsTooltip,
  CartesianGrid,
  PieChart,
  Pie,
  Cell,
  Legend
} from 'recharts';
import { toast } from 'sonner';

import {
  DatePreset,
  DEFAULT_TIMEZONE,
  getDateRangeFromPreset,
  formatZonedDate,
  parseToDate
} from '@/services/analytics/reportingTimezone';
import { fetchSalesPeriodData } from '@/services/analytics/salesAnalytics.service';
import { fetchProductsCatalog, fetchTenantStockBalances } from '@/services/analytics/inventoryAnalytics.service';
import { getExpenses } from '@/services/expenses';
import { fetchCategoriesFromDb } from '@/services/categories/categories.service';
import { db } from '@/lib/firebase';
import { collection, getDocs, query, where } from 'firebase/firestore';

const CHART_PALETTE = ['#3b82f6', '#10b981', '#f59e0b', '#ec4899', '#8b5cf6', '#06b6d4', '#f97316', '#64748b'];

interface SaleProductRow {
  id: string;
  name: string;
  category: string;
  unitsSold: number;
  totalRevenue: number;
  totalCost: number;
  grossProfit: number;
  marginPct: number;
}

interface CashierSummary {
  id: string;
  name: string;
  invoicesCount: number;
  totalSales: number;
  totalDiscounts: number;
  avgTicket: number;
}

export default function Reports() {
  const currentTenant = useAppStore((state) => state.currentTenant);
  const currentBranch = useAppStore((state) => state.currentBranch);
  const { tenantId: hookTenantId, branchId: hookBranchId } = useTenantBranch();
  const tenantId = currentTenant?.id || hookTenantId || '';
  const branchId = currentBranch?.id || hookBranchId || '';
  const { currency, number } = useFormatters();

  // Primary UI state
  const [activeTab, setActiveTab] = useState<string>('overview');
  const [loading, setLoading] = useState<boolean>(true);
  const [revealCosts, setRevealCosts] = useState<boolean>(true);

  // Filters (defaults to 'all' to immediately show entire sales invoice history)
  const [datePreset, setDatePreset] = useState<DatePreset>('all');
  const [customStart, setCustomStart] = useState<string>(() => {
    const d = new Date();
    d.setDate(1);
    return d.toISOString().split('T')[0];
  });
  const [customEnd, setCustomEnd] = useState<string>(() => new Date().toISOString().split('T')[0]);
  const [selectedBranch, setSelectedBranch] = useState<string>('all');
  const [timeZone, setTimeZone] = useState<string>(DEFAULT_TIMEZONE);
  const [searchFilter, setSearchFilter] = useState<string>('');

  // Loaded operational datasets
  const [salesRecords, setSalesRecords] = useState<any[]>([]);
  const [returnsRecords, setReturnsRecords] = useState<any[]>([]);
  const [stockRecords, setStockRecords] = useState<any[]>([]);
  const [productCatalog, setProductCatalog] = useState<Map<string, any>>(new Map());
  const [categoriesMap, setCategoriesMap] = useState<Map<string, string>>(new Map());
  const [branchesList, setBranchesList] = useState<{ id: string; name: string }[]>([]);
  const [expensesTotal, setExpensesTotal] = useState<number>(0);
  const [expensesList, setExpensesList] = useState<any[]>([]);

  // Calculate current date range bounds
  const activeDateRange = useMemo(() => {
    return getDateRangeFromPreset(datePreset, customStart, customEnd, timeZone);
  }, [datePreset, customStart, customEnd, timeZone]);

  // Main loader: pulls all live collections synchronously with zero data leakage
  const loadReportsData = useCallback(async () => {
    setLoading(true);
    try {
      const bId = selectedBranch === 'all' ? undefined : selectedBranch;

      // 1. Fetch sales & returns with full tenant fallbacks
      const salesPromise = fetchSalesPeriodData(tenantId, activeDateRange, bId, timeZone).catch(() => ({ sales: [], returns: [] }));

      // 2. Fetch stock records & product catalog
      const stockPromise = fetchTenantStockBalances(tenantId, bId).catch(() => []);
      const catalogPromise = fetchProductsCatalog(tenantId).catch(() => new Map());

      // 3. Fetch categories
      const categoriesPromise = fetchCategoriesFromDb(tenantId).catch(() => []);

      // 4. Fetch expenses
      const expensesPromise = getExpenses(tenantId).catch(() => []);

      // 5. Fetch registered branches
      const branchesPromise = (async () => {
        try {
          let bSnap = await getDocs(query(collection(db, 'branches'), where('tenantId', '==', tenantId)));
          if (bSnap.empty) {
            bSnap = await getDocs(query(collection(db, 'branches'), where('tenant_id', '==', tenantId)));
          }
          return bSnap.docs.map((d) => ({ id: d.id, name: d.data().name || 'فرع' }));
        } catch {
          return [];
        }
      })();

      const [salesData, stockData, catalogData, catData, expData, brData] = await Promise.all([
        salesPromise,
        stockPromise,
        catalogPromise,
        categoriesPromise,
        expensesPromise,
        branchesPromise
      ]);

      setSalesRecords(salesData.sales || []);
      setReturnsRecords(salesData.returns || []);
      setStockRecords(stockData || []);
      setProductCatalog(catalogData || new Map());

      const cMap = new Map<string, string>();
      catData.forEach((c: any) => {
        if (c.id && c.name) cMap.set(c.id, c.name);
        if (c.name) cMap.set(c.name, c.name);
      });
      setCategoriesMap(cMap);

      // Filter expenses for current date range
      const startMs = new Date(activeDateRange.startIso).getTime();
      const endMs = new Date(activeDateRange.endIso).getTime();
      const validExp = (expData || []).filter((ex: any) => {
        const exDate = parseToDate(ex.date || ex.createdAt);
        if (!exDate) return true;
        const ms = exDate.getTime();
        return ms >= startMs && ms <= endMs;
      });
      setExpensesList(validExp);
      const totalExp = validExp.reduce((sum: number, ex: any) => sum + Number(ex.amount || 0), 0);
      setExpensesTotal(totalExp);

      setBranchesList(brData);
    } catch (err: any) {
      console.error('Error loading comprehensive reports data:', err);
      toast.error('حدث خطأ أثناء تحميل بيانات التقارير والتحليلات');
    } finally {
      setLoading(false);
    }
  }, [tenantId, selectedBranch, activeDateRange, timeZone]);

  useEffect(() => {
    loadReportsData();
  }, [loadReportsData]);

  // =========================================================================
  // CORE FINANCIAL & SALES CALCULATIONS (100% REAL-TIME)
  // =========================================================================
  const metrics = useMemo(() => {
    let grossBilled = 0;
    let discounts = 0;
    let cogs = 0;
    let itemsSold = 0;
    let transactions = salesRecords.length;

    // Daily distribution map
    const dailyMap = new Map<string, { date: string; sales: number; profit: number; orders: number }>();

    // Payment methods map
    const payMap = new Map<string, number>();

    // Products sales map
    const prodMap = new Map<string, SaleProductRow>();

    // Cashier performance map
    const cashierMap = new Map<string, CashierSummary>();

    salesRecords.forEach((s) => {
      const sTotal = Number(s.total ?? s.total_amount ?? s.final_amount ?? 0);
      const sDisc = Number(s.discountTotal ?? s.discount ?? 0);
      const sSub = Number(s.subtotal ?? (sTotal + sDisc));

      grossBilled += sTotal;
      discounts += sDisc;

      // Cashier
      const cId = s.cashierId || s.createdBy || 'cashier_1';
      const cName = s.cashierNameSnapshot || s.cashierName || 'كاشير';
      const curCashier = cashierMap.get(cId) || {
        id: cId,
        name: cName,
        invoicesCount: 0,
        totalSales: 0,
        totalDiscounts: 0,
        avgTicket: 0,
      };
      curCashier.invoicesCount += 1;
      curCashier.totalSales += sTotal;
      curCashier.totalDiscounts += sDisc;
      cashierMap.set(cId, curCashier);

      // Payments
      const pMethods = s.paymentMethods || s.payments || [];
      if (pMethods.length > 0) {
        pMethods.forEach((p: any) => {
          const m = p.method === 'card' ? 'بطاقة بنكية' : p.method === 'credit' ? 'آجل' : 'نقدي';
          payMap.set(m, (payMap.get(m) || 0) + Number(p.amount || 0));
        });
      } else {
        payMap.set('نقدي', (payMap.get('نقدي') || 0) + sTotal);
      }

      // Items & COGS
      let saleCost = 0;
      (s.items || []).forEach((it: any) => {
        const qty = Number(it.baseQuantity || it.quantity || 1);
        itemsSold += qty;

        const prod = productCatalog.get(it.productId);
        const catalogCost = Number(prod?.costPrice ?? prod?.cost ?? 0);
        const unitCost = Number(it.unitCostSnapshot ?? it.costPriceSnapshot ?? (catalogCost > 0 ? catalogCost : 0));
        const lineCost = it.totalCost !== undefined ? Number(it.totalCost) : qty * unitCost;
        saleCost += lineCost;

        // Aggregate Product
        const pId = it.productId || it.id || 'misc';
        const pName = it.productNameSnapshot || it.productName || it.name || prod?.name || 'صنف مسجل';
        // Category resolution: match categoryId with user-registered name
        const rawCat = prod?.categoryId || prod?.category || it.categorySnapshot || it.categoryName;
        const pCat = (rawCat && categoriesMap.has(rawCat))
          ? categoriesMap.get(rawCat)!
          : (it.categorySnapshot && categoriesMap.has(it.categorySnapshot))
          ? categoriesMap.get(it.categorySnapshot)!
          : (categoriesMap.get(prod?.categoryId) || prod?.categoryName || it.categorySnapshot || prod?.category || 'عام');
        const lineRev = Number(it.lineTotal ?? it.total ?? (qty * Number(it.unitPrice || it.unitSellingPrice || 0)));

        const existingProd = prodMap.get(pId) || {
          id: pId,
          name: pName,
          category: pCat,
          unitsSold: 0,
          totalRevenue: 0,
          totalCost: 0,
          grossProfit: 0,
          marginPct: 0,
        };
        existingProd.unitsSold += qty;
        existingProd.totalRevenue += lineRev;
        existingProd.totalCost += lineCost;
        existingProd.grossProfit = Math.max(0, existingProd.totalRevenue - existingProd.totalCost);
        existingProd.marginPct = existingProd.totalRevenue > 0
          ? Math.round((existingProd.grossProfit / existingProd.totalRevenue) * 100)
          : 0;
        prodMap.set(pId, existingProd);
      });

      if (saleCost === 0 && s.costTotal) {
        saleCost = Number(s.costTotal);
      }
      cogs += saleCost;

      // Day grouping
      const sDateStr = formatZonedDate(s.createdAt, timeZone) || 'اليوم';
      const existingDay = dailyMap.get(sDateStr) || { date: sDateStr, sales: 0, profit: 0, orders: 0 };
      existingDay.sales += sTotal;
      existingDay.profit += Math.max(0, sTotal - saleCost);
      existingDay.orders += 1;
      dailyMap.set(sDateStr, existingDay);
    });

    // Returns
    let totalReturns = 0;
    returnsRecords.forEach((r) => {
      totalReturns += Number(r.refundAmount ?? r.total ?? 0);
    });

    const netSales = Math.max(0, grossBilled - totalReturns);
    const grossProfit = Math.max(0, netSales - cogs);
    const grossMarginPct = netSales > 0 ? Math.round((grossProfit / netSales) * 100) : 0;
    const avgTicket = transactions > 0 ? Math.round(netSales / transactions) : 0;
    const netIncome = grossProfit - expensesTotal;
    const netMarginPct = netSales > 0 ? Math.round((netIncome / netSales) * 100) : 0;

    // Daily Trend Array (sorted by date)
    const dailyTrend = Array.from(dailyMap.values()).sort((a, b) => a.date.localeCompare(b.date));

    // Payment Methods Breakdown Array
    const paymentBreakdown = Array.from(payMap.entries()).map(([name, value]) => ({ name, value }));

    // Top Products
    const topProducts = Array.from(prodMap.values()).sort((a, b) => b.totalRevenue - a.totalRevenue);

    // Cashiers
    const cashiers = Array.from(cashierMap.values()).map((c) => ({
      ...c,
      avgTicket: c.invoicesCount > 0 ? Math.round(c.totalSales / c.invoicesCount) : 0,
    })).sort((a, b) => b.totalSales - a.totalSales);

    // Inventory Valuation
    let totalStockUnits = 0;
    let totalCostValuation = 0;
    let totalRetailValuation = 0;
    let lowStockCount = 0;
    let outOfStockCount = 0;

    const stockItemsEnhanced = stockRecords.map((st) => {
      const prod = productCatalog.get(st.productId);
      const qty = Number(st.onHandQuantity ?? st.quantity ?? 0);
      const cost = Number(st.unitCost ?? st.averageCost ?? prod?.costPrice ?? prod?.cost ?? 0);
      const retail = Number(prod?.retailPrice ?? prod?.sellingPrice ?? prod?.price ?? cost);

      totalStockUnits += qty;
      totalCostValuation += qty * cost;
      totalRetailValuation += qty * retail;

      if (qty <= 0) outOfStockCount++;
      else if (qty <= Number(st.reorderPoint || 5)) lowStockCount++;

      return {
        ...st,
        name: prod?.name || st.productName || 'صنف',
        category: (prod?.categoryId && categoriesMap.has(prod.categoryId))
          ? categoriesMap.get(prod.categoryId)!
          : (categoriesMap.get(prod?.category) || prod?.categoryName || prod?.category || 'عام'),
        quantity: qty,
        unitCost: cost,
        retailPrice: retail,
        totalCost: qty * cost,
        totalRetail: qty * retail,
      };
    });

    // Synthesize products not yet in branch_stock if catalog has stock
    if (stockRecords.length === 0 && productCatalog.size > 0) {
      productCatalog.forEach((p) => {
        const qty = Number(p.stock ?? p.quantity ?? 0);
        const cost = Number(p.costPrice ?? p.cost ?? 0);
        const retail = Number(p.retailPrice ?? p.sellingPrice ?? p.price ?? cost);
        totalStockUnits += qty;
        totalCostValuation += qty * cost;
        totalRetailValuation += qty * retail;
        if (qty <= 0) outOfStockCount++;
        else if (qty <= 5) lowStockCount++;
      });
    }

    return {
      grossBilled,
      discounts,
      totalReturns,
      netSales,
      cogs,
      grossProfit,
      grossMarginPct,
      transactions,
      itemsSold,
      avgTicket,
      expensesTotal,
      netIncome,
      netMarginPct,
      dailyTrend,
      paymentBreakdown,
      topProducts,
      cashiers,
      totalStockUnits,
      totalCostValuation,
      totalRetailValuation,
      lowStockCount,
      outOfStockCount,
      stockItemsEnhanced,
    };
  }, [salesRecords, returnsRecords, stockRecords, productCatalog, categoriesMap, expensesTotal, timeZone]);

  // Filtered Products for the table
  const filteredProducts = useMemo(() => {
    if (!searchFilter.trim()) return metrics.topProducts;
    const q = searchFilter.toLowerCase();
    return metrics.topProducts.filter(
      (p) => p.name.toLowerCase().includes(q) || p.category.toLowerCase().includes(q)
    );
  }, [metrics.topProducts, searchFilter]);

  // CSV Exporter
  const handleExportCsv = () => {
    try {
      const headers = ['الصنف', 'القسم', 'الكمية المباعة', 'إجمالي المبيعات', 'التكلفة', 'الربح', 'الهامش'];
      const rows = metrics.topProducts.map((p) => [
        `"${p.name.replace(/"/g, '""')}"`,
        `"${p.category}"`,
        p.unitsSold,
        p.totalRevenue,
        p.totalCost,
        p.grossProfit,
        `${p.marginPct}%`,
      ]);
      const csvContent = '\uFEFF' + [headers.join(','), ...rows.map((r) => r.join(','))].join('\n');
      const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.setAttribute('href', url);
      link.setAttribute('download', `sales_report_${activeDateRange.startDate}_${activeDateRange.endDate}.csv`);
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      toast.success('تم تصدير التقرير بنجاح');
    } catch {
      toast.error('حدث خطأ أثناء تصدير التقرير');
    }
  };

  return (
    <MainLayout fullBleed={true}>
      {/* 
        EDGE-TO-EDGE DESKTOP COCKPIT & MOBILE FLUID CONTAINER
        Fills 100% of viewport without blank borders on desktop, scrolls fluidly on mobile
      */}
      <div className="w-full h-auto min-h-screen md:h-[calc(100vh-3.75rem)] flex flex-col md:overflow-hidden gap-2 p-1.5 sm:p-2.5 md:p-3 pb-24 md:pb-2.5" dir="rtl">
        
        {/* ========================================================================= */}
        {/* 1. TOP HEADER & HIGH-DENSITY FILTER TOOLBAR (FIXED VIEWPORT BAR)          */}
        {/* ========================================================================= */}
        <div className="bg-card border border-border/80 rounded-xl px-3 sm:px-4 py-2 shadow-sm shrink-0 flex flex-col md:flex-row md:items-center justify-between gap-2.5">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-gradient-to-tr from-blue-600 to-indigo-600 flex items-center justify-center text-white shadow-md shadow-blue-500/20 shrink-0">
              <BarChart3 className="w-5 h-5" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h1 className="text-lg font-black tracking-tight text-foreground">
                  مركز التقارير والذكاء المالي
                </h1>
                <Badge variant="outline" className="bg-emerald-500/10 text-emerald-500 border-emerald-500/20 text-[10px] px-2 py-0">
                  مباشر ومربوط 100%
                </Badge>
              </div>
              <p className="text-[11px] text-muted-foreground">
                المبيعات، المخزون، قائمة الدخل، وتحليلات الأداء التنفيذي
              </p>
            </div>
          </div>

          {/* Filter Toolbar Controls */}
          <div className="flex items-center flex-wrap gap-2">
            {/* Date Preset */}
            <Select value={datePreset} onValueChange={(v: DatePreset) => setDatePreset(v)}>
              <SelectTrigger className="h-8 text-xs w-[130px] font-medium bg-background border-border">
                <Calendar className="w-3.5 h-3.5 ml-1.5 opacity-60" />
                <SelectValue placeholder="الفترة الزمنية" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="today">اليوم</SelectItem>
                <SelectItem value="yesterday">أمس</SelectItem>
                <SelectItem value="last_7_days">آخر 7 أيام</SelectItem>
                <SelectItem value="this_month">هذا الشهر</SelectItem>
                <SelectItem value="last_month">الشهر الماضي</SelectItem>
                <SelectItem value="this_year">هذا العام</SelectItem>
                <SelectItem value="all">كل الفترات</SelectItem>
                <SelectItem value="custom">فترة مخصصة</SelectItem>
              </SelectContent>
            </Select>

            {/* Custom Range Popups if custom selected */}
            {datePreset === 'custom' && (
              <div className="flex items-center gap-1">
                <Input
                  type="date"
                  value={customStart}
                  onChange={(e) => setCustomStart(e.target.value)}
                  className="h-8 text-xs w-[115px] font-mono px-2"
                />
                <span className="text-xs text-muted-foreground">-</span>
                <Input
                  type="date"
                  value={customEnd}
                  onChange={(e) => setCustomEnd(e.target.value)}
                  className="h-8 text-xs w-[115px] font-mono px-2"
                />
              </div>
            )}

            {/* Branch Filter */}
            <Select value={selectedBranch} onValueChange={setSelectedBranch}>
              <SelectTrigger className="h-8 text-xs w-[135px] font-medium bg-background border-border">
                <Building2 className="w-3.5 h-3.5 ml-1.5 opacity-60" />
                <SelectValue placeholder="الفرع" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">كافة الفروع</SelectItem>
                {branchesList.map((b) => (
                  <SelectItem key={b.id} value={b.id}>
                    {b.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>

            {/* Cost Masking */}
            <Button
              variant="outline"
              size="sm"
              onClick={() => setRevealCosts(!revealCosts)}
              className="h-8 px-2.5 text-xs gap-1.5 border-border bg-background"
              title={revealCosts ? 'حجب التكاليف والأرباح' : 'إظهار التكاليف والأرباح'}
            >
              {revealCosts ? <EyeOff className="w-3.5 h-3.5 text-muted-foreground" /> : <Eye className="w-3.5 h-3.5 text-primary" />}
              <span className="hidden xl:inline">{revealCosts ? 'حجب التكاليف' : 'إظهار التكاليف'}</span>
            </Button>

            {/* Refresh */}
            <Button
              variant="outline"
              size="sm"
              onClick={loadReportsData}
              disabled={loading}
              className="h-8 px-2.5 text-xs gap-1.5 border-border bg-background"
            >
              <RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin text-primary' : ''}`} />
              <span className="hidden sm:inline">تحديث</span>
            </Button>

            {/* Export CSV */}
            <Button
              size="sm"
              onClick={handleExportCsv}
              className="h-8 px-3 text-xs gap-1.5 bg-primary text-primary-foreground hover:bg-primary/90"
            >
              <Download className="w-3.5 h-3.5" />
              <span>تصدير</span>
            </Button>
          </div>
        </div>

        {/* ========================================================================= */}
        {/* 2. EXECUTIVE 5-CARD KPI RIBBON (COMPACT, HIGH-DENSITY)                    */}
        {/* ========================================================================= */}
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-2.5 shrink-0">
          {/* Card 1: Net Sales */}
          <Card className="bg-card border-border/80 shadow-sm p-3 flex flex-col justify-between">
            <div className="flex items-center justify-between">
              <span className="text-[11px] font-bold text-muted-foreground">صافي المبيعات</span>
              <div className="w-7 h-7 rounded-lg bg-emerald-500/10 text-emerald-500 flex items-center justify-center">
                <DollarSign className="w-4 h-4" />
              </div>
            </div>
            <div className="mt-1">
              <div className="text-lg lg:text-xl font-black font-mono text-emerald-500 tracking-tight">
                {currency(metrics.netSales)}
              </div>
              <div className="flex items-center justify-between text-[10px] text-muted-foreground mt-0.5 font-medium">
                <span>فواتير: {number(metrics.transactions)}</span>
                <span className="text-rose-500">خصم: -{currency(metrics.discounts)}</span>
              </div>
            </div>
          </Card>

          {/* Card 2: Gross Profit */}
          <Card className="bg-card border-border/80 shadow-sm p-3 flex flex-col justify-between">
            <div className="flex items-center justify-between">
              <span className="text-[11px] font-bold text-muted-foreground">مجمل الربح التجاري</span>
              <div className="w-7 h-7 rounded-lg bg-blue-500/10 text-blue-500 flex items-center justify-center">
                <TrendingUp className="w-4 h-4" />
              </div>
            </div>
            <div className="mt-1">
              <div className="text-lg lg:text-xl font-black font-mono text-blue-500 tracking-tight">
                {revealCosts ? currency(metrics.grossProfit) : '••••••'}
              </div>
              <div className="flex items-center justify-between text-[10px] text-muted-foreground mt-0.5 font-medium">
                <span>الهامش: {revealCosts ? `${metrics.grossMarginPct}%` : '•••'}</span>
                <span>تكلفة: {revealCosts ? currency(metrics.cogs) : '•••'}</span>
              </div>
            </div>
          </Card>

          {/* Card 3: Inventory Valuation */}
          <Card className="bg-card border-border/80 shadow-sm p-3 flex flex-col justify-between">
            <div className="flex items-center justify-between">
              <span className="text-[11px] font-bold text-muted-foreground">قيمة المخزون الحالي</span>
              <div className="w-7 h-7 rounded-lg bg-amber-500/10 text-amber-500 flex items-center justify-center">
                <Package className="w-4 h-4" />
              </div>
            </div>
            <div className="mt-1">
              <div className="text-lg lg:text-xl font-black font-mono text-amber-500 tracking-tight">
                {revealCosts ? currency(metrics.totalCostValuation) : currency(metrics.totalRetailValuation)}
              </div>
              <div className="flex items-center justify-between text-[10px] text-muted-foreground mt-0.5 font-medium">
                <span>القطع: {number(metrics.totalStockUnits)}</span>
                <span className="text-emerald-500 font-medium">البيع: {currency(metrics.totalRetailValuation)}</span>
              </div>
            </div>
          </Card>

          {/* Card 4: Operating Expenses */}
          <Card className="bg-card border-border/80 shadow-sm p-3 flex flex-col justify-between">
            <div className="flex items-center justify-between">
              <span className="text-[11px] font-bold text-muted-foreground">المصروفات التشغيلية</span>
              <div className="w-7 h-7 rounded-lg bg-rose-500/10 text-rose-500 flex items-center justify-center">
                <Wallet className="w-4 h-4" />
              </div>
            </div>
            <div className="mt-1">
              <div className="text-lg lg:text-xl font-black font-mono text-rose-500 tracking-tight">
                {currency(metrics.expensesTotal)}
              </div>
              <div className="flex items-center justify-between text-[10px] text-muted-foreground mt-0.5 font-medium">
                <span>سجلات: {number(expensesList.length)}</span>
                <span>متوسط الفاتورة: {currency(metrics.avgTicket)}</span>
              </div>
            </div>
          </Card>

          {/* Card 5: Net Profit (Bottom Line) */}
          <Card className={`border-border/80 shadow-sm p-3 flex flex-col justify-between col-span-2 sm:col-span-1 ${
            metrics.netIncome >= 0 ? 'bg-gradient-to-br from-emerald-500/10 via-card to-card border-emerald-500/30' : 'bg-gradient-to-br from-rose-500/10 via-card to-card border-rose-500/30'
          }`}>
            <div className="flex items-center justify-between">
              <span className="text-[11px] font-bold text-muted-foreground">صافي الدخل النهائي</span>
              <div className={`w-7 h-7 rounded-lg flex items-center justify-center ${
                metrics.netIncome >= 0 ? 'bg-emerald-500/20 text-emerald-500' : 'bg-rose-500/20 text-rose-500'
              }`}>
                {metrics.netIncome >= 0 ? <ArrowUpRight className="w-4 h-4" /> : <ArrowDownRight className="w-4 h-4" />}
              </div>
            </div>
            <div className="mt-1">
              <div className={`text-lg lg:text-xl font-black font-mono tracking-tight ${
                metrics.netIncome >= 0 ? 'text-emerald-400' : 'text-rose-400'
              }`}>
                {revealCosts ? currency(metrics.netIncome) : '••••••'}
              </div>
              <div className="flex items-center justify-between text-[10px] text-muted-foreground mt-0.5 font-medium">
                <span>صافي الهامش: {revealCosts ? `${metrics.netMarginPct}%` : '•••'}</span>
                <span>القطع المباعة: {number(metrics.itemsSold)}</span>
              </div>
            </div>
          </Card>
        </div>

        {/* ========================================================================= */}
        {/* 3. INTERACTIVE SUB-COCKPITS (EXPANDED TO OCCUPY REMAINING SCREEN)          */}
        {/* ========================================================================= */}
        <Tabs value={activeTab} onValueChange={setActiveTab} className="flex-1 flex flex-col md:overflow-hidden min-h-0">
          {/* Tabs Navigation Header */}
          <div className="bg-card border border-border/80 rounded-xl p-1 shrink-0 flex items-center justify-between overflow-x-auto">
            <TabsList className="bg-transparent h-auto p-0 gap-1 flex flex-nowrap shrink-0">
              <TabsTrigger
                value="overview"
                className="h-7 text-xs font-bold px-3 gap-1.5 data-[state=active]:bg-primary data-[state=active]:text-primary-foreground rounded-lg"
              >
                <TrendingUp className="w-3.5 h-3.5" />
                المؤشرات العامة والمسار
              </TabsTrigger>
              <TabsTrigger
                value="products"
                className="h-7 text-xs font-bold px-3 gap-1.5 data-[state=active]:bg-primary data-[state=active]:text-primary-foreground rounded-lg"
              >
                <ShoppingCart className="w-3.5 h-3.5" />
                المبيعات وسلة الأصناف
              </TabsTrigger>
              <TabsTrigger
                value="inventory"
                className="h-7 text-xs font-bold px-3 gap-1.5 data-[state=active]:bg-primary data-[state=active]:text-primary-foreground rounded-lg"
              >
                <Package className="w-3.5 h-3.5" />
                تقييم وصحة المخزون
              </TabsTrigger>
              <TabsTrigger
                value="cashiers"
                className="h-7 text-xs font-bold px-3 gap-1.5 data-[state=active]:bg-primary data-[state=active]:text-primary-foreground rounded-lg"
              >
                <Users className="w-3.5 h-3.5" />
                الكاشير والفروع
              </TabsTrigger>
              <TabsTrigger
                value="financials"
                className="h-7 text-xs font-bold px-3 gap-1.5 data-[state=active]:bg-primary data-[state=active]:text-primary-foreground rounded-lg"
              >
                <Layers className="w-3.5 h-3.5" />
                قائمة الدخل والأرباح (P&L)
              </TabsTrigger>
            </TabsList>

            <span className="text-[11px] text-muted-foreground font-mono hidden md:inline px-3">
              {activeDateRange.startDate} ⟵ {activeDateRange.endDate}
            </span>
          </div>

          {/* TAB CONTENT 1: OVERVIEW */}
          <TabsContent value="overview" className="flex-1 overflow-y-auto md:overflow-hidden min-h-0 pt-2 mt-0 data-[state=active]:flex data-[state=active]:flex-col">
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-2.5 flex-1 min-h-0">
              {/* Left 2 Cols: Sales & Profit Chart */}
              <Card className="lg:col-span-2 border-border/80 bg-card p-3.5 flex flex-col overflow-hidden">
                <div className="flex items-center justify-between pb-2 border-b border-border/60 shrink-0">
                  <div>
                    <h3 className="text-sm font-bold text-foreground flex items-center gap-1.5">
                      <Sparkles className="w-4 h-4 text-blue-500" />
                      مسار صافي المبيعات والربح اليومي
                    </h3>
                    <p className="text-[11px] text-muted-foreground">حركة الإيرادات والربح المحقق خلال الفترة المحددة</p>
                  </div>
                  <div className="flex items-center gap-3 text-xs font-medium">
                    <span className="flex items-center gap-1">
                      <span className="w-2.5 h-2.5 rounded-full bg-blue-500 inline-block" />
                      المبيعات
                    </span>
                    {revealCosts && (
                      <span className="flex items-center gap-1">
                        <span className="w-2.5 h-2.5 rounded-full bg-emerald-500 inline-block" />
                        مجمل الربح
                      </span>
                    )}
                  </div>
                </div>

                <div className="flex-1 min-h-0 pt-2">
                  {metrics.dailyTrend.length > 0 ? (
                    <ResponsiveContainer width="100%" height="100%">
                      <AreaChart data={metrics.dailyTrend} margin={{ top: 10, right: 10, left: -20, bottom: 0 }}>
                        <defs>
                          <linearGradient id="salesGrad" x1="0" y1="0" x2="0" y2="1">
                            <stop offset="5%" stopColor="#3b82f6" stopOpacity={0.3} />
                            <stop offset="95%" stopColor="#3b82f6" stopOpacity={0.0} />
                          </linearGradient>
                          <linearGradient id="profitGrad" x1="0" y1="0" x2="0" y2="1">
                            <stop offset="5%" stopColor="#10b981" stopOpacity={0.3} />
                            <stop offset="95%" stopColor="#10b981" stopOpacity={0.0} />
                          </linearGradient>
                        </defs>
                        <CartesianGrid strokeDasharray="3 3" opacity={0.15} vertical={false} />
                        <XAxis dataKey="date" tick={{ fontSize: 10 }} stroke="#888888" />
                        <YAxis tick={{ fontSize: 10 }} stroke="#888888" />
                        <RechartsTooltip
                          contentStyle={{
                            backgroundColor: 'hsl(var(--card))',
                            borderColor: 'hsl(var(--border))',
                            borderRadius: '0.5rem',
                            fontSize: '11px',
                            direction: 'rtl',
                          }}
                          formatter={(value: any) => [currency(Number(value)), '']}
                        />
                        <Area type="monotone" dataKey="sales" name="المبيعات" stroke="#3b82f6" strokeWidth={2} fillOpacity={1} fill="url(#salesGrad)" />
                        {revealCosts && (
                          <Area type="monotone" dataKey="profit" name="مجمل الربح" stroke="#10b981" strokeWidth={2} fillOpacity={1} fill="url(#profitGrad)" />
                        )}
                      </AreaChart>
                    </ResponsiveContainer>
                  ) : (
                    <div className="h-full flex flex-col items-center justify-center text-muted-foreground text-xs">
                      <BarChart3 className="w-10 h-10 mb-2 opacity-30" />
                      لا توجد بيانات مبيعات مسجلة في هذه الفترة
                    </div>
                  )}
                </div>
              </Card>

              {/* Right Col: Payment Methods & Quick Snapshot */}
              <div className="flex flex-col gap-2.5 min-h-0">
                {/* Payment Methods */}
                <Card className="border-border/80 bg-card p-3 flex-1 flex flex-col min-h-0">
                  <h3 className="text-xs font-bold text-foreground pb-1.5 border-b border-border/60 flex items-center gap-1.5 shrink-0">
                    <CreditCard className="w-3.5 h-3.5 text-emerald-500" />
                    توزيع وسائل التحصيل والدفع
                  </h3>
                  <div className="flex-1 min-h-0 pt-1">
                    {metrics.paymentBreakdown.length > 0 ? (
                      <ResponsiveContainer width="100%" height="100%">
                        <PieChart>
                          <Pie
                            data={metrics.paymentBreakdown}
                            cx="50%"
                            cy="50%"
                            innerRadius={40}
                            outerRadius={65}
                            paddingAngle={3}
                            dataKey="value"
                          >
                            {metrics.paymentBreakdown.map((_, idx) => (
                              <Cell key={`cell-${idx}`} fill={CHART_PALETTE[idx % CHART_PALETTE.length]} />
                            ))}
                          </Pie>
                          <RechartsTooltip formatter={(val: any) => currency(Number(val))} />
                          <Legend wrapperStyle={{ fontSize: '11px' }} />
                        </PieChart>
                      </ResponsiveContainer>
                    ) : (
                      <div className="h-full flex items-center justify-center text-xs text-muted-foreground">
                        لا توجد مدفوعات مسجلة
                      </div>
                    )}
                  </div>
                </Card>

                {/* Quick Performance Summary Card */}
                <Card className="border-border/80 bg-card p-3 shrink-0 space-y-2 text-xs">
                  <h4 className="font-bold text-foreground text-xs border-b border-border/60 pb-1 flex items-center gap-1">
                    <CheckCircle2 className="w-3.5 h-3.5 text-blue-400" />
                    ملخص الإنتاجية والتشغيل
                  </h4>
                  <div className="grid grid-cols-2 gap-2 text-[11px]">
                    <div className="bg-muted/30 p-2 rounded-lg border border-border/50">
                      <span className="text-muted-foreground block text-[10px]">متوسط الفاتورة</span>
                      <span className="font-bold font-mono text-foreground">{currency(metrics.avgTicket)}</span>
                    </div>
                    <div className="bg-muted/30 p-2 rounded-lg border border-border/50">
                      <span className="text-muted-foreground block text-[10px]">القطع / فاتورة</span>
                      <span className="font-bold font-mono text-foreground">
                        {metrics.transactions > 0 ? (metrics.itemsSold / metrics.transactions).toFixed(1) : 0} قطعة
                      </span>
                    </div>
                    <div className="bg-muted/30 p-2 rounded-lg border border-border/50">
                      <span className="text-muted-foreground block text-[10px]">أصناف منخفضة</span>
                      <span className="font-bold font-mono text-amber-500">{number(metrics.lowStockCount)} صنف</span>
                    </div>
                    <div className="bg-muted/30 p-2 rounded-lg border border-border/50">
                      <span className="text-muted-foreground block text-[10px]">أصناف نافذة</span>
                      <span className="font-bold font-mono text-rose-500">{number(metrics.outOfStockCount)} صنف</span>
                    </div>
                  </div>
                </Card>
              </div>
            </div>
          </TabsContent>

          {/* TAB CONTENT 2: SALES & PRODUCTS */}
          <TabsContent value="products" className="flex-1 overflow-y-auto md:overflow-hidden min-h-0 pt-2 mt-0 data-[state=active]:flex data-[state=active]:flex-col">
            <Card className="border-border/80 bg-card p-3 flex-1 flex flex-col min-h-0">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 pb-2.5 border-b border-border/60 shrink-0">
                <div>
                  <h3 className="text-sm font-bold text-foreground">تحليل مبيعات الأصناف والأقسام الأكثر ربحية</h3>
                  <p className="text-[11px] text-muted-foreground">ترتيب الأصناف بحسب إجمالي الإيرادات والكميات المحققة</p>
                </div>
                <div className="relative w-full sm:w-64">
                  <Search className="w-3.5 h-3.5 absolute right-2.5 top-2.5 text-muted-foreground" />
                  <Input
                    placeholder="بحث في الأصناف والأقسام..."
                    value={searchFilter}
                    onChange={(e) => setSearchFilter(e.target.value)}
                    className="h-8 pr-8 text-xs bg-background"
                  />
                </div>
              </div>

              {/* Internal Smooth Scrollable Table Container */}
              <div className="flex-1 overflow-x-auto overflow-y-auto min-h-0 pt-1">
                <table className="w-full min-w-[650px] text-xs text-right">
                  <thead className="sticky top-0 bg-card text-muted-foreground font-semibold border-b border-border/60 z-10 text-[11px]">
                    <tr>
                      <th className="py-2 px-3">اسم الصنف / الكتاب</th>
                      <th className="py-2 px-3">القسم</th>
                      <th className="py-2 px-3 text-center">الكمية المباعة</th>
                      <th className="py-2 px-3 text-left">إجمالي المبيعات</th>
                      {revealCosts && (
                        <>
                          <th className="py-2 px-3 text-left">التكلفة</th>
                          <th className="py-2 px-3 text-left">مجمل الربح</th>
                          <th className="py-2 px-3 text-center">هامش الربح</th>
                        </>
                      )}
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-border/40">
                    {filteredProducts.map((p, idx) => (
                      <tr key={p.id} className="hover:bg-muted/30 transition-colors">
                        <td className="py-2 px-3 font-medium text-foreground flex items-center gap-2">
                          <span className="w-5 h-5 rounded-full bg-primary/10 text-primary flex items-center justify-center text-[10px] font-bold shrink-0">
                            {idx + 1}
                          </span>
                          <span className="truncate max-w-xs">{p.name}</span>
                        </td>
                        <td className="py-2 px-3 text-muted-foreground">
                          <Badge variant="outline" className="text-[10px] font-normal py-0">
                            {p.category}
                          </Badge>
                        </td>
                        <td className="py-2 px-3 text-center font-mono font-bold">{number(p.unitsSold)}</td>
                        <td className="py-2 px-3 text-left font-mono font-bold text-emerald-500" dir="ltr">
                          {currency(p.totalRevenue)}
                        </td>
                        {revealCosts && (
                          <>
                            <td className="py-2 px-3 text-left font-mono text-muted-foreground" dir="ltr">
                              {currency(p.totalCost)}
                            </td>
                            <td className="py-2 px-3 text-left font-mono font-bold text-blue-500" dir="ltr">
                              {currency(p.grossProfit)}
                            </td>
                            <td className="py-2 px-3 text-center font-mono">
                              <Badge variant="outline" className={`text-[10px] ${
                                p.marginPct >= 25 ? 'text-emerald-500 border-emerald-500/30' : p.marginPct >= 10 ? 'text-blue-500 border-blue-500/30' : 'text-amber-500 border-amber-500/30'
                              }`}>
                                {p.marginPct}%
                              </Badge>
                            </td>
                          </>
                        )}
                      </tr>
                    ))}
                    {filteredProducts.length === 0 && (
                      <tr>
                        <td colSpan={7} className="text-center py-12 text-muted-foreground text-xs">
                          لا توجد مبيعات مسجلة مطابقة في هذه الفترة
                        </td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>
            </Card>
          </TabsContent>

          {/* TAB CONTENT 3: INVENTORY & HEALTH */}
          <TabsContent value="inventory" className="flex-1 overflow-y-auto md:overflow-hidden min-h-0 pt-2 mt-0 data-[state=active]:flex data-[state=active]:flex-col">
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-2.5 flex-1 min-h-0">
              {/* Left Col: Stock Alerts */}
              <Card className="border-border/80 bg-card p-3 flex flex-col min-h-0">
                <h3 className="text-xs font-bold text-foreground pb-2 border-b border-border/60 flex items-center gap-1.5 shrink-0">
                  <AlertTriangle className="w-4 h-4 text-amber-500" />
                  تنبيهات نواقص المخزون ونقاط الطلب
                </h3>
                <div className="flex-1 overflow-y-auto min-h-0 pt-1 divide-y divide-border/40">
                  {metrics.stockItemsEnhanced
                    .filter((i) => i.quantity <= Number(i.reorderPoint || 5))
                    .slice(0, 50)
                    .map((item) => (
                      <div key={item.id} className="py-2 flex items-center justify-between text-xs">
                        <div>
                          <p className="font-medium text-foreground">{item.name}</p>
                          <span className="text-[10px] text-muted-foreground">القسم: {item.category}</span>
                        </div>
                        <div className="text-left">
                          <Badge variant="outline" className={item.quantity <= 0 ? 'bg-rose-500/10 text-rose-500 border-rose-500/30' : 'bg-amber-500/10 text-amber-500 border-amber-500/30'}>
                            {item.quantity <= 0 ? 'نافذ تماماً' : `متبقي: ${item.quantity}`}
                          </Badge>
                          <span className="block text-[10px] font-mono text-muted-foreground mt-0.5" dir="ltr">
                            {currency(item.retailPrice)}
                          </span>
                        </div>
                      </div>
                    ))}
                  {metrics.stockItemsEnhanced.filter((i) => i.quantity <= Number(i.reorderPoint || 5)).length === 0 && (
                    <div className="h-full flex flex-col items-center justify-center text-muted-foreground text-xs py-8">
                      <CheckCircle2 className="w-8 h-8 text-emerald-500 mb-2 opacity-50" />
                      كافة الأصناف متوفرة بأرصدة آمنة
                    </div>
                  )}
                </div>
              </Card>

              {/* Right 2 Cols: Full Inventory Valuation Table */}
              <Card className="lg:col-span-2 border-border/80 bg-card p-3 flex flex-col min-h-0">
                <div className="flex items-center justify-between pb-2 border-b border-border/60 shrink-0">
                  <div>
                    <h3 className="text-sm font-bold text-foreground">بيان تقييم المخزون الحالي وأرصدة المستودعات</h3>
                    <p className="text-[11px] text-muted-foreground">
                      إجمالي القيمة بسعر التكلفة: <span className="font-bold text-amber-500 font-mono">{currency(metrics.totalCostValuation)}</span>
                    </p>
                  </div>
                </div>
                <div className="flex-1 overflow-x-auto overflow-y-auto min-h-0 pt-1">
                  <table className="w-full min-w-[620px] text-xs text-right">
                    <thead className="sticky top-0 bg-card text-muted-foreground font-semibold border-b border-border/60 z-10 text-[11px]">
                      <tr>
                        <th className="py-2 px-3">الصنف</th>
                        <th className="py-2 px-3">القسم</th>
                        <th className="py-2 px-3 text-center">الرصيد المتاح</th>
                        <th className="py-2 px-3 text-left">سعر التكلفة</th>
                        <th className="py-2 px-3 text-left">سعر البيع</th>
                        <th className="py-2 px-3 text-left">إجمالي القيمة</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-border/40">
                      {metrics.stockItemsEnhanced.slice(0, 100).map((s) => (
                        <tr key={s.id} className="hover:bg-muted/30 transition-colors">
                          <td className="py-2 px-3 font-medium text-foreground">{s.name}</td>
                          <td className="py-2 px-3 text-muted-foreground">{s.category}</td>
                          <td className="py-2 px-3 text-center font-mono font-bold">
                            <span className={s.quantity <= 0 ? 'text-rose-500' : 'text-foreground'}>
                              {number(s.quantity)}
                            </span>
                          </td>
                          <td className="py-2 px-3 text-left font-mono" dir="ltr">
                            {revealCosts ? currency(s.unitCost) : '•••'}
                          </td>
                          <td className="py-2 px-3 text-left font-mono" dir="ltr">{currency(s.retailPrice)}</td>
                          <td className="py-2 px-3 text-left font-mono font-bold text-emerald-500" dir="ltr">
                            {revealCosts ? currency(s.totalCost) : currency(s.totalRetail)}
                          </td>
                        </tr>
                      ))}
                      {metrics.stockItemsEnhanced.length === 0 && (
                        <tr>
                          <td colSpan={6} className="text-center py-12 text-muted-foreground text-xs">
                            لا توجد أصناف مسجلة في المخزون
                          </td>
                        </tr>
                      )}
                    </tbody>
                  </table>
                </div>
              </Card>
            </div>
          </TabsContent>

          {/* TAB CONTENT 4: CASHIERS & BRANCHES */}
          <TabsContent value="cashiers" className="flex-1 overflow-y-auto md:overflow-hidden min-h-0 pt-2 mt-0 data-[state=active]:flex data-[state=active]:flex-col">
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-2.5 flex-1 min-h-0">
              {/* Cashiers Performance Table */}
              <Card className="border-border/80 bg-card p-3 flex flex-col min-h-0">
                <h3 className="text-sm font-bold text-foreground pb-2 border-b border-border/60 flex items-center gap-1.5 shrink-0">
                  <Users className="w-4 h-4 text-primary" />
                  إنتاجية ومبيعات الكاشير والموظفين
                </h3>
                <div className="flex-1 overflow-x-auto overflow-y-auto min-h-0 pt-1">
                  <table className="w-full min-w-[500px] text-xs text-right">
                    <thead className="sticky top-0 bg-card text-muted-foreground font-semibold border-b border-border/60 z-10 text-[11px]">
                      <tr>
                        <th className="py-2 px-3">اسم الكاشير</th>
                        <th className="py-2 px-3 text-center">عدد الفواتير</th>
                        <th className="py-2 px-3 text-left">إجمالي المبيعات</th>
                        <th className="py-2 px-3 text-left">متوسط الفاتورة</th>
                        <th className="py-2 px-3 text-left">الخصومات الممنوحة</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-border/40">
                      {metrics.cashiers.map((c) => (
                        <tr key={c.id} className="hover:bg-muted/30 transition-colors">
                          <td className="py-2.5 px-3 font-medium text-foreground">{c.name}</td>
                          <td className="py-2.5 px-3 text-center font-mono font-bold">{number(c.invoicesCount)}</td>
                          <td className="py-2.5 px-3 text-left font-mono font-bold text-emerald-500" dir="ltr">
                            {currency(c.totalSales)}
                          </td>
                          <td className="py-2.5 px-3 text-left font-mono text-muted-foreground" dir="ltr">
                            {currency(c.avgTicket)}
                          </td>
                          <td className="py-2.5 px-3 text-left font-mono text-rose-500" dir="ltr">
                            {currency(c.totalDiscounts)}
                          </td>
                        </tr>
                      ))}
                      {metrics.cashiers.length === 0 && (
                        <tr>
                          <td colSpan={5} className="text-center py-10 text-muted-foreground">
                            لا توجد عمليات بيع منفذة
                          </td>
                        </tr>
                      )}
                    </tbody>
                  </table>
                </div>
              </Card>

              {/* Branches Comparison */}
              <Card className="border-border/80 bg-card p-3 flex flex-col min-h-0">
                <h3 className="text-sm font-bold text-foreground pb-2 border-b border-border/60 flex items-center gap-1.5 shrink-0">
                  <Building2 className="w-4 h-4 text-blue-500" />
                  أداء ومقارنة الفروع ونقاط البيع
                </h3>
                <div className="flex-1 overflow-y-auto min-h-0 pt-1 divide-y divide-border/40">
                  {branchesList.map((br) => {
                    const brSales = salesRecords.filter((s) => s.branchId === br.id || s.branch_id === br.id);
                    const brTotal = brSales.reduce((acc, s) => acc + Number(s.total || 0), 0);
                    return (
                      <div key={br.id} className="py-3 flex items-center justify-between text-xs">
                        <div className="flex items-center gap-2">
                          <div className="w-8 h-8 rounded-lg bg-primary/10 text-primary flex items-center justify-center font-bold">
                            <Building2 className="w-4 h-4" />
                          </div>
                          <div>
                            <p className="font-bold text-foreground">{br.name}</p>
                            <span className="text-[10px] text-muted-foreground">فواتير: {number(brSales.length)}</span>
                          </div>
                        </div>
                        <div className="text-left font-mono font-bold text-emerald-500 text-sm" dir="ltr">
                          {currency(brTotal)}
                        </div>
                      </div>
                    );
                  })}
                  {branchesList.length === 0 && (
                    <div className="py-10 text-center text-muted-foreground text-xs">
                      الفرع الرئيسي النشط
                    </div>
                  )}
                </div>
              </Card>
            </div>
          </TabsContent>

          {/* TAB CONTENT 5: FINANCIAL P&L STATEMENT */}
          <TabsContent value="financials" className="flex-1 overflow-y-auto min-h-0 pt-2 mt-0 data-[state=active]:flex data-[state=active]:flex-col">
            <Card className="border-border/80 bg-card p-4 flex-1 flex flex-col min-h-0 max-w-4xl mx-auto w-full">
              <div className="border-b border-border/60 pb-2.5 shrink-0 flex items-center justify-between">
                <div>
                  <h3 className="text-base font-black text-foreground flex items-center gap-2">
                    <Layers className="w-4 h-4 text-primary" />
                    قائمة الدخل والأرباح التشغيلية (Executive P&L)
                  </h3>
                  <p className="text-[11px] text-muted-foreground">
                    الفترة: {activeDateRange.startDate} إلى {activeDateRange.endDate}
                  </p>
                </div>
                <Badge variant="outline" className="font-mono text-xs text-primary border-primary/30">
                  صافي الهامش: {metrics.netMarginPct}%
                </Badge>
              </div>

              <div className="flex-1 overflow-y-auto min-h-0 pt-3 space-y-3 font-mono text-xs">
                {/* 1. Revenue Block */}
                <div className="bg-muted/20 border border-border/60 rounded-xl p-3 space-y-1.5">
                  <div className="flex items-center justify-between font-bold text-sm text-foreground">
                    <span>1. إجمالي إيرادات المبيعات (Gross Sales)</span>
                    <span dir="ltr">{currency(metrics.grossBilled)}</span>
                  </div>
                  <div className="flex items-center justify-between text-muted-foreground text-xs pr-4">
                    <span>- الخصومات الممنوحة للعملاء</span>
                    <span className="text-rose-500" dir="ltr">-{currency(metrics.discounts)}</span>
                  </div>
                  <div className="flex items-center justify-between text-muted-foreground text-xs pr-4">
                    <span>- مرتجعات المبيعات المستردة</span>
                    <span className="text-rose-500" dir="ltr">-{currency(metrics.totalReturns)}</span>
                  </div>
                  <div className="flex items-center justify-between font-bold text-emerald-500 pt-1 border-t border-border/40">
                    <span>= صافي الإيرادات (Net Revenue)</span>
                    <span dir="ltr">{currency(metrics.netSales)}</span>
                  </div>
                </div>

                {/* 2. COGS Block */}
                <div className="bg-muted/20 border border-border/60 rounded-xl p-3 space-y-1.5">
                  <div className="flex items-center justify-between font-bold text-xs text-foreground">
                    <span>2. تكلفة البضاعة المباعة (Cost of Goods Sold - COGS)</span>
                    <span className="text-rose-400" dir="ltr">
                      {revealCosts ? `-${currency(metrics.cogs)}` : '••••••'}
                    </span>
                  </div>
                  <div className="flex items-center justify-between font-bold text-blue-500 pt-1 border-t border-border/40 text-sm">
                    <span>= مجمل الربح التجاري (Gross Profit)</span>
                    <span dir="ltr">{revealCosts ? currency(metrics.grossProfit) : '••••••'}</span>
                  </div>
                  <div className="text-[10px] text-muted-foreground flex justify-end">
                    نسبة هامش مجمل الربح: {revealCosts ? `${metrics.grossMarginPct}%` : '•••'}
                  </div>
                </div>

                {/* 3. Operating Expenses Block */}
                <div className="bg-muted/20 border border-border/60 rounded-xl p-3 space-y-1.5">
                  <div className="flex items-center justify-between font-bold text-xs text-foreground">
                    <span>3. المصروفات التشغيلية والعمومية (Operating Expenses)</span>
                    <span className="text-rose-500" dir="ltr">-{currency(metrics.expensesTotal)}</span>
                  </div>
                  <div className="text-[10px] text-muted-foreground pr-4">
                    تشمل إيجارات، فواتير، رواتب، ونثريات مسجلة خلال الفترة
                  </div>
                </div>

                {/* 4. Bottom Line Net Profit */}
                <div className={`border rounded-xl p-4 flex items-center justify-between text-base font-black ${
                  metrics.netIncome >= 0 ? 'bg-emerald-500/10 border-emerald-500/30 text-emerald-400' : 'bg-rose-500/10 border-rose-500/30 text-rose-400'
                }`}>
                  <div className="flex items-center gap-2">
                    <Sparkles className="w-5 h-5" />
                    <span>صافي الربح التشغيلي النهائي (Net Operating Profit)</span>
                  </div>
                  <span className="font-mono text-lg" dir="ltr">
                    {revealCosts ? currency(metrics.netIncome) : '••••••'}
                  </span>
                </div>
              </div>
            </Card>
          </TabsContent>
        </Tabs>
      </div>
    </MainLayout>
  );
}
