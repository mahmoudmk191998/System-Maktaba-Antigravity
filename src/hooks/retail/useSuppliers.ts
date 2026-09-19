import { useState, useEffect, useCallback } from 'react';
import { useAppStore } from '@/lib/store';
import {
  fetchSuppliersFromDb,
  createSupplier,
  updateSupplier,
  archiveSupplier,
  restoreSupplier,
  recordSupplierPayment,
  type FetchSuppliersOptions,
  type CreateSupplierInput,
  type UpdateSupplierInput,
  type RecordSupplierPaymentInput,
} from '@/services/suppliers/suppliers.service';
import type { Supplier } from '@/types/retail.types';
import type { DocumentSnapshot } from 'firebase/firestore';

export function useSuppliers(options: FetchSuppliersOptions = {}) {
  const currentTenant = useAppStore((state) => state.currentTenant);
  const currentUser = useAppStore((state) => state.currentUser);
  const tenantId = currentTenant?.id || currentUser?.tenantId || (currentUser as any)?.tenant_id || 'default';

  const [suppliers, setSuppliers] = useState<Supplier[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [hasMore, setHasMore] = useState(false);
  const [lastVisible, setLastVisible] = useState<DocumentSnapshot | undefined>(undefined);

  const loadSuppliers = useCallback(
    async (opts: FetchSuppliersOptions = {}, append = false) => {
      const effTenant = tenantId || 'default';
      setLoading(true);
      setError(null);
      try {
        const mergedOpts = { ...options, ...opts };
        const res = await fetchSuppliersFromDb(effTenant, mergedOpts);
        if (append) {
          setSuppliers((prev) => [...prev, ...res.suppliers]);
        } else {
          setSuppliers(res.suppliers);
        }
        setHasMore(res.hasMore);
        setLastVisible(res.lastVisible);
      } catch (err: any) {
        setError(err.message || 'تعذر تحميل قائمة الموردين');
      } finally {
        setLoading(false);
      }
    },
    [tenantId]
  );

  useEffect(() => {
    loadSuppliers();
  }, [loadSuppliers]);

  const addSupplier = useCallback(
    async (input: Omit<CreateSupplierInput, 'tenantId'>) => {
      const effTenant = tenantId || 'default';
      const newSupplier = await createSupplier({ tenantId: effTenant, ...input });
      setSuppliers((prev) => [newSupplier, ...prev.filter((s) => s.id !== newSupplier.id)]);
      return newSupplier;
    },
    [tenantId]
  );

  const editSupplier = useCallback(
    async (supplierId: string, updates: UpdateSupplierInput) => {
      const effTenant = tenantId || 'default';
      await updateSupplier(supplierId, effTenant, updates);
      setSuppliers((prev) =>
        prev.map((s) => (s.id === supplierId ? { ...s, ...updates, updatedAt: new Date().toISOString() } : s))
      );
    },
    [tenantId]
  );

  const archiveSupplierById = useCallback(
    async (supplierId: string, archivedBy: string) => {
      const effTenant = tenantId || 'default';
      await archiveSupplier(supplierId, effTenant, archivedBy);
      setSuppliers((prev) =>
        prev.map((s) => (s.id === supplierId ? { ...s, active: false, archived: true } : s))
      );
    },
    [tenantId]
  );

  const restoreSupplierById = useCallback(
    async (supplierId: string, restoredBy: string) => {
      const effTenant = tenantId || 'default';
      await restoreSupplier(supplierId, effTenant, restoredBy);
      setSuppliers((prev) =>
        prev.map((s) => (s.id === supplierId ? { ...s, active: true, archived: false } : s))
      );
    },
    [tenantId]
  );

  const paySupplier = useCallback(
    async (input: Omit<RecordSupplierPaymentInput, 'tenantId'>) => {
      const effTenant = tenantId || 'default';
      const res = await recordSupplierPayment({ tenantId: effTenant, ...input });
      if (res.success && res.payment) {
        setSuppliers((prev) =>
          prev.map((s) =>
            s.id === input.supplierId
              ? { ...s, currentBalance: Math.round(((s.currentBalance || 0) - input.amount) * 100) / 100 }
              : s
          )
        );
      }
      return res;
    },
    [tenantId]
  );

  return {
    suppliers,
    loading,
    error,
    hasMore,
    refresh: loadSuppliers,
    loadMore: (opts?: FetchSuppliersOptions) => {
      if (!hasMore || loading || !lastVisible) return;
      loadSuppliers({ ...opts, lastVisible }, true);
    },
    addSupplier,
    editSupplier,
    archiveSupplierById,
    restoreSupplierById,
    paySupplier,
  };
}
