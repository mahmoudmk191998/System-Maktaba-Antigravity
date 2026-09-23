import React from 'react';
import { CategoryCard } from './CategoryCard';
import type { ProductCategory } from '@/types/retail.types';
import { FolderTree, Plus, Settings2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';

export interface CategoryVisualGridProps {
  categories: ProductCategory[];
  loading?: boolean;
  totalProductsCount?: number;
  uncategorizedCount?: number;
  productCountsMap?: Record<string, number>;
  subCategoryCountsMap?: Record<string, number>;
  showAllProductsCard?: boolean;
  showUncategorizedCard?: boolean;
  onSelectCategory: (category: ProductCategory) => void;
  onSelectAllProducts: () => void;
  onSelectUncategorized: () => void;
  onOpenManageCategories?: () => void;
}

export function CategoryVisualGrid({
  categories,
  loading = false,
  totalProductsCount,
  uncategorizedCount = 0,
  productCountsMap = {},
  subCategoryCountsMap = {},
  showAllProductsCard = true,
  showUncategorizedCard = true,
  onSelectCategory,
  onSelectAllProducts,
  onSelectUncategorized,
  onOpenManageCategories,
}: CategoryVisualGridProps) {
  // Skeleton Loading Grid (Requirement 53)
  if (loading) {
    return (
      <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 2xl:grid-cols-6 gap-2.5 sm:gap-3 p-1">
        {Array.from({ length: 10 }).map((_, i) => (
          <div
            key={i}
            className="aspect-[4/3] rounded-2xl border border-border/60 bg-card p-3 flex flex-col justify-between overflow-hidden shadow-sm animate-pulse"
          >
            <div className="flex justify-between items-center">
              <Skeleton className="w-9 h-9 rounded-xl" />
              <Skeleton className="w-14 h-4 rounded-full" />
            </div>
            <div className="space-y-1.5 mt-auto">
              <Skeleton className="w-3/4 h-5 rounded-lg" />
              <Skeleton className="w-1/2 h-3.5 rounded-md" />
            </div>
          </div>
        ))}
      </div>
    );
  }

  // Empty State (Requirement 54)
  if (categories.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[300px] text-center p-6 border-2 border-dashed border-border/80 rounded-2xl bg-card/40 my-auto">
        <div className="w-16 h-16 rounded-2xl bg-primary/10 text-primary flex items-center justify-center mb-3 shadow-inner">
          <FolderTree className="w-8 h-8 opacity-80" />
        </div>
        <h3 className="text-base font-bold text-foreground mb-1">
          لا توجد تصنيفات مسجلة بعد
        </h3>
        <p className="text-xs text-muted-foreground max-w-sm mb-4">
          يمكنك إضافة تصنيفات رئيسية وفرعية لتنظيم منتجات المكتبة وتسهيل عملية البيع السريع على الكاشير.
        </p>
        <div className="flex items-center gap-2">
          {showAllProductsCard && totalProductsCount !== undefined && totalProductsCount > 0 && (
            <Button
              type="button"
              variant="default"
              size="sm"
              onClick={onSelectAllProducts}
              className="gap-1.5 font-bold"
            >
              عرض كل المنتجات ({totalProductsCount})
            </Button>
          )}
          {onOpenManageCategories && (
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={onOpenManageCategories}
              className="gap-1.5 font-bold"
            >
              <Plus className="w-4 h-4" />
              إدارة التصنيفات
            </Button>
          )}
        </div>
      </div>
    );
  }

  return (
    <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 2xl:grid-cols-6 gap-2.5 sm:gap-3.5 pb-3">
      {/* 1. All Products System Card (Requirement 41) */}
      {showAllProductsCard && (
        <CategoryCard
          isAllProducts
          productCount={totalProductsCount}
          onClick={onSelectAllProducts}
        />
      )}

      {/* 2. Primary / Filtered Categories Cards (Requirements 1, 11, 12) */}
      {categories.map((cat) => (
        <CategoryCard
          key={cat.id}
          category={cat}
          productCount={productCountsMap[cat.id]}
          subCategoryCount={subCategoryCountsMap[cat.id]}
          onClick={() => onSelectCategory(cat)}
        />
      ))}

      {/* 3. Uncategorized System Card (Requirement 40: only if uncategorized products exist) */}
      {showUncategorizedCard && uncategorizedCount > 0 && (
        <CategoryCard
          isUncategorized
          productCount={uncategorizedCount}
          onClick={onSelectUncategorized}
        />
      )}
    </div>
  );
}
