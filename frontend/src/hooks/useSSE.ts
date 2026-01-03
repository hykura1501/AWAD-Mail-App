import { useEffect, useRef, useCallback } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { getAccessToken } from "@/lib/api-client";
import { API_BASE_URL } from "@/config/api";
import { QUERY_KEYS } from "@/constants";

/** Information about a new email for toast notifications */
export interface NewEmailInfo {
  id: string;
  subject: string;
  from_name: string;
  from: string;
}

export interface SSEEventHandlers {
  /** Called when a new email arrives or is updated */
  onEmailUpdate?: () => void;
  /** Called when a new email is detected (for toast notifications) */
  onNewEmail?: (email: NewEmailInfo) => void;
  /** Called when an AI summary is ready */
  onSummaryUpdate?: (emailId: string, summary: string) => void;
  /** Called on SSE connection error */
  onError?: (error: Event) => void;
  /** Called when SSE connection opens */
  onOpen?: () => void;
}

export interface UseSSEOptions {
  /** Whether to enable SSE connection */
  enabled?: boolean;
  /** Debounce time in ms to ignore SSE updates after user actions */
  debounceMs?: number;
  /** Custom event handlers */
  handlers?: SSEEventHandlers;
}

export interface UseSSEReturn {
  /** Whether SSE is currently connected */
  isConnected: boolean;
  /** Manually reconnect SSE */
  reconnect: () => void;
  /** Manually disconnect SSE */
  disconnect: () => void;
}

/**
 * Custom hook for Server-Sent Events (SSE) connection
 * 
 * Handles:
 * - Connection to /events endpoint with authentication
 * - Automatic reconnection on error
 * - email_update events for real-time inbox updates
 * - summary_update events for AI-generated summaries
 * - Debouncing to prevent conflicts with user actions
 * 
 * @example
 * ```tsx
 * useSSE({
 *   enabled: !!user,
 *   handlers: {
 *     onEmailUpdate: () => refetch(),
 *     onSummaryUpdate: (emailId, summary) => {
 *       setSummaries(prev => ({ ...prev, [emailId]: summary }));
 *     },
 *   },
 * });
 * ```
 */
export function useSSE({
  enabled = true,
  debounceMs = 3000,
  handlers = {},
}: UseSSEOptions = {}): UseSSEReturn {
  const queryClient = useQueryClient();
  const eventSourceRef = useRef<EventSource | null>(null);
  const lastMutationTimeRef = useRef(0);
  const isConnectedRef = useRef(false);

  // Use ref for handlers to avoid reconnecting when handlers change
  const handlersRef = useRef(handlers);
  useEffect(() => {
    handlersRef.current = handlers;
  }, [handlers]);

  const disconnect = useCallback(() => {
    if (eventSourceRef.current) {
      eventSourceRef.current.close();
      eventSourceRef.current = null;
      isConnectedRef.current = false;
    }
  }, []);

  const connect = useCallback(() => {
    // Don't connect if disabled or already connected
    if (!enabled || eventSourceRef.current) return;

    const token = getAccessToken();
    if (!token) return;

    const sseUrl = `${API_BASE_URL}/events?token=${token}`;
    
    const eventSource = new EventSource(sseUrl, {
      withCredentials: true,
    });

    eventSource.onopen = () => {
      isConnectedRef.current = true;
      handlersRef.current.onOpen?.();
    };

    eventSource.onmessage = (event) => {
      try {
        const data = JSON.parse(event.data);

        // Handle summary updates from AI worker
        if (data.type === "summary_update") {
          const { email_id, summary } = data.payload || {};
          if (email_id && summary) {
            handlersRef.current.onSummaryUpdate?.(email_id, summary);
          }
          return;
        }

        // Handle email updates
        if (data.type === "email_update") {
          // Ignore SSE updates for debounceMs after user actions
          const timeSinceLastMutation = Date.now() - lastMutationTimeRef.current;
          if (timeSinceLastMutation < debounceMs) {
            return;
          }

          handlersRef.current.onEmailUpdate?.();

          // Invalidate React Query caches
          queryClient.invalidateQueries({
            queryKey: [QUERY_KEYS.EMAILS],
            refetchType: "none",
          });
          queryClient.invalidateQueries({
            queryKey: [QUERY_KEYS.MAILBOXES],
            refetchType: "none",
          });
        }
      } catch (error) {
        console.error("[SSE] Error parsing message:", error);
      }
    };

    eventSource.onerror = (error) => {
      // ignore specific error during development/reloading
      if (eventSource.readyState === EventSource.CLOSED) return;

      console.error("[SSE] Connection error:", error);
      isConnectedRef.current = false;
      handlersRef.current.onError?.(error);
      
      // Close and allow reconnection
      eventSource.close();
      eventSourceRef.current = null;
    };

    eventSourceRef.current = eventSource;
  }, [enabled, debounceMs, queryClient]); // Removed handlers from dependencies

  const reconnect = useCallback(() => {
    disconnect();
    // Small delay before reconnecting
    setTimeout(connect, 100);
  }, [disconnect, connect]);

  // Track mutation time to debounce SSE updates
  useEffect(() => {
    const unsubscribe = queryClient.getMutationCache().subscribe((event) => {
      if (
        event?.type === "updated" &&
        event.mutation.state.status === "pending"
      ) {
        lastMutationTimeRef.current = Date.now();
      }
    });

    return unsubscribe;
  }, [queryClient]);

  // Connect on mount, disconnect on unmount
  useEffect(() => {
    if (enabled) {
      connect();
    }

    return () => {
      disconnect();
    };
  }, [enabled, connect, disconnect]);

  return {
    isConnected: isConnectedRef.current,
    reconnect,
    disconnect,
  };
}

export default useSSE;
