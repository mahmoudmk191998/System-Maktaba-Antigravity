import { useState, useEffect, useCallback } from 'react';
import { useAppStore } from '@/lib/store';
import {
  fetchSuppliersFromDb,
  createSupplier,
  updateSupplier,
  archiveSupplier,
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
  const tenantId = currentTenant?.id || '';

  const [suppliers, setSuppliers] = useState<Supplier[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [hasMore, setHasMore] = useState(false);
  const [lastVisible, setLastVisible] = useState<DocumentSnapshot | undefined>(undefined);

  const loadSuppliers = useCallback(
    async (opts: FetchSuppliersOptions = {}, append = false) => {
      if (!tenantId) return;
      setLoading(true);
      setError(null);
      try {
        const mergedOpts = { ...options, ...opts };
        const res = await fetchSuppliersFromDb(tenantId, mergedOpts);
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
    if (tenantId) {
      loadSuppliers();
    }
  }, [tenantId, loadSuppliers]);

  const addSupplier = useCallback(
    async (input: Omit<CreateSupplierInput, 'tenantId'>) => {
      if (!tenantId) throw new Error('المنشأة غير محددة');
      const newSupplier = await createSupplier({ tenantId, ...input });
      setSuppliers((prev) => [newSupplier, ...prev]);
      return newSupplier;
    },
    [tenantId]
  );

  const editSupplier = useCallback(
    async (supplierId: string, updates: UpdateSupplierInput) => {
      if (!tenantId) throw new Error('المنشأة غير محددة');
      await updateSupplier(supplierId, tenantId, updates);
      setSuppliers((prev) =>
        prev.map((s) => (s.id === supplierId ? { ...s, ...updates, updatedAt: new Date().toISOString() } : s))
      );
    },
    [tenantId]
  );

  const archiveSupplierById = useCallback(
    async (supplierId: string, archivedBy: string) => {
      if (!tenantId) throw new Error('المنشأة غير محددة');
      await archiveSupplier(supplierId, tenantId, archivedBy);
      setSuppliers((prev) =>
        prev.map((s) => (s.id === supplierId ? { ...s, active: false, archived: true } : s))
      );
    },
    [tenantId]
  );

  const paySupplier = useCallback(
    async (input: Omit<RecordSupplierPaymentInput, 'tenantId'>) => {
      if (!tenantId) throw new Error('المنشأة غير محددة');
      const res = await recordSupplierPayment({ tenantId, ...input });
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
    paySupplier,
  };
}
