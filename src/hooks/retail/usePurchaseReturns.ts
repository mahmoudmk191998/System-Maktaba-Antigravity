import { useState, useEffect, useCallback } from 'react';
import { useAppStore } from '@/lib/store';
import {
  fetchPurchaseReturnsFromDb,
  completePurchaseReturnTransaction,
  type FetchPurchaseReturnsOptions,
  type ProcessPurchaseReturnParams,
} from '@/services/purchasing/purchaseReturns.service';
import type { PurchaseReturn } from '@/types/retail.types';
import type { DocumentSnapshot } from 'firebase/firestore';

export function usePurchaseReturns(options: FetchPurchaseReturnsOptions = {}) {
  const currentTenant = useAppStore((state) => state.currentTenant);
  const currentBranch = useAppStore((state) => state.currentBranch);
  const tenantId = currentTenant?.id || '';
  const branchId = currentBranch?.id || '';

  const [purchaseReturns, setPurchaseReturns] = useState<PurchaseReturn[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [hasMore, setHasMore] = useState(false);
  const [lastVisible, setLastVisible] = useState<DocumentSnapshot | undefined>(undefined);

  const loadPurchaseReturns = useCallback(
    async (opts: FetchPurchaseReturnsOptions = {}, append = false) => {
      if (!tenantId) return;
      setLoading(true);
      setError(null);
      try {
        const merged = { ...options, ...opts };
        const res = await fetchPurchaseReturnsFromDb(tenantId, merged);
        if (append) {
          setPurchaseReturns((prev) => [...prev, ...res.returns]);
        } else {
          setPurchaseReturns(res.returns);
        }
        setHasMore(res.hasMore);
        setLastVisible(res.lastVisible);
      } catch (err: any) {
        setError(err.message || 'تعذر تحميل مرتجعات المشتريات');
      } finally {
        setLoading(false);
      }
    },
    [tenantId]
  );

  useEffect(() => {
    if (tenantId) {
      loadPurchaseReturns();
    }
  }, [tenantId, loadPurchaseReturns]);

  const processReturn = useCallback(
    async (params: Omit<ProcessPurchaseReturnParams, 'tenantId' | 'branchId'>) => {
      if (!tenantId || !branchId) throw new Error('المنشأة والفرع غير محددين');
      setLoading(true);
      setError(null);
      try {
        const res = await completePurchaseReturnTransaction({
          tenantId,
          branchId,
          branchCode: currentBranch?.code || 'HQ',
          ...params,
        });
        if (res.success && res.purchaseReturn) {
          setPurchaseReturns((prev) => [res.purchaseReturn!, ...prev]);
        }
        return res;
      } catch (err: any) {
        setError(err.message);
        return { success: false, isIdempotentReplay: false, error: err.message };
      } finally {
        setLoading(false);
      }
    },
    [tenantId, branchId, currentBranch?.code]
  );

  return {
    purchaseReturns,
    loading,
    error,
    hasMore,
    refresh: loadPurchaseReturns,
    loadMore: (opts?: FetchPurchaseReturnsOptions) => {
      if (!hasMore || loading || !lastVisible) return;
      loadPurchaseReturns({ ...opts, lastVisible }, true);
    },
    processReturn,
  };
}
