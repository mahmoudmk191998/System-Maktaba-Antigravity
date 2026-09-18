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
  const tenantId = currentTenant?.id || '';
  const branchId = currentBranch?.id || '';

  const [receipts, setReceipts] = useState<GoodsReceipt[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [hasMore, setHasMore] = useState(false);
  const [lastVisible, setLastVisible] = useState<DocumentSnapshot | undefined>(undefined);

  const loadReceipts = useCallback(
    async (opts: FetchGoodsReceiptsOptions = {}, append = false) => {
      if (!tenantId) return;
      setLoading(true);
      setError(null);
      try {
        const merged = { ...options, ...opts };
        const res = await fetchGoodsReceiptsFromDb(tenantId, merged);
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
    if (tenantId) {
      loadReceipts();
    }
  }, [tenantId, loadReceipts]);

  const processReceipt = useCallback(
    async (params: Omit<ProcessGoodsReceiptParams, 'tenantId' | 'branchId'>) => {
      if (!tenantId || !branchId) throw new Error('المنشأة والفرع غير محددين');
      setLoading(true);
      setError(null);
      try {
        const res = await completeGoodsReceiptTransaction({
          tenantId,
          branchId,
          branchCode: currentBranch?.code || 'HQ',
          ...params,
        });
        if (res.success && res.goodsReceipt) {
          setReceipts((prev) => [res.goodsReceipt!, ...prev]);
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
