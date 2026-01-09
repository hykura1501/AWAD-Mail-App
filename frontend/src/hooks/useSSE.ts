import { useState, useEffect, useRef, useCallback } from "react";
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
  /** Maximum reconnection attempts */
  maxReconnectAttempts?: number;
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

// Default configuration
const DEFAULT_DEBOUNCE_MS = 3000;
const DEFAULT_MAX_RECONNECT_ATTEMPTS = 5;
const RECONNECT_BASE_DELAY_MS = 1000;

/**
 * Custom hook for Server-Sent Events (SSE) connection
 * 
 * Features:
 * - Connection to /events endpoint with authentication
 * - Automatic reconnection with exponential backoff
 * - email_update events for real-time inbox updates
 * - summary_update events for AI-generated summaries
 * - Debouncing to prevent conflicts with user actions
 * 
 * @example
 * ```tsx
 * const { isConnected, reconnect } = useSSE({
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
  debounceMs = DEFAULT_DEBOUNCE_MS,
  maxReconnectAttempts = DEFAULT_MAX_RECONNECT_ATTEMPTS,
  handlers = {},
}: UseSSEOptions = {}): UseSSEReturn {
  const queryClient = useQueryClient();

  // Use state for isConnected so component re-renders on connection change
  const [isConnected, setIsConnected] = useState(false);

  const eventSourceRef = useRef<EventSource | null>(null);
  const lastMutationTimeRef = useRef(0);
  const reconnectAttemptsRef = useRef(0);
  const reconnectTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Use ref for handlers to avoid reconnecting when handlers change
  const handlersRef = useRef(handlers);
  useEffect(() => {
    handlersRef.current = handlers;
  }, [handlers]);

  // Clear any pending reconnect timeout
  const clearReconnectTimeout = useCallback(() => {
    if (reconnectTimeoutRef.current) {
      clearTimeout(reconnectTimeoutRef.current);
      reconnectTimeoutRef.current = null;
    }
  }, []);

  const disconnect = useCallback(() => {
    clearReconnectTimeout();
    if (eventSourceRef.current) {
      eventSourceRef.current.close();
      eventSourceRef.current = null;
      setIsConnected(false);
    }
  }, [clearReconnectTimeout]);

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
      setIsConnected(true);
      reconnectAttemptsRef.current = 0; // Reset on successful connection
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
          });
          queryClient.invalidateQueries({
            queryKey: [QUERY_KEYS.MAILBOXES],
          });
        }
      } catch (error) {
        console.error("[SSE] Error parsing message:", error);
      }
    };

    eventSource.onerror = (error) => {
      // Ignore specific error during development/reloading
      if (eventSource.readyState === EventSource.CLOSED) return;

      console.error("[SSE] Connection error:", error);
      setIsConnected(false);
      handlersRef.current.onError?.(error);

      // Close current connection
      eventSource.close();
      eventSourceRef.current = null;

      // Attempt reconnection with exponential backoff
      if (reconnectAttemptsRef.current < maxReconnectAttempts) {
        const delay = RECONNECT_BASE_DELAY_MS * Math.pow(2, reconnectAttemptsRef.current);
        reconnectAttemptsRef.current++;

        console.log(`[SSE] Reconnecting in ${delay}ms (attempt ${reconnectAttemptsRef.current}/${maxReconnectAttempts})`);

        reconnectTimeoutRef.current = setTimeout(() => {
          connect();
        }, delay);
      } else {
        console.error(`[SSE] Max reconnection attempts (${maxReconnectAttempts}) reached`);
      }
    };

    eventSourceRef.current = eventSource;
  }, [enabled, debounceMs, maxReconnectAttempts, queryClient]);

  const reconnect = useCallback(() => {
    reconnectAttemptsRef.current = 0; // Reset attempts on manual reconnect
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
    isConnected,
    reconnect,
    disconnect,
  };
}

export default useSSE;
