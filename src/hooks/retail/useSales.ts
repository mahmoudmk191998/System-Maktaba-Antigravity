import { useState, useEffect, useCallback } from 'react';
import { useAppStore } from '@/lib/store';
import { useTenantBranch } from '@/hooks/useDatabase';
import {
  fetchSalesFromDb,
  getSaleById,
  deleteSaleRecord,
  type FetchSalesOptions,
} from '@/services/sales/sales.service';
import { fetchSaleReturnsFromDb } from '@/services/sales/saleReturns.service';
import type { Sale, SaleReturn } from '@/types/retail.types';
import type { DocumentSnapshot } from 'firebase/firestore';

export interface UseSalesConfig {
  /**
   * branch = preserve the historical branch-scoped behavior.
   * tenant = show all sales for the tenant, regardless of the currently selected branch.
   */
  scope?: 'branch' | 'tenant';
  cashierId?: string;
  pageSize?: number;
}

export function resolveSalesScopeBranchId(
  scope: 'branch' | 'tenant',
  currentBranchId: string
): string | undefined {
  return scope === 'tenant' ? undefined : (currentBranchId || undefined);
}

export function useSales(config: UseSalesConfig = {}) {
  const { scope = 'branch', cashierId, pageSize = 20 } = config;
  const currentTenant = useAppStore((state) => state.currentTenant);
  const currentBranch = useAppStore((state) => state.currentBranch);
  const { tenantId: fallbackTenantId, branchId: fallbackBranchId } = useTenantBranch();
  const tenantId = currentTenant?.id || fallbackTenantId || '';
  const branchId = currentBranch?.id || fallbackBranchId || '';
  const scopedBranchId = resolveSalesScopeBranchId(scope, branchId);

  const [sales, setSales] = useState<Sale[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [hasMore, setHasMore] = useState(false);
  const [lastVisible, setLastVisible] = useState<DocumentSnapshot | undefined>(undefined);

  const loadSales = useCallback(
    async (options: FetchSalesOptions = {}, append = false) => {
      if (!tenantId) return;
      setLoading(true);
      setError(null);
      try {
        const [res, returnsRes] = await Promise.all([
          fetchSalesFromDb(tenantId, {
            branchId: options.branchId !== undefined ? options.branchId : scopedBranchId,
            cashierId: options.cashierId !== undefined ? options.cashierId : cashierId,
            pageSize: options.pageSize ?? pageSize,
            ...options,
          }),
          fetchSaleReturnsFromDb(tenantId, { pageSize: 300 }).catch(() => ({ returns: [] })),
        ]);

        const returnsBySaleId = new Map<string, SaleReturn[]>();
        const returnsByInvoice = new Map<string, SaleReturn[]>();
        for (const ret of returnsRes.returns) {
          const sid = ret.saleId || (ret as any).originalSaleId;
          if (sid) {
            const list = returnsBySaleId.get(sid) || [];
            list.push(ret);
            returnsBySaleId.set(sid, list);
          }
          if (ret.invoiceNumberSnapshot) {
            const inv = ret.invoiceNumberSnapshot.trim().toUpperCase();
            const list = returnsByInvoice.get(inv) || [];
            list.push(ret);
            returnsByInvoice.set(inv, list);
          }
        }

        const enrichedSales = res.sales.map((sale) => {
          const matchedReturns = [
            ...(returnsBySaleId.get(sale.id) || []),
            ...(returnsByInvoice.get(sale.invoiceNumber?.trim().toUpperCase()) || []),
          ].filter((v, i, a) => a.findIndex((t) => t.id === v.id) === i);

          const totalReturned = matchedReturns.reduce(
            (sum, r) => sum + Number(r.refundAmount || (r as any).subtotalReturned || 0),
            0
          );
          const costReversedTotal = matchedReturns.reduce(
            (sum, r) => sum + Number(r.costReversed || 0),
            0
          );
          const exchangeReturn = matchedReturns.find((r) => r.isExchange || r.replacementInvoiceNumber);

          const returnedAmount = Math.max(Number(sale.returnedAmount || 0), totalReturned);
          const isFull =
            sale.returnStatus === 'full' ||
            (returnedAmount > 0 && returnedAmount >= Number(sale.total) - 0.01);
          const isPartial = (sale.returnStatus === 'partial' || returnedAmount > 0) && !isFull;
          const returnStatus = isFull ? 'full' : isPartial ? 'partial' : 'none';

          return {
            ...sale,
            returnedAmount,
            costReversedTotal,
            returnStatus,
            hasExchange: Boolean(sale.hasExchange || exchangeReturn),
            exchangeInvoiceNumber: sale.exchangeInvoiceNumber || exchangeReturn?.replacementInvoiceNumber,
            isExchangeReplacement:
              sale.isExchangeReplacement ||
              Boolean(sale.notes && sale.notes.includes('عملية استبدال')),
          } as Sale & { costReversedTotal?: number };
        });

        if (append) {
          setSales((prev) => [...prev, ...enrichedSales]);
        } else {
          setSales(enrichedSales);
        }

        setHasMore(res.hasMore);
        setLastVisible(res.lastVisible);
      } catch (err: any) {
        setError(err.message || 'تعذر تحميل فواتير المبيعات');
      } finally {
        setLoading(false);
      }
    },
    [tenantId, scopedBranchId, cashierId, pageSize]
  );

  useEffect(() => {
    if (tenantId) {
      loadSales();
    }
    const handleSalesSync = () => {
      loadSales();
    };
    window.addEventListener('alwan_sales_synced', handleSalesSync);
    return () => {
      window.removeEventListener('alwan_sales_synced', handleSalesSync);
    };
  }, [tenantId, scopedBranchId, cashierId, loadSales]);

  const loadMore = useCallback(
    (options: FetchSalesOptions = {}) => {
      if (!hasMore || loading || !lastVisible) return;
      loadSales({ ...options, lastVisible }, true);
    },
    [hasMore, loading, lastVisible, loadSales]
  );

  const fetchSingleSale = useCallback(
    async (saleId: string) => {
      if (!tenantId || !saleId) return null;
      return getSaleById(tenantId, saleId);
    },
    [tenantId]
  );

  const removeSale = useCallback(
    async (saleId: string) => {
      if (!tenantId || !saleId) return { success: false, error: 'معرف الفاتورة مفقود' };
      const res = await deleteSaleRecord(tenantId, saleId);
      if (res.success) {
        setSales((prev) => prev.filter((s) => s.id !== saleId));
      }
      return res;
    },
    [tenantId]
  );

  return {
    sales,
    loading,
    error,
    hasMore,
    refresh: loadSales,
    loadMore,
    fetchSingleSale,
    removeSale,
  };
}
