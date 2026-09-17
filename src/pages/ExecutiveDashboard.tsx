import { useState, useEffect, useMemo, useCallback } from 'react';
import { MainLayout } from '@/components/layout';
import { useTenantBranch } from '@/hooks/useDatabase';
import { useAuth } from '@/hooks/useAuth';
import { useUserPermissions } from '@/hooks/usePermissions';
import { useToast } from '@/hooks/use-toast';
import { useSearchParams } from 'react-router-dom';
import {
  TrendingUp,
  DollarSign,
  Receipt,
  ShoppingCart,
  Truck,
  Users,
  Trash2,
  Calendar,
  Clock,
  CheckCircle2,
  AlertTriangle,
  XCircle,
  RefreshCw,
  Eye,
  Info,
  Wallet,
  PieChart as PieChartIcon,
  BarChart3,
  Check,
  Building2,
  HelpCircle,
  Plus,
} from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription } from '@/components/ui/dialog';
import { Label } from '@/components/ui/label';
import {
  ResponsiveContainer,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip as RechartsTooltip,
  Legend,
  PieChart,
  Pie,
  Cell,
} from 'recharts';
import {
  fetchExecutiveFinancialMetrics,
  type ExecutiveFinancialMetrics,
} from '@/services/financialAnalytics';
import {
  calculateDailyClosingPreview,
  createDailyClosing,
  fetchDailyClosingsHistory,
  voidDailyClosing,
} from '@/services/dailyClosing.service';
import type { DailyClosing, DailyClosingPreview } from '@/types/dailyClosing.types';

const PIE_COLORS = ['#10b981', '#3b82f6', '#f59e0b', '#ec4899', '#8b5cf6', '#ef4444', '#06b6d4'];

const DIFFERENCE_REASONS = [
  { value: 'cash_counting_difference', label: 'فرق في العد اليدوي للنقدية' },
  { value: 'unrecorded_expense', label: 'مصروف أو نثرية لم تسجل بالنظام' },
  { value: 'unrecorded_transaction', label: 'حركة نقدية لم يتم إدخالها' },
  { value: 'human_error', label: 'خطأ كاشير في إرجاع باقي النقود' },
  { value: 'other', label: 'أسباب أخرى (مذكورة في الملاحظات)' },
];

export default function ExecutiveDashboard() {
  const { tenantId, branchId } = useTenantBranch();
  const { user } = useAuth();
  const { hasPermission, isAdmin, isOwner } = useUserPermissions();
  const { toast } = useToast();
  const [searchParams, setSearchParams] = useSearchParams();

  const [activeTab, setActiveTab] = useState(() => searchParams.get('tab') || 'overview');
  const [dateRange, setDateRange] = useState('month');
  const [customStartDate, setCustomStartDate] = useState(() => {
    const d = new Date();
    d.setDate(1);
    return d.toISOString().split('T')[0];
  });
  const [customEndDate, setCustomEndDate] = useState(() => new Date().toISOString().split('T')[0]);

  // Financial Metrics State
  const [metrics, setMetrics] = useState<ExecutiveFinancialMetrics | null>(null);
  const [loadingMetrics, setLoadingMetrics] = useState(true);

  // Daily Closing State
  const [closingDate, setClosingDate] = useState(() => new Date().toISOString().split('T')[0]);
  const [closingPreview, setClosingPreview] = useState<DailyClosingPreview | null>(null);
  const [loadingPreview, setLoadingPreview] = useState(false);
  const [actualCashInput, setActualCashInput] = useState('');
  const [differenceReason, setDifferenceReason] = useState('');
  const [closingNotes, setClosingNotes] = useState('');
  const [isSubmittingClosing, setIsSubmittingClosing] = useState(false);
  const [closingsHistory, setClosingsHistory] = useState<DailyClosing[]>([]);
  const [loadingHistory, setLoadingHistory] = useState(false);

  // Modals
  const [viewingSnapshot, setViewingSnapshot] = useState<DailyClosing | null>(null);
  const [voidingClosingId, setVoidingClosingId] = useState<string | null>(null);
  const [voidReason, setVoidReason] = useState('');
  const [isVoiding, setIsVoiding] = useState(false);

  // 1. Fetch Executive Overview Metrics
  const loadFinancialMetrics = useCallback(async () => {
    if (!tenantId) return;
    setLoadingMetrics(true);
    try {
      const data = await fetchExecutiveFinancialMetrics(
        tenantId,
        branchId,
        dateRange,
        customStartDate,
        customEndDate
      );
      setMetrics(data);
    } catch (err: any) {
      console.error('Error fetching executive metrics:', err);
      toast({ title: 'خطأ', description: 'تعذر تحميل البيانات المالية', variant: 'destructive' });
    } finally {
      setLoadingMetrics(false);
    }
  }, [tenantId, branchId, dateRange, customStartDate, customEndDate, toast]);

  // 2. Fetch Closing Preview
  const loadClosingPreview = useCallback(async () => {
    if (!tenantId || !branchId) return;
    setLoadingPreview(true);
    try {
      const preview = await calculateDailyClosingPreview(tenantId, branchId, closingDate);
      setClosingPreview(preview);
      if (preview.existingClosing) {
        setActualCashInput(String(preview.existingClosing.actualCash));
        setDifferenceReason(preview.existingClosing.differenceReason || '');
        setClosingNotes(preview.existingClosing.notes || '');
      } else {
        setActualCashInput('');
        setDifferenceReason('');
        setClosingNotes('');
      }
    } catch (err) {
      console.error('Error fetching closing preview:', err);
    } finally {
      setLoadingPreview(false);
    }
  }, [tenantId, branchId, closingDate]);

  // 3. Fetch Closings History
  const loadClosingsHistory = useCallback(async () => {
    if (!tenantId) return;
    setLoadingHistory(true);
    try {
      const history = await fetchDailyClosingsHistory(tenantId, branchId);
      setClosingsHistory(history);
    } catch (err) {
      console.error('Error loading history:', err);
    } finally {
      setLoadingHistory(false);
    }
  }, [tenantId, branchId]);

  useEffect(() => {
    loadFinancialMetrics();
  }, [loadFinancialMetrics]);

  useEffect(() => {
    if (activeTab === 'closing') {
      loadClosingPreview();
      loadClosingsHistory();
    }
  }, [activeTab, loadClosingPreview, loadClosingsHistory]);

  // Sync tab with URL
  const handleTabChange = (val: string) => {
    setActiveTab(val);
    setSearchParams({ tab: val });
  };

  // Live difference computation for Closing
  const calculatedDifference = useMemo(() => {
    if (!closingPreview || actualCashInput === '') return 0;
    const actual = Number(actualCashInput) || 0;
    return Math.round((actual - closingPreview.expectedCash) * 100) / 100;
  }, [closingPreview, actualCashInput]);

  // Handle Save Closing
  const handleSaveClosing = async () => {
    if (!closingPreview || isSubmittingClosing) return;
    if (actualCashInput === '') {
      toast({ title: 'تنبيه', description: 'يرجى إدخال مبلغ النقدية الفعلي المحسوب بالدرج', variant: 'destructive' });
      return;
    }

    const actual = Number(actualCashInput);
    if (!Number.isFinite(actual) || actual < 0) {
      toast({ title: 'تنبيه', description: 'يرجى إدخال رقم موجب صالح', variant: 'destructive' });
      return;
    }

    if (calculatedDifference !== 0 && !differenceReason) {
      toast({ title: 'تنبيه', description: 'يرجى اختيار سبب الفارق النقدي للمتابعة', variant: 'destructive' });
      return;
    }

    setIsSubmittingClosing(true);
    try {
      const res = await createDailyClosing(
        closingPreview,
        actual,
        differenceReason,
        closingNotes,
        { name: user?.displayName || '', email: user?.email || '', uid: user?.uid }
      );

      if (!res.success) {
        toast({ title: 'تعذر الحفظ', description: res.error, variant: 'destructive' });
      } else {
        toast({ title: 'تم الحفظ', description: 'تم إغلاق اليوم المالي وحفظ المطابقة النقدية بنجاح' });
        loadClosingPreview();
        loadClosingsHistory();
      }
    } catch (err: any) {
      toast({ title: 'خطأ', description: err.message, variant: 'destructive' });
    } finally {
      setIsSubmittingClosing(false);
    }
  };

  // Handle Void Closing
  const handleConfirmVoid = async () => {
    if (!voidingClosingId || !voidReason.trim() || isVoiding) return;
    setIsVoiding(true);
    try {
      const res = await voidDailyClosing(voidingClosingId, voidReason, {
        name: user?.displayName || user?.email || '',
      });
      if (res.success) {
        toast({ title: 'تم الإلغاء', description: 'تم إلغاء سجل الإغلاق بنجاح' });
        setVoidingClosingId(null);
        setVoidReason('');
        loadClosingPreview();
        loadClosingsHistory();
      } else {
        toast({ title: 'خطأ', description: res.error, variant: 'destructive' });
      }
    } finally {
      setIsVoiding(false);
    }
  };

  return (
    <MainLayout
      title="اللوحة المالية والتنفيذية والإغلاق اليومي"
      subtitle="رؤية شاملة وموحدة للأداء المالي، التدفقات النقدية، والمطابقة اليومية للخزينة (Read-Only Zero Impact)"
      actions={
        <div className="flex flex-wrap items-center gap-2 print:hidden w-full sm:w-auto">
          {activeTab === 'overview' && (
            <>
              <Select value={dateRange} onValueChange={setDateRange}>
                <SelectTrigger className="w-[130px] sm:w-[140px] bg-background">
                  <SelectValue placeholder="اختر الفترة" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="today">اليوم</SelectItem>
                  <SelectItem value="yesterday">الأمس</SelectItem>
                  <SelectItem value="week">آخر 7 أيام</SelectItem>
                  <SelectItem value="month">هذا الشهر</SelectItem>
                  <SelectItem value="year">هذا العام</SelectItem>
                  <SelectItem value="all">كل الفترات</SelectItem>
                  <SelectItem value="custom">فترة مخصصة</SelectItem>
                </SelectContent>
              </Select>

              {dateRange === 'custom' && (
                <div className="flex items-center gap-1.5">
                  <input
                    type="date"
                    value={customStartDate}
                    onChange={(e) => setCustomStartDate(e.target.value)}
                    className="flex h-9 rounded-md border border-input bg-background px-2 py-1 text-xs shadow-sm max-w-[120px]"
                  />
                  <span className="text-muted-foreground">-</span>
                  <input
                    type="date"
                    value={customEndDate}
                    onChange={(e) => setCustomEndDate(e.target.value)}
                    className="flex h-9 rounded-md border border-input bg-background px-2 py-1 text-xs shadow-sm max-w-[120px]"
                  />
                </div>
              )}
            </>
          )}

          <Button
            variant="outline"
            size="sm"
            onClick={() => {
              if (activeTab === 'overview') loadFinancialMetrics();
              else {
                loadClosingPreview();
                loadClosingsHistory();
              }
            }}
            className="gap-1.5 h-9"
          >
            <RefreshCw className="w-3.5 h-3.5" />
            تحديث
          </Button>
        </div>
      }
    >
      <div className="space-y-6">
        {/* Navigation Tabs */}
        <Tabs value={activeTab} onValueChange={handleTabChange} className="space-y-6">
          <TabsList className="bg-slate-900/80 border border-slate-800 p-1 rounded-xl w-full sm:w-auto flex">
            <TabsTrigger value="overview" className="gap-2 flex-1 sm:flex-initial">
              <TrendingUp className="w-4 h-4" />
              اللوحة المالية الشاملة
            </TabsTrigger>
            <TabsTrigger value="closing" className="gap-2 flex-1 sm:flex-initial">
              <CheckCircle2 className="w-4 h-4" />
              الإغلاق اليومي والمطابقة النقدية
            </TabsTrigger>
          </TabsList>

          {/* ========================================================================= */}
          {/* TAB 1: EXECUTIVE FINANCIAL OVERVIEW                                       */}
          {/* ========================================================================= */}
          <TabsContent value="overview" className="space-y-6">
            {loadingMetrics || !metrics ? (
              <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4 animate-pulse">
                {[1, 2, 3, 4, 5, 6, 7, 8].map((i) => (
                  <Card key={i} className="h-28 bg-slate-900/40 border-slate-800" />
                ))}
              </div>
            ) : (
              <>
                {/* Row 1: Core 4 Executive Indicators */}
                <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
                  {/* 1. Total Sales */}
                  <Card className="hover:shadow-md transition-shadow border-slate-800 bg-slate-950/40">
                    <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                      <CardTitle className="text-sm font-medium">إجمالي المبيعات</CardTitle>
                      <ShoppingCart className="h-4 w-4 text-blue-500" />
                    </CardHeader>
                    <CardContent>
                      <div className="text-2xl font-bold text-foreground">
                        {metrics.totalSales.toLocaleString('ar-EG')} ج.م
                      </div>
                      <div className="flex items-center gap-2 mt-2 text-[11px] text-muted-foreground">
                        <Badge variant="outline" className="bg-emerald-500/10 text-emerald-400 border-emerald-500/20 text-[10px] px-1.5 py-0">
                          كاش: {metrics.cashSales.toLocaleString('ar-EG')}
                        </Badge>
                        <Badge variant="outline" className="bg-blue-500/10 text-blue-400 border-blue-500/20 text-[10px] px-1.5 py-0">
                          إلكتروني: {metrics.electronicSales.toLocaleString('ar-EG')}
                        </Badge>
                      </div>
                    </CardContent>
                  </Card>

                  {/* 2. Total Cash Outflows */}
                  <Card className="hover:shadow-md transition-shadow border-slate-800 bg-slate-950/40">
                    <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                      <CardTitle className="text-sm font-medium">إجمالي الخارج من الخزنة</CardTitle>
                      <Receipt className="h-4 w-4 text-rose-500" />
                    </CardHeader>
                    <CardContent>
                      <div className="text-2xl font-bold text-destructive">
                        {metrics.totalCashOutflows.toLocaleString('ar-EG')} ج.م
                      </div>
                      <p className="text-xs text-muted-foreground mt-1">
                        تدفقات نقدية خارجة فعلية (تشغيل + سلف)
                      </p>
                    </CardContent>
                  </Card>

                  {/* 3. Operating Expenses */}
                  <Card className="hover:shadow-md transition-shadow border-slate-800 bg-slate-950/40">
                    <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                      <CardTitle className="text-sm font-medium">مصروفات التشغيل</CardTitle>
                      <Receipt className="h-4 w-4 text-amber-500" />
                    </CardHeader>
                    <CardContent>
                      <div className="text-2xl font-bold text-amber-400">
                        {metrics.operatingExpenses.toLocaleString('ar-EG')} ج.م
                      </div>
                      <p className="text-xs text-muted-foreground mt-1">
                        تُحتسب في الأرباح والخسائر (بدون السلف)
                      </p>
                    </CardContent>
                  </Card>

                  {/* 4. Operating Result */}
                  <Card className={`hover:shadow-md transition-shadow border-slate-800 ${
                    metrics.operatingResult >= 0 ? 'bg-emerald-950/15' : 'bg-rose-950/15'
                  }`}>
                    <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                      <div className="flex items-center gap-1.5">
                        <CardTitle className="text-sm font-medium">صافي الحركة التشغيلية</CardTitle>
                        <HelpCircle className="w-3.5 h-3.5 text-muted-foreground" title="المعادلة: المبيعات - مصروفات التشغيل - الهالك" />
                      </div>
                      <TrendingUp className={`h-4 w-4 ${metrics.operatingResult >= 0 ? 'text-emerald-500' : 'text-rose-500'}`} />
                    </CardHeader>
                    <CardContent>
                      <div className={`text-2xl font-bold ${
                        metrics.operatingResult >= 0 ? 'text-emerald-400' : 'text-rose-400'
                      }`}>
                        {metrics.operatingResult.toLocaleString('ar-EG')} ج.م
                      </div>
                      <p className="text-xs text-muted-foreground mt-1">
                        المبيعات - مصروفات التشغيل - الهالك
                      </p>
                    </CardContent>
                  </Card>
                </div>

                {/* Row 2: Secondary Operational Metrics */}
                <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
                  {/* 5. Payroll & Advances */}
                  <Card className="border-slate-800 bg-slate-950/40">
                    <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                      <CardTitle className="text-sm font-medium">الرواتب والسلف</CardTitle>
                      <Wallet className="h-4 w-4 text-emerald-400" />
                    </CardHeader>
                    <CardContent>
                      <div className="text-lg font-bold text-slate-100">
                        سلف نشطة: {metrics.advancesOutstanding.toLocaleString('ar-EG')} ج.م
                      </div>
                      <p className="text-xs text-muted-foreground mt-1">
                        مرتبات مدفوعة: {metrics.payrollDisbursed.toLocaleString('ar-EG')} ج.م
                      </p>
                    </CardContent>
                  </Card>

                  {/* 6. Purchases & Supplier Dues */}
                  <Card className="border-slate-800 bg-slate-950/40">
                    <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                      <CardTitle className="text-sm font-medium">المشتريات والموردين</CardTitle>
                      <Truck className="h-4 w-4 text-indigo-400" />
                    </CardHeader>
                    <CardContent>
                      <div className="text-lg font-bold text-slate-100">
                        مشتريات: {metrics.purchasesTotal.toLocaleString('ar-EG')} ج.م
                      </div>
                      <p className="text-xs text-rose-400 mt-1 font-medium">
                        مستحقات آجلة: {metrics.supplierBalancesTotal.toLocaleString('ar-EG')} ج.م
                      </p>
                    </CardContent>
                  </Card>

                  {/* 7. Waste & Spoilage */}
                  <Card className="border-slate-800 bg-slate-950/40">
                    <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                      <CardTitle className="text-sm font-medium">الهالك والتوالف</CardTitle>
                      <Trash2 className="h-4 w-4 text-rose-400" />
                    </CardHeader>
                    <CardContent>
                      <div className="text-lg font-bold text-rose-400">
                        {metrics.wasteCost.toLocaleString('ar-EG')} ج.م
                      </div>
                      <p className="text-xs text-muted-foreground mt-1">
                        تكلفة الهالك الموثق من المخزن
                      </p>
                    </CardContent>
                  </Card>

                  {/* 8. Expected Cash In Drawer */}
                  <Card className="border-slate-800 bg-slate-950/40">
                    <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                      <CardTitle className="text-sm font-medium">النقدية التقديرية بالخزينة</CardTitle>
                      <DollarSign className="h-4 w-4 text-emerald-400" />
                    </CardHeader>
                    <CardContent>
                      <div className="text-lg font-bold text-emerald-400">
                        {metrics.expectedCash.toLocaleString('ar-EG')} ج.م
                      </div>
                      <p className="text-xs text-muted-foreground mt-1">
                        نقدية البداية + الكاش - المنصرف
                      </p>
                    </CardContent>
                  </Card>
                </div>

                {/* Visual Charts */}
                <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
                  {/* Timeline Bar Chart */}
                  <Card className="lg:col-span-2 border-slate-800 bg-slate-950/40">
                    <CardHeader className="pb-2">
                      <CardTitle className="text-sm font-medium flex items-center gap-2">
                        <BarChart3 className="w-4 h-4 text-primary" />
                        اتجاهات المبيعات والتدفقات النقدية الخارجة
                      </CardTitle>
                    </CardHeader>
                    <CardContent>
                      <div className="h-[280px] w-full">
                        {metrics.timelineData.length === 0 ? (
                          <div className="h-full flex items-center justify-center text-xs text-muted-foreground">
                            لا توجد بيانات كافية للفترة المحددة
                          </div>
                        ) : (
                          <ResponsiveContainer width="100%" height="100%">
                            <BarChart data={metrics.timelineData}>
                              <CartesianGrid strokeDasharray="3 3" vertical={false} opacity={0.2} />
                              <XAxis dataKey="date" tick={{ fontSize: 11 }} />
                              <YAxis tick={{ fontSize: 11 }} width={55} />
                              <RechartsTooltip
                                contentStyle={{
                                  backgroundColor: '#0f172a',
                                  borderColor: '#334155',
                                  borderRadius: '8px',
                                  fontSize: '12px',
                                }}
                              />
                              <Legend wrapperStyle={{ fontSize: '11px', marginTop: '6px' }} />
                              <Bar dataKey="sales" name="المبيعات" fill="#3b82f6" radius={[4, 4, 0, 0]} />
                              <Bar dataKey="cashOutflows" name="الخارج من الخزنة" fill="#ef4444" radius={[4, 4, 0, 0]} />
                              <Bar dataKey="operatingExpenses" name="مصروفات التشغيل" fill="#f59e0b" radius={[4, 4, 0, 0]} />
                            </BarChart>
                          </ResponsiveContainer>
                        )}
                      </div>
                    </CardContent>
                  </Card>

                  {/* Expenses Pie Chart */}
                  <Card className="border-slate-800 bg-slate-950/40">
                    <CardHeader className="pb-2">
                      <CardTitle className="text-sm font-medium flex items-center gap-2">
                        <PieChartIcon className="w-4 h-4 text-amber-500" />
                        توزيع قنوات الصرف المالي
                      </CardTitle>
                    </CardHeader>
                    <CardContent>
                      <div className="h-[280px] w-full">
                        {metrics.expensesByCategory.length === 0 ? (
                          <div className="h-full flex items-center justify-center text-xs text-muted-foreground">
                            لا توجد مصروفات مسجلة
                          </div>
                        ) : (
                          <ResponsiveContainer width="100%" height="100%">
                            <PieChart>
                              <Pie
                                data={metrics.expensesByCategory}
                                cx="50%"
                                cy="50%"
                                innerRadius={55}
                                outerRadius={75}
                                paddingAngle={4}
                                dataKey="value"
                              >
                                {metrics.expensesByCategory.map((_, idx) => (
                                  <Cell key={`cell-${idx}`} fill={PIE_COLORS[idx % PIE_COLORS.length]} />
                                ))}
                              </Pie>
                              <RechartsTooltip
                                contentStyle={{
                                  backgroundColor: '#0f172a',
                                  borderColor: '#334155',
                                  borderRadius: '8px',
                                  fontSize: '12px',
                                }}
                              />
                              <Legend wrapperStyle={{ fontSize: '11px', marginTop: '6px' }} />
                            </PieChart>
                          </ResponsiveContainer>
                        )}
                      </div>
                    </CardContent>
                  </Card>
                </div>

                {/* Money In vs Money Out Audit Table */}
                <Card className="border-slate-800 bg-slate-950/40">
                  <CardHeader className="pb-3">
                    <CardTitle className="text-base flex items-center gap-2">
                      <DollarSign className="w-4 h-4 text-emerald-400" />
                      <span>جدول مطابقة التدفقات النقدية (Money In vs Money Out)</span>
                    </CardTitle>
                    <CardDescription className="text-xs">
                      فصل محاسبي دقيق بين النقدية الداخلة والخارجة بدون أي احتساب مزدوج
                    </CardDescription>
                  </CardHeader>
                  <CardContent className="p-0">
                    <div className="border-t border-slate-800 overflow-x-auto">
                      <Table>
                        <TableHeader className="bg-slate-900/60 text-xs">
                          <TableRow className="border-slate-800">
                            <TableHead className="text-right">نوع البند</TableHead>
                            <TableHead className="text-right">الوصف المحاسبي</TableHead>
                            <TableHead className="text-center">الأثر على الخزنة</TableHead>
                            <TableHead className="text-center">الأثر على صافي التشغيل</TableHead>
                            <TableHead className="text-left">القيمة المالية</TableHead>
                          </TableRow>
                        </TableHeader>
                        <TableBody className="text-xs">
                          <TableRow className="border-slate-800/60">
                            <TableCell className="font-bold text-blue-400">مبيعات نقدية (Cash In)</TableCell>
                            <TableCell>فواتير المبيعات المدفوعة كاش من شاشات الـ POS</TableCell>
                            <TableCell className="text-center text-emerald-400">+ تدفق داخل</TableCell>
                            <TableCell className="text-center text-emerald-400">+ إيراد تشغيلي</TableCell>
                            <TableCell className="text-left font-mono font-bold text-emerald-400">
                              {metrics.cashSales.toLocaleString('ar-EG')} ج.م
                            </TableCell>
                          </TableRow>

                          <TableRow className="border-slate-800/60">
                            <TableCell className="font-bold text-indigo-400">مبيعات إلكترونية (Bank/Wallet)</TableCell>
                            <TableCell>فواتير عبر فيزا، إنستاباي، أو فودافون كاش</TableCell>
                            <TableCell className="text-center text-muted-foreground">خارج درج النقدية</TableCell>
                            <TableCell className="text-center text-emerald-400">+ إيراد تشغيلي</TableCell>
                            <TableCell className="text-left font-mono font-bold text-blue-400">
                              {metrics.electronicSales.toLocaleString('ar-EG')} ج.م
                            </TableCell>
                          </TableRow>

                          <TableRow className="border-slate-800/60">
                            <TableCell className="font-bold text-amber-400">مصروفات تشغيلية (Operating Expenses)</TableCell>
                            <TableCell>إيجار، خامات، صيانة، نثريات (تستثني السلف)</TableCell>
                            <TableCell className="text-center text-rose-400">- تدفق خارج</TableCell>
                            <TableCell className="text-center text-rose-400">- عبء تشغيلي</TableCell>
                            <TableCell className="text-left font-mono font-bold text-amber-400">
                              {metrics.operatingExpenses.toLocaleString('ar-EG')} ج.م
                            </TableCell>
                          </TableRow>

                          <TableRow className="border-slate-800/60">
                            <TableCell className="font-bold text-purple-400">سلف موظفين منصرفة (Advances Outflow)</TableCell>
                            <TableCell>خروج نقدية من الخزنة كعهدة سلفة (أصل/ذمة مدينة، وليست مصروف تشغيلي)</TableCell>
                            <TableCell className="text-center text-rose-400">- تدفق خارج</TableCell>
                            <TableCell className="text-center text-muted-foreground">محايد (غير تشغيلي)</TableCell>
                            <TableCell className="text-left font-mono font-bold text-purple-400">
                              {metrics.advancesDisbursed.toLocaleString('ar-EG')} ج.م
                            </TableCell>
                          </TableRow>

                          <TableRow className="border-slate-800/60">
                            <TableCell className="font-bold text-emerald-400">صافي مسير الرواتب المسدد (Salary Payments)</TableCell>
                            <TableCell>المرتبات بعد خصم السلف (لا يحدث أي Double Counting)</TableCell>
                            <TableCell className="text-center text-rose-400">- تدفق خارج</TableCell>
                            <TableCell className="text-center text-rose-400">- عبء تشغيلي</TableCell>
                            <TableCell className="text-left font-mono font-bold text-emerald-400">
                              {metrics.payrollDisbursed.toLocaleString('ar-EG')} ج.م
                            </TableCell>
                          </TableRow>

                          <TableRow className="border-slate-800/60">
                            <TableCell className="font-bold text-rose-400">هالك وتوالف المخزون (Waste Cost)</TableCell>
                            <TableCell>قيمة المواد التالفة أو منتهية الصلاحية من المخزن</TableCell>
                            <TableCell className="text-center text-muted-foreground">خسارة عينية</TableCell>
                            <TableCell className="text-center text-rose-400">- عبء تشغيلي</TableCell>
                            <TableCell className="text-left font-mono font-bold text-rose-400">
                              {metrics.wasteCost.toLocaleString('ar-EG')} ج.م
                            </TableCell>
                          </TableRow>
                        </TableBody>
                      </Table>
                    </div>
                  </CardContent>
                </Card>
              </>
            )}
          </TabsContent>

          {/* ========================================================================= */}
          {/* TAB 2: SAFE DAILY CLOSING & CASH RECONCILIATION                           */}
          {/* ========================================================================= */}
          <TabsContent value="closing" className="space-y-6">
            {/* Top Date Switcher for Closing */}
            <div className="flex flex-wrap items-center justify-between gap-4 p-4 rounded-xl bg-slate-950/60 border border-slate-800">
              <div className="flex items-center gap-2">
                <Calendar className="w-5 h-5 text-primary" />
                <div>
                  <h4 className="text-sm font-bold text-slate-100">تاريخ الإغلاق اليومي والمطابقة</h4>
                  <p className="text-xs text-muted-foreground">اختر اليوم لعرض الحركات النقدية ومطابقة العجز والفائض</p>
                </div>
              </div>
              <div className="flex items-center gap-2">
                <Input
                  type="date"
                  value={closingDate}
                  onChange={(e) => setClosingDate(e.target.value)}
                  className="w-40 font-mono text-xs bg-background"
                />
              </div>
            </div>

            {/* Reconciliation Preview Box */}
            {loadingPreview || !closingPreview ? (
              <Card className="h-64 border-slate-800 bg-slate-950/40 flex items-center justify-center animate-pulse">
                <p className="text-xs text-muted-foreground">جاري فحص وتجميع نقدية اليوم المحدد...</p>
              </Card>
            ) : (
              <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
                {/* Left Col: Expected Breakdown (2 Cols) */}
                <Card className="lg:col-span-2 border-slate-800 bg-slate-950/40">
                  <CardHeader>
                    <div className="flex items-center justify-between">
                      <CardTitle className="text-base flex items-center gap-2">
                        <DollarSign className="w-4 h-4 text-primary" />
                        <span>بيانات نقدية اليوم ({closingDate})</span>
                      </CardTitle>
                      {closingPreview.existingClosing && (
                        <Badge
                          variant="outline"
                          className={
                            closingPreview.existingClosing.status === 'closed'
                              ? 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20'
                              : closingPreview.existingClosing.status === 'needs_review'
                              ? 'bg-amber-500/10 text-amber-400 border-amber-500/20'
                              : 'bg-rose-500/10 text-rose-400 border-rose-500/20'
                          }
                        >
                          {closingPreview.existingClosing.status === 'closed'
                            ? 'تم الإغلاق بنجاح'
                            : closingPreview.existingClosing.status === 'needs_review'
                            ? 'مغلق مع ملاحظات'
                            : 'ملغي'}
                        </Badge>
                      )}
                    </div>
                    <CardDescription className="text-xs">
                      الحركات المحسوبة تلقائياً من فواتير المبيعات وسندات الصرف في الخزنة
                    </CardDescription>
                  </CardHeader>
                  <CardContent className="space-y-4">
                    <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                      <div className="p-3 rounded-xl bg-slate-900/60 border border-slate-800">
                        <span className="text-[11px] text-muted-foreground">نقدية البداية (عهدة)</span>
                        <div className="text-base font-bold font-mono text-slate-100 mt-1">
                          {closingPreview.openingCash.toLocaleString('ar-EG')} ج.م
                        </div>
                      </div>

                      <div className="p-3 rounded-xl bg-slate-900/60 border border-slate-800">
                        <span className="text-[11px] text-muted-foreground">مبيعات كاش</span>
                        <div className="text-base font-bold font-mono text-emerald-400 mt-1">
                          +{closingPreview.cashSales.toLocaleString('ar-EG')} ج.م
                        </div>
                      </div>

                      <div className="p-3 rounded-xl bg-slate-900/60 border border-slate-800">
                        <span className="text-[11px] text-muted-foreground">الخارج من الخزنة</span>
                        <div className="text-base font-bold font-mono text-rose-400 mt-1">
                          -{closingPreview.cashOutflows.toLocaleString('ar-EG')} ج.م
                        </div>
                      </div>

                      <div className="p-3 rounded-xl bg-primary/10 border border-primary/30">
                        <span className="text-[11px] text-primary font-bold">النقدية المتوقعة</span>
                        <div className="text-base font-bold font-mono text-primary mt-1">
                          {closingPreview.expectedCash.toLocaleString('ar-EG')} ج.م
                        </div>
                      </div>
                    </div>

                    <div className="border-t border-slate-800 pt-3 space-y-2 text-xs">
                      <div className="flex justify-between py-1 border-b border-slate-800/40">
                        <span className="text-muted-foreground">عدد الطلبات المنفذة كاش:</span>
                        <span className="font-mono">{closingPreview.ordersCount} طلب</span>
                      </div>
                      <div className="flex justify-between py-1 border-b border-slate-800/40">
                        <span className="text-muted-foreground">مبيعات إلكترونية (فيزا / محافظ):</span>
                        <span className="font-mono text-blue-400">{closingPreview.electronicSales.toLocaleString('ar-EG')} ج.م</span>
                      </div>
                      <div className="flex justify-between py-1 border-b border-slate-800/40">
                        <span className="text-muted-foreground">سلف موظفين منصرفة اليوم:</span>
                        <span className="font-mono text-purple-400">{closingPreview.advancesCash.toLocaleString('ar-EG')} ج.م</span>
                      </div>
                      <div className="flex justify-between py-1">
                        <span className="text-muted-foreground">مصروفات تشغيلية مسددة اليوم:</span>
                        <span className="font-mono text-amber-400">{closingPreview.operatingExpenses.toLocaleString('ar-EG')} ج.م</span>
                      </div>
                    </div>
                  </CardContent>
                </Card>

                {/* Right Col: Actual Cash Entry & Difference */}
                <Card className="border-slate-800 bg-slate-950/60 flex flex-col justify-between">
                  <CardHeader>
                    <CardTitle className="text-base">تسجيل النقدية الفعلية بالدرج</CardTitle>
                    <CardDescription className="text-xs">
                      أدخل المبلغ بعد الجرد اليدوي للخزينة لمقارنة الفارق
                    </CardDescription>
                  </CardHeader>
                  <CardContent className="space-y-4 flex-1">
                    <div className="space-y-2">
                      <Label className="text-xs font-medium">النقدية الفعلية المعدودة (ج.م)</Label>
                      <Input
                        type="number"
                        min="0"
                        step="1"
                        disabled={Boolean(closingPreview.existingClosing && closingPreview.existingClosing.status !== 'voided')}
                        placeholder="أدخل المبلغ الفعلي..."
                        value={actualCashInput}
                        onChange={(e) => setActualCashInput(e.target.value)}
                        className="font-mono text-base font-bold bg-background text-left"
                        dir="ltr"
                      />
                    </div>

                    {/* Live Difference Badge */}
                    {actualCashInput !== '' && (
                      <div
                        className={`p-3 rounded-xl border flex items-center justify-between ${
                          calculatedDifference === 0
                            ? 'bg-emerald-500/10 border-emerald-500/30 text-emerald-400'
                            : calculatedDifference < 0
                            ? 'bg-rose-500/10 border-rose-500/30 text-rose-400'
                            : 'bg-blue-500/10 border-blue-500/30 text-blue-400'
                        }`}
                      >
                        <div className="flex items-center gap-1.5 text-xs font-bold">
                          {calculatedDifference === 0 ? (
                            <>
                              <Check className="w-4 h-4" />
                              <span>الخزينة مطابقة تماماً</span>
                            </>
                          ) : calculatedDifference < 0 ? (
                            <>
                              <AlertTriangle className="w-4 h-4" />
                              <span>يوجد عجز نقدي في الخزينة</span>
                            </>
                          ) : (
                            <>
                              <Info className="w-4 h-4" />
                              <span>يوجد فائض نقدي في الخزينة</span>
                            </>
                          )}
                        </div>
                        <span className="font-mono text-sm font-black">
                          {calculatedDifference > 0 ? `+${calculatedDifference}` : calculatedDifference} ج.م
                        </span>
                      </div>
                    )}

                    {/* Reason Selector (Mandatory if Difference !== 0) */}
                    {calculatedDifference !== 0 && actualCashInput !== '' && (
                      <div className="space-y-1.5">
                        <Label className="text-xs font-medium text-amber-400">سبب الفارق النقدي (إجباري)</Label>
                        <Select
                          disabled={Boolean(closingPreview.existingClosing && closingPreview.existingClosing.status !== 'voided')}
                          value={differenceReason}
                          onValueChange={setDifferenceReason}
                        >
                          <SelectTrigger className="bg-background text-xs">
                            <SelectValue placeholder="اختر سبب الفارق..." />
                          </SelectTrigger>
                          <SelectContent>
                            {DIFFERENCE_REASONS.map((r) => (
                              <SelectItem key={r.value} value={r.label}>
                                {r.label}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </div>
                    )}

                    <div className="space-y-1.5">
                      <Label className="text-xs font-medium">ملاحظات الإغلاق</Label>
                      <Input
                        disabled={Boolean(closingPreview.existingClosing && closingPreview.existingClosing.status !== 'voided')}
                        placeholder="أي ملاحظات إضافية..."
                        value={closingNotes}
                        onChange={(e) => setClosingNotes(e.target.value)}
                        className="text-xs bg-background"
                      />
                    </div>
                  </CardContent>

                  <CardHeader className="pt-2 border-t border-slate-800">
                    {closingPreview.existingClosing && closingPreview.existingClosing.status !== 'voided' ? (
                      <div className="space-y-2">
                        <div className="text-center p-2 rounded-lg bg-slate-900 text-xs text-muted-foreground">
                          تم إغلاق هذا اليوم بواسطة {closingPreview.existingClosing.closedBy}
                        </div>
                        <Button
                          variant="outline"
                          className="w-full text-xs"
                          onClick={() => setViewingSnapshot(closingPreview.existingClosing)}
                        >
                          <Eye className="w-3.5 h-3.5 ml-1.5" />
                          عرض الـ Snapshot المؤرشف وقت الإغلاق
                        </Button>
                      </div>
                    ) : (
                      <Button
                        onClick={handleSaveClosing}
                        disabled={isSubmittingClosing}
                        className="w-full gap-2 font-bold"
                      >
                        <CheckCircle2 className="w-4 h-4" />
                        {isSubmittingClosing ? 'جاري الحفظ...' : 'اعتماد وحفظ الإغلاق اليومي'}
                      </Button>
                    )}
                  </CardHeader>
                </Card>
              </div>
            )}

            {/* Historical Closings Table */}
            <Card className="border-slate-800 bg-slate-950/40">
              <CardHeader className="pb-3">
                <CardTitle className="text-base flex items-center gap-2">
                  <Clock className="w-4 h-4 text-primary" />
                  <span>سجل الإغلاقات والمطابقات النقدية السابقة</span>
                </CardTitle>
                <CardDescription className="text-xs">
                  سجلات الأرشيف التاريخي لمطابقة نقدية الخزينة لكل يوم عمل
                </CardDescription>
              </CardHeader>
              <CardContent className="p-0">
                <div className="border-t border-slate-800 overflow-x-auto">
                  <Table>
                    <TableHeader className="bg-slate-900/60 text-xs">
                      <TableRow className="border-slate-800">
                        <TableHead className="text-right">التاريخ</TableHead>
                        <TableHead className="text-center">المتوقع</TableHead>
                        <TableHead className="text-center">الفعلي</TableHead>
                        <TableHead className="text-center">الفارق</TableHead>
                        <TableHead className="text-center">السبب / الملاحظات</TableHead>
                        <TableHead className="text-center">مسؤول الإغلاق</TableHead>
                        <TableHead className="text-center">الحالة</TableHead>
                        <TableHead className="text-left">الإجراءات</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody className="text-xs">
                      {loadingHistory ? (
                        <TableRow>
                          <TableCell colSpan={8} className="text-center py-8 text-muted-foreground">
                            جاري تحميل سجلات الإغلاق...
                          </TableCell>
                        </TableRow>
                      ) : closingsHistory.length === 0 ? (
                        <TableRow>
                          <TableCell colSpan={8} className="text-center py-8 text-muted-foreground">
                            لا توجد إغلاقات يومية مسجلة حتى الآن
                          </TableCell>
                        </TableRow>
                      ) : (
                        closingsHistory.map((c) => {
                          const isVoided = c.status === 'voided';
                          return (
                            <TableRow key={c.id} className={`border-slate-800/60 ${isVoided ? 'opacity-50' : ''}`}>
                              <TableCell className="font-mono font-bold">{c.date}</TableCell>
                              <TableCell className="text-center font-mono">
                                {c.expectedCash.toLocaleString('ar-EG')} ج.م
                              </TableCell>
                              <TableCell className="text-center font-mono font-bold text-slate-100">
                                {c.actualCash.toLocaleString('ar-EG')} ج.م
                              </TableCell>
                              <TableCell className="text-center">
                                <Badge
                                  variant="outline"
                                  className={`text-[10px] font-mono ${
                                    c.difference === 0
                                      ? 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20'
                                      : c.difference < 0
                                      ? 'bg-rose-500/10 text-rose-400 border-rose-500/20'
                                      : 'bg-blue-500/10 text-blue-400 border-blue-500/20'
                                  }`}
                                >
                                  {c.difference === 0 ? 'مطابق' : `${c.difference > 0 ? '+' : ''}${c.difference} ج.م`}
                                </Badge>
                              </TableCell>
                              <TableCell className="text-center text-muted-foreground max-w-[150px] truncate">
                                {c.differenceReason || c.notes || '-'}
                              </TableCell>
                              <TableCell className="text-center text-slate-300 font-medium">
                                {c.closedBy}
                              </TableCell>
                              <TableCell className="text-center">
                                <Badge
                                  variant="secondary"
                                  className={`text-[9px] ${
                                    isVoided
                                      ? 'bg-rose-500/10 text-rose-400'
                                      : c.status === 'closed'
                                      ? 'bg-emerald-500/10 text-emerald-400'
                                      : 'bg-amber-500/10 text-amber-400'
                                  }`}
                                >
                                  {isVoided ? 'ملغي' : c.status === 'closed' ? 'معتمد' : 'يحتاج مراجعة'}
                                </Badge>
                              </TableCell>
                              <TableCell className="text-left">
                                <div className="flex items-center gap-1.5 justify-end">
                                  <Button
                                    variant="ghost"
                                    size="sm"
                                    onClick={() => setViewingSnapshot(c)}
                                    className="h-7 w-7 p-0"
                                    title="عرض الـ Snapshot"
                                  >
                                    <Eye className="w-3.5 h-3.5" />
                                  </Button>
                                  {!isVoided && (isAdmin || isOwner) && (
                                    <Button
                                      variant="ghost"
                                      size="sm"
                                      onClick={() => setVoidingClosingId(c.id)}
                                      className="h-7 w-7 p-0 text-muted-foreground hover:text-destructive"
                                      title="إلغاء الإغلاق (Void)"
                                    >
                                      <XCircle className="w-3.5 h-3.5" />
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
              </CardContent>
            </Card>
          </TabsContent>
        </Tabs>
      </div>

      {/* Snapshot Details Modal */}
      <Dialog open={Boolean(viewingSnapshot)} onOpenChange={(open) => !open && setViewingSnapshot(null)}>
        <DialogContent className="max-w-xl text-right" dir="rtl">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Eye className="w-4 h-4 text-primary" />
              <span>Snapshot الإغلاق اليومي المؤرشف ({viewingSnapshot?.date})</span>
            </DialogTitle>
            <DialogDescription className="text-xs">
              هذه نسخة محفوظة ثابتة تم تسجيلها وقت إتمام الإغلاق ولا تتأثر بأي تعديلات لاحقة
            </DialogDescription>
          </DialogHeader>

          {viewingSnapshot && (
            <div className="space-y-4 text-xs">
              <div className="grid grid-cols-2 gap-3 p-3 rounded-xl bg-slate-900 border border-slate-800">
                <div>
                  <span className="text-muted-foreground">تاريخ الإغلاق:</span>
                  <div className="font-mono font-bold text-sm text-slate-100">{viewingSnapshot.date}</div>
                </div>
                <div>
                  <span className="text-muted-foreground">أغلق بواسطة:</span>
                  <div className="font-bold text-sm text-slate-100">{viewingSnapshot.closedBy}</div>
                </div>
                <div>
                  <span className="text-muted-foreground">توقيت التسجيل:</span>
                  <div className="font-mono text-xs text-muted-foreground">
                    {new Date(viewingSnapshot.closedAt).toLocaleString('ar-EG')}
                  </div>
                </div>
                <div>
                  <span className="text-muted-foreground">الحالة:</span>
                  <div>
                    <Badge variant="outline" className="text-[10px]">
                      {viewingSnapshot.status}
                    </Badge>
                  </div>
                </div>
              </div>

              {/* Cash Numbers */}
              <div className="p-3 rounded-xl border border-slate-800 space-y-2">
                <h5 className="font-bold text-slate-100">المطابقة النقدية:</h5>
                <div className="grid grid-cols-3 gap-2 text-center font-mono">
                  <div className="p-2 rounded bg-slate-900/60">
                    <span className="text-[10px] text-muted-foreground block">المتوقع</span>
                    <span className="font-bold text-primary">{viewingSnapshot.expectedCash.toLocaleString('ar-EG')} ج.م</span>
                  </div>
                  <div className="p-2 rounded bg-slate-900/60">
                    <span className="text-[10px] text-muted-foreground block">الفعلي</span>
                    <span className="font-bold text-slate-100">{viewingSnapshot.actualCash.toLocaleString('ar-EG')} ج.م</span>
                  </div>
                  <div className="p-2 rounded bg-slate-900/60">
                    <span className="text-[10px] text-muted-foreground block">الفارق</span>
                    <span className={`font-bold ${viewingSnapshot.difference < 0 ? 'text-rose-400' : 'text-emerald-400'}`}>
                      {viewingSnapshot.difference} ج.م
                    </span>
                  </div>
                </div>
                {viewingSnapshot.differenceReason && (
                  <p className="text-[11px] text-amber-400 pt-1">
                    السبب الموثق: {viewingSnapshot.differenceReason}
                  </p>
                )}
                {viewingSnapshot.notes && (
                  <p className="text-[11px] text-muted-foreground">
                    الملاحظات: {viewingSnapshot.notes}
                  </p>
                )}
              </div>

              {/* Financial Snapshot */}
              <div className="p-3 rounded-xl border border-slate-800 space-y-1.5">
                <h5 className="font-bold text-slate-100">الأرقام المالية المؤرشفة وقتها:</h5>
                <div className="grid grid-cols-2 gap-2 text-[11px]">
                  <div className="flex justify-between border-b border-slate-800/40 py-1">
                    <span className="text-muted-foreground">المبيعات الإجمالية:</span>
                    <span className="font-mono">{viewingSnapshot.salesSnapshot.toLocaleString('ar-EG')} ج.م</span>
                  </div>
                  <div className="flex justify-between border-b border-slate-800/40 py-1">
                    <span className="text-muted-foreground">المبيعات النقدية (كاش):</span>
                    <span className="font-mono text-emerald-400">{viewingSnapshot.cashSalesSnapshot.toLocaleString('ar-EG')} ج.م</span>
                  </div>
                  <div className="flex justify-between border-b border-slate-800/40 py-1">
                    <span className="text-muted-foreground">المصروفات التشغيلية:</span>
                    <span className="font-mono">{viewingSnapshot.operatingExpensesSnapshot.toLocaleString('ar-EG')} ج.م</span>
                  </div>
                  <div className="flex justify-between border-b border-slate-800/40 py-1">
                    <span className="text-muted-foreground">الخارج من الخزنة:</span>
                    <span className="font-mono text-rose-400">{viewingSnapshot.cashOutflowsSnapshot.toLocaleString('ar-EG')} ج.م</span>
                  </div>
                  <div className="flex justify-between py-1">
                    <span className="text-muted-foreground">سلف الموظفين:</span>
                    <span className="font-mono">{viewingSnapshot.advancesSnapshot.toLocaleString('ar-EG')} ج.م</span>
                  </div>
                  <div className="flex justify-between py-1">
                    <span className="text-muted-foreground">تكلفة الهالك:</span>
                    <span className="font-mono">{viewingSnapshot.wasteSnapshot.toLocaleString('ar-EG')} ج.م</span>
                  </div>
                </div>
              </div>
            </div>
          )}

          <DialogFooter>
            <Button variant="outline" onClick={() => setViewingSnapshot(null)}>
              إغلاق
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Void Modal */}
      <Dialog open={Boolean(voidingClosingId)} onOpenChange={(open) => !open && setVoidingClosingId(null)}>
        <DialogContent className="max-w-md text-right" dir="rtl">
          <DialogHeader>
            <DialogTitle className="text-rose-400 flex items-center gap-2">
              <AlertTriangle className="w-5 h-5" />
              <span>إلغاء سجل الإغلاق اليومي (Void)</span>
            </DialogTitle>
            <DialogDescription className="text-xs">
              سيتم وسم الإغلاق كملغي ولن يدخل ضمن الأرصدة المعتمدة مع تسجيل السبب في سجل التدقيق الأمني
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-3 py-2">
            <Label className="text-xs font-medium">سبب الإلغاء (إجباري)</Label>
            <Input
              placeholder="اكتب سبب إلغاء الإغلاق..."
              value={voidReason}
              onChange={(e) => setVoidReason(e.target.value)}
              className="text-xs"
            />
          </div>

          <DialogFooter className="gap-2">
            <Button variant="outline" onClick={() => setVoidingClosingId(null)}>
              تراجع
            </Button>
            <Button
              variant="destructive"
              onClick={handleConfirmVoid}
              disabled={isVoiding || !voidReason.trim()}
            >
              {isVoiding ? 'جاري الإلغاء...' : 'تأكيد الإلغاء'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </MainLayout>
  );
}
