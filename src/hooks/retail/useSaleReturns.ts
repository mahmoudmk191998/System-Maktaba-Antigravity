import { useState, useEffect, useCallback } from 'react';
import { useAppStore } from '@/lib/store';
import {
  fetchSaleReturnsFromDb,
  completeSaleReturnTransaction,
  completeSaleExchangeTransaction,
  type FetchReturnsOptions,
  type ProcessReturnParams,
  type ProcessExchangeParams,
} from '@/services/sales/saleReturns.service';
import type { SaleReturn, SaleExchange, Sale } from '@/types/retail.types';
import type { DocumentSnapshot } from 'firebase/firestore';

export function useSaleReturns() {
  const currentTenant = useAppStore((state) => state.currentTenant);
  const currentBranch = useAppStore((state) => state.currentBranch);
  const tenantId = currentTenant?.id || '';
  const branchId = currentBranch?.id || '';

  const [returns, setReturns] = useState<SaleReturn[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [hasMore, setHasMore] = useState(false);
  const [lastVisible, setLastVisible] = useState<DocumentSnapshot | undefined>(undefined);

  const loadReturns = useCallback(
    async (options: FetchReturnsOptions = {}, append = false) => {
      if (!tenantId) return;
      setLoading(true);
      setError(null);
      try {
        const res = await fetchSaleReturnsFromDb(tenantId, {
          branchId: options.branchId !== undefined ? options.branchId : branchId,
          ...options,
        });

        if (append) {
          setReturns((prev) => [...prev, ...res.returns]);
        } else {
          setReturns(res.returns);
        }

        setHasMore(res.hasMore);
        setLastVisible(res.lastVisible);
      } catch (err: any) {
        setError(err.message || 'تعذر تحميل سجل المرتجعات');
      } finally {
        setLoading(false);
      }
    },
    [tenantId, branchId]
  );

  useEffect(() => {
    if (tenantId) {
      loadReturns();
    }
  }, [tenantId, branchId, loadReturns]);

  const loadMore = useCallback(
    (options: FetchReturnsOptions = {}) => {
      if (!hasMore || loading || !lastVisible) return;
      loadReturns({ ...options, lastVisible }, true);
    },
    [hasMore, loading, lastVisible, loadReturns]
  );

  const processReturn = useCallback(
    async (params: Omit<ProcessReturnParams, 'tenantId' | 'branchId'>) => {
      if (!tenantId || !branchId) {
        return { success: false, error: 'بيانات الفرع غير متوفرة' };
      }
      setLoading(true);
      setError(null);
      try {
        const res = await completeSaleReturnTransaction({
          tenantId,
          branchId,
          ...params,
        });
        if (res.success && res.saleReturn) {
          setReturns((prev) => [res.saleReturn!, ...prev]);
        }
        return res;
      } catch (err: any) {
        setError(err.message);
        return { success: false, error: err.message };
      } finally {
        setLoading(false);
      }
    },
    [tenantId, branchId]
  );

  const processExchange = useCallback(
    async (params: Omit<ProcessExchangeParams, 'tenantId' | 'branchId'>) => {
      if (!tenantId || !branchId) {
        return { success: false, error: 'بيانات الفرع غير متوفرة' };
      }
      setLoading(true);
      setError(null);
      try {
        const res = await completeSaleExchangeTransaction({
          tenantId,
          branchId,
          ...params,
        });
        if (res.success && res.saleReturn) {
          setReturns((prev) => [res.saleReturn!, ...prev]);
        }
        return res;
      } catch (err: any) {
        setError(err.message);
        return { success: false, error: err.message };
      } finally {
        setLoading(false);
      }
    },
    [tenantId, branchId]
  );

  return {
    returns,
    loading,
    error,
    hasMore,
    refresh: loadReturns,
    loadMore,
    processReturn,
    processExchange,
  };
}
