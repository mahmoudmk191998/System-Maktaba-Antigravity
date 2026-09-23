/**
 * Sync Center Drawer & Conflict Review Modal
 * Provides cashiers and managers full visibility and control over
 * offline pending commands, conflict resolutions, and synchronization progress.
 */

import React, { useState, useEffect } from 'react';
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetDescription,
} from '@/components/ui/sheet';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import {
  RefreshCw,
  AlertTriangle,
  CheckCircle2,
  Clock,
  Trash2,
  Wifi,
  WifiOff,
  AlertCircle,
  HelpCircle,
  Shield,
  Layers,
  Sparkles,
  XCircle,
  HardDrive,
  Check,
} from 'lucide-react';
import {
  offlineQueueService,
  offlineSyncService,
  offlineConflictService,
  offlineCacheService,
  type OfflineOperation,
  type OfflineSalePayload,
  type OfflineReadinessBreakdown,
} from '@/services/offline';
import { useTenantBranch } from '@/hooks/useDatabase';
import { useAuth } from '@/hooks/useAuth';
import { useOfflineStatus } from '@/hooks/useOfflineStatus';
import { useFormatters } from '@/lib/formatters';
import { useAppStore } from '@/lib/store';
import { fetchProductsFromDb } from '@/services/products/products.repository';
import { fetchCategoriesFromDb } from '@/services/categories/categories.service';
import { toast } from 'sonner';

interface SyncCenterDrawerProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function SyncCenterDrawer({ open, onOpenChange }: SyncCenterDrawerProps) {
  const { tenantId, branchId } = useTenantBranch();
  const { currentTenant, currentBranch, settings } = useAppStore();
  const effectiveBranchId = branchId || currentBranch?.id || '';
  const { user, profile } = useAuth();
  const { isOnline, connectivity, counts, syncNow, refreshCounts } = useOfflineStatus();
  const { currency, formatDate } = useFormatters();

  const [operations, setOperations] = useState<OfflineOperation<any>[]>([]);
  const [activeTab, setActiveTab] = useState<'pending' | 'conflicts' | 'synced' | 'all' | 'readiness'>('pending');
  const [syncing, setSyncing] = useState(false);
  const [actionLoadingId, setActionLoadingId] = useState<string | null>(null);
  const [readiness, setReadiness] = useState<OfflineReadinessBreakdown | null>(null);
  const [preparing, setPreparing] = useState(false);

  const isManagerOrAdmin = profile?.role === 'admin' || profile?.role === 'owner' || profile?.role === 'manager';

  const loadOperations = async () => {
    try {
      const all = await offlineQueueService.getAllOperations(tenantId);
      setOperations(all);
    } catch (err) {
      console.error('Failed to load queue operations:', err);
    }
  };

  const loadReadiness = async () => {
    if (!tenantId) return;
    try {
      const res = await offlineCacheService.getDetailedReadiness(tenantId, effectiveBranchId);
      setReadiness(res);
    } catch (err) {
      console.error('Failed to load readiness:', err);
    }
  };

  useEffect(() => {
    if (open) {
      loadOperations();
      refreshCounts();
      loadReadiness();
    }
  }, [open, refreshCounts, tenantId, effectiveBranchId]);

  const handlePrepareDevice = async () => {
    if (!isOnline) {
      toast.error('يلزم الاتصال بالإنترنت مرة واحدة لتحميل بيانات الفرع قبل استخدام وضع عدم الاتصال.');
      return;
    }
    if (!tenantId) {
      toast.error('معرف المستأجر غير متوفر');
      return;
    }
    setPreparing(true);
    toast.loading('جاري تجهيز بيانات الفرع للعمل دون اتصال...', { id: 'prep_offline' });
    try {
      const prodRes = await fetchProductsFromDb(tenantId, { pageSize: 500 });
      const catRes = await fetchCategoriesFromDb(tenantId);

      await offlineCacheService.prepareDeviceForOffline(tenantId, effectiveBranchId, {
        products: prodRes.products,
        categories: catRes,
        settings,
        tenantName: currentTenant?.name,
        branchName: currentBranch?.name,
      });

      await loadReadiness();
      toast.success('تم بنجاح: الجهاز جاهز للعمل دون اتصال', { id: 'prep_offline' });
    } catch (err: any) {
      console.error('Error preparing device:', err);
      toast.error(`فشل تجهيز الجهاز: ${err?.message || 'خطأ غير معروف'}`, { id: 'prep_offline' });
    } finally {
      setPreparing(false);
    }
  };

  const handleManualSync = async () => {
    if (!isOnline) {
      toast.error('لا يمكن بدء المزامنة لعدم توفر اتصال بالإنترنت');
      return;
    }
    setSyncing(true);
    try {
      const res = await syncNow();
      toast.success(`تمت المزامنة بنجاح: ${res.succeeded} ناجحة، ${res.conflicts} تعارض، ${res.failed} فاشلة`);
      await loadOperations();
    } catch (err: any) {
      toast.error(`فشلت المزامنة: ${err?.message || 'خطأ غير متوقع'}`);
    } finally {
      setSyncing(false);
    }
  };

  const handleCancelOperation = async (op: OfflineOperation<any>) => {
    if (op.status === 'awaiting_confirmation') {
      toast.error('لا يمكن إلغاء هذه العملية محلياً لأن نتيجة الخادم غير مؤكدة بعد انقطاع الاتصال. يجب إعادة الاتصال والتحقق أولاً لمنع ازدواج الفواتير.');
      return;
    }

    if (!window.confirm('هل أنت متأكد من رغبتك في إلغاء هذه العملية محلياً واستعادة كميات المخزون المحجوزة؟')) {
      return;
    }

    setActionLoadingId(op.id);
    try {
      const res = await offlineQueueService.cancelPendingOperation(op.id, user?.uid, isManagerOrAdmin);
      if (res.success) {
        toast.success('تم إلغاء العملية واستعادة الأرصدة المحلية بنجاح');
        await loadOperations();
        await refreshCounts();
      } else {
        toast.error(res.error || 'فشل إلغاء العملية');
      }
    } finally {
      setActionLoadingId(null);
    }
  };

  const handleRetryConflict = async (op: OfflineOperation<any>) => {
    setActionLoadingId(op.id);
    try {
      const res = await offlineConflictService.retryOperation(op.id);
      if (res.success) {
        toast.success('تمت إعادة محاولة المزامنة بنجاح!');
        await loadOperations();
        await refreshCounts();
      } else {
        toast.error(res.error || 'ما زالت العملية تواجه تعارضاً مع قواعد الخادم');
        await loadOperations();
      }
    } finally {
      setActionLoadingId(null);
    }
  };

  const filteredOperations = operations.filter((op) => {
    if (activeTab === 'pending') {
      return op.status === 'pending' || op.status === 'awaiting_confirmation' || op.status === 'syncing';
    }
    if (activeTab === 'conflicts') {
      return op.status === 'conflict' || op.status === 'failed';
    }
    if (activeTab === 'synced') {
      return op.status === 'synced';
    }
    return true;
  });

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="left" className="w-full sm:max-w-xl p-0 flex flex-col font-cairo">
        {/* Header */}
        <SheetHeader className="p-6 border-b border-border/40 bg-muted/20">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <SheetTitle className="text-xl font-black">مركز المزامنة والعمليات غير المتصلة</SheetTitle>
              <Badge
                variant={isOnline ? 'default' : 'destructive'}
                className="gap-1 font-bold text-xs"
              >
                {isOnline ? <Wifi className="w-3 h-3" /> : <WifiOff className="w-3 h-3" />}
                {isOnline ? 'متصل' : 'غير متصل'}
              </Badge>
            </div>
            <Button
              size="sm"
              variant="outline"
              disabled={!isOnline || syncing}
              onClick={handleManualSync}
              className="gap-1.5 font-bold shadow-sm"
            >
              <RefreshCw className={`w-3.5 h-3.5 ${syncing ? 'animate-spin' : ''}`} />
              <span>مزامنة الآن</span>
            </Button>
          </div>
          <SheetDescription className="text-xs text-muted-foreground mt-1">
            إدارة العمليات المعلقة المحفوظة محلياً والتحقق من سلامة المزامنة مع الخادم.
          </SheetDescription>

          {/* Quick Metrics Bar */}
          <div className="grid grid-cols-4 gap-2 mt-4">
            <div className="bg-background border border-border/60 rounded-xl p-2.5 text-center shadow-sm">
              <span className="text-[11px] font-bold text-muted-foreground block">بانتظار المزامنة</span>
              <span className="text-lg font-black text-amber-600">{counts.pending}</span>
            </div>
            <div className="bg-background border border-border/60 rounded-xl p-2.5 text-center shadow-sm">
              <span className="text-[11px] font-bold text-muted-foreground block">نتيجة غير مؤكدة</span>
              <span className="text-lg font-black text-purple-600">{counts.awaiting_confirmation}</span>
            </div>
            <div className="bg-background border border-border/60 rounded-xl p-2.5 text-center shadow-sm">
              <span className="text-[11px] font-bold text-muted-foreground block">تعارضات / تنبيهات</span>
              <span className="text-lg font-black text-destructive">{counts.conflict}</span>
            </div>
            <div className="bg-background border border-border/60 rounded-xl p-2.5 text-center shadow-sm">
              <span className="text-[11px] font-bold text-muted-foreground block">متزامنة حديثاً</span>
              <span className="text-lg font-black text-emerald-600">{counts.synced}</span>
            </div>
          </div>
        </SheetHeader>

        {/* Tabs & Operations List */}
        <div className="flex-1 flex flex-col min-h-0">
          <Tabs
            value={activeTab}
            onValueChange={(v) => setActiveTab(v as any)}
            className="flex-1 flex flex-col min-h-0"
          >
            <div className="px-6 pt-3 border-b border-border/40">
              <TabsList className="grid grid-cols-5 w-full h-10">
                <TabsTrigger value="pending" className="text-xs font-bold gap-1">
                  <Clock className="w-3.5 h-3.5" />
                  <span>معلقة ({counts.pending + counts.awaiting_confirmation})</span>
                </TabsTrigger>
                <TabsTrigger value="conflicts" className="text-xs font-bold gap-1 text-destructive">
                  <AlertTriangle className="w-3.5 h-3.5" />
                  <span>تعارض ({counts.conflict + counts.failed})</span>
                </TabsTrigger>
                <TabsTrigger value="synced" className="text-xs font-bold gap-1 text-emerald-600">
                  <CheckCircle2 className="w-3.5 h-3.5" />
                  <span>متزامنة ({counts.synced})</span>
                </TabsTrigger>
                <TabsTrigger value="all" className="text-xs font-bold">
                  <span>الكل ({operations.length})</span>
                </TabsTrigger>
                <TabsTrigger value="readiness" className="text-xs font-bold gap-1 text-primary">
                  <Shield className="w-3.5 h-3.5" />
                  <span>الجاهزية</span>
                </TabsTrigger>
              </TabsList>
            </div>

            <div className="flex-1 overflow-y-auto p-6 space-y-3">
              {activeTab === 'readiness' ? (
                <div className="space-y-4">
                  <div className="bg-card border border-border/70 rounded-2xl p-5 shadow-sm space-y-4">
                    <div className="flex items-center justify-between">
                      <div>
                        <h4 className="font-black text-base text-foreground flex items-center gap-2">
                          <Shield className="w-5 h-5 text-primary" />
                          حالة جاهزية هذا الجهاز للعمل دون اتصال
                        </h4>
                        <p className="text-xs text-muted-foreground mt-0.5">
                          فحص بيانات الذاكرة المحلية (IndexedDB) للتحقق من إمكانية استخدام نقطة البيع بدون إنترنت.
                        </p>
                      </div>
                      <Badge
                        variant={readiness?.isFullyReady ? 'default' : 'secondary'}
                        className="text-xs font-bold px-3 py-1"
                      >
                        {readiness?.isFullyReady ? 'الجهاز جاهز للعمل دون اتصال' : 'غير جاهز كلياً'}
                      </Badge>
                    </div>

                    <div className="space-y-2.5 pt-2 border-t border-border/50">
                      {/* Catalog */}
                      <div className="flex items-center justify-between p-3 rounded-xl bg-muted/30 border border-border/40">
                        <div className="flex items-center gap-2.5">
                          <Layers className="w-4 h-4 text-blue-500" />
                          <div>
                            <span className="text-xs font-bold text-foreground block">كتالوج الأصناف والأسعار</span>
                            <span className="text-[11px] text-muted-foreground">
                              {readiness?.catalogCount ? `${readiness.catalogCount} صنف محمل محلياً` : 'لم يتم التحميل'}
                            </span>
                          </div>
                        </div>
                        <Badge variant={readiness?.catalog === 'ready' ? 'default' : 'destructive'} className="text-[10px] font-bold">
                          {readiness?.catalog === 'ready' ? 'جاهز' : 'مفقود'}
                        </Badge>
                      </div>

                      {/* Stock */}
                      <div className="flex items-center justify-between p-3 rounded-xl bg-muted/30 border border-border/40">
                        <div className="flex items-center gap-2.5">
                          <HardDrive className="w-4 h-4 text-amber-500" />
                          <div>
                            <span className="text-xs font-bold text-foreground block">أرصدة المخزون للفرع</span>
                            <span className="text-[11px] text-muted-foreground">
                              {readiness?.stockCount ? `${readiness.stockCount} رصيد محلي مخزن` : 'لم يتم التحميل'}
                            </span>
                          </div>
                        </div>
                        <Badge variant={readiness?.stock === 'ready' ? 'default' : 'destructive'} className="text-[10px] font-bold">
                          {readiness?.stock === 'ready' ? 'جاهز' : 'مفقود'}
                        </Badge>
                      </div>

                      {/* Categories */}
                      <div className="flex items-center justify-between p-3 rounded-xl bg-muted/30 border border-border/40">
                        <div className="flex items-center gap-2.5">
                          <Layers className="w-4 h-4 text-purple-500" />
                          <div>
                            <span className="text-xs font-bold text-foreground block">شجرة التصنيفات</span>
                            <span className="text-[11px] text-muted-foreground">
                              {readiness?.categoriesCount ? `${readiness.categoriesCount} تصنيف محمل` : 'لم يتم التحميل'}
                            </span>
                          </div>
                        </div>
                        <Badge variant={readiness?.categories === 'ready' ? 'default' : 'destructive'} className="text-[10px] font-bold">
                          {readiness?.categories === 'ready' ? 'جاهز' : 'مفقود'}
                        </Badge>
                      </div>

                      {/* Settings */}
                      <div className="flex items-center justify-between p-3 rounded-xl bg-muted/30 border border-border/40">
                        <div className="flex items-center gap-2.5">
                          <Check className="w-4 h-4 text-emerald-500" />
                          <div>
                            <span className="text-xs font-bold text-foreground block">إعدادات البيع والضرائب</span>
                            <span className="text-[11px] text-muted-foreground">السياسات والحدود والضريبة</span>
                          </div>
                        </div>
                        <Badge variant={readiness?.settings === 'ready' ? 'default' : 'destructive'} className="text-[10px] font-bold">
                          {readiness?.settings === 'ready' ? 'جاهز' : 'مفقود'}
                        </Badge>
                      </div>

                      {/* Auth session */}
                      <div className="flex items-center justify-between p-3 rounded-xl bg-muted/30 border border-border/40">
                        <div className="flex items-center gap-2.5">
                          <Shield className="w-4 h-4 text-indigo-500" />
                          <div>
                            <span className="text-xs font-bold text-foreground block">جلسة المستخدم والصلاحيات</span>
                            <span className="text-[11px] text-muted-foreground">{user?.email || 'جلسة نشطة'}</span>
                          </div>
                        </div>
                        <Badge variant={readiness?.authSession === 'ready' ? 'default' : 'destructive'} className="text-[10px] font-bold">
                          {readiness?.authSession === 'ready' ? 'جاهز' : 'مفقود'}
                        </Badge>
                      </div>

                      {/* Last Sync */}
                      <div className="text-xs text-muted-foreground pt-1 flex justify-between items-center">
                        <span>آخر مزامنة ناجحة:</span>
                        <span className="font-mono font-bold">
                          {readiness?.lastSyncedAt ? formatDate(readiness.lastSyncedAt) : 'لا توجد مزامنة سابقة'}
                        </span>
                      </div>
                    </div>

                    <div className="pt-3">
                      <Button
                        type="button"
                        variant="default"
                        size="lg"
                        disabled={preparing || !isOnline}
                        onClick={handlePrepareDevice}
                        className="w-full gap-2 font-black rounded-xl shadow-md text-sm h-11"
                      >
                        <Sparkles className={`w-4 h-4 ${preparing ? 'animate-spin' : ''}`} />
                        <span>{preparing ? 'جارٍ تحميل البيانات وتجهيز الجهاز...' : 'تجهيز هذا الجهاز للعمل دون اتصال'}</span>
                      </Button>
                      {!isOnline && (
                        <p className="text-[11px] text-destructive text-center mt-2 font-bold">
                          يلزم الاتصال بالإنترنت مرة واحدة لتجهيز الجهاز ومزامنة بيانات الفرع.
                        </p>
                      )}
                    </div>
                  </div>
                </div>
              ) : filteredOperations.length === 0 ? (
                <div className="h-64 flex flex-col items-center justify-center text-center text-muted-foreground gap-2">
                  <CheckCircle2 className="w-12 h-12 text-muted-foreground/30" />
                  <p className="text-sm font-bold">لا توجد عمليات في هذا التبويب</p>
                  <p className="text-xs max-w-xs">
                    جميع العمليات متطابقة ومحدثة مع قاعدة البيانات السحابية.
                  </p>
                </div>
              ) : (
                filteredOperations.map((op) => {
                  const salePayload = op.payload as OfflineSalePayload;
                  const isPending = op.status === 'pending';
                  const isAwaiting = op.status === 'awaiting_confirmation';
                  const isConflict = op.status === 'conflict';
                  const isSynced = op.status === 'synced';

                  return (
                    <div
                      key={op.id}
                      className="border border-border/60 bg-card rounded-2xl p-4 shadow-sm hover:border-primary/40 transition-all space-y-3"
                    >
                      <div className="flex items-start justify-between gap-2">
                        <div>
                          <div className="flex items-center gap-2 flex-wrap">
                            <span className="font-black text-sm text-foreground">
                              {op.clientSnapshot?.temporaryReceiptNumber || op.idempotencyKey}
                            </span>
                            {isPending && (
                              <Badge variant="outline" className="bg-amber-500/10 text-amber-700 border-amber-500/30 text-[10px] font-bold">
                                بانتظار المزامنة
                              </Badge>
                            )}
                            {isAwaiting && (
                              <Badge variant="outline" className="bg-purple-500/10 text-purple-700 border-purple-500/30 text-[10px] font-bold">
                                نتيجة غير مؤكدة (أثناء السقوط)
                              </Badge>
                            )}
                            {isConflict && (
                              <Badge variant="destructive" className="text-[10px] font-bold">
                                تعارض مع الخادم
                              </Badge>
                            )}
                            {isSynced && (
                              <Badge variant="outline" className="bg-emerald-500/10 text-emerald-700 border-emerald-500/30 text-[10px] font-bold">
                                تمت المزامنة ✓
                              </Badge>
                            )}
                          </div>
                          <span className="text-[11px] text-muted-foreground block mt-0.5">
                            {formatDate(op.createdAt)} • الكاشير: {salePayload?.cashierNameSnapshot || op.createdBy}
                          </span>
                        </div>

                        {op.clientSnapshot?.grandTotal !== undefined && (
                          <div className="text-left font-black text-base text-primary">
                            {currency(op.clientSnapshot.grandTotal)}
                          </div>
                        )}
                      </div>

                      {/* Items Brief */}
                      {salePayload?.items && salePayload.items.length > 0 && (
                        <div className="bg-muted/40 rounded-xl p-2.5 text-xs text-muted-foreground space-y-1">
                          <span className="font-bold block text-foreground">
                            الأصناف ({salePayload.items.length}):
                          </span>
                          <div className="truncate">
                            {salePayload.items.map((it) => `${it.productName} (×${it.quantity})`).join(', ')}
                          </div>
                        </div>
                      )}

                      {/* Error / Conflict details */}
                      {op.errorMessage && (
                        <div className="flex items-start gap-2 bg-destructive/10 border border-destructive/20 text-destructive rounded-xl p-2.5 text-xs">
                          <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
                          <div className="min-w-0 flex-1">
                            <span className="font-bold block">سبب التعارض / الخطأ:</span>
                            <span>{op.errorMessage}</span>
                          </div>
                        </div>
                      )}

                      {/* Server reference if synced */}
                      {op.serverReferenceId && (
                        <div className="text-xs text-emerald-700 bg-emerald-500/10 border border-emerald-500/20 rounded-xl p-2 flex items-center justify-between">
                          <span className="font-bold">رقم الفاتورة المعتمدة بالسيرفر:</span>
                          <span className="font-mono font-black">{op.serverReferenceId}</span>
                        </div>
                      )}

                      {/* Financial Conflict Warning if Cash was collected */}
                      {isConflict && salePayload?.payments?.some((p) => p.method === 'cash') && (
                        <div className="flex items-start gap-2 bg-amber-500/15 border border-amber-500/30 text-amber-900 dark:text-amber-200 rounded-xl p-2.5 text-xs font-bold">
                          <AlertTriangle className="w-4 h-4 shrink-0 mt-0.5 text-amber-600 dark:text-amber-400" />
                          <div>
                            <span className="block font-black">تنبيه مالي حرج (نقدية بالدرج):</span>
                            <span>تم تحصيل مبلغ محلياً بواسطة الكاشير ولكن تعذر اعتماد الفاتورة على الخادم. تتطلب مراجعة فورية من الإدارة لمعالجة المخزون دون حذف السجل المالي.</span>
                          </div>
                        </div>
                      )}

                      {/* Action buttons */}
                      <div className="flex items-center justify-end gap-2 pt-1 border-t border-border/40">
                        {isConflict && (
                          <Button
                            size="sm"
                            variant="default"
                            disabled={actionLoadingId === op.id || !isOnline}
                            onClick={() => handleRetryConflict(op)}
                            className="h-8 text-xs font-bold gap-1"
                          >
                            <RefreshCw className="w-3 h-3" />
                            <span>إعادة المحاولة الآن</span>
                          </Button>
                        )}

                        {isPending && (
                          <Button
                            size="sm"
                            variant="ghost"
                            disabled={actionLoadingId === op.id}
                            onClick={() => handleCancelOperation(op)}
                            className="h-8 text-xs font-bold text-destructive hover:bg-destructive/10 gap-1"
                          >
                            <Trash2 className="w-3 h-3" />
                            <span>إلغاء العملية واستعادة المخزون</span>
                          </Button>
                        )}

                        {isAwaiting && (
                          <div className="flex items-center gap-2 flex-wrap">
                            <Button
                              size="sm"
                              variant="ghost"
                              disabled={true}
                              className="h-8 text-xs font-bold text-muted-foreground opacity-50 cursor-not-allowed gap-1"
                              title="جارٍ التحقق من حالة العملية على الخادم"
                            >
                              <Trash2 className="w-3 h-3" />
                              <span>إلغاء العملية (معطل)</span>
                            </Button>
                            <div className="flex items-center gap-1 text-[11px] font-bold text-purple-700 bg-purple-500/10 px-2.5 py-1 rounded-lg border border-purple-500/20">
                              <HelpCircle className="w-3.5 h-3.5 shrink-0" />
                              <span>جارٍ التحقق من حالة العملية على الخادم — معطلة ضد الإلغاء المحلي</span>
                            </div>
                          </div>
                        )}
                      </div>
                    </div>
                  );
                })
              )}
            </div>
          </Tabs>
        </div>
      </SheetContent>
    </Sheet>
  );
}
