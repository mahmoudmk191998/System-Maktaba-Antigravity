import React, { useState, useEffect, useMemo } from 'react';
import { MainLayout } from '@/components/layout';
import { useTenantBranch } from '@/hooks/useDatabase';
import { useAppStore } from '@/lib/store';
import { useFormatters } from '@/lib/formatters';
import { useUserPermissions } from '@/hooks/usePermissions';
import {
  BarChart3,
  TrendingUp,
  Package,
  AlertTriangle,
  Users,
  Building2,
  DollarSign,
  Download,
  Calendar,
  Clock,
  Eye,
  EyeOff,
  RefreshCw,
  Search,
  ShoppingCart,
  Truck,
  Layers,
  ArrowUpRight,
  ArrowDownRight,
  HelpCircle,
  FileSpreadsheet,
  CheckCircle2,
  Flame,
  ShieldAlert,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import {
  AreaChart,
  Area,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip as RechartsTooltip,
  ResponsiveContainer,
  BarChart,
  Bar,
  PieChart,
  Pie,
  Cell,
  Legend,
} from 'recharts';
import { toast } from 'sonner';

import {
  DatePreset,
  ComparisonMode,
  DEFAULT_TIMEZONE,
  getDateRangeFromPreset,
  getComparisonRange,
} from '@/services/analytics/reportingTimezone';
import {
  generateSalesAnalytics,
  SalesAnalyticsReport,
} from '@/services/analytics/salesAnalytics.service';
import {
  generateInventoryAnalytics,
  InventoryAnalyticsReport,
} from '@/services/analytics/inventoryAnalytics.service';
import {
  generateDemandAndReorderReport,
  DemandIntelligenceReport,
} from '@/services/analytics/demandAndReorder.service';
import {
  generateProfitabilityReport,
  ProfitabilityAnalyticsReport,
} from '@/services/analytics/profitabilityAnalytics.service';
import {
  generatePartnerAnalytics,
  PartnerAnalyticsReport,
} from '@/services/analytics/partnerAnalytics.service';
import {
  generateBranchAndEmployeeAnalytics,
  BranchAndEmployeeReport,
} from '@/services/analytics/branchAndEmployeeAnalytics.service';
import {
  generateFinancialBIMetrics,
  FinancialBIMetrics,
} from '@/services/analytics/financialBI.service';
import {
  rebuildDailyAnalyticsForDateRange,
} from '@/services/analytics/analyticsAggregator.service';
import {
  exportSalesTrendCsv,
  exportInventoryHealthCsv,
  exportReorderRecommendationsCsv,
  exportProfitabilityCsv,
} from '@/services/analytics/exportReports.service';

const CHART_COLORS = ['#3b82f6', '#10b981', '#f59e0b', '#ec4899', '#8b5cf6', '#06b6d4', '#ef4444', '#f97316'];

export default function Reports() {
  const currentTenant = useAppStore((state) => state.currentTenant);
  const currentBranch = useAppStore((state) => state.currentBranch);
  const { tenantId: hookTenantId, branchId: hookBranchId } = useTenantBranch();
  const tenantId = currentTenant?.id || hookTenantId || 'default';
  const branchId = currentBranch?.id || hookBranchId || '';
  const { currency, number } = useFormatters();
  const { hasPermission, isAdmin, isOwner } = useUserPermissions();

  // Permissions & Cost Masking
  const canViewCostsGlobal = isOwner || isAdmin || hasPermission('analytics.view_costs') || hasPermission('reports.sales');
  const [revealCosts, setRevealCosts] = useState<boolean>(true);
  const showCosts = canViewCostsGlobal && revealCosts;

  // Active Tab
  const [activeTab, setActiveTab] = useState<string>('overview');

  // Filter State
  const [timeZone, setTimeZone] = useState<string>(DEFAULT_TIMEZONE);
  const [datePreset, setDatePreset] = useState<DatePreset>('all');
  const [customStart, setCustomStart] = useState<string>(() => {
    const d = new Date();
    d.setDate(1);
    return d.toISOString().split('T')[0];
  });
  const [customEnd, setCustomEnd] = useState<string>(() => new Date().toISOString().split('T')[0]);
  const [comparisonMode, setComparisonMode] = useState<ComparisonMode>('previous_period');
  const [selectedBranch, setSelectedBranch] = useState<string>('all');

  // Search & Secondary Filters
  const [searchTerm, setSearchTerm] = useState<string>('');
  const [reorderSupplierFilter, setReorderSupplierFilter] = useState<string>('all');
  const [reorderUrgencyFilter, setReorderUrgencyFilter] = useState<string>('all');

  // Data States
  const [loading, setLoading] = useState<boolean>(true);
  const [salesReport, setSalesReport] = useState<SalesAnalyticsReport | null>(null);
  const [inventoryReport, setInventoryReport] = useState<InventoryAnalyticsReport | null>(null);
  const [demandReport, setDemandReport] = useState<DemandIntelligenceReport | null>(null);
  const [profitabilityReport, setProfitabilityReport] = useState<ProfitabilityAnalyticsReport | null>(null);
  const [partnerReport, setPartnerReport] = useState<PartnerAnalyticsReport | null>(null);
  const [branchReport, setBranchReport] = useState<BranchAndEmployeeReport | null>(null);
  const [financialBIMetrics, setFinancialBIMetrics] = useState<FinancialBIMetrics | null>(null);

  // Sync / Aggregator State
  const [isRebuildingAggregates, setIsRebuildingAggregates] = useState<boolean>(false);

  // Compute Active Range
  const activeDateRange = useMemo(() => {
    return getDateRangeFromPreset(datePreset, customStart, customEnd, timeZone);
  }, [datePreset, customStart, customEnd, timeZone]);

  const activeComparisonRange = useMemo(() => {
    return getComparisonRange(activeDateRange, comparisonMode, timeZone);
  }, [activeDateRange, comparisonMode, timeZone]);

  // Main Data Loader
  const loadAnalyticsData = async () => {
    const effectiveTenantId = tenantId || currentTenant?.id || hookTenantId || 'default';
    setLoading(true);
    try {
      const bId = selectedBranch === 'all' ? undefined : selectedBranch;

      // Parallelize module generation with Promise.allSettled for fault-isolation
      const results = await Promise.allSettled([
        generateSalesAnalytics(effectiveTenantId, activeDateRange, bId, activeComparisonRange.comparison, timeZone),
        generateInventoryAnalytics(effectiveTenantId, activeDateRange, bId),
        generateDemandAndReorderReport(effectiveTenantId, bId),
        generateProfitabilityReport(effectiveTenantId, activeDateRange, bId),
        generatePartnerAnalytics(effectiveTenantId, activeDateRange, bId),
        generateBranchAndEmployeeAnalytics(effectiveTenantId, activeDateRange),
        generateFinancialBIMetrics(effectiveTenantId, activeDateRange),
      ]);

      const [salesSettled, invSettled, demSettled, profSettled, partSettled, branchSettled, finSettled] = results;

      if (salesSettled.status === 'fulfilled') setSalesReport(salesSettled.value);
      else console.warn('Sales Analytics failed:', salesSettled.reason);

      if (invSettled.status === 'fulfilled') setInventoryReport(invSettled.value);
      else console.warn('Inventory Analytics failed:', invSettled.reason);

      if (demSettled.status === 'fulfilled') setDemandReport(demSettled.value);
      else console.warn('Demand Intelligence failed:', demSettled.reason);

      if (profSettled.status === 'fulfilled') setProfitabilityReport(profSettled.value);
      else console.warn('Profitability Analytics failed:', profSettled.reason);

      if (partSettled.status === 'fulfilled') setPartnerReport(partSettled.value);
      else console.warn('Partner Analytics failed:', partSettled.reason);

      if (branchSettled.status === 'fulfilled') setBranchReport(branchSettled.value);
      else console.warn('Branch/Employee Analytics failed:', branchSettled.reason);

      if (finSettled.status === 'fulfilled') setFinancialBIMetrics(finSettled.value);
      else console.warn('Financial BI Metrics failed:', finSettled.reason);

      const fulfilledCount = results.filter((r) => r.status === 'fulfilled').length;
      if (fulfilledCount === 0) {
        toast.error('حدث خطأ أثناء تحميل بيانات التقارير والتحليلات');
      }
    } catch (err: any) {
      console.error('Error loading analytics reports:', err);
      toast.error('حدث خطأ أثناء تحميل بيانات التقارير والتحليلات');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadAnalyticsData();
  }, [tenantId, selectedBranch, activeDateRange, comparisonMode, timeZone]);

  // Idempotent Daily Metrics Rebuild Trigger
  const handleRebuildAggregates = async () => {
    if (!tenantId) return;
    setIsRebuildingAggregates(true);
    try {
      const res = await rebuildDailyAnalyticsForDateRange(
        tenantId,
        activeDateRange.startDate,
        activeDateRange.endDate,
        selectedBranch,
        timeZone
      );
      toast.success(`تمت إعادة بناء وتحديث مجاميع ${res.processedDaysCount} يوماً بنجاح`);
      loadAnalyticsData();
    } catch (err: any) {
      console.error('Error rebuilding aggregates:', err);
      toast.error('فشلت عملية إعادة بناء المجاميع');
    } finally {
      setIsRebuildingAggregates(false);
    }
  };

  // KPI Change Render Helper
  const renderKPIBadge = (change?: number) => {
    if (change === undefined || change === null) return null;
    const isPositive = change >= 0;
    return (
      <span
        className={`inline-flex items-center text-xs font-semibold px-2 py-0.5 rounded-full ${
          isPositive ? 'bg-emerald-100 text-emerald-800' : 'bg-rose-100 text-rose-800'
        }`}
      >
        {isPositive ? <ArrowUpRight className="w-3 h-3 ml-0.5" /> : <ArrowDownRight className="w-3 h-3 ml-0.5" />}
        {Math.abs(change)}%
      </span>
    );
  };

  return (
    <MainLayout>
      <div className="space-y-6 pb-12" dir="rtl">
        {/* Top Header & Global Filter Toolbar */}
        <div className="bg-card border border-border rounded-2xl p-6 shadow-sm">
          <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4 border-b pb-5">
            <div>
              <div className="flex items-center gap-3">
                <div className="p-2.5 bg-primary/10 text-primary rounded-xl">
                  <BarChart3 className="w-7 h-7" />
                </div>
                <div>
                  <h1 className="text-2xl font-black tracking-tight text-foreground">
                    مركز ذكاء الأعمال والتقارير التنفيذية (BI Hub)
                  </h1>
                  <p className="text-sm text-muted-foreground mt-0.5">
                    تحليلات المبيعات، صحة المخزون، ذكاء الطلب وإعادة التوريد، وهوامش الربح وفق معايير الحوكمة المالية
                  </p>
                </div>
              </div>
            </div>

            <div className="flex items-center flex-wrap gap-2.5">
              {/* Cost Masking Toggle */}
              {canViewCostsGlobal && (
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setRevealCosts(!revealCosts)}
                  className="text-xs h-9 gap-1.5"
                >
                  {showCosts ? <EyeOff className="w-3.5 h-3.5" /> : <Eye className="w-3.5 h-3.5" />}
                  {showCosts ? 'حجب التكاليف والأرباح' : 'إظهار التكاليف والأرباح'}
                </Button>
              )}

              {/* Refresh Button */}
              <Button
                variant="outline"
                size="sm"
                onClick={loadAnalyticsData}
                disabled={loading}
                className="text-xs h-9 gap-1.5"
              >
                <RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin' : ''}`} />
                تحديث
              </Button>
            </div>
          </div>

          {/* Filter Controls Row */}
          <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 lg:grid-cols-5 gap-3 pt-5">
            {/* Period Preset */}
            <div>
              <label className="text-xs font-semibold text-muted-foreground mb-1.5 block">الفترة الزمنية</label>
              <Select value={datePreset} onValueChange={(val) => setDatePreset(val as DatePreset)}>
                <SelectTrigger className="h-9 text-xs">
                  <SelectValue placeholder="اختر الفترة" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">جميع الفترات (كل البيانات)</SelectItem>
                  <SelectItem value="today">اليوم (Today)</SelectItem>
                  <SelectItem value="yesterday">أمس (Yesterday)</SelectItem>
                  <SelectItem value="last_7_days">آخر 7 أيام</SelectItem>
                  <SelectItem value="this_month">الشهر الحالي</SelectItem>
                  <SelectItem value="last_month">الشهر السابق</SelectItem>
                  <SelectItem value="this_quarter">الربع الحالي</SelectItem>
                  <SelectItem value="this_year">السنة الحالية</SelectItem>
                  <SelectItem value="custom">فترة مخصصة</SelectItem>
                </SelectContent>
              </Select>
            </div>

            {/* Comparison Mode */}
            <div>
              <label className="text-xs font-semibold text-muted-foreground mb-1.5 block">فترة المقارنة</label>
              <Select value={comparisonMode} onValueChange={(val) => setComparisonMode(val as ComparisonMode)}>
                <SelectTrigger className="h-9 text-xs">
                  <SelectValue placeholder="المقارنة" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">بدون مقارنة</SelectItem>
                  <SelectItem value="previous_period">الفترة السابقة المماثلة</SelectItem>
                  <SelectItem value="previous_year">نفس الفترة من العام الماضي</SelectItem>
                </SelectContent>
              </Select>
            </div>

            {/* Branch Selector */}
            <div>
              <label className="text-xs font-semibold text-muted-foreground mb-1.5 block">الفرع / الموقع</label>
              <Select value={selectedBranch} onValueChange={setSelectedBranch}>
                <SelectTrigger className="h-9 text-xs">
                  <SelectValue placeholder="كافة الفروع" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">كافة الفروع والمستودعات</SelectItem>
                  {branchReport?.branches.map((b) => (
                    <SelectItem key={b.branchId} value={b.branchId}>
                      {b.branchName}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            {/* Timezone (Audit 5) */}
            <div>
              <label className="text-xs font-semibold text-muted-foreground mb-1.5 block">
                المنطقة الزمنية (توقيت الإغلاق)
              </label>
              <Select value={timeZone} onValueChange={setTimeZone}>
                <SelectTrigger className="h-9 text-xs">
                  <SelectValue placeholder="التوقيت" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="Africa/Cairo">توقيت القاهرة (Africa/Cairo)</SelectItem>
                  <SelectItem value="Asia/Riyadh">توقيت مكة (Asia/Riyadh)</SelectItem>
                  <SelectItem value="UTC">توقيت جرينتش (UTC)</SelectItem>
                </SelectContent>
              </Select>
            </div>

            {/* Date Span Display */}
            <div className="flex flex-col justify-end">
              <span className="text-[11px] text-muted-foreground font-mono">
                {activeDateRange.startDate} إلى {activeDateRange.endDate}
              </span>
              {comparisonMode !== 'none' && activeComparisonRange.comparison && (
                <span className="text-[10px] text-amber-600 font-mono">
                  مقابل: {activeComparisonRange.comparison.startDate} إلى {activeComparisonRange.comparison.endDate}
                </span>
              )}
            </div>
          </div>

          {/* Custom Date Picker Range (Shown if custom) */}
          {datePreset === 'custom' && (
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-3 border-t mt-3">
              <div>
                <label className="text-xs font-medium text-muted-foreground">من تاريخ</label>
                <Input
                  type="date"
                  value={customStart}
                  onChange={(e) => setCustomStart(e.target.value)}
                  className="h-8 text-xs"
                />
              </div>
              <div>
                <label className="text-xs font-medium text-muted-foreground">إلى تاريخ</label>
                <Input
                  type="date"
                  value={customEnd}
                  onChange={(e) => setCustomEnd(e.target.value)}
                  className="h-8 text-xs"
                />
              </div>
            </div>
          )}
        </div>

        {/* 10-Tab Navigation */}
        <Tabs value={activeTab} onValueChange={setActiveTab} className="space-y-6">
          <div className="bg-card border border-border rounded-xl p-1.5 shadow-sm overflow-x-auto">
            <TabsList className="bg-transparent h-auto flex flex-nowrap min-w-max gap-1">
              <TabsTrigger value="overview" className="text-xs font-semibold py-2 px-3 gap-1.5 data-[state=active]:bg-blue-600 data-[state=active]:text-white">
                <TrendingUp className="w-3.5 h-3.5" />
                المؤشرات العامة
              </TabsTrigger>
              <TabsTrigger value="sales" className="text-xs font-semibold py-2 px-3 gap-1.5 data-[state=active]:bg-blue-600 data-[state=active]:text-white">
                <ShoppingCart className="w-3.5 h-3.5" />
                المبيعات وسلة الشراء
              </TabsTrigger>
              <TabsTrigger value="inventory" className="text-xs font-semibold py-2 px-3 gap-1.5 data-[state=active]:bg-blue-600 data-[state=active]:text-white">
                <Package className="w-3.5 h-3.5" />
                تقييم وصحة المخزون
              </TabsTrigger>
              <TabsTrigger value="aging" className="text-xs font-semibold py-2 px-3 gap-1.5 data-[state=active]:bg-blue-600 data-[state=active]:text-white">
                <ShieldAlert className="w-3.5 h-3.5" />
                الراكد وبطيء الحركة (90d)
              </TabsTrigger>
              <TabsTrigger value="demand" className="text-xs font-semibold py-2 px-3 gap-1.5 data-[state=active]:bg-blue-600 data-[state=active]:text-white">
                <Flame className="w-3.5 h-3.5" />
                ذكاء الطلب وإعادة التوريد
              </TabsTrigger>
              <TabsTrigger value="profitability" className="text-xs font-semibold py-2 px-3 gap-1.5 data-[state=active]:bg-blue-600 data-[state=active]:text-white">
                <DollarSign className="w-3.5 h-3.5" />
                الربحية وهوامش الأصناف
              </TabsTrigger>
              <TabsTrigger value="partners" className="text-xs font-semibold py-2 px-3 gap-1.5 data-[state=active]:bg-blue-600 data-[state=active]:text-white">
                <Users className="w-3.5 h-3.5" />
                الموردون وتصنيف العملاء (RFM)
              </TabsTrigger>
              <TabsTrigger value="branches" className="text-xs font-semibold py-2 px-3 gap-1.5 data-[state=active]:bg-blue-600 data-[state=active]:text-white">
                <Building2 className="w-3.5 h-3.5" />
                الفروع والكاشير
              </TabsTrigger>
              <TabsTrigger value="financial_bi" className="text-xs font-semibold py-2 px-3 gap-1.5 data-[state=active]:bg-blue-600 data-[state=active]:text-white">
                <Layers className="w-3.5 h-3.5" />
                التحليل المالي القيادي (GL)
              </TabsTrigger>
              <TabsTrigger value="data_sync" className="text-xs font-semibold py-2 px-3 gap-1.5 data-[state=active]:bg-blue-600 data-[state=active]:text-white">
                <RefreshCw className="w-3.5 h-3.5" />
                محرك التجميع والمطابقة
              </TabsTrigger>
            </TabsList>
          </div>

          {/* TAB 1: OVERVIEW */}
          <TabsContent value="overview" className="space-y-6">
            {/* KPI Cards Grid */}
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
              {/* Net Sales */}
              <Card className="border shadow-sm">
                <CardHeader className="p-4 pb-2 flex flex-row items-center justify-between space-y-0">
                  <span className="text-xs font-semibold text-muted-foreground">صافي المبيعات</span>
                  <div className="p-2 bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 rounded-lg">
                    <DollarSign className="w-4 h-4" />
                  </div>
                </CardHeader>
                <CardContent className="p-4 pt-0">
                  <div className="text-2xl font-black text-foreground">
                    {currency(salesReport?.summary.netSales.current || 0)}
                  </div>
                  <div className="flex items-center gap-2 mt-2">
                    {renderKPIBadge(salesReport?.summary.netSales.percentageChange)}
                    <span className="text-[11px] text-muted-foreground">مقارنة بالفترة السابقة</span>
                  </div>
                  <div className="flex items-center justify-between text-[11px] text-muted-foreground mt-2 pt-1.5 border-t border-border/60">
                    <span>إجمالي الخصومات:</span>
                    <span className="font-bold text-rose-600">
                      -{currency(salesReport?.summary.discounts.current || 0)}
                    </span>
                  </div>
                </CardContent>
              </Card>

              {/* Gross Profit */}
              <Card className="border shadow-sm">
                <CardHeader className="p-4 pb-2 flex flex-row items-center justify-between space-y-0">
                  <span className="text-xs font-semibold text-muted-foreground">إجمالي الربح التجاري</span>
                  <div className="p-2 bg-primary/10 text-primary rounded-lg">
                    <TrendingUp className="w-4 h-4" />
                  </div>
                </CardHeader>
                <CardContent className="p-4 pt-0">
                  <div className="text-2xl font-black text-foreground">
                    {showCosts ? currency(salesReport?.summary.grossProfit.current || 0) : '***'}
                  </div>
                  <div className="flex items-center gap-2 mt-2">
                    {showCosts && renderKPIBadge(salesReport?.summary.grossProfit.percentageChange)}
                    <span className="text-[11px] text-muted-foreground">
                      الهامش: {showCosts ? `${salesReport?.summary.grossMarginPct.current || 0}%` : '***'}
                    </span>
                  </div>
                </CardContent>
              </Card>

              {/* Transactions Count */}
              <Card className="border shadow-sm">
                <CardHeader className="p-4 pb-2 flex flex-row items-center justify-between space-y-0">
                  <span className="text-xs font-semibold text-muted-foreground">عدد الفواتير المنفذة</span>
                  <div className="p-2 bg-violet-500/10 text-violet-600 dark:text-violet-400 rounded-lg">
                    <ShoppingCart className="w-4 h-4" />
                  </div>
                </CardHeader>
                <CardContent className="p-4 pt-0">
                  <div className="text-2xl font-black text-foreground">
                    {number(salesReport?.summary.transactionsCount.current || 0)}
                  </div>
                  <div className="flex items-center gap-2 mt-2">
                    {renderKPIBadge(salesReport?.summary.transactionsCount.percentageChange)}
                    <span className="text-[11px] text-muted-foreground">
                      متوسط الفاتورة: {currency(salesReport?.summary.averageOrderValue.current || 0)}
                    </span>
                  </div>
                </CardContent>
              </Card>

              {/* Inventory Valuation */}
              <Card className="border shadow-sm">
                <CardHeader className="p-4 pb-2 flex flex-row items-center justify-between space-y-0">
                  <span className="text-xs font-semibold text-muted-foreground">قيمة المخزون الحالي (التكلفة)</span>
                  <div className="p-2 bg-amber-500/10 text-amber-600 dark:text-amber-400 rounded-lg">
                    <Package className="w-4 h-4" />
                  </div>
                </CardHeader>
                <CardContent className="p-4 pt-0">
                  <div className="text-2xl font-black text-foreground">
                    {showCosts ? currency(inventoryReport?.summary.totalCostValuation || 0) : '***'}
                  </div>
                  <div className="flex items-center gap-2 mt-2">
                    <span className="text-[11px] text-muted-foreground font-medium">
                      البيع المتوقع: {currency(inventoryReport?.summary.totalRetailValuation || 0)}
                    </span>
                  </div>
                </CardContent>
              </Card>
            </div>

            {/* Revenue & Profit Trends Chart */}
            <Card className="border shadow-sm">
              <CardHeader className="p-5 pb-3 flex flex-row items-center justify-between border-b">
                <div>
                  <CardTitle className="text-base font-bold text-foreground">
                    مسار صافي المبيعات والربح اليومي
                  </CardTitle>
                  <CardDescription className="text-xs text-muted-foreground">
                    حركة المبيعات الفعلية بعد خصم المرتجعات والخصومات بتوقيت ({timeZone})
                  </CardDescription>
                </div>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => exportSalesTrendCsv(salesReport?.dailyTrends || [], showCosts)}
                  className="text-xs h-8 gap-1.5"
                >
                  <Download className="w-3.5 h-3.5" />
                  تصدير المسار (CSV)
                </Button>
              </CardHeader>
              <CardContent className="p-5">
                <div className="h-80 w-full" dir="ltr">
                  <ResponsiveContainer width="100%" height="100%">
                    <AreaChart data={salesReport?.dailyTrends || []}>
                      <defs>
                        <linearGradient id="netSalesGrad" x1="0" y1="0" x2="0" y2="1">
                          <stop offset="5%" stopColor="#3b82f6" stopOpacity={0.4} />
                          <stop offset="95%" stopColor="#3b82f6" stopOpacity={0.0} />
                        </linearGradient>
                        <linearGradient id="profitGrad" x1="0" y1="0" x2="0" y2="1">
                          <stop offset="5%" stopColor="#10b981" stopOpacity={0.4} />
                          <stop offset="95%" stopColor="#10b981" stopOpacity={0.0} />
                        </linearGradient>
                      </defs>
                      <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#e2e8f0" />
                      <XAxis dataKey="date" tick={{ fontSize: 11 }} />
                      <YAxis tick={{ fontSize: 11 }} />
                      <RechartsTooltip contentStyle={{ backgroundColor: "hsl(var(--card))", borderColor: "hsl(var(--border))", borderRadius: "12px", color: "hsl(var(--foreground))" }} />
                      <Legend />
                      <Area type="monotone" dataKey="netSales" name="صافي المبيعات" stroke="#3b82f6" fillOpacity={1} fill="url(#netSalesGrad)" strokeWidth={2} />
                      {showCosts && (
                        <Area type="monotone" dataKey="grossProfit" name="الربح الإجمالي" stroke="#10b981" fillOpacity={1} fill="url(#profitGrad)" strokeWidth={2} />
                      )}
                    </AreaChart>
                  </ResponsiveContainer>
                </div>
              </CardContent>
            </Card>

            {/* Quick Health Status Row */}
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              {/* Dead Stock Alert Card */}
              <Card className="border border-rose-200 bg-rose-50/50 p-4 rounded-xl">
                <div className="flex items-center gap-3">
                  <div className="p-2.5 bg-rose-100 text-rose-700 rounded-lg">
                    <ShieldAlert className="w-5 h-5" />
                  </div>
                  <div>
                    <h3 className="text-xs font-semibold text-rose-900">رأس المال الراكد (90 يوماً بلا مبيعات)</h3>
                    <p className="text-xl font-black text-rose-800 mt-1">
                      {showCosts ? currency(inventoryReport?.summary.deadStockCapital || 0) : '***'}
                    </p>
                    <p className="text-[11px] text-rose-600 mt-0.5">
                      {inventoryReport?.deadStockItems.length || 0} صنف راكد بحاجة لتصفية أو خصم
                    </p>
                  </div>
                </div>
              </Card>

              {/* Reorder Critical Card */}
              <Card className="border border-amber-200 bg-amber-50/50 p-4 rounded-xl">
                <div className="flex items-center gap-3">
                  <div className="p-2.5 bg-amber-100 text-amber-700 rounded-lg">
                    <Flame className="w-5 h-5" />
                  </div>
                  <div>
                    <h3 className="text-xs font-semibold text-amber-900">عجز المخزون الحرج (أصناف نفدت)</h3>
                    <p className="text-xl font-black text-amber-800 mt-1">
                      {demandReport?.criticalItemsCount || 0} صنف
                    </p>
                    <p className="text-[11px] text-amber-600 mt-0.5">
                      تكلفة التوريد المقترحة: {currency(demandReport?.totalRecommendedCost || 0)}
                    </p>
                  </div>
                </div>
              </Card>

              {/* Cash Conversion Cycle Card */}
              <Card className="border border-blue-200 bg-blue-50/50 p-4 rounded-xl">
                <div className="flex items-center gap-3">
                  <div className="p-2.5 bg-blue-100 text-blue-700 rounded-lg">
                    <Clock className="w-5 h-5" />
                  </div>
                  <div>
                    <h3 className="text-xs font-semibold text-blue-900">دورة التحول النقدي (CCC)</h3>
                    <p className="text-xl font-black text-blue-800 mt-1">
                      {financialBIMetrics?.cashConversionCycleDays ?? '—'} يوماً
                    </p>
                    <p className="text-[11px] text-blue-600 mt-0.5">
                      بقاؤه بالمخزن: {financialBIMetrics?.dioDaysEstimate ?? 0}d | تحصيل: {financialBIMetrics?.dsoDays ?? 0}d
                    </p>
                  </div>
                </div>
              </Card>
            </div>
          </TabsContent>

          {/* TAB 2: SALES INTELLIGENCE */}
          <TabsContent value="sales" className="space-y-6">
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
              {/* Hourly Heatmap Distribution */}
              <Card className="border shadow-sm">
                <CardHeader className="p-4 border-b">
                  <CardTitle className="text-sm font-bold text-foreground">
                    أوقات ذروة المبيعات اليومية (توزيع ساعات اليوم)
                  </CardTitle>
                  <CardDescription className="text-xs text-muted-foreground">
                    تحديد ساعات الازدحام لتنظيم دوريات الموظفين والكاشير
                  </CardDescription>
                </CardHeader>
                <CardContent className="p-4">
                  <div className="h-64 w-full" dir="ltr">
                    <ResponsiveContainer width="100%" height="100%">
                      <BarChart data={salesReport?.hourlyDistribution || []}>
                        <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#e2e8f0" />
                        <XAxis dataKey="hour" tickFormatter={(h) => `${h}:00`} tick={{ fontSize: 10 }} />
                        <YAxis tick={{ fontSize: 10 }} />
                        <RechartsTooltip contentStyle={{ backgroundColor: "hsl(var(--card))", borderColor: "hsl(var(--border))", borderRadius: "12px", color: "hsl(var(--foreground))" }} formatter={(val: any) => [currency(val), 'المبيعات']} labelFormatter={(h) => `الساعة ${h}:00`} />
                        <Bar dataKey="totalSalesAmount" fill="#3b82f6" radius={[4, 4, 0, 0]} />
                      </BarChart>
                    </ResponsiveContainer>
                  </div>
                </CardContent>
              </Card>

              {/* Payment Methods Distribution */}
              <Card className="border shadow-sm">
                <CardHeader className="p-4 border-b">
                  <CardTitle className="text-sm font-bold text-foreground">
                    توزيع طرق الدفع
                  </CardTitle>
                  <CardDescription className="text-xs text-muted-foreground">
                    نسبة المقبوضات النقدية والبطاقات والبيع الآجل
                  </CardDescription>
                </CardHeader>
                <CardContent className="p-4 flex items-center justify-center">
                  <div className="h-64 w-full" dir="ltr">
                    <ResponsiveContainer width="100%" height="100%">
                      <PieChart>
                        <Pie
                          data={salesReport?.paymentMethods || []}
                          dataKey="amount"
                          nameKey="method"
                          cx="50%"
                          cy="50%"
                          outerRadius={80}
                          label={(entry) => `${entry.method} (${entry.sharePct}%)`}
                        >
                          {(salesReport?.paymentMethods || []).map((_, idx) => (
                            <Cell key={`cell-${idx}`} fill={CHART_COLORS[idx % CHART_COLORS.length]} />
                          ))}
                        </Pie>
                        <RechartsTooltip contentStyle={{ backgroundColor: "hsl(var(--card))", borderColor: "hsl(var(--border))", borderRadius: "12px", color: "hsl(var(--foreground))" }} formatter={(val: any) => currency(val)} />
                      </PieChart>
                    </ResponsiveContainer>
                  </div>
                </CardContent>
              </Card>
            </div>

            {/* Category Performance Breakdown */}
            <Card className="border shadow-sm">
              <CardHeader className="p-4 border-b flex flex-row items-center justify-between">
                <div>
                  <CardTitle className="text-sm font-bold text-foreground">أداء التصنيفات الرئيسية</CardTitle>
                  <CardDescription className="text-xs text-muted-foreground">حجم المبيعات وهوامش الربح لكل تصنيف</CardDescription>
                </div>
              </CardHeader>
              <CardContent className="p-0">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>التصنيف</TableHead>
                      <TableHead>الوحدات المباعة</TableHead>
                      <TableHead>صافي المبيعات</TableHead>
                      <TableHead>الحصة من الإيراد %</TableHead>
                      {showCosts && <TableHead>التكلفة (COGS)</TableHead>}
                      {showCosts && <TableHead>الربح التجاري</TableHead>}
                      {showCosts && <TableHead>الهامش %</TableHead>}
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {salesReport?.categories.map((c) => (
                      <TableRow key={c.key}>
                        <TableCell className="font-semibold text-foreground">{c.label}</TableCell>
                        <TableCell>{number(c.unitsSold)}</TableCell>
                        <TableCell className="font-medium text-foreground">{currency(c.netSales)}</TableCell>
                        <TableCell>
                          <Badge variant="outline">{c.transactionSharePct}%</Badge>
                        </TableCell>
                        {showCosts && <TableCell>{currency(c.cogs)}</TableCell>}
                        {showCosts && <TableCell className="text-emerald-700 font-bold">{currency(c.grossProfit)}</TableCell>}
                        {showCosts && <TableCell><Badge variant="secondary">{c.grossMarginPct}%</Badge></TableCell>}
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </CardContent>
            </Card>

            {/* Market Basket Analysis (Frequently Bought Together) */}
            <Card className="border shadow-sm">
              <CardHeader className="p-4 border-b">
                <CardTitle className="text-sm font-bold text-foreground">
                  تحليل سلة الشراء والأصناف المترابطة (Frequently Bought Together)
                </CardTitle>
                <CardDescription className="text-xs text-muted-foreground">
                  أصناف تُباع معاً في نفس الفاتورة لمساعدة إدارة العروض وحزم الأدوات المدرسية
                </CardDescription>
              </CardHeader>
              <CardContent className="p-4">
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
                  {salesReport?.frequentlyBoughtTogether.map((pair, idx) => (
                    <div key={idx} className="border p-3.5 rounded-xl bg-muted/40 flex flex-col justify-between">
                      <div className="space-y-1">
                        <div className="text-xs font-bold text-foreground line-clamp-1">{pair.productAName}</div>
                        <div className="text-[11px] text-blue-600 font-semibold">+ مع +</div>
                        <div className="text-xs font-bold text-foreground line-clamp-1">{pair.productBName}</div>
                      </div>
                      <div className="mt-3 pt-2 border-t flex items-center justify-between text-xs text-muted-foreground">
                        <span>تكرار الاقتران: {pair.coOccurrenceCount} مرة</span>
                        <Badge variant="outline" className="bg-background text-[10px]">دعم {pair.supportPct}%</Badge>
                      </div>
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>
          </TabsContent>

          {/* TAB 3: INVENTORY HEALTH */}
          <TabsContent value="inventory" className="space-y-6">
            <div className="flex items-center justify-between bg-card p-4 border border-border rounded-xl">
              <div>
                <h3 className="text-sm font-bold text-foreground">تقييم المخزون وصحة الدوران</h3>
                <p className="text-xs text-muted-foreground">معدل دوران المخزون، أيام البقاء، وقيمة رأس المال المحتجز</p>
              </div>
              <Button
                variant="outline"
                size="sm"
                onClick={() => exportInventoryHealthCsv(inventoryReport?.allHealthItems || [], showCosts)}
                className="text-xs h-8 gap-1.5"
              >
                <Download className="w-3.5 h-3.5" />
                تصدير جرد المخزون (CSV)
              </Button>
            </div>

            {/* Inventory Valuation Metric Row */}
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
              <Card className="p-4 border">
                <span className="text-xs text-muted-foreground">إجمالي الأصناف بالمستودع</span>
                <div className="text-xl font-black mt-1">{number(inventoryReport?.summary.totalSkusCount || 0)} صنف</div>
              </Card>
              <Card className="p-4 border">
                <span className="text-xs text-muted-foreground">إجمالي الوحدات الفعلية</span>
                <div className="text-xl font-black mt-1">{number(inventoryReport?.summary.totalUnitsOnHand || 0)} قطعة</div>
              </Card>
              <Card className="p-4 border">
                <span className="text-xs text-muted-foreground">معدل دوران المخزون السنوي</span>
                <div className="text-xl font-black text-blue-600 mt-1">{inventoryReport?.periodTurnoverRatio || 0} مرة</div>
              </Card>
              <Card className="p-4 border">
                <span className="text-xs text-muted-foreground">متوسط أيام بقاء المخزون (DIO)</span>
                <div className="text-xl font-black text-amber-600 mt-1">{inventoryReport?.periodDio || 0} يوماً</div>
              </Card>
            </div>

            {/* Category Valuation Table */}
            <Card className="border shadow-sm">
              <CardHeader className="p-4 border-b">
                <CardTitle className="text-sm font-bold text-foreground">توزيع رأس المال المخزني حسب التصنيف</CardTitle>
              </CardHeader>
              <CardContent className="p-0">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>التصنيف</TableHead>
                      <TableHead>عدد الأصناف</TableHead>
                      <TableHead>الوحدات المتاحة</TableHead>
                      {showCosts && <TableHead>القيمة بالتكلفة</TableHead>}
                      <TableHead>القيمة بالبيع المتوقع</TableHead>
                      {showCosts && <TableHead>حصة رأس المال %</TableHead>}
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {inventoryReport?.categoryBreakdown.map((cat) => (
                      <TableRow key={cat.category}>
                        <TableCell className="font-semibold">{cat.category}</TableCell>
                        <TableCell>{cat.skuCount}</TableCell>
                        <TableCell>{number(cat.unitsOnHand)}</TableCell>
                        {showCosts && <TableCell>{currency(cat.costValuation)}</TableCell>}
                        <TableCell className="font-medium text-foreground">{currency(cat.retailValuation)}</TableCell>
                        {showCosts && <TableCell><Badge variant="outline">{cat.shareOfCapitalPct}%</Badge></TableCell>}
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </CardContent>
            </Card>
          </TabsContent>

          {/* TAB 4: AGING & DEAD STOCK */}
          <TabsContent value="aging" className="space-y-6">
            <Card className="border shadow-sm">
              <CardHeader className="p-4 border-b flex flex-row items-center justify-between">
                <div>
                  <CardTitle className="text-sm font-bold text-foreground">
                    تقرير الأصناف الراكدة (لم يُبع منها أي وحدة منذ 90 يوماً فأكثر)
                  </CardTitle>
                  <CardDescription className="text-xs text-muted-foreground">
                    أصناف تجمّد سيولة نقدية وتحتاج إلى إعادة تسعير، إرجاع للمورد، أو عروض ترويجية
                  </CardDescription>
                </div>
                <Badge variant="destructive" className="px-3 py-1">
                  رأس مال معطل: {showCosts ? currency(inventoryReport?.summary.deadStockCapital || 0) : '***'}
                </Badge>
              </CardHeader>
              <CardContent className="p-0">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>الباركود / SKU</TableHead>
                      <TableHead>اسم الصنف</TableHead>
                      <TableHead>التصنيف</TableHead>
                      <TableHead>الرصيد المعطل</TableHead>
                      {showCosts && <TableHead>تكلفة الوحدة</TableHead>}
                      {showCosts && <TableHead>إجمالي السيولة المعطلة</TableHead>}
                      <TableHead>أيام بلا مبيعات</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {inventoryReport?.deadStockItems.length === 0 ? (
                      <TableRow>
                        <TableCell colSpan={7} className="text-center py-8 text-muted-foreground">
                          لا توجد أصناف راكدة مطابقة لمعايير الـ 90 يوماً الحالية
                        </TableCell>
                      </TableRow>
                    ) : (
                      inventoryReport?.deadStockItems.map((item) => (
                        <TableRow key={item.productId}>
                          <TableCell className="font-mono text-xs">{item.sku}</TableCell>
                          <TableCell className="font-semibold">{item.name}</TableCell>
                          <TableCell>{item.category}</TableCell>
                          <TableCell className="font-bold text-rose-700">{item.currentStock}</TableCell>
                          {showCosts && <TableCell>{currency(item.unitCost)}</TableCell>}
                          {showCosts && <TableCell className="font-bold text-foreground">{currency(item.totalCostValue)}</TableCell>}
                          <TableCell><Badge variant="secondary">{item.daysSinceLastSale ?? '90+'} يوم</Badge></TableCell>
                        </TableRow>
                      ))
                    )}
                  </TableBody>
                </Table>
              </CardContent>
            </Card>
          </TabsContent>

          {/* TAB 5: DEMAND & SMART REORDER */}
          <TabsContent value="demand" className="space-y-6">
            <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 bg-card p-4 border border-border rounded-xl">
              <div>
                <h3 className="text-sm font-bold text-foreground">محرك ذكاء الطلب واقتراحات إعادة التوريد الشفافة</h3>
                <p className="text-xs text-muted-foreground">
                  معادلة واضحة ومفسرة استناداً لسرعة البيع الفعلية ومدة التوريد ومخزون الأمان (بدون خوارزميات غامضة)
                </p>
              </div>
              <div className="flex items-center gap-2">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => exportReorderRecommendationsCsv(demandReport?.recommendations || [], showCosts)}
                  className="text-xs h-8 gap-1.5"
                >
                  <Download className="w-3.5 h-3.5" />
                  تصدير خطة التوريد (CSV)
                </Button>
              </div>
            </div>

            {/* Reorder Table */}
            <Card className="border shadow-sm">
              <CardContent className="p-0">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>الصنف والباركود</TableHead>
                      <TableHead>المورد المفضل</TableHead>
                      <TableHead>المبيعات اليومية</TableHead>
                      <TableHead>المتاح حالياً</TableHead>
                      <TableHead>قيد التوريد (PO)</TableHead>
                      <TableHead>الكمية المقترحة</TableHead>
                      {showCosts && <TableHead>التكلفة التقديرية</TableHead>}
                      <TableHead>الاستعجال</TableHead>
                      <TableHead className="min-w-[280px]">التفسير والمسوغ</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {demandReport?.recommendations.length === 0 ? (
                      <TableRow>
                        <TableCell colSpan={9} className="text-center py-8 text-muted-foreground">
                          المخزون متوازن ومستقر بالكامل، لا توجد احتياجات إعادة طلب حرجة حالياً
                        </TableCell>
                      </TableRow>
                    ) : (
                      demandReport?.recommendations.map((item) => (
                        <TableRow key={item.productId}>
                          <TableCell>
                            <div className="font-semibold text-foreground">{item.name}</div>
                            <div className="text-[11px] font-mono text-muted-foreground">{item.sku}</div>
                          </TableCell>
                          <TableCell className="text-xs">{item.preferredSupplierName}</TableCell>
                          <TableCell>
                            <span className="font-mono text-xs">{item.effectiveDailyDemand.toFixed(1)} / يوم</span>
                          </TableCell>
                          <TableCell>
                            <Badge variant={item.availableStock <= 0 ? 'destructive' : 'outline'}>
                              {item.availableStock}
                            </Badge>
                          </TableCell>
                          <TableCell className="text-xs text-blue-600 font-semibold">{item.incomingPoStock}</TableCell>
                          <TableCell className="font-bold text-emerald-700 text-sm">
                            {item.reorderQuantity} {item.packSize > 1 ? `(${item.reorderPacks} عبوة)` : 'قطعة'}
                          </TableCell>
                          {showCosts && <TableCell className="font-semibold">{currency(item.estimatedTotalCost)}</TableCell>}
                          <TableCell>
                            <Badge
                              className={
                                item.urgency === 'critical'
                                  ? 'bg-rose-600'
                                  : item.urgency === 'high'
                                  ? 'bg-amber-600'
                                  : 'bg-blue-600'
                              }
                            >
                              {item.urgency === 'critical' ? 'حرج (نفد)' : item.urgency === 'high' ? 'عالي' : 'متوسط'}
                            </Badge>
                          </TableCell>
                          <TableCell className="text-xs text-muted-foreground leading-relaxed">
                            {item.explanationAr}
                          </TableCell>
                        </TableRow>
                      ))
                    )}
                  </TableBody>
                </Table>
              </CardContent>
            </Card>
          </TabsContent>

          {/* TAB 6: PROFITABILITY */}
          <TabsContent value="profitability" className="space-y-6">
            <div className="flex items-center justify-between bg-card p-4 border border-border rounded-xl">
              <div>
                <h3 className="text-sm font-bold text-foreground">ربحية الأصناف ومكافحة تآكل الهوامش</h3>
                <p className="text-xs text-muted-foreground">
                  محسوبة استناداً إلى لقطة التكلفة التاريخية لحظة البيع (unitCostSnapshot) لكشف تسريبات الخصومات
                </p>
              </div>
              <Button
                variant="outline"
                size="sm"
                onClick={() => exportProfitabilityCsv(profitabilityReport?.allProductProfitability || [], showCosts)}
                className="text-xs h-8 gap-1.5"
              >
                <Download className="w-3.5 h-3.5" />
                تصدير الربحية (CSV)
              </Button>
            </div>

            {/* Leak Alerts */}
            {profitabilityReport?.marginErosionAlerts && profitabilityReport.marginErosionAlerts.length > 0 && (
              <div className="p-4 bg-rose-500/10 border border-rose-500/30 rounded-xl">
                <div className="flex items-center gap-2 text-rose-600 dark:text-rose-400 font-bold text-sm mb-1">
                  <AlertTriangle className="w-4 h-4" />
                  تنبيه تآكل الهامش: تم رصد {profitabilityReport.marginErosionAlerts.length} صنفاً يُباع بهامش ضعيف جداً أو بخسارة
                </div>
                <p className="text-xs text-rose-600">
                  يرجى مراجعة أسعار البيع والتخفيضات الممنوحة على هذه الأصناف لوقف تسريب الأرباح.
                </p>
              </div>
            )}

            {/* Profitability Table */}
            <Card className="border shadow-sm">
              <CardContent className="p-0">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>الصنف</TableHead>
                      <TableHead>التصنيف</TableHead>
                      <TableHead>الوحدات المباعة</TableHead>
                      <TableHead>صافي الإيراد</TableHead>
                      {showCosts && <TableHead>التكلفة التاريخية (COGS)</TableHead>}
                      {showCosts && <TableHead>الربح المحقق</TableHead>}
                      {showCosts && <TableHead>الهامش %</TableHead>}
                      <TableHead>الحالة</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {profitabilityReport?.allProductProfitability.slice(0, 50).map((prod) => (
                      <TableRow key={prod.productId}>
                        <TableCell>
                          <div className="font-semibold text-foreground">{prod.name}</div>
                          <div className="text-[11px] font-mono text-muted-foreground">{prod.sku}</div>
                        </TableCell>
                        <TableCell>{prod.category}</TableCell>
                        <TableCell>{number(prod.unitsSold)}</TableCell>
                        <TableCell className="font-medium">{currency(prod.netRevenue)}</TableCell>
                        {showCosts && <TableCell>{currency(prod.historicalCogs)}</TableCell>}
                        {showCosts && (
                          <TableCell className={`font-bold ${prod.isNegativeMargin ? 'text-rose-600' : 'text-emerald-700'}`}>
                            {currency(prod.grossProfit)}
                          </TableCell>
                        )}
                        {showCosts && (
                          <TableCell>
                            <Badge variant={prod.isNegativeMargin ? 'destructive' : prod.isLowMargin ? 'secondary' : 'outline'}>
                              {prod.grossMarginPct}%
                            </Badge>
                          </TableCell>
                        )}
                        <TableCell>
                          {prod.isNegativeMargin ? (
                            <Badge variant="destructive">بيع بخسارة</Badge>
                          ) : prod.isLowMargin ? (
                            <Badge variant="secondary" className="text-amber-700 bg-amber-100">هامش ضعيف</Badge>
                          ) : (
                            <Badge variant="outline" className="text-emerald-700">سليم</Badge>
                          )}
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </CardContent>
            </Card>
          </TabsContent>

          {/* TAB 7: PARTNERS (SUPPLIERS & CUSTOMER RFM) */}
          <TabsContent value="partners" className="space-y-6">
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
              {/* Suppliers Scorecard */}
              <Card className="border shadow-sm">
                <CardHeader className="p-4 border-b">
                  <CardTitle className="text-sm font-bold text-foreground">بطاقة تقييم الموردين ودور النشر</CardTitle>
                  <CardDescription className="text-xs text-muted-foreground">
                    سرعة التوريد، نسبة الالتزام بالمواعيد، ومعدل إتمام الكميات المطلوبة
                  </CardDescription>
                </CardHeader>
                <CardContent className="p-0">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>المورد</TableHead>
                        <TableHead>إجمالي المشتريات</TableHead>
                        <TableHead>مدة التوريد</TableHead>
                        <TableHead>نسبة الإتمام</TableHead>
                        <TableHead>التقييم</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {partnerReport?.suppliers.slice(0, 10).map((sup) => (
                        <TableRow key={sup.supplierId}>
                          <TableCell className="font-semibold text-xs">{sup.name}</TableCell>
                          <TableCell className="text-xs font-medium">{currency(sup.totalPurchasesAmount)}</TableCell>
                          <TableCell className="text-xs">{sup.avgLeadTimeDays} يوم</TableCell>
                          <TableCell className="text-xs">
                            <Badge variant="outline">{sup.fillRatePct}%</Badge>
                          </TableCell>
                          <TableCell>
                            <Badge className={sup.scorecardRating === 'A+' || sup.scorecardRating === 'A' ? 'bg-emerald-600' : 'bg-blue-600'}>
                              {sup.scorecardRating}
                            </Badge>
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </CardContent>
              </Card>

              {/* Customer RFM Segmentation */}
              <Card className="border shadow-sm">
                <CardHeader className="p-4 border-b">
                  <CardTitle className="text-sm font-bold text-foreground">
                    تصنيف العملاء السلوكي (RFM Behavioral Matrix)
                  </CardTitle>
                  <CardDescription className="text-xs text-muted-foreground">
                    تقسيم العملاء وفق الحداثة والتكرار وإجمالي القيمة المستدامة (LTV)
                  </CardDescription>
                </CardHeader>
                <CardContent className="p-0">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>العميل</TableHead>
                        <TableHead>الشريحة</TableHead>
                        <TableHead>الطلبات</TableHead>
                        <TableHead>القيمة التراكمية (LTV)</TableHead>
                        <TableHead>آخر شراء</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {partnerReport?.customers.slice(0, 10).map((cust) => (
                        <TableRow key={cust.customerId}>
                          <TableCell className="font-semibold text-xs">{cust.name}</TableCell>
                          <TableCell>
                            <Badge variant="secondary" className="text-xs">
                              {cust.segmentLabelAr}
                            </Badge>
                          </TableCell>
                          <TableCell className="text-xs">{cust.frequencyOrders}</TableCell>
                          <TableCell className="text-xs font-bold text-emerald-700">{currency(cust.monetaryLtv)}</TableCell>
                          <TableCell className="text-xs text-muted-foreground">{cust.recencyDays} يوم مضى</TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </CardContent>
              </Card>
            </div>
          </TabsContent>

          {/* TAB 8: BRANCHES & CASHIERS */}
          <TabsContent value="branches" className="space-y-6">
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
              {/* Branch Comparison */}
              <Card className="border shadow-sm">
                <CardHeader className="p-4 border-b">
                  <CardTitle className="text-sm font-bold text-foreground">مقارنة أداء الفروع والمناقلات</CardTitle>
                </CardHeader>
                <CardContent className="p-0">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>الفرع</TableHead>
                        <TableHead>الفواتير</TableHead>
                        <TableHead>صافي المبيعات</TableHead>
                        <TableHead>المناقلات الواردة/الصادرة</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {branchReport?.branches.map((b) => (
                        <TableRow key={b.branchId}>
                          <TableCell className="font-bold text-xs">{b.branchName}</TableCell>
                          <TableCell className="text-xs">{number(b.transactionsCount)}</TableCell>
                          <TableCell className="text-xs font-bold text-foreground">{currency(b.netSales)}</TableCell>
                          <TableCell className="text-xs">
                            صادر: {b.outgoingTransfersCount} | وارد: {b.incomingTransfersCount}
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </CardContent>
              </Card>

              {/* Cashier Operational Tracking */}
              <Card className="border shadow-sm">
                <CardHeader className="p-4 border-b">
                  <CardTitle className="text-sm font-bold text-foreground">إنتاجية ومؤشرات الكاشير</CardTitle>
                </CardHeader>
                <CardContent className="p-0">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>الكاشير</TableHead>
                        <TableHead>الفواتير</TableHead>
                        <TableHead>المبيعات المحصلة</TableHead>
                        <TableHead>الخصومات الممنوحة</TableHead>
                        <TableHead>المرتجعات</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {branchReport?.cashiers.map((c) => (
                        <TableRow key={c.cashierId}>
                          <TableCell className="font-semibold text-xs">{c.cashierName}</TableCell>
                          <TableCell className="text-xs">{c.invoicesCount}</TableCell>
                          <TableCell className="text-xs font-medium">{currency(c.totalNetSales)}</TableCell>
                          <TableCell className="text-xs text-rose-600 font-semibold">{currency(c.totalDiscounts)}</TableCell>
                          <TableCell className="text-xs">{c.returnsCount} فواتير ({currency(c.returnsAmount)})</TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </CardContent>
              </Card>
            </div>
          </TabsContent>

          {/* TAB 9: FINANCIAL BI (GL SOURCED) */}
          <TabsContent value="financial_bi" className="space-y-6">
            <div className="p-4 bg-blue-50 border border-blue-200 rounded-xl flex items-center gap-3">
              <Layers className="w-6 h-6 text-blue-700 flex-shrink-0" />
              <div>
                <h4 className="text-xs font-bold text-blue-900">
                  بيانات دفتر الأستاذ العام الرسمية (Sourced 100% from General Ledger - Audit 4)
                </h4>
                <p className="text-[11px] text-blue-700 mt-0.5">
                  هذه المؤشرات المالية مستخرجة حصرياً من قيود اليومية المحاسبية المعتمدة والمرحلة لضمان الانضباط الرقابي والتوافق المالي.
                </p>
              </div>
            </div>

            {/* Financial Ratios Grid */}
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
              <Card className="p-4 border">
                <span className="text-xs text-muted-foreground">نسبة التداول الحالية (Current Ratio)</span>
                <div className="text-2xl font-black text-foreground mt-1">{financialBIMetrics?.currentRatio ?? 0}x</div>
                <span className="text-[10px] text-muted-foreground">الأصول المتداولة / الالتزامات المتداولة</span>
              </Card>

              <Card className="p-4 border">
                <span className="text-xs text-muted-foreground">السيولة السريعة (Quick Ratio)</span>
                <div className="text-2xl font-black text-emerald-600 mt-1">{financialBIMetrics?.quickRatio ?? 0}x</div>
                <span className="text-[10px] text-muted-foreground">(النقدية + العملاء) / الالتزامات</span>
              </Card>

              <Card className="p-4 border">
                <span className="text-xs text-muted-foreground">فترة تحصيل الديون (DSO)</span>
                <div className="text-2xl font-black text-amber-600 mt-1">{financialBIMetrics?.dsoDays ?? 0} يوماً</div>
                <span className="text-[10px] text-muted-foreground">متوسط سرعة تحصيل ديون العملاء</span>
              </Card>

              <Card className="p-4 border">
                <span className="text-xs text-muted-foreground">فترة سداد الموردين (DPO)</span>
                <div className="text-2xl font-black text-blue-600 mt-1">{financialBIMetrics?.dpoDays ?? 0} يوماً</div>
                <span className="text-[10px] text-muted-foreground">متوسط فترة سداد مستحقات الموردين</span>
              </Card>
            </div>

            {/* GL Balances Overview */}
            <Card className="border shadow-sm">
              <CardHeader className="p-4 border-b">
                <CardTitle className="text-sm font-bold text-foreground">أرصدة الميزانية والأستاذ العام</CardTitle>
              </CardHeader>
              <CardContent className="p-0">
                <Table>
                  <TableBody>
                    <TableRow>
                      <TableCell className="font-semibold">إجمالي الأصول (Assets)</TableCell>
                      <TableCell className="font-bold text-foreground">{currency(financialBIMetrics?.totalAssets || 0)}</TableCell>
                    </TableRow>
                    <TableRow>
                      <TableCell className="font-semibold">إجمالي الالتزامات (Liabilities)</TableCell>
                      <TableCell className="font-bold text-rose-700">{currency(financialBIMetrics?.totalLiabilities || 0)}</TableCell>
                    </TableRow>
                    <TableRow>
                      <TableCell className="font-semibold">حقوق الملكية (Equity)</TableCell>
                      <TableCell className="font-bold text-blue-700">{currency(financialBIMetrics?.totalEquity || 0)}</TableCell>
                    </TableRow>
                    <TableRow>
                      <TableCell className="font-semibold">رأس المال العامل الصافي (Working Capital)</TableCell>
                      <TableCell className="font-bold text-emerald-700">{currency(financialBIMetrics?.workingCapital || 0)}</TableCell>
                    </TableRow>
                    <TableRow>
                      <TableCell className="font-semibold">صافي الدخل من واقع الدفاتر (Net Income GL)</TableCell>
                      <TableCell className="font-bold text-emerald-700">{currency(financialBIMetrics?.netIncomeGL || 0)}</TableCell>
                    </TableRow>
                  </TableBody>
                </Table>
              </CardContent>
            </Card>
          </TabsContent>

          {/* TAB 10: DATA SYNC & PRE-AGGREGATION */}
          <TabsContent value="data_sync" className="space-y-6">
            <Card className="border shadow-sm">
              <CardHeader className="p-5 border-b">
                <CardTitle className="text-base font-bold text-foreground">
                  محرك معالجة البيانات الإحصائية اليومية المجمعة (Idempotent Daily Aggregates Engine)
                </CardTitle>
                <CardDescription className="text-xs text-muted-foreground">
                  تخزين مسبق للبيانات لرفع سرعة استجابة النظام وضمان ثبات التقارير التاريخية
                </CardDescription>
              </CardHeader>
              <CardContent className="p-5 space-y-4">
                <div className="p-4 bg-muted/30 rounded-xl border border-border text-xs text-foreground space-y-2">
                  <div className="font-bold">حالة محرك البيانات:</div>
                  <ul className="list-disc list-inside space-y-1 text-muted-foreground">
                    <li>المجاميع اليومية تحفظ بمفتاح فريد وغير قابل للتكرار: <code className="font-mono bg-muted/60 px-1.5 py-0.5 rounded border border-border text-[11px] text-foreground">{tenantId}___branchId___YYYY-MM-DD</code></li>
                    <li>المعادلات تطبق بتوقيت المنطقة الزمنية المعتمدة ({timeZone}) لمنع انزياح مبيعات ما بعد الساعة 23:00.</li>
                    <li>عمليات إعادة البناء متكررة وآمنة تماماً (Idempotent) ولا تكرر أو تغير الأرقام التاريخية.</li>
                  </ul>
                </div>

                <div className="flex items-center gap-3 pt-2">
                  <Button
                    onClick={handleRebuildAggregates}
                    disabled={isRebuildingAggregates}
                    className="bg-blue-600 hover:bg-blue-700 text-white text-xs gap-2"
                  >
                    <RefreshCw className={`w-3.5 h-3.5 ${isRebuildingAggregates ? 'animate-spin' : ''}`} />
                    {isRebuildingAggregates
                      ? 'جارٍ احتساب وتحديث المجاميع...'
                      : `إعادة بناء وتحديث مجاميع الفترة (${activeDateRange.startDate} إلى ${activeDateRange.endDate})`}
                  </Button>
                </div>
              </CardContent>
            </Card>
          </TabsContent>
        </Tabs>
      </div>
    </MainLayout>
  );
}
