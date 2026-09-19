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
  const currentUser = useAppStore((state) => state.currentUser);
  const tenantId = currentTenant?.id || currentUser?.tenantId || (currentUser as any)?.tenant_id || 'default';

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
    const effTenantId = tenantId || 'default';
    setLoading(true);
    setError(null);
    try {
      let recs: CustomerReceivable[] = [];
      if (customerId) {
        recs = await getOpenReceivablesForCustomer(effTenantId, customerId);
      } else {
        let rawDocs: any[] = [];
        try {
          let snap = await getDocs(
            query(collection(db, 'customer_receivables'), where('tenantId', '==', effTenantId))
          );
          if (snap.empty) {
            snap = await getDocs(
              query(collection(db, 'customer_receivables'), where('tenant_id', '==', effTenantId))
            );
          }
          if (snap.empty && effTenantId === 'default') {
            snap = await getDocs(collection(db, 'customer_receivables'));
          }
          rawDocs = snap.docs;
        } catch (queryErr) {
          console.warn('Primary fetch customer_receivables failed, falling back:', queryErr);
          try {
            const fallbackSnap = await getDocs(collection(db, 'customer_receivables'));
            rawDocs = fallbackSnap.docs;
          } catch (e2) {
            console.error('All customer_receivables fetch attempts failed:', e2);
          }
        }

        recs = rawDocs
          .map((d) => ({ id: d.id, ...d.data() } as CustomerReceivable))
          .filter((r) => {
            const rTenant = r.tenantId || (r as any).tenant_id;
            if (effTenantId && effTenantId !== 'default' && rTenant && rTenant !== effTenantId) {
              return false;
            }
            const remaining = Number(r.remainingAmount || 0);
            return remaining > 0 && r.status !== 'paid' && r.status !== 'cancelled';
          });

        // Also check if any credit sales in sales collection are not yet represented
        try {
          let salesSnap = await getDocs(
            query(collection(db, 'sales'), where('tenantId', '==', effTenantId))
          );
          if (salesSnap.empty) {
            salesSnap = await getDocs(
              query(collection(db, 'sales'), where('tenant_id', '==', effTenantId))
            );
          }
          if (salesSnap.empty && effTenantId === 'default') {
            salesSnap = await getDocs(collection(db, 'sales'));
          }

          const existingSaleIds = new Set(recs.map((r) => r.saleId).filter(Boolean));
          const existingInvoiceNums = new Set(recs.map((r) => r.invoiceNumber).filter(Boolean));

          salesSnap.docs.forEach((sDoc) => {
            const sale = sDoc.data() as any;
            const isCredit =
              sale.isCreditSale === true ||
              sale.paymentMethod === 'credit' ||
              (sale.payments && Array.isArray(sale.payments) && sale.payments.some((p: any) => p.method === 'credit'));

            if (!isCredit) return;

            const saleId = sDoc.id;
            const invoiceNumber = sale.invoiceNumber || sale.receiptNumber || `INV-${saleId.slice(-6)}`;

            if (existingSaleIds.has(saleId) || existingInvoiceNums.has(invoiceNumber)) {
              return;
            }

            const total = Number(sale.total || sale.grandTotal || 0);
            const paid = Number(sale.paidAmount || sale.receivedAmount || 0);
            const remaining = Math.max(0, Math.round((total - paid) * 100) / 100);

            if (remaining <= 0) return;

            const issueDate = sale.createdAt ? String(sale.createdAt).split('T')[0] : new Date().toISOString().split('T')[0];
            const dueDate = sale.dueDate || sale.creditDueDate || issueDate;

            recs.push({
              id: `synced_${saleId}`,
              tenantId: effTenantId,
              customerId: sale.customerId || 'generic_customer',
              customerNameSnapshot: sale.customerNameSnapshot || sale.customerName || 'عميل آجل',
              saleId,
              invoiceNumber,
              branchId: sale.branchId || '',
              issueDate,
              dueDate,
              originalAmount: total,
              paidAmount: paid,
              returnsCreditAmount: 0,
              remainingAmount: remaining,
              status: paid > 0 ? 'partially_paid' : 'open',
              createdAt: sale.createdAt || new Date().toISOString(),
              updatedAt: sale.updatedAt || new Date().toISOString(),
            });
          });
        } catch (salesErr) {
          console.warn('Could not sync auxiliary credit sales:', salesErr);
        }
      }

      // Check and flag overdue dynamically
      const todayIso = new Date().toISOString().split('T')[0];
      recs = recs.map((r) => {
        const isPastDue = r.dueDate < todayIso;
        if (isPastDue && r.status !== 'overdue') {
          return { ...r, status: 'overdue' as const };
        }
        return r;
      });

      // Sort by dueDate ascending (oldest due date first)
      recs.sort((a, b) => new Date(a.dueDate).getTime() - new Date(b.dueDate).getTime());

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
    const effTenantId = tenantId || 'default';
    const res = await completeCustomerPaymentTransaction({
      ...params,
      tenantId: effTenantId,
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
