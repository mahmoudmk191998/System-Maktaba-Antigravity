/**
 * React Hook: useReceivables (Phase 8)
 * Accounts Receivable tracking, Aging buckets, and payment processing.
 */

import { useState, useEffect, useCallback } from 'react';
import { useAppStore } from '@/lib/store';
import { db } from '@/lib/firebase';
import { collection, query, where, getDocs, orderBy } from 'firebase/firestore';
import {
  calculateReceivablesAging,
  getOpenReceivablesForCustomer,
} from '@/services/customers/creditSales.service';
import {
  completeCustomerPaymentTransaction,
  type ProcessCustomerPaymentParams,
} from '@/services/customers/customerPayments.service';
import type { CustomerReceivable, ReceivablesAgingSummary } from '@/types/retail.types';

export function useReceivables(customerId?: string) {
  const currentTenant = useAppStore((state) => state.currentTenant);
  const tenantId = currentTenant?.id;

  const [receivables, setReceivables] = useState<CustomerReceivable[]>([]);
  const [agingSummary, setAgingSummary] = useState<ReceivablesAgingSummary>({
    current: 0,
    days1to30: 0,
    days31to60: 0,
    days61to90: 0,
    days90Plus: 0,
    totalOutstanding: 0,
    overdueCount: 0,
    totalReceivablesCount: 0,
  });
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const fetchReceivables = useCallback(async () => {
    if (!tenantId) return;
    setLoading(true);
    setError(null);
    try {
      let recs: CustomerReceivable[] = [];
      if (customerId) {
        recs = await getOpenReceivablesForCustomer(tenantId, customerId);
      } else {
        const q = query(
          collection(db, 'customer_receivables'),
          where('tenantId', '==', tenantId),
          where('status', 'in', ['open', 'partially_paid', 'overdue']),
          orderBy('dueDate', 'asc')
        );
        const snap = await getDocs(q);
        recs = snap.docs.map((d) => d.data() as CustomerReceivable);
      }
      setReceivables(recs);
      setAgingSummary(calculateReceivablesAging(recs));
    } catch (err: any) {
      console.error('Error fetching receivables:', err);
      setError(err.message || 'فشل في تحميل سجل المستحقات');
    } finally {
      setLoading(false);
    }
  }, [tenantId, customerId]);

  useEffect(() => {
    fetchReceivables();
  }, [fetchReceivables]);

  const recordPayment = async (
    params: Omit<ProcessCustomerPaymentParams, 'tenantId'>
  ) => {
    if (!tenantId) throw new Error('لا يوجد منشأة نشطة');
    const res = await completeCustomerPaymentTransaction({
      ...params,
      tenantId,
    });
    if (res.success) {
      await fetchReceivables();
    }
    return res;
  };

  return {
    receivables,
    agingSummary,
    loading,
    error,
    fetchReceivables,
    recordPayment,
  };
}
