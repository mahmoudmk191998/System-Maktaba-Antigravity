/**
 * Connectivity & Reachability Detection Service
 * Distinguishes genuine transport failures from auth/permission/business rule errors.
 */

import type { ConnectivityStatus } from './offlineTypes';

type ConnectivityListener = (status: ConnectivityStatus) => void;

class OfflineConnectivityService {
  private currentStatus: ConnectivityStatus = navigator.onLine ? 'online' : 'offline';
  private listeners: Set<ConnectivityListener> = new Set();
  private probeInterval: any = null;
  private lastSuccessfulProbe: number = Date.now();

  constructor() {
    if (typeof window !== 'undefined') {
      window.addEventListener('online', () => this.handleBrowserOnline());
      window.addEventListener('offline', () => this.handleBrowserOffline());
      // Periodic lightweight probe when believed to be online
      this.startPeriodicProbe();
    }
  }

  public getStatus(): ConnectivityStatus {
    return this.currentStatus;
  }

  public isOnline(): boolean {
    return this.currentStatus === 'online';
  }

  public isOffline(): boolean {
    return this.currentStatus === 'offline' || this.currentStatus === 'reconnecting';
  }

  public subscribe(listener: ConnectivityListener): () => void {
    this.listeners.add(listener);
    listener(this.currentStatus);
    return () => {
      this.listeners.delete(listener);
    };
  }

  private notify() {
    for (const listener of this.listeners) {
      try {
        listener(this.currentStatus);
      } catch (err) {
        console.error('Error notifying connectivity listener:', err);
      }
    }
  }

  private setStatus(newStatus: ConnectivityStatus) {
    if (this.currentStatus !== newStatus) {
      this.currentStatus = newStatus;
      this.notify();
    }
  }

  private handleBrowserOffline() {
    this.setStatus('offline');
  }

  private async handleBrowserOnline() {
    this.setStatus('reconnecting');
    const reachable = await this.probeReachability();
    if (reachable) {
      this.setStatus('online');
    } else {
      this.setStatus('degraded');
    }
  }

  public async probeReachability(): Promise<boolean> {
    if (typeof navigator !== 'undefined' && !navigator.onLine) {
      this.setStatus('offline');
      return false;
    }

    try {
      // Lightweight fetch with strict timeout (3000ms) and no-cache
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 3000);

      // Probe a small static asset or favicon with cache-buster
      const probeUrl = `${window.location.origin}/favicon.ico?_t=${Date.now()}`;
      const response = await fetch(probeUrl, {
        method: 'HEAD',
        cache: 'no-store',
        signal: controller.signal,
      });

      clearTimeout(timeoutId);
      if (response.ok || response.status === 304 || response.status === 200) {
        this.lastSuccessfulProbe = Date.now();
        if (this.currentStatus !== 'online') {
          this.setStatus('online');
        }
        return true;
      }
      return false;
    } catch (err) {
      // Failed to reach even the origin
      if (this.currentStatus === 'online') {
        this.setStatus('reconnecting');
      }
      return false;
    }
  }

  private startPeriodicProbe() {
    if (typeof window === 'undefined') return;
    if (this.probeInterval) clearInterval(this.probeInterval);

    this.probeInterval = setInterval(() => {
      if (navigator.onLine && Date.now() - this.lastSuccessfulProbe > 20000) {
        this.probeReachability();
      }
    }, 20000);

    if (typeof this.probeInterval === 'object' && typeof (this.probeInterval as any)?.unref === 'function') {
      (this.probeInterval as any).unref();
    }
  }

  public destroy() {
    if (this.probeInterval) {
      clearInterval(this.probeInterval);
      this.probeInterval = null;
    }
  }

  /**
   * Safeguard 4:
   * Strictly determines whether an error is a genuine transport/network outage,
   * as opposed to auth, permission, validation, or business-rule violations.
   */
  public isGenuineTransportError(err: any): boolean {
    if (!err) return false;

    // Check navigator
    if (typeof navigator !== 'undefined' && !navigator.onLine) {
      return true;
    }

    const message = (err.message || '').toLowerCase();
    const code = (err.code || '').toLowerCase();
    const name = (err.name || '').toLowerCase();

    // 1. Explicit business/auth rejections are NEVER transport errors
    const nonTransportCodes = [
      'permission-denied',
      'unauthenticated',
      'invalid-argument',
      'failed-precondition',
      'out-of-range',
      'already-exists',
      'not-found',
      'resource-exhausted',
    ];

    for (const blocked of nonTransportCodes) {
      if (code.includes(blocked) || message.includes(blocked)) {
        return false;
      }
    }

    // Explicit business messages
    const businessKeywords = [
      'غير كاف',
      'مخزون',
      'مغلقة',
      'صلاحية',
      'الحد الائتماني',
      'سعر أقل من الأدنى',
      'مؤرشف',
      'overdue',
      'insufficient',
      'closed',
      'credit limit',
    ];
    for (const kw of businessKeywords) {
      if (message.includes(kw.toLowerCase())) {
        return false;
      }
    }

    // 2. Genuine transport / network failures
    const transportPatterns = [
      'unavailable',
      'deadline-exceeded',
      'network-request-failed',
      'networkerror',
      'failed to fetch',
      'timeout',
      'aborted',
      'connection reset',
      'connection refused',
      'econnrefused',
      'enotfound',
      'offline',
      'etimedout',
    ];

    for (const pattern of transportPatterns) {
      if (code.includes(pattern) || message.includes(pattern) || name.includes(pattern)) {
        return true;
      }
    }

    return false;
  }
}

export const connectivityService = new OfflineConnectivityService();
export const isGenuineTransportError = (err: any) => connectivityService.isGenuineTransportError(err);
