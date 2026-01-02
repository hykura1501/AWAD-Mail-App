import type { Email } from "@/types/email";
import { getSenderName, getCleanPreview } from "@/utils";

interface SummaryState {
  summary: string;
  loading: boolean;
}

interface MobileEmailCardProps {
  email: Email;
  onClick: () => void;
  summaryState?: SummaryState;
  onSnooze?: () => void;
  onUnsnooze?: () => void;
  onMoveToColumn?: (columnId: string) => void;
  availableColumns?: string[];
  currentColumn?: string;
}

/**
 * Email card component for mobile Kanban view
 * Displays email info with AI summary and action buttons
 */
export default function MobileEmailCard({
  email,
  onClick,
  summaryState,
  onSnooze,
  onUnsnooze,
  onMoveToColumn,
  availableColumns = ["inbox", "todo", "done"],
  currentColumn,
}: MobileEmailCardProps) {
  const isSnoozed = email.mailbox_id === "snoozed";

  return (
    <div
      onClick={onClick}
      className="bg-white dark:bg-gray-800 rounded-lg p-4 border border-gray-200 dark:border-gray-700 hover:shadow-md transition-shadow cursor-pointer"
    >
      {/* Header: Subject + Date */}
      <div className="flex justify-between items-start mb-2">
        <h3 className="font-semibold text-sm text-gray-900 dark:text-white line-clamp-1">
          {email.subject || "(No Subject)"}
        </h3>
        <span className="text-xs text-gray-500 dark:text-gray-400 ml-2 whitespace-nowrap">
          {new Date(email.received_at).toLocaleDateString()}
        </span>
      </div>

      {/* Sender */}
      <p className="text-xs text-gray-600 dark:text-gray-300 mb-2">
        {getSenderName(email)}
      </p>

      {/* Preview / Summary */}
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
          {getCleanPreview(email.preview || email.body)}
        </p>
      )}

      {/* Action Buttons */}
      <div className="mt-3 flex gap-2 flex-wrap">
        {/* Snooze / Unsnooze Button */}
        {!isSnoozed && onSnooze ? (
          <button
            className="px-3 py-1.5 rounded bg-yellow-400 text-xs text-black hover:bg-yellow-500"
            onClick={(e) => {
              e.stopPropagation();
              onSnooze();
            }}
          >
            <span className="material-symbols-outlined text-xs mr-1">
              schedule
            </span>
            Snooze
          </button>
        ) : isSnoozed && onUnsnooze ? (
          <button
            className="px-3 py-1.5 rounded bg-green-400 text-xs text-black hover:bg-green-500"
            onClick={(e) => {
              e.stopPropagation();
              onUnsnooze();
            }}
          >
            <span className="material-symbols-outlined text-xs mr-1">
              notifications_active
            </span>
            Unsnooze
          </button>
        ) : null}

        {/* Move to column buttons */}
        {onMoveToColumn &&
          availableColumns
            .filter((c) => c !== currentColumn)
            .map((colId) => (
              <button
                key={colId}
                className="px-3 py-1.5 rounded bg-blue-100 dark:bg-blue-900/30 text-xs text-blue-700 dark:text-blue-300 hover:bg-blue-200 dark:hover:bg-blue-900/50"
                onClick={(e) => {
                  e.stopPropagation();
                  onMoveToColumn(colId);
                }}
              >
                Move to {colId}
              </button>
            ))}
      </div>
    </div>
  );
}
