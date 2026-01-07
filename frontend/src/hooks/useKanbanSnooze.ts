import { useState, useCallback } from "react";
import { emailService } from "@/services/email.service";
import { useQueryClient } from "@tanstack/react-query";

export interface EmailToSnooze {
  id: string;
  subject: string;
}

export interface UseKanbanSnoozeOptions {
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
export function useKanbanSnooze(): UseKanbanSnoozeReturn {
  const queryClient = useQueryClient();
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

    // Call API
    emailService.snoozeEmail(emailId, snoozeUntil)
      .then(() => {
        // Invalidate all emails to refresh board
        return queryClient.invalidateQueries({ queryKey: ['emails'] });
      })
      .catch((error) => {
        console.error("Error snoozing email:", error);
      })
      .finally(() => {
        setSnoozingEmailId(null);
      });

    // Close dialog immediately
    setSnoozeDialogOpen(false);
    setEmailToSnooze(null);
  }, [emailToSnooze, queryClient]);

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
