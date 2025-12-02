import { useState, useEffect, useRef } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { emailService } from "@/services/email.service";
import { getFromCache, saveToCache } from "@/lib/db";
import type { Email, EmailsResponse } from "@/types/email";
import { cn } from "@/lib/utils";
import { format } from "date-fns";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";

interface EmailListProps {
  mailboxId: string | null;
  selectedEmailId: string | null;
  onSelectEmail: (email: Email) => void;
  onToggleStar: (emailId: string) => void;
}

const ITEMS_PER_PAGE = 20;

export default function EmailList({
  mailboxId,
  selectedEmailId,
  onSelectEmail,
}: EmailListProps) {
  const [searchQuery, setSearchQuery] = useState("");
  const [debouncedSearchQuery, setDebouncedSearchQuery] = useState("");
  const [currentPage, setCurrentPage] = useState(1);
  const [cachedData, setCachedData] = useState<EmailsResponse | null>(null);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const queryClient = useQueryClient();
  const offset = (currentPage - 1) * ITEMS_PER_PAGE;
  const cacheKey = `emails-${mailboxId}-${offset}-${debouncedSearchQuery}`;

  useEffect(() => {
    const timer = setTimeout(() => {
      setDebouncedSearchQuery(searchQuery);
      setCurrentPage(1); // Reset to page 1 on search
    }, 500);
    return () => clearTimeout(timer);
  }, [searchQuery]);

  useEffect(() => {
    if (mailboxId) {
      getFromCache(cacheKey).then((data) => {
        if (data) setCachedData(data);
      });
    }
  }, [cacheKey, mailboxId]);

  const { data, isLoading, isFetching, refetch } = useQuery({
    queryKey: ["emails", mailboxId, offset, debouncedSearchQuery],
    queryFn: async () => {
      const result = await emailService.getEmailsByMailbox(
        mailboxId!,
        ITEMS_PER_PAGE,
        offset,
        debouncedSearchQuery
      );
      saveToCache(cacheKey, result);
      return result;
    },
    enabled: !!mailboxId,
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
        setSearchQuery("");
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
    onMutate: async (emailId) => {
      // Cancel outgoing queries to prevent overwriting optimistic update
      await queryClient.cancelQueries({ queryKey: ["emails"] });
      await queryClient.cancelQueries({ queryKey: ["email", emailId] });
      
      const previousData = queryClient.getQueryData(["emails", mailboxId, offset, debouncedSearchQuery]);

      // Update all email list caches (including current page)
      queryClient.setQueriesData<EmailsResponse>(
        { queryKey: ["emails"] },
        (old) => {
          if (!old) return old;
          return {
            ...old,
            emails: old.emails.map((email: Email) =>
              email.id === emailId
                ? { ...email, is_starred: !email.is_starred }
                : email
            ),
          };
        }
      );

      // Update email detail cache
      queryClient.setQueryData<Email>(
        ["email", emailId],
        (old) => {
          if (!old) return old;
          return {
            ...old,
            is_starred: !old.is_starred,
          };
        }
      );

      return { previousData, emailId };
    },
    onError: (_err, emailId, context) => {
      // Restore previous data on error
      if (context?.previousData) {
        queryClient.setQueryData(
          ["emails", mailboxId, offset, debouncedSearchQuery],
          context.previousData
        );
      }
      toast.error("Không thể cập nhật trạng thái đánh dấu sao");
      // Refetch all to restore correct state
      queryClient.invalidateQueries({ queryKey: ["emails"] });
      queryClient.invalidateQueries({ queryKey: ["email", emailId] });
    },
    // Don't use onSettled - let the optimistic update persist
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

  if (!mailboxId) {
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
      <div className="p-3 border-b border-gray-200 dark:border-gray-700 shrink-0">
        <label className="flex flex-col min-w-40 h-9 w-full">
          <div className="flex w-full flex-1 items-stretch rounded-lg h-full">
            <div className="text-gray-500 dark:text-[#9dabb9] flex border-none bg-gray-100 dark:bg-[#283039] items-center justify-center pl-3 pr-2 rounded-l-lg">
              <span className="material-symbols-outlined text-[20px]">
                search
              </span>
            </div>
            <input
              className="form-input flex w-full min-w-0 flex-1 resize-none overflow-hidden rounded-r-lg text-gray-900 dark:text-white focus:outline-0 focus:ring-0 border-none bg-gray-100 dark:bg-[#283039] h-full placeholder:text-gray-400 dark:placeholder:text-[#9dabb9] px-2 text-sm font-normal leading-normal"
              placeholder="Tìm kiếm trong Hộp thư đến"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
            />
          </div>
        </label>
      </div>

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
            
            // Check if this email is being toggled
            const isTogglingThis = toggleStarMutation.isPending && toggleStarMutation.variables === email.id;

            return (
              <div
                key={email.id}
                onClick={() => onSelectEmail(email)}
                className={cn(
                  "group flex items-start gap-3 p-3 border-b border-gray-200 dark:border-gray-700 cursor-pointer transition-colors",
                  isSelected || isChecked
                    ? "bg-primary/10 border-l-2 border-l-primary"
                    : "hover:bg-gray-50 dark:hover:bg-[#111418]",
                  !email.is_read && !isSelected && !isChecked
                    ? "bg-gray-50 dark:bg-[#1a222d]"
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
                        "text-sm font-semibold truncate",
                        isSelected
                          ? "text-primary dark:text-blue-300"
                          : "text-gray-900 dark:text-white"
                      )}
                    >
                      {email.subject || "(No Subject)"}
                    </p>
                    <span
                      className={cn(
                        "text-[11px] shrink-0 ml-2",
                        isSelected
                          ? "text-primary dark:text-blue-300"
                          : "text-gray-500 dark:text-gray-400"
                      )}
                    >
                      {getTimeDisplay(email.received_at)}
                    </span>
                  </div>
                  <p className="text-xs text-gray-600 dark:text-gray-300 truncate font-medium mb-0.5">
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
                  disabled={isTogglingThis}
                >
                  {isTogglingThis ? (
                    <span className="material-symbols-outlined text-[18px] text-gray-400 dark:text-gray-500 animate-spin">
                      progress_activity
                    </span>
                  ) : (
                    <span
                      className={cn(
                        "material-symbols-outlined text-[18px] [font-variation-settings:'wght'_300]",
                        email.is_starred
                          ? "filled text-yellow-400"
                          : "text-gray-400 dark:text-gray-500"
                      )}
                    >
                      star
                    </span>
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
