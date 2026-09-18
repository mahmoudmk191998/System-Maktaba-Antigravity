/**
 * Custom hook for Damage, Loss & Recovery operations
 */

import { useState, useEffect, useCallback } from 'react';
import { useAppStore } from '@/lib/store';
import {
  fetchDamageLossRecordsFromDb,
  recordDamageOrLoss,
  recordStockRecovery,
  type CreateDamageLossInput,
} from '@/services/inventory/damageLoss.service';
import type { DamageLossRecord, DamageLossType } from '@/types/retail.types';

export function useDamageLoss(locationId?: string) {
  const currentTenant = useAppStore((state) => state.currentTenant);
  const currentUser = useAppStore((state) => state.currentUser);
  const tenantId = currentTenant?.id || '';
  const user = currentUser;
  const [records, setRecords] = useState<DamageLossRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const loadRecords = useCallback(async () => {
    if (!tenantId) return;
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
    if (!tenantId || !user?.uid) return { success: false, error: 'المستخدم غير مسجل' };
    const res = await recordDamageOrLoss({
      tenantId,
      employeeId: user.displayName || user.email || user.uid,
      ...input,
    });
    if (res.success) {
      await loadRecords();
    }
    return res;
  };

  const handleRecordRecovery = async (
    locationId: string,
    productId: string,
    variantId: string | null | undefined,
    quantity: number,
    unitCost: number,
    originalRecordId?: string,
    notes?: string
  ) => {
    if (!tenantId || !user?.uid) return { success: false, error: 'المستخدم غير مسجل' };
    const res = await recordStockRecovery(
      tenantId,
      locationId,
      productId,
      variantId,
      quantity,
      unitCost,
      user.displayName || user.email || user.uid,
      originalRecordId,
      notes
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
  };
}
