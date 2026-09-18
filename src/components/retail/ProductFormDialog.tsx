/**
 * Production-Grade Product Form Dialog
 * Supports comprehensive retail fields, book metadata, notebook attributes,
 * live profit preview, auto SKU & Barcode generation, and Variant builder.
 */

import React, { useState, useEffect } from 'react';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from '@/components/ui/dialog';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Switch } from '@/components/ui/switch';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  Sparkles,
  Package,
  Barcode as BarcodeIcon,
  DollarSign,
  Layers,
  BookOpen,
  Plus,
  Trash2,
  AlertCircle,
  CheckCircle,
} from 'lucide-react';
import type { Product, ProductVariant, ProductType, BookMetadata } from '@/types/retail.types';
import { useCategories } from '@/hooks/retail/useCategories';
import { useBrands } from '@/hooks/retail/useBrands';
import { useUnits } from '@/hooks/retail/useUnits';
import { CategoryManageDialog } from '@/components/retail/CategoryManageDialog';
import { generateProductSku, generateVariantSku, generateInternalEan13Barcode, isValidBarcode } from '@/services/products/skuBarcode.service';
import { validateProductForm, validateISBN } from '@/services/products/productValidators';
import { removeUndefinedFields } from '@/lib/utils';
import { useAppStore } from '@/lib/store';
import { toast } from 'sonner';

interface ProductFormDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  product?: Product | null;
  initialBarcode?: string;
  onSave: (productData: any) => Promise<{ success: boolean; error?: string }>;
}

export function ProductFormDialog({
  open,
  onOpenChange,
  product,
  initialBarcode,
  onSave,
}: ProductFormDialogProps) {
  const { categories } = useCategories();
  const { brands } = useBrands();
  const { units } = useUnits();
  const settings = useAppStore((state) => state.settings);
  const isTaxEnabled = Boolean(settings?.taxEnabled);
  const defaultTaxPercent = isTaxEnabled ? (settings?.taxRate ?? 14) : 0;

  const [activeTab, setActiveTab] = useState('basic');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [categoryModalOpen, setCategoryModalOpen] = useState(false);

  // Form State
  const [name, setName] = useState('');
  const [nameEn, setNameEn] = useState('');
  const [description, setDescription] = useState('');
  const [productType, setProductType] = useState<ProductType>('stationery');
  const [categoryId, setCategoryId] = useState('');
  const [brandId, setBrandId] = useState('');
  const [unitId, setUnitId] = useState('');
  const [active, setActive] = useState(true);
  const [trackInventory, setTrackInventory] = useState(true);
  const [allowNegativeStock, setAllowNegativeStock] = useState(false);

  // Identification
  const [sku, setSku] = useState('');
  const [barcode, setBarcode] = useState('');

  // Pricing
  const [purchasePrice, setPurchasePrice] = useState('0');
  const [sellingPrice, setSellingPrice] = useState('0');
  const [wholesalePrice, setWholesalePrice] = useState('0');
  const [minimumSellingPrice, setMinimumSellingPrice] = useState('0');
  const [taxRate, setTaxRate] = useState(defaultTaxPercent.toString());

  // Inventory limits
  const [minimumStock, setMinimumStock] = useState('5');
  const [reorderPoint, setReorderPoint] = useState('10');

  // Book Metadata
  const [isbn, setIsbn] = useState('');
  const [author, setAuthor] = useState('');
  const [publisher, setPublisher] = useState('');
  const [publicationYear, setPublicationYear] = useState('');
  const [edition, setEdition] = useState('');
  const [schoolGrade, setSchoolGrade] = useState('');
  const [subject, setSubject] = useState('');
  const [term, setTerm] = useState('');
  const [bookType, setBookType] = useState<'textbook' | 'external_book' | 'novel' | 'general'>('general');

  // Notebook Specific Attributes
  const [notebookPages, setNotebookPages] = useState('100');
  const [notebookSize, setNotebookSize] = useState('A4');
  const [notebookRuling, setNotebookRuling] = useState('مسطر');

  // Variants
  const [hasVariants, setHasVariants] = useState(false);
  const [variants, setVariants] = useState<ProductVariant[]>([]);

  // Reset or initialize form when opened
  useEffect(() => {
    if (open) {
      if (product) {
        setName(product.name || '');
        setNameEn(product.nameEn || '');
        setDescription(product.description || '');
        setProductType(product.productType || 'stationery');
        setCategoryId(product.categoryId || '');
        setBrandId(product.brandId || '');
        setUnitId(product.unitId || '');
        setActive(product.active !== false);
        setTrackInventory(product.trackInventory !== false);
        setAllowNegativeStock(Boolean(product.allowNegativeStock));
        setSku(product.sku || '');
        setBarcode(product.barcode || '');
        setPurchasePrice((product.purchasePrice ?? 0).toString());
        setSellingPrice((product.sellingPrice ?? 0).toString());
        setWholesalePrice((product.wholesalePrice ?? product.sellingPrice ?? 0).toString());
        setMinimumSellingPrice((product.minimumSellingPrice ?? 0).toString());
        const prodTax = product.taxRate !== undefined && product.taxRate !== null
          ? (product.taxRate > 1 ? product.taxRate : product.taxRate * 100)
          : defaultTaxPercent;
        setTaxRate(prodTax.toString());
        setMinimumStock((product.minimumStock ?? 5).toString());
        setReorderPoint((product.reorderPoint ?? 10).toString());

        // Book metadata
        if (product.bookMetadata) {
          setIsbn(product.bookMetadata.isbn || '');
          setAuthor(product.bookMetadata.author || '');
          setPublisher(product.bookMetadata.publisher || '');
          setPublicationYear((product.bookMetadata.publicationYear || '').toString());
          setEdition(product.bookMetadata.edition || '');
          setSchoolGrade(product.bookMetadata.grade || '');
          setSubject(product.bookMetadata.subject || '');
          setTerm(product.bookMetadata.term || '');
          setBookType((product.bookMetadata.bookType as any) || 'general');
        }

        setHasVariants(Boolean(product.hasVariants && product.variants && product.variants.length > 0));
        setVariants(product.variants || []);
      } else {
        // New Product defaults
        setName('');
        setNameEn('');
        setDescription('');
        setProductType('stationery');
        setCategoryId(categories.length > 0 ? categories[0].id : '');
        setBrandId('');
        setUnitId(units.length > 0 ? units[0].id : '');
        setActive(true);
        setTrackInventory(true);
        setAllowNegativeStock(false);

        // Auto-generate initial SKU and barcode
        const defaultSeq = Math.floor(1000 + Math.random() * 9000);
        setSku(generateProductSku('PRD', defaultSeq));
        setBarcode(initialBarcode || generateInternalEan13Barcode(defaultSeq));

        setPurchasePrice('0');
        setSellingPrice('0');
        setWholesalePrice('0');
        setMinimumSellingPrice('0');
        setTaxRate(defaultTaxPercent.toString());
        setMinimumStock('5');
        setReorderPoint('10');

        setIsbn('');
        setAuthor('');
        setPublisher('');
        setPublicationYear(new Date().getFullYear().toString());
        setEdition('');
        setSchoolGrade('');
        setSubject('');
        setTerm('الترم الأول');
        setBookType('general');

        setNotebookPages('100');
        setNotebookSize('A4');
        setNotebookRuling('مسطر');

        setHasVariants(false);
        setVariants([]);
      }
      setActiveTab('basic');
    }
  }, [open, product, initialBarcode, categories, units]);

  // Live profit calculation
  const pCost = parseFloat(purchasePrice) || 0;
  const pSell = parseFloat(sellingPrice) || 0;
  const expectedProfit = pSell - pCost;
  const profitMargin = pSell > 0 ? ((expectedProfit / pSell) * 100).toFixed(1) : '0';

  // Live Barcode / ISBN validation
  const barcodeCheck = barcode ? isValidBarcode(barcode) : { isValid: true };
  const isbnCheck = isbn ? validateISBN(isbn) : { isValid: true };

  // Variant Helpers
  const addVariant = () => {
    const nextIndex = variants.length + 1;
    const vSku = generateVariantSku(sku, [`VAR${nextIndex}`]);
    const vBarcode = generateInternalEan13Barcode(Math.floor(10000 + Math.random() * 90000));

    setVariants([
      ...variants,
      {
        id: `var_${Date.now()}_${nextIndex}`,
        productId: product?.id || '',
        name: `خاصية ${nextIndex}`,
        sku: vSku,
        barcode: vBarcode,
        attributes: {},
        sellingPrice: pSell,
        wholesalePrice: parseFloat(wholesalePrice) || pSell,
        purchasePrice: pCost,
        trackInventory: true,
        active: true,
      },
    ]);
  };

  const removeVariant = (index: number) => {
    setVariants(variants.filter((_, i) => i !== index));
  };

  const updateVariantField = (index: number, field: keyof ProductVariant, value: any) => {
    setVariants(
      variants.map((v, i) => (i === index ? { ...v, [field]: value } : v))
    );
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    const rawBookMetadata =
      productType === 'book'
        ? {
            isbn: isbn.trim(),
            author: author.trim(),
            publisher: publisher.trim(),
            publicationYear: parseInt(publicationYear) || undefined,
            edition: edition.trim(),
            grade: schoolGrade.trim(),
            subject: subject.trim(),
            term: term.trim(),
            bookType,
          }
        : undefined;

    const bookMetadata = rawBookMetadata ? removeUndefinedFields(rawBookMetadata) : undefined;

    const rawPayload: any = {
      name: name.trim(),
      nameAr: name.trim(),
      nameEn: nameEn.trim(),
      description: description.trim(),
      productType,
      categoryId,
      brandId: brandId || '',
      unitId: unitId || (units[0]?.id || 'u-pcs'),
      sku: sku.trim().toUpperCase(),
      barcode: barcode.trim(),
      purchasePrice: pCost,
      sellingPrice: pSell,
      wholesalePrice: parseFloat(wholesalePrice) || pSell,
      minimumSellingPrice: parseFloat(minimumSellingPrice) || 0,
      taxRate: (() => {
        const parsed = parseFloat(taxRate);
        if (isNaN(parsed)) return (defaultTaxPercent / 100);
        return parsed > 1 ? parsed / 100 : parsed;
      })(),
      minimumStock: parseInt(minimumStock) || 0,
      reorderPoint: parseInt(reorderPoint) || 0,
      active,
      trackInventory,
      allowNegativeStock,
      hasVariants,
      variants: hasVariants ? variants : [],
      ...(bookMetadata ? { bookMetadata } : {}),
    };

    const payload = removeUndefinedFields(rawPayload);

    const validation = validateProductForm(payload);
    if (!validation.isValid) {
      const firstError = Object.values(validation.errors)[0];
      toast.error(firstError);
      return;
    }

    setIsSubmitting(true);
    try {
      const res = await onSave(payload);
      if (res.success) {
        toast.success(product ? 'تم تحديث بيانات المنتج بنجاح' : 'تم إضافة المنتج بنجاح');
        onOpenChange(false);
      } else {
        toast.error(res.error || 'تعذر حفظ المنتج');
      }
    } catch (err: any) {
      toast.error(err?.message || 'حدث خطأ غير متوقع');
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <>
      <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-2xl max-h-[92vh] overflow-y-auto" dir="rtl">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-lg font-bold">
            <Package className="w-5 h-5 text-primary" />
            {product ? `تعديل المنتج: ${product.name}` : 'إضافة منتج أو كتاب جديد'}
          </DialogTitle>
        </DialogHeader>

        <form onSubmit={handleSubmit}>
          <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full">
            <TabsList className="grid grid-cols-4 w-full mb-4">
              <TabsTrigger value="basic" className="text-xs">البيانات الأساسية</TabsTrigger>
              <TabsTrigger value="pricing" className="text-xs">الأسعار والربحية</TabsTrigger>
              <TabsTrigger value="specific" className="text-xs">
                {productType === 'book' ? 'بيانات الكتاب' : 'المواصفات'}
              </TabsTrigger>
              <TabsTrigger value="variants" className="text-xs">
                الأنواع والخصائص ({variants.length})
              </TabsTrigger>
            </TabsList>

            {/* TAB 1: BASIC & IDENTIFICATION */}
            <TabsContent value="basic" className="space-y-3.5">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div className="sm:col-span-2">
                  <Label className="text-xs">اسم المنتج / الكتاب (بالعربية) *</Label>
                  <Input
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    placeholder="مثال: كشكول سلك 100 ورقة، قلم روترنج..."
                    className="mt-1 font-bold"
                    required
                  />
                </div>

                <div>
                  <Label className="text-xs">الاسم بالإنجليزية (اختياري)</Label>
                  <Input
                    value={nameEn}
                    onChange={(e) => setNameEn(e.target.value)}
                    placeholder="e.g. BIC Cristal Blue Pen"
                    className="mt-1"
                  />
                </div>

                <div>
                  <Label className="text-xs">نوع المنتج (Product Type) *</Label>
                  <Select value={productType} onValueChange={(val) => setProductType(val as ProductType)}>
                    <SelectTrigger className="mt-1">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent dir="rtl">
                      <SelectItem value="stationery">أدوات مكتبية عامة</SelectItem>
                      <SelectItem value="pen">أقلام وماركرات</SelectItem>
                      <SelectItem value="notebook">كشاكيل وكراسات ودفاتر</SelectItem>
                      <SelectItem value="book">كتب وروايات ومراجع</SelectItem>
                      <SelectItem value="school_supply">أدوات مدرسية وهندسية</SelectItem>
                      <SelectItem value="office_supply">مستلزمات شركات ومكاتب</SelectItem>
                      <SelectItem value="paper">ورق طباعة وتصوير</SelectItem>
                      <SelectItem value="art_supply">أدوات رسم وألوان</SelectItem>
                      <SelectItem value="printer_ink">أحبار وطابعات</SelectItem>
                      <SelectItem value="calculator">آلات حاسبة وإلكترونيات</SelectItem>
                      <SelectItem value="gift_packaging">هدايا وتغليف</SelectItem>
                      <SelectItem value="general">عام / أخرى</SelectItem>
                    </SelectContent>
                  </Select>
                </div>

                <div>
                  <div className="flex justify-between items-center">
                    <Label className="text-xs">التصنيف (Category) *</Label>
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      className="h-6 px-1.5 text-[11px] text-primary gap-1"
                      onClick={() => setCategoryModalOpen(true)}
                    >
                      <Plus className="w-3 h-3" />
                      إدارة التصنيفات
                    </Button>
                  </div>
                  <Select value={categoryId} onValueChange={setCategoryId}>
                    <SelectTrigger className="mt-1">
                      <SelectValue placeholder={categories.length === 0 ? "لا توجد تصنيفات (أضف أول تصنيف)..." : "اختر التصنيف..."} />
                    </SelectTrigger>
                    <SelectContent dir="rtl">
                      {categories.map((c) => (
                        <SelectItem key={c.id} value={c.id}>
                          {c.name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                <div>
                  <Label className="text-xs">الماركة / دار النشر (Brand)</Label>
                  <Select value={brandId} onValueChange={setBrandId}>
                    <SelectTrigger className="mt-1">
                      <SelectValue placeholder="اختر الماركة (اختياري)..." />
                    </SelectTrigger>
                    <SelectContent dir="rtl">
                      <SelectItem value="none">بدون ماركة محددة</SelectItem>
                      {brands.map((b) => (
                        <SelectItem key={b.id} value={b.id}>
                          {b.name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </div>

              {/* Identification: SKU & Barcode */}
              <div className="bg-muted/30 p-3 rounded-xl border border-border/60 space-y-3 mt-2">
                <h4 className="text-xs font-bold text-muted-foreground flex items-center gap-1.5">
                  <BarcodeIcon className="w-4 h-4 text-primary" />
                  أرقام التعريف والباركود (SKU & Barcode)
                </h4>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div>
                    <div className="flex justify-between items-center">
                      <Label className="text-xs">رمز الصنف (SKU) *</Label>
                      <Button
                        type="button"
                        variant="ghost"
                        size="sm"
                        className="h-6 px-1.5 text-[11px] text-primary gap-1"
                        onClick={() => setSku(generateProductSku(productType.slice(0, 3), Math.floor(1000 + Math.random() * 9000)))}
                      >
                        <Sparkles className="w-3 h-3" />
                        توليد SKU
                      </Button>
                    </div>
                    <Input
                      value={sku}
                      onChange={(e) => setSku(e.target.value.toUpperCase())}
                      className="mt-1 font-mono uppercase font-bold"
                      placeholder="e.g. PEN-0010"
                      required
                    />
                  </div>

                  <div>
                    <div className="flex justify-between items-center">
                      <Label className="text-xs">الباركود الدولي أو الداخلي</Label>
                      <Button
                        type="button"
                        variant="ghost"
                        size="sm"
                        className="h-6 px-1.5 text-[11px] text-primary gap-1"
                        onClick={() => setBarcode(generateInternalEan13Barcode(Math.floor(10000 + Math.random() * 90000)))}
                      >
                        <Sparkles className="w-3 h-3" />
                        توليد باركود EAN-13
                      </Button>
                    </div>
                    <Input
                      value={barcode}
                      onChange={(e) => setBarcode(e.target.value)}
                      className="mt-1 font-mono font-bold tracking-wider"
                      placeholder="622... أو EAN-13"
                    />
                    {barcode && !barcodeCheck.isValid && (
                      <p className="text-[11px] text-destructive mt-1 flex items-center gap-1">
                        <AlertCircle className="w-3 h-3" />
                        {barcodeCheck.error}
                      </p>
                    )}
                  </div>
                </div>
              </div>

              {/* Toggles */}
              <div className="flex flex-wrap gap-4 pt-1">
                <div className="flex items-center gap-2">
                  <Switch checked={active} onCheckedChange={setActive} id="active-switch" />
                  <Label htmlFor="active-switch" className="cursor-pointer text-xs">
                    الصنف مفعّل للبيع
                  </Label>
                </div>

                <div className="flex items-center gap-2">
                  <Switch checked={trackInventory} onCheckedChange={setTrackInventory} id="track-inv-switch" />
                  <Label htmlFor="track-inv-switch" className="cursor-pointer text-xs">
                    تتبع المخزون
                  </Label>
                </div>
              </div>
            </TabsContent>

            {/* TAB 2: PRICING & INVENTORY */}
            <TabsContent value="pricing" className="space-y-4">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <Label className="text-xs">سعر الشراء (التكلفة) *</Label>
                  <div className="relative mt-1">
                    <Input
                      type="number"
                      step="0.25"
                      min="0"
                      value={purchasePrice}
                      onChange={(e) => setPurchasePrice(e.target.value)}
                      className="pl-12 font-bold text-base"
                      required
                    />
                    <span className="absolute left-3 top-2.5 text-xs text-muted-foreground font-bold">ج.م</span>
                  </div>
                </div>

                <div>
                  <Label className="text-xs">سعر البيع قطاعي (Retail Price) *</Label>
                  <div className="relative mt-1">
                    <Input
                      type="number"
                      step="0.25"
                      min="0"
                      value={sellingPrice}
                      onChange={(e) => setSellingPrice(e.target.value)}
                      className="pl-12 font-bold text-base text-primary"
                      required
                    />
                    <span className="absolute left-3 top-2.5 text-xs text-primary font-bold">ج.م</span>
                  </div>
                </div>

                <div>
                  <Label className="text-xs">سعر بيع الجملة (Wholesale Price)</Label>
                  <div className="relative mt-1">
                    <Input
                      type="number"
                      step="0.25"
                      min="0"
                      value={wholesalePrice}
                      onChange={(e) => setWholesalePrice(e.target.value)}
                      className="pl-12 font-bold"
                    />
                    <span className="absolute left-3 top-2.5 text-xs text-muted-foreground font-bold">ج.م</span>
                  </div>
                </div>

                <div>
                  <Label className="text-xs">الحد الأدنى لسعر البيع (Minimum Price)</Label>
                  <div className="relative mt-1">
                    <Input
                      type="number"
                      step="0.25"
                      min="0"
                      value={minimumSellingPrice}
                      onChange={(e) => setMinimumSellingPrice(e.target.value)}
                      className="pl-12 font-bold"
                    />
                    <span className="absolute left-3 top-2.5 text-xs text-muted-foreground font-bold">ج.م</span>
                  </div>
                </div>

                <div>
                  <div className="flex justify-between items-center">
                    <Label className="text-xs">نسبة الضريبة (VAT %)</Label>
                    <span className="text-[10px] text-muted-foreground">
                      {isTaxEnabled ? `افتراضي الإعدادات: %${defaultTaxPercent}` : 'معطلة في الإعدادات (%0)'}
                    </span>
                  </div>
                  <div className="relative mt-1">
                    <Input
                      type="number"
                      step="1"
                      min="0"
                      max="100"
                      value={taxRate}
                      onChange={(e) => setTaxRate(e.target.value)}
                      className="pl-10 font-bold"
                      placeholder={defaultTaxPercent.toString()}
                    />
                    <span className="absolute left-3 top-2.5 text-xs text-muted-foreground font-bold">%</span>
                  </div>
                </div>
              </div>

              {/* Profit & Margin Live Preview */}
              <div className="bg-primary/5 border border-primary/20 rounded-xl p-3.5 flex items-center justify-between">
                <div>
                  <span className="text-xs text-muted-foreground">صافي الربح المتوقع للقطعة:</span>
                  <p className={`text-lg font-black ${expectedProfit >= 0 ? 'text-green-600' : 'text-destructive'}`}>
                    {expectedProfit.toFixed(2)} ج.م
                  </p>
                </div>
                <div className="text-left">
                  <span className="text-xs text-muted-foreground">هامش الربح (Profit Margin):</span>
                  <p className={`text-lg font-black ${expectedProfit >= 0 ? 'text-primary' : 'text-destructive'}`}>
                    %{profitMargin}
                  </p>
                </div>
              </div>

              {/* Inventory Unit & Reorder Point */}
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 pt-2">
                <div>
                  <Label className="text-xs">الوحدة الأساسية (Base Unit)</Label>
                  <Select value={unitId} onValueChange={setUnitId}>
                    <SelectTrigger className="mt-1">
                      <SelectValue placeholder="اختر الوحدة..." />
                    </SelectTrigger>
                    <SelectContent dir="rtl">
                      {units.map((u) => (
                        <SelectItem key={u.id} value={u.id}>
                          {u.name} ({u.code})
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                <div>
                  <Label className="text-xs">حد التنبيه الأدنى (Min Stock)</Label>
                  <Input
                    type="number"
                    min="0"
                    value={minimumStock}
                    onChange={(e) => setMinimumStock(e.target.value)}
                    className="mt-1 font-bold"
                  />
                </div>

                <div>
                  <Label className="text-xs">نقطة إعادة الطلب (Reorder)</Label>
                  <Input
                    type="number"
                    min="0"
                    value={reorderPoint}
                    onChange={(e) => setReorderPoint(e.target.value)}
                    className="mt-1 font-bold"
                  />
                </div>
              </div>
            </TabsContent>

            {/* TAB 3: PRODUCT-SPECIFIC (BOOK / NOTEBOOK) */}
            <TabsContent value="specific" className="space-y-3.5">
              {productType === 'book' ? (
                <div className="space-y-3">
                  <div className="flex items-center gap-1.5 text-xs font-bold text-primary">
                    <BookOpen className="w-4 h-4" />
                    بيانات الكتاب والمناهج الدراسية
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    <div>
                      <Label className="text-xs">رقم الإيداع الدولي (ISBN)</Label>
                      <Input
                        value={isbn}
                        onChange={(e) => setIsbn(e.target.value)}
                        placeholder="978-..."
                        className="mt-1 font-mono font-bold"
                      />
                      {isbn && !isbnCheck.isValid && (
                        <p className="text-[11px] text-destructive mt-1">{isbnCheck.error}</p>
                      )}
                    </div>

                    <div>
                      <Label className="text-xs">المؤلف / الكاتب</Label>
                      <Input
                        value={author}
                        onChange={(e) => setAuthor(e.target.value)}
                        placeholder="اسم الكاتب أو المترجم"
                        className="mt-1"
                      />
                    </div>

                    <div>
                      <Label className="text-xs">دار النشر</Label>
                      <Input
                        value={publisher}
                        onChange={(e) => setPublisher(e.target.value)}
                        placeholder="دار الشروق، نهضة مصر..."
                        className="mt-1"
                      />
                    </div>

                    <div>
                      <Label className="text-xs">سنة النشر / الطبعة</Label>
                      <div className="grid grid-cols-2 gap-2 mt-1">
                        <Input
                          value={publicationYear}
                          onChange={(e) => setPublicationYear(e.target.value)}
                          placeholder="2026"
                        />
                        <Input
                          value={edition}
                          onChange={(e) => setEdition(e.target.value)}
                          placeholder="طبعة 1"
                        />
                      </div>
                    </div>

                    <div>
                      <Label className="text-xs">الصف الدراسي (للكتب المدرسية)</Label>
                      <Input
                        value={schoolGrade}
                        onChange={(e) => setSchoolGrade(e.target.value)}
                        placeholder="مثال: الصف الثالث الإعدادي"
                        className="mt-1"
                      />
                    </div>

                    <div>
                      <Label className="text-xs">المادة والفصل الدراسي</Label>
                      <div className="grid grid-cols-2 gap-2 mt-1">
                        <Input
                          value={subject}
                          onChange={(e) => setSubject(e.target.value)}
                          placeholder="رياضيات، علوم..."
                        />
                        <Select value={term} onValueChange={setTerm}>
                          <SelectTrigger>
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent dir="rtl">
                            <SelectItem value="الترم الأول">الترم الأول</SelectItem>
                            <SelectItem value="الترم الثاني">الترم الثاني</SelectItem>
                            <SelectItem value="سنة كاملة">سنة كاملة</SelectItem>
                          </SelectContent>
                        </Select>
                      </div>
                    </div>
                  </div>
                </div>
              ) : productType === 'notebook' ? (
                <div className="space-y-3">
                  <Label className="text-xs font-bold text-primary">خصائص الدفتر والكشكول</Label>
                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                    <div>
                      <Label className="text-xs">عدد الصفحات</Label>
                      <Input
                        value={notebookPages}
                        onChange={(e) => setNotebookPages(e.target.value)}
                        placeholder="60, 80, 100, 200..."
                        className="mt-1 font-bold"
                      />
                    </div>
                    <div>
                      <Label className="text-xs">المقاس (Paper Size)</Label>
                      <Select value={notebookSize} onValueChange={setNotebookSize}>
                        <SelectTrigger className="mt-1">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent dir="rtl">
                          <SelectItem value="A4">A4 (21 × 29.7 سم)</SelectItem>
                          <SelectItem value="A5">A5 (14.8 × 21 سم)</SelectItem>
                          <SelectItem value="B5">B5</SelectItem>
                          <SelectItem value="A3">A3</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                    <div>
                      <Label className="text-xs">نوع التسطير</Label>
                      <Select value={notebookRuling} onValueChange={setNotebookRuling}>
                        <SelectTrigger className="mt-1">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent dir="rtl">
                          <SelectItem value="مسطر">مسطر عادي (Lined)</SelectItem>
                          <SelectItem value="مربعات">مربعات (Grid / Math)</SelectItem>
                          <SelectItem value="سادة">سادة بدون تسطير (Blank)</SelectItem>
                          <SelectItem value="رسم بياني">رسم بياني</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                  </div>
                </div>
              ) : (
                <div className="text-center py-8 text-sm text-muted-foreground bg-muted/20 rounded-xl border border-dashed">
                  لا توجد حقول تخصصية إضافية لهذا النوع من المنتجات.
                </div>
              )}
            </TabsContent>

            {/* TAB 4: VARIANTS BUILDER */}
            <TabsContent value="variants" className="space-y-3.5">
              <div className="flex items-center justify-between bg-muted/30 p-3 rounded-xl border border-border/60">
                <div>
                  <Label className="text-xs font-bold block">تفعيل الخصائص والمتغيرات (Variants)</Label>
                  <span className="text-[11px] text-muted-foreground">
                    مثال: أقلام متعددة الألوان، أو كشاكيل بمقاسات مختلفة لكل منها باركود مستقل
                  </span>
                </div>
                <Switch checked={hasVariants} onCheckedChange={setHasVariants} />
              </div>

              {hasVariants && (
                <div className="space-y-3">
                  <div className="flex justify-between items-center">
                    <span className="text-xs text-muted-foreground font-bold">
                      قائمة المتغيرات المضافة ({variants.length})
                    </span>
                    <Button
                      type="button"
                      size="sm"
                      variant="outline"
                      onClick={addVariant}
                      className="gap-1 text-xs font-bold"
                    >
                      <Plus className="w-3.5 h-3.5" />
                      إضافة متغير جديد
                    </Button>
                  </div>

                  {variants.length === 0 && (
                    <div className="text-center py-6 text-xs text-muted-foreground bg-muted/10 rounded-xl border border-dashed">
                      لم يتم إضافة أي متغيرات بعد. اضغط "إضافة متغير جديد".
                    </div>
                  )}

                  <div className="space-y-2 max-h-60 overflow-y-auto pr-1">
                    {variants.map((variant, index) => (
                      <div
                        key={variant.id}
                        className="bg-card p-3 rounded-lg border border-border/60 space-y-2 text-sm"
                      >
                        <div className="grid grid-cols-1 sm:grid-cols-4 gap-2 items-center">
                          <div className="sm:col-span-1">
                            <Label className="text-[11px]">اسم المتغير (مثل: أزرق)</Label>
                            <Input
                              value={variant.name}
                              onChange={(e) => updateVariantField(index, 'name', e.target.value)}
                              className="h-8 text-xs font-bold mt-0.5"
                            />
                          </div>

                          <div>
                            <Label className="text-[11px]">رمز SKU</Label>
                            <Input
                              value={variant.sku}
                              onChange={(e) => updateVariantField(index, 'sku', e.target.value.toUpperCase())}
                              className="h-8 text-xs font-mono font-bold mt-0.5"
                            />
                          </div>

                          <div>
                            <Label className="text-[11px]">الباركود المستقل</Label>
                            <Input
                              value={variant.barcode || ''}
                              onChange={(e) => updateVariantField(index, 'barcode', e.target.value)}
                              className="h-8 text-xs font-mono font-bold mt-0.5"
                            />
                          </div>

                          <div className="flex items-end justify-between gap-1">
                            <div className="w-full">
                              <Label className="text-[11px]">سعر البيع</Label>
                              <Input
                                type="number"
                                step="0.25"
                                value={variant.sellingPrice ?? pSell}
                                onChange={(e) => updateVariantField(index, 'sellingPrice', parseFloat(e.target.value) || 0)}
                                className="h-8 text-xs font-bold mt-0.5"
                              />
                            </div>
                            <Button
                              type="button"
                              variant="ghost"
                              size="icon"
                              className="h-8 w-8 text-destructive hover:bg-destructive/10 shrink-0"
                              onClick={() => removeVariant(index)}
                            >
                              <Trash2 className="w-4 h-4" />
                            </Button>
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </TabsContent>
          </Tabs>

          <DialogFooter className="mt-5 gap-2 sm:gap-0 border-t pt-3">
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)} disabled={isSubmitting}>
              إلغاء
            </Button>
            <Button type="submit" disabled={isSubmitting} className="font-bold gap-2">
              {isSubmitting ? 'جاري الحفظ...' : product ? 'تحديث الصنف' : 'إضافة الصنف'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
    <CategoryManageDialog
      open={categoryModalOpen}
      onOpenChange={setCategoryModalOpen}
    />
  </>
  );
}
