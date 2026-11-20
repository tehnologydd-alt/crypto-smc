const CACHE = 'orbit-v19';
const SHELL = ['/', '/index.html', '/app.js?v=15', '/wake.js', '/notification-settings.js', '/asset.html', '/asset.js?v=14', '/asset.css?v=14', '/style.css?v=17', '/manifest.json', '/icon.svg', '/icon-192.png', '/icon-512.png'];
self.addEventListener('install', event => { event.waitUntil(caches.open(CACHE).then(cache => cache.addAll(SHELL))); self.skipWaiting(); });
self.addEventListener('activate', event => { event.waitUntil(caches.keys().then(keys => Promise.all(keys.filter(k => k !== CACHE).map(k => caches.delete(k))))); self.clients.claim(); });
self.addEventListener('fetch', event => {
  if (event.request.method !== 'GET' || new URL(event.request.url).pathname.startsWith('/api/')) return;
  event.respondWith(fetch(event.request).then(response => { const copy = response.clone(); caches.open(CACHE).then(cache => cache.put(event.request, copy)); return response; }).catch(() => caches.match(event.request)));
});
self.addEventListener('push', event => {
  let data = { title: 'Orbit Signals', body: 'Обновление сигнала' };
  try { data = event.data?.json() || data; } catch {}
  event.waitUntil(self.registration.showNotification(data.title, { body: data.body, icon: '/icon-192.png', badge: '/icon-192.png', tag: `${data.id || 'signal'}:${data.title}`, data: { id: data.id, url: data.url }, vibrate: [120, 80, 120] }));
});
self.addEventListener('notificationclick', event => {
  event.notification.close();
  const target = new URL(event.notification.data?.url || '/', self.location.origin).href;
  event.waitUntil(self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then(async clients => {
    const client = clients.find(item => new URL(item.url).origin === self.location.origin);
    if (client) {
      try { await client.navigate(target); return client.focus(); }
      catch { /* The existing window may have closed during navigation. */ }
    }
    return self.clients.openWindow(target);
  }));
});

