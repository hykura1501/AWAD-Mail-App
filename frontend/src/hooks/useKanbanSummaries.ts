import { useState, useCallback, useEffect } from "react";
import { emailService } from "@/services/email.service";
import { getAllSummariesFromCache, saveSummaryToCache, saveSummariesToCache } from "@/lib/db";

export interface SummaryState {
  summary: string;
  loading: boolean;
}

export interface UseKanbanSummariesReturn {
  /** Summary states keyed by email ID */
  summaryStates: Record<string, SummaryState>;
  /** Current detail summary */
  summary: string;
  /** Loading state for current detail */
  isSummaryLoading: boolean;
  /** Request a summary for an email (with deduplication) */
  requestSummary: (emailId: string) => Promise<void>;
  /** Queue summaries for multiple emails (batch) */
  queueSummaries: (emailIds: string[]) => Promise<void>;
  /** Handle SSE summary update */
  handleSummaryUpdate: (emailId: string, summary: string) => void;
  /** Load summary for detail view */
  loadDetailSummary: (emailId: string) => Promise<void>;
  /** Set of already-requested email IDs */
  requestedSummaries: Set<string>;
}

/**
 * Custom hook for AI summary management in Kanban
 * 
 * Handles:
 * - Loading cached summaries from IndexedDB on mount
 * - Requesting summaries with deduplication
 * - Batch queueing for background processing
 * - SSE update handling
 * - Current detail summary loading
 */
export function useKanbanSummaries(): UseKanbanSummariesReturn {
  // All summary states keyed by email ID
  const [summaryStates, setSummaryStates] = useState<Record<string, SummaryState>>({});
  
  // Current detail view summary
  const [summary, setSummary] = useState<string>("");
  const [isSummaryLoading, setIsSummaryLoading] = useState<boolean>(false);
  
  // Track which summaries have been requested (deduplication)
  const [requestedSummaries, setRequestedSummaries] = useState<Set<string>>(new Set());

  // Load cached summaries from IndexedDB on mount
  useEffect(() => {
    const loadCachedSummaries = async () => {
      try {
        const cachedSummaries = await getAllSummariesFromCache();
        if (Object.keys(cachedSummaries).length > 0) {
          setSummaryStates((prev) => {
            const next = { ...prev };
            for (const [emailId, summary] of Object.entries(cachedSummaries)) {
              // Only add if not already present
              if (!next[emailId]) {
                next[emailId] = { summary, loading: false };
              }
            }
            return next;
          });
          console.log(`[IndexedDB] Loaded ${Object.keys(cachedSummaries).length} cached summaries`);
        }
      } catch (error) {
        console.error("Error loading cached summaries:", error);
      }
    };
    loadCachedSummaries();
  }, []);

  // Request a single summary (with deduplication)
  const requestSummary = useCallback(async (emailId: string) => {
    if (requestedSummaries.has(emailId)) return;

    setRequestedSummaries((prev) => new Set(prev).add(emailId));
    setSummaryStates((prev) => ({
      ...prev,
      [emailId]: { summary: "", loading: true },
    }));

    try {
      const result = await emailService.getEmailSummary(emailId);
      setSummaryStates((prev) => ({
        ...prev,
        [emailId]: { summary: result, loading: false },
      }));
      // Save to IndexedDB
      saveSummaryToCache(emailId, result);
    } catch (error) {
      console.error("Error fetching summary:", error);
      setSummaryStates((prev) => ({
        ...prev,
        [emailId]: {
          summary: "Không thể tạo tóm tắt cho email này.",
          loading: false,
        },
      }));
    }
  }, [requestedSummaries]);

  // Queue summaries for multiple emails (batch)
  const queueSummaries = useCallback(async (emailIds: string[]) => {
    if (emailIds.length === 0) return;

    try {
      const { summaries } = await emailService.queueSummaries(emailIds);
      // Apply cached summaries immediately
      if (Object.keys(summaries).length > 0) {
        setSummaryStates((prev) => {
          const next = { ...prev };
          for (const [emailId, sum] of Object.entries(summaries)) {
            next[emailId] = { summary: sum, loading: false };
          }
          return next;
        });
        // Save to IndexedDB
        saveSummariesToCache(summaries);
      }
    } catch (error) {
      console.error("Error queueing summaries:", error);
    }
  }, []);

  // Handle SSE summary update
  const handleSummaryUpdate = useCallback((emailId: string, newSummary: string) => {
    setSummaryStates((prev) => ({
      ...prev,
      [emailId]: { summary: newSummary, loading: false },
    }));
    // Save to IndexedDB
    saveSummaryToCache(emailId, newSummary);
  }, []);

  // Load summary for detail view (with cache check)
  const loadDetailSummary = useCallback(async (emailId: string) => {
    // Check cache first
    const cached = summaryStates[emailId];
    if (cached && cached.summary && !cached.loading) {
      setSummary(cached.summary);
      setIsSummaryLoading(false);
      return;
    }

    try {
      setIsSummaryLoading(true);
      const result = await emailService.getEmailSummary(emailId);
      setSummary(result);
      // Update cache
      setSummaryStates((prev) => ({
        ...prev,
        [emailId]: { summary: result, loading: false },
      }));
    } catch (error) {
      console.error("Error fetching summary:", error);
      setSummary("Không thể tạo tóm tắt cho email này.");
    } finally {
      setIsSummaryLoading(false);
    }
  }, [summaryStates]);

  return {
    summaryStates,
    summary,
    isSummaryLoading,
    requestSummary,
    queueSummaries,
    handleSummaryUpdate,
    loadDetailSummary,
    requestedSummaries,
  };
}

export default useKanbanSummaries;
