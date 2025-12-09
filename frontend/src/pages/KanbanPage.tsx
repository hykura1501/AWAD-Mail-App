import { useState, useEffect } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { useAppDispatch, useAppSelector } from "@/store/hooks";
import { logout } from "@/store/authSlice";
import { authService } from "@/services/auth.service";
import { emailService } from "@/services/email.service";
import { getAccessToken } from "@/lib/api-client";
import type { Email } from "@/types/email";
import MailboxList from "@/components/inbox/MailboxList";
import ComposeEmail from "@/components/inbox/ComposeEmail";
import EmailDetail from "@/components/inbox/EmailDetail";
import { useQueryClient, useMutation, useQuery } from "@tanstack/react-query";
import { API_BASE_URL } from "@/config/api";
import KanbanBoard from "@/components/kanban/KanbanBoard";
import type { KanbanColumn } from "@/components/kanban/KanbanBoard";
import KanbanToggle from "@/components/kanban/KanbanToggle";

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

  // State cho popup chi tiết email
  const [detailEmailId, setDetailEmailId] = useState<string | null>(null);

  const { data: summary, isFetching: isSummaryLoading } = useQuery({
    queryKey: ["email-summary", detailEmailId],
    queryFn: async () => {
      if (!detailEmailId) return "";
      return emailService.getEmailSummary(detailEmailId);
    },
    enabled: !!detailEmailId,
  });

  // Snooze mutation
  const snoozeEmailMutation = useMutation({
    mutationFn: async (emailId: string) => {
      await emailService.moveEmailToMailbox(emailId, "snoozed");
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["emails"] });
    },
  });

  // Wake up mutation
  const wakeUpEmailMutation = useMutation({
    mutationFn: async (emailId: string) => {
      await emailService.moveEmailToMailbox(emailId, "inbox");
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["emails"] });
    },
  });

  // Mutation cho kéo thả Kanban
  const moveEmailMutation = useMutation({
    mutationFn: async ({
      emailId,
      mailboxId,
    }: {
      emailId: string;
      mailboxId: string;
    }) => {
      await emailService.moveEmailToMailbox(emailId, mailboxId);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["emails"] });
    },
  });

  // State phân trang cho từng cột Kanban
  const [kanbanOffsets, setKanbanOffsets] = useState({
    inbox: 0,
    todo: 0,
    done: 0,
    snoozed: 0,
  });
  const limit = 20;

  // State emails cho từng cột (optimistic update)
  const [kanbanEmails, setKanbanEmails] = useState({
    inbox: [] as Email[],
    todo: [] as Email[],
    done: [] as Email[],
    snoozed: [] as Email[],
  });

  // Query từng cột
  const { data: inboxData, refetch: refetchInbox } = useQuery({
    queryKey: ["emails", "kanban", "inbox", kanbanOffsets.inbox],
    queryFn: () =>
      emailService.getEmailsByStatus("inbox", limit, kanbanOffsets.inbox),
  });
  const { data: todoData, refetch: refetchTodo } = useQuery({
    queryKey: ["emails", "kanban", "todo", kanbanOffsets.todo],
    queryFn: () =>
      emailService.getEmailsByStatus("todo", limit, kanbanOffsets.todo),
  });
  const { data: doneData, refetch: refetchDone } = useQuery({
    queryKey: ["emails", "kanban", "done", kanbanOffsets.done],
    queryFn: () =>
      emailService.getEmailsByStatus("done", limit, kanbanOffsets.done),
  });
  const { data: snoozedData, refetch: refetchSnoozed } = useQuery({
    queryKey: ["emails", "kanban", "snoozed", kanbanOffsets.snoozed],
    queryFn: () =>
      emailService.getEmailsByStatus("snoozed", limit, kanbanOffsets.snoozed),
  });

  // Update kanbanEmails state when query data changes
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setKanbanEmails({
      inbox: inboxData?.emails ?? [],
      todo: todoData?.emails ?? [],
      done: doneData?.emails ?? [],
      snoozed: snoozedData?.emails ?? [],
    });
  }, [inboxData, todoData, doneData, snoozedData]);

  // Track which emails have requested summaries
  const [requestedSummaries, setRequestedSummaries] = useState<Set<string>>(new Set());
  
  // Track summary states
  const [summaryStates, setSummaryStates] = useState<Record<string, { summary: string; loading: boolean }>>({});

  // Handle summary request
  const handleRequestSummary = async (emailId: string) => {
    if (requestedSummaries.has(emailId)) return;
    
    setRequestedSummaries(prev => new Set(prev).add(emailId));
    setSummaryStates(prev => ({
      ...prev,
      [emailId]: { summary: "", loading: true }
    }));

    try {
      const summary = await emailService.getEmailSummary(emailId);
      setSummaryStates(prev => ({
        ...prev,
        [emailId]: { summary, loading: false }
      }));
    } catch (error) {
      console.error("Error fetching summary:", error);
      setSummaryStates(prev => ({
        ...prev,
        [emailId]: { summary: "Không thể tạo tóm tắt cho email này.", loading: false }
      }));
    }
  };

  // Hàm chuyển trang cho từng cột
  const handleKanbanPage = (col: keyof typeof kanbanOffsets, dir: 1 | -1) => {
    setKanbanOffsets((prev) => ({
      ...prev,
      [col]: Math.max(0, prev[col] + dir * limit),
    }));
  };

  // Optimistic update khi kéo thả
  const handleKanbanDrop = (emailId: string, targetColumnId: string) => {
    setKanbanEmails((prev) => {
      // Tìm email trong tất cả các cột
      let movedEmail: Email | undefined;
      const newEmails = Object.fromEntries(
        Object.entries(prev).map(([col, emails]) => {
          const filtered = emails.filter((e) => {
            if (e.id === emailId) {
              movedEmail = e;
              return false;
            }
            return true;
          });
          return [col, filtered];
        })
      ) as typeof prev;
      // Thêm email vào cột mới
      if (movedEmail) {
        newEmails[targetColumnId as keyof typeof newEmails] = [
          movedEmail,
          ...newEmails[targetColumnId as keyof typeof newEmails],
        ];
      }
      return newEmails;
    });
    // Call API ngầm
    moveEmailMutation.mutate({ emailId, mailboxId: targetColumnId });
    // Refetch lại dữ liệu cột đích và cột nguồn
    if (targetColumnId === "inbox") refetchInbox();
    if (targetColumnId === "todo") refetchTodo();
    if (targetColumnId === "done") refetchDone();
    if (targetColumnId === "snoozed") refetchSnoozed();
  };

  const kanbanColumns: KanbanColumn[] = [
    {
      id: "inbox",
      title: "Inbox",
      emails: kanbanEmails.inbox,
      offset: kanbanOffsets.inbox,
      limit,
    },
    {
      id: "todo",
      title: "To Do",
      emails: kanbanEmails.todo,
      offset: kanbanOffsets.todo,
      limit,
    },
    {
      id: "done",
      title: "Done",
      emails: kanbanEmails.done,
      offset: kanbanOffsets.done,
      limit,
    },
    {
      id: "snoozed",
      title: "Snoozed",
      emails: kanbanEmails.snoozed,
      offset: kanbanOffsets.snoozed,
      limit,
    },
  ];

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
          if (data.type === "email_update") {
            // Ignore SSE updates for 3 seconds after user actions to prevent conflicts
            const timeSinceLastMutation = Date.now() - lastMutationTime;
            if (timeSinceLastMutation < 3000) {
              return;
            }

            // Only invalidate for new emails or external changes
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
  }, [user, queryClient]);

  return (
    <div className="flex flex-col h-screen bg-gray-50 dark:bg-[#111418] text-gray-900 dark:text-white overflow-hidden font-sans transition-colors duration-200">
      <div className="flex items-center justify-between px-4 py-2 border-b border-gray-200 dark:border-gray-800 bg-white dark:bg-[#111418]">
        <span className="font-bold text-lg">MailApp - Kanban</span>
        <KanbanToggle isKanban={true} onToggle={() => navigate("/inbox")} />
      </div>
      <div className="flex-1 overflow-auto">
        <div className="flex h-full">
          {/* Column 1: Sidebar */}
          <div className="w-[220px] shrink-0 border-r border-gray-200 dark:border-gray-800 bg-gray-50 dark:bg-[#111418]">
            <MailboxList
              selectedMailboxId={selectedMailboxId}
              onSelectMailbox={handleSelectMailbox}
              onComposeClick={() => setIsComposeOpen(true)}
              onLogout={handleLogout}
              theme={theme}
              onToggleTheme={toggleTheme}
            />
          </div>

          {/* Column 2: Kanban Board */}
          <div className="flex-1 min-w-0">
            <KanbanBoard
              columns={kanbanColumns}
              onEmailDrop={handleKanbanDrop}
              onPageChange={(colId, dir) =>
                handleKanbanPage(colId as keyof typeof kanbanOffsets, dir)
              }
              emailSummaries={summaryStates}
              onRequestSummary={handleRequestSummary}
              renderCardActions={(email) =>
                email.mailbox_id !== "snoozed" ? (
                  <>
                    <button
                      className="px-2 py-1 rounded bg-yellow-400 text-xs text-black hover:bg-yellow-500"
                      onClick={(e) => {
                        e.stopPropagation();
                        setKanbanEmails((prev) => {
                          let movedEmail: Email | undefined;
                          const newEmails = Object.fromEntries(
                            Object.entries(prev).map(([col, emails]) => {
                              const filtered = emails.filter((e) => {
                                if (e.id === email.id) {
                                  movedEmail = e;
                                  return false;
                                }
                                return true;
                              });
                              return [col, filtered];
                            })
                          ) as typeof prev;
                          if (movedEmail) {
                            newEmails.snoozed = [
                              movedEmail,
                              ...newEmails.snoozed,
                            ];
                          }
                          return newEmails;
                        });
                        snoozeEmailMutation.mutate(email.id);
                      }}
                    >
                      Snooze
                    </button>
                  </>
                ) : (
                  <button
                    className="px-2 py-1 rounded bg-green-400 text-xs text-black hover:bg-green-500"
                    onClick={(e) => {
                      e.stopPropagation();
                      setKanbanEmails((prev) => {
                        let movedEmail: Email | undefined;
                        const newEmails = Object.fromEntries(
                          Object.entries(prev).map(([col, emails]) => {
                            const filtered = emails.filter((e) => {
                              if (e.id === email.id) {
                                movedEmail = e;
                                return false;
                              }
                              return true;
                            });
                            return [col, filtered];
                          })
                        ) as typeof prev;
                        if (movedEmail) {
                          newEmails.inbox = [movedEmail, ...newEmails.inbox];
                        }
                        return newEmails;
                      });
                      wakeUpEmailMutation.mutate(email.id);
                    }}
                  >
                    Unsnooze
                  </button>
                )
              }
              // Khi click vào email card thì mở popup detail
              onEmailClick={(emailId) => setDetailEmailId(emailId)}
            />
          </div>
        </div>

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
      </div>

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
    </div>
  );
}
