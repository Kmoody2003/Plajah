importScripts('https://www.gstatic.com/firebasejs/12.9.0/firebase-app-compat.js');
importScripts('https://www.gstatic.com/firebasejs/12.9.0/firebase-messaging-compat.js');

firebase.initializeApp({
  apiKey: "AIzaSyAhcZm5fKh50H_g9kMTv9wgI-TBAWntd0Y",
  authDomain: "gen-lang-client-0665118474.firebaseapp.com",
  projectId: "gen-lang-client-0665118474",
  storageBucket: "gen-lang-client-0665118474.firebasestorage.app",
  messagingSenderId: "538331111809",
  appId: "1:538331111809:web:ff72e1715d2dc18a0a4880"
});

const messaging = firebase.messaging();

messaging.onBackgroundMessage(function(payload) {
  const notif = payload.notification || {};
  const title = notif.title || 'Plajah';
  const body = notif.body || '';

  self.registration.showNotification(title, {
    body,
    icon: '/icons/icon-192.png',
    badge: '/icons/icon-192.png',
    data: payload.data || {},
    vibrate: [200, 100, 200],
  });
});

self.addEventListener('notificationclick', function(event) {
  event.notification.close();
  const url = event.notification.data && event.notification.data.link
    ? event.notification.data.link
    : '/';
  event.waitUntil(
    clients.matchAll({ type: 'window', includeUncontrolled: true }).then(function(windowClients) {
      for (var i = 0; i < windowClients.length; i++) {
        var client = windowClients[i];
        if ('focus' in client) return client.focus();
      }
      return clients.openWindow(url);
    })
  );
});
