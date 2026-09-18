import { useState, useEffect, useCallback } from 'react';
import { useAppStore } from '@/lib/store';
import { useTenantBranch } from '@/hooks/useDatabase';
import {
  fetchSalesFromDb,
  getSaleById,
  type FetchSalesOptions,
} from '@/services/sales/sales.service';
import type { Sale } from '@/types/retail.types';
import type { DocumentSnapshot } from 'firebase/firestore';

export function useSales() {
  const currentTenant = useAppStore((state) => state.currentTenant);
  const currentBranch = useAppStore((state) => state.currentBranch);
  const { tenantId: fallbackTenantId, branchId: fallbackBranchId } = useTenantBranch();
  const tenantId = currentTenant?.id || fallbackTenantId || '';
  const branchId = currentBranch?.id || fallbackBranchId || '';

  const [sales, setSales] = useState<Sale[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [hasMore, setHasMore] = useState(false);
  const [lastVisible, setLastVisible] = useState<DocumentSnapshot | undefined>(undefined);

  const loadSales = useCallback(
    async (options: FetchSalesOptions = {}, append = false) => {
      if (!tenantId) return;
      setLoading(true);
      setError(null);
      try {
        const res = await fetchSalesFromDb(tenantId, {
          branchId: options.branchId !== undefined ? options.branchId : branchId,
          ...options,
        });

        if (append) {
          setSales((prev) => [...prev, ...res.sales]);
        } else {
          setSales(res.sales);
        }

        setHasMore(res.hasMore);
        setLastVisible(res.lastVisible);
      } catch (err: any) {
        setError(err.message || 'تعذر تحميل فواتير المبيعات');
      } finally {
        setLoading(false);
      }
    },
    [tenantId, branchId]
  );

  useEffect(() => {
    if (tenantId) {
      loadSales();
    }
    const handleSalesSync = () => {
      loadSales();
    };
    window.addEventListener('alwan_sales_synced', handleSalesSync);
    return () => {
      window.removeEventListener('alwan_sales_synced', handleSalesSync);
    };
  }, [tenantId, branchId, loadSales]);

  const loadMore = useCallback(
    (options: FetchSalesOptions = {}) => {
      if (!hasMore || loading || !lastVisible) return;
      loadSales({ ...options, lastVisible }, true);
    },
    [hasMore, loading, lastVisible, loadSales]
  );

  const fetchSingleSale = useCallback(
    async (saleId: string) => {
      if (!tenantId || !saleId) return null;
      return getSaleById(tenantId, saleId);
    },
    [tenantId]
  );

  return {
    sales,
    loading,
    error,
    hasMore,
    refresh: loadSales,
    loadMore,
    fetchSingleSale,
  };
}
