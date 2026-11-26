const CACHE_NAME = 'menuplus-shell-v6';
const SHELL_ASSETS = [
  '/manifest.webmanifest',
  '/assets/aistudio/icon_f95f5a07.png',
  '/apple-touch-icon.png',
  '/pwa-192x192.png',
  '/pwa-512x512.png',
  '/pwa-maskable-512x512.png',
];

self.addEventListener('install', (event) => {
  self.skipWaiting();
  event.waitUntil(
    caches
      .open(CACHE_NAME)
      .then((cache) => cache.addAll(SHELL_ASSETS).catch(() => undefined))
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== CACHE_NAME).map((k) => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', (event) => {
  const req = event.request;
  if (req.method !== 'GET' || req.mode === 'navigate') return;
  const url = new URL(req.url);
  if (url.origin !== self.location.origin) return;
  if (url.pathname.startsWith('/api/') || url.pathname.startsWith('/@')) return;

  // Never serve stale cached HTML or hashed CSS/JS from SW:
  // only serve cached static icons/manifest when cached in SHELL_ASSETS.
  if (SHELL_ASSETS.includes(url.pathname)) {
    event.respondWith(
      caches.match(req).then((cached) => cached || fetch(req))
    );
  }
});

self.addEventListener('push', (event) => {
  let data = {
    title: '🔔 طلب جديد',
    body: 'وصلك طلب جديد في لوحة التحكم',
    url: '/dashboard/orders',
    tag: 'menuplus-new-order',
    rid: '',
    orderId: '',
  };

  if (event.data) {
    try {
      const parsed = event.data.json();
      if (parsed && typeof parsed === 'object') {
        data = { ...data, ...parsed };
      }
    } catch {
      const text = event.data.text();
      if (text) {
        data.body = text;
      }
    }
  }

  event.waitUntil(
    (async () => {
      await self.registration.showNotification(data.title, {
        body: data.body,
        icon: '/pwa-192x192.png',
        badge: '/pwa-192x192.png',
        tag: data.tag || 'menuplus-new-order',
        renotify: true,
        requireInteraction: true,
        vibrate: [220, 100, 220],
        dir: 'rtl',
        lang: 'ar',
        data: {
          url: data.url || '/dashboard/orders',
          rid: data.rid || '',
          orderId: data.orderId || '',
        },
      });

      const clientsList = await self.clients.matchAll({
        type: 'window',
        includeUncontrolled: true,
      });
      for (const client of clientsList) {
        client.postMessage({
          type: 'MENUPLUS_NEW_ORDER_PUSH',
          rid: data.rid || '',
          orderId: data.orderId || '',
        });
      }
    })()
  );
});

self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  const targetUrl =
    (event.notification && event.notification.data && event.notification.data.url) ||
    '/dashboard/orders';

  event.waitUntil(
    (async () => {
      const clientsList = await self.clients.matchAll({
        type: 'window',
        includeUncontrolled: true,
      });

      for (const client of clientsList) {
        if ('focus' in client) {
          await client.focus();
          if ('navigate' in client && !client.url.includes('/dashboard/orders')) {
            try {
              await client.navigate(targetUrl);
            } catch {
              // ignore navigation errors
            }
          }
          return;
        }
      }

      if (self.clients.openWindow) {
        await self.clients.openWindow(targetUrl);
      }
    })()
  );
});
