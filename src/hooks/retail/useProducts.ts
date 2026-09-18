import { useState, useEffect, useCallback } from 'react';
import { useAppStore } from '@/lib/store';
import { useTenantBranch } from '@/hooks/useDatabase';
import type { Product } from '@/types/retail.types';
import {
  fetchProductsFromDb,
  createProductInDb,
  updateProductInDb,
  archiveProductInDb,
  restoreProductInDb,
  findProductOrVariantByBarcode,
  findProductOrVariantBySku,
  FetchProductsOptions,
} from '@/services/products/products.repository';
import { DocumentSnapshot } from 'firebase/firestore';

export function useProducts(initialFilters: FetchProductsOptions = {}) {
  const storeTenant = useAppStore((state) => state.currentTenant);
  const currentUser = useAppStore((state) => state.currentUser);
  const { tenantId: hookTenantId } = useTenantBranch();
  const tenantId = storeTenant?.id || hookTenantId || '';

  const [products, setProducts] = useState<Product[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [hasMore, setHasMore] = useState(false);
  const [lastVisible, setLastVisible] = useState<DocumentSnapshot | undefined>(undefined);
  const [filters, setFilters] = useState<FetchProductsOptions>(initialFilters);

  // Synchronize internal filter state if initialFilters change
  useEffect(() => {
    setFilters((prev) => ({ ...prev, ...initialFilters }));
  }, [
    initialFilters.categoryId,
    initialFilters.brandId,
    initialFilters.productType,
    initialFilters.includeArchived,
    initialFilters.searchTerm,
  ]);

  const loadProducts = useCallback(
    async (overrideFilters?: FetchProductsOptions, append = false) => {
      if (!tenantId) {
        setProducts([]);
        setLoading(false);
        return;
      }

      setLoading(true);
      setError(null);

      const activeFilters = { ...filters, ...overrideFilters };

      try {
        const res = await fetchProductsFromDb(tenantId, {
          ...activeFilters,
          lastVisible: append ? lastVisible : undefined,
        });

        if (append) {
          setProducts((prev) => [...prev, ...res.products]);
        } else {
          setProducts(res.products);
        }

        setLastVisible(res.lastVisible);
        setHasMore(res.hasMore);
      } catch (err: any) {
        console.error('Error fetching products:', err);
        setError(err?.message || 'تعذر تحميل قائمة المنتجات');
      } finally {
        setLoading(false);
      }
    },
    [tenantId, filters, lastVisible]
  );

  useEffect(() => {
    loadProducts();
  }, [
    tenantId,
    filters.categoryId,
    filters.brandId,
    filters.productType,
    filters.includeArchived,
    filters.searchTerm,
  ]);

  // Real-time synchronization across all tabs and components
  useEffect(() => {
    const handleSync = () => {
      loadProducts();
    };
    window.addEventListener('alwan_products_synced', handleSync);
    return () => {
      window.removeEventListener('alwan_products_synced', handleSync);
    };
  }, [loadProducts]);

  const createProduct = async (productData: Omit<Product, 'id' | 'createdAt' | 'updatedAt' | 'tenantId'>) => {
    const res = await createProductInDb(tenantId, productData, currentUser?.id);
    if (res.success && res.product) {
      setProducts((prev) => [res.product!, ...prev]);
      window.dispatchEvent(new CustomEvent('alwan_products_synced'));
    }
    return res;
  };

  const updateProduct = async (productId: string, updateData: Partial<Product>) => {
    const res = await updateProductInDb(tenantId, productId, updateData, currentUser?.id);
    if (res.success && res.product) {
      setProducts((prev) => prev.map((p) => (p.id === productId ? res.product! : p)));
      window.dispatchEvent(new CustomEvent('alwan_products_synced'));
    }
    return res;
  };

  const archiveProduct = async (productId: string) => {
    const res = await archiveProductInDb(tenantId, productId, currentUser?.id);
    if (res.success) {
      if (!filters.includeArchived) {
        setProducts((prev) => prev.filter((p) => p.id !== productId));
      } else {
        setProducts((prev) =>
          prev.map((p) => (p.id === productId ? { ...p, archived: true, active: false } : p))
        );
      }
      window.dispatchEvent(new CustomEvent('alwan_products_synced'));
    }
    return res;
  };

  const restoreProduct = async (productId: string) => {
    const res = await restoreProductInDb(tenantId, productId, currentUser?.id);
    if (res.success) {
      setProducts((prev) =>
        prev.map((p) => (p.id === productId ? { ...p, archived: false, active: true } : p))
      );
      window.dispatchEvent(new CustomEvent('alwan_products_synced'));
    }
    return res;
  };

  const searchBarcode = async (barcode: string) => {
    return findProductOrVariantByBarcode(tenantId, barcode);
  };

  const searchSku = async (sku: string) => {
    return findProductOrVariantBySku(tenantId, sku);
  };

  return {
    products,
    loading,
    error,
    hasMore,
    filters,
    setFilters,
    refresh: () => loadProducts(filters, false),
    loadMore: () => loadProducts(filters, true),
    createProduct,
    updateProduct,
    archiveProduct,
    restoreProduct,
    searchBarcode,
    searchSku,
  };
}
