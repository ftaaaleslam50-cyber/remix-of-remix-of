const FALLBACK_ICON = '/brand-logo.png';

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
