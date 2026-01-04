import { useState, useCallback } from "react";
import type { Email } from "@/types/email";
import { emailService } from "@/services/email.service";

export interface EmailToSnooze {
  id: string;
  subject: string;
}

export interface UseKanbanSnoozeOptions {
  /** Callback to update kanban emails after snooze */
  onSnoozeComplete: (emailId: string) => void;
}

export interface UseKanbanSnoozeReturn {
  // State
  snoozeDialogOpen: boolean;
  emailToSnooze: EmailToSnooze | null;
  
  // Actions
  openSnoozeDialog: (email: { id: string; subject: string }) => void;
  closeSnoozeDialog: () => void;
  confirmSnooze: (snoozeUntil: Date, updateEmails: React.Dispatch<React.SetStateAction<Record<string, Email[]>>>) => void;
}

/**
 * Custom hook for Kanban snooze functionality
 * 
 * Handles:
 * - Snooze dialog state management
 * - Snooze confirmation with optimistic update
 * - API call for snoozing emails
 */
export function useKanbanSnooze(): UseKanbanSnoozeReturn {
  const [snoozeDialogOpen, setSnoozeDialogOpen] = useState(false);
  const [emailToSnooze, setEmailToSnooze] = useState<EmailToSnooze | null>(null);

  const openSnoozeDialog = useCallback((email: { id: string; subject: string }) => {
    setEmailToSnooze({ id: email.id, subject: email.subject });
    setSnoozeDialogOpen(true);
  }, []);

  const closeSnoozeDialog = useCallback(() => {
    setSnoozeDialogOpen(false);
    setEmailToSnooze(null);
  }, []);

  const confirmSnooze = useCallback((
    snoozeUntil: Date,
    setKanbanEmails: React.Dispatch<React.SetStateAction<Record<string, Email[]>>>
  ) => {
    if (!emailToSnooze) return;

    const emailId = emailToSnooze.id;

    // Optimistic update
    setKanbanEmails((prev) => {
      let movedEmail: Email | undefined;
      const newEmails: Record<string, Email[]> = {};

      // Remove email from all columns
      Object.entries(prev).forEach(([col, emails]) => {
        if (!emails) {
          newEmails[col] = [];
          return;
        }
        const filtered = emails.filter((e) => {
          if (e.id === emailId) {
            movedEmail = e;
            return false;
          }
          return true;
        });
        newEmails[col] = filtered;
      });

      // Add to snoozed column
      if (movedEmail) {
        if (!newEmails["snoozed"]) {
          newEmails["snoozed"] = [];
        }
        newEmails["snoozed"] = [movedEmail, ...newEmails["snoozed"]];
      }
      return newEmails;
    });

    // Call API
    emailService.snoozeEmail(emailId, snoozeUntil).catch((error) => {
      console.error("Error snoozing email:", error);
    });

    // Close dialog
    setSnoozeDialogOpen(false);
    setEmailToSnooze(null);
  }, [emailToSnooze]);

  return {
    snoozeDialogOpen,
    emailToSnooze,
    openSnoozeDialog,
    closeSnoozeDialog,
    confirmSnooze,
  };
}

export default useKanbanSnooze;
