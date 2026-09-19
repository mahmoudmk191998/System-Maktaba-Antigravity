import { useState, useEffect, useCallback } from 'react';
import { useAppStore } from '@/lib/store';
import {
  fetchGoodsReceiptsFromDb,
  completeGoodsReceiptTransaction,
  type FetchGoodsReceiptsOptions,
  type ProcessGoodsReceiptParams,
} from '@/services/purchasing/goodsReceiving.service';
import type { GoodsReceipt } from '@/types/retail.types';
import type { DocumentSnapshot } from 'firebase/firestore';

export function useGoodsReceiving(options: FetchGoodsReceiptsOptions = {}) {
  const currentTenant = useAppStore((state) => state.currentTenant);
  const currentBranch = useAppStore((state) => state.currentBranch);
  const currentUser = useAppStore((state) => state.currentUser);
  const tenantId =
    currentTenant?.id ||
    (currentTenant as any)?.tenantId ||
    currentUser?.tenantId ||
    (currentUser as any)?.tenant_id ||
    'default';
  const branchId = currentBranch?.id || 'main-branch';

  const [receipts, setReceipts] = useState<GoodsReceipt[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [hasMore, setHasMore] = useState(false);
  const [lastVisible, setLastVisible] = useState<DocumentSnapshot | undefined>(undefined);

  const loadReceipts = useCallback(
    async (opts: FetchGoodsReceiptsOptions = {}, append = false) => {
      const effTenant = tenantId || 'default';
      setLoading(true);
      setError(null);
      try {
        const merged = { ...options, ...opts };
        const res = await fetchGoodsReceiptsFromDb(effTenant, merged);
        if (append) {
          setReceipts((prev) => [...prev, ...res.receipts]);
        } else {
          setReceipts(res.receipts);
        }
        setHasMore(res.hasMore);
        setLastVisible(res.lastVisible);
      } catch (err: any) {
        setError(err.message || 'تعذر تحميل أذون الاستلام');
      } finally {
        setLoading(false);
      }
    },
    [tenantId]
  );

  useEffect(() => {
    loadReceipts();
  }, [loadReceipts]);

  const processReceipt = useCallback(
    async (params: Omit<ProcessGoodsReceiptParams, 'tenantId' | 'branchId'>) => {
      const effTenant = tenantId || 'default';
      const effBranch = branchId || 'main-branch';
      setLoading(true);
      setError(null);
      try {
        const res = await completeGoodsReceiptTransaction({
          tenantId: effTenant,
          branchId: effBranch,
          branchCode: currentBranch?.code || 'HQ',
          ...params,
        });
        if (res.success && res.goodsReceipt) {
          setReceipts((prev) => [res.goodsReceipt!, ...prev.filter((r) => r.id !== res.goodsReceipt!.id)]);
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
    receipts,
    loading,
    error,
    hasMore,
    refresh: loadReceipts,
    loadMore: (opts?: FetchGoodsReceiptsOptions) => {
      if (!hasMore || loading || !lastVisible) return;
      loadReceipts({ ...opts, lastVisible }, true);
    },
    processReceipt,
  };
}
