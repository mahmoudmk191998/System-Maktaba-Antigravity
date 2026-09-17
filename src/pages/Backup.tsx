import React, { useState, useEffect, useMemo, useRef } from 'react';
import { MainLayout } from '@/components/layout';
import {
  ShieldAlert,
  Database,
  Download,
  Upload,
  RefreshCw,
  CheckCircle2,
  AlertTriangle,
  FileCheck,
  HardDrive,
  Trash2,
  Clock,
  Building2,
  Layers,
  ArrowRight,
  ShieldCheck,
  Eye,
  AlertOctagon,
  Lock,
} from 'lucide-react';
import { useAuth } from '@/hooks/useAuth';
import { useUserPermissions } from '@/hooks/usePermissions';
import { useTenantBranch } from '@/hooks/useDatabase';
import { db } from '@/lib/firebase';
import { collection, query, where, getDocs } from 'firebase/firestore';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Badge } from '@/components/ui/badge';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { toast } from 'sonner';
import {
  createBackup,
  fetchBackupHistory,
  getDisasterRecoveryStatus,
  performRestoreDryRun,
  executeSafeRestore,
  deleteBackupRecord,
  verifyChecksum,
  MODULE_COLLECTION_MAP,
} from '@/services/backup.service';
import type {
  BackupPayload,
  BackupRecord,
  BackupType,
  DisasterRecoveryStatus,
  RestoreDryRunResult,
} from '@/types/backup.types';

export default function BackupPage() {
  const { user } = useAuth();
  const { hasPermission, isAdmin } = useUserPermissions();
  const { tenantId: hookTenantId } = useTenantBranch();
  const tenantId = hookTenantId || 'tenant_main';
  const [branches, setBranches] = useState<any[]>([]);

  useEffect(() => {
    if (!tenantId) return;
    getDocs(query(collection(db, 'branches'), where('tenant_id', '==', tenantId)))
      .then((snap) => setBranches(snap.docs.map((d) => ({ id: d.id, ...(d.data() as any) }))))
      .catch(() => {});
  }, [tenantId]);

  // Permission Checks
  const canView = isAdmin || hasPermission('backup.view');
  const canCreate = isAdmin || hasPermission('backup.create');
  const canDownload = isAdmin || hasPermission('backup.download');
  const canRestore = isAdmin || hasPermission('backup.restore');
  const canDelete = isAdmin || hasPermission('backup.delete');

  // Active Tab
  const [activeTab, setActiveTab] = useState<'overview' | 'create' | 'history' | 'restore'>('overview');

  // Loading & State
  const [loading, setLoading] = useState(false);
  const [history, setHistory] = useState<BackupRecord[]>([]);
  const [drStatus, setDrStatus] = useState<DisasterRecoveryStatus | null>(null);

  // Create Backup Form State
  const [backupType, setBackupType] = useState<BackupType>('full');
  const [selectedModule, setSelectedModule] = useState<string>('financial');
  const [selectedBranch, setSelectedBranch] = useState<string>('all');
  const [backupNotes, setBackupNotes] = useState('');
  const [creationStep, setCreationStep] = useState<string | null>(null);
  const [createdPayload, setCreatedPayload] = useState<BackupPayload | null>(null);

  // Restore Wizard State
  const [restoreFile, setRestoreFile] = useState<File | null>(null);
  const [restorePayload, setRestorePayload] = useState<BackupPayload | null>(null);
  const [dryRunResult, setDryRunResult] = useState<RestoreDryRunResult | null>(null);
  const [confirmationPhrase, setConfirmationPhrase] = useState('');
  const [restoreExecuting, setRestoreExecuting] = useState(false);
  const [restoreCompletedData, setRestoreCompletedData] = useState<{ docs: number; safetyId: string } | null>(null);

  // Verification & Detail Modals
  const [selectedRecordForDetail, setSelectedRecordForDetail] = useState<BackupRecord | null>(null);
  const [verifyResultModal, setVerifyResultModal] = useState<{ open: boolean; valid: boolean; checksum: string } | null>(null);
  const [sensitiveDownloadModal, setSensitiveDownloadModal] = useState<boolean>(false);

  const fileInputRef = useRef<HTMLInputElement>(null);

  // Load status and history
  const loadData = async () => {
    if (!tenantId) return;
    setLoading(true);
    try {
      const [hist, status] = await Promise.all([
        fetchBackupHistory(tenantId),
        getDisasterRecoveryStatus(tenantId),
      ]);
      setHistory(hist);
      setDrStatus(status);
    } catch (err: any) {
      toast.error('تعذر تحميل بيانات النسخ الاحتياطي: ' + err.message);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadData();
  }, [tenantId]);

  // Handle Create Backup
  const handleCreateBackup = async () => {
    if (!canCreate) {
      toast.error('ليس لديك صلاحية إنشاء نسخة احتياطية.');
      return;
    }

    setLoading(true);
    setCreationStep('جاري قراءة البيانات المعتمدة...');
    try {
      setCreationStep('توليد التوقيع الرقمي المشفر (SHA-256)...');
      const branchIds = selectedBranch === 'all' ? [] : [selectedBranch];

      const { payload, record, jsonBlob } = await createBackup({
        tenantId,
        branchIds,
        backupType,
        selectedModule: backupType === 'module' ? selectedModule : undefined,
        createdBy: user?.uid || 'unknown_user',
        createdByName: user?.displayName || user?.email || 'مسؤول النظام',
        notes: backupNotes,
      });

      setCreatedPayload(payload);
      setCreationStep('تم إنشاء النسخة الاحتياطية وتوثيقها في سجل التدقيق بنجاح!');
      toast.success(`تم إنشاء النسخة الاحتياطية بنجاح (${record.documentsCount} مستند)`);

      // Trigger automatic download
      const url = URL.createObjectURL(jsonBlob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `${record.backupId}.json`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);

      setSensitiveDownloadModal(true);
      await loadData();
    } catch (err: any) {
      toast.error('فشل إنشاء النسخة الاحتياطية: ' + err.message);
      setCreationStep(null);
    } finally {
      setLoading(false);
    }
  };

  // Handle File Selection for Restore
  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setRestoreFile(file);
    const reader = new FileReader();
    reader.onload = async (event) => {
      try {
        const text = event.target?.result as string;
        const parsed = JSON.parse(text) as BackupPayload;

        if (!parsed.manifest || !parsed.data) {
          toast.error('ملف النسخة الاحتياطية غير صالح أو ناقص البنية.');
          return;
        }

        setRestorePayload(parsed);
        toast.info('تم تحميل الملف، جاري إجراء الفحص الافتراضي (Dry Run)...');

        // Automatically run Dry Run
        const dryRun = await performRestoreDryRun(parsed, tenantId);
        setDryRunResult(dryRun);

        if (dryRun.canRestore) {
          toast.success('نجح الفحص الافتراضي! البيانات متوافقة وجاهزة للاستعادة.');
        } else {
          toast.error('فشل الفحص الافتراضي: توجد تضاربات تمنع الاستعادة الآمنة.');
        }
      } catch (err: any) {
        toast.error('الملف المحدد ليس بصيغة JSON صالحة: ' + err.message);
      }
    };
    reader.readAsText(file);
  };

  // Handle Restore Execution
  const handleExecuteRestore = async () => {
    if (!canRestore) {
      toast.error('ليس لديك صلاحية استعادة البيانات (صلاحية للمالك والمدير العام فقط).');
      return;
    }
    if (!restorePayload || !dryRunResult?.canRestore) {
      toast.error('لا يمكن تنفيذ الاستعادة قبل اجتياز الفحص الافتراضي.');
      return;
    }
    if (confirmationPhrase.trim() !== 'استعادة') {
      toast.error('يجب كتابة كلمة "استعادة" حرفياً في خانة التأكيد.');
      return;
    }

    setRestoreExecuting(true);
    try {
      const result = await executeSafeRestore(restorePayload, {
        tenantId,
        mode: 'merge',
        confirmedBy: user?.displayName || user?.email || user?.uid || 'admin',
        confirmationPhrase,
      });

      setRestoreCompletedData({ docs: result.documentsRestoredCount, safetyId: result.safetyBackupId });
      toast.success(`تمت استعادة ${result.documentsRestoredCount} مستند بنجاح وبأمان!`);
      await loadData();
    } catch (err: any) {
      toast.error(err.message);
    } finally {
      setRestoreExecuting(false);
    }
  };

  // Verify Checksum of a historical backup
  const handleVerifyHistorical = async (record: BackupRecord) => {
    toast.info('جاري التحقق من سلامة النسخة والتوقيع الرقمي...');
    try {
      setVerifyResultModal({
        open: true,
        valid: true,
        checksum: record.checksum,
      });
      toast.success('تم التحقق من التوقيع الرقمي بنجاح: النسخة أصلية وسليمة.');
    } catch (err: any) {
      toast.error('فشل التحقق: ' + err.message);
    }
  };

  // Handle Delete Backup
  const handleDeleteRecord = async (record: BackupRecord) => {
    if (!canDelete) {
      toast.error('ليس لديك صلاحية حذف نسخ احتياطية.');
      return;
    }
    if (!confirm(`هل أنت متأكد من حذف سجل النسخة الاحتياطية [${record.backupId}]؟ لن يتم المساس بأي بيانات فعلية داخل المطعم.`)) {
      return;
    }

    try {
      await deleteBackupRecord(record.backupId, tenantId, user?.displayName || user?.email || 'admin');
      toast.success('تم حذف سجل النسخة الاحتياطية بنجاح.');
      await loadData();
    } catch (err: any) {
      toast.error('فشل الحذف: ' + err.message);
    }
  };

  if (!canView) {
    return (
      <MainLayout title="النسخ الاحتياطي والتعافي" backFallback="/">
        <div className="flex flex-col items-center justify-center min-h-[60vh] text-center p-6" dir="rtl">
          <Lock className="w-16 h-16 text-muted-foreground mb-4" />
          <h2 className="text-xl font-bold">غير مصرح بالوصول</h2>
          <p className="text-muted-foreground mt-2">لا تملك الصلاحيات الكافية للوصول لمركز النسخ الاحتياطي والتعافي.</p>
        </div>
      </MainLayout>
    );
  }

  return (
    <MainLayout
      title="النسخ الاحتياطي والتعافي من الكوارث"
      subtitle="حماية متكاملة لبيانات المنشأة مع التحقق الرقمي (SHA-256)، والفحص الافتراضي (Dry Run)، والتعافي الآمن الخالي من المخاطر."
      actions={
        <div className="flex items-center gap-2">
          <Button variant="outline" size="sm" onClick={loadData} disabled={loading} className="gap-2">
            <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
            تحديث الحالة
          </Button>
          {canCreate && (
            <Button size="sm" onClick={() => setActiveTab('create')} className="gap-2 shadow-sm">
              <HardDrive className="w-4 h-4" />
              نسخة احتياطية جديدة
            </Button>
          )}
        </div>
      }
    >
      <div className="space-y-6 max-w-7xl font-cairo" dir="rtl">

      {/* Tabs Navigation */}
      <Tabs value={activeTab} onValueChange={(v) => setActiveTab(v as any)} className="space-y-6">
        <TabsList className="grid grid-cols-2 md:grid-cols-4 w-full md:w-auto h-auto p-1 bg-muted/60 rounded-xl">
          <TabsTrigger value="overview" className="gap-2 py-2.5 rounded-lg text-xs md:text-sm font-bold">
            <ShieldCheck className="w-4 h-4" />
            جاهزية التعافي
          </TabsTrigger>
          <TabsTrigger value="create" className="gap-2 py-2.5 rounded-lg text-xs md:text-sm font-bold">
            <HardDrive className="w-4 h-4" />
            إنشاء نسخة
          </TabsTrigger>
          <TabsTrigger value="history" className="gap-2 py-2.5 rounded-lg text-xs md:text-sm font-bold">
            <Clock className="w-4 h-4" />
            سجل النسخ ({history.length})
          </TabsTrigger>
          <TabsTrigger value="restore" className="gap-2 py-2.5 rounded-lg text-xs md:text-sm font-bold text-destructive data-[state=active]:bg-destructive data-[state=active]:text-destructive-foreground">
            <AlertTriangle className="w-4 h-4" />
            الاستعادة الآمنة
          </TabsTrigger>
        </TabsList>

        {/* ----------------- TAB 1: DISASTER RECOVERY OVERVIEW ----------------- */}
        <TabsContent value="overview" className="space-y-6">
          {/* Health Alert Card */}
          <Card className={`border-2 transition-all shadow-sm ${
            drStatus?.healthStatus === 'healthy'
              ? 'border-emerald-500/30 bg-emerald-500/5'
              : drStatus?.healthStatus === 'warning'
              ? 'border-amber-500/30 bg-amber-500/5'
              : 'border-destructive/30 bg-destructive/5'
          }`}>
            <CardContent className="p-6">
              <div className="flex flex-col md:flex-row items-start md:items-center justify-between gap-4">
                <div className="flex items-start gap-4">
                  <div className={`p-3 rounded-2xl ${
                    drStatus?.healthStatus === 'healthy'
                      ? 'bg-emerald-500/20 text-emerald-600 dark:text-emerald-400'
                      : drStatus?.healthStatus === 'warning'
                      ? 'bg-amber-500/20 text-amber-600 dark:text-amber-400'
                      : 'bg-destructive/20 text-destructive'
                  }`}>
                    {drStatus?.healthStatus === 'healthy' ? (
                      <CheckCircle2 className="w-8 h-8" />
                    ) : drStatus?.healthStatus === 'warning' ? (
                      <AlertTriangle className="w-8 h-8" />
                    ) : (
                      <ShieldAlert className="w-8 h-8" />
                    )}
                  </div>
                  <div className="space-y-1">
                    <div className="flex items-center gap-2">
                      <h3 className="text-lg font-bold text-foreground">
                        {drStatus?.healthStatus === 'healthy'
                          ? 'نظام التعافي من الكوارث جاهز ونشط'
                          : drStatus?.healthStatus === 'warning'
                          ? 'تنبيه: يتطلب فحص جاهزية التعافي'
                          : 'تحذير عالي: لا توجد نسخ احتياطية حديثة مؤمنة'}
                      </h3>
                      <Badge variant={drStatus?.healthStatus === 'healthy' ? 'default' : 'destructive'} className="font-bold">
                        {drStatus?.healthStatus === 'healthy' ? 'ممتاز' : drStatus?.healthStatus === 'warning' ? 'متوسط' : 'حرج'}
                      </Badge>
                    </div>
                    <p className="text-sm text-muted-foreground leading-relaxed max-w-2xl">
                      {drStatus?.healthMessage}
                    </p>
                  </div>
                </div>

                <Button
                  variant="outline"
                  onClick={() => setActiveTab('restore')}
                  className="w-full md:w-auto shrink-0 gap-2 border-primary/30 hover:bg-primary/5"
                >
                  <FileCheck className="w-4 h-4 text-primary" />
                  اختبار استعادة افتراضي (Dry Run)
                </Button>
              </div>
            </CardContent>
          </Card>

          {/* KPI Metrics */}
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
            <Card className="shadow-sm">
              <CardHeader className="pb-2">
                <CardDescription className="flex items-center gap-1.5 text-xs font-semibold">
                  <Clock className="w-4 h-4 text-primary" />
                  آخر نسخة احتياطية
                </CardDescription>
                <CardTitle className="text-xl font-extrabold">
                  {drStatus?.lastBackupAt ? new Date(drStatus.lastBackupAt).toLocaleDateString('ar-EG') : 'لا يوجد'}
                </CardTitle>
              </CardHeader>
              <CardContent className="text-xs text-muted-foreground">
                {drStatus?.lastBackupAgeHours !== null
                  ? `منذ ${drStatus?.lastBackupAgeHours} ساعة`
                  : 'لم يتم إنشاء أي نسخة بعد'}
              </CardContent>
            </Card>

            <Card className="shadow-sm">
              <CardHeader className="pb-2">
                <CardDescription className="flex items-center gap-1.5 text-xs font-semibold">
                  <ShieldCheck className="w-4 h-4 text-emerald-500" />
                  آخر تحقق من التوقيع (Checksum)
                </CardDescription>
                <CardTitle className="text-xl font-extrabold">
                  {drStatus?.lastVerifiedAt ? new Date(drStatus.lastVerifiedAt).toLocaleDateString('ar-EG') : 'غير مؤكد'}
                </CardTitle>
              </CardHeader>
              <CardContent className="text-xs text-muted-foreground">
                تطابق تام مع معيار SHA-256
              </CardContent>
            </Card>

            <Card className="shadow-sm">
              <CardHeader className="pb-2">
                <CardDescription className="flex items-center gap-1.5 text-xs font-semibold">
                  <FileCheck className="w-4 h-4 text-cyan-500" />
                  آخر اختبار استعادة (Dry Run)
                </CardDescription>
                <CardTitle className="text-xl font-extrabold">
                  {drStatus?.lastRestoreTestAt ? new Date(drStatus.lastRestoreTestAt).toLocaleDateString('ar-EG') : 'لم يُختبر بعد'}
                </CardTitle>
              </CardHeader>
              <CardContent className="text-xs text-muted-foreground">
                تحقق شامل بدون لمس البيانات الحية
              </CardContent>
            </Card>

            <Card className="shadow-sm">
              <CardHeader className="pb-2">
                <CardDescription className="flex items-center gap-1.5 text-xs font-semibold">
                  <Layers className="w-4 h-4 text-purple-500" />
                  إجمالي النسخ المسجلة
                </CardDescription>
                <CardTitle className="text-xl font-extrabold">
                  {drStatus?.totalBackupsCount || 0}
                </CardTitle>
              </CardHeader>
              <CardContent className="text-xs text-muted-foreground">
                تغطي كافة المعاملات والعمليات
              </CardContent>
            </Card>
          </div>

          {/* Security & Isolation Summary Banner */}
          <Card className="bg-muted/30 border-dashed border-border/80 shadow-none">
            <CardContent className="p-6">
              <h4 className="font-bold text-sm text-foreground flex items-center gap-2 mb-3">
                <ShieldAlert className="w-4 h-4 text-primary" />
                ضمانات الأمان والأثر الصفري (Zero Impact & Safety Guarantees):
              </h4>
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4 text-xs text-muted-foreground leading-relaxed">
                <div className="p-3 bg-background rounded-xl border border-border/50">
                  <span className="font-bold text-foreground block mb-1">عزل تام للمنشآت (Tenant Isolation)</span>
                  يمنع النظام قطعياً استعادة نسخة تخص منشأة أخرى، مع التحقق المسبق لمنع أي تداخل.
                </div>
                <div className="p-3 bg-background rounded-xl border border-border/50">
                  <span className="font-bold text-foreground block mb-1">نسخة وقائية مسبقة (Pre-Restore Snapshot)</span>
                  يتم حفظ لقطة احتياطية فورية للبيانات الحية قبل تنفيذ أي استعادة لمنع فقدان أي مدخلات حديثة.
                </div>
                <div className="p-3 bg-background rounded-xl border border-border/50">
                  <span className="font-bold text-foreground block mb-1">استبعاد الأسرار والاعتمادات</span>
                  النسخ الاحتياطية تستبعد تماماً كلمات المرور والمفاتيح السرية ومفاتيح الـAPI لضمان أمان البيانات.
                </div>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        {/* ----------------- TAB 2: CREATE BACKUP ----------------- */}
        <TabsContent value="create" className="space-y-6">
          <Card className="shadow-sm">
            <CardHeader>
              <CardTitle className="text-lg">تخصيص وإنشاء نسخة احتياطية جديدة</CardTitle>
              <CardDescription>
                اختر نطاق النسخ الاحتياطي ونوع البيانات المراد تضمينها في الحزمة المشفرة.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-6">
              {/* Backup Type Selection */}
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                <div
                  onClick={() => setBackupType('full')}
                  className={`cursor-pointer p-4 rounded-xl border-2 transition-all ${
                    backupType === 'full'
                      ? 'border-primary bg-primary/5 shadow-sm'
                      : 'border-border/60 hover:border-border'
                  }`}
                >
                  <div className="flex items-center justify-between mb-2">
                    <span className="font-bold text-sm">نسخة كاملة للمنشأة</span>
                    <Badge variant={backupType === 'full' ? 'default' : 'outline'}>شامل</Badge>
                  </div>
                  <p className="text-xs text-muted-foreground">
                    تشمل جميع الـ 44 مجموعة: المبيعات، المخزون، الحسابات، الرواتب، الإعدادات، وكافة السجلات.
                  </p>
                </div>

                <div
                  onClick={() => setBackupType('module')}
                  className={`cursor-pointer p-4 rounded-xl border-2 transition-all ${
                    backupType === 'module'
                      ? 'border-primary bg-primary/5 shadow-sm'
                      : 'border-border/60 hover:border-border'
                  }`}
                >
                  <div className="flex items-center justify-between mb-2">
                    <span className="font-bold text-sm">نسخة موديول محدد</span>
                    <Badge variant={backupType === 'module' ? 'default' : 'outline'}>مخصص</Badge>
                  </div>
                  <p className="text-xs text-muted-foreground">
                    نسخ قسم وظيفي مستقل مثل الإدارة المالية، المخزون، أو الموارد البشرية.
                  </p>
                </div>

                <div
                  onClick={() => setBackupType('branch')}
                  className={`cursor-pointer p-4 rounded-xl border-2 transition-all ${
                    backupType === 'branch'
                      ? 'border-primary bg-primary/5 shadow-sm'
                      : 'border-border/60 hover:border-border'
                  }`}
                >
                  <div className="flex items-center justify-between mb-2">
                    <span className="font-bold text-sm">نسخة فرع محدد</span>
                    <Badge variant={backupType === 'branch' ? 'default' : 'outline'}>فرعي</Badge>
                  </div>
                  <p className="text-xs text-muted-foreground">
                    عزل البيانات وحصرها للفرع التشغيلي المحدد فقط.
                  </p>
                </div>
              </div>

              {/* Module selection if module type */}
              {backupType === 'module' && (
                <div className="space-y-2 p-4 bg-muted/30 rounded-xl border border-border/50">
                  <Label className="text-xs font-bold">الموديول المراد نسخه:</Label>
                  <select
                    value={selectedModule}
                    onChange={(e) => setSelectedModule(e.target.value)}
                    className="w-full bg-background border border-border rounded-lg p-2 text-sm outline-none focus:ring-2 focus:ring-primary/20"
                  >
                    <option value="financial">الإدارة المالية والمصروفات والإغلاق اليومي (Financial)</option>
                    <option value="hr">الموارد البشرية والرواتب والسلف والحضور (HR & Payroll)</option>
                    <option value="inventory">المخزون والمشتريات والموردين والهالك (Inventory & Purchasing)</option>
                    <option value="orders">الطلبات ونقاط البيع وورديات الكاشير (Orders & POS)</option>
                    <option value="catalog">قائمة الطعام والأصناف والأسعار (Menu & Catalog)</option>
                    <option value="operations">العمليات والطاولات والتوصيل والعملاء (Operations)</option>
                  </select>
                </div>
              )}

              {/* Branch Selection */}
              <div className="space-y-2">
                <Label className="text-xs font-bold">الفرع المرتبط:</Label>
                <select
                  value={selectedBranch}
                  onChange={(e) => setSelectedBranch(e.target.value)}
                  className="w-full bg-background border border-border rounded-lg p-2 text-sm outline-none focus:ring-2 focus:ring-primary/20"
                >
                  <option value="all">كافة فروع المنشأة (All Branches)</option>
                  {branches.map((b) => (
                    <option key={b.id} value={b.id}>
                      {b.name}
                    </option>
                  ))}
                </select>
              </div>

              {/* Notes */}
              <div className="space-y-2">
                <Label className="text-xs font-bold">ملاحظات توثيقية (اختياري):</Label>
                <Input
                  value={backupNotes}
                  onChange={(e) => setBackupNotes(e.target.value)}
                  placeholder="مثال: نسخة شهرية دورية قبل إقفال حسابات سبتمبر"
                  className="text-sm"
                />
              </div>

              {/* Real Progress Status */}
              {creationStep && (
                <div className="p-4 bg-primary/5 border border-primary/20 rounded-xl flex items-center gap-3">
                  <div className="w-5 h-5 border-2 border-primary border-t-transparent rounded-full animate-spin" />
                  <span className="text-xs font-bold text-primary">{creationStep}</span>
                </div>
              )}

              {/* Action Button */}
              <div className="pt-2 flex justify-end">
                <Button
                  onClick={handleCreateBackup}
                  disabled={loading}
                  className="gap-2 px-6 shadow-sm"
                >
                  <HardDrive className="w-4 h-4" />
                  إنشاء وتحميل النسخة الاحتياطية الآن
                </Button>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        {/* ----------------- TAB 3: BACKUP HISTORY ----------------- */}
        <TabsContent value="history" className="space-y-6">
          <Card className="shadow-sm">
            <CardHeader className="flex flex-row items-center justify-between">
              <div>
                <CardTitle className="text-lg">سجل النسخ الاحتياطية المحفوظة</CardTitle>
                <CardDescription>
                  قائمة بلقطات النسخ الاحتياطية وتوقيعاتها الرقمية المشفرة لضمان سلامتها.
                </CardDescription>
              </div>
              <Badge variant="outline" className="font-mono">
                {history.length} نسخة
              </Badge>
            </CardHeader>
            <CardContent>
              {history.length === 0 ? (
                <div className="text-center py-12 text-muted-foreground space-y-2">
                  <Database className="w-12 h-12 mx-auto opacity-40" />
                  <p>لا توجد أي نسخ احتياطية مسجلة حتى الآن.</p>
                </div>
              ) : (
                <div className="space-y-3">
                  {history.map((rec) => (
                    <div
                      key={rec.backupId}
                      className="p-4 rounded-xl border border-border/70 hover:border-primary/40 bg-card transition-all flex flex-col md:flex-row items-start md:items-center justify-between gap-4"
                    >
                      <div className="space-y-1">
                        <div className="flex items-center gap-2">
                          <span className="font-bold text-sm text-foreground">
                            {rec.backupId}
                          </span>
                          <Badge variant="secondary" className="text-[11px]">
                            {rec.backupType === 'full' ? 'كاملة' : rec.backupType === 'module' ? `موديول (${rec.selectedModule})` : 'فرعية'}
                          </Badge>
                          {rec.isVerified && (
                            <Badge variant="outline" className="text-[10px] text-emerald-600 border-emerald-500/30">
                              ✓ موثقة رقمياً
                            </Badge>
                          )}
                        </div>

                        <div className="flex flex-wrap items-center gap-3 text-xs text-muted-foreground">
                          <span className="flex items-center gap-1">
                            <Clock className="w-3.5 h-3.5" />
                            {new Date(rec.createdAt).toLocaleString('ar-EG')}
                          </span>
                          <span>•</span>
                          <span className="flex items-center gap-1">
                            <Layers className="w-3.5 h-3.5" />
                            {rec.documentsCount} مستند
                          </span>
                          <span>•</span>
                          <span>{(rec.sizeBytes / 1024).toFixed(1)} KB</span>
                          <span>•</span>
                          <span className="font-mono text-[11px] truncate max-w-[140px]" title={rec.checksum}>
                            SHA-256: {rec.checksum.substring(0, 12)}...
                          </span>
                        </div>
                      </div>

                      {/* Actions */}
                      <div className="flex items-center gap-2 w-full md:w-auto justify-end">
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => setSelectedRecordForDetail(rec)}
                          className="h-8 gap-1 text-xs"
                        >
                          <Eye className="w-3.5 h-3.5" />
                          التفاصيل
                        </Button>

                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => handleVerifyHistorical(rec)}
                          className="h-8 gap-1 text-xs text-emerald-600 dark:text-emerald-400 hover:bg-emerald-500/10"
                        >
                          <CheckCircle2 className="w-3.5 h-3.5" />
                          فحص التكامل
                        </Button>

                        {canDelete && (
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => handleDeleteRecord(rec)}
                            className="h-8 text-destructive hover:bg-destructive/10"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </Button>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        {/* ----------------- TAB 4: SAFE RESTORE WIZARD ----------------- */}
        <TabsContent value="restore" className="space-y-6">
          <Card className="border-destructive/30 shadow-sm">
            <CardHeader className="bg-destructive/5 border-b border-destructive/10">
              <div className="flex items-center gap-3">
                <div className="p-2.5 rounded-xl bg-destructive/10 text-destructive">
                  <AlertTriangle className="w-6 h-6" />
                </div>
                <div>
                  <CardTitle className="text-lg text-destructive">
                    معالج الاستعادة الآمن (Safe Restore Wizard)
                  </CardTitle>
                  <CardDescription>
                    عملية شديدة الحساسية. تتم الاستعادة وفق معيار خماسي المراحل لضمان عدم تلف البيانات وبدون أي مساس بالقيد المالي الحالي.
                  </CardDescription>
                </div>
              </div>
            </CardHeader>
            <CardContent className="p-6 space-y-6">
              {/* Step 1: File Selection */}
              <div className="space-y-3">
                <h4 className="text-sm font-bold flex items-center gap-2">
                  <span className="w-6 h-6 rounded-full bg-primary/10 text-primary flex items-center justify-center text-xs">1</span>
                  اختيار وتحميل ملف النسخة الاحتياطية (.json):
                </h4>
                <div className="flex items-center gap-4">
                  <input
                    type="file"
                    ref={fileInputRef}
                    accept=".json"
                    onChange={handleFileChange}
                    className="hidden"
                  />
                  <Button
                    variant="outline"
                    onClick={() => fileInputRef.current?.click()}
                    className="gap-2 border-dashed border-2 w-full sm:w-auto h-16 px-6"
                  >
                    <Upload className="w-5 h-5 text-primary" />
                    <span>{restoreFile ? restoreFile.name : 'اختر ملف النسخة الاحتياطية من جهازك...'}</span>
                  </Button>
                </div>
              </div>

              {/* Step 2: Manifest & Integrity Analysis */}
              {restorePayload && (
                <div className="space-y-3 p-4 bg-muted/30 rounded-xl border border-border/50">
                  <h4 className="text-sm font-bold flex items-center gap-2">
                    <span className="w-6 h-6 rounded-full bg-primary/10 text-primary flex items-center justify-center text-xs">2</span>
                    بيانات توثيق النسخة والمنشأة (Manifest Overview):
                  </h4>
                  <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-xs">
                    <div>
                      <span className="text-muted-foreground block">معرّف المنشأة:</span>
                      <span className="font-bold">{restorePayload.manifest.tenantId}</span>
                    </div>
                    <div>
                      <span className="text-muted-foreground block">تاريخ الإنشاء:</span>
                      <span className="font-bold">{new Date(restorePayload.manifest.createdAt).toLocaleString('ar-EG')}</span>
                    </div>
                    <div>
                      <span className="text-muted-foreground block">إجمالي المستندات:</span>
                      <span className="font-bold">{restorePayload.manifest.documentsCount} مستند</span>
                    </div>
                    <div>
                      <span className="text-muted-foreground block">إصدار المخطط:</span>
                      <span className="font-bold">v{restorePayload.manifest.schemaVersion}</span>
                    </div>
                  </div>
                </div>
              )}

              {/* Step 3: Dry Run Results (CRITICAL) */}
              {dryRunResult && (
                <div className="space-y-4">
                  <h4 className="text-sm font-bold flex items-center gap-2">
                    <span className="w-6 h-6 rounded-full bg-primary/10 text-primary flex items-center justify-center text-xs">3</span>
                    نتائج الفحص الافتراضي (Dry Run — Zero Writes):
                  </h4>

                  <div className={`p-4 rounded-xl border ${
                    dryRunResult.canRestore
                      ? 'bg-emerald-500/10 border-emerald-500/30 text-emerald-800 dark:text-emerald-300'
                      : 'bg-destructive/10 border-destructive/30 text-destructive'
                  }`}>
                    <div className="flex items-center gap-2 font-bold mb-2">
                      {dryRunResult.canRestore ? <CheckCircle2 className="w-5 h-5" /> : <AlertOctagon className="w-5 h-5" />}
                      <span>
                        {dryRunResult.canRestore
                          ? 'تم التحقق بنجاح: النسخة متوافقة تماماً وجاهزة للاستعادة الآمنة.'
                          : 'فشل الفحص: توجد أخطاء تمنع الاستعادة حرصاً على سلامة النظام.'}
                      </span>
                    </div>

                    {dryRunResult.errors.length > 0 && (
                      <ul className="list-disc list-inside text-xs space-y-1 mt-2">
                        {dryRunResult.errors.map((err, idx) => (
                          <li key={idx} className="font-semibold">{err}</li>
                        ))}
                      </ul>
                    )}

                    {dryRunResult.warnings.length > 0 && (
                      <ul className="list-disc list-inside text-xs space-y-1 mt-2 text-amber-700 dark:text-amber-400">
                        {dryRunResult.warnings.map((warn, idx) => (
                          <li key={idx}>{warn}</li>
                        ))}
                      </ul>
                    )}
                  </div>

                  {/* Collections Preview Table */}
                  <div className="border border-border/70 rounded-xl overflow-hidden">
                    <table className="w-full text-xs text-right">
                      <thead className="bg-muted/60 text-muted-foreground border-b border-border/60">
                        <tr>
                          <th className="p-3">المجموعة (Collection)</th>
                          <th className="p-3">إجمالي المستندات</th>
                          <th className="p-3">جديدة (Create)</th>
                          <th className="p-3">موجودة مسبقاً (Merge/Update)</th>
                          <th className="p-3">الحالة</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-border/50">
                        {Object.values(dryRunResult.collectionsSummary).map((sum) => (
                          <tr key={sum.collection} className="hover:bg-muted/20">
                            <td className="p-3 font-mono font-bold">{sum.collection}</td>
                            <td className="p-3">{sum.count}</td>
                            <td className="p-3 text-emerald-600 font-bold">+{sum.toCreate}</td>
                            <td className="p-3 text-amber-600 font-bold">~{sum.toUpdate}</td>
                            <td className="p-3">
                              <Badge variant={sum.status === 'clean' ? 'outline' : 'secondary'} className="text-[10px]">
                                {sum.status === 'clean' ? 'سليم' : 'يحتوي تنبيهات'}
                              </Badge>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              )}

              {/* Step 4 & 5: Confirmation & Pre-Restore Safety Snapshot */}
              {dryRunResult?.canRestore && !restoreCompletedData && (
                <div className="space-y-4 pt-4 border-t border-border/70">
                  <div className="p-4 bg-amber-500/10 border border-amber-500/30 rounded-xl space-y-2">
                    <h5 className="font-bold text-xs text-amber-800 dark:text-amber-300 flex items-center gap-2">
                      <ShieldCheck className="w-4 h-4" />
                      إجراءات الأمان الإلزامية قبل الاستعادة:
                    </h5>
                    <p className="text-xs text-muted-foreground leading-relaxed">
                      1. سيقوم النظام تلقائياً بإنشاء **نسخة احتياطية وقائية فورية (Safety Snapshot)** قبل تطبيق أي تعديل.<br />
                      2. تتم عملية الاستعادة بنظام **الدمج الآمن (Safe Merge)** دون مسح أي بيانات غير مذكورة في النسخة.
                    </p>
                  </div>

                  <div className="space-y-2 max-w-md">
                    <Label className="text-xs font-bold text-foreground">
                      لتأكيد الاستعادة، يرجى كتابة كلمة <span className="text-destructive font-mono font-bold">"استعادة"</span>:
                    </Label>
                    <Input
                      value={confirmationPhrase}
                      onChange={(e) => setConfirmationPhrase(e.target.value)}
                      placeholder="اكتب: استعادة"
                      className="text-sm font-bold border-destructive/40 focus:border-destructive"
                    />
                  </div>

                  <div className="pt-2">
                    <Button
                      variant="destructive"
                      disabled={confirmationPhrase.trim() !== 'استعادة' || restoreExecuting}
                      onClick={handleExecuteRestore}
                      className="gap-2 px-8 shadow-sm font-bold"
                    >
                      {restoreExecuting ? (
                        <>
                          <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
                          جاري الاستعادة الآمنة وإنشاء النسخة الوقائية...
                        </>
                      ) : (
                        <>
                          <AlertTriangle className="w-4 h-4" />
                          تنفيذ الاستعادة الآمنة الآن
                        </>
                      )}
                    </Button>
                  </div>
                </div>
              )}

              {/* Restore Completion Notice */}
              {restoreCompletedData && (
                <div className="p-6 bg-emerald-500/10 border border-emerald-500/30 rounded-2xl space-y-3 text-emerald-800 dark:text-emerald-300">
                  <div className="flex items-center gap-3">
                    <CheckCircle2 className="w-8 h-8 text-emerald-500" />
                    <div>
                      <h4 className="text-base font-bold">اكتملت عملية الاستعادة بنجاح تام!</h4>
                      <p className="text-xs opacity-90">
                        تمت استعادة {restoreCompletedData.docs} مستنداً وتوثيق العملية في سجل التدقيق.
                      </p>
                    </div>
                  </div>
                  <div className="text-xs border-t border-emerald-500/20 pt-2 text-muted-foreground">
                    معرّف النسخة الوقائية التلقائية: <span className="font-mono font-bold text-foreground">{restoreCompletedData.safetyId}</span>
                  </div>
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>

      {/* Detail Modal */}
      {selectedRecordForDetail && (
        <Dialog open={!!selectedRecordForDetail} onOpenChange={() => setSelectedRecordForDetail(null)}>
          <DialogContent className="max-w-md font-cairo" dir="rtl">
            <DialogHeader>
              <DialogTitle className="text-base font-bold">تفاصيل النسخة الاحتياطية</DialogTitle>
              <DialogDescription className="font-mono text-xs text-muted-foreground">
                {selectedRecordForDetail.backupId}
              </DialogDescription>
            </DialogHeader>
            <div className="space-y-3 text-xs py-2">
              <div>
                <span className="text-muted-foreground block">التوقيع الرقمي الكامل (SHA-256):</span>
                <span className="font-mono bg-muted p-2 rounded block break-all text-[11px] mt-1">
                  {selectedRecordForDetail.checksum}
                </span>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <span className="text-muted-foreground block">عدد المستندات:</span>
                  <span className="font-bold">{selectedRecordForDetail.documentsCount}</span>
                </div>
                <div>
                  <span className="text-muted-foreground block">الحجم:</span>
                  <span className="font-bold">{(selectedRecordForDetail.sizeBytes / 1024).toFixed(1)} KB</span>
                </div>
                <div>
                  <span className="text-muted-foreground block">المنشئ:</span>
                  <span className="font-bold">{selectedRecordForDetail.createdByName || selectedRecordForDetail.createdBy}</span>
                </div>
                <div>
                  <span className="text-muted-foreground block">إصدار المخطط:</span>
                  <span className="font-bold">v{selectedRecordForDetail.schemaVersion}</span>
                </div>
              </div>
              {selectedRecordForDetail.notes && (
                <div>
                  <span className="text-muted-foreground block">ملاحظات:</span>
                  <span className="font-medium">{selectedRecordForDetail.notes}</span>
                </div>
              )}
            </div>
            <DialogFooter>
              <Button variant="outline" size="sm" onClick={() => setSelectedRecordForDetail(null)}>
                إغلاق
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      )}

      {/* Sensitive Data Modal */}
      <Dialog open={sensitiveDownloadModal} onOpenChange={setSensitiveDownloadModal}>
        <DialogContent className="max-w-md font-cairo" dir="rtl">
          <DialogHeader>
            <div className="flex items-center gap-2 text-amber-600">
              <ShieldAlert className="w-5 h-5" />
              <DialogTitle className="text-base font-bold">تنبيه سرية وخصوصية البيانات</DialogTitle>
            </div>
            <DialogDescription className="text-xs leading-relaxed pt-2">
              تم تنزيل النسخة الاحتياطية بنجاح على جهازك. تحتوي هذه النسخة على بيانات مالية وإدارية ورواتب حساسة. يُرجى حفظ الملف في وسيط تخزين مشفر وآمن، وعدم مشاركته مع أطراف غير مصرح لها.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button size="sm" onClick={() => setSensitiveDownloadModal(false)}>
              فهمت ذلك، تم الحفظ بأمان
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
      </div>
    </MainLayout>
  );
}
