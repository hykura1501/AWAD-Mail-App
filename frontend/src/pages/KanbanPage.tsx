import { useState, useEffect, useMemo } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { useAppSelector } from "@/store/hooks";
import { emailService } from "@/services/email.service";
import type { Email } from "@/types/email";
import MailboxList from "@/components/inbox/MailboxList";
import ComposeEmail from "@/components/inbox/ComposeEmail";
import { useQueryClient } from "@tanstack/react-query";
import KanbanBoard from "@/components/kanban/KanbanBoard";
import type { KanbanColumn } from "@/components/kanban/KanbanBoard";
import KanbanHeader from "@/components/kanban/KanbanHeader";
import KanbanToolbar from "@/components/kanban/KanbanToolbar";
import { type SortOption, type FilterState } from "@/components/kanban/KanbanFilters";
import { sortEmails as sortEmailsUtil, filterEmails as filterEmailsUtil, cleanPreviewText as cleanPreviewTextUtil } from "@/lib/emailUtils";
import { SnoozeDialog } from "@/components/inbox/SnoozeDialog";
import KanbanSettings from "@/components/kanban/KanbanSettings";
import SnoozedDrawer from "@/components/kanban/SnoozedDrawer";
import EmailDetailPopup from "@/components/kanban/EmailDetailPopup";
import KanbanCardActions from "@/components/kanban/KanbanCardActions";
import MobileColumnTabs from "@/components/kanban/MobileColumnTabs";
import MobileEmailCard from "@/components/kanban/MobileEmailCard";
import { TaskDrawer } from "@/components/tasks";
import SearchModal from "@/components/search/SearchModal";

import { useTheme, useSSE, useFCM, useKanbanSnooze, useKanbanData, useKanbanSummaries, useKanbanSearchNavigation } from "@/hooks";


export default function KanbanPage() {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const user = useAppSelector((state) => state.auth.user);
  
  // Initialize FCM for push notifications
  useFCM();

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

  // Theme is still used for EmailDetailPopup component
  const { theme } = useTheme();



  const handleSelectMailbox = (id: string) => {
    navigate(`/${id}`);
  };

  // Settings modal state
  const [isSettingsOpen, setIsSettingsOpen] = useState(false);

  // Snoozed drawer state
  const [isSnoozedDrawerOpen, setIsSnoozedDrawerOpen] = useState(false);

  // Search modal state
  const [isSearchModalOpen, setIsSearchModalOpen] = useState(false);

  // Task drawer state
  const [isTaskDrawerOpen, setIsTaskDrawerOpen] = useState(false);

  // Summary hook - handles summary states, caching, and loading
  // IMPORTANT: Must come BEFORE useKanbanData so we can pass queueSummaries as callback
  const {
    summaryStates,
    summary,
    isSummaryLoading,
    requestSummary: handleRequestSummary,
    handleSummaryUpdate,
    loadDetailSummary,
    queueSummaries,
  } = useKanbanSummaries();

  // Kanban Data Hook - handles column loading, caching, pagination
  // Pass queueSummaries to onInitComplete to auto-summarize emails when page loads
  const {
    kanbanEmails,
    kanbanOffsets,
    kanbanColumnConfigs,
    mailboxes,
    isAnyLoading,
    loadColumn: loadKanbanColumn,
    reloadAllColumns: reloadAllKanbanColumns,
    moveEmail: handleKanbanDrop,
    updatePage: handleKanbanPage,
    setKanbanEmails,
    setKanbanColumnConfigs,
    limit,
  } = useKanbanData({
    onInitComplete: (emailIds) => {
      // Queue all loaded emails for AI summarization
      console.log(`[KanbanPage] Queueing ${emailIds.length} emails for summarization`);
      queueSummaries(emailIds);
    },
  });
  
  // State cho popup chi tiết email
  const [detailEmailId, setDetailEmailId] = useState<string | null>(null);
  const [mobileView, setMobileView] = useState<"mailbox" | "kanban">("kanban");
  const [mobileSelectedColumn, setMobileSelectedColumn] =
    useState<string>("inbox");

  // Search navigation hook - handles finding, navigating, and highlighting search results
  const {
    highlightedEmailId,
    handleSearchResultClick,
  } = useKanbanSearchNavigation({
    kanbanEmails,
    limit,
    loadColumn: loadKanbanColumn,
    setMobileSelectedColumn,
    // Fallback: if email not found in first 500, open detail popup
    onEmailNotFound: (emailId) => setDetailEmailId(emailId),
  });


  // Snooze hook - handles dialog state and snooze logic
  const {
    snoozeDialogOpen,
    emailToSnooze,
    openSnoozeDialog,
    closeSnoozeDialog,
    confirmSnooze,
  } = useKanbanSnooze();


  // Note: kanbanOffsets, loadingColumns, kanbanEmails, limit are now from useKanbanData hook

  // Sorting and filtering state
  const [sortBy, setSortBy] = useState<SortOption>("newest");
  const [filters, setFilters] = useState<FilterState>({
    unreadOnly: false,
    withAttachments: false,
  });

  // Use imported utilities (aliased for compatibility)
  const sortEmails = sortEmailsUtil;
  const filterEmails = filterEmailsUtil;

  const cleanPreviewText = cleanPreviewTextUtil;

  // Note: loadKanbanColumn and reloadAllKanbanColumns are now from useKanbanData hook

  // Note: summaryStates, requestedSummaries, handleRequestSummary, loadCachedSummaries are now from useKanbanSummaries hook

  // Load detail summary when email is selected
  useEffect(() => {
    if (detailEmailId) {
      loadDetailSummary(detailEmailId);
    }
  }, [detailEmailId, loadDetailSummary]);

  // Note: handleKanbanPage, handleKanbanDrop, isAnyLoading are now from useKanbanData hook


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

  // SSE connection for real-time updates - using custom hook
  // KanbanPage has special handlers for summary updates and Kanban reloading
  useSSE({
    enabled: !!user,
    handlers: {
      onEmailUpdate: () => {
        // FCM handles toast notifications - just reload data
        reloadAllKanbanColumns().catch((error) => {
          console.error("Error reloading Kanban via SSE:", error);
        });
        // Note: mailboxes are now managed by useKanbanData hook
        
        // Also invalidate React Query for other pages
        queryClient.invalidateQueries({
          queryKey: ["emails"],
          refetchType: "none",
        });
        queryClient.invalidateQueries({
          queryKey: ["mailboxes"],
          refetchType: "none",
        });
      },
      onSummaryUpdate: (emailId, summary) => {
        handleSummaryUpdate(emailId, summary);
      },
    },
  });

  // Register Gmail push notifications
  useEffect(() => {
    if (user) {
      emailService.watchMailbox().catch(console.error);
    }
  }, [user]);

  return (
    <div className="flex flex-col h-screen bg-gray-50 dark:bg-[#111418] text-gray-900 dark:text-white overflow-hidden font-sans transition-colors duration-200">
      {/* Header */}
      <KanbanHeader user={user} onMenuClick={() => setMobileView("mailbox")} onOpenTaskDrawer={() => setIsTaskDrawerOpen(true)} />

      {/* Filter Bar */}
      <KanbanToolbar
        sortBy={sortBy}
        onSortChange={setSortBy}
        filters={filters}
        onFilterChange={setFilters}
        snoozedCount={kanbanEmails.snoozed?.length || 0}
        onSnoozedClick={() => setIsSnoozedDrawerOpen(true)}
        onSearchClick={() => setIsSearchModalOpen(true)}
        onSettingsClick={() => setIsSettingsOpen(true)}
      />

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
              renderCardActions={(email, columnId) => (
                <KanbanCardActions
                  email={email}
                  columnId={columnId}
                  onSnooze={openSnoozeDialog}
                  onUnsnooze={async (email) => {
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
                      loadKanbanColumn(targetColumn, kanbanOffsets[targetColumn] ?? 0);
                      loadKanbanColumn("snoozed", kanbanOffsets.snoozed);
                    } catch (error) {
                      console.error("Error unsnoozing email:", error);
                    }
                  }}
                />
              )}
               onEmailClick={(emailId) => setDetailEmailId(emailId)}
               highlightedEmailId={highlightedEmailId}
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
            />
          </div>

          {/* Mobile Kanban - Column Selector */}
          <div className="h-full flex flex-col">
            {/* Column Tabs */}
            <MobileColumnTabs
              columns={kanbanColumns}
              selectedColumn={mobileSelectedColumn}
              onSelectColumn={setMobileSelectedColumn}
            />

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
                        <MobileEmailCard
                          key={email.id}
                          email={email}
                          summaryState={summaryStates[email.id]}
                          cleanPreviewText={cleanPreviewText}
                          currentColumn={mobileSelectedColumn}
                          onEmailClick={setDetailEmailId}
                          onSnooze={openSnoozeDialog}
                          onUnsnooze={async (email) => {
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
                              loadKanbanColumn(targetColumn, kanbanOffsets[targetColumn] ?? 0);
                              loadKanbanColumn("snoozed", kanbanOffsets.snoozed);
                            } catch (error) {
                              console.error("Error unsnoozing email (mobile):", error);
                            }
                          }}
                          onMoveToColumn={handleKanbanDrop}
                          onColumnChange={setMobileSelectedColumn}
                        />
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
        <EmailDetailPopup
          emailId={detailEmailId}
          onClose={() => setDetailEmailId(null)}
          onOpenTaskDrawer={() => setIsTaskDrawerOpen(true)}
          theme={theme}
          summary={summary}
          isSummaryLoading={isSummaryLoading}
        />
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
        onOpenChange={(open) => !open && closeSnoozeDialog()}
        onConfirm={(snoozeUntil) => confirmSnooze(snoozeUntil, setKanbanEmails)}
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
        onColumnsChange={async () => {
          // Immediately reload when columns are created/updated/deleted
          try {
            const columns = await emailService.getKanbanColumns();
            setKanbanColumnConfigs(columns);
            await reloadAllKanbanColumns();
          } catch (error) {
            console.error("Error reloading after column change:", error);
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

      {/* Task Drawer */}
      <TaskDrawer isOpen={isTaskDrawerOpen} onClose={() => setIsTaskDrawerOpen(false)} />

      {/* Search Modal */}
      <SearchModal
        isOpen={isSearchModalOpen}
        onClose={() => setIsSearchModalOpen(false)}
        onEmailClick={handleSearchResultClick}
      />
    </div>
  );
}
