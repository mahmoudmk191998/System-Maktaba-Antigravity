/**
 * Custom hook for Branch & Warehouse Transfers workflow
 */

import { useState, useEffect, useCallback } from 'react';
import { useAppStore } from '@/lib/store';
import {
  fetchTransfersFromDb,
  createTransferRecord,
  approveTransferRecord,
  dispatchTransferRecord,
  receiveTransferRecord,
  cancelTransferRecord,
  type CreateTransferInput,
  type ItemReceptionDetail,
} from '@/services/inventory/transfers.service';
import type { BranchTransfer, TransferStatus } from '@/types/retail.types';

export function useTransfers(locationId?: string) {
  const currentTenant = useAppStore((state) => state.currentTenant);
  const currentUser = useAppStore((state) => state.currentUser);
  const tenantId = currentTenant?.id || '';
  const user = currentUser;
  const [transfers, setTransfers] = useState<BranchTransfer[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const loadTransfers = useCallback(async () => {
    if (!tenantId) return;
    setLoading(true);
    setError(null);
    try {
      const list = await fetchTransfersFromDb(tenantId, { locationId });
      setTransfers(list);
    } catch (err: any) {
      setError(err?.message || 'فشل في تحميل سجل المناقلات');
    } finally {
      setLoading(false);
    }
  }, [tenantId, locationId]);

  useEffect(() => {
    loadTransfers();
  }, [loadTransfers]);

  const handleCreateTransfer = async (
    input: Omit<CreateTransferInput, 'tenantId' | 'requestedBy'>,
    status: TransferStatus = 'draft'
  ) => {
    if (!tenantId || !user?.uid) return { success: false, error: 'المستخدم غير مسجل' };
    const res = await createTransferRecord(
      {
        tenantId,
        requestedBy: user.displayName || user.email || user.uid,
        ...input,
      },
      status
    );
    if (res.success) {
      await loadTransfers();
    }
    return res;
  };

  const handleApprove = async (transferId: string) => {
    if (!tenantId || !user?.uid) return { success: false, error: 'المستخدم غير مسجل' };
    const res = await approveTransferRecord(
      tenantId,
      transferId,
      user.displayName || user.email || user.uid
    );
    if (res.success) {
      await loadTransfers();
    }
    return res;
  };

  const handleDispatch = async (transferId: string, notes?: string) => {
    if (!tenantId || !user?.uid) return { success: false, error: 'المستخدم غير مسجل' };
    const res = await dispatchTransferRecord(
      tenantId,
      transferId,
      user.displayName || user.email || user.uid,
      notes
    );
    if (res.success) {
      await loadTransfers();
    }
    return res;
  };

  const handleReceive = async (transferId: string, itemReceptions?: ItemReceptionDetail[]) => {
    if (!tenantId || !user?.uid) return { success: false, error: 'المستخدم غير مسجل' };
    const res = await receiveTransferRecord(
      tenantId,
      transferId,
      user.displayName || user.email || user.uid,
      itemReceptions
    );
    if (res.success) {
      await loadTransfers();
    }
    return res;
  };

  const handleCancel = async (transferId: string, reason: string) => {
    if (!tenantId || !user?.uid) return { success: false, error: 'المستخدم غير مسجل' };
    const res = await cancelTransferRecord(
      tenantId,
      transferId,
      user.displayName || user.email || user.uid,
      reason
    );
    if (res.success) {
      await loadTransfers();
    }
    return res;
  };

  return {
    transfers,
    loading,
    error,
    refresh: loadTransfers,
    createTransfer: handleCreateTransfer,
    approveTransfer: handleApprove,
    dispatchTransfer: handleDispatch,
    receiveTransfer: handleReceive,
    cancelTransfer: handleCancel,
  };
}
