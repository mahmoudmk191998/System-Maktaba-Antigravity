/**
 * Brand Management Dialog for Bookstore & Stationery
 */

import React, { useState } from 'react';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Plus, Edit2, Trash2, Award } from 'lucide-react';
import { useBrands } from '@/hooks/retail/useBrands';
import type { Brand } from '@/types/retail.types';
import { toast } from 'sonner';

interface BrandManageDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function BrandManageDialog({ open, onOpenChange }: BrandManageDialogProps) {
  const { brands, loading, saveBrand, deleteBrand } = useBrands();

  const [editingBrand, setEditingBrand] = useState<Brand | null>(null);
  const [name, setName] = useState('');
  const [nameEn, setNameEn] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);

  const resetForm = () => {
    setEditingBrand(null);
    setName('');
    setNameEn('');
  };

  const handleEdit = (brand: Brand) => {
    setEditingBrand(brand);
    setName(brand.name);
    setNameEn(brand.nameEn || '');
  };

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim()) {
      toast.error('اسم الماركة أو دار النشر مطلوب');
      return;
    }

    setIsSubmitting(true);
    try {
      const res = await saveBrand({
        id: editingBrand?.id,
        name: name.trim(),
        nameAr: name.trim(),
        nameEn: nameEn.trim(),
        active: true,
      });

      if (res.success) {
        toast.success(editingBrand ? 'تم تحديث الماركة بنجاح' : 'تم إضافة الماركة بنجاح');
        resetForm();
      } else {
        toast.error(res.error || 'فشل حفظ الماركة');
      }
    } catch (err: any) {
      toast.error(err?.message || 'حدث خطأ');
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleDelete = async (id: string) => {
    if (!confirm('هل أنت متأكد من رغبتك في حذف هذه الماركة؟')) return;

    try {
      const res = await deleteBrand(id);
      if (res.success) {
        toast.success('تم حذف الماركة بنجاح');
        if (editingBrand?.id === id) resetForm();
      } else {
        toast.error(res.error || 'تعذر حذف الماركة');
      }
    } catch (err: any) {
      toast.error(err?.message || 'حدث خطأ أثناء الحذف');
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md max-h-[90vh] overflow-y-auto" dir="rtl">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-lg font-bold">
            <Award className="w-5 h-5 text-primary" />
            إدارة الماركات ودور النشر (Brands & Publishers)
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-4 py-2">
          {/* Create / Edit Form */}
          <form onSubmit={handleSave} className="bg-muted/30 p-3.5 rounded-xl border border-border/60 space-y-3">
            <h4 className="text-xs font-bold text-muted-foreground">
              {editingBrand ? `تعديل ماركة: ${editingBrand.name}` : 'إضافة ماركة / ناشر جديد'}
            </h4>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div>
                <Label className="text-xs">الاسم بالعربية *</Label>
                <Input
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder="مثال: روترنج، كاسيو، دار الشروق..."
                  className="mt-1"
                />
              </div>

              <div>
                <Label className="text-xs">الاسم بالإنجليزية (اختياري)</Label>
                <Input
                  value={nameEn}
                  onChange={(e) => setNameEn(e.target.value)}
                  placeholder="مثال: Rotring, Casio..."
                  className="mt-1"
                />
              </div>
            </div>

            <div className="flex items-center justify-end gap-2 pt-1">
              {editingBrand && (
                <Button type="button" variant="ghost" size="sm" onClick={resetForm}>
                  إلغاء التعديل
                </Button>
              )}
              <Button type="submit" size="sm" disabled={isSubmitting} className="gap-1.5 font-bold">
                <Plus className="w-4 h-4" />
                {editingBrand ? 'حفظ التعديلات' : 'إضافة الماركة'}
              </Button>
            </div>
          </form>

          {/* List */}
          <div className="space-y-2">
            <Label className="text-xs text-muted-foreground block">
              قائمة الماركات ودور النشر المسجلة ({brands.length})
            </Label>

            {brands.length === 0 && !loading && (
              <p className="text-center py-6 text-sm text-muted-foreground bg-muted/10 rounded-xl border border-dashed">
                لم يتم إضافة ماركات بعد.
              </p>
            )}

            <div className="max-h-60 overflow-y-auto space-y-1.5 pr-1">
              {brands.map((brand) => (
                <div
                  key={brand.id}
                  className="flex items-center justify-between p-2.5 bg-card hover:bg-muted/40 rounded-lg border border-border/60 transition-colors text-sm"
                >
                  <div>
                    <span className="font-bold text-foreground">{brand.name}</span>
                    {brand.nameEn && (
                      <span className="text-xs text-muted-foreground mr-2 font-mono">
                        ({brand.nameEn})
                      </span>
                    )}
                  </div>
                  <div className="flex items-center gap-1">
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon"
                      className="w-7 h-7"
                      onClick={() => handleEdit(brand)}
                    >
                      <Edit2 className="w-3.5 h-3.5 text-muted-foreground" />
                    </Button>
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon"
                      className="w-7 h-7 text-destructive hover:text-destructive hover:bg-destructive/10"
                      onClick={() => handleDelete(brand.id)}
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </Button>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
