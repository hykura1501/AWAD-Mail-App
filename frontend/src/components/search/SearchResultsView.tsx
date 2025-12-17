import { Loader2, AlertCircle, Inbox, Paperclip } from "lucide-react";
import type { Email } from "@/types/email";

interface SearchResultsViewProps {
  query: string;
  results: Email[];
  isLoading: boolean;
  error: string | null;
  onBack: () => void;
  onEmailClick: (emailId: string) => void;
}

export default function SearchResultsView({
  results,
  isLoading,
  error,
  onBack,
  onEmailClick,
}: SearchResultsViewProps) {
  // Strip HTML tags for preview
  const stripHtml = (html: string) => {
    const tmp = document.createElement("div");
    tmp.innerHTML = html;
    return tmp.textContent || tmp.innerText || "";
  };

  const formatDate = (dateStr: string) => {
    const date = new Date(dateStr);
    const now = new Date();
    const diffDays = Math.floor(
      (now.getTime() - date.getTime()) / (1000 * 60 * 60 * 24)
    );

    if (diffDays === 0) {
      return date.toLocaleTimeString("vi-VN", {
        hour: "2-digit",
        minute: "2-digit",
      });
    } else if (diffDays < 7) {
      return date.toLocaleDateString("vi-VN", { weekday: "short" });
    } else {
      return date.toLocaleDateString("vi-VN", {
        day: "2-digit",
        month: "2-digit",
      });
    }
  };

  return (
    <div className="flex flex-col h-full bg-white dark:bg-gray-900">
      {/* Content */}
      <div className="flex-1 overflow-auto">
        {/* Loading State */}
        {isLoading && (
          <div className="flex flex-col items-center justify-center h-64 text-gray-500">
            <Loader2 className="h-10 w-10 animate-spin mb-4 text-blue-500" />
            <p>Đang tìm kiếm...</p>
          </div>
        )}

        {/* Error State */}
        {error && !isLoading && (
          <div className="flex flex-col items-center justify-center h-64 text-red-500">
            <AlertCircle className="h-10 w-10 mb-4" />
            <p className="font-medium">Có lỗi xảy ra</p>
            <p className="text-sm text-gray-500">{error}</p>
            <button
              onClick={onBack}
              className="mt-4 px-4 py-2 bg-gray-100 dark:bg-gray-800 rounded-lg hover:bg-gray-200 dark:hover:bg-gray-700 transition-colors"
            >
              Quay lại
            </button>
          </div>
        )}

        {/* Empty State */}
        {!isLoading && !error && results.length === 0 && (
          <div className="flex flex-col items-center justify-center h-64 text-gray-500">
            <Inbox className="h-12 w-12 mb-4" />
            <p className="font-medium">Không tìm thấy kết quả</p>
            <p className="text-sm">Thử tìm kiếm với từ khóa khác</p>
          </div>
        )}

        {/* Results */}
        {!isLoading && !error && results.length > 0 && (
          <div className="divide-y divide-gray-100 dark:divide-gray-800">
            {results.map((email) => (
              <div
                key={email.id}
                onClick={() => onEmailClick(email.id)}
                className={`px-4 py-3 hover:bg-gray-50 dark:hover:bg-gray-800/50 cursor-pointer transition-colors ${
                  !email.is_read ? "bg-blue-50/50 dark:bg-blue-900/10" : ""
                }`}
              >
                <div className="flex items-start gap-3">
                  {/* Avatar */}
                  <div className="w-10 h-10 rounded-full bg-gradient-to-br from-blue-400 to-blue-600 flex items-center justify-center text-white font-medium shrink-0">
                    {(email.from_name || email.from).charAt(0).toUpperCase()}
                  </div>

                  {/* Content */}
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center justify-between gap-2 mb-1">
                      <span
                        className={`text-sm truncate ${
                          !email.is_read
                            ? "font-semibold text-gray-900 dark:text-white"
                            : "text-gray-700 dark:text-gray-300"
                        }`}
                      >
                        {email.from_name || email.from}
                      </span>
                      <span className="text-xs text-gray-500 dark:text-gray-400 shrink-0">
                        {formatDate(email.received_at)}
                      </span>
                    </div>

                    <h3
                      className={`text-sm mb-1 truncate ${
                        !email.is_read
                          ? "font-semibold text-gray-900 dark:text-white"
                          : "text-gray-800 dark:text-gray-200"
                      }`}
                    >
                      {email.subject || "(Không có tiêu đề)"}
                    </h3>

                    <p className="text-xs text-gray-500 dark:text-gray-400 line-clamp-2">
                      {stripHtml(email.preview || email.body || "")}
                    </p>

                    {/* Attachments indicator */}
                    {email.attachments && email.attachments.length > 0 && (
                      <div className="flex items-center gap-1 mt-1 text-gray-500">
                        <Paperclip className="h-3 w-3" />
                        <span className="text-xs">
                          {email.attachments.length} tệp đính kèm
                        </span>
                      </div>
                    )}
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
