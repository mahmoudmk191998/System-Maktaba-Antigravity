import React, { useState, useEffect } from 'react';
import { MainLayout } from '@/components/layout';
import { useTenantBranch } from '@/hooks/useDatabase';
import { useAuth } from '@/hooks/useAuth';
import {
  Activity,
  CheckCircle2,
  AlertTriangle,
  XCircle,
  RefreshCw,
  ShieldCheck,
  ShieldAlert,
  HelpCircle,
  RotateCcw,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs';
import { Badge } from '@/components/ui/badge';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { toast } from 'sonner';

import {
  runSystemIntegrityDiagnostics,
  SystemHealthReport,
} from '@/services/governance/systemHealth.service';
import {
  fetchOutboxExceptions,
  retryDeadLetterEvent,
  AccountingEventPayload,
} from '@/services/accounting/outboxProcessor.service';

export default function SystemHealth() {
  const { tenantId } = useTenantBranch();
  const { user } = useAuth();

  const [loading, setLoading] = useState<boolean>(true);
  const [report, setReport] = useState<SystemHealthReport | null>(null);
  const [exceptions, setExceptions] = useState<Array<AccountingEventPayload & { id: string }>>([]);
  const [retryingEventId, setRetryingEventId] = useState<string | null>(null);

  const loadHealthData = async () => {
    if (!tenantId) return;
    setLoading(true);
    try {
      const [diagRes, excRes] = await Promise.allSettled([
        runSystemIntegrityDiagnostics(tenantId),
        fetchOutboxExceptions(tenantId),
      ]);

      if (diagRes.status === 'fulfilled') {
        setReport(diagRes.value);
      } else {
        console.error('System health diagnostic run error:', diagRes.reason);
        toast.error('تعذر استكمال بعض فحوصات النظام');
      }

      if (excRes.status === 'fulfilled') {
        setExceptions(excRes.value);
      } else {
        console.warn('Outbox exceptions query error:', excRes.reason);
        setExceptions([]);
      }
    } catch (err: any) {
      console.error('Error running system diagnostics:', err);
      toast.error('حدث خطأ أثناء تشغيل فحص سلامة النظام');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadHealthData();
  }, [tenantId]);

  const handleRetryOutboxEvent = async (eventId: string) => {
    if (!tenantId || !user) return;
    setRetryingEventId(eventId);
    try {
      const res = await retryDeadLetterEvent(
        tenantId,
        eventId,
        user.displayName || user.email || 'مسؤول النظام'
      );
      toast.success(res.message);
      loadHealthData();
    } catch (err: any) {
      toast.error(err.message || 'فشلت إعادة ترحيل الحدث');
    } finally {
      setRetryingEventId(null);
    }
  };

  return (
    <MainLayout>
      <div className="space-y-6 pb-12" dir="rtl">
        {/* Header */}
        <div className="bg-card border border-border rounded-2xl p-6 shadow-sm flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <div className="p-2.5 bg-blue-500/10 text-blue-500 rounded-xl">
              <Activity className="w-7 h-7" />
            </div>
            <div>
              <h1 className="text-2xl font-black text-foreground">مركز سلامة ومطابقة النظام (System Health & Integrity)</h1>
              <p className="text-sm text-muted-foreground mt-0.5">
                فحص آلي لسلامة دفاتر الأستاذ، أرصدة العملاء والموردين، وتتبع صندوق القيود المحاسبية
              </p>
            </div>
          </div>

          <Button
            onClick={loadHealthData}
            disabled={loading}
            className="bg-primary text-primary-foreground hover:bg-primary/90 text-xs gap-1.5 h-9"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin' : ''}`} />
            إعادة فحص السلامة الآن
          </Button>
        </div>

        {/* Overall Health Status Banner */}
        {report && (
          <div
            className={`p-5 rounded-2xl border flex flex-col sm:flex-row sm:items-center justify-between gap-4 ${
              report.overallStatus === 'healthy'
                ? 'bg-emerald-500/10 border-emerald-500/30 text-emerald-950 dark:text-emerald-200'
                : report.overallStatus === 'warning'
                ? 'bg-amber-500/10 border-amber-500/30 text-amber-950 dark:text-amber-200'
                : 'bg-rose-500/10 border-rose-500/30 text-rose-950 dark:text-rose-200'
            }`}
          >
            <div className="flex items-center gap-3">
              {report.overallStatus === 'healthy' ? (
                <ShieldCheck className="w-8 h-8 text-emerald-600 dark:text-emerald-400 flex-shrink-0" />
              ) : report.overallStatus === 'warning' ? (
                <AlertTriangle className="w-8 h-8 text-amber-600 dark:text-amber-400 flex-shrink-0" />
              ) : (
                <ShieldAlert className="w-8 h-8 text-rose-600 dark:text-rose-400 flex-shrink-0" />
              )}
              <div>
                <h3 className="font-bold text-base">
                  {report.overallStatus === 'healthy'
                    ? 'النظام بحالة ممتازة ومطابق بالكامل (Healthy & In Equilibrium)'
                    : report.overallStatus === 'warning'
                    ? 'تنبيهات سلامة تتطلب مراجعة إدارية أو محاسبية (Warnings Detected)'
                    : 'حالات حرجة تتطلب تدخلاً فورياً (Critical Integrity Issues)'}
                </h3>
                <p className="text-xs opacity-80 mt-0.5">
                  تم فحص {report.totalChecksCount} معيار تكامل بنجاح. آخر فحص: {report.timestamp.replace('T', ' ').slice(0, 19)}
                </p>
              </div>
            </div>

            <div className="flex items-center gap-2">
              <Badge
                className={
                  report.overallStatus === 'healthy'
                    ? 'bg-emerald-600 hover:bg-emerald-600 text-white'
                    : report.overallStatus === 'warning'
                    ? 'bg-amber-600 hover:bg-amber-600 text-white'
                    : 'bg-rose-600 hover:bg-rose-600 text-white'
                }
              >
                {report.overallStatus.toUpperCase()}
              </Badge>
            </div>
          </div>
        )}

        {/* Tabs */}
        <Tabs defaultValue="diagnostics" className="space-y-6">
          <div className="bg-card p-1.5 border border-border rounded-xl shadow-sm">
            <TabsList className="bg-transparent flex flex-wrap gap-1">
              <TabsTrigger
                value="diagnostics"
                className="text-xs font-semibold py-2 px-3 gap-1.5 data-[state=active]:bg-primary data-[state=active]:text-primary-foreground"
              >
                <CheckCircle2 className="w-3.5 h-3.5" />
                نتائج فحوصات المطابقة ({report?.checks.length || 0})
              </TabsTrigger>
              <TabsTrigger
                value="outbox_exceptions"
                className="text-xs font-semibold py-2 px-3 gap-1.5 data-[state=active]:bg-primary data-[state=active]:text-primary-foreground"
              >
                <RotateCcw className="w-3.5 h-3.5" />
                صندوق القيود المحاسبية المعطلة ({exceptions.length})
              </TabsTrigger>
            </TabsList>
          </div>

          {/* TAB 1: DIAGNOSTICS */}
          <TabsContent value="diagnostics" className="space-y-4">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {report?.checks.map((c) => (
                <Card key={c.checkId} className="border border-border bg-card shadow-sm">
                  <CardHeader className="p-4 pb-2 flex flex-row items-center justify-between space-y-0">
                    <div className="flex items-center gap-2.5">
                      {c.status === 'healthy' ? (
                        <CheckCircle2 className="w-4 h-4 text-emerald-500" />
                      ) : c.status === 'warning' ? (
                        <AlertTriangle className="w-4 h-4 text-amber-500" />
                      ) : c.status === 'critical' ? (
                        <XCircle className="w-4 h-4 text-rose-500" />
                      ) : (
                        <HelpCircle className="w-4 h-4 text-muted-foreground" />
                      )}
                      <CardTitle className="text-xs font-bold text-card-foreground">{c.nameAr}</CardTitle>
                    </div>
                    <Badge
                      variant="outline"
                      className={
                        c.status === 'healthy'
                          ? 'text-emerald-700 bg-emerald-50 border-emerald-200 dark:text-emerald-300 dark:bg-emerald-950/40 dark:border-emerald-800'
                          : c.status === 'warning'
                          ? 'text-amber-700 bg-amber-50 border-amber-200 dark:text-amber-300 dark:bg-amber-950/40 dark:border-amber-800'
                          : c.status === 'critical'
                          ? 'text-rose-700 bg-rose-50 border-rose-200 dark:text-rose-300 dark:bg-rose-950/40 dark:border-rose-800'
                          : 'text-muted-foreground bg-muted border-border'
                      }
                    >
                      {c.status === 'healthy'
                        ? 'سليم'
                        : c.status === 'warning'
                        ? 'تنبيه'
                        : c.status === 'critical'
                        ? 'حرج'
                        : 'غير متاح'}
                    </Badge>
                  </CardHeader>
                  <CardContent className="p-4 pt-1">
                    <p className="text-xs text-muted-foreground leading-relaxed">{c.detailsAr}</p>
                  </CardContent>
                </Card>
              ))}
            </div>
          </TabsContent>

          {/* TAB 2: OUTBOX EXCEPTIONS */}
          <TabsContent value="outbox_exceptions" className="space-y-4">
            <Card className="border border-border bg-card shadow-sm">
              <CardHeader className="p-4 border-b border-border">
                <CardTitle className="text-sm font-bold text-card-foreground">
                  سجل القيود المحاسبية التي تتطلب تدخلاً يدوياً (Dead-Letter Queue)
                </CardTitle>
                <CardDescription className="text-xs text-muted-foreground">
                  العمليات التي لم ترحل للأستاذ العام بعد 5 محاولات متتالية مع حفظ بيانات الخطأ بالكامل
                </CardDescription>
              </CardHeader>
              <CardContent className="p-0">
                <Table>
                  <TableHeader>
                    <TableRow className="border-border">
                      <TableHead>معرف الحدث</TableHead>
                      <TableHead>نوع العملية</TableHead>
                      <TableHead>الرقم المرجعي</TableHead>
                      <TableHead>تاريخ الحدث</TableHead>
                      <TableHead>عدد المحاولات</TableHead>
                      <TableHead>رسالة الخطأ</TableHead>
                      <TableHead>الحالة</TableHead>
                      <TableHead className="text-left">الإجراء</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {exceptions.length === 0 ? (
                      <TableRow className="border-border">
                        <TableCell colSpan={8} className="text-center py-12 text-muted-foreground">
                          صندوق القيود سليم تماماً، لا توجد قيود معطلة أو مفقودة
                        </TableCell>
                      </TableRow>
                    ) : (
                      exceptions.map((exc) => (
                        <TableRow key={exc.id} className="border-border">
                          <TableCell className="font-mono text-[11px] text-muted-foreground">{exc.id}</TableCell>
                          <TableCell className="font-semibold text-xs text-card-foreground">{exc.sourceType}</TableCell>
                          <TableCell className="font-mono text-xs text-primary">{exc.sourceId}</TableCell>
                          <TableCell className="text-xs text-muted-foreground">{exc.eventDate.slice(0, 16)}</TableCell>
                          <TableCell className="text-xs font-bold text-card-foreground">{exc.retryCount}</TableCell>
                          <TableCell className="text-xs text-rose-500 font-mono max-w-[200px] truncate">
                            {exc.lastError || 'خطأ غير محدد'}
                          </TableCell>
                          <TableCell>
                            <Badge variant={exc.status === 'dead_letter' ? 'destructive' : 'secondary'}>
                              {exc.status === 'dead_letter' ? 'معطل نهائياً' : 'فشل مؤقت'}
                            </Badge>
                          </TableCell>
                          <TableCell className="text-left">
                            <Button
                              variant="outline"
                              size="sm"
                              onClick={() => handleRetryOutboxEvent(exc.id)}
                              disabled={retryingEventId === exc.id}
                              className="text-xs h-7 gap-1"
                            >
                              <RefreshCw className={`w-3 h-3 ${retryingEventId === exc.id ? 'animate-spin' : ''}`} />
                              إعادة المحاولة
                            </Button>
                          </TableCell>
                        </TableRow>
                      ))
                    )}
                  </TableBody>
                </Table>
              </CardContent>
            </Card>
          </TabsContent>
        </Tabs>
      </div>
    </MainLayout>
  );
}
