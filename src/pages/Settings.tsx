import { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { MainLayout } from '@/components/layout';
import { useAppStore } from '@/lib/store';
import { useSettings, useUnits } from '@/hooks/useDatabase';
import { useAuth } from '@/hooks/useAuth';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs';
import { Badge } from '@/components/ui/badge';
import { Separator } from '@/components/ui/separator';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from '@/components/ui/dialog';
import { Progress } from '@/components/ui/progress';
import { toast } from 'sonner';
import { db } from '@/lib/firebase';
import { doc, deleteDoc, addDoc, collection } from 'firebase/firestore';
import {
  Languages,
  Save,
  Building2,
  Receipt,
  Shield,
  Palette,
  Database,
  Printer,
  CreditCard,
  Users,
  Clock,
  Globe,
  Phone,
  MapPin,
  Settings2,
  Eye,
  EyeOff,
  CheckCircle,
  AlertTriangle,
  Trash2,
  Scale,
  BookOpen,
  ArrowRight,
  ExternalLink,
  Loader2,
  Image as ImageIcon
} from 'lucide-react';

export default function Settings() {
  const { 
    settings, 
    updateSettings, 
    currentTenant, 
    setCurrentTenant,
    currentBranch, 
    setCurrentBranch,
    sidebarCollapsed, 
    setSidebarCollapsed 
  } = useAppStore();

  const { user } = useAuth();
  const { updateTenantProfile, updateBranchProfile, wipeAllTenantData } = useSettings(currentTenant?.id || null);
  const { units, add: addUnit, remove: removeUnit, seedStandardUnits } = useUnits(currentTenant?.id || null);

  // Institution Profile State
  const [tenantName, setTenantName] = useState(currentTenant?.name || '');
  const [tenantNameEn, setTenantNameEn] = useState(currentTenant?.nameEn || '');
  const [tenantTaxNumber, setTenantTaxNumber] = useState(currentTenant?.taxNumber || settings.invoiceTaxNumber || '');

  // Branch Profile State
  const [branchName, setBranchName] = useState(currentBranch?.name || '');
  const [branchPhone, setBranchPhone] = useState(currentBranch?.phone || '');
  const [branchAddress, setBranchAddress] = useState(currentBranch?.address || '');
  const [openingTime, setOpeningTime] = useState(currentBranch?.openingTime || '08:00');
  const [closingTime, setClosingTime] = useState(currentBranch?.closingTime || '23:00');

  // UI States
  const [isSaving, setIsSaving] = useState(false);
  const [isWiping, setIsWiping] = useState(false);
  const [showWipeModal, setShowWipeModal] = useState(false);
  const [wipeConfirmInput, setWipeConfirmInput] = useState('');
  const [wipeProgressMsg, setWipeProgressMsg] = useState('');
  const [wipePercent, setWipePercent] = useState(0);
  const [newUnitMode, setNewUnitMode] = useState(false);
  const [newUnit, setNewUnit] = useState({ name: '', abbreviation: '', type: 'count' });
  const [showDrawerPassword, setShowDrawerPassword] = useState(false);
  const [isResettingCounter, setIsResettingCounter] = useState(false);

  // Sync state when currentTenant or currentBranch loads/updates
  useEffect(() => {
    if (currentTenant) {
      setTenantName(currentTenant.name || '');
      setTenantNameEn(currentTenant.nameEn || '');
      setTenantTaxNumber(currentTenant.taxNumber || settings.invoiceTaxNumber || '');
    }
  }, [currentTenant, settings.invoiceTaxNumber]);

  useEffect(() => {
    if (currentBranch) {
      setBranchName(currentBranch.name || '');
      setBranchPhone(currentBranch.phone || '');
      setBranchAddress(currentBranch.address || '');
      setOpeningTime(currentBranch.openingTime || '08:00');
      setClosingTime(currentBranch.closingTime || '23:00');
    }
  }, [currentBranch]);

  const handleSave = async () => {
    if (isSaving) return;

    if (!tenantName.trim()) {
      toast.error('يرجى إدخال اسم المؤسسة');
      return;
    }

    setIsSaving(true);
    try {
      // 1. Persist Tenant settings and profile
      const cleanTenantName = tenantName.trim();
      const cleanTenantNameEn = tenantNameEn.trim();
      const cleanTaxNumber = tenantTaxNumber.trim();

      const nextSettings = {
        ...settings,
        invoiceCompanyName: cleanTenantName || settings.invoiceCompanyName,
        invoiceTaxNumber: cleanTaxNumber || settings.invoiceTaxNumber,
      };

      const tenantSuccess = await updateTenantProfile({
        name: cleanTenantName,
        name_en: cleanTenantNameEn,
        tax_number: cleanTaxNumber,
        settings: nextSettings
      });

      // 2. Persist Branch profile if branch exists
      let branchSuccess = true;
      const cleanBranchName = branchName.trim() || (currentBranch?.name || 'الفرع الرئيسي');
      const cleanBranchPhone = branchPhone.trim();
      const cleanBranchAddress = branchAddress.trim();

      if (currentBranch?.id) {
        branchSuccess = await updateBranchProfile(currentBranch.id, {
          name: cleanBranchName,
          phone: cleanBranchPhone,
          address: cleanBranchAddress,
          opening_time: openingTime,
          closing_time: closingTime
        });
      }

      // 3. Update local store state
      if (currentTenant?.id) {
        setCurrentTenant({
          ...currentTenant,
          name: cleanTenantName,
          nameEn: cleanTenantNameEn,
          taxNumber: cleanTaxNumber
        });
      }

      if (currentBranch?.id) {
        setCurrentBranch({
          ...currentBranch,
          name: cleanBranchName,
          phone: cleanBranchPhone,
          address: cleanBranchAddress,
          openingTime,
          closingTime
        });
      }

      updateSettings(nextSettings);
      if (typeof window !== 'undefined') {
        window.dispatchEvent(new CustomEvent('alwan_settings_updated', { detail: nextSettings }));
      }

      // 4. Record in audit_logs
      if (currentTenant?.id) {
        await addDoc(collection(db, 'audit_logs'), {
          action: 'update_settings',
          entity: 'system_settings',
          user: user?.displayName || user?.email || 'Admin',
          user_id: user?.uid || 'unknown',
          tenant_id: currentTenant.id,
          branch_id: currentBranch?.id || null,
          details: 'تم تحديث إعدادات النظام وبيانات المؤسسة والفرع بنجاح',
          severity: 'info',
          created_at: new Date().toISOString()
        });
      }

      if (tenantSuccess && branchSuccess) {
        toast.success('تم حفظ وتطبيق جميع الإعدادات بنجاح');
      }
    } catch (error: any) {
      console.error('Error saving settings:', error);
      toast.error('حدث خطأ أثناء حفظ الإعدادات: ' + (error?.message || 'خطأ غير معروف'));
    } finally {
      setIsSaving(false);
    }
  };

  const handleWipeData = async () => {
    if (wipeConfirmInput.trim() !== 'مسح' && wipeConfirmInput.trim() !== 'تأكيد' && wipeConfirmInput.trim().toUpperCase() !== 'CONFIRM') {
      toast.error('يرجى كتابة كلمة "مسح" في الحقل لتأكيد العملية');
      return;
    }

    setIsWiping(true);
    setWipeProgressMsg('جاري بدء مسح البيانات وإعادة التهيئة...');
    setWipePercent(5);

    try {
      const success = await wipeAllTenantData(currentBranch?.id, (msg, pct) => {
        setWipeProgressMsg(msg);
        setWipePercent(pct);
      });

      if (success) {
        setWipePercent(100);
        setWipeProgressMsg('تم المسح وإعادة التهيئة بنجاح 100%! جاري التحديث...');
        toast.success('تم مسح جميع البيانات وإعادة تهيئة النظام بنجاح 100%');
        try {
          localStorage.removeItem('cached_cart');
          localStorage.removeItem('cached_pos_state');
          localStorage.removeItem('held_sales');
        } catch {}
        setTimeout(() => {
          window.location.reload();
        }, 1500);
      } else {
        setIsWiping(false);
      }
    } catch (err: any) {
      console.error(err);
      toast.error('حدث خطأ أثناء مسح البيانات: ' + (err?.message || 'خطأ غير متوقع'));
      setIsWiping(false);
    }
  };

  const handleResetOrderCounter = async () => {
    if (!currentBranch?.id) return;
    if (window.confirm('هل أنت متأكد من رغبتك في تصفير عداد أرقام الطلبات؟ هذا يعني أن الطلب القادم سيبدأ من رقم 1. يرجى توخي الحذر لتجنب تكرار أرقام الطلبات لنفس اليوم.')) {
      setIsResettingCounter(true);
      try {
        await deleteDoc(doc(db, 'branch_counters', currentBranch.id));
        toast.success('تم تصفير عداد الأرقام بنجاح! الطلب القادم سيبدأ من رقم 1.');
      } catch (error) {
        console.error(error);
        toast.error('حدثت مشكلة أثناء تصفير العداد.');
      } finally {
        setIsResettingCounter(false);
      }
    }
  };

  return (
    <MainLayout title="الإعدادات" subtitle="إعدادات النظام والتفضيلات">
      <Tabs defaultValue="general" className="space-y-6">
        <TabsList className="flex-wrap h-auto gap-2 p-2">
          <TabsTrigger value="general" className="gap-2">
            <Settings2 className="w-4 h-4" />
            عام
          </TabsTrigger>
          <TabsTrigger value="branch" className="gap-2">
            <Building2 className="w-4 h-4" />
            الفرع
          </TabsTrigger>
          <TabsTrigger value="pos" className="gap-2">
            <Receipt className="w-4 h-4" />
            نقاط البيع
          </TabsTrigger>
          <TabsTrigger value="taxes" className="gap-2">
            <CreditCard className="w-4 h-4" />
            الضرائب والرسوم
          </TabsTrigger>
          <TabsTrigger value="security" className="gap-2">
            <Shield className="w-4 h-4" />
            الأمان والصلاحيات
          </TabsTrigger>
          <TabsTrigger value="appearance" className="gap-2">
            <Palette className="w-4 h-4" />
            المظهر
          </TabsTrigger>
          <TabsTrigger value="integrations" className="gap-2">
            <Database className="w-4 h-4" />
            قاعدة البيانات والتكاملات
          </TabsTrigger>
          <TabsTrigger value="units" className="gap-2">
            <Scale className="w-4 h-4" />
            الوحدات
          </TabsTrigger>
        </TabsList>

        {/* General Settings */}
        <TabsContent value="general" className="space-y-6">
          <div className="grid gap-6 md:grid-cols-2">
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Languages className="w-5 h-5" />
                  اللغة والتنسيق
                </CardTitle>
                <CardDescription>تخصيص طريقة عرض الأرقام والتاريخ عبر النظام</CardDescription>
              </CardHeader>
              <CardContent className="space-y-6">
                <div className="flex items-center justify-between">
                  <div>
                    <Label className="text-base">الأرقام العربية الهندية</Label>
                    <p className="text-sm text-muted-foreground">استخدام ١٢٣ بدلاً من 123 في العرض والتقارير</p>
                  </div>
                  <Switch
                    checked={settings.useArabicNumerals}
                    onCheckedChange={(checked) => updateSettings({ useArabicNumerals: checked })}
                  />
                </div>
                <Separator />
                <div className="flex items-center justify-between">
                  <div>
                    <Label className="text-base">التقويم الهجري</Label>
                    <p className="text-sm text-muted-foreground">عرض التواريخ بالتقويم الهجري في شاشات النظام</p>
                  </div>
                  <Switch
                    checked={settings.useHijriCalendar}
                    onCheckedChange={(checked) => updateSettings({ useHijriCalendar: checked })}
                  />
                </div>
                <Separator />
                <div className="space-y-2">
                  <Label>المنطقة الزمنية</Label>
                  <div className="flex items-center gap-2 p-3 bg-muted rounded-lg">
                    <Globe className="w-4 h-4 text-muted-foreground" />
                    <span>Africa/Cairo (توقيت جمهورية مصر العربية)</span>
                  </div>
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Building2 className="w-5 h-5" />
                  معلومات المؤسسة
                </CardTitle>
                <CardDescription>البيانات الرسمية للمؤسسة المستخدمة في الفواتير والتقارير</CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="space-y-2">
                  <Label>اسم المؤسسة (بالعربية)</Label>
                  <Input 
                    value={tenantName} 
                    onChange={(e) => setTenantName(e.target.value)} 
                    placeholder="مثال: مكتبة ألوان الحديثة"
                  />
                </div>
                <div className="space-y-2">
                  <Label>الاسم بالإنجليزية</Label>
                  <Input 
                    value={tenantNameEn} 
                    onChange={(e) => setTenantNameEn(e.target.value)} 
                    placeholder="مثال: Alwan Library & Books"
                  />
                </div>
                <div className="space-y-2">
                  <Label>الرقم الضريبي للمؤسسة</Label>
                  <Input 
                    value={tenantTaxNumber} 
                    onChange={(e) => setTenantTaxNumber(e.target.value)} 
                    placeholder="أدخل الرقم الضريبي للمؤسسة"
                  />
                </div>
              </CardContent>
            </Card>
          </div>
        </TabsContent>

        {/* Branch Settings */}
        <TabsContent value="branch" className="space-y-6">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Building2 className="w-5 h-5" />
                إعدادات الفرع الحالي
              </CardTitle>
              <CardDescription>
                <Badge variant="outline" className="mt-2">{currentBranch?.name || 'الفرع الرئيسي'}</Badge>
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-6">
              <div className="grid gap-4 md:grid-cols-2">
                <div className="space-y-2">
                  <Label>اسم الفرع</Label>
                  <Input 
                    value={branchName} 
                    onChange={(e) => setBranchName(e.target.value)} 
                    placeholder="اسم الفرع"
                  />
                </div>
                <div className="space-y-2">
                  <Label>رقم الهاتف</Label>
                  <div className="relative">
                    <Phone className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                    <Input 
                      value={branchPhone} 
                      onChange={(e) => setBranchPhone(e.target.value)} 
                      className="pr-10" 
                      placeholder="هاتف الفرع"
                    />
                  </div>
                </div>
                <div className="space-y-2 md:col-span-2">
                  <Label>العنوان</Label>
                  <div className="relative">
                    <MapPin className="absolute right-3 top-3 w-4 h-4 text-muted-foreground" />
                    <Input 
                      value={branchAddress} 
                      onChange={(e) => setBranchAddress(e.target.value)} 
                      className="pr-10" 
                      placeholder="عنوان الفرع بالتفصيل"
                    />
                  </div>
                </div>
              </div>
              <Separator />
              <div className="grid gap-4 md:grid-cols-2">
                <div className="space-y-2">
                  <Label className="flex items-center gap-2">
                    <Clock className="w-4 h-4" />
                    وقت الافتتاح
                  </Label>
                  <Input 
                    type="time" 
                    value={openingTime} 
                    onChange={(e) => setOpeningTime(e.target.value)} 
                  />
                </div>
                <div className="space-y-2">
                  <Label className="flex items-center gap-2">
                    <Clock className="w-4 h-4" />
                    وقت الإغلاق
                  </Label>
                  <Input 
                    type="time" 
                    value={closingTime} 
                    onChange={(e) => setClosingTime(e.target.value)} 
                  />
                </div>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        {/* POS Settings */}
        <TabsContent value="pos" className="space-y-6">
          <div className="grid gap-6 md:grid-cols-2">
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Receipt className="w-5 h-5" />
                  إعدادات فواتير وإيصالات البيع
                </CardTitle>
                <CardDescription>التحكم في خيارات الطباعة المباشرة عند تأكيد عمليات البيع</CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="flex items-center justify-between">
                  <div>
                    <Label>طباعة الإيصال تلقائياً</Label>
                    <p className="text-sm text-muted-foreground">فتح نافذة الطباعة فور إتمام عملية البيع</p>
                  </div>
                  <Switch 
                    checked={settings.autoPrintReceipt}
                    onCheckedChange={(checked) => updateSettings({ autoPrintReceipt: checked })}
                  />
                </div>
                <Separator />
                <div className="flex items-center justify-between">
                  <div>
                    <Label>طباعة نسخة إيصال التحضير/المخزن</Label>
                    <p className="text-sm text-muted-foreground">طباعة نسخة مخصصة لتجهيز الكتب واستلام الطلبات</p>
                  </div>
                  <Switch 
                    checked={settings.printKitchenTicket}
                    onCheckedChange={(checked) => updateSettings({ printKitchenTicket: checked })}
                  />
                </div>
                <Separator />
                <div className="space-y-2">
                  <Label>رسالة الترحيب والشكر بأسفل الإيصال</Label>
                  <Input 
                    value={settings.receiptWelcomeMessage}
                    onChange={(e) => updateSettings({ receiptWelcomeMessage: e.target.value })}
                    placeholder="شكراً لزيارتكم - نسعد دائماً بخدمتكم"
                  />
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Printer className="w-5 h-5" />
                  بيئة الطباعة وإدارة الأجهزة
                </CardTitle>
                <CardDescription>طريقة تشغيل الطابعات الحرارية وإدارة أرقام الطلبات</CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="p-4 bg-muted/60 rounded-lg space-y-2">
                  <div className="flex items-center justify-between">
                    <span className="font-medium text-sm">طباعة النظام الافتراضية</span>
                    <Badge variant="outline" className="gap-1 border-success text-success">
                      <CheckCircle className="w-3 h-3" />
                      نشطة عبر المتصفح
                    </Badge>
                  </div>
                  <p className="text-xs text-muted-foreground">
                    يعتمد النظام على مشغل الطباعة الحراري للنظام والمتصفح (58mm / 80mm).
                  </p>
                  <Button asChild variant="outline" size="sm" className="w-full mt-2 gap-2">
                    <Link to="/integrations">
                      <ExternalLink className="w-3.5 h-3.5" />
                      إدارة أجهزة وطابعات USB المباشرة من صفحة التكاملات
                    </Link>
                  </Button>
                </div>

                <div className="p-4 bg-destructive/5 rounded-lg border border-destructive/20 mt-4">
                  <h4 className="font-semibold text-destructive mb-2 flex items-center gap-2 text-sm">
                    <AlertTriangle className="w-4 h-4" /> تصفير عداد أرقام الطلبات
                  </h4>
                  <p className="text-xs text-muted-foreground mb-3">
                    سيتم مسح العداد التسلسلي لطلبات هذا الفرع لتبدأ الطلبات الجديدة التالية من رقم 1.
                  </p>
                  <Button 
                    variant="outline" 
                    size="sm"
                    className="w-full border-destructive/50 text-destructive hover:bg-destructive/10"
                    onClick={handleResetOrderCounter}
                    disabled={isResettingCounter}
                  >
                    {isResettingCounter ? 'جاري التصفير...' : 'إعادة ترقيم الطلبات للبدء من 1'}
                  </Button>
                </div>
              </CardContent>
            </Card>
          </div>

          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Receipt className="w-5 h-5" />
                بيانات الفاتورة المطبوعة للعميل
              </CardTitle>
              <CardDescription>البيانات والترويسة التي تظهر على الفاتورة المطبوعة للعميل</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid gap-4 md:grid-cols-2">
                <div className="space-y-2">
                  <Label>اسم المؤسسة / المكتبة بالفاتورة</Label>
                  <Input 
                    value={settings.invoiceCompanyName || ''} 
                    onChange={(e) => updateSettings({ invoiceCompanyName: e.target.value })} 
                    placeholder="اسم المكتبة بالفاتورة"
                  />
                </div>
                <div className="space-y-2">
                  <Label>رقم الهاتف بالفاتورة</Label>
                  <Input 
                    value={settings.invoicePhone || ''} 
                    onChange={(e) => updateSettings({ invoicePhone: e.target.value })} 
                    placeholder="رقم الهاتف للعملاء"
                  />
                </div>
                <div className="space-y-2">
                  <Label>العنوان بالفاتورة</Label>
                  <Input 
                    value={settings.invoiceAddress || ''} 
                    onChange={(e) => updateSettings({ invoiceAddress: e.target.value })} 
                    placeholder="عنوان المكتبة المطبوع"
                  />
                </div>
                <div className="space-y-2">
                  <Label>الرقم الضريبي بالفاتورة</Label>
                  <Input 
                    value={settings.invoiceTaxNumber || ''} 
                    onChange={(e) => updateSettings({ invoiceTaxNumber: e.target.value })} 
                    placeholder="الرقم الضريبي المطبوع"
                  />
                </div>
                <div className="space-y-3 md:col-span-2 border border-border p-4 rounded-xl bg-card">
                  <div className="flex items-center justify-between">
                    <div>
                      <Label className="text-sm font-bold">شعار الفاتورة المطبوعة (لوجو الفاتورة)</Label>
                      <p className="text-xs text-muted-foreground mt-0.5">
                        يمكنك وضع رابط مباشر للصورة من الإنترنت أو رفع ملف صورة من جهازك
                      </p>
                    </div>
                    {settings.invoiceLogo && (
                      <Button
                        type="button"
                        variant="ghost"
                        size="sm"
                        onClick={() => updateSettings({ invoiceLogo: '' })}
                        className="text-destructive hover:text-destructive hover:bg-destructive/10 text-xs h-8 gap-1"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                        حذف اللوجو
                      </Button>
                    )}
                  </div>

                  <div className="flex flex-col sm:flex-row gap-4 items-start sm:items-center">
                    {settings.invoiceLogo ? (
                      <div className="relative w-24 h-24 border border-border rounded-xl overflow-hidden bg-white/90 shrink-0 p-1 shadow-sm flex items-center justify-center">
                        <img 
                          src={settings.invoiceLogo} 
                          alt="Invoice Logo" 
                          className="max-w-full max-h-full object-contain filter grayscale" 
                          onError={(e) => {
                            (e.target as HTMLElement).style.display = 'none';
                          }}
                        />
                      </div>
                    ) : (
                      <div className="w-24 h-24 border border-dashed border-border rounded-xl flex flex-col items-center justify-center bg-muted/30 text-muted-foreground shrink-0 text-center p-2">
                        <ImageIcon className="w-7 h-7 mb-1 opacity-50" />
                        <span className="text-[10px]">بدون شعار</span>
                      </div>
                    )}

                    <div className="flex-1 space-y-3 w-full">
                      <div className="space-y-1">
                        <Label className="text-xs text-muted-foreground">رابط مباشر لصورة الشعار (Direct Image Link)</Label>
                        <Input
                          type="url"
                          placeholder="https://example.com/logo.png"
                          value={settings.invoiceLogo || ''}
                          onChange={(e) => updateSettings({ invoiceLogo: e.target.value })}
                          dir="ltr"
                          className="font-mono text-xs"
                        />
                      </div>

                      <div className="space-y-1">
                        <Label className="text-xs text-muted-foreground">أو ارفع ملف صورة من جهازك</Label>
                        <Input 
                          type="file" 
                          accept="image/*"
                          onChange={(e) => {
                            const file = e.target.files?.[0];
                            if (file) {
                              if (file.size > 1024 * 1024) {
                                toast.error('حجم الصورة كبير جداً. الحد الأقصى 1 ميجابايت');
                                return;
                              }
                              const reader = new FileReader();
                              reader.onloadend = () => {
                                updateSettings({ invoiceLogo: reader.result as string });
                                toast.success('تم تحميل الشعار بنجاح');
                              };
                              reader.readAsDataURL(file);
                            }
                          }}
                          className="text-xs" 
                        />
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Shield className="w-5 h-5" />
                حماية درج الكاشير
              </CardTitle>
              <CardDescription>التحكم في طلب رمز أمان عند فتح الدرج يدوياً</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="space-y-2 max-w-[400px]">
                <Label>كلمة مرور فتح الدرج يدوياً</Label>
                <div className="flex gap-2 relative">
                  <Input 
                    type={showDrawerPassword ? 'text' : 'password'}
                    placeholder="اترك الحقل فارغاً لتعطيل الحماية"
                    value={settings.openDrawerPassword || ''}
                    onChange={(e) => updateSettings({ openDrawerPassword: e.target.value })}
                    className="pr-10 text-left w-full direction-ltr"
                    dir="ltr"
                  />
                  <Button 
                    type="button" 
                    variant="ghost" 
                    size="icon" 
                    className="absolute right-1 top-1/2 -translate-y-1/2 h-8 w-8 hover:bg-transparent"
                    onClick={() => setShowDrawerPassword(!showDrawerPassword)}
                  >
                    {showDrawerPassword ? <EyeOff className="w-4 h-4 text-muted-foreground" /> : <Eye className="w-4 h-4 text-muted-foreground" />}
                  </Button>
                </div>
                <p className="text-xs text-muted-foreground">يُطلب هذا الرمز عند محاولة الكاشير فتح الدرج يدوياً من الشاشة دون إتمام عملية دفع</p>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        {/* Taxes Settings */}
        <TabsContent value="taxes" className="space-y-6">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <CreditCard className="w-5 h-5" />
                الضرائب والرسوم
              </CardTitle>
              <CardDescription>التحكم في تفعيل ونسب ضريبة القيمة المضافة ورسوم الخدمة للمؤسسة</CardDescription>
            </CardHeader>
            <CardContent className="space-y-6">
              {/* Main Toggles */}
              <div className="grid gap-6 md:grid-cols-2">
                <div className="p-4 border rounded-xl space-y-3 bg-muted/20">
                  <div className="flex items-center justify-between">
                    <div>
                      <Label className="font-bold">تفعيل ضريبة القيمة المضافة (VAT)</Label>
                      <p className="text-xs text-muted-foreground mt-0.5">
                        {settings.taxEnabled ? 'الضريبة مفعّلة وسيتم تطبيقها على المبيعات' : 'الضريبة معطلة تماماً ولن يتم فرض أي ضريبة على المبيعات'}
                      </p>
                    </div>
                    <Switch 
                      checked={Boolean(settings.taxEnabled)}
                      onCheckedChange={(checked) => updateSettings({ taxEnabled: checked })}
                    />
                  </div>
                  {settings.taxEnabled && (
                    <div className="pt-2 border-t space-y-2">
                      <Label className="text-xs">نسبة ضريبة القيمة المضافة (%)</Label>
                      <Input
                        type="number"
                        min="0"
                        max="100"
                        value={settings.taxRate}
                        onChange={(e) => updateSettings({ taxRate: Number(e.target.value) })}
                      />
                      <p className="text-[11px] text-muted-foreground">النسبة القانونية الشائعة في مصر: 14%</p>
                    </div>
                  )}
                </div>

                <div className="p-4 border rounded-xl space-y-3 bg-muted/20">
                  <div className="flex items-center justify-between">
                    <div>
                      <Label className="font-bold">تفعيل رسوم الخدمة (Service Charge)</Label>
                      <p className="text-xs text-muted-foreground mt-0.5">
                        {settings.serviceChargeEnabled ? 'رسوم الخدمة مفعّلة' : 'رسوم الخدمة معطلة ولن يتم فرض أي رسوم خدمة'}
                      </p>
                    </div>
                    <Switch 
                      checked={Boolean(settings.serviceChargeEnabled)}
                      onCheckedChange={(checked) => updateSettings({ serviceChargeEnabled: checked })}
                    />
                  </div>
                  {settings.serviceChargeEnabled && (
                    <div className="pt-2 border-t space-y-2">
                      <Label className="text-xs">نسبة رسوم الخدمة (%)</Label>
                      <Input
                        type="number"
                        min="0"
                        max="100"
                        value={settings.serviceChargeRate}
                        onChange={(e) => updateSettings({ serviceChargeRate: Number(e.target.value) })}
                      />
                      <p className="text-[11px] text-muted-foreground">النسبة الشائعة: 12%</p>
                    </div>
                  )}
                </div>
              </div>

              <Separator />

              <div className="flex items-center justify-between">
                <div>
                  <Label>الأسعار المعروضة شاملة ضريبة القيمة المضافة</Label>
                  <p className="text-sm text-muted-foreground">إذا تم التفعيل، يُعتبر سعر بيع الصنف شاملاً للضريبة دون زيادة السعر على العميل</p>
                </div>
                <Switch 
                  checked={settings.taxIncluded}
                  disabled={!settings.taxEnabled}
                  onCheckedChange={(checked) => updateSettings({ taxIncluded: checked })}
                />
              </div>

              <div className="flex items-center justify-between">
                <div>
                  <Label>الأسعار المعروضة شاملة رسوم الخدمة</Label>
                  <p className="text-sm text-muted-foreground">إذا تم التفعيل، تُعتبر رسوم الخدمة مستقطعة من السعر المعروض</p>
                </div>
                <Switch 
                  checked={settings.serviceChargeIncluded}
                  disabled={!settings.serviceChargeEnabled}
                  onCheckedChange={(checked) => updateSettings({ serviceChargeIncluded: checked })}
                />
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        {/* Security Settings */}
        <TabsContent value="security" className="space-y-6">
          <div className="grid gap-6 md:grid-cols-2">
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Users className="w-5 h-5" />
                  إدارة الأدوار والصلاحيات (RBAC)
                </CardTitle>
                <CardDescription>
                  التحكم في أدوار وصلاحيات الكاشير، المديرين، أمناء المكتبة، وفرق العمل
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <p className="text-sm text-muted-foreground">
                  تتم إدارة صلاحيات المستخدمين والموظفين والوصول إلى شاشات نقاط البيع، المخزون، الحضور، والرواتب عبر نظام الصلاحيات الموحد في صفحة الصلاحيات.
                </p>
                <div className="p-4 bg-muted rounded-lg flex items-center justify-between">
                  <div>
                    <p className="font-semibold text-sm">لوحة إدارة الصلاحيات المتقدمة</p>
                    <p className="text-xs text-muted-foreground">تعديل صلاحيات الأدوار وإضافة مستخدمين جدد</p>
                  </div>
                  <Button asChild variant="default" size="sm" className="gap-1.5">
                    <Link to="/permissions">
                      <Shield className="w-4 h-4" />
                      فتح شاشة الصلاحيات
                    </Link>
                  </Button>
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2 text-destructive">
                  <AlertTriangle className="w-5 h-5" />
                  منطقة الخطر وإعادة التهيئة
                </CardTitle>
                <CardDescription>إجراءات حساسة لا يمكن التراجع عنها</CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="p-4 bg-destructive/10 rounded-lg border border-destructive/20">
                  <h4 className="font-semibold text-destructive mb-2 text-sm">مسح بيانات المؤسسة وإعادة التهيئة</h4>
                  <p className="text-xs text-muted-foreground mb-4">
                    سيتم حذف الطلبات، الفواتير، العملاء، الأصناف، المخزون، والمصروفات والإحصائيات الخاصة بالمؤسسة والفرع مع الإبقاء على حساب الدخول الأساسي وإعادة تهيئة الوحدات والفرع الرئيسي.
                  </p>
                  <Button 
                    variant="destructive" 
                    className="w-full gap-2"
                    onClick={() => {
                      setWipeConfirmInput('');
                      setWipeProgressMsg('');
                      setWipePercent(0);
                      setShowWipeModal(true);
                    }}
                    disabled={isWiping}
                  >
                    <Trash2 className="w-4 h-4" />
                    {isWiping ? 'جاري المسح وإعادة التهيئة...' : 'مسح البيانات وإعادة التهيئة'}
                  </Button>
                </div>

                <Dialog open={showWipeModal} onOpenChange={(open) => !isWiping && setShowWipeModal(open)}>
                  <DialogContent className="sm:max-w-[520px]" dir="rtl">
                    <DialogHeader>
                      <DialogTitle className="flex items-center gap-2 text-destructive text-lg">
                        <AlertTriangle className="w-5 h-5 text-destructive" />
                        تأكيد مسح كافة البيانات وإعادة التهيئة (100%)
                      </DialogTitle>
                      <DialogDescription className="text-right text-xs text-muted-foreground pt-1 leading-relaxed">
                        تحذير شديد الخطورة: هذا الإجراء سيقوم بحذف جميع البيانات التشغيلية والمحاسبية والمخزنية الخاصة بالمؤسسة والفرع بشكل نهائي لا يمكن التراجع عنه.
                      </DialogDescription>
                    </DialogHeader>

                    <div className="space-y-3 py-2 text-xs text-right text-muted-foreground">
                      <div className="bg-destructive/10 p-3 rounded-md border border-destructive/20 text-destructive text-xs space-y-1">
                        <p className="font-bold">ما الذي سيتم حذفه وتصفيته بالكامل؟</p>
                        <ul className="list-disc list-inside space-y-0.5">
                          <li>جميع المنتجات والأصناف، التصنيفات، والماركات</li>
                          <li>فواتير المبيعات، المرتجعات، وحركات الكاشير</li>
                          <li>فواتير المشتريات، المصروفات، وأرصدة الموردين</li>
                          <li>بيانات العملاء، الموردين، والموظفين والحضور والرواتب</li>
                          <li>حركات المخزون، سجلات الجرد، والباركودات</li>
                          <li>الإحصائيات اليومية والشهرية وتصفير عداد الفواتير إلى رقم 1</li>
                        </ul>
                      </div>
                      <div className="p-2.5 bg-muted rounded-md text-xs space-y-1">
                        <p className="font-semibold text-foreground">
                          ما الذي سيتم الحفاظ عليه وإعادة تهيئته بأمان؟
                        </p>
                        <ul className="list-disc list-inside text-muted-foreground space-y-0.5">
                          <li>الحساب الرئيسي للمؤسسة وبيانات تسجيل الدخول.</li>
                          <li>الفرع الرئيسي كفرع أساسي مع تصفير عداد فواتيره.</li>
                          <li>إعادة تهيئة الوحدات القياسية تلقائيًا (قطعة، علبة، كرتونة، دستة، رزمة...).</li>
                        </ul>
                      </div>
                    </div>

                    {isWiping ? (
                      <div className="space-y-3 py-3">
                        <div className="flex justify-between text-xs text-muted-foreground font-medium">
                          <span>{wipeProgressMsg || 'جاري المسح وإعادة التهيئة...'}</span>
                          <span>{wipePercent}%</span>
                        </div>
                        <Progress value={wipePercent} className="h-2.5 w-full" />
                        <p className="text-center text-xs text-muted-foreground animate-pulse">
                          يرجى الانتظار وعدم إغلاق الصفحة أو المتصفح حتى اكتمال العملية...
                        </p>
                      </div>
                    ) : (
                      <div className="space-y-2 py-2">
                        <Label className="text-xs font-medium text-destructive">
                          لتأكيد المسح النهائي، اكتب كلمة <span className="font-bold underline text-sm">مسح</span> في الحقل أدناه:
                        </Label>
                        <Input 
                          value={wipeConfirmInput}
                          onChange={(e) => setWipeConfirmInput(e.target.value)}
                          placeholder='اكتب "مسح" للتأكيد'
                          className="text-center font-bold text-destructive border-destructive/50"
                          dir="rtl"
                          autoFocus
                        />
                      </div>
                    )}

                    <DialogFooter className="gap-2 sm:gap-0 pt-2">
                      <Button
                        variant="outline"
                        onClick={() => setShowWipeModal(false)}
                        disabled={isWiping}
                      >
                        إلغاء
                      </Button>
                      <Button
                        variant="destructive"
                        onClick={handleWipeData}
                        disabled={isWiping || wipeConfirmInput.trim() !== 'مسح'}
                        className="gap-2"
                      >
                        {isWiping ? (
                          <>
                            <Loader2 className="w-4 h-4 animate-spin" />
                            جاري المسح...
                          </>
                        ) : (
                          <>
                            <Trash2 className="w-4 h-4" />
                            تأكيد المسح وإعادة التهيئة
                          </>
                        )}
                      </Button>
                    </DialogFooter>
                  </DialogContent>
                </Dialog>
              </CardContent>
            </Card>
          </div>
        </TabsContent>

        {/* Appearance Settings */}
        <TabsContent value="appearance" className="space-y-6">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Palette className="w-5 h-5" />
                المظهر والألوان
              </CardTitle>
              <CardDescription>تخصيص السمة اللونية للواجهة</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="flex items-center justify-between">
                <div>
                  <Label>الوضع الداكن (Dark Mode)</Label>
                  <p className="text-sm text-muted-foreground">تفعيل المظهر الليلي الداكن للنظام</p>
                </div>
                <Switch 
                  checked={settings.darkMode}
                  onCheckedChange={(checked) => updateSettings({ darkMode: checked })}
                />
              </div>
              <Separator />
              <div className="space-y-2">
                <Label>اللون الرئيسي للنظام</Label>
                <div className="flex gap-2">
                  {['#1e3a5f', '#16a34a', '#dc2626', '#7c3aed', '#ea580c'].map((color) => (
                    <button
                      key={color}
                      type="button"
                      className={`w-10 h-10 rounded-lg border-2 transition-colors ${settings.primaryColor === color ? 'border-primary' : 'border-transparent hover:border-primary/50'}`}
                      style={{ backgroundColor: color }}
                      onClick={() => updateSettings({ primaryColor: color })}
                      title={color}
                    />
                  ))}
                </div>
              </div>
              <Separator />
              <div className="flex items-center justify-between">
                <div>
                  <Label>طي الشريط الجانبي</Label>
                  <p className="text-sm text-muted-foreground">تصغير الشريط الجانبي افتراضياً لتوسيع مساحة العمل</p>
                </div>
                <Switch 
                  checked={sidebarCollapsed}
                  onCheckedChange={setSidebarCollapsed}
                />
              </div>
            </CardContent>
          </Card>

          {/* Azkar Settings Card */}
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <BookOpen className="w-5 h-5 text-emerald-600" />
                أذكار المسلم
              </CardTitle>
              <CardDescription>عرض تذكيرات تسبيح وأذكار دورية لطيفة على الشاشة</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="flex items-center justify-between">
                <div>
                  <Label>تفعيل الأذكار التلقائية</Label>
                  <p className="text-sm text-muted-foreground">عرض نافذة ذكر وتسبيح دورياً</p>
                </div>
                <Switch 
                  checked={settings.azkarEnabled}
                  onCheckedChange={(checked) => updateSettings({ azkarEnabled: checked })}
                />
              </div>
              {settings.azkarEnabled && (
                <>
                  <Separator />
                  <div className="space-y-2">
                    <Label>تكرار الظهور (بالدقائق)</Label>
                    <div className="flex gap-2 w-full max-w-sm">
                      <div className="flex items-center gap-2 w-full">
                        <Input 
                          type="number"
                          min="1"
                          max="1440"
                          className="w-24 text-center"
                          value={settings.azkarInterval || 30}
                          onChange={(e) => updateSettings({ azkarInterval: Math.max(1, Number(e.target.value)) })}
                        />
                        <span className="text-sm text-muted-foreground">دقيقة</span>
                      </div>
                    </div>
                  </div>
                </>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        {/* Database & Integrations Hub */}
        <TabsContent value="integrations" className="space-y-6">
          <div className="grid gap-6 md:grid-cols-2">
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Database className="w-5 h-5 text-primary" />
                  قاعدة البيانات السحابية
                </CardTitle>
                <CardDescription>حالة الاتصال والبيانات التشغيلية</CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="p-4 bg-success/10 rounded-lg border border-success/30">
                  <div className="flex items-center gap-2 mb-1">
                    <CheckCircle className="w-5 h-5 text-success" />
                    <span className="font-semibold text-success">قاعدة البيانات متصلة</span>
                  </div>
                  <p className="text-xs text-muted-foreground">Firebase Cloud Firestore (Realtime Sync & Production Mode)</p>
                </div>
                <div className="space-y-2 text-sm">
                  <div className="flex justify-between py-1.5 border-b">
                    <span className="text-muted-foreground">المستأجر النشط:</span>
                    <span className="font-mono text-xs">{currentTenant?.name || 'MK'} ({currentTenant?.id || '-'})</span>
                  </div>
                  <div className="flex justify-between py-1.5 border-b">
                    <span className="text-muted-foreground">الفرع الحالي:</span>
                    <span className="font-medium text-xs">{currentBranch?.name || 'الفرع الرئيسي'}</span>
                  </div>
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <ExternalLink className="w-5 h-5 text-primary" />
                  مركز التكاملات وربط الأنظمة
                </CardTitle>
                <CardDescription>بوابات الدفع، تطبيقات التوصيل، والأجهزة الخارجية</CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <p className="text-sm text-muted-foreground">
                  تتم إدارة مفاتيح الـ API، أجهزة الـ USB Hardware، والتكاملات البرمجية الخارجية من خلال مركز التكاملات المخصص.
                </p>
                <Button asChild variant="outline" className="w-full gap-2 justify-between">
                  <Link to="/integrations">
                    <span>فتح مركز التكاملات الشامل (Integrations Hub)</span>
                    <ArrowRight className="w-4 h-4" />
                  </Link>
                </Button>
              </CardContent>
            </Card>
          </div>
        </TabsContent>

        {/* Units Settings */}
        <TabsContent value="units" className="space-y-6">
          <Card>
            <CardHeader className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
              <div>
                <CardTitle className="flex items-center gap-2">
                  <Scale className="w-5 h-5" />
                  وحدات القياس
                </CardTitle>
                <CardDescription>إدارة وحدات القياس المستخدمة في المخزون والوصفات</CardDescription>
              </div>
              <div className="flex flex-wrap gap-2 w-full sm:w-auto">
                <Button variant="outline" size="sm" onClick={async () => await seedStandardUnits()}>
                  استعادة الوحدات الافتراضية
                </Button>
                <Button size="sm" onClick={() => setNewUnitMode(true)}>
                  إضافة وحدة
                </Button>
              </div>
            </CardHeader>
            <CardContent className="space-y-4">
              {newUnitMode && (
                <div className="p-4 bg-muted rounded-lg flex flex-col sm:flex-row items-stretch sm:items-end gap-2 mb-4">
                  <div className="space-y-2 flex-1">
                    <Label>اسم الوحدة</Label>
                    <Input value={newUnit.name} onChange={e => setNewUnit({...newUnit, name: e.target.value})} placeholder="مثال: كيلوجرام" />
                  </div>
                  <div className="space-y-2 flex-1">
                    <Label>الاختصار</Label>
                    <Input value={newUnit.abbreviation} onChange={e => setNewUnit({...newUnit, abbreviation: e.target.value})} placeholder="مثال: كجم" />
                  </div>
                  <div className="space-y-2 flex-1">
                    <Label>النوع</Label>
                    <select 
                      className="flex h-10 w-full items-center justify-between rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50"
                      value={newUnit.type} 
                      onChange={e => setNewUnit({...newUnit, type: e.target.value})}
                    >
                      <option value="weight">وزن</option>
                      <option value="volume">حجم</option>
                      <option value="count">عدد/كمية</option>
                      <option value="length">طول</option>
                    </select>
                  </div>
                  <div className="flex items-center gap-2 pt-2 sm:pt-0">
                    <Button className="flex-1 sm:flex-none" onClick={async () => {
                      if(!newUnit.name || !newUnit.abbreviation) return toast.error('يرجى تعبئة الحقول المطلوبة');
                      if(await addUnit(newUnit)) {
                        setNewUnitMode(false);
                        setNewUnit({ name: '', abbreviation: '', type: 'count' });
                      }
                    }}>
                      حفظ
                    </Button>
                    <Button className="flex-1 sm:flex-none" variant="ghost" onClick={() => setNewUnitMode(false)}>
                      إلغاء
                    </Button>
                  </div>
                </div>
              )}
              
              <div className="rounded-md border overflow-x-auto">
                <table className="w-full text-sm text-right">
                  <thead className="bg-muted/50 border-b">
                    <tr>
                      <th className="p-3 font-medium">اسم الوحدة</th>
                      <th className="p-3 font-medium">الاختصار</th>
                      <th className="p-3 font-medium">النوع</th>
                      <th className="p-3 font-medium w-[100px]">إجراءات</th>
                    </tr>
                  </thead>
                  <tbody>
                    {units.map((unit: any) => (
                      <tr key={unit.id} className="border-b last:border-0">
                        <td className="p-3">{unit.name}</td>
                        <td className="p-3">{unit.abbreviation}</td>
                        <td className="p-3">
                          <Badge variant="outline">
                            {unit.type === 'weight' ? 'وزن' : unit.type === 'volume' ? 'حجم' : unit.type === 'length' ? 'طول' : 'عدد/كمية'}
                          </Badge>
                        </td>
                        <td className="p-3">
                          <Button variant="ghost" size="sm" className="text-destructive h-8 px-2 w-full" onClick={() => {
                            if(window.confirm('هل أنت متأكد من حذف هذه الوحدة؟')) removeUnit(unit.id);
                          }}>
                            حذف
                          </Button>
                        </td>
                      </tr>
                    ))}
                    {units.length === 0 && (
                      <tr>
                        <td colSpan={4} className="p-4 text-center text-muted-foreground">
                          لا توجد وحدات مضافة بعد
                        </td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        {/* Save Button */}
        <div className="flex justify-end pt-4 border-t">
          <Button onClick={handleSave} disabled={isSaving} className="gap-2 w-full sm:w-auto sm:min-w-[160px]">
            {isSaving ? (
              <>
                <Loader2 className="w-4 h-4 animate-spin" />
                جاري الحفظ...
              </>
            ) : (
              <>
                <Save className="w-4 h-4" />
                حفظ جميع الإعدادات
              </>
            )}
          </Button>
        </div>
      </Tabs>
    </MainLayout>
  );
}
