import { useState, useEffect } from 'react';
import { MainLayout } from '@/components/layout';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import {
  Calculator,
  Plus,
  Search,
  FileText,
  BookOpen,
  Scale,
  TrendingUp,
  Layers,
  Calendar,
  ShieldCheck,
  CheckCircle2,
  AlertCircle,
  ArrowUpRight,
  ArrowDownRight,
  DollarSign,
  Building2,
  RefreshCw,
  Sliders,
  Lock,
  Unlock,
  Eye,
} from "lucide-react";
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { useTenantBranch } from '@/hooks/useDatabase';
import { useAuth } from '@/hooks/useAuth';
import { useToast } from '@/hooks/use-toast';

import type {
  ChartAccount,
  JournalEntry,
  TrialBalanceReportData,
  ProfitLossStatementData,
  BalanceSheetData,
  CashFlowStatementData,
  SubledgerReconciliationResult,
  InventoryReconciliationResult,
  CashReconciliationResult,
  FiscalYear,
  FiscalPeriod,
  AccountType,
} from '@/types/retail.types';

import {
  getChartOfAccounts,
  seedDefaultChartOfAccounts,
} from '@/services/accounting/chartOfAccounts.service';
import { getJournalEntries } from '@/services/accounting/journal.service';
import {
  generateTrialBalance,
  generateProfitAndLoss,
  generateBalanceSheet,
  generateCashFlow,
} from '@/services/accounting/financialStatements.service';
import {
  reconcileARSubledger,
  reconcileAPSubledger,
  reconcileInventory,
  reconcileCash,
} from '@/services/accounting/reconciliation.service';
import {
  getFiscalYears,
  getFiscalPeriods,
  initializeFiscalYear,
  closeFiscalPeriod,
  reopenFiscalPeriod,
} from '@/services/accounting/periods.service';

import { NewJournalEntryModal } from '@/components/retail/accounting/NewJournalEntryModal';
import { NewAccountModal } from '@/components/retail/accounting/NewAccountModal';
import { JournalDetailsDrawer } from '@/components/retail/accounting/JournalDetailsDrawer';
import { OpeningBalancesWizard } from '@/components/retail/accounting/OpeningBalancesWizard';
import { ReconciliationCard } from '@/components/retail/accounting/ReconciliationCard';

export default function Accounting() {
  const { tenantId } = useTenantBranch();
  const { user } = useAuth();
  const { toast } = useToast();

  const [activeTab, setActiveTab] = useState('overview');
  const [loading, setLoading] = useState(true);

  // Modals & Drawers
  const [newJournalOpen, setNewJournalOpen] = useState(false);
  const [newAccountOpen, setNewAccountOpen] = useState(false);
  const [openingWizardOpen, setOpeningWizardOpen] = useState(false);
  const [selectedEntry, setSelectedEntry] = useState<JournalEntry | null>(null);
  const [detailsDrawerOpen, setDetailsDrawerOpen] = useState(false);

  // Accounting Data States
  const [accounts, setAccounts] = useState<ChartAccount[]>([]);
  const [journalEntries, setJournalEntries] = useState<JournalEntry[]>([]);
  const [trialBalance, setTrialBalance] = useState<TrialBalanceReportData | null>(null);
  const [profitLoss, setProfitLoss] = useState<ProfitLossStatementData | null>(null);
  const [balanceSheet, setBalanceSheet] = useState<BalanceSheetData | null>(null);
  const [cashFlow, setCashFlow] = useState<CashFlowStatementData | null>(null);

  // Reconciliation Results
  const [reconcileAR, setReconcileAR] = useState<SubledgerReconciliationResult | null>(null);
  const [reconcileAP, setReconcileAP] = useState<SubledgerReconciliationResult | null>(null);
  const [reconcileInv, setReconcileInv] = useState<InventoryReconciliationResult | null>(null);
  const [reconcileCashRes, setReconcileCashRes] = useState<CashReconciliationResult | null>(null);

  // Periods
  const [fiscalYears, setFiscalYears] = useState<FiscalYear[]>([]);
  const [fiscalPeriods, setFiscalPeriods] = useState<FiscalPeriod[]>([]);
  const [selectedYear, setSelectedYear] = useState<number>(new Date().getFullYear());

  // Filters
  const [chartTypeFilter, setChartTypeFilter] = useState<string>('all');
  const [chartSearch, setChartSearch] = useState('');
  const [journalSearch, setJournalSearch] = useState('');
  const [dateRange, setDateRange] = useState({
    start: new Date(new Date().getFullYear(), 0, 1).toISOString().split('T')[0],
    end: new Date().toISOString().split('T')[0],
  });

  const loadAllAccountingData = async () => {
    if (!tenantId) return;
    setLoading(true);
    try {
      // 1. Chart of Accounts
      const chart = await getChartOfAccounts(tenantId);
      setAccounts(chart);

      // Auto-seed if completely empty
      if (chart.length === 0) {
        await seedDefaultChartOfAccounts(tenantId, user?.uid || 'system');
        const reChart = await getChartOfAccounts(tenantId);
        setAccounts(reChart);
      }

      // 2. Journal Entries
      const { entries } = await getJournalEntries(tenantId, { pageSize: 50 });
      setJournalEntries(entries);

      // 3. Statements
      const [tb, pl, bs, cf] = await Promise.all([
        generateTrialBalance(tenantId, dateRange.start, dateRange.end).catch(() => null),
        generateProfitAndLoss(tenantId, dateRange.start, dateRange.end).catch(() => null),
        generateBalanceSheet(tenantId, dateRange.end).catch(() => null),
        generateCashFlow(tenantId, dateRange.start, dateRange.end).catch(() => null),
      ]);
      setTrialBalance(tb);
      setProfitLoss(pl);
      setBalanceSheet(bs);
      setCashFlow(cf);

      // 4. Reconciliations (Audit 2)
      const [arR, apR, invR, cashR] = await Promise.all([
        reconcileARSubledger(tenantId).catch(() => null),
        reconcileAPSubledger(tenantId).catch(() => null),
        reconcileInventory(tenantId).catch(() => null),
        reconcileCash(tenantId).catch(() => null),
      ]);
      setReconcileAR(arR);
      setReconcileAP(apR);
      setReconcileInv(invR);
      setReconcileCashRes(cashR);

      // 5. Periods
      const years = await getFiscalYears(tenantId);
      setFiscalYears(years);
      if (years.length > 0) {
        const activeY = years.find((y) => y.year === selectedYear) || years[0];
        const periods = await getFiscalPeriods(tenantId, activeY.id);
        setFiscalPeriods(periods);
      }
    } catch (err) {
      console.error('Error loading accounting data:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadAllAccountingData();
  }, [tenantId, dateRange.start, dateRange.end, selectedYear]);

  // Handle Init Fiscal Year
  const handleInitYear = async () => {
    if (!tenantId) return;
    try {
      await initializeFiscalYear(tenantId, selectedYear, user?.uid || 'system');
      toast({ title: 'تم إنشاء السنة المالية', description: `تم تهيئة 12 فترة مالية لسنة ${selectedYear}` });
      loadAllAccountingData();
    } catch (e: any) {
      toast({ title: 'خطأ', description: e.message || 'فشل تهيئة السنة المالية', variant: 'destructive' });
    }
  };

  // Handle Close / Reopen Period
  const handleTogglePeriod = async (period: FiscalPeriod) => {
    if (!tenantId) return;
    try {
      if (period.status === 'closed') {
        await reopenFiscalPeriod(tenantId, period.id, user?.uid || 'system', 'إعادة فتح إدارية');
        toast({ title: 'تمت إعادة فتح الفترة', description: `الفترة ${period.periodNumber} مفتوحة الآن للترحيل` });
      } else {
        await closeFiscalPeriod(tenantId, period.id, user?.uid || 'system');
        toast({ title: 'تم إغلاق الفترة المالية', description: `الفترة ${period.periodNumber} مغلقة محاسبياً الآن` });
      }
      loadAllAccountingData();
    } catch (e: any) {
      toast({ title: 'خطأ في إقفال الفترة', description: e.message || 'فشل تغيير حالة الفترة', variant: 'destructive' });
    }
  };

  // Filtered Chart of Accounts
  const filteredAccounts = accounts.filter((acc) => {
    const matchType = chartTypeFilter === 'all' || acc.accountType === chartTypeFilter;
    const matchSearch =
      !chartSearch ||
      acc.accountCode.toLowerCase().includes(chartSearch.toLowerCase()) ||
      acc.name.toLowerCase().includes(chartSearch.toLowerCase());
    return matchType && matchSearch;
  });

  // Filtered Journal Entries
  const filteredJournal = journalEntries.filter((je) => {
    if (!journalSearch) return true;
    const q = journalSearch.toLowerCase();
    return (
      je.journalNumber.toLowerCase().includes(q) ||
      je.description.toLowerCase().includes(q) ||
      je.sourceType.toLowerCase().includes(q)
    );
  });

  return (
    <MainLayout>
      <div className="p-4 sm:p-6 space-y-6 max-w-7xl mx-auto" dir="rtl">
        {/* Header Bar */}
        <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 border-b pb-4">
          <div>
            <h1 className="text-2xl sm:text-3xl font-bold tracking-tight flex items-center gap-2.5">
              <Calculator className="w-7 h-7 text-primary" />
              <span>المحاسبة المتقدمة والأستاذ العام (General Ledger)</span>
            </h1>
            <p className="text-sm text-muted-foreground mt-1">
              شجرة الحسابات، قيود اليومية الآلية، القوائم المالية الرسمية، والمطابقات الرياضية مع الدفاتر الفرعية
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <Button
              variant="outline"
              size="sm"
              onClick={() => setOpeningWizardOpen(true)}
              className="gap-1.5 text-xs"
            >
              <Scale className="w-4 h-4" />
              <span>معالج الأرصدة الافتتاحية</span>
            </Button>

            <Button
              variant="outline"
              size="sm"
              onClick={() => setNewAccountOpen(true)}
              className="gap-1.5 text-xs"
            >
              <Plus className="w-4 h-4" />
              <span>إضافة حساب مالي</span>
            </Button>

            <Button
              size="sm"
              onClick={() => setNewJournalOpen(true)}
              className="gap-1.5 text-xs shadow-sm"
            >
              <Plus className="w-4 h-4" />
              <span>قيد يومية جديد</span>
            </Button>
          </div>
        </div>

        {/* Global Date Range Toolbar */}
        <div className="bg-muted/40 p-3 rounded-lg flex flex-wrap items-center justify-between gap-3 text-xs">
          <div className="flex items-center gap-3">
            <span className="font-semibold text-foreground flex items-center gap-1">
              <Calendar className="w-4 h-4 text-primary" />
              نطاق تقارير القوائم المالية:
            </span>
            <div className="flex items-center gap-2">
              <Input
                type="date"
                value={dateRange.start}
                onChange={(e) => setDateRange((prev) => ({ ...prev, start: e.target.value }))}
                className="h-8 text-xs w-36 bg-background"
              />
              <span>إلى</span>
              <Input
                type="date"
                value={dateRange.end}
                onChange={(e) => setDateRange((prev) => ({ ...prev, end: e.target.value }))}
                className="h-8 text-xs w-36 bg-background"
              />
            </div>
          </div>

          <Button
            variant="ghost"
            size="sm"
            onClick={loadAllAccountingData}
            disabled={loading}
            className="h-8 gap-1.5 text-xs"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin' : ''}`} />
            <span>تحديث البيانات</span>
          </Button>
        </div>

        {/* Main Tabs Navigation */}
        <Tabs value={activeTab} onValueChange={setActiveTab} className="space-y-4">
          <TabsList className="bg-muted/60 p-1 flex flex-wrap h-auto gap-1">
            <TabsTrigger value="overview" className="text-xs gap-1.5">
              <TrendingUp className="w-3.5 h-3.5" />
              <span>المؤشرات المالية</span>
            </TabsTrigger>
            <TabsTrigger value="chart" className="text-xs gap-1.5">
              <Layers className="w-3.5 h-3.5" />
              <span>شجرة الحسابات</span>
            </TabsTrigger>
            <TabsTrigger value="journal" className="text-xs gap-1.5">
              <FileText className="w-3.5 h-3.5" />
              <span>دفتر اليومية</span>
            </TabsTrigger>
            <TabsTrigger value="trial_balance" className="text-xs gap-1.5">
              <Scale className="w-3.5 h-3.5" />
              <span>ميزان المراجعة</span>
            </TabsTrigger>
            <TabsTrigger value="profit_loss" className="text-xs gap-1.5">
              <ArrowUpRight className="w-3.5 h-3.5" />
              <span>قائمة الدخل</span>
            </TabsTrigger>
            <TabsTrigger value="balance_sheet" className="text-xs gap-1.5">
              <Building2 className="w-3.5 h-3.5" />
              <span>الميزانية العمومية</span>
            </TabsTrigger>
            <TabsTrigger value="cash_flow" className="text-xs gap-1.5">
              <DollarSign className="w-3.5 h-3.5" />
              <span>التدفقات النقدية</span>
            </TabsTrigger>
            <TabsTrigger value="reconciliations" className="text-xs gap-1.5">
              <ShieldCheck className="w-3.5 h-3.5" />
              <span>المطابقات (Audit 2)</span>
            </TabsTrigger>
            <TabsTrigger value="periods" className="text-xs gap-1.5">
              <Calendar className="w-3.5 h-3.5" />
              <span>الفترات المالية</span>
            </TabsTrigger>
          </TabsList>

          {/* TAB 1: EXECUTIVE OVERVIEW */}
          <TabsContent value="overview" className="space-y-5">
            {/* KPI Cards */}
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
              <Card className="border shadow-sm">
                <CardHeader className="p-4 pb-1">
                  <CardDescription className="text-xs">إجمالي الأصول (Total Assets)</CardDescription>
                  <CardTitle className="text-2xl font-bold font-mono text-primary">
                    {(balanceSheet?.totalAssets || 0).toFixed(2)} EGP
                  </CardTitle>
                </CardHeader>
                <CardContent className="p-4 pt-1 text-xs text-muted-foreground">
                  النقدية + البنوك + المخزون + مديونيات العملاء
                </CardContent>
              </Card>

              <Card className="border shadow-sm">
                <CardHeader className="p-4 pb-1">
                  <CardDescription className="text-xs">صافي الإيرادات (Net Revenue)</CardDescription>
                  <CardTitle className="text-2xl font-bold font-mono text-emerald-600 dark:text-emerald-400">
                    {(profitLoss?.netRevenue || 0).toFixed(2)} EGP
                  </CardTitle>
                </CardHeader>
                <CardContent className="p-4 pt-1 text-xs text-muted-foreground">
                  المبيعات بعد استبعاد المرتجعات والخصومات
                </CardContent>
              </Card>

              <Card className="border shadow-sm">
                <CardHeader className="p-4 pb-1">
                  <CardDescription className="text-xs">مجمل الربح (Gross Profit)</CardDescription>
                  <CardTitle className="text-2xl font-bold font-mono text-blue-600 dark:text-blue-400">
                    {(profitLoss?.grossProfit || 0).toFixed(2)} EGP
                  </CardTitle>
                </CardHeader>
                <CardContent className="p-4 pt-1 text-xs text-muted-foreground">
                  هامش الربح: <span className="font-semibold text-foreground">{(profitLoss?.grossMarginPercentage || 0).toFixed(1)}%</span>
                </CardContent>
              </Card>

              <Card className="border shadow-sm">
                <CardHeader className="p-4 pb-1">
                  <CardDescription className="text-xs">صافي الدخل / الأرباح (Net Income)</CardDescription>
                  <CardTitle
                    className={`text-2xl font-bold font-mono ${
                      (profitLoss?.netIncome || 0) >= 0
                        ? 'text-emerald-600 dark:text-emerald-400'
                        : 'text-rose-600 dark:text-rose-400'
                    }`}
                  >
                    {(profitLoss?.netIncome || 0).toFixed(2)} EGP
                  </CardTitle>
                </CardHeader>
                <CardContent className="p-4 pt-1 text-xs text-muted-foreground">
                  بعد خصم تكلفة البضاعة والمصروفات التشغيلية
                </CardContent>
              </Card>
            </div>

            {/* Subledger Match Summary Banner */}
            <div className="p-4 rounded-xl border bg-card flex flex-col md:flex-row items-center justify-between gap-4">
              <div className="flex items-center gap-3">
                <div className="p-2.5 rounded-lg bg-emerald-500/10 text-emerald-600 dark:text-emerald-400">
                  <ShieldCheck className="w-6 h-6" />
                </div>
                <div>
                  <div className="font-bold text-sm">حالة المطابقة الرياضية مع الدفاتر الفرعية (Audit 2 Status)</div>
                  <div className="text-xs text-muted-foreground mt-0.5">
                    العملاء: {reconcileAR?.isMatched ? '✓ متطابق' : '⚠ فارق'} | 
                    الموردين: {reconcileAP?.isMatched ? ' ✓ متطابق' : ' ⚠ فارق'} | 
                    المخزون: {reconcileInv?.isMatched ? ' ✓ متطابق' : ' ⚠ فارق'} | 
                    النقدية: {reconcileCashRes?.isMatched ? ' ✓ متطابق' : ' ⚠ فارق'}
                  </div>
                </div>
              </div>

              <Button
                variant="outline"
                size="sm"
                onClick={() => setActiveTab('reconciliations')}
                className="text-xs shrink-0"
              >
                عرض تفاصيل المطابقات
              </Button>
            </div>

            {/* Recent Journals Stream */}
            <Card className="border shadow-sm">
              <CardHeader className="p-4 pb-2 flex flex-row items-center justify-between">
                <div>
                  <CardTitle className="text-base font-bold">آخر القيود المحاسبية المرحلة</CardTitle>
                  <CardDescription className="text-xs">سجل الحركة التلقائية واليدوية في الأستاذ العام</CardDescription>
                </div>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => setActiveTab('journal')}
                  className="text-xs text-primary"
                >
                  عرض سجل اليومية الكامل
                </Button>
              </CardHeader>
              <CardContent className="p-4 pt-0">
                <div className="border rounded-lg overflow-hidden">
                  <Table>
                    <TableHeader className="bg-muted/40 text-xs">
                      <TableRow>
                        <TableHead>رقم القيد</TableHead>
                        <TableHead>التاريخ</TableHead>
                        <TableHead>المصدر</TableHead>
                        <TableHead>البيان</TableHead>
                        <TableHead className="text-center">إجمالي القيد</TableHead>
                        <TableHead className="text-center">الحالة</TableHead>
                        <TableHead className="text-center">معاينة</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody className="text-xs">
                      {journalEntries.slice(0, 6).map((je) => (
                        <TableRow key={je.id} className="hover:bg-muted/20">
                          <TableCell className="font-mono font-bold text-primary">{je.journalNumber}</TableCell>
                          <TableCell className="font-mono">{je.postingDate}</TableCell>
                          <TableCell>
                            <Badge variant="outline" className="text-[10px] font-mono">
                              {je.sourceType}
                            </Badge>
                          </TableCell>
                          <TableCell className="max-w-[240px] truncate">{je.description}</TableCell>
                          <TableCell className="text-center font-mono font-semibold">
                            {je.totalDebit.toFixed(2)}
                          </TableCell>
                          <TableCell className="text-center">
                            <Badge
                              variant={je.status === 'reversed' ? 'destructive' : 'default'}
                              className="text-[10px]"
                            >
                              {je.status === 'reversed' ? 'معكوس' : 'مُرحل'}
                            </Badge>
                          </TableCell>
                          <TableCell className="text-center">
                            <Button
                              variant="ghost"
                              size="icon"
                              className="h-7 w-7 text-muted-foreground hover:text-primary"
                              onClick={() => {
                                setSelectedEntry(je);
                                setDetailsDrawerOpen(true);
                              }}
                            >
                              <Eye className="w-3.5 h-3.5" />
                            </Button>
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>
              </CardContent>
            </Card>
          </TabsContent>

          {/* TAB 2: CHART OF ACCOUNTS */}
          <TabsContent value="chart" className="space-y-4">
            <div className="flex flex-col sm:flex-row items-center justify-between gap-3">
              <div className="flex items-center gap-2 w-full sm:w-auto">
                <div className="relative flex-1 sm:w-64">
                  <Search className="absolute right-2.5 top-2.5 h-3.5 w-3.5 text-muted-foreground" />
                  <Input
                    placeholder="بحث بالرمز أو اسم الحساب..."
                    value={chartSearch}
                    onChange={(e) => setChartSearch(e.target.value)}
                    className="h-9 pr-8 text-xs"
                  />
                </div>

                <Select value={chartTypeFilter} onValueChange={setChartTypeFilter}>
                  <SelectTrigger className="h-9 w-40 text-xs">
                    <SelectValue placeholder="النوع..." />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">كافة أنواع الحسابات</SelectItem>
                    <SelectItem value="asset">أصول (Assets)</SelectItem>
                    <SelectItem value="liability">التزامات (Liabilities)</SelectItem>
                    <SelectItem value="equity">حقوق ملكية (Equity)</SelectItem>
                    <SelectItem value="revenue">إيرادات (Revenue)</SelectItem>
                    <SelectItem value="cogs">تكلفة مبيعات (COGS)</SelectItem>
                    <SelectItem value="expense">مصروفات (Expenses)</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              <div className="flex items-center gap-2 w-full sm:w-auto justify-end">
                <Button
                  size="sm"
                  onClick={() => setNewAccountOpen(true)}
                  className="h-9 gap-1 text-xs"
                >
                  <Plus className="w-3.5 h-3.5" />
                  <span>إضافة حساب مالي</span>
                </Button>
              </div>
            </div>

            {/* Accounts Table */}
            <div className="border rounded-lg overflow-hidden bg-card">
              <Table>
                <TableHeader className="bg-muted/40 text-xs">
                  <TableRow>
                    <TableHead className="w-28">رمز الحساب</TableHead>
                    <TableHead>اسم الحساب</TableHead>
                    <TableHead>النوع</TableHead>
                    <TableHead className="text-center">طبيعة الحساب</TableHead>
                    <TableHead className="text-center">المستوى</TableHead>
                    <TableHead className="text-center">يقبل الترحيل</TableHead>
                    <TableHead className="text-left font-mono">الرصيد الدفتري الحالي</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody className="text-xs">
                  {filteredAccounts.map((acc) => (
                    <TableRow key={acc.id} className="hover:bg-muted/20">
                      <TableCell className="font-mono font-bold text-primary">
                        {acc.accountCode}
                      </TableCell>
                      <TableCell>
                        <div className="flex items-center gap-1.5" style={{ paddingRight: `${(acc.level - 1) * 16}px` }}>
                          <span className={acc.level === 1 ? 'font-bold text-foreground text-sm' : 'font-medium'}>
                            {acc.name}
                          </span>
                          {acc.systemAccount && (
                            <Badge variant="outline" className="text-[9px] h-4 bg-muted/30">
                              نظامي
                            </Badge>
                          )}
                        </div>
                      </TableCell>
                      <TableCell>
                        <Badge variant="secondary" className="text-[10px]">
                          {acc.accountType}
                        </Badge>
                      </TableCell>
                      <TableCell className="text-center">
                        <span className="text-[11px] text-muted-foreground">
                          {acc.normalBalance === 'debit' ? 'مدين' : 'دائن'}
                        </span>
                      </TableCell>
                      <TableCell className="text-center font-mono">{acc.level}</TableCell>
                      <TableCell className="text-center">
                        {acc.allowPosting ? (
                          <Badge variant="outline" className="text-[10px] text-emerald-600 dark:text-emerald-400 border-emerald-500/30">
                            فرعي (يقبل)
                          </Badge>
                        ) : (
                          <span className="text-muted-foreground text-[10px]">رئيسي</span>
                        )}
                      </TableCell>
                      <TableCell className="text-left font-mono font-semibold">
                        {acc.allowPosting ? (
                          <span>{(acc.currentBalance || 0).toFixed(2)} EGP</span>
                        ) : (
                          <span className="text-muted-foreground/40">-</span>
                        )}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          </TabsContent>

          {/* TAB 3: JOURNAL REGISTER */}
          <TabsContent value="journal" className="space-y-4">
            <div className="flex flex-col sm:flex-row items-center justify-between gap-3">
              <div className="relative flex-1 sm:w-80">
                <Search className="absolute right-2.5 top-2.5 h-3.5 w-3.5 text-muted-foreground" />
                <Input
                  placeholder="بحث برقم القيد أو البيان أو المصدر..."
                  value={journalSearch}
                  onChange={(e) => setJournalSearch(e.target.value)}
                  className="h-9 pr-8 text-xs"
                />
              </div>

              <Button
                size="sm"
                onClick={() => setNewJournalOpen(true)}
                className="h-9 gap-1.5 text-xs"
              >
                <Plus className="w-3.5 h-3.5" />
                <span>إنشاء قيد يدوي</span>
              </Button>
            </div>

            <div className="border rounded-lg overflow-hidden bg-card">
              <Table>
                <TableHeader className="bg-muted/40 text-xs">
                  <TableRow>
                    <TableHead>رقم القيد</TableHead>
                    <TableHead>تاريخ الترحيل</TableHead>
                    <TableHead>المصدر</TableHead>
                    <TableHead className="min-w-[280px]">البيان العام</TableHead>
                    <TableHead className="text-center font-mono">مدين</TableHead>
                    <TableHead className="text-center font-mono">دائن</TableHead>
                    <TableHead className="text-center">الحالة</TableHead>
                    <TableHead className="text-center">إجراءات</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody className="text-xs">
                  {filteredJournal.map((je) => (
                    <TableRow key={je.id} className="hover:bg-muted/20">
                      <TableCell className="font-mono font-bold text-primary">{je.journalNumber}</TableCell>
                      <TableCell className="font-mono">{je.postingDate}</TableCell>
                      <TableCell>
                        <Badge variant="outline" className="text-[10px] font-mono">
                          {je.sourceType}
                        </Badge>
                      </TableCell>
                      <TableCell>{je.description}</TableCell>
                      <TableCell className="text-center font-mono font-semibold text-emerald-600 dark:text-emerald-400">
                        {je.totalDebit.toFixed(2)}
                      </TableCell>
                      <TableCell className="text-center font-mono font-semibold text-blue-600 dark:text-blue-400">
                        {je.totalCredit.toFixed(2)}
                      </TableCell>
                      <TableCell className="text-center">
                        <Badge
                          variant={je.status === 'reversed' ? 'destructive' : 'default'}
                          className="text-[10px]"
                        >
                          {je.status === 'reversed' ? 'تم عكسه' : 'مُرحل في الأستاذ'}
                        </Badge>
                      </TableCell>
                      <TableCell className="text-center">
                        <Button
                          variant="ghost"
                          size="sm"
                          className="h-7 text-xs gap-1 text-muted-foreground hover:text-primary"
                          onClick={() => {
                            setSelectedEntry(je);
                            setDetailsDrawerOpen(true);
                          }}
                        >
                          <Eye className="w-3.5 h-3.5" />
                          <span>تفاصيل</span>
                        </Button>
                      </TableCell>
                    </TableRow>
                  ))}
                  {filteredJournal.length === 0 && (
                    <TableRow>
                      <TableCell colSpan={8} className="text-center py-8 text-muted-foreground">
                        لا توجد قيود مسجلة مطابقة للبحث
                      </TableCell>
                    </TableRow>
                  )}
                </TableBody>
              </Table>
            </div>
          </TabsContent>

          {/* TAB 4: TRIAL BALANCE */}
          <TabsContent value="trial_balance" className="space-y-4">
            {trialBalance && (
              <div
                className={`p-3 rounded-lg border flex items-center justify-between text-xs ${
                  trialBalance.isBalanced
                    ? 'bg-emerald-500/10 border-emerald-500/20 text-emerald-700 dark:text-emerald-400'
                    : 'bg-rose-500/10 border-rose-500/20 text-rose-700 dark:text-rose-400'
                }`}
              >
                <div className="flex items-center gap-2">
                  <CheckCircle2 className="w-4 h-4" />
                  <span className="font-semibold">
                    {trialBalance.isBalanced
                      ? 'ميزان المراجعة متوازن بنسبة 100%: إجمالي الأرصدة المدينة = إجمالي الأرصدة الدائنة'
                      : 'تنبيه: ميزان المراجعة غير متوازن، يرجى فحص القيود المعلقة'}
                  </span>
                </div>
                <div className="font-mono">
                  إجمالي المدين: {trialBalance.totalClosingDebit.toFixed(2)} | إجمالي الدائن: {trialBalance.totalClosingCredit.toFixed(2)}
                </div>
              </div>
            )}

            <div className="border rounded-lg overflow-hidden bg-card">
              <Table>
                <TableHeader className="bg-muted/40 text-xs">
                  <TableRow>
                    <TableHead rowSpan={2} className="border-l">رمز الحساب</TableHead>
                    <TableHead rowSpan={2} className="border-l">اسم الحساب المالي</TableHead>
                    <TableHead colSpan={2} className="text-center border-l bg-muted/20">رصيد أول المدة</TableHead>
                    <TableHead colSpan={2} className="text-center border-l bg-muted/30">حركات الفترة</TableHead>
                    <TableHead colSpan={2} className="text-center bg-muted/40">رصيد آخر المدة</TableHead>
                  </TableRow>
                  <TableRow>
                    <TableHead className="text-center border-l text-[11px]">مدين</TableHead>
                    <TableHead className="text-center border-l text-[11px]">دائن</TableHead>
                    <TableHead className="text-center border-l text-[11px]">مدين</TableHead>
                    <TableHead className="text-center border-l text-[11px]">دائن</TableHead>
                    <TableHead className="text-center border-l text-[11px]">مدين</TableHead>
                    <TableHead className="text-center text-[11px]">دائن</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody className="text-xs">
                  {trialBalance?.rows.map((row) => (
                    <TableRow key={row.accountId} className="hover:bg-muted/20">
                      <TableCell className="font-mono font-bold text-primary border-l">
                        {row.accountCode}
                      </TableCell>
                      <TableCell className="border-l font-medium">
                        {row.accountName}
                      </TableCell>
                      <TableCell className="text-center font-mono border-l">
                        {row.openingDebit > 0 ? row.openingDebit.toFixed(2) : '-'}
                      </TableCell>
                      <TableCell className="text-center font-mono border-l">
                        {row.openingCredit > 0 ? row.openingCredit.toFixed(2) : '-'}
                      </TableCell>
                      <TableCell className="text-center font-mono border-l">
                        {row.periodDebit > 0 ? row.periodDebit.toFixed(2) : '-'}
                      </TableCell>
                      <TableCell className="text-center font-mono border-l">
                        {row.periodCredit > 0 ? row.periodCredit.toFixed(2) : '-'}
                      </TableCell>
                      <TableCell className="text-center font-mono border-l font-semibold text-emerald-600 dark:text-emerald-400">
                        {row.closingDebit > 0 ? row.closingDebit.toFixed(2) : '-'}
                      </TableCell>
                      <TableCell className="text-center font-mono font-semibold text-blue-600 dark:text-blue-400">
                        {row.closingCredit > 0 ? row.closingCredit.toFixed(2) : '-'}
                      </TableCell>
                    </TableRow>
                  ))}
                  {trialBalance && (
                    <TableRow className="bg-muted/50 font-bold text-xs border-t-2">
                      <TableCell colSpan={2} className="border-l">الإجمالي المتوازن العام:</TableCell>
                      <TableCell className="text-center font-mono border-l">{trialBalance.totalOpeningDebit.toFixed(2)}</TableCell>
                      <TableCell className="text-center font-mono border-l">{trialBalance.totalOpeningCredit.toFixed(2)}</TableCell>
                      <TableCell className="text-center font-mono border-l">{trialBalance.totalPeriodDebit.toFixed(2)}</TableCell>
                      <TableCell className="text-center font-mono border-l">{trialBalance.totalPeriodCredit.toFixed(2)}</TableCell>
                      <TableCell className="text-center font-mono border-l text-emerald-600 dark:text-emerald-400">
                        {trialBalance.totalClosingDebit.toFixed(2)}
                      </TableCell>
                      <TableCell className="text-center font-mono text-blue-600 dark:text-blue-400">
                        {trialBalance.totalClosingCredit.toFixed(2)}
                      </TableCell>
                    </TableRow>
                  )}
                </TableBody>
              </Table>
            </div>
          </TabsContent>

          {/* TAB 5: PROFIT & LOSS STATEMENT */}
          <TabsContent value="profit_loss" className="space-y-4">
            <Card className="border shadow-sm max-w-3xl mx-auto">
              <CardHeader className="text-center border-b pb-4">
                <CardTitle className="text-xl font-bold">قائمة الدخل والأرباح والخسائر (Income Statement)</CardTitle>
                <CardDescription className="text-xs font-mono">
                  للفترة من {dateRange.start} إلى {dateRange.end}
                </CardDescription>
              </CardHeader>
              <CardContent className="p-6 space-y-4 text-sm divide-y">
                {/* Revenue Section */}
                <div className="space-y-2 pt-2">
                  <div className="font-bold text-primary flex justify-between">
                    <span>1. الإيرادات التشغيلية (Operating Revenue)</span>
                    <span className="font-mono">{(profitLoss?.totalGrossRevenue || 0).toFixed(2)} EGP</span>
                  </div>
                  <div className="pr-4 space-y-1 text-xs text-muted-foreground">
                    <div className="flex justify-between">
                      <span>مبيعات التجزئة ونقاط البيع (4110)</span>
                      <span className="font-mono">{(profitLoss?.grossSalesRetail || 0).toFixed(2)}</span>
                    </div>
                    <div className="flex justify-between">
                      <span>مبيعات الجملة والشركات والمدارس (4120)</span>
                      <span className="font-mono">{(profitLoss?.grossSalesWholesale || 0).toFixed(2)}</span>
                    </div>
                    <div className="flex justify-between text-rose-500">
                      <span>(يُخصم) مردودات المبيعات والخصومات الممنوحة (4200)</span>
                      <span className="font-mono">-{(profitLoss?.salesReturnsAndDiscounts || 0).toFixed(2)}</span>
                    </div>
                  </div>
                  <div className="flex justify-between font-semibold pt-1 border-t text-foreground">
                    <span>صافي الإيرادات والمبيعات:</span>
                    <span className="font-mono text-emerald-600 dark:text-emerald-400">
                      {(profitLoss?.netRevenue || 0).toFixed(2)} EGP
                    </span>
                  </div>
                </div>

                {/* Cost of Goods Sold */}
                <div className="space-y-2 pt-3">
                  <div className="font-bold text-primary flex justify-between">
                    <span>2. تكلفة البضاعة المباعة (Cost of Goods Sold - 5100)</span>
                    <span className="font-mono text-rose-600 dark:text-rose-400">
                      -{(profitLoss?.costOfGoodsSold || 0).toFixed(2)} EGP
                    </span>
                  </div>
                  <div className="flex justify-between font-bold text-base p-2.5 bg-muted/40 rounded-lg">
                    <span>مجمل الربح التجاري (Gross Profit):</span>
                    <span className="font-mono text-blue-600 dark:text-blue-400">
                      {(profitLoss?.grossProfit || 0).toFixed(2)} EGP
                    </span>
                  </div>
                  <div className="text-xs text-muted-foreground text-left">
                    هامش مجمل الربح: <span className="font-bold">{(profitLoss?.grossMarginPercentage || 0).toFixed(1)}%</span>
                  </div>
                </div>

                {/* Operating Expenses */}
                <div className="space-y-2 pt-3">
                  <div className="font-bold text-primary flex justify-between">
                    <span>3. المصروفات التشغيلية والإدارية (Operating Expenses)</span>
                    <span className="font-mono text-rose-600 dark:text-rose-400">
                      -{(profitLoss?.totalOperatingExpenses || 0).toFixed(2)} EGP
                    </span>
                  </div>
                  <div className="pr-4 space-y-1 text-xs text-muted-foreground">
                    {profitLoss?.operatingExpensesByCategory &&
                      Object.entries(profitLoss.operatingExpensesByCategory).map(([cat, amount]) => (
                        <div key={cat} className="flex justify-between">
                          <span>{cat}</span>
                          <span className="font-mono">{amount.toFixed(2)}</span>
                        </div>
                      ))}
                  </div>
                </div>

                {/* Final Net Income */}
                <div className="pt-4">
                  <div className="p-4 rounded-xl border bg-primary/5 flex items-center justify-between">
                    <div>
                      <div className="text-xs font-semibold text-muted-foreground">صافي الربح / الدخل النهائي (Net Income)</div>
                      <div className="text-xs text-muted-foreground mt-0.5">بعد كافة التكاليف والمصروفات والتسويات</div>
                    </div>
                    <div
                      className={`text-2xl font-bold font-mono ${
                        (profitLoss?.netIncome || 0) >= 0
                          ? 'text-emerald-600 dark:text-emerald-400'
                          : 'text-rose-600 dark:text-rose-400'
                      }`}
                    >
                      {(profitLoss?.netIncome || 0).toFixed(2)} EGP
                    </div>
                  </div>
                </div>
              </CardContent>
            </Card>
          </TabsContent>

          {/* TAB 6: BALANCE SHEET */}
          <TabsContent value="balance_sheet" className="space-y-4">
            {balanceSheet && (
              <div
                className={`p-3 rounded-lg border flex items-center justify-between text-xs ${
                  balanceSheet.isBalanced
                    ? 'bg-emerald-500/10 border-emerald-500/20 text-emerald-700 dark:text-emerald-400'
                    : 'bg-rose-500/10 border-rose-500/20 text-rose-700 dark:text-rose-400'
                }`}
              >
                <div className="flex items-center gap-2">
                  <CheckCircle2 className="w-4 h-4" />
                  <span className="font-semibold">
                    معادلة الميزانية متطابقة 100%: الأصول ({balanceSheet.totalAssets.toFixed(2)}) = الخصوم وحقوق الملكية ({balanceSheet.totalLiabilitiesAndEquity.toFixed(2)})
                  </span>
                </div>
                <div className="font-mono">الفارق: {balanceSheet.variance.toFixed(2)}</div>
              </div>
            )}

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {/* Assets Column */}
              <Card className="border shadow-sm">
                <CardHeader className="p-4 border-b bg-muted/20">
                  <CardTitle className="text-base font-bold flex justify-between">
                    <span>الأصول (Assets)</span>
                    <span className="font-mono text-emerald-600 dark:text-emerald-400">
                      {(balanceSheet?.totalAssets || 0).toFixed(2)} EGP
                    </span>
                  </CardTitle>
                </CardHeader>
                <CardContent className="p-4 space-y-3 text-xs">
                  <div className="font-semibold text-primary">الأصول المتداولة (Current Assets)</div>
                  <div className="pr-3 space-y-1.5 text-muted-foreground">
                    <div className="flex justify-between">
                      <span>النقدية بالخزائن والأدراج (1111/1112)</span>
                      <span className="font-mono font-semibold text-foreground">
                        {(balanceSheet?.currentAssets.cashAndEquivalents || 0).toFixed(2)}
                      </span>
                    </div>
                    <div className="flex justify-between">
                      <span>الحسابات البنكية ومقاصة البطاقات (1120)</span>
                      <span className="font-mono font-semibold text-foreground">
                        {(balanceSheet?.currentAssets.bankAccounts || 0).toFixed(2)}
                      </span>
                    </div>
                    <div className="flex justify-between">
                      <span>مديونيات العملاء وحسابات القبض (1130)</span>
                      <span className="font-mono font-semibold text-foreground">
                        {(balanceSheet?.currentAssets.accountsReceivable || 0).toFixed(2)}
                      </span>
                    </div>
                    <div className="flex justify-between">
                      <span>مخزون الكتب والأدوات المكتبية (1140)</span>
                      <span className="font-mono font-semibold text-foreground">
                        {(balanceSheet?.currentAssets.inventoryValuation || 0).toFixed(2)}
                      </span>
                    </div>
                  </div>

                  <div className="pt-2 border-t font-semibold text-primary">الأصول غير المتداولة (Non-Current Assets)</div>
                  <div className="pr-3 space-y-1.5 text-muted-foreground">
                    <div className="flex justify-between">
                      <span>الأصول الثابتة والمعدات (1200)</span>
                      <span className="font-mono font-semibold text-foreground">
                        {(balanceSheet?.nonCurrentAssets.fixedAssets || 0).toFixed(2)}
                      </span>
                    </div>
                  </div>
                </CardContent>
              </Card>

              {/* Liabilities & Equity Column */}
              <Card className="border shadow-sm">
                <CardHeader className="p-4 border-b bg-muted/20">
                  <CardTitle className="text-base font-bold flex justify-between">
                    <span>الخصوم وحقوق الملكية (Liabilities & Equity)</span>
                    <span className="font-mono text-blue-600 dark:text-blue-400">
                      {(balanceSheet?.totalLiabilitiesAndEquity || 0).toFixed(2)} EGP
                    </span>
                  </CardTitle>
                </CardHeader>
                <CardContent className="p-4 space-y-3 text-xs">
                  <div className="font-semibold text-primary">الالتزامات المتداولة (Current Liabilities)</div>
                  <div className="pr-3 space-y-1.5 text-muted-foreground">
                    <div className="flex justify-between">
                      <span>حسابات الموردين والدفع (2110)</span>
                      <span className="font-mono font-semibold text-foreground">
                        {(balanceSheet?.currentLiabilities.accountsPayable || 0).toFixed(2)}
                      </span>
                    </div>
                    <div className="flex justify-between">
                      <span>دفعات العملاء المقدمة (2120)</span>
                      <span className="font-mono font-semibold text-foreground">
                        {(balanceSheet?.currentLiabilities.customerAdvances || 0).toFixed(2)}
                      </span>
                    </div>
                    <div className="flex justify-between">
                      <span>مستحقات الرواتب والأجور (2130)</span>
                      <span className="font-mono font-semibold text-foreground">
                        {(balanceSheet?.currentLiabilities.payrollLiabilities || 0).toFixed(2)}
                      </span>
                    </div>
                    <div className="flex justify-between">
                      <span>ضرائب مستحقة الدفع (2140)</span>
                      <span className="font-mono font-semibold text-foreground">
                        {(balanceSheet?.currentLiabilities.taxPayable || 0).toFixed(2)}
                      </span>
                    </div>
                  </div>

                  <div className="pt-2 border-t font-semibold text-primary">حقوق الملكية (Equity)</div>
                  <div className="pr-3 space-y-1.5 text-muted-foreground">
                    <div className="flex justify-between">
                      <span>رأس المال التأسيسي (3100)</span>
                      <span className="font-mono font-semibold text-foreground">
                        {(balanceSheet?.equity.ownerCapital || 0).toFixed(2)}
                      </span>
                    </div>
                    <div className="flex justify-between">
                      <span>أرباح مرحلة سابقة (3200)</span>
                      <span className="font-mono font-semibold text-foreground">
                        {(balanceSheet?.equity.retainedEarnings || 0).toFixed(2)}
                      </span>
                    </div>
                    <div className="flex justify-between text-primary">
                      <span>أرباح الفترة الحالية (Net Income)</span>
                      <span className="font-mono font-bold">
                        {(balanceSheet?.equity.currentPeriodNetIncome || 0).toFixed(2)}
                      </span>
                    </div>
                  </div>
                </CardContent>
              </Card>
            </div>
          </TabsContent>

          {/* TAB 7: CASH FLOW */}
          <TabsContent value="cash_flow" className="space-y-4">
            <Card className="border shadow-sm max-w-3xl mx-auto">
              <CardHeader className="text-center border-b pb-4">
                <CardTitle className="text-xl font-bold">قائمة التدفقات النقدية المباشرة (Cash Flow Statement)</CardTitle>
                <CardDescription className="text-xs font-mono">
                  للفترة من {dateRange.start} إلى {dateRange.end}
                </CardDescription>
              </CardHeader>
              <CardContent className="p-6 space-y-4 text-sm divide-y">
                <div className="space-y-2 pt-2">
                  <div className="font-bold text-primary flex justify-between">
                    <span>1. الأنشطة التشغيلية (Operating Activities)</span>
                    <span className="font-mono">
                      {(cashFlow?.operatingActivities.netOperatingCashFlow || 0).toFixed(2)} EGP
                    </span>
                  </div>
                  <div className="pr-4 space-y-1 text-xs text-muted-foreground">
                    <div className="flex justify-between text-emerald-600 dark:text-emerald-400">
                      <span>المقبوضات النقدية من العملاء ونقاط البيع</span>
                      <span className="font-mono">+{(cashFlow?.operatingActivities.customerCollections || 0).toFixed(2)}</span>
                    </div>
                    <div className="flex justify-between text-rose-500">
                      <span>المدفوعات النقدية للموردين</span>
                      <span className="font-mono">-{(cashFlow?.operatingActivities.supplierPayments || 0).toFixed(2)}</span>
                    </div>
                    <div className="flex justify-between text-rose-500">
                      <span>الرواتب والأجور المسددة نقدياً</span>
                      <span className="font-mono">-{(cashFlow?.operatingActivities.payrollPaid || 0).toFixed(2)}</span>
                    </div>
                    <div className="flex justify-between text-rose-500">
                      <span>المصروفات التشغيلية والنثريات المسددة</span>
                      <span className="font-mono">-{(cashFlow?.operatingActivities.operatingExpensesPaid || 0).toFixed(2)}</span>
                    </div>
                  </div>
                </div>

                <div className="space-y-2 pt-3">
                  <div className="font-bold text-primary flex justify-between">
                    <span>2. الأنشطة التمويلية والرأسمالية (Financing Activities)</span>
                    <span className="font-mono">
                      {(cashFlow?.financingAndTransfers.netFinancingCashFlow || 0).toFixed(2)} EGP
                    </span>
                  </div>
                  <div className="pr-4 space-y-1 text-xs text-muted-foreground">
                    <div className="flex justify-between">
                      <span>إيداعات ومساهمات رأس المال الافتتاحي</span>
                      <span className="font-mono">+{(cashFlow?.financingAndTransfers.ownerContributions || 0).toFixed(2)}</span>
                    </div>
                  </div>
                </div>

                <div className="pt-4 space-y-2">
                  <div className="flex justify-between text-xs text-muted-foreground">
                    <span>رصيد النقدية أول الفترة:</span>
                    <span className="font-mono font-semibold">{(cashFlow?.openingCashBalance || 0).toFixed(2)} EGP</span>
                  </div>
                  <div className="flex justify-between text-xs text-muted-foreground">
                    <span>صافي التغير في النقدية خلال الفترة:</span>
                    <span className="font-mono font-semibold text-primary">{(cashFlow?.netChangeInCash || 0).toFixed(2)} EGP</span>
                  </div>
                  <div className="p-3 bg-muted/40 rounded-lg flex justify-between font-bold text-sm">
                    <span>رصيد النقدية نهاية الفترة (Closing Cash):</span>
                    <span className="font-mono text-emerald-600 dark:text-emerald-400">
                      {(cashFlow?.closingCashBalance || 0).toFixed(2)} EGP
                    </span>
                  </div>
                </div>
              </CardContent>
            </Card>
          </TabsContent>

          {/* TAB 8: RECONCILIATIONS (AUDIT 2) */}
          <TabsContent value="reconciliations" className="space-y-4">
            <div className="p-4 bg-muted/30 border rounded-xl space-y-1">
              <div className="font-bold text-sm flex items-center gap-2">
                <ShieldCheck className="w-5 h-5 text-primary" />
                <span>محرك المطابقة والرقابة المحاسبية (Audit 2 Compliance Engine)</span>
              </div>
              <p className="text-xs text-muted-foreground">
                تطبيق إلزامي ومباشر لضمان التطابق الرياضي الدائم بين حسابات المراقبة بالأستاذ العام (GL Control Accounts)
                ودفاتر الحسابات الفرعية (Subledgers) لحماية المنشأة من أي تسريب أو خلل في الأرصدة.
              </p>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {reconcileAR && (
                <ReconciliationCard
                  title="مطابقة حسابات القبض والعملاء"
                  glAccountCode="1130 - Accounts Receivable"
                  glBalance={reconcileAR.glBalance}
                  subledgerTitle="إجمالي أرصدة العملاء (Subledger)"
                  subledgerTotal={reconcileAR.subledgerTotal}
                  variance={reconcileAR.variance}
                  isMatched={reconcileAR.isMatched}
                  itemCountLabel="إجمالي عدد العملاء"
                  itemCount={reconcileAR.itemCount}
                  onRefresh={loadAllAccountingData}
                  loading={loading}
                />
              )}

              {reconcileAP && (
                <ReconciliationCard
                  title="مطابقة حسابات الدفع والموردين"
                  glAccountCode="2110 - Accounts Payable"
                  glBalance={reconcileAP.glBalance}
                  subledgerTitle="إجمالي أرصدة الموردين (Subledger)"
                  subledgerTotal={reconcileAP.subledgerTotal}
                  variance={reconcileAP.variance}
                  isMatched={reconcileAP.isMatched}
                  itemCountLabel="إجمالي عدد الموردين"
                  itemCount={reconcileAP.itemCount}
                  onRefresh={loadAllAccountingData}
                  loading={loading}
                />
              )}

              {reconcileInv && (
                <ReconciliationCard
                  title="مطابقة تقييم المخزون المادي"
                  glAccountCode="1140 - Inventory Control"
                  glBalance={reconcileInv.glInventoryBalance}
                  subledgerTitle="تقييم المخزون الفعلي (Stock Catalog)"
                  subledgerTotal={reconcileInv.stockValuationTotal}
                  variance={reconcileInv.variance}
                  isMatched={reconcileInv.isMatched}
                  itemCountLabel="عدد أصناف المنتجات"
                  itemCount={reconcileInv.productCount}
                  onRefresh={loadAllAccountingData}
                  loading={loading}
                />
              )}

              {reconcileCashRes && (
                <ReconciliationCard
                  title="مطابقة النقدية والأدراج الفعلية"
                  glAccountCode="1111/1112 - Cash Accounts"
                  glBalance={reconcileCashRes.glCashBalance}
                  subledgerTitle="النقدية الفعلية بورديات الكاشير"
                  subledgerTotal={reconcileCashRes.operationalRegisterCash}
                  variance={reconcileCashRes.variance}
                  isMatched={reconcileCashRes.isMatched}
                  itemCountLabel="الورديات المفتوحة"
                  itemCount={reconcileCashRes.activeShiftsCount}
                  onRefresh={loadAllAccountingData}
                  loading={loading}
                />
              )}
            </div>
          </TabsContent>

          {/* TAB 9: FISCAL PERIODS */}
          <TabsContent value="periods" className="space-y-4">
            <div className="flex flex-col sm:flex-row items-center justify-between gap-3 bg-muted/20 p-3 rounded-lg border">
              <div className="flex items-center gap-3">
                <span className="text-xs font-semibold">اختيار السنة المالية:</span>
                <Select
                  value={String(selectedYear)}
                  onValueChange={(val) => setSelectedYear(Number(val))}
                >
                  <SelectTrigger className="h-8 w-32 text-xs">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {[2024, 2025, 2026, 2027].map((y) => (
                      <SelectItem key={y} value={String(y)}>
                        سنة {y}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              {fiscalPeriods.length === 0 && (
                <Button
                  size="sm"
                  onClick={handleInitYear}
                  className="h-8 gap-1.5 text-xs"
                >
                  <Plus className="w-3.5 h-3.5" />
                  <span>تهيئة السنة المالية {selectedYear}</span>
                </Button>
              )}
            </div>

            <div className="border rounded-lg overflow-hidden bg-card">
              <Table>
                <TableHeader className="bg-muted/40 text-xs">
                  <TableRow>
                    <TableHead className="w-20">الفترة</TableHead>
                    <TableHead>اسم الفترة المالية</TableHead>
                    <TableHead>تاريخ البداية</TableHead>
                    <TableHead>تاريخ النهاية</TableHead>
                    <TableHead className="text-center">حالة الفترة</TableHead>
                    <TableHead className="text-center">إجراءات الإقفال</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody className="text-xs">
                  {fiscalPeriods.map((period) => (
                    <TableRow key={period.id} className="hover:bg-muted/20">
                      <TableCell className="font-mono font-bold">#{period.periodNumber}</TableCell>
                      <TableCell className="font-semibold">{period.name}</TableCell>
                      <TableCell className="font-mono">{period.startDate}</TableCell>
                      <TableCell className="font-mono">{period.endDate}</TableCell>
                      <TableCell className="text-center">
                        <Badge
                          variant={
                            period.status === 'closed'
                              ? 'destructive'
                              : period.status === 'soft_closed'
                              ? 'secondary'
                              : 'outline'
                          }
                          className={
                            period.status === 'open'
                              ? 'text-emerald-600 dark:text-emerald-400 border-emerald-500/30'
                              : ''
                          }
                        >
                          {period.status === 'closed'
                            ? 'مغلقة تماماً'
                            : period.status === 'soft_closed'
                            ? 'إغلاق مؤقت'
                            : 'مفتوحة للترحيل'}
                        </Badge>
                      </TableCell>
                      <TableCell className="text-center">
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => handleTogglePeriod(period)}
                          className="h-7 text-xs gap-1"
                        >
                          {period.status === 'closed' ? (
                            <>
                              <Unlock className="w-3.5 h-3.5 text-emerald-600" />
                              <span>إعادة فتح</span>
                            </>
                          ) : (
                            <>
                              <Lock className="w-3.5 h-3.5 text-rose-600" />
                              <span>إقفال الفترة</span>
                            </>
                          )}
                        </Button>
                      </TableCell>
                    </TableRow>
                  ))}
                  {fiscalPeriods.length === 0 && (
                    <TableRow>
                      <TableCell colSpan={6} className="text-center py-8 text-muted-foreground">
                        لم يتم تهيئة الفترات المالية لسنة {selectedYear} بعد. انقر على &quot;تهيئة السنة المالية&quot; للبدء.
                      </TableCell>
                    </TableRow>
                  )}
                </TableBody>
              </Table>
            </div>
          </TabsContent>
        </Tabs>

        {/* MODALS */}
        <NewJournalEntryModal
          open={newJournalOpen}
          onOpenChange={setNewJournalOpen}
          tenantId={tenantId || ''}
          userId={user?.uid || 'system'}
          onSuccess={loadAllAccountingData}
        />

        <NewAccountModal
          open={newAccountOpen}
          onOpenChange={setNewAccountOpen}
          tenantId={tenantId || ''}
          existingAccounts={accounts}
          onSuccess={loadAllAccountingData}
        />

        <OpeningBalancesWizard
          open={openingWizardOpen}
          onOpenChange={setOpeningWizardOpen}
          tenantId={tenantId || ''}
          userId={user?.uid || 'system'}
          onSuccess={loadAllAccountingData}
        />

        <JournalDetailsDrawer
          open={detailsDrawerOpen}
          onOpenChange={setDetailsDrawerOpen}
          entry={selectedEntry}
          tenantId={tenantId || ''}
          userId={user?.uid || 'system'}
          onReversalSuccess={loadAllAccountingData}
        />
      </div>
    </MainLayout>
  );
}
