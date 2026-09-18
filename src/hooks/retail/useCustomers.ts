/**
 * React Hook: useCustomers (Phase 8)
 * Real-time and on-demand customer management, filtering, and balance reconciliation.
 */

import { useState, useEffect, useCallback } from 'react';
import { useAppStore } from '@/lib/store';
import {
  createCustomer,
  updateCustomer,
  archiveCustomer,
  getCustomers,
  reconcileCustomerBalance,
  adjustCustomerBalance,
  type CreateCustomerInput,
  type UpdateCustomerInput,
} from '@/services/customers/customers.service';
import type { Customer, CustomerType } from '@/types/retail.types';

export function useCustomers() {
  const currentTenant = useAppStore((state) => state.currentTenant);
  const tenantId = currentTenant?.id;

  const [customers, setCustomers] = useState<Customer[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const fetchCustomers = useCallback(
    async (options?: {
      customerType?: CustomerType;
      activeOnly?: boolean;
      hasBalanceOnly?: boolean;
      searchQuery?: string;
    }) => {
      if (!tenantId) return;
      setLoading(true);
      setError(null);
      try {
        const result = await getCustomers(tenantId, options);
        setCustomers(result.customers);
      } catch (err: any) {
        console.error('Error fetching customers:', err);
        setError(err.message || 'فشل في تحميل بيانات العملاء');
      } finally {
        setLoading(false);
      }
    },
    [tenantId]
  );

  useEffect(() => {
    fetchCustomers();
  }, [fetchCustomers]);

  const addCustomer = async (input: Omit<CreateCustomerInput, 'tenantId'>): Promise<Customer> => {
    if (!tenantId) throw new Error('لا يوجد منشأة نشطة');
    const customer = await createCustomer({ ...input, tenantId });
    setCustomers((prev) => [customer, ...prev]);
    return customer;
  };

  const modifyCustomer = async (customerId: string, updates: UpdateCustomerInput): Promise<void> => {
    if (!tenantId) throw new Error('لا يوجد منشأة نشطة');
    await updateCustomer(customerId, tenantId, updates);
    setCustomers((prev) =>
      prev.map((c) => (c.id === customerId ? { ...c, ...updates, updatedAt: new Date().toISOString() } : c))
    );
  };

  const removeCustomer = async (customerId: string): Promise<void> => {
    if (!tenantId) throw new Error('لا يوجد منشأة نشطة');
    await archiveCustomer(customerId, tenantId);
    setCustomers((prev) =>
      prev.map((c) => (c.id === customerId ? { ...c, active: false, archived: true } : c))
    );
  };

  const reconcileCustomer = async (customerId: string) => {
    if (!tenantId) throw new Error('لا يوجد منشأة نشطة');
    return await reconcileCustomerBalance(tenantId, customerId);
  };

  const adjustBalance = async (
    customerId: string,
    amount: number,
    reason: string,
    processedBy: string
  ) => {
    if (!tenantId) throw new Error('لا يوجد منشأة نشطة');
    const res = await adjustCustomerBalance({
      tenantId,
      customerId,
      amount,
      reason,
      processedBy,
    });
    setCustomers((prev) =>
      prev.map((c) =>
        c.id === customerId ? { ...c, currentBalance: res.newBalance, balance: res.newBalance } : c
      )
    );
    return res;
  };

  return {
    customers,
    loading,
    error,
    fetchCustomers,
    addCustomer,
    modifyCustomer,
    removeCustomer,
    reconcileCustomer,
    adjustBalance,
  };
}
