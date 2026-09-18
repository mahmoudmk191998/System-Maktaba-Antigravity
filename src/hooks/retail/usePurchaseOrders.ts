import { useState, useEffect, useCallback } from 'react';
import { useAppStore } from '@/lib/store';
import {
  fetchPurchaseOrdersFromDb,
  createPurchaseOrder,
  submitPurchaseOrder,
  approvePurchaseOrder,
  cancelPurchaseOrder,
  type FetchPurchaseOrdersOptions,
  type CreatePurchaseOrderInput,
} from '@/services/purchasing/purchaseOrders.service';
import type { PurchaseOrder } from '@/types/retail.types';
import type { DocumentSnapshot } from 'firebase/firestore';

export function usePurchaseOrders(options: FetchPurchaseOrdersOptions = {}) {
  const currentTenant = useAppStore((state) => state.currentTenant);
  const currentBranch = useAppStore((state) => state.currentBranch);
  const tenantId = currentTenant?.id || '';
  const branchId = currentBranch?.id || '';

  const [purchaseOrders, setPurchaseOrders] = useState<PurchaseOrder[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [hasMore, setHasMore] = useState(false);
  const [lastVisible, setLastVisible] = useState<DocumentSnapshot | undefined>(undefined);

  const loadPurchaseOrders = useCallback(
    async (opts: FetchPurchaseOrdersOptions = {}, append = false) => {
      if (!tenantId) return;
      setLoading(true);
      setError(null);
      try {
        const merged = { ...options, ...opts };
        const res = await fetchPurchaseOrdersFromDb(tenantId, merged);
        if (append) {
          setPurchaseOrders((prev) => [...prev, ...res.purchaseOrders]);
        } else {
          setPurchaseOrders(res.purchaseOrders);
        }
        setHasMore(res.hasMore);
        setLastVisible(res.lastVisible);
      } catch (err: any) {
        setError(err.message || 'تعذر تحميل أوامر الشراء');
      } finally {
        setLoading(false);
      }
    },
    [tenantId]
  );

  useEffect(() => {
    if (tenantId) {
      loadPurchaseOrders();
    }
  }, [tenantId, loadPurchaseOrders]);

  const createPO = useCallback(
    async (input: Omit<CreatePurchaseOrderInput, 'tenantId' | 'branchId'>) => {
      if (!tenantId) throw new Error('المنشأة غير محددة');
      const newPO = await createPurchaseOrder({
        tenantId,
        branchId,
        branchCode: currentBranch?.code || 'HQ',
        ...input,
      });
      setPurchaseOrders((prev) => [newPO, ...prev]);
      return newPO;
    },
    [tenantId, branchId, currentBranch?.code]
  );

  const submitPO = useCallback(
    async (poId: string) => {
      if (!tenantId) throw new Error('المنشأة غير محددة');
      await submitPurchaseOrder(poId, tenantId);
      setPurchaseOrders((prev) =>
        prev.map((p) => (p.id === poId ? { ...p, status: 'submitted', updatedAt: new Date().toISOString() } : p))
      );
    },
    [tenantId]
  );

  const approvePO = useCallback(
    async (poId: string, approvedBy: string) => {
      if (!tenantId) throw new Error('المنشأة غير محددة');
      await approvePurchaseOrder(poId, tenantId, approvedBy);
      setPurchaseOrders((prev) =>
        prev.map((p) =>
          p.id === poId
            ? {
                ...p,
                status: 'approved',
                approvedBy,
                approvedAt: new Date().toISOString(),
                updatedAt: new Date().toISOString(),
              }
            : p
        )
      );
    },
    [tenantId]
  );

  const cancelPO = useCallback(
    async (poId: string, cancelledBy: string, reason?: string) => {
      if (!tenantId) throw new Error('المنشأة غير محددة');
      await cancelPurchaseOrder(poId, tenantId, cancelledBy, reason);
      setPurchaseOrders((prev) =>
        prev.map((p) => (p.id === poId ? { ...p, status: 'cancelled', updatedAt: new Date().toISOString() } : p))
      );
    },
    [tenantId]
  );

  return {
    purchaseOrders,
    loading,
    error,
    hasMore,
    refresh: loadPurchaseOrders,
    loadMore: (opts?: FetchPurchaseOrdersOptions) => {
      if (!hasMore || loading || !lastVisible) return;
      loadPurchaseOrders({ ...opts, lastVisible }, true);
    },
    createPO,
    submitPO,
    approvePO,
    cancelPO,
  };
}
