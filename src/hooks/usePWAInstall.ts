import { useEffect, useMemo, useState } from 'react';

export interface BeforeInstallPromptEvent extends Event {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed'; platform?: string }>;
}

export type InstallOutcome = 'accepted' | 'dismissed' | 'unavailable' | 'installed';

let deferredPrompt: BeforeInstallPromptEvent | null = null;
let initialized = false;
const subscribers = new Set<() => void>();

function emitChange() {
  subscribers.forEach((listener) => listener());
}

export function isRunningStandalone(): boolean {
  if (typeof window === 'undefined') return false;
  return (
    window.matchMedia('(display-mode: standalone)').matches ||
    (window.navigator as Navigator & { standalone?: boolean }).standalone === true
  );
}

export function getInstallPlatform(): 'ios' | 'android' | 'desktop' {
  if (typeof navigator === 'undefined') return 'desktop';
  const ua = navigator.userAgent || '';
  if (/iPad|iPhone|iPod/i.test(ua)) return 'ios';
  if (/Android/i.test(ua)) return 'android';
  return 'desktop';
}

function ensurePWAInstallListeners() {
  if (initialized || typeof window === 'undefined') return;
  initialized = true;

  window.addEventListener('beforeinstallprompt', (event) => {
    event.preventDefault();
    deferredPrompt = event as BeforeInstallPromptEvent;
    emitChange();
  });

  window.addEventListener('appinstalled', () => {
    deferredPrompt = null;
    try {
      localStorage.removeItem('pwa-prompt-dismissed');
    } catch {
      // Non-critical preference cleanup.
    }
    emitChange();
  });

  const media = window.matchMedia('(display-mode: standalone)');
  const handleDisplayModeChange = () => emitChange();

  if (typeof media.addEventListener === 'function') {
    media.addEventListener('change', handleDisplayModeChange);
  } else {
    // Safari legacy fallback.
    (media as any).addListener?.(handleDisplayModeChange);
  }
}

// Register as soon as this module is imported so Chrome cannot fire
// beforeinstallprompt before a route/layout component is mounted.
ensurePWAInstallListeners();

export async function triggerNativeInstall(): Promise<InstallOutcome> {
  if (isRunningStandalone()) return 'installed';

  const promptEvent = deferredPrompt;
  if (!promptEvent) return 'unavailable';

  try {
    await promptEvent.prompt();
    const choice = await promptEvent.userChoice;

    // beforeinstallprompt events are single-use.
    deferredPrompt = null;
    emitChange();

    return choice.outcome;
  } catch (error) {
    console.warn('[PWA] Native install prompt failed:', error);
    deferredPrompt = null;
    emitChange();
    return 'unavailable';
  }
}

export function usePWAInstall() {
  const [, forceRender] = useState(0);

  useEffect(() => {
    const subscriber = () => forceRender((value) => value + 1);
    subscribers.add(subscriber);
    return () => {
      subscribers.delete(subscriber);
    };
  }, []);

  const isStandalone = isRunningStandalone();
  const canNativeInstall = !!deferredPrompt;
  const platform = getInstallPlatform();

  return useMemo(
    () => ({
      isStandalone,
      canNativeInstall,
      platform,
      installNative: triggerNativeInstall,
    }),
    [isStandalone, canNativeInstall, platform]
  );
}
