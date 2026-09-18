/**
 * Custom hook for managing Bookstore Retail Stock Balances & Locations
 */

import { useState, useEffect, useCallback, useMemo } from 'react';
import { useAppStore } from '@/lib/store';
import { useTenantBranch } from '@/hooks/useDatabase';
import {
  fetchStockBalancesFromDb,
  createOpeningBalance,
  applyStockMovement,
  type FetchStockBalancesOptions,
} from '@/services/inventory/retailInventory.service';
import type { StockBalance, InventoryLocation } from '@/types/retail.types';
import { collection, query, where, getDocs } from 'firebase/firestore';
import { db } from '@/lib/firebase';

export function useInventory() {
  const currentTenant = useAppStore((state) => state.currentTenant);
  const currentUser = useAppStore((state) => state.currentUser);
  const currentBranch = useAppStore((state) => state.currentBranch);
  const { tenantId: hookTenantId, branchId: hookBranchId } = useTenantBranch();
  const tenantId = currentTenant?.id || hookTenantId || '';
  const user = currentUser;
  const [balances, setBalances] = useState<StockBalance[]>([]);
  const [locations, setLocations] = useState<InventoryLocation[]>([]);
  const [selectedLocationId, setSelectedLocationId] = useState<string>(currentBranch?.id || hookBranchId || '');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [hasMore, setHasMore] = useState(false);

  // 1. Fetch available locations (Branches + Warehouses)
  const loadLocations = useCallback(async () => {
    if (!tenantId) return;
    try {
      // Query branches first as default locations
      const branchQ = query(collection(db, 'branches'), where('tenant_id', '==', tenantId));
      const bSnap = await getDocs(branchQ);
      const locList: InventoryLocation[] = bSnap.docs.map((d) => {
        const data = d.data();
        return {
          id: d.id,
          tenantId,
          name: data.name || 'فرع بدون اسم',
          nameAr: data.name_ar || data.name,
          type: 'branch',
          isCentralWarehouse: false,
          active: data.is_active !== false,
          address: data.address,
          phone: data.phone,
        };
      });

      // Also query dedicated inventory locations (warehouses, storage rooms)
      const locQ = query(collection(db, 'inventory_locations'), where('tenantId', '==', tenantId));
      const locSnap = await getDocs(locQ);
      for (const d of locSnap.docs) {
        const data = d.data() as InventoryLocation;
        if (!locList.some((l) => l.id === d.id)) {
          locList.push({ id: d.id, ...data });
        }
      }

      setLocations(locList);
      if (!selectedLocationId && locList.length > 0) {
        const defaultLoc = currentBranch?.id || locList[0].id;
        setSelectedLocationId(defaultLoc);
      }
    } catch (err: any) {
      console.error('Failed to load locations:', err);
    }
  }, [tenantId, currentBranch, selectedLocationId]);

  // 2. Fetch stock balances
  const loadBalances = useCallback(
    async (options: FetchStockBalancesOptions = {}) => {
      if (!tenantId) return;
      setLoading(true);
      setError(null);
      try {
        const res = await fetchStockBalancesFromDb(tenantId, {
          locationId: selectedLocationId || options.locationId,
          ...options,
        });
        setBalances(res.balances);
        setHasMore(res.hasMore);
      } catch (err: any) {
        setError(err?.message || 'فشل في تحميل أرصدة المخزون');
      } finally {
        setLoading(false);
      }
    },
    [tenantId, selectedLocationId]
  );

  useEffect(() => {
    loadLocations();
  }, [loadLocations]);

  useEffect(() => {
    if (selectedLocationId) {
      loadBalances();
    }
  }, [selectedLocationId, loadBalances]);

  // Derived KPI metrics
  const metrics = useMemo(() => {
    const totalItems = balances.length;
    let totalOnHand = 0;
    let totalValue = 0;
    let lowStockCount = 0;
    let outOfStockCount = 0;

    for (const b of balances) {
      const onHand = b.onHandQuantity ?? b.quantity ?? 0;
      const cost = b.averageCost ?? b.unitCost ?? 0;
      const reorder = b.reorderPoint || 5;

      totalOnHand += onHand;
      totalValue += onHand * cost;

      if (onHand <= 0) {
        outOfStockCount++;
      } else if (onHand <= reorder) {
        lowStockCount++;
      }
    }

    return {
      totalItems,
      totalOnHand,
      totalValue: Math.round(totalValue * 100) / 100,
      lowStockCount,
      outOfStockCount,
    };
  }, [balances]);

  // Actions
  const handleAddOpeningBalance = async (
    productId: string,
    variantId: string | null | undefined,
    quantity: number,
    unitCost: number,
    notes?: string
  ) => {
    if (!tenantId || !selectedLocationId) return { success: false, error: 'الموقع غير محدد' };
    const res = await createOpeningBalance(
      tenantId,
      selectedLocationId,
      productId,
      variantId,
      quantity,
      unitCost,
      { employeeId: user?.uid, notes }
    );
    if (res.success) {
      await loadBalances();
    }
    return res;
  };

  const handleAdjustStock = async (
    productId: string,
    variantId: string | null | undefined,
    quantity: number,
    direction: 'in' | 'out',
    reason: string,
    unitCost?: number
  ) => {
    if (!tenantId || !selectedLocationId) return { success: false, error: 'الموقع غير محدد' };
    const movementType = direction === 'in' ? 'stock_adjustment_in' : 'stock_adjustment_out';
    const res = await applyStockMovement({
      tenantId,
      locationId: selectedLocationId,
      productId,
      variantId,
      movementType,
      direction,
      quantity,
      unitCost,
      employeeId: user?.uid,
      reason,
    });
    if (res.success) {
      await loadBalances();
    }
    return res;
  };

  return {
    balances,
    locations,
    selectedLocationId,
    setSelectedLocationId,
    loading,
    error,
    hasMore,
    metrics,
    refresh: loadBalances,
    addOpeningBalance: handleAddOpeningBalance,
    adjustStock: handleAdjustStock,
  };
}
