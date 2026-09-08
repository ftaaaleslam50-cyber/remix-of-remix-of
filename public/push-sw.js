const FALLBACK_ICON = '/brand-logo.png';
const SW_VERSION = 'v2';

self.addEventListener('install', () => {
  // New worker takes over immediately so users move off the old version after deploy.
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(self.clients.claim());
});

self.addEventListener('push', (event) => {
  let data = {};
  try { data = event.data ? event.data.json() : {}; } catch { data = { body: event.data?.text() || '' }; }

  const title = data.title || 'زهرة طيبة';
  const options = {
    body: data.body || '',
    icon: data.icon || FALLBACK_ICON,
    badge: data.badge || FALLBACK_ICON,
    data: {
      url: data.url || '/',
      notification_id: data.notification_id || null,
      booking_id: data.booking_id || null,
      type: data.type || 'system',
      sw: SW_VERSION,
    },
    dir: 'rtl',
    lang: 'ar',
    tag: data.notification_id ? `notification-${data.notification_id}` : undefined,
    renotify: true,
  };

  event.waitUntil(self.registration.showNotification(title, options));
});

self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  const target = new URL(event.notification.data?.url || '/', self.location.origin);
  if (target.origin !== self.location.origin) return;
  event.waitUntil((async () => {
    const clients = await self.clients.matchAll({ type: 'window', includeUncontrolled: true });
    const existing = clients.find((client) => 'focus' in client);
    if (existing) {
      await existing.focus();
      if ('navigate' in existing) await existing.navigate(target.href);
    } else {
      await self.clients.openWindow(target.href);
    }
  })());
});

self.addEventListener('notificationclose', () => {});

// The browser can rotate a subscription; tell any open tab so it re-syncs with the server.
self.addEventListener('pushsubscriptionchange', (event) => {
  event.waitUntil((async () => {
    try {
      const oldSub = event.oldSubscription || (await self.registration.pushManager.getSubscription());
      const applicationServerKey = event.newSubscription?.options?.applicationServerKey
        || oldSub?.options?.applicationServerKey;
      const fresh = event.newSubscription
        || (applicationServerKey
          ? await self.registration.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey })
          : null);
      if (!fresh) return;
      const clients = await self.clients.matchAll({ type: 'window', includeUncontrolled: true });
      for (const client of clients) {
        client.postMessage({ type: 'push-subscription-changed', subscription: fresh.toJSON() });
      }
    } catch (error) {
      // Nothing else we can do from the worker; the next page load re-syncs.
    }
  })());
});
