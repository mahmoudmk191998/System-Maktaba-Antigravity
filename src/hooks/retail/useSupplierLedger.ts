import { useState, useEffect, useCallback } from 'react';
import { useAppStore } from '@/lib/store';
import {
  fetchSupplierLedger,
  reconcileSupplierBalance,
  syncAndReconcileSupplierLedger,
  fetchSupplierJournalEntries,
} from '@/services/suppliers/suppliers.service';
import type { SupplierLedgerEntry, JournalEntry } from '@/types/retail.types';

export function useSupplierLedger(supplierId?: string | null) {
  const currentTenant = useAppStore((state) => state.currentTenant);
  const currentUser = useAppStore((state) => state.currentUser);
  const tenantId = currentTenant?.id || currentUser?.tenantId || (currentUser as any)?.tenant_id || 'default';

  const [entries, setEntries] = useState<SupplierLedgerEntry[]>([]);
  const [journalEntries, setJournalEntries] = useState<JournalEntry[]>([]);
  const [loading, setLoading] = useState(false);
  const [syncing, setSyncing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [reconciliation, setReconciliation] = useState<{
    isReconciled: boolean;
    ledgerSum: number;
    cachedBalance: number;
    difference: number;
    purchasesTotal?: number;
    paymentsTotal?: number;
    returnsTotal?: number;
    openingBalance?: number;
  } | null>(null);

  const loadLedger = useCallback(async () => {
    if (!tenantId || !supplierId) {
      setEntries([]);
      setJournalEntries([]);
      return;
    }
    setLoading(true);
    setError(null);
    try {
      const data = await fetchSupplierLedger(tenantId, supplierId);
      setEntries(data);

      // Run reconciliation check
      const recon = await reconcileSupplierBalance(tenantId, supplierId);
      setReconciliation(recon);

      // Fetch general ledger journal entries
      const je = await fetchSupplierJournalEntries(tenantId, supplierId);
      setJournalEntries(je);
    } catch (err: any) {
      setError(err.message || 'تعذر تحميل كشف حساب المورد');
    } finally {
      setLoading(false);
    }
  }, [tenantId, supplierId]);

  useEffect(() => {
    loadLedger();
  }, [loadLedger]);

  const reconcileAndSync = useCallback(async () => {
    if (!tenantId || !supplierId) return null;
    setSyncing(true);
    try {
      const res = await syncAndReconcileSupplierLedger(
        tenantId,
        supplierId,
        currentUser?.name || 'مدير النظام'
      );
      await loadLedger();
      return res;
    } catch (err: any) {
      setError(err.message || 'فشلت عملية مطابقة ومزامنة القيود الدفترية');
      throw err;
    } finally {
      setSyncing(false);
    }
  }, [tenantId, supplierId, currentUser?.name, loadLedger]);

  return {
    entries,
    journalEntries,
    loading,
    syncing,
    error,
    reconciliation,
    refresh: loadLedger,
    reconcileAndSync,
  };
}
