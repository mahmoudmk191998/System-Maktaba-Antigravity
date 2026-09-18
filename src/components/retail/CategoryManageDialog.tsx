/**
 * Product Category Management Dialog
 * Allows creating, editing, and nested parent-child category management
 * with circular hierarchy prevention.
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
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Plus, Edit2, Trash2, FolderTree, AlertCircle } from 'lucide-react';
import { useCategories } from '@/hooks/retail/useCategories';
import type { ProductCategory } from '@/types/retail.types';
import { toast } from 'sonner';

interface CategoryManageDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function CategoryManageDialog({ open, onOpenChange }: CategoryManageDialogProps) {
  const { categories, tree, loading, saveCategory, deleteCategory } = useCategories();

  const [editingCat, setEditingCat] = useState<ProductCategory | null>(null);
  const [name, setName] = useState('');
  const [parentId, setParentId] = useState<string>('none');
  const [sortOrder, setSortOrder] = useState('0');
  const [isSubmitting, setIsSubmitting] = useState(false);

  const resetForm = () => {
    setEditingCat(null);
    setName('');
    setParentId('none');
    setSortOrder('0');
  };

  const handleEdit = (cat: ProductCategory) => {
    setEditingCat(cat);
    setName(cat.name);
    setParentId(cat.parentId || 'none');
    setSortOrder((cat.sortOrder || 0).toString());
  };

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim()) {
      toast.error('اسم التصنيف مطلوب');
      return;
    }

    setIsSubmitting(true);
    try {
      const res = await saveCategory({
        id: editingCat?.id,
        name: name.trim(),
        nameAr: name.trim(),
        parentId: parentId === 'none' ? null : parentId,
        sortOrder: parseInt(sortOrder) || 0,
        active: true,
      });

      if (res.success) {
        toast.success(editingCat ? 'تم تحديث التصنيف بنجاح' : 'تم إضافة التصنيف بنجاح');
        resetForm();
      } else {
        toast.error(res.error || 'فشل حفظ التصنيف');
      }
    } catch (err: any) {
      toast.error(err?.message || 'حدث خطأ');
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleDelete = async (id: string) => {
    if (!confirm('هل أنت متأكد من رغبتك في حذف هذا التصنيف؟')) return;

    try {
      const res = await deleteCategory(id);
      if (res.success) {
        toast.success('تم حذف التصنيف بنجاح');
        if (editingCat?.id === id) resetForm();
      } else {
        toast.error(res.error || 'تعذر حذف التصنيف');
      }
    } catch (err: any) {
      toast.error(err?.message || 'حدث خطأ أثناء الحذف');
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg max-h-[90vh] overflow-y-auto" dir="rtl">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-lg font-bold">
            <FolderTree className="w-5 h-5 text-primary" />
            إدارة تصنيفات المنتجات (Categories)
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-4 py-2">
          {/* Create / Edit Form */}
          <form onSubmit={handleSave} className="bg-muted/30 p-3.5 rounded-xl border border-border/60 space-y-3">
            <h4 className="text-xs font-bold text-muted-foreground">
              {editingCat ? `تعديل تصنيف: ${editingCat.name}` : 'إضافة تصنيف جديد'}
            </h4>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div>
                <Label className="text-xs">اسم التصنيف *</Label>
                <Input
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder="مثال: أدوات كتابية، كشاكيل..."
                  className="mt-1"
                />
              </div>

              <div>
                <Label className="text-xs">التصنيف الرئيسي (الأب)</Label>
                <Select value={parentId} onValueChange={setParentId}>
                  <SelectTrigger className="mt-1">
                    <SelectValue placeholder="تصنيف رئيسي (بدون أب)" />
                  </SelectTrigger>
                  <SelectContent dir="rtl">
                    <SelectItem value="none">تصنيف رئيسي (بدون أب)</SelectItem>
                    {categories
                      .filter((c) => !editingCat || c.id !== editingCat.id)
                      .map((c) => (
                        <SelectItem key={c.id} value={c.id}>
                          {c.name}
                        </SelectItem>
                      ))}
                  </SelectContent>
                </Select>
              </div>
            </div>

            <div className="flex items-center justify-end gap-2 pt-1">
              {editingCat && (
                <Button type="button" variant="ghost" size="sm" onClick={resetForm}>
                  إلغاء التعديل
                </Button>
              )}
              <Button type="submit" size="sm" disabled={isSubmitting} className="gap-1.5 font-bold">
                <Plus className="w-4 h-4" />
                {editingCat ? 'حفظ التعديلات' : 'إضافة التصنيف'}
              </Button>
            </div>
          </form>

          {/* Existing Categories Tree / List */}
          <div className="space-y-2">
            <Label className="text-xs text-muted-foreground block">
              شجرة التصنيفات الحالية ({categories.length})
            </Label>

            {categories.length === 0 && !loading && (
              <p className="text-center py-6 text-sm text-muted-foreground bg-muted/10 rounded-xl border border-dashed">
                لم يتم إضافة تصنيفات بعد. أضف أول تصنيف أعلاه.
              </p>
            )}

            <div className="max-h-60 overflow-y-auto space-y-1.5 pr-1">
              {categories.map((cat) => {
                const parent = categories.find((c) => c.id === cat.parentId);
                return (
                  <div
                    key={cat.id}
                    className="flex items-center justify-between p-2.5 bg-card hover:bg-muted/40 rounded-lg border border-border/60 transition-colors text-sm"
                  >
                    <div>
                      <span className="font-bold text-foreground">{cat.name}</span>
                      {parent && (
                        <span className="text-xs text-muted-foreground mr-2">
                          (تابع لـ: {parent.name})
                        </span>
                      )}
                    </div>
                    <div className="flex items-center gap-1">
                      <Button
                        type="button"
                        variant="ghost"
                        size="icon"
                        className="w-7 h-7"
                        onClick={() => handleEdit(cat)}
                      >
                        <Edit2 className="w-3.5 h-3.5 text-muted-foreground" />
                      </Button>
                      <Button
                        type="button"
                        variant="ghost"
                        size="icon"
                        className="w-7 h-7 text-destructive hover:text-destructive hover:bg-destructive/10"
                        onClick={() => handleDelete(cat.id)}
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </Button>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
