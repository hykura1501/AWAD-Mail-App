import { useEffect, useRef } from 'react';
import { requestForToken, onMessageListener } from '@/lib/firebase';
import { fcmService } from '@/services/fcm.service';
import { useAppSelector } from '@/store/hooks';
import { toast } from 'sonner';

// Global flag to prevent duplicate FCM initialization within same tab
let fcmInitialized = false;
let messageListenerRegistered = false;

// Cross-tab deduplication using localStorage with claim-based locking
const NOTIFICATION_STORAGE_KEY = 'fcm_shown_notifications';
const NOTIFICATION_DEDUP_WINDOW_MS = 10000; // 10 seconds

// Generate a unique ID for this tab instance
const TAB_ID = `${Date.now()}-${Math.random().toString(36).substring(2, 9)}`;

interface NotificationClaim {
  claimedBy: string;  // TAB_ID of the tab that claimed it
  claimedAt: number;  // timestamp
}

/**
 * Try to claim the right to show a notification.
 * Uses a claim-then-verify pattern to handle race conditions.
 * Returns true if this tab should show the notification.
 */
const tryClaimNotification = async (notificationId: string): Promise<boolean> => {
  try {
    const storageKey = `${NOTIFICATION_STORAGE_KEY}_${notificationId}`;
    
    // First, check if already claimed by another tab
    const existing = localStorage.getItem(storageKey);
    if (existing) {
      const claim: NotificationClaim = JSON.parse(existing);
      // If claimed recently (within dedup window), don't show
      if ((Date.now() - claim.claimedAt) < NOTIFICATION_DEDUP_WINDOW_MS) {
        console.log(`[FCM] Notification ${notificationId} already claimed by tab ${claim.claimedBy}`);
        return false;
      }
    }
    
    // Try to claim it
    const myClaim: NotificationClaim = {
      claimedBy: TAB_ID,
      claimedAt: Date.now(),
    };
    localStorage.setItem(storageKey, JSON.stringify(myClaim));
    
    // Wait a bit for other tabs to also try claiming
    await new Promise(resolve => setTimeout(resolve, 50));
    
    // Verify our claim is still valid (wasn't overwritten by another tab)
    const verifyRaw = localStorage.getItem(storageKey);
    if (!verifyRaw) {
      // Someone deleted it? Claim again
      localStorage.setItem(storageKey, JSON.stringify(myClaim));
      return true;
    }
    
    const verifyClaim: NotificationClaim = JSON.parse(verifyRaw);
    if (verifyClaim.claimedBy === TAB_ID) {
      console.log(`[FCM] Successfully claimed notification ${notificationId}`);
      // Schedule cleanup
      setTimeout(() => {
        try {
          localStorage.removeItem(storageKey);
        } catch { /* ignore */ }
      }, NOTIFICATION_DEDUP_WINDOW_MS);
      return true;
    } else {
      console.log(`[FCM] Lost claim race for ${notificationId} to tab ${verifyClaim.claimedBy}`);
      return false;
    }
  } catch (e) {
    console.error('[FCM] Error in claim mechanism:', e);
    // On error, allow showing (better to show duplicate than miss notification)
    return true;
  }
};

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

  // Subscribe to foreground messages - only once per tab
  useEffect(() => {
    // Skip if already subscribed in this tab
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

      // Generate a unique ID for this notification
      // Include task_id for task reminders, messageId for emails
      const notificationId = payload.data?.messageId || 
                            payload.data?.task_id ||
                            payload.data?.historyId || 
                            `${payload.notification?.title}-${payload.notification?.body}`;
      
      // Try to claim the right to show this notification (cross-tab dedup)
      tryClaimNotification(notificationId).then((shouldShow) => {
        if (!shouldShow) {
          return;
        }

        console.log('[FCM] Showing notification:', payload);
        // Read from data payload (we now send data-only messages)
        // Fallback to notification field for backwards compatibility
        const title = payload.data?.title || payload.notification?.title || 'Thông báo';
        const body = payload.data?.body || payload.notification?.body || '';

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
    });
  }, []);
};
