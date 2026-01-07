import { useQuery } from "@tanstack/react-query";
import { useAppSelector } from "@/store/hooks";
import { emailService } from "@/services/email.service";
import type { Mailbox } from "@/types/email";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import AccountMenu from "@/components/common/AccountMenu";

interface MailboxListProps {
  selectedMailboxId: string | null;
  onSelectMailbox: (id: string) => void;
  onComposeClick?: () => void;
  onNavigateToTasks?: () => void;
}

const getMailboxIconName = (type: string) => {
  switch (type) {
    case "inbox":
      return "inbox";
    case "starred":
      return "star";
    case "sent":
      return "send";
    case "draft":
      return "draft";
    case "archive":
      return "archive";
    case "trash":
      return "delete";
    case "unread":
      return "mark_email_unread";
    case "chat":
      return "chat";
    case "important":
      return "label_important";
    case "spam":
      return "report";
    case "category_promotions":
      return "local_offer";
    case "category_social":
      return "people";
    case "category_updates":
      return "update";
    case "category_forums":
      return "forum";
    case "category_personal":
      return "person";
    case "all":
      return "mail";
    default:
      return "inbox";
  }
};

const getMailboxLabel = (type: string, name: string) => {
  switch (type) {
    case "inbox":
      return "Hộp thư đến";
    case "starred":
      return "Đã gắn dấu sao";
    case "sent":
      return "Đã gửi";
    case "drafts":
      return "Bản nháp";
    case "archive":
      return "Lưu trữ";
    case "trash":
      return "Thùng rác";
    case "unread":
      return "Chưa đọc";
    case "chat":
      return "Trò chuyện";
    case "important":
      return "Quan trọng";
    case "draft":
      return "Bản nháp";
    case "spam":
      return "Thư rác";
    case "category_promotions":
      return "Khuyến mãi";
    case "category_social":
      return "Mạng xã hội";
    case "category_updates":
      return "Cập nhật";
    case "category_forums":
      return "Diễn đàn";
    case "category_personal":
      return "Cá nhân";
    case "all":
      return "Tất cả thư";
    default:
      return name;
  }
};

export default function MailboxList({
  selectedMailboxId,
  onSelectMailbox,
  onComposeClick,
  onNavigateToTasks,
}: MailboxListProps) {
  const user = useAppSelector((state) => state.auth.user);

  const { data: mailboxes = [], isLoading } = useQuery({
    queryKey: ["mailboxes"],
    queryFn: emailService.getAllMailboxes,
  });

  if (isLoading) {
    return (
      <div className="w-full h-full bg-gray-50 dark:bg-[#111418]">
        <div className="p-3 space-y-2">
          {[1, 2, 3, 4, 5].map((i) => (
            <div
              key={i}
              className="h-8 bg-gray-200 dark:bg-[#283039] animate-pulse rounded"
            />
          ))}
        </div>
      </div>
    );
  }

  return (
    <aside className="flex h-full w-full flex-col bg-gray-50 dark:bg-[#111418] p-3 shrink-0 transition-colors duration-200">
      {/* User Profile & Menu - Now using internal hook, no props needed */}
      <div className="shrink-0">
        <AccountMenu
          user={user}
          showFullProfile={true}
          onNavigateToTasks={onNavigateToTasks}
        />
      </div>

      {/* Mailbox List */}
      <div className="flex flex-col gap-0.5 mt-3 flex-1 overflow-y-auto min-h-0 scrollbar-thin">
        {mailboxes.map((mailbox: Mailbox) => {
          const iconName = getMailboxIconName(mailbox.type);
          const isSelected = selectedMailboxId === mailbox.id;
          const label = getMailboxLabel(mailbox.type, mailbox.name);

          return (
            <Button
              variant="ghost"
              key={mailbox.id}
              onClick={() => onSelectMailbox(mailbox.id)}
              className={cn(
                "flex items-center justify-between gap-2 px-2.5 py-1.5 h-auto rounded-lg text-left cursor-pointer",
                isSelected
                  ? "bg-blue-50 text-blue-700 dark:bg-blue-900/30 dark:text-blue-300 hover:bg-blue-100 dark:hover:bg-blue-900/40"
                  : "hover:bg-gray-100 dark:hover:bg-white/5 text-black dark:text-gray-300"
              )}
            >
              <div className="flex items-center gap-2.5">
                <span
                  className={cn(
                    "material-symbols-outlined text-sm [font-variation-settings:'wght'_300]",
                    isSelected
                      ? "text-primary dark:text-blue-300"
                      : "text-gray-700 dark:text-gray-400"
                  )}
                >
                  {iconName}
                </span>
                <p className="text-sm font-normal leading-normal">{label}</p>
              </div>
              {mailbox.count > 0 && (
                <span
                  className={cn(
                    "text-[10px] font-semibold px-1.5 py-0.5 rounded-full",
                    isSelected
                      ? "bg-primary text-white"
                      : "bg-gray-200 text-gray-600 dark:bg-[#283039] dark:text-[#9dabb9]"
                  )}
                >
                  {mailbox.count}
                </span>
              )}
            </Button>
          );
        })}
      </div>

      {/* Compose Button */}
      <div className="mt-3 pt-3 border-t border-gray-200 dark:border-gray-800 shrink-0">
        <Button
          onClick={onComposeClick}
          className="w-full cursor-pointer justify-center overflow-hidden rounded-lg h-9 px-3 bg-primary text-white text-sm font-bold leading-normal tracking-[0.015em] hover:bg-blue-600 transition-colors shadow-lg shadow-blue-900/20"
        >
          <span className="material-symbols-outlined mr-2 text-lg">edit</span>
          <span className="truncate">Soạn thư</span>
        </Button>
      </div>
    </aside>
  );
}
