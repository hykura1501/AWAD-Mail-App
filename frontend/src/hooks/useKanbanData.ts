import { useState, useCallback, useMemo, useEffect } from "react";
import { toast } from "sonner";
import type { Email, KanbanColumnConfig, Mailbox } from "@/types/email";
import { emailService } from "@/services/email.service";
import { useQuery, useQueries, useQueryClient } from "@tanstack/react-query";

const DEFAULT_LIMIT = 20;
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
  kanbanTotals: Record<string, number>;
  kanbanOffsets: Record<string, number>;
  kanbanColumnConfigs: KanbanColumnConfig[];
  mailboxes: Mailbox[];

  // Loading states
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
 * Custom hook for Kanban board data management using React Query
 */
export function useKanbanData({
  limit = DEFAULT_LIMIT,
  onInitComplete,
}: UseKanbanDataOptions = {}): UseKanbanDataReturn {
  const queryClient = useQueryClient();

  // Pagination offsets per column
  const [kanbanOffsets, setKanbanOffsets] = useState<Record<string, number>>({
    inbox: 0,
    todo: 0,
    done: 0,
    snoozed: 0,
  });

  // 1. Fetch Column Configs
  const { data: kanbanColumnConfigs = [] } = useQuery({
    queryKey: ['kanbanColumns'],
    queryFn: () => emailService.getKanbanColumns(),
    staleTime: 1000 * 60 * 5, // 5 mins
  });

  // 2. Fetch Mailboxes
  const { data: mailboxes = [] } = useQuery({
    queryKey: ['mailboxes'],
    queryFn: () => emailService.getAllMailboxes(),
    staleTime: 1000 * 60 * 60, // 1 hour
  });

  // 3. Determine all active columns to query
  const allColumnIds = useMemo(() => {
    const defaultIds = new Set(DEFAULT_COLUMN_IDS);
    const customIds = kanbanColumnConfigs
      .filter((c) => !defaultIds.has(c.column_id as any))
      .map((c) => c.column_id);
    return [...DEFAULT_COLUMN_IDS, ...customIds];
  }, [kanbanColumnConfigs]);

  // 4. Fetch Emails for all columns using useQueries
  const emailQueries = useQueries({
    queries: allColumnIds.map((colId) => ({
      queryKey: ['emails', colId, limit, kanbanOffsets[colId] || 0],
      queryFn: () => emailService.getEmailsByStatus(colId, limit, kanbanOffsets[colId] || 0),
      // Keep data fresh for a bit, but revalidate in background
      staleTime: 1000 * 30, // 30 seconds fresh
    })),
  });

  // 5. Derive kanbanEmails and loading states
  const { kanbanEmails, kanbanTotals, loadingColumns, isAnyLoading } = useMemo(() => {
    const emails: Record<string, Email[]> = {};
    const totals: Record<string, number> = {};
    const loading: Record<string, boolean> = {};
    let anyLoading = false;

    allColumnIds.forEach((colId, index) => {
      const query = emailQueries[index];
      // Note: query.data is { emails: Email[], total: number }
      emails[colId] = query.data?.emails || [];
      totals[colId] = query.data?.total || 0;
      loading[colId] = query.isLoading;
      if (query.isLoading) anyLoading = true;
    });

    return { kanbanEmails: emails, kanbanTotals: totals, loadingColumns: loading, isAnyLoading: anyLoading };
  }, [allColumnIds, emailQueries]);

  // 6. Trigger onInitComplete when data is fully loaded for the first time
  const [hasInitialized, setHasInitialized] = useState(false);

  useEffect(() => {
    if (!isAnyLoading && !hasInitialized) {
      // Collect all IDs
      const allIds = Object.values(kanbanEmails).flat().map(e => e.id);
      if (allIds.length > 0) {
        onInitComplete?.(allIds);
        setHasInitialized(true);
      }
    }
  }, [isAnyLoading, hasInitialized, kanbanEmails, onInitComplete]);

  // Actions

  const updatePage = useCallback((col: string, dir: 1 | -1) => {
    setKanbanOffsets((prev) => {
      const current = prev[col] ?? 0;
      const newOffset = Math.max(0, current + dir * limit);
      return { ...prev, [col]: newOffset };
    });
  }, [limit]);

  // loadColumn just invalidates the query for that column/offset
  const loadColumn = useCallback(async (status: string, offset: number) => {
    await queryClient.invalidateQueries({
      queryKey: ['emails', status, limit, offset]
    });
  }, [queryClient, limit]);

  const reloadAllColumns = useCallback(async () => {
    await queryClient.invalidateQueries({ queryKey: ['emails'] });
    await queryClient.invalidateQueries({ queryKey: ['kanbanColumns'] });
  }, [queryClient]);

  const moveEmail = useCallback((
    emailId: string,
    targetColumnId: string,
    sourceColumnId?: string
  ) => {
    // Identify source column if not provided (scan current derived emails)
    let foundSourceColumnId = sourceColumnId;
    if (!foundSourceColumnId) {
      // Scan to find source
      for (const [colId, emails] of Object.entries(kanbanEmails)) {
        if (emails?.find((e) => e.id === emailId)) {
          foundSourceColumnId = colId;
          break;
        }
      }
    }

    emailService.moveEmailToMailbox(emailId, targetColumnId, foundSourceColumnId)
      .then(() => {
        queryClient.invalidateQueries({ queryKey: ['emails'] });
        toast.success("Đã di chuyển email");
      })
      .catch((err) => {
        console.error(err);
        toast.error('Gặp lỗi khi di chuyển mail');
      });

    // Trigger immediate invalidation to start refetching (optimistic-like responsiveness)
    queryClient.invalidateQueries({ queryKey: ['emails'] });

  }, [queryClient, kanbanEmails]); // Added kanbanEmails dependency for finding source if needed

  // Compatibility shims
  const setKanbanEmails: React.Dispatch<React.SetStateAction<Record<string, Email[]>>> = () => {
    console.warn("setKanbanEmails shim called - no-op in React Query mode");
  };

  const setKanbanColumnConfigs: React.Dispatch<React.SetStateAction<KanbanColumnConfig[]>> = () => {
  };

  return {
    kanbanEmails,
    kanbanTotals,
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
