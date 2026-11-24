/* Glamour Galleria Safe Service Worker (PWABuilder / TWA compatible)
 * Bypass rules ensure Firebase Auth, Google OAuth redirects, live Firestore,
 * Cloudinary uploads/media, and /api/* routes are never cached or intercepted.
 */

const CACHE_NAME = 'glamour-galleria-shell-v1';
const SHELL_URLS = [
  '/',
  '/manifest.json',
  '/pwa-192x192.png',
  '/pwa-512x512.png',
  '/apple-touch-icon.png',
  '/icon.svg',
];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches
      .open(CACHE_NAME)
      .then((cache) => cache.addAll(SHELL_URLS).catch(() => undefined))
      .then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) =>
        Promise.all(
          keys
            .filter((key) => key !== CACHE_NAME)
            .map((oldKey) => caches.delete(oldKey))
        )
      )
      .then(() => self.clients.claim())
  );
});

function shouldBypassRequest(request) {
  if (request.method !== 'GET') return true;

  let url;
  try {
    url = new URL(request.url);
  } catch {
    return true;
  }

  // Never intercept cross-origin calls (Firebase, Google OAuth, Cloudinary, Fonts, etc.)
  if (url.origin !== self.location.origin) {
    return true;
  }

  // Never intercept Firebase Auth handlers, Firebase reserved paths, or API routes
  if (
    url.pathname.startsWith('/__/') ||
    url.pathname.startsWith('/api/')
  ) {
    return true;
  }

  // Never intercept OAuth/redirect query callbacks
  if (
    url.searchParams.has('code') ||
    url.searchParams.has('state') ||
    url.searchParams.has('apiKey') ||
    url.searchParams.has('authuser')
  ) {
    return true;
  }

  return false;
}

self.addEventListener('fetch', (event) => {
  const { request } = event;
  if (shouldBypassRequest(request)) {
    return;
  }

  // Navigation requests: Network-first with offline fallback to cached shell
  if (request.mode === 'navigate') {
    event.respondWith(
      fetch(request)
        .then((response) => {
          if (response && response.ok && response.type === 'basic') {
            const copy = response.clone();
            void caches.open(CACHE_NAME).then((cache) => cache.put('/', copy));
          }
          return response;
        })
        .catch(async () => {
          const cached = await caches.match('/');
          return cached || Response.error();
        })
    );
    return;
  }

  // Same-origin static assets (/assets/*, icons, manifest): Network-first for manifest, SWR for static assets
  const url = new URL(request.url);
  if (url.pathname === '/manifest.json') {
    event.respondWith(
      fetch(request)
        .then((response) => {
          if (response && response.ok) {
            const copy = response.clone();
            void caches.open(CACHE_NAME).then((cache) => cache.put(request, copy));
          }
          return response;
        })
        .catch(async () => (await caches.match(request)) || Response.error())
    );
    return;
  }

  const isStaticAsset =
    url.pathname.startsWith('/assets/') ||
    /\.(?:js|css|png|jpg|jpeg|webp|svg|ico|woff2?)$/i.test(url.pathname);

  if (!isStaticAsset) {
    return;
  }

  event.respondWith(
    caches.match(request).then((cachedResponse) => {
      const networkFetch = fetch(request)
        .then((networkResponse) => {
          if (networkResponse && networkResponse.ok && networkResponse.type === 'basic') {
            const copy = networkResponse.clone();
            void caches
              .open(CACHE_NAME)
              .then((cache) => cache.put(request, copy));
          }
          return networkResponse;
        })
        .catch(() => cachedResponse);

      return cachedResponse || networkFetch;
    })
  );
});
