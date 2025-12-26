import { X, Clock, ChevronLeft, ChevronRight } from "lucide-react";
import type { Email } from "@/types/email";

interface SnoozedDrawerProps {
  isOpen: boolean;
  onClose: () => void;
  emails: Email[];
  onUnsnooze: (emailId: string) => void;
  onEmailClick?: (emailId: string) => void;
  offset?: number;
  limit?: number;
  onPageChange?: (dir: 1 | -1) => void;
}

// Helper to get clean sender name
function getSenderName(email: Email): string {
  if (email.from_name) {
    return email.from_name.replace(/^["']|["']$/g, '').trim();
  }
  const from = email.from || "";
  const match = from.match(/^["']?([^"'<]+)["']?\s*<.*>$/);
  if (match) {
    return match[1].trim();
  }
  return from.replace(/^["']|["']$/g, '').trim();
}

// Helper to strip HTML
function stripHtml(html: string): string {
  const tmp = document.createElement("DIV");
  tmp.innerHTML = html;
  return tmp.textContent || tmp.innerText || "";
}

function getCleanPreview(email: Email): string {
  const text = email.preview || email.body || "";
  return stripHtml(text).slice(0, 80);
}

// Format snooze expiration time in a user-friendly way
function formatSnoozeTime(snoozedUntil: string | undefined): string | null {
  if (!snoozedUntil) return null;
  
  const snoozeDate = new Date(snoozedUntil);
  const now = new Date();
  
  // If snooze time has passed, don't show anything
  if (snoozeDate <= now) return null;
  
  const diffMs = snoozeDate.getTime() - now.getTime();
  const diffMins = Math.floor(diffMs / 60000);
  const diffHours = Math.floor(diffMs / 3600000);
  const diffDays = Math.floor(diffMs / 86400000);
  
  // Format time
  const timeStr = snoozeDate.toLocaleTimeString("vi-VN", { 
    hour: "2-digit", 
    minute: "2-digit",
    hour12: false 
  });
  
  if (diffDays === 0) {
    if (diffHours < 1) {
      return `Trở lại trong ${diffMins} phút`;
    }
    return `Trở lại lúc ${timeStr} hôm nay`;
  } else if (diffDays === 1) {
    return `Trở lại lúc ${timeStr} ngày mai`;
  } else {
    const dateStr = snoozeDate.toLocaleDateString("vi-VN", {
      day: "2-digit",
      month: "2-digit"
    });
    return `Trở lại lúc ${timeStr} ngày ${dateStr}`;
  }
}

export default function SnoozedDrawer({
  isOpen,
  onClose,
  emails,
  onUnsnooze,
  onEmailClick,
  offset = 0,
  limit = 20,
  onPageChange,
}: SnoozedDrawerProps) {
  const currentPage = Math.floor(offset / limit) + 1;

  return (
    <>
      {/* Backdrop */}
      <div
        className={`fixed inset-0 bg-black/30 backdrop-blur-sm z-40 transition-opacity duration-300 ${
          isOpen ? "opacity-100" : "opacity-0 pointer-events-none"
        }`}
        onClick={onClose}
      />

      {/* Drawer */}
      <div
        className={`fixed top-0 right-0 h-full w-full max-w-md bg-white dark:bg-[#1A1D21] shadow-2xl z-50 transform transition-transform duration-300 ease-out ${
          isOpen ? "translate-x-0" : "translate-x-full"
        }`}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-gray-200 dark:border-gray-700">
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 rounded-full bg-orange-100 dark:bg-orange-900/30 flex items-center justify-center">
              <Clock className="w-4 h-4 text-orange-500" />
            </div>
            <div>
              <h2 className="text-lg font-semibold text-gray-900 dark:text-white">
                Snoozed
              </h2>
              <p className="text-xs text-gray-500 dark:text-gray-400">
                {emails.length} email đang tạm ẩn
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-2 hover:bg-gray-100 dark:hover:bg-gray-800 rounded-lg transition-colors"
          >
            <X className="w-5 h-5 text-gray-500 dark:text-gray-400" />
          </button>
        </div>

        {/* Email List */}
        <div className="flex-1 overflow-y-auto h-[calc(100%-8rem)] p-4 space-y-3">
          {emails.length === 0 ? (
            <div className="flex flex-col items-center justify-center h-full text-center">
              <Clock className="w-12 h-12 text-gray-300 dark:text-gray-600 mb-3" />
              <p className="text-gray-500 dark:text-gray-400">
                Không có email nào đang tạm ẩn
              </p>
            </div>
          ) : (
            emails.map((email) => (
              <div
                key={email.id}
                className="group relative flex flex-col gap-2 rounded-xl border p-4 shadow-sm transition-all duration-200 bg-gray-50 dark:bg-[#0f1724] border-gray-100 dark:border-gray-800 hover:shadow-md hover:border-orange-200 dark:hover:border-orange-900/30 cursor-pointer"
                onClick={() => onEmailClick?.(email.id)}
              >
                <div className="flex justify-between items-start gap-2">
                  <div className="text-xs font-medium text-gray-500 dark:text-gray-400 truncate flex-1">
                    {getSenderName(email)}
                  </div>
                  <div className="text-[10px] text-gray-400 font-medium whitespace-nowrap shrink-0">
                    {new Date(email.received_at).toLocaleDateString()}
                  </div>
                </div>

                <div className="text-sm font-medium text-gray-800 dark:text-gray-200 leading-tight">
                  {email.subject}
                </div>

                <div className="text-xs text-gray-500 dark:text-gray-400 line-clamp-2 leading-relaxed">
                  {getCleanPreview(email)}
                </div>

                {/* Snooze Time Display */}
                {formatSnoozeTime(email.snoozed_until) && (
                  <div className="flex items-center gap-1.5 mt-1 text-[11px] text-orange-600 dark:text-orange-400">
                    <Clock className="w-3 h-3" />
                    <span>{formatSnoozeTime(email.snoozed_until)}</span>
                  </div>
                )}

                {/* Unsnooze Button */}
                <div className="mt-2 pt-2 border-t border-gray-100 dark:border-gray-800/50">
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      onUnsnooze(email.id);
                    }}
                    className="w-full py-1.5 px-3 rounded-lg text-xs font-medium bg-green-100 dark:bg-green-900/20 text-green-600 dark:text-green-400 hover:bg-green-200 dark:hover:bg-green-900/30 transition-colors"
                  >
                    Unsnooze
                  </button>
                </div>
              </div>
            ))
          )}
        </div>

        {/* Pagination Footer */}
        {emails.length > 0 && (
          <div className="absolute bottom-0 left-0 right-0 px-5 py-3 border-t border-gray-200 dark:border-gray-700 bg-white dark:bg-[#1A1D21] flex items-center justify-center gap-3">
            <button
              className="p-2 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-800 disabled:opacity-30 transition-colors"
              disabled={offset === 0}
              onClick={() => onPageChange?.(-1)}
            >
              <ChevronLeft className="w-4 h-4 text-gray-600 dark:text-gray-300" />
            </button>
            <span className="text-sm font-medium text-gray-500 tabular-nums">
              Trang {currentPage}
            </span>
            <button
              className="p-2 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-800 disabled:opacity-30 transition-colors"
              disabled={emails.length < limit}
              onClick={() => onPageChange?.(1)}
            >
              <ChevronRight className="w-4 h-4 text-gray-600 dark:text-gray-300" />
            </button>
          </div>
        )}
      </div>
    </>
  );
}
