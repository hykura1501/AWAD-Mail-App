import { useState, useCallback, useEffect } from "react";
import type { Email, KanbanColumnConfig, Mailbox } from "@/types/email";
import { emailService } from "@/services/email.service";
import { getKanbanColumnFromCache, saveKanbanColumnToCache } from "@/lib/db";

const DEFAULT_LIMIT = 20;
const BATCH_SIZE = 2;
const DEFAULT_COLUMN_IDS = ["inbox", "todo", "done", "snoozed"] as const;

export interface UseKanbanDataOptions {
  /** Initial page size for each column */
  limit?: number;
  /** Callback when all columns finish loading */
  onInitComplete?: (emailIds: string[]) => void;
}

export interface UseKanbanDataReturn {
  // Data
  kanbanEmails: Record<string, Email[]>;
  kanbanOffsets: Record<string, number>;
  kanbanColumnConfigs: KanbanColumnConfig[];
  mailboxes: Mailbox[];
  
  // Loading states (consolidated into Record)
  loadingColumns: Record<string, boolean>;
  isAnyLoading: boolean;
  
  // Actions
  loadColumn: (status: string, offset: number) => Promise<void>;
  reloadAllColumns: () => Promise<void>;
  moveEmail: (emailId: string, targetColumnId: string, sourceColumnId?: string) => void;
  updatePage: (col: string, dir: 1 | -1) => void;
  setKanbanEmails: React.Dispatch<React.SetStateAction<Record<string, Email[]>>>;
  setKanbanColumnConfigs: React.Dispatch<React.SetStateAction<KanbanColumnConfig[]>>;
  
  // Constants
  limit: number;
}

/**
 * Custom hook for Kanban board data management
 * 
 * Handles:
 * - Column data loading with IndexedDB cache-first strategy
 * - Pagination per column
 * - Optimistic drag-drop updates
 * - Batch loading to avoid overwhelming backend
 * 
 * @example
 * ```tsx
 * const { kanbanEmails, loadingColumns, moveEmail } = useKanbanData({
 *   onInitComplete: (emailIds) => queueSummaries(emailIds),
 * });
 * ```
 */
export function useKanbanData({
  limit = DEFAULT_LIMIT,
  onInitComplete,
}: UseKanbanDataOptions = {}): UseKanbanDataReturn {
  // Emails data per column
  const [kanbanEmails, setKanbanEmails] = useState<Record<string, Email[]>>({
    inbox: [],
    todo: [],
    done: [],
    snoozed: [],
  });

  // Pagination offsets per column
  const [kanbanOffsets, setKanbanOffsets] = useState<Record<string, number>>({
    inbox: 0,
    todo: 0,
    done: 0,
    snoozed: 0,
  });

  // Consolidated loading state (replaces 4 separate useState)
  const [loadingColumns, setLoadingColumns] = useState<Record<string, boolean>>({
    inbox: true,
    todo: true,
    done: true,
    snoozed: true,
  });

  // Column configuration
  const [kanbanColumnConfigs, setKanbanColumnConfigs] = useState<KanbanColumnConfig[]>([]);
  
  // Mailboxes for label mapping
  const [mailboxes, setMailboxes] = useState<Mailbox[]>([]);

  // Helper to set loading state for a column
  const setColumnLoading = useCallback((columnId: string, loading: boolean) => {
    setLoadingColumns((prev) => ({ ...prev, [columnId]: loading }));
  }, []);

  // Load single column with cache-first strategy
  const loadColumn = useCallback(async (status: string, offset: number) => {
    try {
      setColumnLoading(status, true);

      // 1. Try cache first for instant display (only for first page)
      if (offset === 0) {
        const cachedEmails = await getKanbanColumnFromCache(status);
        if (cachedEmails && cachedEmails.length > 0) {
          setKanbanEmails((prev) => ({ ...prev, [status]: cachedEmails }));
          setColumnLoading(status, false);
        }
      }

      // 2. Fetch fresh data from API
      const data = await emailService.getEmailsByStatus(status, limit, offset);

      // 3. Update state with fresh data
      setKanbanEmails((prev) => ({ ...prev, [status]: data.emails }));

      // 4. Save to cache (only for first page)
      if (offset === 0) {
        saveKanbanColumnToCache(status, data.emails);
      }
    } finally {
      setColumnLoading(status, false);
    }
  }, [limit, setColumnLoading]);

  // Reload all columns in batches
  const reloadAllColumns = useCallback(async () => {
    const defaultIds = new Set(DEFAULT_COLUMN_IDS);
    const customColumnIds = kanbanColumnConfigs
      .filter((c) => !defaultIds.has(c.column_id as typeof DEFAULT_COLUMN_IDS[number]))
      .map((c) => c.column_id);
    
    const allColumnIds = [...DEFAULT_COLUMN_IDS, ...customColumnIds];

    for (let i = 0; i < allColumnIds.length; i += BATCH_SIZE) {
      const batch = allColumnIds.slice(i, i + BATCH_SIZE);
      await Promise.all(
        batch.map((colId) => loadColumn(colId, kanbanOffsets[colId] ?? 0))
      );
    }
  }, [kanbanColumnConfigs, kanbanOffsets, loadColumn]);

  // Handle page change for a column
  const updatePage = useCallback((col: string, dir: 1 | -1) => {
    setKanbanOffsets((prev) => {
      const current = prev[col] ?? 0;
      const newOffset = Math.max(0, current + dir * limit);
      
      // Load the new page
      loadColumn(col, newOffset).catch((error) => {
        console.error("Error loading Kanban column:", error);
      });
      
      return { ...prev, [col]: newOffset };
    });
  }, [limit, loadColumn]);

  // Optimistic update when moving email
  const moveEmail = useCallback((
    emailId: string,
    targetColumnId: string,
    sourceColumnId?: string
  ) => {
    // Find source if not provided
    let foundSourceColumnId = sourceColumnId;
    if (!foundSourceColumnId) {
      for (const [colId, emails] of Object.entries(kanbanEmails)) {
        if (emails?.find((e) => e.id === emailId)) {
          foundSourceColumnId = colId;
          break;
        }
      }
    }

    // Optimistic update
    setKanbanEmails((prev) => {
      let movedEmail: Email | undefined;
      const newEmails: Record<string, Email[]> = {};

      // Remove email from all columns
      Object.entries(prev).forEach(([col, emails]) => {
        if (!emails) {
          newEmails[col] = [];
          return;
        }
        const filtered = emails.filter((e) => {
          if (e.id === emailId) {
            movedEmail = e;
            return false;
          }
          return true;
        });
        newEmails[col] = filtered;
      });

      // Add to target column
      if (movedEmail) {
        if (!newEmails[targetColumnId]) {
          newEmails[targetColumnId] = [];
        }
        movedEmail.mailbox_id = targetColumnId;
        newEmails[targetColumnId] = [movedEmail, ...newEmails[targetColumnId]];
      }

      return newEmails;
    });

    // Call API (fire and forget, rely on optimistic update)
    emailService.moveEmailToMailbox(emailId, targetColumnId, foundSourceColumnId).catch((error) => {
      console.error("Error moving email:", error);
      // Could implement rollback here if needed
    });
  }, [kanbanEmails]);

  // Initial load effect
  useEffect(() => {
    const initKanban = async () => {
      try {
        // 1. IMMEDIATELY load from IndexedDB cache for instant display
        console.log('[KanbanData] Loading from IndexedDB cache first...');
        const cachedEmailIds: string[] = [];
        
        for (const colId of DEFAULT_COLUMN_IDS) {
          const cachedEmails = await getKanbanColumnFromCache(colId);
          if (cachedEmails && cachedEmails.length > 0) {
            setKanbanEmails((prev) => ({ ...prev, [colId]: cachedEmails }));
            setLoadingColumns((prev) => ({ ...prev, [colId]: false }));
            cachedEmailIds.push(...cachedEmails.map((e: Email) => e.id));
            console.log(`[KanbanData] Loaded ${cachedEmails.length} cached emails for "${colId}"`);
          }
        }
        
        // If we have cached data, trigger onInitComplete early for summaries
        if (cachedEmailIds.length > 0) {
          console.log(`[KanbanData] Triggering early onInitComplete with ${cachedEmailIds.length} cached emails`);
          onInitComplete?.(cachedEmailIds);
        }

        // 2. Fetch column config + mailboxes from API
        const [columns, mbs] = await Promise.all([
          emailService.getKanbanColumns(),
          emailService.getAllMailboxes(),
        ]);
        setKanbanColumnConfigs(columns);
        setMailboxes(mbs);

        // 3. Determine all column IDs (default + custom)
        const defaultIds = new Set(DEFAULT_COLUMN_IDS);
        const allColumnIds = [
          ...DEFAULT_COLUMN_IDS,
          ...columns.filter((c) => !defaultIds.has(c.column_id as typeof DEFAULT_COLUMN_IDS[number])).map((c) => c.column_id),
        ];

        // 4. Fetch fresh data from API (background refresh)
        console.log('[KanbanData] Fetching fresh data from API...');
        const allLoadedEmailIds: string[] = [];

        for (let i = 0; i < allColumnIds.length; i += BATCH_SIZE) {
          const batch = allColumnIds.slice(i, i + BATCH_SIZE);
          const results = await Promise.all(
            batch.map(async (colId) => {
              const data = await emailService.getEmailsByStatus(colId, limit, 0);
              setKanbanEmails((prev) => ({ ...prev, [colId]: data.emails }));
              setLoadingColumns((prev) => ({ ...prev, [colId]: false }));
              // Save to cache for next time
              saveKanbanColumnToCache(colId, data.emails);
              return data.emails.map((e) => e.id);
            })
          );
          results.forEach((ids) => allLoadedEmailIds.push(...ids));
        }

        // 5. Callback with all freshly loaded email IDs (for summary queueing if not done earlier)
        if (cachedEmailIds.length === 0) {
          onInitComplete?.(allLoadedEmailIds);
        }
        
        console.log(`[KanbanData] Init complete, loaded ${allLoadedEmailIds.length} emails from API`);
      } catch (error) {
        console.error("Error initializing Kanban:", error);
      }
    };

    initKanban();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Compute isAnyLoading
  const isAnyLoading = Object.values(loadingColumns).some((v) => v);

  return {
    kanbanEmails,
    kanbanOffsets,
    kanbanColumnConfigs,
    mailboxes,
    loadingColumns,
    isAnyLoading,
    loadColumn,
    reloadAllColumns,
    moveEmail,
    updatePage,
    setKanbanEmails,
    setKanbanColumnConfigs,
    limit,
  };
}

export default useKanbanData;
