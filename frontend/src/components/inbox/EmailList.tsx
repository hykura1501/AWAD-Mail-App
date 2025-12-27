import { useState, useEffect, useRef, useMemo, useCallback } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { emailService } from "@/services/email.service";
import { getFromCache, saveToCache } from "@/lib/db";
import type { Email, EmailsResponse } from "@/types/email";
import { cn } from "@/lib/utils";
import { format } from "date-fns";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import StarIcon from "@/assets/star.svg?react";

interface EmailListProps {
  mailboxId: string | null;
  selectedEmailId: string | null;
  onSelectEmail: (email: Email) => void;
  onToggleStar: (emailId: string) => void;
  searchQuery?: string; // External search query from header
  searchMode?: "semantic" | "fuzzy"; // Search mode from header
  onClearSearch?: () => void; // Callback to clear search
}

const ITEMS_PER_PAGE = 20;

export default function EmailList({
  mailboxId,
  selectedEmailId,
  onSelectEmail,
  searchQuery,
  searchMode = "semantic", // Default to semantic search
  onClearSearch,
}: EmailListProps) {
  const [internalSearchQuery, setInternalSearchQuery] = useState("");
  const [debouncedInternalSearch, setDebouncedInternalSearch] = useState("");
  const [currentPage, setCurrentPage] = useState(1);
  const [cachedData, setCachedData] = useState<EmailsResponse | null>(null);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  
  // Sorting and Filtering state
  const [sortOrder, setSortOrder] = useState<"newest" | "oldest">("newest");
  const [showUnreadOnly, setShowUnreadOnly] = useState(false);
  const [showWithAttachmentsOnly, setShowWithAttachmentsOnly] = useState(false);
  const [showFilterDropdown, setShowFilterDropdown] = useState(false);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const filterDropdownRef = useRef<HTMLDivElement>(null);
  
  // Keyboard navigation state
  const [focusedIndex, setFocusedIndex] = useState(-1);
  const emailItemRefs = useRef<(HTMLDivElement | null)[]>([]);
  
  const queryClient = useQueryClient();
  const offset = (currentPage - 1) * ITEMS_PER_PAGE;
  
  // When external searchQuery is provided, use that; otherwise use internal search
  const isExternalSearch = !!searchQuery;
  const cacheKey = isExternalSearch 
    ? `search-${searchQuery}-${offset}` 
    : `emails-${mailboxId}-${offset}-${debouncedInternalSearch}`;

  useEffect(() => {
    const timer = setTimeout(() => {
      setDebouncedInternalSearch(internalSearchQuery);
      setCurrentPage(1); // Reset to page 1 on search
    }, 500);
    return () => clearTimeout(timer);
  }, [internalSearchQuery]);

  // Reset page when external search query changes
  useEffect(() => {
    if (searchQuery) {
      setCurrentPage(1);
    }
  }, [searchQuery]);

  useEffect(() => {
    if (mailboxId || isExternalSearch) {
      getFromCache(cacheKey).then((data) => {
        if (data) setCachedData(data);
      });
    }
  }, [cacheKey, mailboxId, isExternalSearch]);

  // Close filter dropdown when clicking outside
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (
        filterDropdownRef.current &&
        !filterDropdownRef.current.contains(event.target as Node)
      ) {
        setShowFilterDropdown(false);
      }
    };
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  const { data, isLoading, isFetching, refetch } = useQuery({
    queryKey: isExternalSearch 
      ? ["search", searchMode, searchQuery, offset] 
      : ["emails", mailboxId, offset, debouncedInternalSearch],
    queryFn: async () => {
      let result: EmailsResponse;
      if (isExternalSearch) {
        // Use the selected search mode
        if (searchMode === "semantic") {
          result = await emailService.semanticSearch(
            searchQuery!,
            ITEMS_PER_PAGE,
            offset
          );
        } else {
          // Fuzzy search
          result = await emailService.fuzzySearch(
            searchQuery!,
            ITEMS_PER_PAGE,
            offset
          );
        }
      } else {
        result = await emailService.getEmailsByMailbox(
          mailboxId!,
          ITEMS_PER_PAGE,
          offset,
          debouncedInternalSearch
        );
      }
      saveToCache(cacheKey, result);
      return result;
    },
    // Only run mailbox query when NOT searching, and only run search query when searching
    // This prevents race conditions where both queries fire simultaneously
    enabled: isExternalSearch ? !!searchQuery : !!mailboxId,
    placeholderData: cachedData ?? undefined,
  });

  const emails = data?.emails || [];
  const total = data?.total || 0;
  const totalPages = Math.ceil(total / ITEMS_PER_PAGE);

  // Client-side filtering and sorting for real-time updates
  const filteredEmails = useMemo(() => {
    let result = [...emails];
    
    // Filter by unread
    if (showUnreadOnly) {
      result = result.filter(email => !email.is_read);
    }
    
    // Filter by attachments
    if (showWithAttachmentsOnly) {
      result = result.filter(email => email.attachments && email.attachments.length > 0);
    }
    
    // Sort by date
    result.sort((a, b) => {
      const dateA = new Date(a.received_at).getTime();
      const dateB = new Date(b.received_at).getTime();
      return sortOrder === "newest" ? dateB - dateA : dateA - dateB;
    });
    
    return result;
  }, [emails, showUnreadOnly, showWithAttachmentsOnly, sortOrder]);

  // Reset state when mailbox changes
  const prevMailboxIdRef = useRef(mailboxId);
  useEffect(() => {
    if (prevMailboxIdRef.current !== mailboxId) {
      prevMailboxIdRef.current = mailboxId;
      // Use setTimeout to avoid setState during render
      setTimeout(() => {
        setCurrentPage(1);
        setInternalSearchQuery("");
        setSelectedIds(new Set());
        setCachedData(null);
        setFocusedIndex(-1); // Reset focus on mailbox change
      }, 0);
    }
  }, [mailboxId]);

  // Keyboard navigation handler
  const handleKeyboardNavigation = useCallback((e: KeyboardEvent) => {
    // Don't handle if user is typing in an input/textarea
    const target = e.target as HTMLElement;
    if (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.isContentEditable) {
      return;
    }

    // Don't handle if dialog is open
    if (showDeleteConfirm) return;

    const emailCount = filteredEmails.length;
    if (emailCount === 0) return;

    switch (e.key) {
      case 'j':
      case 'ArrowDown':
        e.preventDefault();
        setFocusedIndex(prev => {
          const next = prev < emailCount - 1 ? prev + 1 : prev;
          // Scroll into view
          emailItemRefs.current[next]?.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
          return next;
        });
        break;
        
      case 'k':
      case 'ArrowUp':
        e.preventDefault();
        setFocusedIndex(prev => {
          const next = prev > 0 ? prev - 1 : 0;
          emailItemRefs.current[next]?.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
          return next;
        });
        break;
        
      case 'Enter':
        e.preventDefault();
        if (focusedIndex >= 0 && focusedIndex < emailCount) {
          onSelectEmail(filteredEmails[focusedIndex]);
        }
        break;
        
      case 'Delete':
      case 'Backspace':
        e.preventDefault();
        if (focusedIndex >= 0 && focusedIndex < emailCount) {
          const email = filteredEmails[focusedIndex];
          setSelectedIds(new Set([email.id]));
          setShowDeleteConfirm(true);
        }
        break;
        
      case 's':
        e.preventDefault();
        if (focusedIndex >= 0 && focusedIndex < emailCount) {
          emailService.toggleStar(filteredEmails[focusedIndex].id).then(() => {
            queryClient.invalidateQueries({ queryKey: ["emails"] });
            toast.success("Đã thay đổi trạng thái gắn sao");
          });
        }
        break;
        
      case 'r':
        e.preventDefault();
        if (focusedIndex >= 0 && focusedIndex < emailCount) {
          const email = filteredEmails[focusedIndex];
          if (email.is_read) {
            emailService.markAsUnread(email.id).then(() => {
              queryClient.invalidateQueries({ queryKey: ["emails"] });
              toast.success("Đánh dấu chưa đọc");
            });
          } else {
            emailService.markAsRead(email.id).then(() => {
              queryClient.invalidateQueries({ queryKey: ["emails"] });
              toast.success("Đánh dấu đã đọc");
            });
          }
        }
        break;
        
      case 'Escape':
        setFocusedIndex(-1);
        setSelectedIds(new Set());
        break;
    }
  }, [filteredEmails, focusedIndex, onSelectEmail, showDeleteConfirm, queryClient]);

  // Register keyboard event listener
  useEffect(() => {
    document.addEventListener('keydown', handleKeyboardNavigation);
    return () => document.removeEventListener('keydown', handleKeyboardNavigation);
  }, [handleKeyboardNavigation]);

  const handlePageChange = (newPage: number) => {
    if (newPage >= 1 && newPage <= totalPages) {
      setCurrentPage(newPage);
    }
  };

  const handleToggleSelect = (emailId: string) => {
    const newSelectedIds = new Set(selectedIds);
    if (newSelectedIds.has(emailId)) {
      newSelectedIds.delete(emailId);
    } else {
      newSelectedIds.add(emailId);
    }
    setSelectedIds(newSelectedIds);
  };

  const handleSelectAll = () => {
    if (
      selectedIds.size === filteredEmails.length &&
      filteredEmails.length > 0
    ) {
      setSelectedIds(new Set());
    } else {
      const newSelectedIds = new Set(filteredEmails.map((e: Email) => e.id));
      setSelectedIds(newSelectedIds);
    }
  };

  const handleRefreshClick = async () => {
    const toastId = toast.loading("Đang làm mới...");
    try {
      const { isError } = await refetch();
      if (isError) {
        toast.error("Làm mới thất bại", { id: toastId });
      } else {
        toast.success("Đã làm mới hộp thư", { id: toastId });
      }
    } catch {
      toast.error("Làm mới thất bại", { id: toastId });
    }
  };

  const toggleStarMutation = useMutation({
    mutationFn: emailService.toggleStar,
    onSuccess: (_data, emailId) => {
      // Update cache immediately after API success
      queryClient.setQueriesData<EmailsResponse>(
        { queryKey: ["emails"] },
        (old) => {
          if (!old) return old;
          return {
            ...old,
            emails: old.emails.map((e: Email) =>
              e.id === emailId ? { ...e, is_starred: !e.is_starred } : e
            ),
          };
        }
      );

      // Also update single email cache if exists
      queryClient.setQueryData<Email>(["email", emailId], (old) => {
        if (!old) return old;
        return { ...old, is_starred: !old.is_starred };
      });

      toast.success("Đã cập nhật trạng thái đánh dấu sao");
    },
    onError: () => {
      toast.error("Không thể cập nhật trạng thái đánh dấu sao");
    },
  });

  // Bulk mark as read handler - uses new bulk API
  const handleBulkMarkAsRead = async () => {
    if (selectedIds.size === 0) return;
    
    const toastId = toast.loading(`Đang đánh dấu ${selectedIds.size} email đã đọc...`);
    try {
      const result = await emailService.bulkMarkAsRead(Array.from(selectedIds));
      
      // Update cache
      queryClient.setQueriesData<EmailsResponse>(
        { queryKey: ["emails"] },
        (old) => {
          if (!old) return old;
          return {
            ...old,
            emails: old.emails.map((e: Email) =>
              selectedIds.has(e.id) ? { ...e, is_read: true } : e
            ),
          };
        }
      );
      
      toast.success(`Đã đánh dấu ${result.success_count} email là đã đọc`, { id: toastId });
      setSelectedIds(new Set()); // Clear selection
    } catch {
      toast.error("Có lỗi xảy ra khi đánh dấu đã đọc", { id: toastId });
    }
  };

  // Check if we're in the trash mailbox (case insensitive, handles both 'trash' and 'TRASH')
  const isInTrash = mailboxId?.toUpperCase() === "TRASH";
  console.log("[EmailList] mailboxId:", mailboxId, "isInTrash:", isInTrash);


  // Execute bulk trash/delete - uses new bulk API
  const executeBulkTrash = async () => {
    if (selectedIds.size === 0) return;
    
    const isPermaDelete = isInTrash;
    const actionText = isPermaDelete ? "xóa" : "chuyển vào thùng rác";
    const toastId = toast.loading(`Đang ${actionText} ${selectedIds.size} email...`);
    
    try {
      let successCount = selectedIds.size;
      
      if (isPermaDelete) {
        // For emails in trash: try permanent delete, but may fail due to scope
        // We'll still update UI regardless
        try {
          const result = await emailService.bulkPermanentDelete(Array.from(selectedIds));
          successCount = result.success_count;
        } catch (err) {
          // Gmail API may not have permission to permanently delete
          // Just remove from UI - Gmail will auto-delete after 30 days
          console.warn("[executeBulkTrash] Permanent delete failed (likely scope issue), removing from UI:", err);
        }
      } else {
        const result = await emailService.bulkTrash(Array.from(selectedIds));
        successCount = result.success_count;
      }
      
      // Remove from cache (always do this)
      queryClient.setQueriesData<EmailsResponse>(
        { queryKey: ["emails"] },
        (old) => {
          if (!old) return old;
          return {
            ...old,
            emails: old.emails.filter((e: Email) => !selectedIds.has(e.id)),
            total: old.total - selectedIds.size,
          };
        }
      );
      
      const successText = isPermaDelete 
        ? `Đã xóa ${successCount} email khỏi danh sách`
        : `Đã chuyển ${successCount} email vào thùng rác`;
      toast.success(successText, { id: toastId });
      setSelectedIds(new Set()); // Clear selection
      setShowDeleteConfirm(false);
    } catch {
      toast.error("Có lỗi xảy ra khi xóa email", { id: toastId });
    }
  };

  // Bulk trash handler - shows confirmation dialog
  const handleBulkTrash = () => {
    if (selectedIds.size === 0) return;
    
    // Always show confirmation dialog for delete
    setShowDeleteConfirm(true);
  };

  const getTimeDisplay = (date: string) => {
    const emailDate = new Date(date);
    const now = new Date();
    const diffInHours =
      (now.getTime() - emailDate.getTime()) / (1000 * 60 * 60);

    if (diffInHours < 24) {
      return format(emailDate, "h:mm a");
    } else if (diffInHours < 48) {
      return "Yesterday";
    } else {
      return format(emailDate, "MMM d");
    }
  };

  if (!mailboxId && !isExternalSearch) {
    return (
      <div className="flex items-center justify-center h-full text-gray-400 bg-white dark:bg-[#111418]">
        <div className="text-center">
          <span className="material-symbols-outlined text-6xl text-gray-300 dark:text-gray-600 mb-4">
            mail
          </span>
          <p className="text-gray-500 dark:text-gray-400">
            Select a mailbox to view emails
          </p>
        </div>
      </div>
    );
  }

  if (isLoading || (isFetching && !data)) {
    return (
      <div className="w-full h-full bg-white dark:bg-[#111418]">
        <div className="p-4 space-y-2">
          {[1, 2, 3, 4, 5].map((i) => (
            <div
              key={i}
              className="h-20 bg-gray-100 dark:bg-[#283039] animate-pulse rounded"
            />
          ))}
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-col w-full h-full bg-white dark:bg-[#111418] border-r border-gray-200 dark:border-gray-700">
      {/* Search Results Header - shown when searching from header */}
      {isExternalSearch && (
        <div className="px-3 py-2 border-b border-gray-200 dark:border-gray-700 bg-blue-50 dark:bg-blue-900/20 flex items-center justify-between shrink-0">
          <div className="flex items-center gap-2 min-w-0">
            <span className="material-symbols-outlined text-blue-600 dark:text-blue-400 text-[20px]">
              search
            </span>
            <span className="text-sm font-medium text-blue-700 dark:text-blue-300 truncate">
              Kết quả cho: "{searchQuery}"
            </span>
            <span className="text-xs px-1.5 py-0.5 rounded-full bg-blue-100 dark:bg-blue-800 text-blue-600 dark:text-blue-300 shrink-0">
              {searchMode === "semantic" ? "✨ AI" : "🔤 Exact"}
            </span>
          </div>
          <Button
            variant="ghost"
            size="sm"
            className="h-7 px-2 text-xs text-blue-600 dark:text-blue-400 hover:bg-blue-100 dark:hover:bg-blue-900/30"
            onClick={onClearSearch}
          >
            <span className="material-symbols-outlined text-[16px] mr-1">close</span>
            Xóa
          </Button>
        </div>
      )}
      <div className="p-2 border-b border-gray-200 dark:border-gray-700 flex items-center justify-between gap-2 shrink-0">
        <div className="flex items-center gap-1">
          <input
            className="form-checkbox h-4 w-4 rounded bg-gray-100 dark:bg-[#283039] border-gray-300 dark:border-gray-600 text-primary focus:ring-primary focus:ring-offset-white dark:focus:ring-offset-[#111418] ml-2 cursor-pointer"
            type="checkbox"
            checked={
              selectedIds.size > 0 && selectedIds.size === filteredEmails.length
            }
            onChange={handleSelectAll}
          />
          <Button
            variant="ghost"
            size="icon"
            className="h-8 w-8 rounded-lg hover:bg-gray-100 dark:hover:bg-[#283039]"
            title="Làm mới"
            onClick={handleRefreshClick}
          >
            <span className="material-symbols-outlined text-gray-500 dark:text-gray-400 text-[20px]">
              refresh
            </span>
          </Button>
        </div>

        {/* Filter & Sort Dropdown */}
        <div className="relative" ref={filterDropdownRef}>
          <Button
            variant="ghost"
            size="sm"
            className={cn(
              "h-8 px-2 rounded-lg hover:bg-gray-100 dark:hover:bg-[#283039] text-xs flex items-center gap-1",
              (showUnreadOnly || showWithAttachmentsOnly) && "bg-blue-50 dark:bg-blue-900/20 text-blue-600 dark:text-blue-400"
            )}
            onClick={() => setShowFilterDropdown(!showFilterDropdown)}
          >
            <span className="material-symbols-outlined text-[18px]">tune</span>
            <span className="hidden sm:inline">Bộ lọc</span>
            {(showUnreadOnly || showWithAttachmentsOnly) && (
              <span className="w-4 h-4 rounded-full bg-blue-500 text-white text-[10px] flex items-center justify-center">
                {(showUnreadOnly ? 1 : 0) + (showWithAttachmentsOnly ? 1 : 0)}
              </span>
            )}
          </Button>

          {showFilterDropdown && (
            <div className="absolute top-full right-0 mt-1 z-50 bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-lg shadow-lg min-w-[200px] py-2">
              {/* Sort Section */}
              <div className="px-3 py-1 text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase">
                Sắp xếp
              </div>
              <button
                className={cn(
                  "w-full text-left px-3 py-2 text-sm flex items-center gap-2 hover:bg-gray-100 dark:hover:bg-gray-700",
                  sortOrder === "newest" && "text-blue-600 dark:text-blue-400 bg-blue-50 dark:bg-blue-900/20"
                )}
                onClick={() => setSortOrder("newest")}
              >
                <span className="material-symbols-outlined text-[18px]">arrow_downward</span>
                Mới nhất trước
                {sortOrder === "newest" && <span className="ml-auto">✓</span>}
              </button>
              <button
                className={cn(
                  "w-full text-left px-3 py-2 text-sm flex items-center gap-2 hover:bg-gray-100 dark:hover:bg-gray-700",
                  sortOrder === "oldest" && "text-blue-600 dark:text-blue-400 bg-blue-50 dark:bg-blue-900/20"
                )}
                onClick={() => setSortOrder("oldest")}
              >
                <span className="material-symbols-outlined text-[18px]">arrow_upward</span>
                Cũ nhất trước
                {sortOrder === "oldest" && <span className="ml-auto">✓</span>}
              </button>

              <div className="border-t border-gray-200 dark:border-gray-700 my-2" />

              {/* Filter Section */}
              <div className="px-3 py-1 text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase">
                Lọc theo
              </div>
              <button
                className={cn(
                  "w-full text-left px-3 py-2 text-sm flex items-center gap-2 hover:bg-gray-100 dark:hover:bg-gray-700",
                  showUnreadOnly && "text-blue-600 dark:text-blue-400 bg-blue-50 dark:bg-blue-900/20"
                )}
                onClick={() => setShowUnreadOnly(!showUnreadOnly)}
              >
                <span className="material-symbols-outlined text-[18px]">mark_email_unread</span>
                Chưa đọc
                {showUnreadOnly && <span className="ml-auto">✓</span>}
              </button>
              <button
                className={cn(
                  "w-full text-left px-3 py-2 text-sm flex items-center gap-2 hover:bg-gray-100 dark:hover:bg-gray-700",
                  showWithAttachmentsOnly && "text-blue-600 dark:text-blue-400 bg-blue-50 dark:bg-blue-900/20"
                )}
                onClick={() => setShowWithAttachmentsOnly(!showWithAttachmentsOnly)}
              >
                <span className="material-symbols-outlined text-[18px]">attach_file</span>
                Có đính kèm
                {showWithAttachmentsOnly && <span className="ml-auto">✓</span>}
              </button>

              {/* Clear Filters */}
              {(showUnreadOnly || showWithAttachmentsOnly) && (
                <>
                  <div className="border-t border-gray-200 dark:border-gray-700 my-2" />
                  <button
                    className="w-full text-left px-3 py-2 text-sm text-red-500 hover:bg-red-50 dark:hover:bg-red-900/20 flex items-center gap-2"
                    onClick={() => {
                      setShowUnreadOnly(false);
                      setShowWithAttachmentsOnly(false);
                    }}
                  >
                    <span className="material-symbols-outlined text-[18px]">filter_alt_off</span>
                    Xóa bộ lọc
                  </button>
                </>
              )}
            </div>
          )}
        </div>

        <div className="flex items-center gap-1">
          <Button
            variant="ghost"
            size="icon"
            className="h-8 w-8 rounded-lg hover:bg-gray-100 dark:hover:bg-[#283039]"
            title="Đánh dấu đã đọc"
            onClick={handleBulkMarkAsRead}
            disabled={selectedIds.size === 0}
          >
            <span className="material-symbols-outlined text-gray-500 dark:text-gray-400 text-[20px]">
              mark_email_read
            </span>
          </Button>
          <Button
            variant="ghost"
            size="icon"
            className="h-8 w-8 rounded-lg hover:bg-gray-100 dark:hover:bg-[#283039]"
            title="Xóa"
            onClick={handleBulkTrash}
            disabled={selectedIds.size === 0}
          >
            <span className="material-symbols-outlined text-gray-500 dark:text-gray-400 text-[20px]">
              delete
            </span>
          </Button>
        </div>
      </div>

      <div className="flex-1 overflow-y-auto scrollbar-thin">
        {filteredEmails.length === 0 ? (
          <div className="flex items-center justify-center h-full text-gray-400">
            <div className="text-center">
              <span className="material-symbols-outlined text-5xl text-gray-300 dark:text-gray-600 mb-4">
                inbox
              </span>
              <p className="text-gray-500 dark:text-gray-400 text-sm">
                No emails found
              </p>
            </div>
          </div>
        ) : (
          filteredEmails.map((email: Email, index: number) => {
            const isSelected = selectedEmailId === email.id;
            const isChecked = selectedIds.has(email.id);
            const showCheckbox = selectedIds.size > 0;
            const isLoadingStar =
              toggleStarMutation.isPending &&
              toggleStarMutation.variables === email.id;

            const isUnread = !email.is_read && !isSelected && !isChecked;
            const isFocused = focusedIndex === index;

            return (
              <div
                key={email.id}
                ref={(el) => { emailItemRefs.current[index] = el; }}
                onClick={() => {
                  setFocusedIndex(index);
                  onSelectEmail(email);
                }}
                className={cn(
                  "group flex items-start gap-3 p-3 border-b border-gray-200 dark:border-gray-700 cursor-pointer transition-colors",
                  isSelected || isChecked
                    ? "bg-primary/10 "
                    : "hover:bg-gray-50 dark:hover:bg-[#111418]",
                  isUnread
                    ? "bg-blue-50 dark:bg-blue-900/30 border-l-4 border-l-blue-500"
                    : "",
                  isFocused && !isSelected && "ring-2 ring-inset ring-blue-400 dark:ring-blue-500"
                )}
              >
                <div className="relative flex items-center justify-center shrink-0 w-10 h-10">
                  <div
                    className={cn(
                      "w-9 h-9 rounded-full bg-blue-100 dark:bg-blue-900/50 flex items-center justify-center text-blue-600 dark:text-blue-300 font-semibold text-sm absolute",
                      isSelected || isChecked || showCheckbox
                        ? "hidden"
                        : "group-hover:hidden"
                    )}
                  >
                    {(email.from_name || email.from || "?")
                      .replace(/['"]/g, "")
                      .trim()
                      .charAt(0)
                      .toUpperCase()}
                  </div>
                  <input
                    type="checkbox"
                    checked={isChecked}
                    onChange={() => handleToggleSelect(email.id)}
                    onClick={(e) => e.stopPropagation()}
                    className={cn(
                      "form-checkbox h-5 w-5 rounded bg-gray-100 dark:bg-[#283039] border-gray-300 dark:border-gray-600 text-primary focus:ring-primary focus:ring-offset-white dark:focus:ring-offset-[#111418] z-10 cursor-pointer",
                      isSelected || isChecked || showCheckbox
                        ? "block"
                        : "hidden group-hover:block"
                    )}
                  />
                </div>
                <div className="flex-1 overflow-hidden">
                  <div className="flex justify-between items-center mb-0.5">
                    <p
                      className={cn(
                        "text-sm truncate",
                        isSelected
                          ? "text-primary dark:text-blue-300 font-semibold"
                          : isUnread
                          ? "text-blue-700 dark:text-blue-200 font-bold"
                          : "text-gray-900 dark:text-white font-semibold"
                      )}
                    >
                      {email.subject || "(No Subject)"}
                    </p>
                    <span
                      className={cn(
                        "text-[11px] shrink-0 ml-2",
                        isSelected
                          ? "text-primary dark:text-blue-300"
                          : isUnread
                          ? "text-blue-300 dark:text-blue-200 font-bold"
                          : "text-gray-500 dark:text-gray-400"
                      )}
                    >
                      {getTimeDisplay(email.received_at)}
                    </span>
                  </div>
                  <p
                    className={cn(
                      "text-xs truncate font-medium mb-0.5",
                      isUnread
                        ? "text-blue-700 dark:text-blue-200 font-bold"
                        : "text-gray-600 dark:text-gray-300"
                    )}
                  >
                    {email.from_name || email.from}
                  </p>
                  <p className="text-xs text-gray-500 dark:text-gray-400 truncate">
                    {email.preview}
                  </p>
                </div>
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-8 w-8 rounded-full hover:bg-gray-200 dark:hover:bg-white/10 ml-1 shrink-0"
                  title="Bật/tắt dấu sao"
                  onClick={(e) => {
                    e.stopPropagation();
                    toggleStarMutation.mutate(email.id);
                  }}
                  disabled={isLoadingStar}
                >
                  {isLoadingStar ? (
                    <span className="material-symbols-outlined text-[18px] text-gray-400 dark:text-gray-500 animate-spin">
                      progress_activity
                    </span>
                  ) : (
                    <StarIcon
                      className={cn(
                        "size-7 cursor-pointer",
                        email.is_starred
                          ? "text-yellow-400 fill-yellow-400"
                          : "text-gray-400 fill-gray-400 dark:text-gray-500 dark:fill-gray-500"
                      )}
                    />
                  )}
                </Button>
              </div>
            );
          })
        )}
      </div>

      {/* Pagination */}
      <div className="p-2 border-t border-gray-200 dark:border-gray-700 flex items-center justify-between text-xs text-gray-500 dark:text-gray-400 bg-white dark:bg-[#111418]">
        <span>
          {offset + 1}-{Math.min(offset + ITEMS_PER_PAGE, total)} of {total}
        </span>
        <div className="flex items-center gap-1">
          <Button
            variant="ghost"
            size="icon"
            onClick={() => handlePageChange(currentPage - 1)}
            disabled={currentPage === 1}
            className="h-8 w-8 rounded"
          >
            <span className="material-symbols-outlined text-lg">
              chevron_left
            </span>
          </Button>
          <span className="px-1">
            {currentPage}/{totalPages}
          </span>
          <Button
            variant="ghost"
            size="icon"
            onClick={() => handlePageChange(currentPage + 1)}
            disabled={currentPage >= totalPages}
            className="h-8 w-8 rounded"
          >
            <span className="material-symbols-outlined text-lg">
              chevron_right
            </span>
          </Button>
        </div>
      </div>

      {/* Delete Confirmation Dialog */}
      <Dialog open={showDeleteConfirm} onOpenChange={setShowDeleteConfirm}>
        <DialogContent className="max-w-[320px] p-5">
          <DialogHeader className="pb-2">
            <div className="flex items-center gap-2">
              <div className={cn(
                "w-9 h-9 rounded-full flex items-center justify-center shrink-0",
                isInTrash ? "bg-red-100 dark:bg-red-900/30" : "bg-orange-100 dark:bg-orange-900/30"
              )}>
                <span className={cn(
                  "material-symbols-outlined text-xl",
                  isInTrash ? "text-red-600 dark:text-red-400" : "text-orange-600 dark:text-orange-400"
                )}>
                  {isInTrash ? "delete_forever" : "delete"}
                </span>
              </div>
              <DialogTitle className="text-base text-gray-900 dark:text-white">
                {isInTrash ? "Xóa email?" : "Chuyển vào thùng rác?"}
              </DialogTitle>
            </div>
          </DialogHeader>
          <DialogDescription className="text-sm text-gray-600 dark:text-gray-300">
            {isInTrash ? (
              <>Xóa <strong>{selectedIds.size} email</strong> khỏi danh sách?</>
            ) : (
              <>Chuyển <strong>{selectedIds.size} email</strong> vào thùng rác?</>
            )}
          </DialogDescription>
          <DialogFooter className="gap-2 pt-2">
            <Button
              variant="outline"
              size="sm"
              onClick={() => setShowDeleteConfirm(false)}
            >
              Hủy
            </Button>
            <Button
              variant={isInTrash ? "destructive" : "default"}
              size="sm"
              onClick={executeBulkTrash}
              className={isInTrash ? "bg-red-600 hover:bg-red-700" : ""}
            >
              {isInTrash ? "Xóa" : "Chuyển"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
