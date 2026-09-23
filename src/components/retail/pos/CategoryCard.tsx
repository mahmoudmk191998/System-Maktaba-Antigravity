import React, { useState } from 'react';
import { cn } from '@/lib/utils';
import { BookOpen, FolderTree, ShoppingBag, Tag, Layers, ChevronLeft } from 'lucide-react';
import type { ProductCategory } from '@/types/retail.types';

export interface CategoryCardProps {
  category?: ProductCategory;
  isAllProducts?: boolean;
  isUncategorized?: boolean;
  productCount?: number;
  subCategoryCount?: number;
  onClick: () => void;
  className?: string;
}

const DETERMINISTIC_PALETTES = [
  {
    bg: 'from-blue-500/15 via-indigo-500/10 to-purple-500/15',
    border: 'hover:border-blue-500/70',
    iconColor: 'text-blue-600 dark:text-blue-400',
    badge: 'bg-blue-500/10 text-blue-700 dark:text-blue-300 border-blue-500/20',
  },
  {
    bg: 'from-emerald-500/15 via-teal-500/10 to-cyan-500/15',
    border: 'hover:border-emerald-500/70',
    iconColor: 'text-emerald-600 dark:text-emerald-400',
    badge: 'bg-emerald-500/10 text-emerald-700 dark:text-emerald-300 border-emerald-500/20',
  },
  {
    bg: 'from-amber-500/15 via-orange-500/10 to-yellow-500/15',
    border: 'hover:border-amber-500/70',
    iconColor: 'text-amber-600 dark:text-amber-400',
    badge: 'bg-amber-500/10 text-amber-700 dark:text-amber-300 border-amber-500/20',
  },
  {
    bg: 'from-purple-500/15 via-fuchsia-500/10 to-pink-500/15',
    border: 'hover:border-purple-500/70',
    iconColor: 'text-purple-600 dark:text-purple-400',
    badge: 'bg-purple-500/10 text-purple-700 dark:text-purple-300 border-purple-500/20',
  },
  {
    bg: 'from-sky-500/15 via-blue-500/10 to-indigo-500/15',
    border: 'hover:border-sky-500/70',
    iconColor: 'text-sky-600 dark:text-sky-400',
    badge: 'bg-sky-500/10 text-sky-700 dark:text-sky-300 border-sky-500/20',
  },
  {
    bg: 'from-rose-500/15 via-pink-500/10 to-red-500/15',
    border: 'hover:border-rose-500/70',
    iconColor: 'text-rose-600 dark:text-rose-400',
    badge: 'bg-rose-500/10 text-rose-700 dark:text-rose-300 border-rose-500/20',
  },
];

function getPalette(key: string) {
  let hash = 0;
  for (let i = 0; i < key.length; i++) {
    hash = key.charCodeAt(i) + ((hash << 5) - hash);
  }
  const idx = Math.abs(hash) % DETERMINISTIC_PALETTES.length;
  return DETERMINISTIC_PALETTES[idx];
}

export function CategoryCard({
  category,
  isAllProducts = false,
  isUncategorized = false,
  productCount,
  subCategoryCount,
  onClick,
  className,
}: CategoryCardProps) {
  const [imgError, setImgError] = useState(false);

  // 1. All Products System Card
  if (isAllProducts) {
    return (
      <button
        type="button"
        onClick={onClick}
        aria-label="كل الأصناف"
        className={cn(
          "group relative flex flex-col justify-between overflow-hidden rounded-2xl border border-primary/30",
          "bg-gradient-to-br from-primary/15 via-primary/5 to-background p-3.5 text-right",
          "transition-all duration-200 hover:border-primary hover:shadow-lg hover:-translate-y-0.5 active:scale-[0.98]",
          "aspect-[4/3] min-h-[120px] sm:min-h-[140px] focus:outline-none focus-visible:ring-2 focus-visible:ring-primary shadow-sm",
          className
        )}
      >
        <div className="flex items-center justify-between w-full">
          <div className="w-10 h-10 rounded-xl bg-primary/20 text-primary flex items-center justify-center shadow-sm group-hover:scale-110 transition-transform">
            <Layers className="w-5 h-5" />
          </div>
          <span className="text-[10px] font-black px-2 py-0.5 rounded-full bg-primary/15 text-primary border border-primary/20">
            شامل
          </span>
        </div>

        <div className="mt-auto space-y-0.5">
          <h3 className="font-black text-sm sm:text-base text-foreground leading-tight group-hover:text-primary transition-colors">
            كل الأصناف
          </h3>
          <p className="text-[11px] text-muted-foreground font-medium truncate">
            {productCount !== undefined ? `${productCount} صنف متاح` : 'عرض كافة المنتجات'}
          </p>
        </div>

        <div className="absolute left-2.5 bottom-2.5 opacity-0 group-hover:opacity-100 transition-opacity">
          <ChevronLeft className="w-4 h-4 text-primary" />
        </div>
      </button>
    );
  }

  // 2. Uncategorized System Card
  if (isUncategorized) {
    return (
      <button
        type="button"
        onClick={onClick}
        aria-label="أصناف بدون تصنيف"
        className={cn(
          "group relative flex flex-col justify-between overflow-hidden rounded-2xl border border-dashed border-border/80",
          "bg-gradient-to-br from-muted/60 via-muted/30 to-background p-3.5 text-right",
          "transition-all duration-200 hover:border-primary/80 hover:shadow-md hover:-translate-y-0.5 active:scale-[0.98]",
          "aspect-[4/3] min-h-[120px] sm:min-h-[140px] focus:outline-none focus-visible:ring-2 focus-visible:ring-primary shadow-sm",
          className
        )}
      >
        <div className="flex items-center justify-between w-full">
          <div className="w-10 h-10 rounded-xl bg-muted text-muted-foreground flex items-center justify-center shadow-sm group-hover:scale-110 transition-transform">
            <Tag className="w-5 h-5" />
          </div>
          <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-muted text-muted-foreground border border-border">
            عام
          </span>
        </div>

        <div className="mt-auto space-y-0.5">
          <h3 className="font-black text-sm sm:text-base text-foreground leading-tight group-hover:text-primary transition-colors">
            بدون تصنيف
          </h3>
          <p className="text-[11px] text-muted-foreground font-medium truncate">
            {productCount !== undefined ? `${productCount} صنف` : 'أصناف غير مصنفة'}
          </p>
        </div>
      </button>
    );
  }

  if (!category) return null;

  const rawUrl = category.imageUrl || category.image;
  const hasValidImage = Boolean(rawUrl && rawUrl.trim() && !imgError);
  const palette = getPalette(category.id || category.name);

  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={category.name}
      className={cn(
        "group relative flex flex-col justify-end overflow-hidden rounded-2xl border border-border/80",
        "bg-card text-card-foreground text-right shadow-sm",
        "transition-all duration-200 hover:shadow-xl hover:-translate-y-0.5 active:scale-[0.98]",
        "aspect-[4/3] min-h-[125px] sm:min-h-[145px] focus:outline-none focus-visible:ring-2 focus-visible:ring-primary",
        palette.border,
        className
      )}
    >
      {/* Visual Background: Image or Deterministic Gradient Fallback */}
      {hasValidImage ? (
        <>
          <img
            src={rawUrl!.trim()}
            alt={category.name}
            loading="lazy"
            onError={() => setImgError(true)}
            className="absolute inset-0 h-full w-full object-cover transition-transform duration-300 group-hover:scale-108"
          />
          {/* Subtle gradient overlay for contrast and legibility */}
          <div className="absolute inset-0 bg-gradient-to-t from-black/85 via-black/45 to-black/10 transition-opacity group-hover:from-black/90 group-hover:via-black/50" />
        </>
      ) : (
        <div
          className={cn(
            "absolute inset-0 bg-gradient-to-br transition-all duration-200 flex flex-col items-center justify-center p-3",
            palette.bg
          )}
        >
          <div className={cn("w-12 h-12 rounded-2xl bg-background/80 shadow-sm flex items-center justify-center mb-1 group-hover:scale-110 transition-transform", palette.iconColor)}>
            <FolderTree className="w-6 h-6" />
          </div>
          <span className="text-[10px] font-black opacity-30 select-none uppercase tracking-widest text-foreground">
            {category.name.slice(0, 3)}
          </span>
        </div>
      )}

      {/* Top Badge (Subcategory indicator or Product Count) */}
      <div className="absolute top-2.5 right-2.5 z-10 flex items-center gap-1">
        {subCategoryCount !== undefined && subCategoryCount > 0 ? (
          <span
            className={cn(
              "text-[10px] font-black px-2 py-0.5 rounded-full border shadow-sm backdrop-blur-md",
              hasValidImage
                ? "bg-black/50 text-white border-white/20"
                : palette.badge
            )}
          >
            {subCategoryCount} فرعي
          </span>
        ) : productCount !== undefined ? (
          <span
            className={cn(
              "text-[10px] font-black px-2 py-0.5 rounded-full border shadow-sm backdrop-blur-md",
              hasValidImage
                ? "bg-black/50 text-white border-white/20"
                : palette.badge
            )}
          >
            {productCount} صنف
          </span>
        ) : null}
      </div>

      {/* Category Info (Bottom Aligned) */}
      <div className="relative z-10 p-3 sm:p-3.5 w-full flex items-end justify-between gap-1">
        <div className="space-y-0.5 overflow-hidden">
          <h3
            className={cn(
              "font-black text-sm sm:text-base leading-tight line-clamp-2 transition-colors",
              hasValidImage
                ? "text-white drop-shadow-md group-hover:text-primary-foreground"
                : "text-foreground group-hover:text-primary"
            )}
          >
            {category.name}
          </h3>
          {category.description && (
            <p
              className={cn(
                "text-[10px] truncate max-w-[180px]",
                hasValidImage ? "text-white/70" : "text-muted-foreground"
              )}
            >
              {category.description}
            </p>
          )}
        </div>

        <div
          className={cn(
            "w-6 h-6 rounded-full flex items-center justify-center shrink-0 opacity-0 group-hover:opacity-100 transition-opacity transform translate-x-1 group-hover:translate-x-0",
            hasValidImage ? "bg-white/20 text-white" : "bg-primary/20 text-primary"
          )}
        >
          <ChevronLeft className="w-3.5 h-3.5" />
        </div>
      </div>
    </button>
  );
}
