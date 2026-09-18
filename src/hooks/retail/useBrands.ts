/**
 * React Hook for Retail Brands
 */

import { useState, useEffect, useCallback } from 'react';
import { useAppStore } from '@/lib/store';
import { useTenantBranch } from '@/hooks/useDatabase';
import type { Brand } from '@/types/retail.types';
import {
  fetchBrandsFromDb,
  saveBrandToDb,
  deleteBrandFromDb,
} from '@/services/brands/brands.service';

const BRANDS_SYNC_EVENT = 'alwan_brands_synced';

export function useBrands() {
  const currentTenant = useAppStore((state) => state.currentTenant);
  const { tenantId: hookTenantId } = useTenantBranch();
  const tenantId = currentTenant?.id || hookTenantId || '';

  const [brands, setBrands] = useState<Brand[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const loadBrands = useCallback(async () => {
    if (!tenantId) {
      setBrands([]);
      setLoading(false);
      return;
    }

    setLoading(true);
    setError(null);

    try {
      const data = await fetchBrandsFromDb(tenantId);
      setBrands(data);
    } catch (err: any) {
      console.error('Error fetching brands:', err);
      setError(err?.message || 'تعذر تحميل قائمة الماركات');
    } finally {
      setLoading(false);
    }
  }, [tenantId]);

  useEffect(() => {
    loadBrands();
  }, [loadBrands]);

  useEffect(() => {
    const handleSync = () => {
      loadBrands();
    };
    window.addEventListener(BRANDS_SYNC_EVENT, handleSync);
    return () => window.removeEventListener(BRANDS_SYNC_EVENT, handleSync);
  }, [loadBrands]);

  const saveBrand = async (
    brandData: Omit<Brand, 'id' | 'createdAt' | 'updatedAt' | 'tenantId'> & { id?: string }
  ) => {
    const res = await saveBrandToDb(tenantId, brandData);
    if (res.success && res.brand) {
      await loadBrands();
      window.dispatchEvent(new CustomEvent(BRANDS_SYNC_EVENT));
    }
    return res;
  };

  const deleteBrand = async (brandId: string) => {
    const res = await deleteBrandFromDb(tenantId, brandId);
    if (res.success) {
      await loadBrands();
      window.dispatchEvent(new CustomEvent(BRANDS_SYNC_EVENT));
    }
    return res;
  };

  return {
    brands,
    loading,
    error,
    refresh: loadBrands,
    saveBrand,
    deleteBrand,
  };
}
