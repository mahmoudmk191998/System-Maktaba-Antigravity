/**
 * Custom hook for Physical Stocktake / Inventory Count Sessions
 */

import { useState, useEffect, useCallback } from 'react';
import { useAppStore } from '@/lib/store';
import {
  fetchCountSessionsFromDb,
  startInventoryCountSession,
  recordBarcodeScanInCount,
  updateCountItemQuantity,
  postInventoryCountSession,
  type StartCountSessionInput,
} from '@/services/inventory/inventoryCount.service';
import type { InventoryCountSession } from '@/types/retail.types';

export function useInventoryCounts(locationId?: string) {
  const currentTenant = useAppStore((state) => state.currentTenant);
  const currentUser = useAppStore((state) => state.currentUser);
  const tenantId = currentTenant?.id || '';
  const user = currentUser;
  const [sessions, setSessions] = useState<InventoryCountSession[]>([]);
  const [activeSession, setActiveSession] = useState<InventoryCountSession | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const loadSessions = useCallback(async () => {
    if (!tenantId) return;
    setLoading(true);
    setError(null);
    try {
      const list = await fetchCountSessionsFromDb(tenantId, locationId);
      setSessions(list);
      // Auto-select active session if currently open
      const current = list.find((s) => s.status === 'in_progress');
      if (current) {
        setActiveSession(current);
      }
    } catch (err: any) {
      setError(err?.message || 'فشل في تحميل جلسات الجرد');
    } finally {
      setLoading(false);
    }
  }, [tenantId, locationId]);

  useEffect(() => {
    loadSessions();
  }, [loadSessions]);

  const handleStartSession = async (locId: string, notes?: string) => {
    if (!tenantId || !user?.uid) return { success: false, error: 'المستخدم غير مسجل' };
    const res = await startInventoryCountSession({
      tenantId,
      locationId: locId,
      startedBy: user.displayName || user.email || user.uid,
      notes,
    });
    if (res.success && res.session) {
      setActiveSession(res.session);
      await loadSessions();
    }
    return res;
  };

  const handleScanBarcode = async (sessionId: string, barcode: string, qty: number = 1) => {
    if (!tenantId) return { success: false, error: 'المؤسسة غير محددة' };
    const res = await recordBarcodeScanInCount(tenantId, sessionId, barcode, qty);
    if (res.success) {
      await loadSessions();
    }
    return res;
  };

  const handleUpdateItemQty = async (
    sessionId: string,
    productId: string,
    variantId: string | null | undefined,
    qty: number,
    notes?: string
  ) => {
    const res = await updateCountItemQuantity(sessionId, productId, variantId, qty, notes);
    if (res.success) {
      await loadSessions();
    }
    return res;
  };

  const handlePostSession = async (sessionId: string) => {
    if (!tenantId || !user?.uid) return { success: false, error: 'المستخدم غير مسجل' };
    const res = await postInventoryCountSession(
      tenantId,
      sessionId,
      user.displayName || user.email || user.uid
    );
    if (res.success) {
      await loadSessions();
      setActiveSession(null);
    }
    return res;
  };

  return {
    sessions,
    activeSession,
    setActiveSession,
    loading,
    error,
    refresh: loadSessions,
    startSession: handleStartSession,
    scanBarcode: handleScanBarcode,
    updateItemQty: handleUpdateItemQty,
    postSession: handlePostSession,
  };
}
