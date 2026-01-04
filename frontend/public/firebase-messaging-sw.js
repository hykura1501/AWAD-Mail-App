/* eslint-disable no-undef */
// Give the service worker access to Firebase Messaging.
// Note that you can only use Firebase Messaging here. Other Firebase libraries are not available in the service worker.
importScripts('https://www.gstatic.com/firebasejs/9.23.0/firebase-app-compat.js');
importScripts('https://www.gstatic.com/firebasejs/9.23.0/firebase-messaging-compat.js');

// Initialize the Firebase app in the service worker by passing in the
// messagingSenderId.
const params = new URL(location).searchParams;
const config = {
  apiKey: params.get('apiKey'),
  authDomain: params.get('authDomain'),
  projectId: params.get('projectId'),
  storageBucket: params.get('storageBucket'),
  messagingSenderId: params.get('messagingSenderId'),
  appId: params.get('appId'),
};

if (config.apiKey && config.projectId && config.messagingSenderId && config.appId) {
  firebase.initializeApp(config);

  // Retrieve an instance of Firebase Messaging so that it can handle background
  // messages.
  const messaging = firebase.messaging();

  messaging.onBackgroundMessage((payload) => {
    console.log('[firebase-messaging-sw.js] Received background message ', payload);
    
    // Customize notification handling here
    const notificationTitle = payload.notification?.title || 'New Email';
    const notificationOptions = {
      body: payload.notification?.body || 'You have a new email',
      icon: '/icon-192.svg',
      data: payload.data
    };

    self.registration.showNotification(notificationTitle, notificationOptions);
  });
  
  self.addEventListener('notificationclick', function(event) {
    console.log('[firebase-messaging-sw.js] Notification click Received.', event);
    event.notification.close();

    // Get the click action URL from notification data
    const clickAction = event.notification.data?.click_action || '/inbox';
    const messageId = event.notification.data?.messageId;
    
    // Determine the target URL
    let targetUrl = clickAction;
    
    // If we have a messageId but click_action doesn't include it, construct the URL
    if (messageId && !clickAction.includes(messageId)) {
      targetUrl = `/inbox/${messageId}`;
    }

    console.log('[firebase-messaging-sw.js] Navigating to:', targetUrl);

    event.waitUntil(
      clients.matchAll({type: 'window', includeUncontrolled: true}).then(windowClients => {
        // Look for an existing window with our app
        for (let i = 0; i < windowClients.length; i++) {
          const client = windowClients[i];
          // If there's an existing window, navigate it to the new URL
          if ('focus' in client && 'navigate' in client) {
            return client.focus().then(focusedClient => {
              // Navigate to the email URL
              return focusedClient.navigate(targetUrl);
            });
          }
        }
        // If no window found, open a new one
        if (clients.openWindow) {
          return clients.openWindow(targetUrl);
        }
      })
    );
  });
} else {
  console.log('Firebase config missing in SW URL. Background updates disabled.');
}
