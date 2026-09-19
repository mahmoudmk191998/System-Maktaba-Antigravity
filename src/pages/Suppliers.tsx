import React, { useState, useMemo } from 'react';
import { MainLayout } from '@/components/layout';
import { useSuppliers } from '@/hooks/retail/useSuppliers';
import { useAppStore } from '@/lib/store';
import { useFormatters } from '@/lib/formatters';
import { useUserPermissions } from '@/hooks/usePermissions';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from '@/components/ui/dialog';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  Users,
  Plus,
  Edit,
  Archive,
  Search,
  Building2,
  Phone,
  Mail,
  FileText,
  DollarSign,
  BookOpen,
  Calendar,
  AlertTriangle,
  CreditCard,
  Briefcase,
  Layers,
  RotateCcw,
  ArchiveRestore,
} from 'lucide-react';
import type { Supplier, SupplierType } from '@/types/retail.types';
import { SupplierPaymentModal } from '@/components/retail/purchasing/SupplierPaymentModal';
import { SupplierLedgerDrawer } from '@/components/retail/purchasing/SupplierLedgerDrawer';
import { toast } from 'sonner';

const SUPPLIER_TYPES: { id: SupplierType; label: string }[] = [
  { id: 'book_publisher', label: 'دار نشر كتب' },
  { id: 'book_distributor', label: 'موزع كتب ومراجع' },
  { id: 'stationery_supplier', label: 'مورد أدوات مكتبية' },
  { id: 'school_supplies_supplier', label: 'مورد أدوات مدرسية وكشاكيل' },
  { id: 'office_supplies_supplier', label: 'مورد مستلزمات مكاتب وأوراق' },
  { id: 'general_supplier', label: 'مورد عام وتجاري' },
  { id: 'manufacturer', label: 'مصنع / منتج محلي' },
  { id: 'other', label: 'أخرى' },
];

export default function Suppliers() {
  const { number } = useFormatters();
  const currentUser = useAppStore((state) => state.currentUser);
  const { hasPermission, isAdmin } = useUserPermissions();

  const canManage = isAdmin || hasPermission('suppliers.manage') || hasPermission('suppliers.create');
  const canPay = isAdmin || hasPermission('suppliers.pay') || hasPermission('supplier_payments.create');

  const {
    suppliers,
    loading,
    hasMore,
    loadMore,
    refresh,
    addSupplier,
    editSupplier,
    archiveSupplierById,
    restoreSupplierById,
    paySupplier,
  } = useSuppliers();

  // Search & Filters
  const [searchQuery, setSearchQuery] = useState('');
  const [filterType, setFilterType] = useState('all');
  const [viewMode, setViewMode] = useState<'active' | 'archived'>('active');

  // Modals & Drawers
  const [isAddModalOpen, setIsAddModalOpen] = useState(false);
  const [editingSupplier, setEditingSupplier] = useState<Supplier | null>(null);

  const [payingSupplier, setPayingSupplier] = useState<Supplier | null>(null);
  const [isPaymentOpen, setIsPaymentOpen] = useState(false);

  const [ledgerSupplier, setLedgerSupplier] = useState<Supplier | null>(null);
  const [isLedgerOpen, setIsLedgerOpen] = useState(false);

  // Form State
  const [formData, setFormData] = useState<{
    name: string;
    companyName: string;
    supplierType: SupplierType;
    phone: string;
    phone2: string;
    email: string;
    address: string;
    taxNumber: string;
    commercialRegistration: string;
    contactPerson: string;
    paymentTermsDays: number;
    creditLimit: number;
    openingBalance: number;
    notes: string;
  }>({
    name: '',
    companyName: '',
    supplierType: 'book_publisher',
    phone: '',
    phone2: '',
    email: '',
    address: '',
    taxNumber: '',
    commercialRegistration: '',
    contactPerson: '',
    paymentTermsDays: 30,
    creditLimit: 0,
    openingBalance: 0,
    notes: '',
  });

  const resetForm = () => {
    setFormData({
      name: '',
      companyName: '',
      supplierType: 'book_publisher',
      phone: '',
      phone2: '',
      email: '',
      address: '',
      taxNumber: '',
      commercialRegistration: '',
      contactPerson: '',
      paymentTermsDays: 30,
      creditLimit: 0,
      openingBalance: 0,
      notes: '',
    });
    setEditingSupplier(null);
  };

  const handleOpenAdd = () => {
    resetForm();
    setIsAddModalOpen(true);
  };

  const handleOpenEdit = (supplier: Supplier) => {
    setEditingSupplier(supplier);
    setFormData({
      name: supplier.name,
      companyName: supplier.companyName || '',
      supplierType: supplier.supplierType || 'general_supplier',
      phone: supplier.phone,
      phone2: supplier.phone2 || '',
      email: supplier.email || '',
      address: supplier.address || '',
      taxNumber: supplier.taxNumber || '',
      commercialRegistration: supplier.commercialRegistration || '',
      contactPerson: supplier.contactPerson || '',
      paymentTermsDays: supplier.paymentTermsDays || 30,
      creditLimit: supplier.creditLimit || 0,
      openingBalance: supplier.openingBalance || 0,
      notes: supplier.notes || '',
    });
    setIsAddModalOpen(true);
  };

  const handleSaveSupplier = async () => {
    if (!formData.name.trim() || !formData.phone.trim()) {
      toast.error('اسم المورد ورقم الهاتف حقول إلزامية');
      return;
    }

    try {
      if (editingSupplier) {
        await editSupplier(editingSupplier.id, {
          ...formData,
          updatedBy: currentUser?.name || 'مدير النظام',
        });
        toast.success(`تم تحديث بيانات المورد ${formData.name}`);
      } else {
        const newSup = await addSupplier({
          ...formData,
          createdBy: currentUser?.name || 'مدير النظام',
        });
        toast.success(`تمت إضافة المورد بنجاح بكود: ${newSup.supplierCode}`);
      }
      setIsAddModalOpen(false);
      resetForm();
    } catch (err: any) {
      toast.error(err.message || 'فشل حفظ بيانات المورد');
    }
  };

  const handleArchive = async (supplier: Supplier) => {
    if (confirm(`هل أنت متأكد من رغبتك في أرشفة المورد "${supplier.name}"؟ سيبقى ظاهراً في الفواتير القديمة ولن يمكن عمل أوامر شراء جديدة له.`)) {
      try {
        await archiveSupplierById(supplier.id, currentUser?.name || 'مدير النظام');
        toast.success(`تمت أرشفة المورد ${supplier.name} ونقله إلى الأرشيف`);
      } catch (err: any) {
        toast.error(err.message || 'فشلت أرشفة المورد');
      }
    }
  };

  const handleRestore = async (supplier: Supplier) => {
    if (confirm(`هل ترغب في استرجاع المورد "${supplier.name}" إلى قائمة الموردين النشطين؟`)) {
      try {
        await restoreSupplierById(supplier.id, currentUser?.name || 'مدير النظام');
        toast.success(`تم استرجاع المورد "${supplier.name}" بنجاح إلى الموردين النشطين`);
      } catch (err: any) {
        toast.error(err.message || 'فشل استرجاع المورد');
      }
    }
  };

  // Filtered Suppliers
  const filteredSuppliers = useMemo(() => {
    return suppliers.filter((sup) => {
      if (viewMode === 'active' && sup.archived) return false;
      if (viewMode === 'archived' && !sup.archived) return false;
      const q = searchQuery.toLowerCase().trim();
      const matchesQuery =
        !q ||
        sup.name.toLowerCase().includes(q) ||
        sup.supplierCode.toLowerCase().includes(q) ||
        (sup.companyName && sup.companyName.toLowerCase().includes(q)) ||
        (sup.phone && sup.phone.includes(q)) ||
        (sup.contactPerson && sup.contactPerson.toLowerCase().includes(q));

      const matchesType = filterType === 'all' || sup.supplierType === filterType;
      return matchesQuery && matchesType;
    });
  }, [suppliers, searchQuery, filterType, viewMode]);

  // KPIs
  const kpis = useMemo(() => {
    let totalPayables = 0;
    let payablesCount = 0;
    let publishersCount = 0;

    suppliers.forEach((s) => {
      if (!s.archived) {
        const bal = Number(s.currentBalance || 0);
        if (bal > 0) {
          totalPayables += bal;
          payablesCount++;
        }
        if (s.supplierType === 'book_publisher' || s.supplierType === 'book_distributor') {
          publishersCount++;
        }
      }
    });

    return {
      totalCount: suppliers.filter((s) => !s.archived).length,
      totalPayables,
      payablesCount,
      publishersCount,
    };
  }, [suppliers]);

  return (
    <MainLayout
      title="الموردين ودور النشر (Suppliers & Publishers)"
      subtitle="سجل الموردين ودور النشر، كشوف الحسابات الجارية، وسندات صرف ودفعات الحساب"
      actions={
        canManage && (
          <Button onClick={handleOpenAdd} className="gap-2 font-bold text-xs sm:text-sm shadow-sm">
            <Plus className="w-4 h-4" />
            <span>إضافة مورد / دار نشر</span>
          </Button>
        )
      }
    >
      <div className="space-y-6 max-w-7xl mx-auto" dir="rtl">

      {/* KPI Cards */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-4">
        <div className="p-4 rounded-2xl bg-card border border-border shadow-sm flex items-center gap-3">
          <div className="p-3 rounded-xl bg-primary/10 text-primary">
            <Building2 className="w-5 h-5" />
          </div>
          <div>
            <span className="text-xs text-muted-foreground block">إجمالي الموردين النشطين</span>
            <span className="text-xl font-black text-foreground">{number(kpis.totalCount)}</span>
          </div>
        </div>

        <div className="p-4 rounded-2xl bg-card border border-border shadow-sm flex items-center gap-3">
          <div className="p-3 rounded-xl bg-amber-500/10 text-amber-600">
            <BookOpen className="w-5 h-5" />
          </div>
          <div>
            <span className="text-xs text-muted-foreground block">دور نشر وموزعي كتب</span>
            <span className="text-xl font-black text-amber-600">{number(kpis.publishersCount)}</span>
          </div>
        </div>

        <div className="p-4 rounded-2xl bg-card border border-border shadow-sm flex items-center gap-3">
          <div className="p-3 rounded-xl bg-destructive/10 text-destructive">
            <DollarSign className="w-5 h-5" />
          </div>
          <div>
            <span className="text-xs text-muted-foreground block">إجمالي المديونية المستحقة</span>
            <span className="text-xl font-black text-destructive">{number(kpis.totalPayables)} ج.م</span>
          </div>
        </div>

        <div className="p-4 rounded-2xl bg-card border border-border shadow-sm flex items-center gap-3">
          <div className="p-3 rounded-xl bg-blue-500/10 text-blue-600">
            <CreditCard className="w-5 h-5" />
          </div>
          <div>
            <span className="text-xs text-muted-foreground block">موردين لديهم مستحقات</span>
            <span className="text-xl font-black text-blue-600">{number(kpis.payablesCount)}</span>
          </div>
        </div>
      </div>

      {/* Search and Filters */}
      <div className="p-3 sm:p-4 rounded-2xl bg-card border border-border shadow-sm flex flex-col md:flex-row gap-3 items-center justify-between">
        <div className="relative w-full md:w-96">
          <Search className="w-4 h-4 absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
          <Input
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="ابحث بالاسم، كود المورد، دار النشر، الهاتف، السجل..."
            className="pr-9 text-xs h-9"
          />
        </div>

        <div className="flex flex-wrap items-center gap-2 w-full md:w-auto">
          <Select value={filterType} onValueChange={setFilterType}>
            <SelectTrigger className="h-9 text-xs w-48">
              <SelectValue placeholder="نوع المورد" />
            </SelectTrigger>
            <SelectContent dir="rtl">
              <SelectItem value="all">كل التصنيفات والأنواع</SelectItem>
              {SUPPLIER_TYPES.map((t) => (
                <SelectItem key={t.id} value={t.id}>
                  {t.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </div>

      {/* Tabs: Active Suppliers vs Archive */}
      <div className="flex items-center gap-2 border-b border-border">
        <button
          onClick={() => setViewMode('active')}
          className={`pb-3 px-4 text-xs sm:text-sm font-bold border-b-2 transition-all flex items-center gap-2 ${
            viewMode === 'active'
              ? 'border-primary text-primary'
              : 'border-transparent text-muted-foreground hover:text-foreground'
          }`}
        >
          <Building2 className="w-4 h-4" />
          <span>الموردين النشطين</span>
          <Badge variant={viewMode === 'active' ? 'default' : 'secondary'} className="text-[10px] px-1.5 py-0 h-4 font-mono">
            {suppliers.filter((s) => !s.archived).length}
          </Badge>
        </button>

        <button
          onClick={() => setViewMode('archived')}
          className={`pb-3 px-4 text-xs sm:text-sm font-bold border-b-2 transition-all flex items-center gap-2 ${
            viewMode === 'archived'
              ? 'border-primary text-primary'
              : 'border-transparent text-muted-foreground hover:text-foreground'
          }`}
        >
          <Archive className="w-4 h-4" />
          <span>الأرشيف (الموردين المؤرشفين)</span>
          <Badge
            variant={viewMode === 'archived' ? 'default' : 'secondary'}
            className="text-[10px] px-1.5 py-0 h-4 font-mono"
          >
            {suppliers.filter((s) => s.archived).length}
          </Badge>
        </button>
      </div>

      {/* Suppliers Table */}
      <div className="border border-border rounded-2xl overflow-hidden bg-card shadow-sm">
        {filteredSuppliers.length === 0 ? (
          <div className="py-16 text-center text-muted-foreground space-y-3">
            <div className="p-4 rounded-full bg-muted/60 w-16 h-16 mx-auto flex items-center justify-center">
              {viewMode === 'archived' ? (
                <Archive className="w-8 h-8 text-muted-foreground/60" />
              ) : (
                <Users className="w-8 h-8 text-muted-foreground/60" />
              )}
            </div>
            <div className="text-sm font-bold text-foreground">
              {viewMode === 'archived' ? 'لا يوجد موردين في الأرشيف حالياً' : 'لا يوجد موردين مطابقين للبحث'}
            </div>
            {viewMode === 'archived' && (
              <p className="text-xs text-muted-foreground">
                عند أرشفة أي مورد سيظهر هنا ويمكنك استرجاعه إلى قائمة الموردين النشطين في أي وقت.
              </p>
            )}
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-right text-xs">
              <thead className="bg-muted/50 border-b border-border text-muted-foreground font-bold select-none">
                <tr>
                  <th className="p-3.5">الكود</th>
                  <th className="p-3.5">اسم المورد / دار النشر</th>
                  <th className="p-3.5">النوع</th>
                  <th className="p-3.5">الهاتف وجهة الاتصال</th>
                  <th className="p-3.5">شروط السداد</th>
                  <th className="p-3.5 text-left">الرصيد المستحق</th>
                  <th className="p-3.5 text-center">الإجراءات</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {filteredSuppliers.map((sup) => {
                  const balance = Number(sup.currentBalance || 0);
                  const typeLabel = SUPPLIER_TYPES.find((t) => t.id === sup.supplierType)?.label || sup.supplierType;

                  return (
                    <tr key={sup.id} className="hover:bg-muted/40 transition-colors">
                      <td className="p-3.5 font-bold font-mono text-primary flex items-center gap-1.5">
                        <Building2 className="w-3.5 h-3.5 text-muted-foreground" />
                        <span>{sup.supplierCode}</span>
                      </td>
                      <td className="p-3.5">
                        <div className="font-bold text-sm text-foreground flex items-center gap-2">
                          <span>{sup.name}</span>
                          {sup.archived && (
                            <Badge variant="outline" className="text-[10px] bg-amber-500/10 text-amber-600 border-amber-300">
                              مؤرشف
                            </Badge>
                          )}
                        </div>
                        {sup.companyName && (
                          <div className="text-[10px] text-muted-foreground">{sup.companyName}</div>
                        )}
                      </td>
                      <td className="p-3.5">
                        <Badge variant="outline" className="text-[10px]">
                          {typeLabel}
                        </Badge>
                      </td>
                      <td className="p-3.5 text-muted-foreground">
                        <div className="font-mono text-foreground">{sup.phone}</div>
                        {sup.contactPerson && (
                          <div className="text-[10px]">{sup.contactPerson}</div>
                        )}
                      </td>
                      <td className="p-3.5 text-muted-foreground">
                        {sup.paymentTermsDays || 30} يوماً
                      </td>
                      <td className="p-3.5 text-left font-bold text-sm">
                        <span className={balance > 0 ? 'text-destructive font-black' : balance === 0 ? 'text-muted-foreground' : 'text-emerald-600'}>
                          {number(balance)} ج.م
                        </span>
                      </td>
                      <td className="p-3.5 text-center">
                        <div className="flex items-center justify-center gap-1.5">
                          {/* Statement / Ledger */}
                          <Button
                            size="sm"
                            variant="outline"
                            className="h-7 px-2.5 text-xs gap-1 text-primary"
                            onClick={() => {
                              setLedgerSupplier(sup);
                              setIsLedgerOpen(true);
                            }}
                            title="عرض كشف الحساب والقيود"
                          >
                            <FileText className="w-3.5 h-3.5" />
                            كشف حساب
                          </Button>

                          {/* Actions for Active Suppliers */}
                          {viewMode === 'active' && (
                            <>
                              {/* Payment */}
                              {canPay && (
                                <Button
                                  size="sm"
                                  className="h-7 px-2.5 text-xs gap-1 bg-emerald-600 hover:bg-emerald-700 text-white font-bold"
                                  onClick={() => {
                                    setPayingSupplier(sup);
                                    setIsPaymentOpen(true);
                                  }}
                                  title="سداد دفعة للمورد"
                                >
                                  <DollarSign className="w-3.5 h-3.5" />
                                  سداد دفعة
                                </Button>
                              )}

                              {/* Edit */}
                              {canManage && (
                                <Button
                                  size="sm"
                                  variant="ghost"
                                  className="h-7 w-7 p-0"
                                  onClick={() => handleOpenEdit(sup)}
                                  title="تعديل"
                                >
                                  <Edit className="w-3.5 h-3.5 text-muted-foreground" />
                                </Button>
                              )}

                              {/* Archive */}
                              {canManage && (
                                <Button
                                  size="sm"
                                  variant="ghost"
                                  className="h-7 w-7 p-0 text-destructive hover:bg-destructive/10"
                                  onClick={() => handleArchive(sup)}
                                  title="أرشفة"
                                >
                                  <Archive className="w-3.5 h-3.5" />
                                </Button>
                              )}
                            </>
                          )}

                          {/* Actions for Archived Suppliers */}
                          {viewMode === 'archived' && canManage && (
                            <Button
                              size="sm"
                              className="h-7 px-2.5 text-xs gap-1.5 bg-primary hover:bg-primary/90 text-primary-foreground font-bold"
                              onClick={() => handleRestore(sup)}
                              title="استرجاع المورد إلى قائمة النشطين"
                            >
                              <RotateCcw className="w-3.5 h-3.5" />
                              استرجاع المورد
                            </Button>
                          )}
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Add / Edit Supplier Modal */}
      <Dialog open={isAddModalOpen} onOpenChange={setIsAddModalOpen}>
        <DialogContent className="max-w-xl max-h-[90vh] overflow-y-auto" dir="rtl">
          <DialogHeader className="border-b border-border pb-3">
            <DialogTitle className="text-lg font-bold">
              {editingSupplier ? `تعديل بيانات المورد: ${editingSupplier.name}` : 'إضافة مورد / دار نشر جديدة'}
            </DialogTitle>
            <DialogDescription className="text-xs text-muted-foreground">
              تسجيل بيانات التواصل والشروط التجارية وحسابات التوريد
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4 py-2 text-xs">
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1">
                <Label className="text-xs font-bold block">اسم المورد / دار النشر *</Label>
                <Input
                  value={formData.name}
                  onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                  placeholder="مثال: دار الشروق للنشر..."
                  className="h-9 text-xs"
                />
              </div>

              <div className="space-y-1">
                <Label className="text-xs font-bold block">اسم الشركة التجاري</Label>
                <Input
                  value={formData.companyName}
                  onChange={(e) => setFormData({ ...formData, companyName: e.target.value })}
                  placeholder="الاسم المسجل..."
                  className="h-9 text-xs"
                />
              </div>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1">
                <Label className="text-xs font-bold block">نوع المورد</Label>
                <Select
                  value={formData.supplierType}
                  onValueChange={(val: any) => setFormData({ ...formData, supplierType: val })}
                >
                  <SelectTrigger className="h-9 text-xs">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent dir="rtl">
                    {SUPPLIER_TYPES.map((t) => (
                      <SelectItem key={t.id} value={t.id}>
                        {t.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-1">
                <Label className="text-xs font-bold block">رقم الهاتف الأساسي *</Label>
                <Input
                  value={formData.phone}
                  onChange={(e) => setFormData({ ...formData, phone: e.target.value })}
                  placeholder="010..."
                  className="h-9 text-xs font-mono"
                />
              </div>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1">
                <Label className="text-[11px] text-muted-foreground block">هاتف إضافي / واتساب</Label>
                <Input
                  value={formData.phone2}
                  onChange={(e) => setFormData({ ...formData, phone2: e.target.value })}
                  placeholder="012..."
                  className="h-9 text-xs font-mono"
                />
              </div>

              <div className="space-y-1">
                <Label className="text-[11px] text-muted-foreground block">البريد الإلكتروني</Label>
                <Input
                  type="email"
                  value={formData.email}
                  onChange={(e) => setFormData({ ...formData, email: e.target.value })}
                  placeholder="sales@publisher.com"
                  className="h-9 text-xs"
                />
              </div>
            </div>

            <div className="grid grid-cols-3 gap-3">
              <div className="space-y-1">
                <Label className="text-[11px] font-semibold block">المسؤول / مندوب التوريد</Label>
                <Input
                  value={formData.contactPerson}
                  onChange={(e) => setFormData({ ...formData, contactPerson: e.target.value })}
                  placeholder="اسم الشخص المسؤول..."
                  className="h-9 text-xs"
                />
              </div>

              <div className="space-y-1">
                <Label className="text-[11px] font-semibold block">فترة السداد (أيام)</Label>
                <Input
                  type="number"
                  min={0}
                  value={formData.paymentTermsDays}
                  onChange={(e) => setFormData({ ...formData, paymentTermsDays: Number(e.target.value) || 0 })}
                  className="h-9 text-xs"
                />
              </div>

              {!editingSupplier && (
                <div className="space-y-1">
                  <Label className="text-[11px] font-semibold block">رصيد افتتاحي (ج.م)</Label>
                  <Input
                    type="number"
                    value={formData.openingBalance}
                    onChange={(e) => setFormData({ ...formData, openingBalance: Number(e.target.value) || 0 })}
                    className="h-9 text-xs"
                  />
                </div>
              )}
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1">
                <Label className="text-[11px] text-muted-foreground block">الرقم الضريبي</Label>
                <Input
                  value={formData.taxNumber}
                  onChange={(e) => setFormData({ ...formData, taxNumber: e.target.value })}
                  className="h-8 text-xs font-mono"
                />
              </div>

              <div className="space-y-1">
                <Label className="text-[11px] text-muted-foreground block">السجل التجاري</Label>
                <Input
                  value={formData.commercialRegistration}
                  onChange={(e) => setFormData({ ...formData, commercialRegistration: e.target.value })}
                  className="h-8 text-xs font-mono"
                />
              </div>
            </div>

            <div className="space-y-1">
              <Label className="text-[11px] text-muted-foreground block">العنوان / المخزن الرئيسي</Label>
              <Input
                value={formData.address}
                onChange={(e) => setFormData({ ...formData, address: e.target.value })}
                placeholder="المدينة، الحي، الشارع..."
                className="h-8 text-xs"
              />
            </div>
          </div>

          <DialogFooter className="border-t border-border pt-3 flex items-center justify-between">
            <Button variant="outline" size="sm" onClick={() => setIsAddModalOpen(false)}>
              إلغاء
            </Button>
            <Button size="sm" onClick={handleSaveSupplier} className="font-bold px-6">
              {editingSupplier ? 'تحديث البيانات' : 'حفظ المورد'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Payment Modal */}
      <SupplierPaymentModal
        open={isPaymentOpen}
        onOpenChange={setIsPaymentOpen}
        supplier={payingSupplier}
        onPay={paySupplier}
        onSuccess={() => refresh()}
      />

      {/* Ledger Statement Drawer */}
      <SupplierLedgerDrawer
        open={isLedgerOpen}
        onOpenChange={setIsLedgerOpen}
        supplier={ledgerSupplier}
      />
      </div>
    </MainLayout>
  );
}
