/**
 * Custom hook for Damage, Loss & Recovery operations
 */

import { useState, useEffect, useCallback } from 'react';
import { useAppStore } from '@/lib/store';
import {
  fetchDamageLossRecordsFromDb,
  recordDamageOrLoss,
  recordStockRecovery,
  deleteDamageLossRecord,
  type CreateDamageLossInput,
} from '@/services/inventory/damageLoss.service';
import type { DamageLossRecord } from '@/types/retail.types';

export function useDamageLoss(locationId?: string) {
  const currentTenant = useAppStore((state) => state.currentTenant);
  const currentUser = useAppStore((state) => state.currentUser);
  const tenantId = currentTenant?.id || localStorage.getItem('current_tenant_id') || 'default-tenant';
  const user = currentUser;
  const [records, setRecords] = useState<DamageLossRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const loadRecords = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const list = await fetchDamageLossRecordsFromDb(tenantId, { locationId });
      setRecords(list);
    } catch (err: any) {
      setError(err?.message || 'فشل في تحميل سجلات الهالك والفقد');
    } finally {
      setLoading(false);
    }
  }, [tenantId, locationId]);

  useEffect(() => {
    loadRecords();
  }, [loadRecords]);

  const handleRecordDamage = async (
    input: Omit<CreateDamageLossInput, 'tenantId' | 'employeeId'>
  ) => {
    const employeeId = user?.displayName || user?.email || user?.uid || 'المسؤول';
    const res = await recordDamageOrLoss({
      tenantId,
      employeeId,
      ...input,
    });
    if (res.success) {
      await loadRecords();
    }
    return res;
  };

  const handleRecordRecovery = async (
    locId: string,
    productId: string,
    variantId: string | null | undefined,
    quantity: number,
    unitCost: number,
    originalRecordId?: string,
    notes?: string
  ) => {
    const employeeId = user?.displayName || user?.email || user?.uid || 'المسؤول';
    const res = await recordStockRecovery(
      tenantId,
      locId || locationId || 'main',
      productId,
      variantId,
      quantity,
      unitCost,
      employeeId,
      originalRecordId,
      notes
    );
    if (res.success) {
      await loadRecords();
    }
    return res;
  };

  const handleDeleteDamage = async (
    recordId: string,
    productId?: string,
    variantId?: string | null,
    quantity?: number,
    unitCost?: number
  ) => {
    const res = await deleteDamageLossRecord(
      recordId,
      tenantId,
      locationId || 'main',
      productId,
      variantId,
      quantity,
      unitCost
    );
    if (res.success) {
      await loadRecords();
    }
    return res;
  };

  return {
    records,
    loading,
    error,
    refresh: loadRecords,
    recordDamage: handleRecordDamage,
    recordRecovery: handleRecordRecovery,
    deleteDamage: handleDeleteDamage,
  };
}
