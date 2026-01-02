import EmailDetail from "@/components/inbox/EmailDetail";
import type { Theme } from "@/hooks/useTheme";

interface EmailDetailPopupProps {
  emailId: string;
  onClose: () => void;
  theme: Theme;
  summary?: string;
  isSummaryLoading?: boolean;
}

/**
 * Modal popup to display email detail with AI summary
 * Used in Kanban page to show email content without navigating away
 */
export default function EmailDetailPopup({
  emailId,
  onClose,
  theme,
  summary,
  isSummaryLoading = false,
}: EmailDetailPopupProps) {
  /**
   * Render summary line with proper styling based on content type
   */
  const renderSummaryLine = (line: string, idx: number) => {
    // Highlight action items with colored badges
    if (line.includes("📌 Cần làm:")) {
      return (
        <div
          key={idx}
          className="flex items-start gap-2 bg-orange-50 dark:bg-orange-900/30 p-2 rounded-lg border border-orange-200 dark:border-orange-800"
        >
          <span className="text-orange-500 dark:text-orange-400 font-semibold whitespace-nowrap">
            📌 Cần làm:
          </span>
          <span className="text-orange-700 dark:text-orange-300">
            {line.replace("📌 Cần làm:", "").trim()}
          </span>
        </div>
      );
    }

    if (line.includes("📅 Deadline:")) {
      return (
        <div
          key={idx}
          className="flex items-start gap-2 bg-red-50 dark:bg-red-900/30 p-2 rounded-lg border border-red-200 dark:border-red-800"
        >
          <span className="text-red-500 dark:text-red-400 font-semibold whitespace-nowrap">
            📅 Deadline:
          </span>
          <span className="text-red-700 dark:text-red-300">
            {line.replace("📅 Deadline:", "").trim()}
          </span>
        </div>
      );
    }

    if (line.includes("💡 Lưu ý:")) {
      return (
        <div
          key={idx}
          className="flex items-start gap-2 bg-yellow-50 dark:bg-yellow-900/30 p-2 rounded-lg border border-yellow-200 dark:border-yellow-800"
        >
          <span className="text-yellow-600 dark:text-yellow-400 font-semibold whitespace-nowrap">
            💡 Lưu ý:
          </span>
          <span className="text-yellow-700 dark:text-yellow-300">
            {line.replace("💡 Lưu ý:", "").trim()}
          </span>
        </div>
      );
    }

    // Regular summary text
    return line.trim() ? (
      <p key={idx} className="text-gray-800 dark:text-gray-200">
        {line}
      </p>
    ) : null;
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/30 backdrop-blur-sm p-4">
      <div className="bg-white dark:bg-gray-900 rounded-xl shadow-2xl max-w-4xl w-full max-h-[90vh] flex flex-col relative overflow-hidden border border-gray-200 dark:border-gray-800">
        {/* Close Button */}
        <div className="absolute top-4 right-4 z-10">
          <button
            className="px-3 py-1.5 rounded-md bg-gray-100 dark:bg-gray-800 hover:bg-gray-200 dark:hover:bg-gray-700 text-sm font-medium transition-colors border border-gray-200 dark:border-gray-700"
            onClick={onClose}
          >
            ✕ Đóng
          </button>
        </div>

        {/* Content */}
        <div className="overflow-y-auto p-6 custom-scrollbar">
          <EmailDetail
            emailId={emailId}
            onToggleStar={() => {}}
            theme={theme}
          />

          {/* AI Summary Section */}
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
                <div className="text-sm leading-relaxed space-y-2">
                  {summary ? (
                    summary.split("\n").map(renderSummaryLine)
                  ) : (
                    <span className="text-gray-500">
                      Không thể tạo tóm tắt cho email này.
                    </span>
                  )}
                </div>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
