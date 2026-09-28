const SW_VERSION = 'mk-library-pwa-v3';

self.addEventListener('install', (event) => {
  console.log('[Service Worker] Installed:', SW_VERSION);
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  console.log('[Service Worker] Activated:', SW_VERSION);
  event.waitUntil(self.clients.claim());
});

self.addEventListener('fetch', (event) => {
  const request = event.request;

  // A real fetch handler is required for reliable PWA installability detection
  // in Chromium-based browsers. Keep it network-only so business/Firestore data
  // is never served from a stale application cache.
  if (request.method !== 'GET') return;

  try {
    const requestUrl = new URL(request.url);
    if (requestUrl.origin !== self.location.origin) return;
  } catch {
    return;
  }

  event.respondWith(
    fetch(request).catch(() => {
      // For navigation requests only, fall back to the app shell. We deliberately
      // do not cache API/business data here.
      if (request.mode === 'navigate') {
        return fetch('/');
      }
      throw new Error('Network request failed');
    })
  );
});
