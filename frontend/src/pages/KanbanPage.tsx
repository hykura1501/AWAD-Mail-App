import { useState, useEffect, useMemo } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { useAppDispatch, useAppSelector } from "@/store/hooks";
import { logout } from "@/store/authSlice";
import { authService } from "@/services/auth.service";
import { emailService } from "@/services/email.service";
import { getAccessToken } from "@/lib/api-client";
import type { Email, KanbanColumnConfig, Mailbox } from "@/types/email";
import MailboxList from "@/components/inbox/MailboxList";
import ComposeEmail from "@/components/inbox/ComposeEmail";
import EmailDetail from "@/components/inbox/EmailDetail";
import { useQueryClient, useMutation } from "@tanstack/react-query";
import { API_BASE_URL } from "@/config/api";
import KanbanBoard from "@/components/kanban/KanbanBoard";
import type { KanbanColumn } from "@/components/kanban/KanbanBoard";
import KanbanToggle from "@/components/kanban/KanbanToggle";
import KanbanFilters, { type SortOption, type FilterState } from "@/components/kanban/KanbanFilters";
import { SnoozeDialog } from "@/components/inbox/SnoozeDialog";
import KanbanSettings from "@/components/kanban/KanbanSettings";
import SnoozedDrawer from "@/components/kanban/SnoozedDrawer";
import { Settings } from "lucide-react";
import { getKanbanColumnFromCache, saveKanbanColumnToCache } from "@/lib/db";

export default function KanbanPage() {
  const navigate = useNavigate();
  const dispatch = useAppDispatch();
  const queryClient = useQueryClient();
  const user = useAppSelector((state) => state.auth.user);

  // Sidebar state
  const { mailbox } = useParams<{ mailbox?: string }>();
  const selectedMailboxId = mailbox || "inbox";
  const [isComposeOpen, setIsComposeOpen] = useState(false);
  const [composeInitialData, setComposeInitialData] = useState({
    to: [] as string[],
    cc: [] as string[],
    subject: "",
    body: "",
  });

  // Theme state
  const [theme, setTheme] = useState<"light" | "dark">(() => {
    if (typeof window !== "undefined") {
      const savedTheme = localStorage.getItem("theme");
      const systemTheme = window.matchMedia("(prefers-color-scheme: dark)")
        .matches
        ? "dark"
        : "light";
      const initialTheme = (savedTheme as "light" | "dark") || systemTheme;

      if (initialTheme === "dark") {
        document.documentElement.classList.add("dark");
      } else {
        document.documentElement.classList.remove("dark");
      }
      return initialTheme;
    }
    return "light";
  });

  const toggleTheme = () => {
    const newTheme = theme === "light" ? "dark" : "light";
    setTheme(newTheme);
    localStorage.setItem("theme", newTheme);
    if (newTheme === "dark") {
      document.documentElement.classList.add("dark");
    } else {
      document.documentElement.classList.remove("dark");
    }
  };

  const logoutMutation = useMutation({
    mutationFn: authService.logout,
    onSuccess: () => {
      dispatch(logout());
      queryClient.clear();
      navigate("/login");
    },
  });

  const handleLogout = () => {
    logoutMutation.mutate();
  };

  const handleSelectMailbox = (id: string) => {
    navigate(`/${id}`);
  };

  // Settings modal state
  const [isSettingsOpen, setIsSettingsOpen] = useState(false);

  // Snoozed drawer state
  const [isSnoozedDrawerOpen, setIsSnoozedDrawerOpen] = useState(false);

  // Kanban columns configuration (loaded eagerly, no caching)
  const [kanbanColumnConfigs, setKanbanColumnConfigs] = useState<
    KanbanColumnConfig[]
  >([]);

  // Mailboxes for label mapping in settings (loaded eagerly, no caching)
  const [mailboxes, setMailboxes] = useState<Mailbox[]>([]);

  // State cho popup chi tiết email
  const [detailEmailId, setDetailEmailId] = useState<string | null>(null);
  const [mobileView, setMobileView] = useState<"mailbox" | "kanban">("kanban");
  const [mobileSelectedColumn, setMobileSelectedColumn] =
    useState<string>("inbox");

  // Snooze dialog state
  const [snoozeDialogOpen, setSnoozeDialogOpen] = useState(false);
  const [emailToSnooze, setEmailToSnooze] = useState<{
    id: string;
    subject: string;
  } | null>(null);

  // Summary state (no React Query caching)
  const [summary, setSummary] = useState<string>("");
  const [isSummaryLoading, setIsSummaryLoading] = useState<boolean>(false);

  // State phân trang cho từng cột Kanban (hỗ trợ cả custom columns)
  const [kanbanOffsets, setKanbanOffsets] = useState<Record<string, number>>({
    inbox: 0,
    todo: 0,
    done: 0,
    snoozed: 0,
  });
  const limit = 20;

  // Loading state for each Kanban column (start with true to show skeleton)
  const [isLoadingInbox, setIsLoadingInbox] = useState(true);
  const [isLoadingTodo, setIsLoadingTodo] = useState(true);
  const [isLoadingDone, setIsLoadingDone] = useState(true);
  const [isLoadingSnoozed, setIsLoadingSnoozed] = useState(true);

  // State emails cho từng cột (optimistic update)
  // Use Record to allow dynamic column IDs (including custom columns)
  const [kanbanEmails, setKanbanEmails] = useState<Record<string, Email[]>>({
    inbox: [],
    todo: [],
    done: [],
    snoozed: [],
  });

  // Sorting and filtering state
  const [sortBy, setSortBy] = useState<SortOption>("newest");
  const [filters, setFilters] = useState<FilterState>({
    unreadOnly: false,
    withAttachments: false,
  });

  // Helper function to sort emails
  const sortEmails = (emails: Email[], sort: SortOption): Email[] => {
    return [...emails].sort((a, b) => {
      const dateA = new Date(a.received_at).getTime();
      const dateB = new Date(b.received_at).getTime();
      return sort === "newest" ? dateB - dateA : dateA - dateB;
    });
  };

  // Helper function to filter emails
  const filterEmails = (emails: Email[], filterState: FilterState): Email[] => {
    if (!emails) return [];
    return emails.filter((email) => {
      if (filterState.unreadOnly && email.is_read) return false;
      if (filterState.withAttachments && (!email.attachments || email.attachments.length === 0)) return false;
      return true;
    });
  };

  // Helper function to clean preview text (strip HTML/CSS code)
  const cleanPreviewText = (text: string | undefined): string => {
    if (!text) return "Không có nội dung xem trước";
    let cleaned = text;
    
    // Remove HTML tags
    cleaned = cleaned.replace(/<[^>]*>/g, " ");
    
    // Remove CSS blocks: *{...}, .class{...}, #id{...}, element{...}, [attr]{...}
    cleaned = cleaned.replace(/[\*\.\#]?[a-zA-Z0-9_\-\[\]='"]+\s*\{[^}]*\}/g, " ");
    
    // Remove remaining CSS property patterns: property: value; or property: value !important
    cleaned = cleaned.replace(/[a-zA-Z\-]+\s*:\s*[^;{}]+(!important)?;?/gi, " ");
    
    // Remove attribute selectors like [x-apple-data-detectors]
    cleaned = cleaned.replace(/\[[^\]]+\]/g, " ");
    
    // Remove CSS at-rules like @media, @font-face
    cleaned = cleaned.replace(/@[a-zA-Z\-]+[^{]*\{[^}]*\}/g, " ");
    
    // Remove numbers followed by special chars that look like CSS (e.g., "96 *")
    cleaned = cleaned.replace(/\d+\s*[\*\.\#]/g, " ");
    
    // Remove common CSS keywords
    cleaned = cleaned.replace(/\b(important|inherit|none|auto|px|em|rem|%|rgb|rgba|hsl|hsla)\b/gi, " ");
    
    // Remove extra whitespace
    cleaned = cleaned.replace(/\s+/g, " ").trim();
    
    return cleaned.length > 5 ? cleaned : "Không có nội dung xem trước";
  };

  // Eager loading helpers with IndexedDB cache-first strategy
  const loadKanbanColumn = async (status: string, offset: number) => {
    const setLoading = (loading: boolean) => {
      if (status === "inbox") setIsLoadingInbox(loading);
      if (status === "todo") setIsLoadingTodo(loading);
      if (status === "done") setIsLoadingDone(loading);
      if (status === "snoozed") setIsLoadingSnoozed(loading);
    };

    try {
      setLoading(true);
      
      // 1. Try to load from cache first (instant display)
      const cachedEmails = await getKanbanColumnFromCache(status);
      if (cachedEmails && cachedEmails.length > 0 && offset === 0) {
        setKanbanEmails((prev) => ({
          ...prev,
          [status]: cachedEmails,
        }));
        // Turn off loading immediately after showing cached data
        setLoading(false);
      }

      // 2. Fetch fresh data from API
      const data = await emailService.getEmailsByStatus(status, limit, offset);
      
      // 3. Update state with fresh data
      setKanbanEmails((prev) => ({
        ...prev,
        [status]: data.emails,
      }));
      
      // 4. Save to cache for next time (only for first page)
      if (offset === 0) {
        saveKanbanColumnToCache(status, data.emails);
      }
    } finally {
      setLoading(false);
    }
  };

  // OPTIMIZED: Reload columns in batches of 2 to avoid overwhelming the backend
  const reloadAllKanbanColumns = async () => {
    const defaultIds = new Set(["inbox", "todo", "done", "snoozed"]);
    const allColumnIds = [
      "inbox", "todo", "done", "snoozed",
      ...kanbanColumnConfigs.filter((c) => !defaultIds.has(c.column_id)).map((c) => c.column_id)
    ];

    // Load in batches of 2
    const batchSize = 2;
    for (let i = 0; i < allColumnIds.length; i += batchSize) {
      const batch = allColumnIds.slice(i, i + batchSize);
      await Promise.all(
        batch.map((colId) =>
          loadKanbanColumn(colId, kanbanOffsets[colId] ?? 0)
        )
      );
    }
  };

  // Initial load: fetch columns + mailboxes, rồi fetch emails cho tất cả cột (default + custom)
  // OPTIMIZED: Load columns in batches to avoid overwhelming the backend
  useEffect(() => {
    const initKanban = async () => {
      try {
        // 1. Fetch cấu hình cột + mailboxes
        const [columns, mbs] = await Promise.all([
          emailService.getKanbanColumns(),
          emailService.getAllMailboxes(),
        ]);
        setKanbanColumnConfigs(columns);
        setMailboxes(mbs);

        // 2. Xác định danh sách cột cần fetch (default + custom)
        const defaultIds = new Set(["inbox", "todo", "done", "snoozed"]);
        const allColumnIds = [
          "inbox", "todo", "done", "snoozed",
          ...columns.filter((c) => !defaultIds.has(c.column_id)).map((c) => c.column_id)
        ];

        // 3. Load columns in batches of 2 and collect all email IDs
        const batchSize = 2;
        const allLoadedEmailIds: string[] = [];
        
        for (let i = 0; i < allColumnIds.length; i += batchSize) {
          const batch = allColumnIds.slice(i, i + batchSize);
          const results = await Promise.all(
            batch.map(async (colId) => {
              const data = await emailService.getEmailsByStatus(colId, limit, kanbanOffsets[colId] ?? 0);
              setKanbanEmails((prev) => ({
                ...prev,
                [colId]: data.emails,
              }));
              return data.emails.map((e) => e.id);
            })
          );
          // Flatten and collect all email IDs
          results.forEach((ids) => allLoadedEmailIds.push(...ids));
        }
        
        // 4. Queue AI summaries for all loaded emails (background processing)
        if (allLoadedEmailIds.length > 0) {
          try {
            const { summaries } = await emailService.queueSummaries(allLoadedEmailIds);
            // Apply cached summaries immediately
            if (Object.keys(summaries).length > 0) {
              setSummaryStates((prev) => {
                const next = { ...prev };
                for (const [emailId, summary] of Object.entries(summaries)) {
                  next[emailId] = { summary, loading: false };
                }
                return next;
              });
            }
          } catch (error) {
            console.error("Error queueing summaries:", error);
          }
        }
        
      } catch (error) {
        console.error("Error initializing Kanban:", error);
      }
    };

    initKanban();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Load summary whenever detailEmailId changes
  useEffect(() => {
    if (!detailEmailId) {
      setSummary("");
      return;
    }

    let cancelled = false;
    const loadSummary = async () => {
      try {
        setIsSummaryLoading(true);
        const s = await emailService.getEmailSummary(detailEmailId);
        if (!cancelled) {
          setSummary(s);
        }
      } catch (error) {
        console.error("Error fetching summary:", error);
        if (!cancelled) {
          setSummary("Không thể tạo tóm tắt cho email này.");
        }
      } finally {
        if (!cancelled) {
          setIsSummaryLoading(false);
        }
      }
    };

    loadSummary();

    return () => {
      cancelled = true;
    };
  }, [detailEmailId]);

  // Track which emails have requested summaries
  const [requestedSummaries, setRequestedSummaries] = useState<Set<string>>(
    new Set()
  );

  // Track summary states
  const [summaryStates, setSummaryStates] = useState<
    Record<string, { summary: string; loading: boolean }>
  >({});

  // Handle summary request
  const handleRequestSummary = async (emailId: string) => {
    if (requestedSummaries.has(emailId)) return;

    setRequestedSummaries((prev) => new Set(prev).add(emailId));
    setSummaryStates((prev) => ({
      ...prev,
      [emailId]: { summary: "", loading: true },
    }));

    try {
      const summary = await emailService.getEmailSummary(emailId);
      setSummaryStates((prev) => ({
        ...prev,
        [emailId]: { summary, loading: false },
      }));
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
  };

  // Hàm chuyển trang cho từng cột (hỗ trợ cả custom columns)
  const handleKanbanPage = (col: string, dir: 1 | -1) => {
    setKanbanOffsets((prev) => {
      const currentOffset = prev[col] ?? 0;
      const newOffset = Math.max(0, currentOffset + dir * limit);
      const next = {
        ...prev,
        [col]: newOffset,
      };
      // Eager load dữ liệu mới cho cột đó
      loadKanbanColumn(col, newOffset).catch((error) => {
        console.error("Error loading Kanban column:", error);
      });
      return next;
    });
  };

  // Optimistic update khi kéo thả
  const handleKanbanDrop = (emailId: string, targetColumnId: string) => {
    // Find the email and its source column
    let movedEmail: Email | undefined;
    let sourceColumnId: string | undefined;
    for (const [colId, emails] of Object.entries(kanbanEmails)) {
      if (!emails) continue; // Skip null/undefined arrays
      const found = emails.find((e) => e.id === emailId);
      if (found) {
        movedEmail = found;
        sourceColumnId = colId;
        break;
      }
    }

    // If moving to snoozed, show dialog
    if (targetColumnId === "snoozed" && movedEmail) {
      setEmailToSnooze({
        id: emailId,
        subject: movedEmail.subject,
      });
      setSnoozeDialogOpen(true);
      return;
    }

    // Otherwise, proceed with normal move
    setKanbanEmails((prev) => {
      // Tìm email trong tất cả các cột
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
      
      // Thêm email vào cột mới (initialize as empty array if column doesn't exist)
      if (movedEmail) {
        if (!newEmails[targetColumnId]) {
          newEmails[targetColumnId] = [];
        }
        // cập nhật mailbox_id local cho đồng bộ UI
        movedEmail.mailbox_id = targetColumnId;
        newEmails[targetColumnId] = [movedEmail, ...newEmails[targetColumnId]];
      }
      
      return newEmails;
    });
    // Call API update with source column ID (không reload lại list, tin vào optimistic update)
    emailService.moveEmailToMailbox(emailId, targetColumnId, sourceColumnId).catch((error) => {
      console.error("Error moving email:", error);
      // Trường hợp lỗi, có thể cân nhắc rollback state hoặc chờ SSE đồng bộ
    });
  };

  // Handle snooze confirmation
  const handleSnoozeConfirm = (snoozeUntil: Date) => {
    if (!emailToSnooze) return;

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
          if (e.id === emailToSnooze.id) {
            movedEmail = e;
            return false;
          }
          return true;
        });
        newEmails[col] = filtered;
      });
      
      // Thêm email vào cột snoozed (ensure it exists)
      if (movedEmail) {
        if (!newEmails["snoozed"]) {
          newEmails["snoozed"] = [];
        }
        newEmails["snoozed"] = [movedEmail, ...newEmails["snoozed"]];
      }
      return newEmails;
    });

    // Call API
    emailService.snoozeEmail(emailToSnooze.id, snoozeUntil).catch((error) => {
      console.error("Error snoozing email:", error);
    });

    // Reset state
    setSnoozeDialogOpen(false);
    setEmailToSnooze(null);
  };

  // Check if any column is loading
  const isAnyLoading =
    isLoadingInbox || isLoadingTodo || isLoadingDone || isLoadingSnoozed;

  // Apply sorting and filtering to columns using useMemo for performance
  const kanbanColumns: KanbanColumn[] = useMemo(() => {
    const processEmails = (emails: Email[] | null | undefined) => {
      // Ensure emails is always an array
      const emailsArray = emails || [];
      let result = filterEmails(emailsArray, filters);
      result = sortEmails(result, sortBy);
      return result;
    };

    // Default columns that always exist
    const defaultColumns: KanbanColumn[] = [
      {
        id: "inbox",
        title: "Inbox",
        emails: processEmails(kanbanEmails.inbox),
        offset: kanbanOffsets.inbox,
        limit,
      },
      {
        id: "todo",
        title: "To Do",
        emails: processEmails(kanbanEmails.todo),
        offset: kanbanOffsets.todo,
        limit,
      },
      {
        id: "done",
        title: "Done",
        emails: processEmails(kanbanEmails.done),
        offset: kanbanOffsets.done,
        limit,
      },
      // Snoozed column is now shown in a drawer, not as a column
    ];

    // Get default column IDs to exclude from custom columns (to avoid duplicates)
    // Also exclude 'snoozed' since it's now displayed in a drawer
    const defaultColumnIds = new Set([...defaultColumns.map((col) => col.id), 'snoozed']);

    // Add custom columns from configuration (excluding default columns and snoozed)
    const customColumns = kanbanColumnConfigs
      .filter((config) => !defaultColumnIds.has(config.column_id))
      .sort((a, b) => a.order - b.order)
      .map((config) => {
        const columnId = config.column_id;
        const emailsKey = columnId as keyof typeof kanbanEmails;
        const offsetKey = columnId as keyof typeof kanbanOffsets;
        const emails = kanbanEmails[emailsKey] || [];
        const offset = kanbanOffsets[offsetKey] || 0;

        return {
          id: config.column_id,
          title: config.name,
          emails: processEmails(emails),
          offset,
          limit,
        };
      });

    // Return default columns first, then custom columns
    return [...defaultColumns, ...customColumns];
  }, [kanbanEmails, kanbanOffsets, filters, sortBy, limit, kanbanColumnConfigs]);

  useEffect(() => {
    if (user) {
      // Start watching for email updates
      emailService.watchMailbox().catch(console.error);

      // Connect to SSE
      const token = getAccessToken();
      const eventSource = new EventSource(
        `${API_BASE_URL}/events?token=${token}`,
        {
          withCredentials: true,
        }
      );

      let lastMutationTime = 0;

      eventSource.onmessage = (event) => {
        try {
          const data = JSON.parse(event.data);
          
          // Handle real-time summary updates from AI worker
          if (data.type === "summary_update") {
            const { email_id, summary } = data.payload || {};
            if (email_id && summary) {
              setSummaryStates((prev) => ({
                ...prev,
                [email_id]: { summary, loading: false },
              }));
            }
            return;
          }
          
          if (data.type === "email_update") {
            // Ignore SSE updates for 3 seconds after user actions to prevent conflicts
            const timeSinceLastMutation = Date.now() - lastMutationTime;
            if (timeSinceLastMutation < 3000) {
              return;
            }

            // Không dùng useQuery ở trang này, nên eager reload trực tiếp
            reloadAllKanbanColumns().catch((error) => {
              console.error("Error reloading Kanban via SSE:", error);
            });
            emailService
              .getAllMailboxes()
              .then((mbs) => setMailboxes(mbs))
              .catch((error) => {
                console.error("Error reloading mailboxes via SSE:", error);
              });

            // Vẫn invalidate cho các trang khác nếu có dùng React Query
            queryClient.invalidateQueries({
              queryKey: ["emails"],
              refetchType: "none",
            });
            queryClient.invalidateQueries({
              queryKey: ["mailboxes"],
              refetchType: "none",
            });
          }
        } catch (error) {
          console.error("Error parsing SSE message:", error);
        }
      };

      // Track mutation time to debounce SSE updates
      const unsubscribe = queryClient.getMutationCache().subscribe((event) => {
        if (
          event?.type === "updated" &&
          event.mutation.state.status === "pending"
        ) {
          lastMutationTime = Date.now();
        }
      });

      eventSource.onerror = (error) => {
        console.error("SSE error:", error);
        eventSource.close();
      };

      return () => {
        eventSource.close();
        unsubscribe();
      };
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user, queryClient]);

  return (
    <div className="flex flex-col h-screen bg-gray-50 dark:bg-[#111418] text-gray-900 dark:text-white overflow-hidden font-sans transition-colors duration-200">
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-2 border-b border-gray-200 dark:border-gray-700 bg-white dark:bg-[#1a1f2e] shadow-sm">
        {/* Mobile Menu Button */}
        <button
          onClick={() => setMobileView("mailbox")}
          className="lg:hidden p-2 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-lg"
        >
          <span className="material-symbols-outlined text-gray-700 dark:text-gray-300">
            menu
          </span>
        </button>

        <div className="flex items-center gap-3">
          <div className="w-8 h-8 rounded-lg bg-linear-to-br text-white from-blue-400 to-blue-500 dark:from-blue-600 dark:to-blue-700 flex items-center justify-center shadow-md">
            <span className="material-symbols-outlined text-white text-[20px]">
              mail
            </span>
          </div>
          <span className="text-xl bg-linear-to-r from-gray-900 to-gray-700 dark:from-white dark:to-gray-300 bg-clip-text text-transparent hidden sm:inline">
            Email Client AI - Kanban
          </span>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={() => setIsSettingsOpen(true)}
            className="p-2 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-lg transition-colors"
            title="Kanban Settings"
          >
            <Settings className="h-5 w-5 text-gray-700 dark:text-gray-300" />
          </button>
          <KanbanToggle isKanban={true} onToggle={() => navigate("/inbox")} />
        </div>
      </div>

      {/* Filter Bar */}
      <div className="hidden lg:block">
        <KanbanFilters
          sortBy={sortBy}
          onSortChange={setSortBy}
          filters={filters}
          onFilterChange={setFilters}
          snoozedCount={kanbanEmails.snoozed?.length || 0}
          onSnoozedClick={() => setIsSnoozedDrawerOpen(true)}
        />
      </div>

      {/* Main Content */}
      <div className="flex-1 overflow-hidden relative">
        {/* Desktop Layout */}
        <div className="hidden lg:flex h-full">
          {/* Kanban Board */}
          <div className="flex-1 min-w-0 w-full">
            <KanbanBoard
              columns={kanbanColumns}
              onEmailDrop={handleKanbanDrop}
              onPageChange={(colId, dir) => handleKanbanPage(colId, dir)}
              emailSummaries={summaryStates}
              onRequestSummary={handleRequestSummary}
              isLoading={isAnyLoading}
              // Use the columnId passed from KanbanBoard so the card actions
              // reflect the column the card is currently rendered in (not the
              // email.mailbox_id which may be stale). Also update mailbox_id
              // optimistically when moving between columns.
              renderCardActions={(email, columnId) =>
                (columnId || email.mailbox_id) !== "snoozed" ? (
                  <>
                    <button
                      className="px-2 py-1 rounded bg-yellow-400 text-xs text-black hover:bg-yellow-500"
                      onClick={(e) => {
                        e.stopPropagation();
                        setEmailToSnooze({
                          id: email.id,
                          subject: email.subject,
                        });
                        setSnoozeDialogOpen(true);
                      }}
                    >
                      Snooze
                    </button>
                  </>
                ) : (
                  <button
                    className="px-2 py-1 rounded bg-green-400 text-xs text-black hover:bg-green-500"
                    onClick={async (e) => {
                      e.stopPropagation();
                      try {
                        const { targetColumn } = await emailService.unsnoozeEmail(email.id);
                        setKanbanEmails((prev) => {
                          let movedEmail: Email | undefined;
                          const newEmails = Object.fromEntries(
                            Object.entries(prev).map(([col, emails]) => {
                              const emailsArray = emails || [];
                              const filtered = emailsArray.filter((ee) => {
                                if (ee.id === email.id) {
                                  movedEmail = ee;
                                  return false;
                                }
                                return true;
                              });
                              return [col, filtered];
                            })
                          ) as typeof prev;
                          if (movedEmail) {
                            movedEmail.mailbox_id = targetColumn;
                            if (!newEmails[targetColumn]) {
                              newEmails[targetColumn] = [];
                            }
                            newEmails[targetColumn] = [movedEmail, ...newEmails[targetColumn]];
                          }
                          return newEmails;
                        });
                        
                        // Refresh target column and snoozed column from server
                        loadKanbanColumn(targetColumn, kanbanOffsets[targetColumn] ?? 0);
                        loadKanbanColumn("snoozed", kanbanOffsets.snoozed);
                      } catch (error) {
                        console.error("Error unsnoozing email:", error);
                      }
                    }}
                  >
                    Unsnooze
                  </button>
                )
              }
               onEmailClick={(emailId) => setDetailEmailId(emailId)}
             />
          </div>
        </div>

        {/* Mobile Layout */}
        <div className="lg:hidden h-full">
          {/* Mailbox Drawer */}
          <div
            className={`absolute inset-y-0 left-0 w-[280px] bg-gray-50 dark:bg-[#111418] border-r border-gray-200 dark:border-gray-800 transform transition-transform duration-300 z-30 ${
              mobileView === "mailbox" ? "translate-x-0" : "-translate-x-full"
            }`}
          >
            <div className="flex items-center justify-between p-4 border-b border-gray-200 dark:border-gray-700">
              <h2 className="text-lg font-semibold text-gray-900 dark:text-white">
                Menu
              </h2>
              <button
                onClick={() => setMobileView("kanban")}
                className="p-2 hover:bg-gray-200 dark:hover:bg-gray-700 rounded-lg"
              >
                <span className="material-symbols-outlined text-gray-700 dark:text-gray-300">
                  close
                </span>
              </button>
            </div>
            <MailboxList
              selectedMailboxId={selectedMailboxId}
              onSelectMailbox={(id) => {
                handleSelectMailbox(id);
                setMobileView("kanban");
              }}
              onComposeClick={() => {
                setIsComposeOpen(true);
                setMobileView("kanban");
              }}
              onLogout={handleLogout}
              theme={theme}
              onToggleTheme={toggleTheme}
            />
          </div>

          {/* Mobile Kanban - Column Selector */}
          <div className="h-full flex flex-col">
            {/* Column Tabs */}
            <div className="flex gap-1 p-2 bg-white dark:bg-[#1a1f2e] border-b border-gray-200 dark:border-gray-700 overflow-x-auto">
              {kanbanColumns.map((col) => (
                <button
                  key={col.id}
                  onClick={() => setMobileSelectedColumn(col.id)}
                  className={`px-4 py-2 rounded-lg text-sm font-medium whitespace-nowrap transition-all ${
                    mobileSelectedColumn === col.id
                      ? "bg-blue-600 text-white shadow-md"
                      : "bg-gray-100 dark:bg-gray-800 text-gray-700 dark:text-gray-300 hover:bg-gray-200 dark:hover:bg-gray-700"
                  }`}
                >
                  {col.title}
                  {col.emails.length > 0 && (
                    <span className="ml-2 px-1.5 py-0.5 rounded-full text-xs bg-white/20">
                      {col.emails.length}
                    </span>
                  )}
                </button>
              ))}
            </div>

            {/* Selected Column Content */}
            <div className="flex-1 overflow-auto p-4">
              {(() => {
                const selectedCol = kanbanColumns.find(
                  (c) => c.id === mobileSelectedColumn
                );
                if (!selectedCol) return null;

                return (
                  <div className="space-y-3">
                    {selectedCol.emails.length === 0 ? (
                      <div className="text-center py-12 text-gray-400">
                        <span className="material-symbols-outlined text-5xl mb-2">
                          inbox
                        </span>
                        <p className="text-sm">Không có email</p>
                      </div>
                    ) : (
                      selectedCol.emails.map((email) => (
                        <div
                          key={email.id}
                          onClick={() => setDetailEmailId(email.id)}
                          className="bg-white dark:bg-gray-800 rounded-lg p-4 border border-gray-200 dark:border-gray-700 hover:shadow-md transition-shadow cursor-pointer"
                        >
                          <div className="flex justify-between items-start mb-2">
                            <h3 className="font-semibold text-sm text-gray-900 dark:text-white line-clamp-1">
                              {email.subject || "(No Subject)"}
                            </h3>
                            <span className="text-xs text-gray-500 dark:text-gray-400 ml-2 whitespace-nowrap">
                              {new Date(email.received_at).toLocaleDateString()}
                            </span>
                          </div>
                          <p className="text-xs text-gray-600 dark:text-gray-300 mb-2">
                            {(() => {
                              let name = email.from_name || email.from || "";
                              // Extract just the name if in "Name <email>" format
                              const match = name.match(/^"?([^"<]+)"?\s*</);
                              if (match) name = match[1].trim();
                              // Remove surrounding quotes
                              name = name.replace(/^"|"$/g, "");
                              return name || "Unknown Sender";
                            })()}
                          </p>
                          {/* Show AI summary if available, otherwise show preview */}
                          {summaryStates[email.id]?.summary ? (
                            <p className="text-xs text-blue-600 dark:text-blue-400 line-clamp-3 italic">
                              ✨ {summaryStates[email.id].summary}
                            </p>
                          ) : summaryStates[email.id]?.loading ? (
                            <p className="text-xs text-gray-400 dark:text-gray-500 line-clamp-2 animate-pulse">
                              Đang tóm tắt...
                            </p>
                          ) : (
                            <p className="text-xs text-gray-500 dark:text-gray-400 line-clamp-2">
                              {cleanPreviewText(email.preview)}
                            </p>
                          )}

                          {/* Action Buttons */}
                          <div className="mt-3 flex gap-2">
                            {email.mailbox_id !== "snoozed" ? (
                              <button
                                className="px-3 py-1.5 rounded bg-yellow-400 text-xs text-black hover:bg-yellow-500"
                                onClick={(e) => {
                                  e.stopPropagation();
                                  setEmailToSnooze({
                                    id: email.id,
                                    subject: email.subject,
                                  });
                                  setSnoozeDialogOpen(true);
                                }}
                              >
                                <span className="material-symbols-outlined text-xs mr-1">
                                  schedule
                                </span>
                                Snooze
                              </button>
                            ) : (
                              <button
                                className="px-3 py-1.5 rounded bg-green-400 text-xs text-black hover:bg-green-500"
                                onClick={async (e) => {
                                  e.stopPropagation();
                                  try {
                                    const { targetColumn } = await emailService.unsnoozeEmail(email.id);
                                    setKanbanEmails((prev) => {
                                      let movedEmail: Email | undefined;
                                      const newEmails = Object.fromEntries(
                                        Object.entries(prev).map(([col, emails]) => {
                                          const emailsArray = emails || [];
                                          const filtered = emailsArray.filter((ee) => {
                                            if (ee.id === email.id) {
                                              movedEmail = ee;
                                              return false;
                                            }
                                            return true;
                                          });
                                          return [col, filtered];
                                        })
                                      ) as typeof prev;
                                      if (movedEmail) {
                                        movedEmail.mailbox_id = targetColumn;
                                        if (!newEmails[targetColumn]) {
                                          newEmails[targetColumn] = [];
                                        }
                                        newEmails[targetColumn] = [movedEmail, ...newEmails[targetColumn]];
                                      }
                                      return newEmails;
                                    });
                                    setMobileSelectedColumn(targetColumn);
                                    
                                    // Refresh target column and snoozed column from server
                                    loadKanbanColumn(targetColumn, kanbanOffsets[targetColumn] ?? 0);
                                    loadKanbanColumn("snoozed", kanbanOffsets.snoozed);
                                  } catch (error) {
                                    console.error("Error unsnoozing email (mobile):", error);
                                  }
                                }}
                              >
                                <span className="material-symbols-outlined text-xs mr-1">
                                  notifications_active
                                </span>
                                Unsnooze
                              </button>
                            )}

                            {/* Move to column buttons */}
                            {["inbox", "todo", "done"]
                              .filter((c) => c !== mobileSelectedColumn)
                              .map((colId) => (
                                <button
                                  key={colId}
                                  className="px-3 py-1.5 rounded bg-blue-100 dark:bg-blue-900/30 text-xs text-blue-700 dark:text-blue-300 hover:bg-blue-200 dark:hover:bg-blue-900/50"
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    handleKanbanDrop(email.id, colId);
                                    setMobileSelectedColumn(colId);
                                  }}
                                >
                                  Move to {colId}
                                </button>
                              ))}
                          </div>
                        </div>
                      ))
                    )}

                    {/* Pagination */}
                    {selectedCol.emails.length > 0 && (
                      <div className="flex justify-center gap-2 pt-4">
                        <button
                          onClick={() =>
                            handleKanbanPage(
                              mobileSelectedColumn,
                              -1
                            )
                          }
                          disabled={selectedCol.offset === 0}
                          className="px-4 py-2 rounded-lg bg-gray-200 dark:bg-gray-700 text-gray-700 dark:text-gray-300 disabled:opacity-50"
                        >
                          ← Prev
                        </button>
                        <button
                          onClick={() =>
                            handleKanbanPage(
                              mobileSelectedColumn,
                              1
                            )
                          }
                          disabled={selectedCol.emails.length < limit}
                          className="px-4 py-2 rounded-lg bg-gray-200 dark:bg-gray-700 text-gray-700 dark:text-gray-300 disabled:opacity-50"
                        >
                          Next →
                        </button>
                      </div>
                    )}
                  </div>
                );
              })()}
            </div>
          </div>

          {/* Overlay */}
          {mobileView === "mailbox" && (
            <div
              className="absolute inset-0 bg-black/50 z-20"
              onClick={() => setMobileView("kanban")}
            />
          )}
        </div>
      </div>

      {/* Mobile Compose FAB */}
      <button
        onClick={() => setIsComposeOpen(true)}
        className="lg:hidden fixed bottom-6 right-6 w-14 h-14 bg-blue-600 hover:bg-blue-700 text-white rounded-full shadow-lg flex items-center justify-center z-40"
      >
        <span className="material-symbols-outlined text-[24px]">edit</span>
      </button>

      {/* Popup chi tiết email + summary Gemini */}
      {detailEmailId && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/30  backdrop-blur-sm p-4">
          <div className="bg-white dark:bg-gray-900 rounded-xl shadow-2xl max-w-4xl w-full max-h-[90vh] flex flex-col relative overflow-hidden border border-gray-200 dark:border-gray-800">
            <div className="absolute top-4 right-4 z-10">
              <button
                className="px-3 py-1.5 rounded-md bg-gray-100 dark:bg-gray-800 hover:bg-gray-200 dark:hover:bg-gray-700 text-sm font-medium transition-colors border border-gray-200 dark:border-gray-700"
                onClick={() => setDetailEmailId(null)}
              >
                ✕ Đóng
              </button>
            </div>

            <div className="overflow-y-auto p-6 custom-scrollbar">
              <EmailDetail
                emailId={detailEmailId}
                onToggleStar={() => {}}
                theme={theme}
              />

              <div className="mt-8 border-t border-gray-200 dark:border-gray-800 pt-6">
                <div className="bg-blue-50 dark:bg-blue-900/20 rounded-lg p-4 border border-blue-100 dark:border-blue-800/50">
                  <div className="flex items-center gap-2 font-semibold mb-3 text-blue-700 dark:text-blue-400">
                    <svg
                      className="w-5 h-5"
                      fill="none"
                      viewBox="0 0 24 24"
                      stroke="currentColor"
                    >
                      <path
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        strokeWidth={2}
                        d="M13 10V3L4 14h7v7l9-11h-7z"
                      />
                    </svg>
                    Tóm tắt thông minh (Gemini AI)
                  </div>

                  {isSummaryLoading ? (
                    <div className="flex items-center gap-3 text-gray-600 dark:text-gray-400 py-2">
                      <div className="w-5 h-5 border-2 border-blue-500 border-t-transparent rounded-full animate-spin" />
                      <span>Đang phân tích nội dung email...</span>
                    </div>
                  ) : (
                    <div className="text-sm leading-relaxed whitespace-pre-line text-gray-800 dark:text-gray-200">
                      {summary || "Không thể tạo tóm tắt cho email này."}
                    </div>
                  )}
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Compose Email Dialog */}
      <ComposeEmail
        open={isComposeOpen}
        onOpenChange={(open) => {
          setIsComposeOpen(open);
          if (!open)
            setComposeInitialData({ to: [], cc: [], subject: "", body: "" });
        }}
        initialTo={composeInitialData.to}
        initialCc={composeInitialData.cc}
        initialSubject={composeInitialData.subject}
        initialBody={composeInitialData.body}
      />

      {/* Snooze Dialog */}
      <SnoozeDialog
        open={snoozeDialogOpen}
        onOpenChange={setSnoozeDialogOpen}
        onConfirm={handleSnoozeConfirm}
        emailSubject={emailToSnooze?.subject}
      />

      {/* Kanban Settings Modal */}
      <KanbanSettings
        isOpen={isSettingsOpen}
        onClose={async () => {
          setIsSettingsOpen(false);
          // Reload columns after settings are closed to sync local state with any changes
          try {
            const columns = await emailService.getKanbanColumns();
            setKanbanColumnConfigs(columns);
            // Also reload emails for all columns
            await reloadAllKanbanColumns();
          } catch (error) {
            console.error("Error reloading columns after settings:", error);
          }
        }}
        availableLabels={mailboxes.map((mb) => ({ id: mb.id, name: mb.name }))}
      />

      {/* Snoozed Drawer */}
      <SnoozedDrawer
        isOpen={isSnoozedDrawerOpen}
        onClose={() => setIsSnoozedDrawerOpen(false)}
        emails={kanbanEmails.snoozed || []}
        onUnsnooze={async (emailId) => {
          try {
            // Call API first to get target column
            const { targetColumn } = await emailService.unsnoozeEmail(emailId);
            
            // Optimistic update - move to target column
            setKanbanEmails((prev) => {
              let movedEmail: Email | undefined;
              const newEmails = Object.fromEntries(
                Object.entries(prev).map(([col, emails]) => {
                  const emailsArray = emails || [];
                  const filtered = emailsArray.filter((ee) => {
                    if (ee.id === emailId) {
                      movedEmail = ee;
                      return false;
                    }
                    return true;
                  });
                  return [col, filtered];
                })
              ) as typeof prev;
              if (movedEmail) {
                movedEmail.mailbox_id = targetColumn;
                // Initialize target column if it doesn't exist
                if (!newEmails[targetColumn]) {
                  newEmails[targetColumn] = [];
                }
                newEmails[targetColumn] = [movedEmail, ...newEmails[targetColumn]];
              }
              return newEmails;
            });
            
            // Refresh target column and snoozed column from server
            loadKanbanColumn(targetColumn, kanbanOffsets[targetColumn] ?? 0);
            loadKanbanColumn("snoozed", kanbanOffsets.snoozed);
          } catch (error) {
            console.error("Error unsnoozing email:", error);
          }
        }}
        onEmailClick={(emailId) => setDetailEmailId(emailId)}
        offset={kanbanOffsets.snoozed}
        limit={limit}
        onPageChange={(dir) => handleKanbanPage("snoozed", dir)}
      />
    </div>
  );
}
