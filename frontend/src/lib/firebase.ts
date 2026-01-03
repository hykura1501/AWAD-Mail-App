import { initializeApp } from 'firebase/app';
import { getMessaging, getToken, onMessage, type Messaging, isSupported } from 'firebase/messaging';
import { FIREBASE_CONFIG, FIREBASE_VAPID_KEY } from '../config/api';

export interface MessagePayload {
  notification?: {
    title?: string;
    body?: string;
    image?: string;
  };
  data?: {
    [key: string]: string;
  };
}

// Initialize Firebase
const app = initializeApp(FIREBASE_CONFIG);

let messaging: Messaging | null = null;
let swRegistration: ServiceWorkerRegistration | null = null;

// Register Service Worker with Firebase config
const registerServiceWorker = async (): Promise<ServiceWorkerRegistration | null> => {
  if (!('serviceWorker' in navigator)) {
    console.warn('Service Worker not supported');
    return null;
  }

  try {
    // Build URL with config params for the service worker
    const swUrl = new URL('/firebase-messaging-sw.js', window.location.origin);
    swUrl.searchParams.set('apiKey', FIREBASE_CONFIG.apiKey || '');
    swUrl.searchParams.set('authDomain', FIREBASE_CONFIG.authDomain || '');
    swUrl.searchParams.set('projectId', FIREBASE_CONFIG.projectId || '');
    swUrl.searchParams.set('storageBucket', FIREBASE_CONFIG.storageBucket || '');
    swUrl.searchParams.set('messagingSenderId', FIREBASE_CONFIG.messagingSenderId || '');
    swUrl.searchParams.set('appId', FIREBASE_CONFIG.appId || '');

    const registration = await navigator.serviceWorker.register(swUrl.toString());
    console.log('Service Worker registered:', registration);
    return registration;
  } catch (error) {
    console.error('Service Worker registration failed:', error);
    return null;
  }
};

// Initialize Firebase Cloud Messaging
const initMessaging = async () => {
  try {
    const supported = await isSupported();
    if (supported) {
      messaging = getMessaging(app);
      return messaging;
    }
  } catch (error) {
    console.warn('Firebase Messaging not supported:', error);
  }
  return null;
};

// Request permission and get token
export const requestForToken = async (): Promise<string | null> => {
  // Check if notification permission is granted or default
  if (Notification.permission === 'denied') {
    console.warn('Notification permission denied');
    return null;
  }

  // Request permission explicitly
  if (Notification.permission === 'default') {
    const permission = await Notification.requestPermission();
    if (permission !== 'granted') {
      console.warn('Notification permission not granted');
      return null;
    }
  }

  // Initialize messaging
  if (!messaging) {
    await initMessaging();
  }
  
  if (!messaging) {
    console.warn('Firebase Messaging not available');
    return null;
  }

  // Register service worker if not already registered
  if (!swRegistration) {
    swRegistration = await registerServiceWorker();
  }

  try {
    const currentToken = await getToken(messaging, { 
      vapidKey: FIREBASE_VAPID_KEY,
      serviceWorkerRegistration: swRegistration || undefined
    });
    if (currentToken) {
      console.log('FCM token obtained successfully');
      return currentToken;
    } else {
      console.log('No registration token available.');
      return null;
    }
  } catch (err) {
    console.error('An error occurred while retrieving token:', err);
    return null;
  }
};

// Listen for foreground messages
export const onMessageListener = (callback: (payload: MessagePayload) => void): (() => void) => {
  let unsubscribe: (() => void) | null = null;
  
  initMessaging().then((msg) => {
    if (msg) {
      unsubscribe = onMessage(msg, (payload) => {
        callback(payload);
      });
    }
  });
  
  // Return a function that will unsubscribe when called
  return () => {
    if (unsubscribe) {
      unsubscribe();
    }
  };
};

export { messaging };

