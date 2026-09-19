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
  const currentUser = useAppStore((state) => state.currentUser);
  const tenantId =
    currentTenant?.id ||
    (currentTenant as any)?.tenantId ||
    currentUser?.tenantId ||
    (currentUser as any)?.tenant_id ||
    'default';
  const branchId = currentBranch?.id || 'main-branch';

  const [purchaseOrders, setPurchaseOrders] = useState<PurchaseOrder[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [hasMore, setHasMore] = useState(false);
  const [lastVisible, setLastVisible] = useState<DocumentSnapshot | undefined>(undefined);

  const loadPurchaseOrders = useCallback(
    async (opts: FetchPurchaseOrdersOptions = {}, append = false) => {
      const effTenant = tenantId || 'default';
      setLoading(true);
      setError(null);
      try {
        const merged = { ...options, ...opts };
        const res = await fetchPurchaseOrdersFromDb(effTenant, merged);
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
    loadPurchaseOrders();
  }, [loadPurchaseOrders]);

  const createPO = useCallback(
    async (input: Omit<CreatePurchaseOrderInput, 'tenantId' | 'branchId'>) => {
      const effTenant = tenantId || 'default';
      const effBranch = branchId || 'main-branch';
      const newPO = await createPurchaseOrder({
        tenantId: effTenant,
        branchId: effBranch,
        branchCode: currentBranch?.code || 'HQ',
        ...input,
      });
      setPurchaseOrders((prev) => [newPO, ...prev.filter((p) => p.id !== newPO.id)]);
      return newPO;
    },
    [tenantId, branchId, currentBranch?.code]
  );

  const submitPO = useCallback(
    async (poId: string) => {
      const effTenant = tenantId || 'default';
      await submitPurchaseOrder(poId, effTenant);
      setPurchaseOrders((prev) =>
        prev.map((p) => (p.id === poId ? { ...p, status: 'submitted', updatedAt: new Date().toISOString() } : p))
      );
    },
    [tenantId]
  );

  const approvePO = useCallback(
    async (poId: string, approvedBy: string) => {
      const effTenant = tenantId || 'default';
      await approvePurchaseOrder(poId, effTenant, approvedBy);
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
      const effTenant = tenantId || 'default';
      await cancelPurchaseOrder(poId, effTenant, cancelledBy, reason);
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
