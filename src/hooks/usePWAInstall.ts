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

function getWindowPrompt(): BeforeInstallPromptEvent | null {
  if (typeof window === 'undefined') return null;
  return ((window as any).__MK_PWA_INSTALL_PROMPT__ as BeforeInstallPromptEvent | null) || null;
}

function setWindowPrompt(prompt: BeforeInstallPromptEvent | null) {
  if (typeof window === 'undefined') return;
  (window as any).__MK_PWA_INSTALL_PROMPT__ = prompt;
  (window as any).__MK_PWA_INSTALLABLE__ = !!prompt;
}

function syncPromptFromWindow() {
  const captured = getWindowPrompt();
  if (captured !== deferredPrompt) {
    deferredPrompt = captured;
    emitChange();
  }
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

  // Pull in an event captured by index.html before the React bundle executed.
  syncPromptFromWindow();

  // Safety listener for browsers that emit after React is running.
  window.addEventListener('beforeinstallprompt', (event) => {
    event.preventDefault();
    deferredPrompt = event as BeforeInstallPromptEvent;
    setWindowPrompt(deferredPrompt);
    emitChange();
  });

  window.addEventListener('mk:pwa-install-ready', syncPromptFromWindow);

  const clearInstallPrompt = () => {
    deferredPrompt = null;
    setWindowPrompt(null);
    emitChange();
  };

  window.addEventListener('appinstalled', clearInstallPrompt);
  window.addEventListener('mk:pwa-install-consumed', clearInstallPrompt);

  const media = window.matchMedia('(display-mode: standalone)');
  const handleDisplayModeChange = () => emitChange();

  if (typeof media.addEventListener === 'function') {
    media.addEventListener('change', handleDisplayModeChange);
  } else {
    (media as any).addListener?.(handleDisplayModeChange);
  }
}

// Register immediately at module evaluation time.
ensurePWAInstallListeners();

export async function triggerNativeInstall(): Promise<InstallOutcome> {
  if (isRunningStandalone()) return 'installed';

  // Re-sync in case index.html captured the event before this module existed.
  syncPromptFromWindow();

  const promptEvent = deferredPrompt || getWindowPrompt();
  if (!promptEvent) {
    return 'unavailable';
  }

  try {
    // Must run from the user's click handler; this opens Chrome/Edge native UI.
    await promptEvent.prompt();
    const choice = await promptEvent.userChoice;

    // Chromium install events are single-use, regardless of accepted/dismissed.
    deferredPrompt = null;
    setWindowPrompt(null);
    emitChange();

    return choice.outcome;
  } catch (error) {
    console.warn('[PWA] Native install prompt failed:', error);
    deferredPrompt = null;
    setWindowPrompt(null);
    emitChange();
    return 'unavailable';
  }
}

export function usePWAInstall() {
  const [, forceRender] = useState(0);

  useEffect(() => {
    syncPromptFromWindow();

    const subscriber = () => forceRender((value) => value + 1);
    subscribers.add(subscriber);

    const onReady = () => {
      syncPromptFromWindow();
      forceRender((value) => value + 1);
    };

    window.addEventListener('mk:pwa-install-ready', onReady);

    return () => {
      subscribers.delete(subscriber);
      window.removeEventListener('mk:pwa-install-ready', onReady);
    };
  }, []);

  const isStandalone = isRunningStandalone();
  const canNativeInstall = !!(deferredPrompt || getWindowPrompt());
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
