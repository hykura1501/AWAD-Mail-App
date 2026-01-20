import { useState, useCallback } from "react";
import { emailService } from "@/services/email.service";
import { useQueryClient } from "@tanstack/react-query";

export interface EmailToSnooze {
  id: string;
  subject: string;
}

export interface UseKanbanSnoozeOptions {
  /** Callback to reload all Kanban columns after snooze */
  onSnoozed?: () => Promise<void>;
}

export interface UseKanbanSnoozeReturn {
  // State
  snoozeDialogOpen: boolean;
  emailToSnooze: EmailToSnooze | null;
  snoozingEmailId: string | null;

  // Actions
  openSnoozeDialog: (email: { id: string; subject: string }) => void;
  closeSnoozeDialog: () => void;
  confirmSnooze: (snoozeUntil: Date) => void;
}

/**
 * Custom hook for Kanban snooze functionality
 */
export function useKanbanSnooze(options: UseKanbanSnoozeOptions = {}): UseKanbanSnoozeReturn {
  const queryClient = useQueryClient();
  const { onSnoozed } = options;
  const [snoozeDialogOpen, setSnoozeDialogOpen] = useState(false);
  const [emailToSnooze, setEmailToSnooze] = useState<EmailToSnooze | null>(null);
  const [snoozingEmailId, setSnoozingEmailId] = useState<string | null>(null);

  const openSnoozeDialog = useCallback((email: { id: string; subject: string }) => {
    setEmailToSnooze({ id: email.id, subject: email.subject });
    setSnoozeDialogOpen(true);
  }, []);

  const closeSnoozeDialog = useCallback(() => {
    setSnoozeDialogOpen(false);
    setEmailToSnooze(null);
  }, []);

  const confirmSnooze = useCallback((snoozeUntil: Date) => {
    if (!emailToSnooze) return;

    const emailId = emailToSnooze.id;
    setSnoozingEmailId(emailId);

    // Close dialog immediately
    setSnoozeDialogOpen(false);
    setEmailToSnooze(null);

    // Call API
    emailService.snoozeEmail(emailId, snoozeUntil)
      .then(async () => {
        // Invalidate all Kanban email queries to refresh board
        queryClient.invalidateQueries({ queryKey: ["kanban", "emails"] });
        // Also invalidate generic emails for other pages
        queryClient.invalidateQueries({ queryKey: ["emails"] });
        // Call callback if provided (to reload columns)
        if (onSnoozed) {
          await onSnoozed();
        }
      })
      .catch((error) => {
        console.error("Error snoozing email:", error);
      })
      .finally(() => {
        setSnoozingEmailId(null);
      });
  }, [emailToSnooze, queryClient, onSnoozed]);

  return {
    snoozeDialogOpen,
    emailToSnooze,
    snoozingEmailId,
    openSnoozeDialog,
    closeSnoozeDialog,
    confirmSnooze,
  };
}


export default useKanbanSnooze;
