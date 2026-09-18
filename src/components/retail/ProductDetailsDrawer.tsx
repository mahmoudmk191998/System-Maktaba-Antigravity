/**
 * Product Details View Dialog / Drawer
 * Displays complete retail specs, pricing structure, book metadata, variants, and barcode actions.
 */

import React from 'react';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import {
  Package,
  Barcode,
  Printer,
  Edit2,
  Archive,
  RotateCcw,
  BookOpen,
  Tag,
  DollarSign,
  Layers,
} from 'lucide-react';
import type { Product, ProductVariant } from '@/types/retail.types';
import { useCategories } from '@/hooks/retail/useCategories';
import { useBrands } from '@/hooks/retail/useBrands';
import { useUnits } from '@/hooks/retail/useUnits';

interface ProductDetailsDrawerProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  product: Product | null;
  onEdit?: (product: Product) => void;
  onPrintBarcode?: (product: Product, variant?: ProductVariant) => void;
  onArchive?: (productId: string) => void;
  onRestore?: (productId: string) => void;
  canEdit?: boolean;
}

export function ProductDetailsDrawer({
  open,
  onOpenChange,
  product,
  onEdit,
  onPrintBarcode,
  onArchive,
  onRestore,
  canEdit = true,
}: ProductDetailsDrawerProps) {
  const { categories } = useCategories();
  const { brands } = useBrands();
  const { units } = useUnits();

  if (!product) return null;

  const categoryName = categories.find((c) => c.id === product.categoryId)?.name || 'غير محدد';
  const brandName = brands.find((b) => b.id === product.brandId)?.name || 'بدون علامة تجارية';
  const unitName = units.find((u) => u.id === product.unitId)?.name || 'قطعة';

  const profit = (product.sellingPrice || 0) - (product.purchasePrice || 0);
  const margin = product.sellingPrice > 0 ? ((profit / product.sellingPrice) * 100).toFixed(1) : '0';

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-xl max-h-[90vh] overflow-y-auto" dir="rtl">
        <DialogHeader>
          <div className="flex items-start justify-between">
            <div className="space-y-1">
              <div className="flex items-center gap-2">
                <Badge variant={product.archived ? 'destructive' : 'secondary'}>
                  {product.archived ? 'مؤرشف' : 'نشط للبيع'}
                </Badge>
                <Badge variant="outline" className="font-mono">
                  {product.sku}
                </Badge>
              </div>
              <DialogTitle className="text-xl font-bold mt-1.5">{product.name}</DialogTitle>
              {product.nameEn && (
                <p className="text-xs text-muted-foreground font-mono">{product.nameEn}</p>
              )}
            </div>
          </div>
        </DialogHeader>

        <div className="space-y-4 py-2 text-sm">
          {/* Main Info Card */}
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-3 bg-muted/30 p-3.5 rounded-xl border border-border/60">
            <div>
              <span className="text-xs text-muted-foreground">التصنيف:</span>
              <p className="font-bold text-foreground mt-0.5">{categoryName}</p>
            </div>
            <div>
              <span className="text-xs text-muted-foreground">الماركة / الناشر:</span>
              <p className="font-bold text-foreground mt-0.5">{brandName}</p>
            </div>
            <div>
              <span className="text-xs text-muted-foreground">الوحدة الأساسية:</span>
              <p className="font-bold text-foreground mt-0.5">{unitName}</p>
            </div>
            <div>
              <span className="text-xs text-muted-foreground">الباركود:</span>
              <p className="font-mono font-bold text-foreground mt-0.5">
                {product.barcode || 'غير محدد'}
              </p>
            </div>
            <div>
              <span className="text-xs text-muted-foreground">حد التنبيه الأدنى:</span>
              <p className="font-bold text-foreground mt-0.5">{product.minimumStock || 0}</p>
            </div>
            <div>
              <span className="text-xs text-muted-foreground">نقطة إعادة الطلب:</span>
              <p className="font-bold text-foreground mt-0.5">{product.reorderPoint || 0}</p>
            </div>
          </div>

          {/* Pricing Details */}
          <div className="bg-primary/5 border border-primary/20 rounded-xl p-3.5 space-y-2">
            <h4 className="text-xs font-bold text-primary flex items-center gap-1.5">
              <DollarSign className="w-4 h-4" />
              هيكل الأسعار والأرباح
            </h4>
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 text-center pt-1">
              <div className="bg-card p-2 rounded-lg border border-border/50">
                <span className="text-[11px] text-muted-foreground">سعر التكلفة</span>
                <p className="font-bold text-foreground text-sm mt-0.5">{product.purchasePrice.toFixed(2)} ج.م</p>
              </div>
              <div className="bg-card p-2 rounded-lg border border-border/50">
                <span className="text-[11px] text-muted-foreground">سعر التجزئة</span>
                <p className="font-black text-primary text-sm mt-0.5">{product.sellingPrice.toFixed(2)} ج.م</p>
              </div>
              <div className="bg-card p-2 rounded-lg border border-border/50">
                <span className="text-[11px] text-muted-foreground">سعر الجملة</span>
                <p className="font-bold text-foreground text-sm mt-0.5">{(product.wholesalePrice || product.sellingPrice).toFixed(2)} ج.م</p>
              </div>
              <div className="bg-card p-2 rounded-lg border border-border/50">
                <span className="text-[11px] text-muted-foreground">هامش الربح</span>
                <p className="font-black text-green-600 text-sm mt-0.5">%{margin}</p>
              </div>
            </div>
          </div>

          {/* Book Metadata if product is Book */}
          {product.productType === 'book' && product.bookMetadata && (
            <div className="bg-muted/30 p-3.5 rounded-xl border border-border/60 space-y-2">
              <h4 className="text-xs font-bold text-muted-foreground flex items-center gap-1.5">
                <BookOpen className="w-4 h-4 text-primary" />
                مواصفات الكتاب والمحتوى التعليمي
              </h4>
              <div className="grid grid-cols-2 sm:grid-cols-3 gap-2 text-xs">
                {product.bookMetadata.isbn && (
                  <div>
                    <span className="text-muted-foreground">ISBN:</span>
                    <p className="font-mono font-bold">{product.bookMetadata.isbn}</p>
                  </div>
                )}
                {product.bookMetadata.author && (
                  <div>
                    <span className="text-muted-foreground">المؤلف:</span>
                    <p className="font-bold">{product.bookMetadata.author}</p>
                  </div>
                )}
                {product.bookMetadata.publisher && (
                  <div>
                    <span className="text-muted-foreground">دار النشر:</span>
                    <p className="font-bold">{product.bookMetadata.publisher}</p>
                  </div>
                )}
                {product.bookMetadata.grade && (
                  <div>
                    <span className="text-muted-foreground">الصف الدراسي:</span>
                    <p className="font-bold">{product.bookMetadata.grade}</p>
                  </div>
                )}
                {product.bookMetadata.subject && (
                  <div>
                    <span className="text-muted-foreground">المادة:</span>
                    <p className="font-bold">{product.bookMetadata.subject}</p>
                  </div>
                )}
                {product.bookMetadata.term && (
                  <div>
                    <span className="text-muted-foreground">الفصل الدراسي:</span>
                    <p className="font-bold">{product.bookMetadata.term}</p>
                  </div>
                )}
              </div>
            </div>
          )}

          {/* Variants list if exists */}
          {product.hasVariants && product.variants && product.variants.length > 0 && (
            <div className="space-y-2">
              <h4 className="text-xs font-bold text-muted-foreground flex items-center gap-1.5">
                <Layers className="w-4 h-4 text-primary" />
                المتغيرات والألوان المسجلة ({product.variants.length})
              </h4>
              <div className="space-y-1.5 max-h-40 overflow-y-auto">
                {product.variants.map((v) => (
                  <div
                    key={v.id}
                    className="flex items-center justify-between p-2 bg-card rounded-lg border border-border/50 text-xs"
                  >
                    <div>
                      <span className="font-bold text-foreground">{v.name}</span>
                      <span className="text-[10px] font-mono text-muted-foreground mr-2">SKU: {v.sku}</span>
                      {v.barcode && (
                        <span className="text-[10px] font-mono text-muted-foreground mr-2">
                          باركود: {v.barcode}
                        </span>
                      )}
                    </div>
                    <div className="flex items-center gap-2">
                      <span className="font-bold text-primary">{(v.sellingPrice ?? product.sellingPrice).toFixed(2)} ج.م</span>
                      {onPrintBarcode && (
                        <Button
                          type="button"
                          variant="ghost"
                          size="icon"
                          className="w-6 h-6"
                          title="طباعة باركود المتغير"
                          onClick={() => onPrintBarcode(product, v)}
                        >
                          <Printer className="w-3.5 h-3.5" />
                        </Button>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Stock Balances Across Locations */}
          <div className="bg-muted/30 p-3.5 rounded-xl border border-border/60 space-y-2.5">
            <h4 className="text-xs font-bold text-muted-foreground flex items-center gap-1.5">
              <Package className="w-4 h-4 text-primary" />
              أرصدة المخزون بالمواقع والفروع
            </h4>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 text-xs">
              <div className="p-2.5 rounded-lg bg-card border border-border/50 flex items-center justify-between">
                <div>
                  <span className="font-bold block">المخزن الرئيسي (المركزي)</span>
                  <span className="text-[11px] text-muted-foreground">حد الطلب: {product.reorderPoint || 10}</span>
                </div>
                <Badge variant="outline" className="text-xs font-bold font-mono">
                  رصيد المخزن متاح
                </Badge>
              </div>

              <div className="p-2.5 rounded-lg bg-card border border-border/50 flex items-center justify-between">
                <div>
                  <span className="font-bold block">فرع المبيعات الافتراضي</span>
                  <span className="text-[11px] text-muted-foreground">سعر التكلفة: {product.purchasePrice} ج.م</span>
                </div>
                <Badge variant="secondary" className="text-xs font-bold font-mono">
                  متزامن مع الحركات
                </Badge>
              </div>
            </div>
          </div>
        </div>

        <DialogFooter className="flex flex-col sm:flex-row gap-2 border-t pt-3">
          <div className="flex gap-2 w-full sm:w-auto">
            {onPrintBarcode && (
              <Button
                type="button"
                variant="outline"
                className="gap-1.5 font-bold"
                onClick={() => onPrintBarcode(product)}
              >
                <Printer className="w-4 h-4" />
                طباعة الباركود
              </Button>
            )}

            {canEdit && onEdit && (
              <Button
                type="button"
                variant="outline"
                className="gap-1.5 font-bold"
                onClick={() => {
                  onOpenChange(false);
                  onEdit(product);
                }}
              >
                <Edit2 className="w-4 h-4" />
                تعديل البيانات
              </Button>
            )}
          </div>

          <div className="flex gap-2">
            {canEdit && (
              product.archived ? (
                onRestore && (
                  <Button
                    type="button"
                    variant="ghost"
                    className="text-green-600 gap-1.5 text-xs font-bold"
                    onClick={() => {
                      onRestore(product.id);
                      onOpenChange(false);
                    }}
                  >
                    <RotateCcw className="w-4 h-4" />
                    استعادة الصنف
                  </Button>
                )
              ) : (
                onArchive && (
                  <Button
                    type="button"
                    variant="ghost"
                    className="text-destructive gap-1.5 text-xs font-bold"
                    onClick={() => {
                      onArchive(product.id);
                      onOpenChange(false);
                    }}
                  >
                    <Archive className="w-4 h-4" />
                    أرشفة الصنف
                  </Button>
                )
              )
            )}
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
              إغلاق
            </Button>
          </div>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
