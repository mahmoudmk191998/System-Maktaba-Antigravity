import React from 'react';
import { Home, ChevronLeft, ArrowRight, X, FolderTree } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import type { ProductCategory } from '@/types/retail.types';

export interface POSCategoryBreadcrumbProps {
  categoryPath: ProductCategory[];
  isAllProducts?: boolean;
  isUncategorized?: boolean;
  searchQuery?: string;
  searchResultsCount?: number;
  onGoToRoot: () => void;
  onGoToBreadcrumbIndex: (index: number) => void;
  onBackOneLevel: () => void;
  onClearSearch?: () => void;
  className?: string;
}

export function POSCategoryBreadcrumb({
  categoryPath,
  isAllProducts = false,
  isUncategorized = false,
  searchQuery = '',
  searchResultsCount = 0,
  onGoToRoot,
  onGoToBreadcrumbIndex,
  onBackOneLevel,
  onClearSearch,
  className,
}: POSCategoryBreadcrumbProps) {
  const isSearchActive = Boolean(searchQuery && searchQuery.trim().length > 0);
  const isAtRoot = categoryPath.length === 0 && !isAllProducts && !isUncategorized && !isSearchActive;

  return (
    <div
      className={cn(
        "flex items-center justify-between gap-2 px-1 py-1.5 border-b border-border/60 shrink-0",
        className
      )}
    >
      {/* Breadcrumb Path Trail */}
      <nav
        aria-label="مسار التصنيفات"
        className="flex items-center gap-1.5 text-xs text-muted-foreground flex-wrap overflow-hidden"
      >
        {/* Root Button */}
        <button
          type="button"
          onClick={onGoToRoot}
          className={cn(
            "flex items-center gap-1.5 py-1 px-2 rounded-lg font-bold transition-colors",
            isAtRoot
              ? "bg-primary/10 text-primary font-black cursor-default"
              : "hover:bg-muted text-muted-foreground hover:text-foreground"
          )}
        >
          <Home className="w-3.5 h-3.5" />
          <span>نقطة البيع (التصنيفات)</span>
        </button>

        {/* Category Path Segments */}
        {categoryPath.map((cat, idx) => {
          const isLast = idx === categoryPath.length - 1 && !isSearchActive;
          return (
            <React.Fragment key={cat.id}>
              <ChevronLeft className="w-3.5 h-3.5 text-muted-foreground/50 shrink-0" />
              <button
                type="button"
                onClick={() => onGoToBreadcrumbIndex(idx)}
                className={cn(
                  "py-1 px-2 rounded-lg transition-colors font-bold truncate max-w-[130px] sm:max-w-[180px]",
                  isLast
                    ? "bg-primary/10 text-primary font-black cursor-default"
                    : "hover:bg-muted text-muted-foreground hover:text-foreground"
                )}
                title={cat.name}
              >
                {cat.name}
              </button>
            </React.Fragment>
          );
        })}

        {/* Special View Indicators */}
        {isAllProducts && !isSearchActive && (
          <>
            <ChevronLeft className="w-3.5 h-3.5 text-muted-foreground/50 shrink-0" />
            <span className="py-1 px-2 rounded-lg bg-primary/10 text-primary font-black">
              كل الأصناف
            </span>
          </>
        )}

        {isUncategorized && !isSearchActive && (
          <>
            <ChevronLeft className="w-3.5 h-3.5 text-muted-foreground/50 shrink-0" />
            <span className="py-1 px-2 rounded-lg bg-muted text-foreground font-black">
              بدون تصنيف
            </span>
          </>
        )}

        {/* Search Results Segment */}
        {isSearchActive && (
          <>
            <ChevronLeft className="w-3.5 h-3.5 text-muted-foreground/50 shrink-0" />
            <span className="py-1 px-2 rounded-lg bg-amber-500/10 text-amber-700 dark:text-amber-400 font-black flex items-center gap-1">
              <span>نتائج البحث: "{searchQuery}"</span>
              <span className="text-[10px] bg-amber-500/20 px-1.5 py-0.2 rounded-full font-mono">
                {searchResultsCount}
              </span>
            </span>
          </>
        )}
      </nav>

      {/* Back Button / Clear Search */}
      {!isAtRoot && (
        <div className="flex items-center gap-1.5 shrink-0">
          {isSearchActive ? (
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={onClearSearch}
              className="h-7 px-2.5 text-xs font-bold gap-1 rounded-xl border-border hover:bg-muted text-muted-foreground hover:text-foreground"
            >
              <X className="w-3.5 h-3.5" />
              <span>إلغاء البحث</span>
            </Button>
          ) : (
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={onBackOneLevel}
              className="h-7 px-2.5 text-xs font-bold gap-1.5 rounded-xl border-border hover:bg-muted text-foreground shadow-sm"
              title="الرجوع إلى المستوى السابق (Esc)"
            >
              <ArrowRight className="w-3.5 h-3.5" />
              <span>العودة للتصنيفات</span>
            </Button>
          )}
        </div>
      )}
    </div>
  );
}
