import { useState, useEffect, useCallback } from 'react';
import {
  connectivityService,
  offlineQueueService,
  offlineSyncService,
  offlineCacheService,
  type ConnectivityStatus,
  type CacheHealthStatus,
} from '@/services/offline';
import { useAppStore } from '@/lib/store';

export function useOfflineStatus() {
  const { currentTenant, currentBranch } = useAppStore();
  const tenantId = currentTenant?.id || '';
  const branchId = currentBranch?.id || '';

  const [connectivity, setConnectivity] = useState<ConnectivityStatus>(connectivityService.getStatus());
  const [counts, setCounts] = useState({
    pending: 0,
    syncing: 0,
    synced: 0,
    conflict: 0,
    failed: 0,
    awaiting_confirmation: 0,
  });
  const [cacheHealth, setCacheHealth] = useState<CacheHealthStatus>({
    isReady: false,
    productCount: 0,
    stockCount: 0,
    categoriesCount: 0,
  });

  const refreshCounts = useCallback(async () => {
    try {
      const c = await offlineQueueService.getCounts();
      setCounts(c);
    } catch {}
  }, []);

  const refreshCacheHealth = useCallback(async () => {
    if (!tenantId || !branchId) return;
    try {
      const h = await offlineCacheService.checkCacheHealth(tenantId, branchId);
      setCacheHealth(h);
    } catch {}
  }, [tenantId, branchId]);

  useEffect(() => {
    const unsubConn = connectivityService.subscribe((status) => {
      setConnectivity(status);
    });

    const unsubSync = offlineSyncService.subscribe(() => {
      refreshCounts();
    });

    refreshCounts();
    refreshCacheHealth();

    const interval = setInterval(() => {
      refreshCounts();
    }, 5000);

    return () => {
      unsubConn();
      unsubSync();
      clearInterval(interval);
    };
  }, [refreshCounts, refreshCacheHealth]);

  const syncNow = useCallback(async () => {
    const res = await offlineSyncService.attemptSync();
    await refreshCounts();
    return res;
  }, [refreshCounts]);

  return {
    connectivity,
    isOnline: connectivity === 'online',
    isOffline: connectivity === 'offline' || connectivity === 'reconnecting',
    isReconnecting: connectivity === 'reconnecting',
    isDegraded: connectivity === 'degraded',
    counts,
    pendingTotal: counts.pending + counts.awaiting_confirmation,
    hasConflicts: counts.conflict > 0 || counts.failed > 0,
    cacheHealth,
    syncNow,
    refreshCounts,
    refreshCacheHealth,
  };
}
