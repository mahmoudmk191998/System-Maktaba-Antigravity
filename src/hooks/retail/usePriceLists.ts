/**
 * React Hook: usePriceLists (Phase 8)
 * Management of price lists and customer-specific price rules.
 */

import { useState, useEffect, useCallback } from 'react';
import { useAppStore } from '@/lib/store';
import {
  getPriceLists,
  createPriceList,
  updatePriceList,
  setPriceListItem,
  getPriceListItems,
  type CreatePriceListInput,
  type SetPriceListItemInput,
} from '@/services/pricing/priceLists.service';
import type { PriceList, PriceListItem } from '@/types/retail.types';

export function usePriceLists() {
  const currentTenant = useAppStore((state) => state.currentTenant);
  const tenantId = currentTenant?.id;

  const [priceLists, setPriceLists] = useState<PriceList[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const fetchPriceLists = useCallback(async () => {
    if (!tenantId) return;
    setLoading(true);
    setError(null);
    try {
      const lists = await getPriceLists(tenantId);
      setPriceLists(lists);
    } catch (err: any) {
      console.error('Error fetching price lists:', err);
      setError(err.message || 'فشل في تحميل قوائم الأسعار');
    } finally {
      setLoading(false);
    }
  }, [tenantId]);

  useEffect(() => {
    fetchPriceLists();
  }, [fetchPriceLists]);

  const addPriceList = async (input: Omit<CreatePriceListInput, 'tenantId'>): Promise<PriceList> => {
    if (!tenantId) throw new Error('لا يوجد منشأة نشطة');
    const pl = await createPriceList({ ...input, tenantId });
    setPriceLists((prev) => [pl, ...prev]);
    return pl;
  };

  const modifyPriceList = async (
    priceListId: string,
    updates: Partial<CreatePriceListInput> & { active?: boolean }
  ): Promise<void> => {
    if (!tenantId) throw new Error('لا يوجد منشأة نشطة');
    await updatePriceList(priceListId, tenantId, updates);
    setPriceLists((prev) =>
      prev.map((pl) => (pl.id === priceListId ? { ...pl, ...updates, updatedAt: new Date().toISOString() } : pl))
    );
  };

  const setItemPrice = async (input: Omit<SetPriceListItemInput, 'tenantId'>): Promise<PriceListItem> => {
    if (!tenantId) throw new Error('لا يوجد منشأة نشطة');
    return await setPriceListItem({ ...input, tenantId });
  };

  const fetchItems = async (priceListId: string): Promise<PriceListItem[]> => {
    return await getPriceListItems(priceListId);
  };

  return {
    priceLists,
    loading,
    error,
    fetchPriceLists,
    addPriceList,
    modifyPriceList,
    setItemPrice,
    fetchItems,
  };
}
