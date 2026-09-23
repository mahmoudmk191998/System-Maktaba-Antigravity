import { useState, useEffect, useCallback } from 'react';
import { useAppStore } from '@/lib/store';
import { useAuth } from '@/hooks/useAuth';
import {
  getActiveCashRegisterShift,
  openCashRegisterShift,
  closeCashRegisterShift,
} from '@/services/sales/cashRegister.service';
import { offlineCacheService, isGenuineTransportError } from '@/services/offline';
import type { CashierShift } from '@/types/retail.types';

export function useCashRegister() {
  const currentTenant = useAppStore((state) => state.currentTenant);
  const currentBranch = useAppStore((state) => state.currentBranch);
  const { user } = useAuth();
  const tenantId = currentTenant?.id || '';
  const branchId = currentBranch?.id || '';
  const cashierId = user?.uid || '';
  const cashierName = user?.displayName || user?.email || 'كاشير';

  const [activeShift, setActiveShift] = useState<CashierShift | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const refreshShift = useCallback(async () => {
    if (!tenantId || !branchId || !cashierId) {
      setActiveShift(null);
      return;
    }
    setLoading(true);
    setError(null);

    // 1. Zero-latency offline bootstrap
    if (!navigator.onLine) {
      try {
        const cached = await offlineCacheService.getCachedActiveShift(tenantId, branchId);
        if (cached) {
          setActiveShift({
            id: cached.shiftId,
            shiftNumber: cached.shiftNumber,
            tenantId: cached.tenantId,
            branchId: cached.branchId,
            cashierId: cached.cashierId,
            cashierName: cached.cashierName,
            openedAt: cached.openedAt,
            startingCash: cached.startingCash,
            expectedCash: cached.shadowExpectedCash,
            status: 'open',
          } as any);
        } else {
          setActiveShift(null);
        }
      } catch {
        setActiveShift(null);
      } finally {
        setLoading(false);
      }
      return;
    }

    try {
      const shift = await getActiveCashRegisterShift(tenantId, branchId, cashierId);
      setActiveShift(shift);
      if (shift) {
        offlineCacheService.cacheActiveShift(shift).catch(() => {});
      }
    } catch (err: any) {
      if (isGenuineTransportError(err) || !navigator.onLine || err?.code === 'unavailable') {
        const cached = await offlineCacheService.getCachedActiveShift(tenantId, branchId);
        if (cached) {
          setActiveShift({
            id: cached.shiftId,
            shiftNumber: cached.shiftNumber,
            tenantId: cached.tenantId,
            branchId: cached.branchId,
            cashierId: cached.cashierId,
            cashierName: cached.cashierName,
            openedAt: cached.openedAt,
            startingCash: cached.startingCash,
            expectedCash: cached.shadowExpectedCash,
            status: 'open',
          } as any);
        } else {
          setActiveShift(null);
        }
      } else {
        setError(err.message || 'تعذر التحقق من حالة وردية الكاشير');
      }
    } finally {
      setLoading(false);
    }
  }, [tenantId, branchId, cashierId]);

  useEffect(() => {
    refreshShift();
  }, [refreshShift]);

  const openShift = useCallback(
    async (openingCash: number, notes?: string) => {
      if (!tenantId || !branchId || !cashierId) {
        return { success: false, error: 'بيانات الجلسة غير متوفرة' };
      }
      setLoading(true);
      setError(null);
      try {
        const res = await openCashRegisterShift({
          tenantId,
          branchId,
          cashierId,
          cashierNameSnapshot: cashierName,
          openingCash,
          notes,
        });
        if (res.success && res.shift) {
          setActiveShift(res.shift);
          return { success: true, shift: res.shift };
        }
        return { success: false, error: res.error };
      } catch (err: any) {
        setError(err.message);
        return { success: false, error: err.message };
      } finally {
        setLoading(false);
      }
    },
    [tenantId, branchId, cashierId, cashierName]
  );

  const closeShift = useCallback(
    async (closingCashActual: number, notes?: string) => {
      if (!tenantId || !activeShift?.id) {
        return { success: false, error: 'لا توجد وردية مفتوحة لإغلاقها' };
      }
      setLoading(true);
      setError(null);
      try {
        const res = await closeCashRegisterShift({
          tenantId,
          shiftId: activeShift.id,
          closedBy: cashierName,
          closingCashActual,
          notes,
        });
        if (res.success) {
          setActiveShift(null);
          return { success: true, shift: res.shift };
        }
        return { success: false, error: res.error };
      } catch (err: any) {
        setError(err.message);
        return { success: false, error: err.message };
      } finally {
        setLoading(false);
      }
    },
    [tenantId, activeShift, cashierName]
  );

  return {
    activeShift,
    isShiftOpen: !!activeShift,
    loading,
    error,
    refreshShift,
    openShift,
    closeShift,
  };
}
