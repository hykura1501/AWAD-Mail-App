import { useEffect, useRef } from 'react';
import { requestForToken, onMessageListener } from '@/lib/firebase';
import { fcmService } from '@/services/fcm.service';
import { useAppSelector } from '@/store/hooks';
import { toast } from 'sonner';

// Global flag to prevent duplicate FCM initialization
let fcmInitialized = false;
let messageListenerRegistered = false;

// Deduplication: track recently shown notification IDs to prevent duplicates
const recentNotificationIds = new Set<string>();
const NOTIFICATION_DEDUP_WINDOW_MS = 10000; // 10 seconds

export const useFCM = () => {
  const { user, isAuthenticated } = useAppSelector((state) => state.auth);
  const tokenRegisteredRef = useRef<boolean>(false);

  // Register FCM token when user is authenticated
  useEffect(() => {
    if (isAuthenticated && user && !tokenRegisteredRef.current && !fcmInitialized) {
      fcmInitialized = true;
      tokenRegisteredRef.current = true;
      
      const initFCM = async () => {
        const token = await requestForToken();
        if (token) {
          try {
            await fcmService.registerToken(token);
            console.log('[FCM] Token registered successfully');
          } catch (error) {
            console.error('[FCM] Failed to register token:', error);
            // Reset flags on error to allow retry
            fcmInitialized = false;
            tokenRegisteredRef.current = false;
          }
        }
      };

      initFCM();
    }
  }, [isAuthenticated, user]);

  // Subscribe to foreground messages - only once globally
  useEffect(() => {
    // Skip if already subscribed
    if (messageListenerRegistered) {
      return;
    }
    messageListenerRegistered = true;

    // Small delay (2s) to ignore buffered messages right after subscription
    const INITIAL_LOAD_IGNORE_MS = 2000;
    const subscriptionTime = Date.now();

    onMessageListener((payload) => {
      // Ignore messages that arrive too soon after subscription (likely buffered/cached)
      const timeSinceSubscription = Date.now() - subscriptionTime;
      if (timeSinceSubscription < INITIAL_LOAD_IGNORE_MS) {
        console.log('[FCM] Ignoring buffered message during initial subscription period');
        return;
      }

      // Generate a unique ID for this notification to prevent duplicates
      // Prefer messageId (stable for same email) over historyId (changes per event)
      const notificationId = payload.data?.messageId || 
                            payload.data?.historyId || 
                            `${payload.notification?.title}-${payload.notification?.body}-${Date.now()}`;
      
      // Check if we've already shown this notification recently
      if (notificationId && recentNotificationIds.has(notificationId)) {
        console.log('[FCM] Ignoring duplicate notification:', notificationId);
        return;
      }

      // Add to recent notifications and auto-remove after window expires
      recentNotificationIds.add(notificationId);
      setTimeout(() => {
        recentNotificationIds.delete(notificationId);
      }, NOTIFICATION_DEDUP_WINDOW_MS);

      console.log('[FCM] Showing notification:', payload);
      const title = payload.notification?.title || 'Thông báo';
      const body = payload.notification?.body || '';

      toast(title, {
        description: body,
        duration: 8000,
        action: {
          label: 'Xem',
          onClick: () => {
            if (payload.data?.click_action) {
              window.location.href = payload.data.click_action;
            }
          },
        },
      });
    });
  }, []);
};
