import { useState, useRef, useEffect } from "react";
import { useQuery } from "@tanstack/react-query";
import { useAppSelector } from "@/store/hooks";
import { emailService } from "@/services/email.service";
import type { Mailbox } from "@/types/email";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";

interface MailboxListProps {
  selectedMailboxId: string | null;
  onSelectMailbox: (id: string) => void;
  onComposeClick?: () => void;
  onLogout?: () => void;
  theme: "light" | "dark";
  onToggleTheme: () => void;
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
    default:
      return name;
  }
};

export default function MailboxList({
  selectedMailboxId,
  onSelectMailbox,
  onComposeClick,
  onLogout,
  theme,
  onToggleTheme,
}: MailboxListProps) {
  const user = useAppSelector((state) => state.auth.user);
  const [isUserMenuOpen, setIsUserMenuOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);

  const { data: mailboxes = [], isLoading } = useQuery({
    queryKey: ["mailboxes"],
    queryFn: emailService.getAllMailboxes,
  });

  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (menuRef.current && !menuRef.current.contains(event.target as Node)) {
        setIsUserMenuOpen(false);
      }
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => {
      document.removeEventListener("mousedown", handleClickOutside);
    };
  }, []);

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
      {/* User Profile & Menu */}
      <div className="relative shrink-0" ref={menuRef}>
        <Button
          variant="ghost"
          onClick={() => setIsUserMenuOpen(!isUserMenuOpen)}
          className="flex items-center justify-between gap-2 w-full hover:bg-gray-200 dark:hover:bg-white/5 p-1.5 h-auto rounded-lg transition-colors text-left group shadow-none"
        >
          <div className="flex items-center gap-2 min-w-0">
            <div
              className="bg-center bg-no-repeat aspect-square bg-cover rounded-full size-8 shrink-0"
              style={{
                backgroundImage: `url("${
                  user?.avatar_url ||
                  "https://lh3.googleusercontent.com/aida-public/AB6AXuDRNQSlv4je28jMHI0WjXZhE5xKv7aSQKNqKhtFzfV3noDp7AgOUk9Hz5vby11yRlctZmQJOUwfeApOcQV9Yt"
                }")`,
              }}
            ></div>
            <div className="flex flex-col min-w-0 items-start">
              <h1 className="text-gray-900 dark:text-white text-sm font-medium leading-normal truncate">
                Email Client AI
              </h1>
              <p className="text-gray-500 dark:text-[#9dabb9] text-xs font-normal leading-normal truncate">
                {user?.email || "user@email.com"}
              </p>
            </div>
          </div>
          <span className="material-symbols-outlined text-gray-500 group-hover:text-gray-900 dark:group-hover:text-white transition-colors text-lg">
            expand_more
          </span>
        </Button>

        {/* Dropdown Menu */}
        {isUserMenuOpen && (
          <div className="absolute top-full left-0 w-full mt-1 bg-white dark:bg-[#283039] rounded-lg shadow-xl border border-gray-200 dark:border-gray-700 z-50 overflow-hidden animate-in fade-in zoom-in-95 duration-100">
            <Button
              variant="ghost"
              onClick={onToggleTheme}
              className="w-full px-3 py-2 justify-start h-auto text-left text-gray-700 dark:text-white hover:bg-gray-100 dark:hover:bg-white/10 flex items-center gap-2 transition-colors text-sm rounded-none"
            >
              <span className="material-symbols-outlined text-gray-500 dark:text-gray-400 text-lg">
                {theme === "dark" ? "light_mode" : "dark_mode"}
              </span>
              <span>{theme === "dark" ? "Chế độ sáng" : "Chế độ tối"}</span>
            </Button>
            <Button
              variant="ghost"
              onClick={() => toast.info("Tính năng đang phát triển")}
              className="w-full px-3 py-2 justify-start h-auto text-left text-gray-700 dark:text-white hover:bg-gray-100 dark:hover:bg-white/10 flex items-center gap-2 transition-colors text-sm rounded-none"
            >
              <span className="material-symbols-outlined text-gray-500 dark:text-gray-400 text-lg">
                settings
              </span>
              <span>Cài đặt</span>
            </Button>
            <div className="h-px bg-gray-200 dark:bg-gray-700 mx-2"></div>
            <Button
              variant="ghost"
              onClick={onLogout}
              className="w-full px-3 py-2 justify-start h-auto text-left text-red-500 dark:text-red-400 hover:bg-gray-100 dark:hover:bg-white/10 flex items-center gap-2 transition-colors text-sm rounded-none"
            >
              <span className="material-symbols-outlined text-lg">logout</span>
              <span>Đăng xuất</span>
            </Button>
          </div>
        )}
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
