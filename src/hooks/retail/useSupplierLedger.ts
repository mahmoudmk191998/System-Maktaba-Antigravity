import { useState, useEffect, useCallback } from 'react';
import { useAppStore } from '@/lib/store';
import {
  fetchSupplierLedger,
  reconcileSupplierBalance,
} from '@/services/suppliers/suppliers.service';
import type { SupplierLedgerEntry } from '@/types/retail.types';

export function useSupplierLedger(supplierId?: string | null) {
  const currentTenant = useAppStore((state) => state.currentTenant);
  const tenantId = currentTenant?.id || '';

  const [entries, setEntries] = useState<SupplierLedgerEntry[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [reconciliation, setReconciliation] = useState<{
    isReconciled: boolean;
    ledgerSum: number;
    cachedBalance: number;
    difference: number;
  } | null>(null);

  const loadLedger = useCallback(async () => {
    if (!tenantId || !supplierId) {
      setEntries([]);
      return;
    }
    setLoading(true);
    setError(null);
    try {
      const data = await fetchSupplierLedger(tenantId, supplierId);
      setEntries(data);

      // Also run reconciliation check
      const recon = await reconcileSupplierBalance(tenantId, supplierId);
      setReconciliation(recon);
    } catch (err: any) {
      setError(err.message || 'تعذر تحميل كشف حساب المورد');
    } finally {
      setLoading(false);
    }
  }, [tenantId, supplierId]);

  useEffect(() => {
    loadLedger();
  }, [loadLedger]);

  return {
    entries,
    loading,
    error,
    reconciliation,
    refresh: loadLedger,
  };
}
