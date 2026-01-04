import { useState, useEffect } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { useAppSelector } from "@/store/hooks";
import { emailService } from "@/services/email.service";
import type { Email } from "@/types/email";

import MailboxList from "@/components/inbox/MailboxList";
import EmailList from "@/components/inbox/EmailList";
import EmailDetail from "@/components/inbox/EmailDetail";
import ComposeEmail from "@/components/inbox/ComposeEmail";
import SearchBar from "@/components/search/SearchBar";
import { useQueryClient } from "@tanstack/react-query";
import KanbanToggle from "@/components/kanban/KanbanToggle";
import { useTheme, useSSE, useFCM, useEmailActions } from "@/hooks";
import { SEARCH_MODES, type SearchMode } from "@/constants";

export default function InboxPage() {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const user = useAppSelector((state) => state.auth.user);

  // Initialize FCM for push notifications
  useFCM();

  const { mailbox, emailId } = useParams<{
    mailbox?: string;
    emailId?: string;
  }>();

  // Email compose actions - extracted to custom hook
  const {
    isComposeOpen,
    setIsComposeOpen,
    composeData,
    handleReply,
    handleReplyAll,
    handleForward,
    clearComposeData,
  } = useEmailActions({ userEmail: user?.email });

  const [mobileView, setMobileView] = useState<"mailbox" | "list" | "detail">(
    "list"
  );
  // Search query from header - when set, shows search results in email list
  const [headerSearchQuery, setHeaderSearchQuery] = useState("");

  // Theme is still used for EmailDetail component
  const { theme } = useTheme();

  // Use URL params or default to 'inbox'
  const selectedMailboxId = mailbox || "inbox";
  const selectedEmailId = emailId || null;
  // Search mode: "semantic" or "fuzzy"
  const [searchMode, setSearchMode] = useState<SearchMode>(SEARCH_MODES.SEMANTIC);

  const handleSearch = (query: string, mode: "semantic" | "fuzzy") => {
    const trimmed = query.trim();
    if (!trimmed) return;
    // Set search query and mode to show results in email list column
    setHeaderSearchQuery(trimmed);
    setSearchMode(mode);
  };

  const handleClearSearch = () => {
    setHeaderSearchQuery("");
  };

  // SSE connection for real-time updates - extracted to custom hook
  useSSE({
    enabled: !!user,
    handlers: {
      onEmailUpdate: () => {
        // Just refetch queries - FCM handles toast notifications
        queryClient.refetchQueries({ queryKey: ["emails"] });
        queryClient.refetchQueries({ queryKey: ["mailboxes"] });
      },
    },
  });

  // Register Gmail push notifications when user is available
  useEffect(() => {
    if (user) {
      emailService.watchMailbox().catch(console.error);
    }
  }, [user]);

  const handleSelectMailbox = (id: string) => {
    // Clear search when selecting a mailbox
    setHeaderSearchQuery("");
    navigate(`/${id}`);
  };

  const handleSelectEmail = (email: Email) => {
    navigate(`/${selectedMailboxId}/${email.id}`);
    setMobileView("detail");
  };

  const handleToggleStar = () => {
    // Do nothing - let the mutation handle cache updates
    // This callback is kept for backward compatibility but no longer invalidates
  };

  return (
    <div className="flex flex-col h-screen bg-gray-50 dark:bg-[#111418] text-gray-900 dark:text-white overflow-hidden font-sans transition-colors duration-200">
      {/* Header - Desktop and Mobile */}
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
            Email Client AI
          </span>
        </div>

        {/* Search Bar */}
        <div className="flex-1 max-w-md mx-4 hidden md:block">
          <SearchBar
            onSearch={handleSearch}
            onClear={handleClearSearch}
            isSearching={false}
            placeholder="Tìm kiếm email (hỗ trợ fuzzy)..."
          />
        </div>

        <KanbanToggle isKanban={false} onToggle={() => navigate("/kanban")} />
      </div>

      {/* Main Content Area */}
      <div className="flex-1 overflow-hidden relative">
        {/* Desktop Layout - 3 columns */}
        <div className="hidden lg:flex h-full">
          {/* Column 1: Sidebar */}
          <div className="w-[220px] shrink-0 border-r border-gray-200 dark:border-gray-800 bg-gray-50 dark:bg-[#111418]">
            <MailboxList
              selectedMailboxId={headerSearchQuery ? null : selectedMailboxId}
              onSelectMailbox={handleSelectMailbox}
              onComposeClick={() => setIsComposeOpen(true)}
            />
          </div>
          {/* Column 2: Email List */}
          <div className="w-[360px] shrink-0 border-r border-gray-200 dark:border-gray-800 bg-white dark:bg-[#111418] flex flex-col">
            <EmailList
              mailboxId={headerSearchQuery ? null : selectedMailboxId}
              selectedEmailId={selectedEmailId}
              onSelectEmail={handleSelectEmail}
              onToggleStar={handleToggleStar}
              searchQuery={headerSearchQuery}
              searchMode={searchMode}
              onClearSearch={handleClearSearch}
            />
          </div>
          {/* Column 3: Email Detail */}
          <div className="flex-1 bg-white dark:bg-[#111418] min-w-0">
            <EmailDetail
              emailId={selectedEmailId}
              onToggleStar={handleToggleStar}
              onReply={handleReply}
              onReplyAll={handleReplyAll}
              onForward={handleForward}
              theme={theme}
            />
          </div>
        </div>

        {/* Mobile Layout - Sliding panels */}
        <div className="lg:hidden h-full">
          {/* Mailbox List - Mobile Drawer */}
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
                onClick={() => setMobileView("list")}
                className="p-2 hover:bg-gray-200 dark:hover:bg-gray-700 rounded-lg"
              >
                <span className="material-symbols-outlined text-gray-700 dark:text-gray-300">
                  close
                </span>
              </button>
            </div>
            <MailboxList
              selectedMailboxId={headerSearchQuery ? null : selectedMailboxId}
              onSelectMailbox={(id) => {
                handleSelectMailbox(id);
                setMobileView("list");
              }}
              onComposeClick={() => {
                setIsComposeOpen(true);
                setMobileView("list");
              }}
            />
          </div>

          {/* Email List - Mobile */}
          <div
            className={`absolute inset-0 bg-white dark:bg-[#111418] transition-transform duration-300 ${
              mobileView === "detail" ? "-translate-x-full" : "translate-x-0"
            }`}
          >
            <EmailList
              mailboxId={headerSearchQuery ? null : selectedMailboxId}
              selectedEmailId={selectedEmailId}
              onSelectEmail={handleSelectEmail}
              onToggleStar={handleToggleStar}
              searchQuery={headerSearchQuery}
              searchMode={searchMode}
              onClearSearch={handleClearSearch}
            />
          </div>

          {/* Email Detail - Mobile */}
          <div
            className={`absolute inset-0 bg-white dark:bg-[#111418] transition-transform duration-300 ${
              mobileView === "detail" ? "translate-x-0" : "translate-x-full"
            }`}
          >
            {selectedEmailId && (
              <>
                <div className="flex items-center gap-2 p-3 border-b border-gray-200 dark:border-gray-700 bg-white dark:bg-[#111418]">
                  <button
                    onClick={() => setMobileView("list")}
                    className="p-2 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-lg"
                  >
                    <span className="material-symbols-outlined text-gray-700 dark:text-gray-300">
                      arrow_back
                    </span>
                  </button>
                  <h2 className="text-lg font-semibold text-gray-900 dark:text-white">
                    Email
                  </h2>
                </div>
                <div className="h-[calc(100%-60px)] overflow-auto">
                  <EmailDetail
                    emailId={selectedEmailId}
                    onToggleStar={handleToggleStar}
                    onReply={handleReply}
                    onReplyAll={handleReplyAll}
                    onForward={handleForward}
                    theme={theme}
                  />
                </div>
              </>
            )}
          </div>

          {/* Overlay for drawer */}
          {mobileView === "mailbox" && (
            <div
              className="absolute inset-0 bg-black/50 z-20"
              onClick={() => setMobileView("list")}
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

      {/* Compose Email Dialog */}
      <ComposeEmail
        open={isComposeOpen}
        onOpenChange={(open) => {
          setIsComposeOpen(open);
          if (!open) clearComposeData();
        }}
        initialTo={composeData.to}
        initialCc={composeData.cc}
        initialSubject={composeData.subject}
        initialBody={composeData.body}
        quotedContent={composeData.quotedContent}
        quotedHeader={composeData.quotedHeader}
      />
    </div>
  );
}
