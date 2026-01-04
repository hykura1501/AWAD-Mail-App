import type { Email } from "@/types/email";

interface SummaryState {
  summary: string;
  loading: boolean;
}

interface MobileEmailCardProps {
  email: Email;
  summaryState?: SummaryState;
  cleanPreviewText: (text: string) => string;
  currentColumn: string;
  onEmailClick: (emailId: string) => void;
  onSnooze: (email: { id: string; subject: string }) => void;
  onUnsnooze: (email: Email) => Promise<void>;
  onMoveToColumn: (emailId: string, columnId: string) => void;
  onColumnChange: (columnId: string) => void;
}

export default function MobileEmailCard({
  email,
  summaryState,
  cleanPreviewText,
  currentColumn,
  onEmailClick,
  onSnooze,
  onUnsnooze,
  onMoveToColumn,
  onColumnChange,
}: MobileEmailCardProps) {
  const isSnoozed = email.mailbox_id === "snoozed";

  // Extract sender name
  const getSenderName = () => {
    let name = email.from_name || email.from || "";
    const match = name.match(/^"?([^"<]+)"?\s*</);
    if (match) name = match[1].trim();
    name = name.replace(/^"|"$/g, "");
    return name || "Unknown Sender";
  };

  return (
    <div
      onClick={() => onEmailClick(email.id)}
      className="bg-white dark:bg-gray-800 rounded-lg p-4 border border-gray-200 dark:border-gray-700 hover:shadow-md transition-shadow cursor-pointer"
    >
      <div className="flex justify-between items-start mb-2">
        <h3 className="font-semibold text-sm text-gray-900 dark:text-white line-clamp-1">
          {email.subject || "(No Subject)"}
        </h3>
        <span className="text-xs text-gray-500 dark:text-gray-400 ml-2 whitespace-nowrap">
          {new Date(email.received_at).toLocaleDateString()}
        </span>
      </div>
      
      <p className="text-xs text-gray-600 dark:text-gray-300 mb-2">
        {getSenderName()}
      </p>
      
      {/* Show AI summary if available, otherwise show preview */}
      {summaryState?.summary ? (
        <p className="text-xs text-blue-600 dark:text-blue-400 line-clamp-3 italic">
          ✨ {summaryState.summary}
        </p>
      ) : summaryState?.loading ? (
        <p className="text-xs text-gray-400 dark:text-gray-500 line-clamp-2 animate-pulse">
          Đang tóm tắt...
        </p>
      ) : (
        <p className="text-xs text-gray-500 dark:text-gray-400 line-clamp-2">
          {cleanPreviewText(email.preview)}
        </p>
      )}

      {/* Action Buttons */}
      <div className="mt-3 flex gap-2 flex-wrap">
        {!isSnoozed ? (
          <button
            className="px-3 py-1.5 rounded bg-yellow-400 text-xs text-black hover:bg-yellow-500"
            onClick={(e) => {
              e.stopPropagation();
              onSnooze({ id: email.id, subject: email.subject });
            }}
          >
            <span className="material-symbols-outlined text-xs mr-1">
              schedule
            </span>
            Snooze
          </button>
        ) : (
          <button
            className="px-3 py-1.5 rounded bg-green-400 text-xs text-black hover:bg-green-500"
            onClick={async (e) => {
              e.stopPropagation();
              await onUnsnooze(email);
            }}
          >
            <span className="material-symbols-outlined text-xs mr-1">
              notifications_active
            </span>
            Unsnooze
          </button>
        )}

        {/* Move to column buttons */}
        {["inbox", "todo", "done"]
          .filter((c) => c !== currentColumn)
          .map((colId) => (
            <button
              key={colId}
              className="px-3 py-1.5 rounded bg-blue-100 dark:bg-blue-900/30 text-xs text-blue-700 dark:text-blue-300 hover:bg-blue-200 dark:hover:bg-blue-900/50"
              onClick={(e) => {
                e.stopPropagation();
                onMoveToColumn(email.id, colId);
                onColumnChange(colId);
              }}
            >
              Move to {colId}
            </button>
          ))}
      </div>
    </div>
  );
}
