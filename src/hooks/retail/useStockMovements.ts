/**
 * Custom hook for browsing the Immutable Stock Movement Audit Ledger
 */

import { useState, useEffect, useCallback } from 'react';
import { useAppStore } from '@/lib/store';
import {
  fetchStockMovementsFromDb,
  type FetchStockMovementsOptions,
} from '@/services/inventory/retailInventory.service';
import type { StockMovement } from '@/types/retail.types';

export function useStockMovements(locationId?: string) {
  const currentTenant = useAppStore((state) => state.currentTenant);
  const tenantId = currentTenant?.id || '';
  const [movements, setMovements] = useState<StockMovement[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [hasMore, setHasMore] = useState(false);

  const loadMovements = useCallback(
    async (options: FetchStockMovementsOptions = {}) => {
      if (!tenantId) return;
      setLoading(true);
      setError(null);
      try {
        const res = await fetchStockMovementsFromDb(tenantId, {
          locationId,
          ...options,
        });
        setMovements(res.movements);
        setHasMore(res.hasMore);
      } catch (err: any) {
        setError(err?.message || 'فشل في جلب سجل الحركات');
      } finally {
        setLoading(false);
      }
    },
    [tenantId, locationId]
  );

  useEffect(() => {
    loadMovements();
  }, [loadMovements]);

  return {
    movements,
    loading,
    error,
    hasMore,
    refresh: loadMovements,
  };
}
