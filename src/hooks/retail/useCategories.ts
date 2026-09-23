/**
 * React Hook for Retail Categories
 */

import { useState, useEffect, useCallback } from 'react';
import { useAppStore } from '@/lib/store';
import { useTenantBranch } from '@/hooks/useDatabase';
import type { ProductCategory } from '@/types/retail.types';
import {
  fetchCategoriesFromDb,
  saveCategoryToDb,
  deleteCategoryFromDb,
  buildCategoryTree,
  CategoryTreeNode,
} from '@/services/categories/categories.service';
import { offlineCacheService, isGenuineTransportError } from '@/services/offline';

const CATEGORIES_SYNC_EVENT = 'alwan_categories_synced';

export function useCategories() {
  const currentTenant = useAppStore((state) => state.currentTenant);
  const { tenantId: hookTenantId } = useTenantBranch();
  const tenantId = currentTenant?.id || hookTenantId || '';

  const [categories, setCategories] = useState<ProductCategory[]>([]);
  const [tree, setTree] = useState<CategoryTreeNode[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const loadCategories = useCallback(async () => {
    if (!tenantId) {
      setCategories([]);
      setTree([]);
      setLoading(false);
      return;
    }

    setLoading(true);
    setError(null);

    // 1. Zero-latency offline bootstrap
    if (!navigator.onLine) {
      try {
        const cached = await offlineCacheService.getCachedCategories(tenantId);
        setCategories(cached);
        setTree(buildCategoryTree(cached));
      } catch {
        setCategories([]);
        setTree([]);
      } finally {
        setLoading(false);
      }
      return;
    }

    try {
      const data = await fetchCategoriesFromDb(tenantId);
      setCategories(data);
      setTree(buildCategoryTree(data));
      if (data && data.length > 0) {
        offlineCacheService.cacheCategories(tenantId, data).catch(() => {});
      }
    } catch (err: any) {
      console.error('Error fetching categories:', err);
      if (isGenuineTransportError(err) || !navigator.onLine || err?.code === 'unavailable') {
        try {
          const cached = await offlineCacheService.getCachedCategories(tenantId);
          setCategories(cached);
          setTree(buildCategoryTree(cached));
        } catch {
          setError('تعذر تحميل التصنيفات محلياً');
        }
      } else {
        setError(err?.message || 'تعذر تحميل قائمة التصنيفات');
      }
    } finally {
      setLoading(false);
    }
  }, [tenantId]);

  useEffect(() => {
    loadCategories();
  }, [loadCategories]);

  // Global event listener to keep all components in sync across dialogs/pages
  useEffect(() => {
    const handleSync = () => {
      loadCategories();
    };
    window.addEventListener(CATEGORIES_SYNC_EVENT, handleSync);
    return () => window.removeEventListener(CATEGORIES_SYNC_EVENT, handleSync);
  }, [loadCategories]);

  const saveCategory = async (
    categoryData: Omit<ProductCategory, 'id' | 'createdAt' | 'updatedAt' | 'tenantId'> & { id?: string }
  ) => {
    const res = await saveCategoryToDb(tenantId, categoryData, categories);
    if (res.success && res.category) {
      await loadCategories();
      // Notify all other mounted instances of useCategories across the app
      window.dispatchEvent(new CustomEvent(CATEGORIES_SYNC_EVENT));
    }
    return res;
  };

  const deleteCategory = async (categoryId: string) => {
    const res = await deleteCategoryFromDb(tenantId, categoryId, categories);
    if (res.success) {
      await loadCategories();
      window.dispatchEvent(new CustomEvent(CATEGORIES_SYNC_EVENT));
    }
    return res;
  };

  return {
    categories,
    tree,
    loading,
    error,
    refresh: loadCategories,
    saveCategory,
    deleteCategory,
  };
}
