import type { Email } from "@/types/email";

interface KanbanCardActionsProps {
  email: Email;
  columnId?: string;
  onSnooze: (email: { id: string; subject: string }) => void;
  onUnsnooze: (email: Email) => Promise<void>;
}

export default function KanbanCardActions({
  email,
  columnId,
  onSnooze,
  onUnsnooze,
}: KanbanCardActionsProps) {
  const isSnoozed = (columnId || email.mailbox_id) === "snoozed";

  if (!isSnoozed) {
    return (
      <button
        className="px-2 py-1 rounded bg-yellow-400 text-xs text-black hover:bg-yellow-500"
        onClick={(e) => {
          e.stopPropagation();
          onSnooze({ id: email.id, subject: email.subject });
        }}
      >
        Snooze
      </button>
    );
  }

  return (
    <button
      className="px-2 py-1 rounded bg-green-400 text-xs text-black hover:bg-green-500"
      onClick={async (e) => {
        e.stopPropagation();
        await onUnsnooze(email);
      }}
    >
      Unsnooze
    </button>
  );
}
