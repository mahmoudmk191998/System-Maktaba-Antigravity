/**
 * Global Connectivity Banner & Status Pill
 * Displays clear, non-intrusive status when offline or reconnecting,
 * with quick access to the Sync Center.
 */

import React, { useState } from 'react';
import { useOfflineStatus } from '@/hooks/useOfflineStatus';
import { SyncCenterDrawer } from './SyncCenterDrawer';
import { Wifi, WifiOff, RefreshCw, AlertTriangle, CloudOff } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { cn } from '@/lib/utils';

interface ConnectivityBannerProps {
  compact?: boolean;
}

export function ConnectivityBanner({ compact }: ConnectivityBannerProps) {
  const { isOnline, isOffline, isReconnecting, isDegraded, pendingTotal, hasConflicts, counts } = useOfflineStatus();
  const [drawerOpen, setDrawerOpen] = useState(false);

  // If online, no pending operations, and no conflicts, we don't need a prominent bar
  // But if compact (like in POS header), we show the status pill
  if (compact) {
    return (
      <>
        <div className="flex items-center gap-1.5">
          <Button
            size="sm"
            variant="ghost"
            onClick={() => setDrawerOpen(true)}
            className={cn(
              "h-8 px-2.5 rounded-xl font-bold text-xs gap-1.5 border transition-all shadow-sm",
              isOnline && pendingTotal === 0 && !hasConflicts
                ? "bg-emerald-500/10 text-emerald-700 border-emerald-500/20 hover:bg-emerald-500/20"
                : isReconnecting
                ? "bg-amber-500/10 text-amber-700 border-amber-500/30 animate-pulse hover:bg-amber-500/20"
                : hasConflicts
                ? "bg-destructive/10 text-destructive border-destructive/30 hover:bg-destructive/20"
                : "bg-amber-500/10 text-amber-700 border-amber-500/30 hover:bg-amber-500/20"
            )}
            title="انقر لفتح مركز المزامنة"
          >
            {isOnline ? (
              <span className="relative flex h-2 w-2">
                <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75"></span>
                <span className="relative inline-flex rounded-full h-2 w-2 bg-emerald-500"></span>
              </span>
            ) : (
              <WifiOff className="w-3.5 h-3.5 text-destructive" />
            )}

            <span>
              {isOnline
                ? pendingTotal > 0
                  ? `متصل (${pendingTotal} معلقة)`
                  : 'متصل'
                : isReconnecting
                ? 'جاري الاتصال...'
                : 'غير متصل'}
            </span>

            {hasConflicts && (
              <Badge variant="destructive" className="h-4 px-1 text-[10px] py-0 font-extrabold">
                {counts.conflict} تعارض
              </Badge>
            )}
          </Button>
        </div>

        <SyncCenterDrawer open={drawerOpen} onOpenChange={setDrawerOpen} />
      </>
    );
  }

  // Full-width bar (if offline, reconnecting, or pending items exist)
  if (isOnline && pendingTotal === 0 && !hasConflicts) {
    return null;
  }

  return (
    <>
      <div
        className={cn(
          "w-full px-4 py-2 text-xs font-bold flex items-center justify-between shadow-sm transition-all z-30 font-cairo",
          isOffline
            ? "bg-amber-500/15 border-b border-amber-500/30 text-amber-900 dark:text-amber-200"
            : isReconnecting
            ? "bg-blue-500/15 border-b border-blue-500/30 text-blue-900 dark:text-blue-200"
            : hasConflicts
            ? "bg-destructive/15 border-b border-destructive/30 text-destructive"
            : "bg-emerald-500/10 border-b border-emerald-500/20 text-emerald-800 dark:text-emerald-300"
        )}
      >
        <div className="flex items-center gap-2">
          {isOffline ? (
            <CloudOff className="w-4 h-4 text-amber-600 dark:text-amber-400 shrink-0" />
          ) : isReconnecting ? (
            <RefreshCw className="w-4 h-4 text-blue-600 dark:text-blue-400 animate-spin shrink-0" />
          ) : hasConflicts ? (
            <AlertTriangle className="w-4 h-4 text-destructive shrink-0" />
          ) : (
            <Wifi className="w-4 h-4 text-emerald-600 shrink-0" />
          )}

          <span>
            {isOffline
              ? 'أنت تعمل الآن بدون اتصال — سيتم حفظ العمليات المدعومة محلياً ومزامنتها تلقائياً عند عودة الإنترنت.'
              : isReconnecting
              ? 'جاري استعادة الاتصال بالخادم والمزامنة التلقائية...'
              : hasConflicts
              ? 'توجد عمليات بها تعارض مع الخادم وتتطلب مراجعة من الإدارة.'
              : `توجد ${pendingTotal} عمليات معلقة بانتظار اكتمال المزامنة.`}
          </span>
        </div>

        <div className="flex items-center gap-2">
          {pendingTotal > 0 && (
            <Badge variant="outline" className="bg-background/80 font-black text-[11px]">
              {pendingTotal} معلقة
            </Badge>
          )}

          <Button
            size="sm"
            variant="outline"
            onClick={() => setDrawerOpen(true)}
            className="h-7 text-[11px] px-2.5 bg-background/80 hover:bg-background font-bold"
          >
            مركز المزامنة
          </Button>
        </div>
      </div>

      <SyncCenterDrawer open={drawerOpen} onOpenChange={setDrawerOpen} />
    </>
  );
}
