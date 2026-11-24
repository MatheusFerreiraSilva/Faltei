/* eslint-disable no-restricted-globals */
// Service Worker extension for faltei. ("Plantão Noturno do Cúmplice")

self.addEventListener('push', (event) => {
  let title = 'faltei. — Plantão do Cúmplice';
  let body = 'Confira sua agenda de amanhã e o saldo das suas matérias.';
  let data = { url: '/?tab=hoje', tab: 'hoje' };

  try {
    if (event.data) {
      const payload = event.data.json();
      const notif = payload?.notification || payload || {};
      const customData = payload?.data || notif?.data || {};
      if (typeof notif.title === 'string' && notif.title.trim()) {
        title = notif.title.trim();
      }
      if (typeof notif.body === 'string' && notif.body.trim()) {
        body = notif.body.trim();
      }
      data = {
        url: typeof customData.url === 'string' ? customData.url : '/?tab=hoje',
        tab: typeof customData.tab === 'string' ? customData.tab : 'hoje',
        ...(typeof customData.materiaId === 'string' ? { materiaId: customData.materiaId } : {}),
      };
    }
  } catch {
    if (event.data) {
      const text = event.data.text();
      if (text) body = text;
    }
  }

  event.waitUntil(
    self.registration.showNotification(title, {
      body,
      icon: '/icon-192.svg',
      badge: '/icon-rounded.svg',
      vibrate: [120, 60, 120],
      tag: 'faltei-cumplice-digest',
      renotify: true,
      data,
    })
  );
});

self.addEventListener('message', (event) => {
  const payload = event.data;
  if (!payload || payload.type !== 'SHOW_CUMPLICE_NOTIFICATION') return;

  const title = typeof payload.title === 'string' ? payload.title : 'faltei.';
  const body = typeof payload.body === 'string' ? payload.body : '';
  const data = payload.data && typeof payload.data === 'object' ? payload.data : { url: '/?tab=hoje', tab: 'hoje' };

  event.waitUntil(
    self.registration.showNotification(title, {
      body,
      icon: '/icon-192.svg',
      badge: '/icon-rounded.svg',
      vibrate: [120, 60, 120],
      tag: 'faltei-cumplice-digest',
      renotify: true,
      data,
    })
  );
});

self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  const data = event.notification.data || {};
  const tab = typeof data.tab === 'string' ? data.tab : 'hoje';
  const materiaId = typeof data.materiaId === 'string' ? data.materiaId : '';
  const targetUrl =
    typeof data.url === 'string' && data.url.startsWith('/')
      ? data.url
      : `/?tab=${encodeURIComponent(tab)}${
          materiaId ? `&materiaId=${encodeURIComponent(materiaId)}` : ''
        }`;

  event.waitUntil(
    self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then((clientList) => {
      for (const client of clientList) {
        if ('focus' in client) {
          client.postMessage({
            type: 'FALTEI_NAVIGATE',
            tab,
            ...(materiaId ? { materiaId } : {}),
          });
          return client.focus();
        }
      }
      if (self.clients.openWindow) {
        return self.clients.openWindow(targetUrl);
      }
      return undefined;
    })
  );
});
