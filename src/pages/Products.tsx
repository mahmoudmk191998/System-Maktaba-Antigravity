/**
 * Retail Product Catalog Management Page
 * Multi-Branch Bookstore & Stationery Retail Management System
 */

import React, { useState, useMemo } from 'react';
import { MainLayout } from '@/components/layout/MainLayout';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  Table,
  TableHeader,
  TableRow,
  TableHead,
  TableBody,
  TableCell,
} from '@/components/ui/table';
import {
  Package,
  Plus,
  Search,
  ScanBarcode,
  FolderTree,
  Award,
  Printer,
  Edit2,
  Archive,
  RotateCcw,
  Eye,
  Filter,
  Layers,
  BookOpen,
  ArrowUpDown,
} from 'lucide-react';
import { useProducts } from '@/hooks/retail/useProducts';
import { useCategories } from '@/hooks/retail/useCategories';
import { useBrands } from '@/hooks/retail/useBrands';
import { useUserPermissions } from '@/hooks/usePermissions';
import type { Product, ProductVariant, ProductType } from '@/types/retail.types';
import { ProductFormDialog } from '@/components/retail/ProductFormDialog';
import { ProductDetailsDrawer } from '@/components/retail/ProductDetailsDrawer';
import { BarcodePrintDialog } from '@/components/retail/BarcodePrintDialog';
import { BarcodeScanDialog } from '@/components/retail/BarcodeScanDialog';
import { CategoryManageDialog } from '@/components/retail/CategoryManageDialog';
import { BrandManageDialog } from '@/components/retail/BrandManageDialog';
import { useTenantBranch } from '@/hooks/useDatabase';
import { toast } from 'sonner';

export default function ProductsPage() {
  useTenantBranch();
  const { hasPermission, isAdmin } = useUserPermissions();

  const canCreate = isAdmin || hasPermission('products.create');
  const canEdit = isAdmin || hasPermission('products.edit');
  const canArchive = isAdmin || hasPermission('products.archive') || hasPermission('products.delete');
  const canManageCategories = isAdmin || hasPermission('categories.manage');
  const canManageBrands = isAdmin || hasPermission('brands.manage');

  const { categories } = useCategories();
  const { brands } = useBrands();

  // Filters State
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedCategory, setSelectedCategory] = useState<string>('all');
  const [selectedBrand, setSelectedBrand] = useState<string>('all');
  const [selectedType, setSelectedType] = useState<string>('all');
  const [includeArchived, setIncludeArchived] = useState(false);

  // Hook with filters
  const {
    products,
    loading,
    error,
    createProduct,
    updateProduct,
    archiveProduct,
    restoreProduct,
    refresh,
  } = useProducts({
    categoryId: selectedCategory === 'all' ? undefined : selectedCategory,
    brandId: selectedBrand === 'all' ? undefined : selectedBrand,
    productType: selectedType === 'all' ? undefined : selectedType,
    includeArchived,
    searchTerm,
  });

  // Modal Dialogs State
  const [formOpen, setFormOpen] = useState(false);
  const [editingProduct, setEditingProduct] = useState<Product | null>(null);
  const [detailsOpen, setDetailsOpen] = useState(false);
  const [selectedProduct, setSelectedProduct] = useState<Product | null>(null);

  const [printOpen, setPrintOpen] = useState(false);
  const [printTargetProduct, setPrintTargetProduct] = useState<Product | null>(null);
  const [printTargetVariant, setPrintTargetVariant] = useState<ProductVariant | null>(null);

  const [scanOpen, setScanOpen] = useState(false);
  const [categoryModalOpen, setCategoryModalOpen] = useState(false);
  const [brandModalOpen, setBrandModalOpen] = useState(false);
  const [prefilledBarcode, setPrefilledBarcode] = useState<string | undefined>(undefined);

  // Filtered in-memory for instant feedback when typing
  const filteredProducts = useMemo(() => {
    return products.filter((p) => {
      if (selectedCategory !== 'all' && p.categoryId !== selectedCategory) return false;
      if (selectedBrand !== 'all' && p.brandId !== selectedBrand) return false;
      if (selectedType !== 'all' && p.productType !== selectedType) return false;
      return true;
    });
  }, [products, selectedCategory, selectedBrand, selectedType]);

  const handleOpenCreate = () => {
    setEditingProduct(null);
    setPrefilledBarcode(undefined);
    setFormOpen(true);
  };

  const handleOpenEdit = (p: Product) => {
    setEditingProduct(p);
    setFormOpen(true);
  };

  const handleOpenDetails = (p: Product) => {
    setSelectedProduct(p);
    setDetailsOpen(true);
  };

  const handleOpenPrint = (p: Product, v?: ProductVariant) => {
    setPrintTargetProduct(p);
    setPrintTargetVariant(v || null);
    setPrintOpen(true);
  };

  const handleSaveProduct = async (payload: any) => {
    if (editingProduct) {
      return updateProduct(editingProduct.id, payload);
    }
    return createProduct(payload);
  };

  const handleArchive = async (id: string) => {
    if (!confirm('هل تريد أرشفة هذا الصنف؟ لن يظهر في نقطة البيع لاحقاً.')) return;
    const res = await archiveProduct(id);
    if (res.success) {
      toast.success('تم أرشفة الصنف بنجاح');
    } else {
      toast.error(res.error || 'فشلت أرشفة الصنف');
    }
  };

  const handleRestore = async (id: string) => {
    const res = await restoreProduct(id);
    if (res.success) {
      toast.success('تمت استعادة الصنف بنجاح');
    } else {
      toast.error(res.error || 'فشلت استعادة الصنف');
    }
  };

  return (
    <MainLayout>
      <div className="space-y-5 p-4 sm:p-6" dir="rtl">
        {/* Header & Quick Action Buttons */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 bg-card p-4 sm:p-5 rounded-2xl border border-border shadow-sm">
          <div>
            <h1 className="text-xl sm:text-2xl font-black text-foreground flex items-center gap-2">
              <Package className="w-6 h-6 text-primary" />
              فهرس المنتجات والأدوات المكتبية والكتب
            </h1>
            <p className="text-xs sm:text-sm text-muted-foreground mt-1">
              إدارة الأصناف، الباركود الدولي والداخلي، أسعار التجزئة والجملة، الخصائص والمتغيرات
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <Button
              type="button"
              variant="outline"
              size="sm"
              className="gap-1.5 text-xs font-bold"
              onClick={() => setScanOpen(true)}
            >
              <ScanBarcode className="w-4 h-4 text-primary" />
              فحص باركود
            </Button>

            {canManageCategories && (
              <Button
                type="button"
                variant="outline"
                size="sm"
                className="gap-1.5 text-xs font-bold"
                onClick={() => setCategoryModalOpen(true)}
              >
                <FolderTree className="w-4 h-4 text-primary" />
                التصنيفات
              </Button>
            )}

            {canManageBrands && (
              <Button
                type="button"
                variant="outline"
                size="sm"
                className="gap-1.5 text-xs font-bold"
                onClick={() => setBrandModalOpen(true)}
              >
                <Award className="w-4 h-4 text-primary" />
                الماركات والناشرون
              </Button>
            )}

            {canCreate && (
              <Button
                type="button"
                size="sm"
                className="gap-1.5 text-xs font-bold shadow-sm"
                onClick={handleOpenCreate}
              >
                <Plus className="w-4 h-4" />
                إضافة صنف جديد
              </Button>
            )}
          </div>
        </div>

        {/* Filters and Search Bar */}
        <div className="bg-card p-3.5 sm:p-4 rounded-xl border border-border space-y-3 shadow-xs">
          <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-5 gap-2.5">
            {/* Search Input */}
            <div className="md:col-span-2 relative">
              <Search className="w-4 h-4 absolute right-3 top-3 text-muted-foreground" />
              <Input
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                placeholder="ابحث بالاسم، SKU، الباركود، الكاتب..."
                className="pr-9 h-10 text-sm font-medium"
              />
            </div>

            {/* Category Filter */}
            <div>
              <Select value={selectedCategory} onValueChange={setSelectedCategory}>
                <SelectTrigger className="h-10 text-xs">
                  <SelectValue placeholder="كل التصنيفات" />
                </SelectTrigger>
                <SelectContent dir="rtl">
                  <SelectItem value="all">كل التصنيفات</SelectItem>
                  {categories.map((c) => (
                    <SelectItem key={c.id} value={c.id}>
                      {c.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            {/* Brand Filter */}
            <div>
              <Select value={selectedBrand} onValueChange={setSelectedBrand}>
                <SelectTrigger className="h-10 text-xs">
                  <SelectValue placeholder="كل الماركات" />
                </SelectTrigger>
                <SelectContent dir="rtl">
                  <SelectItem value="all">كل الماركات</SelectItem>
                  {brands.map((b) => (
                    <SelectItem key={b.id} value={b.id}>
                      {b.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            {/* Product Type Filter */}
            <div>
              <Select value={selectedType} onValueChange={setSelectedType}>
                <SelectTrigger className="h-10 text-xs">
                  <SelectValue placeholder="نوع المنتج" />
                </SelectTrigger>
                <SelectContent dir="rtl">
                  <SelectItem value="all">كل الأنواع</SelectItem>
                  <SelectItem value="book">كتب ومناهج</SelectItem>
                  <SelectItem value="notebook">كشاكيل وكراسات</SelectItem>
                  <SelectItem value="pen">أقلام وماركرات</SelectItem>
                  <SelectItem value="stationery">أدوات مكتبية</SelectItem>
                  <SelectItem value="school_supply">أدوات مدرسية</SelectItem>
                  <SelectItem value="paper">ورق تصوير</SelectItem>
                  <SelectItem value="art_supply">رسم وألوان</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>

          <div className="flex items-center justify-between pt-1 border-t border-border/40 text-xs">
            <span className="text-muted-foreground font-bold">
              إجمالي الأصناف المعروضة: {filteredProducts.length}
            </span>

            <Button
              type="button"
              variant="ghost"
              size="sm"
              className="h-7 text-xs gap-1.5"
              onClick={() => setIncludeArchived(!includeArchived)}
            >
              <Archive className="w-3.5 h-3.5" />
              {includeArchived ? 'إخفاء المؤرشف' : 'عرض المؤرشفة'}
            </Button>
          </div>
        </div>

        {/* Loading State */}
        {loading && (
          <div className="text-center py-16 bg-card rounded-2xl border border-border">
            <div className="w-10 h-10 border-4 border-primary border-t-transparent rounded-full animate-spin mx-auto mb-3" />
            <p className="text-sm text-muted-foreground font-bold">جاري تحميل الأصناف...</p>
          </div>
        )}

        {/* Empty State */}
        {!loading && filteredProducts.length === 0 && (
          <div className="text-center py-16 bg-card rounded-2xl border border-dashed border-border p-6 space-y-3">
            <Package className="w-12 h-12 text-muted-foreground/40 mx-auto" />
            <h3 className="text-base font-bold text-foreground">لا توجد أصناف تطابق معايير البحث</h3>
            <p className="text-xs text-muted-foreground max-w-sm mx-auto">
              يمكنك تغيير فلاتر البحث أو إضافة صنف جديد للمكتبة الآن
            </p>
            {canCreate && (
              <Button type="button" size="sm" onClick={handleOpenCreate} className="gap-1.5 font-bold">
                <Plus className="w-4 h-4" />
                إضافة أول صنف
              </Button>
            )}
          </div>
        )}

        {/* Desktop Table View */}
        {!loading && filteredProducts.length > 0 && (
          <div className="hidden md:block bg-card rounded-2xl border border-border overflow-hidden shadow-xs">
            <Table>
              <TableHeader>
                <TableRow className="bg-muted/40">
                  <TableHead className="text-right">اسم المنتج / الكتاب</TableHead>
                  <TableHead className="text-right">رمز الصنف (SKU)</TableHead>
                  <TableHead className="text-right">الباركود</TableHead>
                  <TableHead className="text-right">التصنيف</TableHead>
                  <TableHead className="text-right">الماركة / الناشر</TableHead>
                  <TableHead className="text-center">سعر التكلفة</TableHead>
                  <TableHead className="text-center">سعر البيع قطاعي</TableHead>
                  <TableHead className="text-center">سعر الجملة</TableHead>
                  <TableHead className="text-center">الحالة</TableHead>
                  <TableHead className="text-center">الإجراءات</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filteredProducts.map((p) => {
                  const cat = categories.find((c) => c.id === p.categoryId);
                  const brand = brands.find((b) => b.id === p.brandId);

                  return (
                    <TableRow key={p.id} className="hover:bg-muted/30 transition-colors">
                      <TableCell className="font-bold text-foreground">
                        <div className="flex flex-col">
                          <span className="flex items-center gap-1.5">
                            {p.name}
                            {p.hasVariants && (
                              <Badge variant="outline" className="text-[10px] px-1 py-0 gap-0.5">
                                <Layers className="w-2.5 h-2.5" />
                                {p.variants?.length || 0}
                              </Badge>
                            )}
                            {p.productType === 'book' && (
                              <Badge variant="secondary" className="text-[10px] px-1 py-0 gap-0.5">
                                <BookOpen className="w-2.5 h-2.5" />
                                كتاب
                              </Badge>
                            )}
                          </span>
                          {p.nameEn && (
                            <span className="text-[11px] font-mono text-muted-foreground">{p.nameEn}</span>
                          )}
                        </div>
                      </TableCell>

                      <TableCell className="font-mono text-xs font-bold text-foreground">
                        {p.sku}
                      </TableCell>

                      <TableCell className="font-mono text-xs text-muted-foreground">
                        {p.barcode || '-'}
                      </TableCell>

                      <TableCell className="text-xs">{cat?.name || '-'}</TableCell>
                      <TableCell className="text-xs">{brand?.name || '-'}</TableCell>

                      <TableCell className="text-center font-bold text-xs text-muted-foreground">
                        {p.purchasePrice.toFixed(2)} ج.م
                      </TableCell>

                      <TableCell className="text-center font-black text-sm text-primary">
                        {p.sellingPrice.toFixed(2)} ج.م
                      </TableCell>

                      <TableCell className="text-center font-bold text-xs">
                        {(p.wholesalePrice || p.sellingPrice).toFixed(2)} ج.م
                      </TableCell>

                      <TableCell className="text-center">
                        <Badge variant={p.archived ? 'destructive' : p.active ? 'secondary' : 'outline'}>
                          {p.archived ? 'مؤرشف' : p.active ? 'نشط' : 'معطل'}
                        </Badge>
                      </TableCell>

                      <TableCell className="text-center">
                        <div className="flex items-center justify-center gap-1">
                          <Button
                            type="button"
                            variant="ghost"
                            size="icon"
                            className="w-8 h-8 text-primary"
                            title="عرض التفاصيل"
                            onClick={() => handleOpenDetails(p)}
                          >
                            <Eye className="w-4 h-4" />
                          </Button>

                          <Button
                            type="button"
                            variant="ghost"
                            size="icon"
                            className="w-8 h-8"
                            title="طباعة الباركود"
                            onClick={() => handleOpenPrint(p)}
                          >
                            <Printer className="w-4 h-4 text-muted-foreground" />
                          </Button>

                          {canEdit && (
                            <Button
                              type="button"
                              variant="ghost"
                              size="icon"
                              className="w-8 h-8"
                              title="تعديل"
                              onClick={() => handleOpenEdit(p)}
                            >
                              <Edit2 className="w-4 h-4 text-muted-foreground" />
                            </Button>
                          )}

                          {canArchive && (
                            p.archived ? (
                              <Button
                                type="button"
                                variant="ghost"
                                size="icon"
                                className="w-8 h-8 text-green-600"
                                title="استعادة الصنف"
                                onClick={() => handleRestore(p.id)}
                              >
                                <RotateCcw className="w-4 h-4" />
                              </Button>
                            ) : (
                              <Button
                                type="button"
                                variant="ghost"
                                size="icon"
                                className="w-8 h-8 text-destructive hover:bg-destructive/10"
                                title="أرشفة الصنف"
                                onClick={() => handleArchive(p.id)}
                              >
                                <Archive className="w-4 h-4" />
                              </Button>
                            )
                          )}
                        </div>
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          </div>
        )}

        {/* Mobile Cards View */}
        {!loading && filteredProducts.length > 0 && (
          <div className="md:hidden space-y-3">
            {filteredProducts.map((p) => {
              const cat = categories.find((c) => c.id === p.categoryId);
              return (
                <div
                  key={p.id}
                  className="bg-card p-3.5 rounded-xl border border-border shadow-xs space-y-2.5"
                >
                  <div className="flex items-start justify-between">
                    <div>
                      <div className="flex items-center gap-1.5 mb-1">
                        <Badge variant={p.archived ? 'destructive' : 'secondary'} className="text-[10px]">
                          {p.archived ? 'مؤرشف' : 'نشط'}
                        </Badge>
                        <span className="text-[11px] font-mono text-muted-foreground">{p.sku}</span>
                      </div>
                      <h4 className="font-bold text-sm text-foreground">{p.name}</h4>
                      {cat && <span className="text-[11px] text-muted-foreground">{cat.name}</span>}
                    </div>

                    <div className="text-left">
                      <span className="text-[11px] text-muted-foreground">سعر البيع</span>
                      <p className="text-base font-black text-primary">{p.sellingPrice.toFixed(2)} ج.م</p>
                    </div>
                  </div>

                  <div className="flex items-center justify-between pt-2 border-t border-border/50">
                    <div className="text-xs font-mono text-muted-foreground">
                      {p.barcode || 'بدون باركود'}
                    </div>

                    <div className="flex items-center gap-1">
                      <Button
                        type="button"
                        variant="ghost"
                        size="sm"
                        className="h-8 px-2 text-xs"
                        onClick={() => handleOpenDetails(p)}
                      >
                        <Eye className="w-3.5 h-3.5 ml-1" />
                        التفاصيل
                      </Button>

                      <Button
                        type="button"
                        variant="ghost"
                        size="icon"
                        className="w-8 h-8"
                        onClick={() => handleOpenPrint(p)}
                      >
                        <Printer className="w-4 h-4 text-muted-foreground" />
                      </Button>

                      {canEdit && (
                        <Button
                          type="button"
                          variant="ghost"
                          size="icon"
                          className="w-8 h-8"
                          onClick={() => handleOpenEdit(p)}
                        >
                          <Edit2 className="w-4 h-4 text-muted-foreground" />
                        </Button>
                      )}
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}

        {/* Dialog Modals */}
        <ProductFormDialog
          open={formOpen}
          onOpenChange={setFormOpen}
          product={editingProduct}
          initialBarcode={prefilledBarcode}
          onSave={handleSaveProduct}
        />

        <ProductDetailsDrawer
          open={detailsOpen}
          onOpenChange={setDetailsOpen}
          product={selectedProduct}
          onEdit={handleOpenEdit}
          onPrintBarcode={handleOpenPrint}
          onArchive={handleArchive}
          onRestore={handleRestore}
          canEdit={canEdit}
        />

        <BarcodePrintDialog
          open={printOpen}
          onOpenChange={setPrintOpen}
          product={printTargetProduct}
          variant={printTargetVariant}
        />

        <BarcodeScanDialog
          open={scanOpen}
          onOpenChange={setScanOpen}
          onSelectProduct={(prod) => {
            setSelectedProduct(prod);
            setDetailsOpen(true);
          }}
          onCreateWithBarcode={(code) => {
            setEditingProduct(null);
            setPrefilledBarcode(code);
            setFormOpen(true);
          }}
        />

        <CategoryManageDialog
          open={categoryModalOpen}
          onOpenChange={setCategoryModalOpen}
        />

        <BrandManageDialog
          open={brandModalOpen}
          onOpenChange={setBrandModalOpen}
        />
      </div>
    </MainLayout>
  );
}
