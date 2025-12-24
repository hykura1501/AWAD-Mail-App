import { useState, useEffect, useRef } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { emailService } from "@/services/email.service";
import { getFromCache, saveToCache } from "@/lib/db";
import type { Email, EmailsResponse } from "@/types/email";
import { cn } from "@/lib/utils";
import { format } from "date-fns";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import StarIcon from "@/assets/star.svg?react";

interface EmailListProps {
  mailboxId: string | null;
  selectedEmailId: string | null;
  onSelectEmail: (email: Email) => void;
  onToggleStar: (emailId: string) => void;
  searchQuery?: string; // External search query from header
  onClearSearch?: () => void; // Callback to clear search
}

const ITEMS_PER_PAGE = 20;

export default function EmailList({
  mailboxId,
  selectedEmailId,
  onSelectEmail,
  searchQuery,
  onClearSearch,
}: EmailListProps) {
  const [internalSearchQuery, setInternalSearchQuery] = useState("");
  const [debouncedInternalSearch, setDebouncedInternalSearch] = useState("");
  const [currentPage, setCurrentPage] = useState(1);
  const [cachedData, setCachedData] = useState<EmailsResponse | null>(null);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
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

  const { data, isLoading, isFetching, refetch } = useQuery({
    queryKey: isExternalSearch 
      ? ["search", searchQuery, offset] 
      : ["emails", mailboxId, offset, debouncedInternalSearch],
    queryFn: async () => {
      let result: EmailsResponse;
      if (isExternalSearch) {
        // Use semantic search for external search query
        result = await emailService.semanticSearch(
          searchQuery!,
          ITEMS_PER_PAGE,
          offset
        );
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
    enabled: !!mailboxId || isExternalSearch,
    placeholderData: cachedData ?? undefined,
  });

  const emails = data?.emails || [];
  const total = data?.total || 0;
  const totalPages = Math.ceil(total / ITEMS_PER_PAGE);

  // Client-side filtering is no longer needed as we do server-side search
  const filteredEmails = emails;

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
      }, 0);
    }
  }, [mailboxId]);

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
        <div className="flex items-center gap-1">
          <Button
            variant="ghost"
            size="icon"
            className="h-8 w-8 rounded-lg hover:bg-gray-100 dark:hover:bg-[#283039]"
            title="Đánh dấu đã đọc"
            onClick={() => toast.info("Tính năng đang phát triển")}
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
            onClick={() => toast.info("Tính năng đang phát triển")}
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
          filteredEmails.map((email: Email) => {
            const isSelected = selectedEmailId === email.id;
            const isChecked = selectedIds.has(email.id);
            const showCheckbox = selectedIds.size > 0;
            const isLoadingStar =
              toggleStarMutation.isPending &&
              toggleStarMutation.variables === email.id;

            const isUnread = !email.is_read && !isSelected && !isChecked;

            return (
              <div
                key={email.id}
                onClick={() => onSelectEmail(email)}
                className={cn(
                  "group flex items-start gap-3 p-3 border-b border-gray-200 dark:border-gray-700 cursor-pointer transition-colors",
                  isSelected || isChecked
                    ? "bg-primary/10 "
                    : "hover:bg-gray-50 dark:hover:bg-[#111418]",
                  isUnread
                    ? "bg-blue-50 dark:bg-blue-900/30 border-l-4 border-l-blue-500"
                    : ""
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
    </div>
  );
}
