import { useState, useCallback, useMemo, useEffect, useRef } from "react";
import { useQuery, useQueries, useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import type { Email, KanbanColumnConfig, Mailbox, EmailsResponse } from "@/types/email";
import { emailService } from "@/services/email.service";

const DEFAULT_LIMIT = 20;
const DEFAULT_COLUMN_IDS = ["inbox", "todo", "done", "snoozed"] as const;

// Query keys for React Query
const QUERY_KEYS = {
  kanbanColumns: ["kanban", "columns"] as const,
  mailboxes: ["mailboxes"] as const,
  kanbanEmails: (columnId: string, limit: number, offset: number, isKanban: boolean) =>
    ["kanban", "emails", columnId, limit, offset, isKanban] as const,
};

export interface UseKanbanDataOptions {
  /** Initial page size for each column */
  limit?: number;
  /** Callback when all columns finish loading */
  onInitComplete?: (emailIds: string[]) => void;
  /** When true, request Kanban-deduped data from backend */
  isKanban?: boolean;
}

export interface UseKanbanDataReturn {
  // Data
  kanbanEmails: Record<string, Email[]>;
  kanbanTotals: Record<string, number>;
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
 * Custom hook for Kanban board data management using React Query
 * 
 * Features:
 * - Automatic caching with React Query
 * - Optimistic updates for drag-drop
 * - Cache invalidation after mutations
 * - Pagination per column
 * 
 * @example
 * ```tsx
 * const { kanbanEmails, loadingColumns, moveEmail } = useKanbanData({
 *   isKanban: true,
 *   onInitComplete: (emailIds) => queueSummaries(emailIds),
 * });
 * ```
 */
export function useKanbanData({
  limit = DEFAULT_LIMIT,
  onInitComplete,
  isKanban = false,
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
    queryKey: QUERY_KEYS.kanbanColumns,
    queryFn: async () => {
      const columns = await emailService.getKanbanColumns();
      return columns;
    },
    staleTime: 1000 * 60 * 5, // 5 mins
  });

  // 2. Fetch Mailboxes
  const { data: mailboxes = [] } = useQuery({
    queryKey: QUERY_KEYS.mailboxes,
    queryFn: async () => {
      const mbs = await emailService.getAllMailboxes();
      return mbs;
    },
    staleTime: 1000 * 60 * 60, // 1 hour
  });

  // 3. Determine all active columns to query
  const allColumnIds = useMemo(() => {
    const defaultIds = new Set(DEFAULT_COLUMN_IDS);
    const customIds = kanbanColumnConfigs
      .filter((c) => !defaultIds.has(c.column_id as typeof DEFAULT_COLUMN_IDS[number]))
      .map((c) => c.column_id);
    return [...DEFAULT_COLUMN_IDS, ...customIds];
  }, [kanbanColumnConfigs]);

  // 4. Fetch Emails for all columns using useQueries
  const emailQueries = useQueries({
    queries: allColumnIds.map((colId) => ({
      queryKey: QUERY_KEYS.kanbanEmails(colId, limit, kanbanOffsets[colId] || 0, isKanban),
      queryFn: () => emailService.getEmailsByStatus(colId, limit, kanbanOffsets[colId] || 0, isKanban),
      staleTime: 1000 * 30, // 30 seconds fresh
      enabled: kanbanColumnConfigs.length > 0, // Wait for columns to load
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
      // Note: query.data is EmailsResponse { emails: Email[], total: number, limit, offset }
      emails[colId] = query.data?.emails || [];
      totals[colId] = query.data?.total || 0;
      loading[colId] = query.isLoading || query.isFetching;
      if (query.isLoading || query.isFetching) anyLoading = true;
    });

    return { 
      kanbanEmails: emails, 
      kanbanTotals: totals, 
      loadingColumns: loading, 
      isAnyLoading: anyLoading 
    };
  }, [allColumnIds, emailQueries]);

  // 6. Trigger onInitComplete when data is fully loaded for the first time
  const hasInitializedRef = useRef(false);

  useEffect(() => {
    if (!isAnyLoading && !hasInitializedRef.current && kanbanColumnConfigs.length > 0) {
      // Collect all IDs
      const allIds = Object.values(kanbanEmails).flat().map(e => e.id);
      if (allIds.length > 0) {
        onInitComplete?.(allIds);
        hasInitializedRef.current = true;
      }
    }
  }, [isAnyLoading, kanbanEmails, kanbanColumnConfigs.length, onInitComplete]);

  // 7. Move Email Mutation with Optimistic Update
  const moveEmailMutation = useMutation({
    mutationFn: async ({ 
      emailId, 
      targetColumnId, 
      sourceColumnId 
    }: { 
      emailId: string; 
      targetColumnId: string; 
      sourceColumnId?: string;
    }) => {
      return emailService.moveEmailToMailbox(emailId, targetColumnId, sourceColumnId);
    },
    onMutate: async ({ emailId, targetColumnId, sourceColumnId }) => {
      // Cancel outgoing refetches to avoid overwriting optimistic update
      await queryClient.cancelQueries({ queryKey: ["kanban", "emails"] });

      // Snapshot previous values for rollback
      const previousQueries: Record<string, EmailsResponse | undefined> = {};
      allColumnIds.forEach((colId) => {
        const queryKey = QUERY_KEYS.kanbanEmails(colId, limit, kanbanOffsets[colId] || 0, isKanban);
        previousQueries[colId] = queryClient.getQueryData<EmailsResponse>(queryKey);
      });

      // Find source column if not provided
      let foundSourceColumnId = sourceColumnId;
      if (!foundSourceColumnId) {
        for (const [colId, emails] of Object.entries(kanbanEmails)) {
          if (emails?.find((e) => e.id === emailId)) {
            foundSourceColumnId = colId;
            break;
          }
        }
      }

      // Find moved email from source column first
      let movedEmail: Email | undefined;
      if (foundSourceColumnId) {
        const sourceQueryKey = QUERY_KEYS.kanbanEmails(foundSourceColumnId, limit, kanbanOffsets[foundSourceColumnId] || 0, isKanban);
        const sourceData = queryClient.getQueryData<EmailsResponse>(sourceQueryKey);
        if (sourceData) {
          movedEmail = sourceData.emails.find((e) => e.id === emailId);
        }
      }

      // Optimistically update source column (remove email)
      if (foundSourceColumnId && movedEmail) {
        const sourceQueryKey = QUERY_KEYS.kanbanEmails(foundSourceColumnId, limit, kanbanOffsets[foundSourceColumnId] || 0, isKanban);
        const sourceData = queryClient.getQueryData<EmailsResponse>(sourceQueryKey);
        if (sourceData) {
          queryClient.setQueryData(sourceQueryKey, {
            ...sourceData,
            emails: sourceData.emails.filter((e) => e.id !== emailId),
            total: Math.max(0, sourceData.total - 1),
          });
        }
      }

      // Optimistically update target column (add email)
      if (targetColumnId && movedEmail) {
        const targetQueryKey = QUERY_KEYS.kanbanEmails(targetColumnId, limit, kanbanOffsets[targetColumnId] || 0, isKanban);
        const targetData = queryClient.getQueryData<EmailsResponse>(targetQueryKey);
        if (targetData) {
          const updatedEmail = { ...movedEmail, mailbox_id: targetColumnId };
          queryClient.setQueryData(targetQueryKey, {
            ...targetData,
            emails: [updatedEmail, ...targetData.emails],
            total: targetData.total + 1,
          });
        }
      }

      return { previousQueries, foundSourceColumnId };
    },
    onError: (err, _variables, context) => {
      // Rollback on error
      if (context?.previousQueries) {
        Object.entries(context.previousQueries).forEach(([colId, previousData]) => {
          if (previousData) {
            const queryKey = QUERY_KEYS.kanbanEmails(colId, limit, kanbanOffsets[colId] || 0, isKanban);
            queryClient.setQueryData(queryKey, previousData);
          }
        });
      }
      console.error("Error moving email:", err);
      toast.error("Gặp lỗi khi di chuyển email");
    },
    onSuccess: (_data, variables) => {
      // Invalidate all kanban email queries to refetch fresh data
      queryClient.invalidateQueries({ 
        queryKey: ["kanban", "emails"],
        refetchType: "active", // Only refetch active queries
      });
      
      // Show success toast with target column name
      const targetColumn = kanbanColumnConfigs.find(c => c.column_id === variables.targetColumnId);
      const columnName = targetColumn?.name || variables.targetColumnId;
      toast.success(`Đã di chuyển email đến "${columnName}"`);
    },
  });

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
    const queryKey = QUERY_KEYS.kanbanEmails(status, limit, offset, isKanban);
    await queryClient.invalidateQueries({ queryKey });
  }, [queryClient, limit, isKanban]);

  const reloadAllColumns = useCallback(async () => {
    await queryClient.invalidateQueries({ queryKey: ["kanban", "emails"] });
    await queryClient.invalidateQueries({ queryKey: QUERY_KEYS.kanbanColumns });
  }, [queryClient]);

  const moveEmail = useCallback((
    emailId: string,
    targetColumnId: string,
    sourceColumnId?: string
  ) => {
    moveEmailMutation.mutate({ emailId, targetColumnId, sourceColumnId });
  }, [moveEmailMutation]);

  // Compatibility shims (for components that might still use these)
  const setKanbanEmails: React.Dispatch<React.SetStateAction<Record<string, Email[]>>> = useCallback(() => {
    console.warn("setKanbanEmails shim called - use React Query mutations instead");
  }, []);

  const setKanbanColumnConfigs: React.Dispatch<React.SetStateAction<KanbanColumnConfig[]>> = useCallback(() => {
    console.warn("setKanbanColumnConfigs shim called - use React Query mutations instead");
  }, []);

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
