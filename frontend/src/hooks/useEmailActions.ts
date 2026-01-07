import { useCallback, useState } from "react";
import type { Email, Attachment } from "@/types/email";
import { API_BASE_URL } from "@/config/api";
import { getAccessToken } from "@/lib/api-client";

export interface ComposeData {
  to: string[];
  cc: string[];
  subject: string;
  body: string;
  quotedContent: string;
  quotedHeader: string;
  /** Original email ID for resolving inline images */
  originalEmailId?: string;
  /** Original attachments for resolving cid: URLs */
  originalAttachments?: Attachment[];
  /** When true, forward all original attachments (not just inline images) */
  forwardAttachments?: boolean;
  /** When true, only include inline images for reply (not regular attachments) */
  includeInlineImages?: boolean;
}

const EMPTY_COMPOSE_DATA: ComposeData = {
  to: [],
  cc: [],
  subject: "",
  body: "",
  quotedContent: "",
  quotedHeader: "",
  originalEmailId: undefined,
  originalAttachments: undefined,
  forwardAttachments: false,
  includeInlineImages: false,
};

interface UseEmailActionsOptions {
  /** Current user's email (for filtering in reply all) */
  userEmail?: string;
}

interface UseEmailActionsReturn {
  /** Whether compose dialog is open */
  isComposeOpen: boolean;
  /** Set compose dialog open state */
  setIsComposeOpen: (open: boolean) => void;
  /** Initial data for compose dialog */
  composeData: ComposeData;
  /** Prepare compose for reply */
  handleReply: (email: Email) => void;
  /** Prepare compose for reply all */
  handleReplyAll: (email: Email) => void;
  /** Prepare compose for forward */
  handleForward: (email: Email) => void;
  /** Clear compose data (call when dialog closes) */
  clearComposeData: () => void;
}

/**
 * Format date in Vietnamese style for email quotes
 */
function formatQuoteDate(date: Date): string {
  const weekday = date.toLocaleDateString("vi-VN", { weekday: "short" });
  const day = date.getDate();
  const month = date.getMonth() + 1;
  const year = date.getFullYear();
  const time = date.toLocaleTimeString("vi-VN", {
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  });

  return `Vào ${weekday}, ${day} thg ${month}, ${year} vào lúc ${time}`;
}

/**
 * Parse sender from email "From" field
 * Returns name and email separately
 */
function parseSender(from: string): { name: string; email: string } {
  const match = from.match(/^(.*?)\s*<(.*)>$/);
  if (match) {
    return {
      name: match[1].replace(/"/g, "").trim(),
      email: match[2].trim(),
    };
  }
  
  const cleaned = from.replace(/"/g, "").trim();
  return {
    name: cleaned,
    email: cleaned.includes("@") ? cleaned : cleaned,
  };
}

/**
 * Process quoted content to replace cid: URLs with actual API URLs
 * This allows inline images to be displayed in the compose dialog
 */
function processQuotedContent(
  content: string,
  emailId?: string,
  attachments?: Attachment[]
): string {
  if (!emailId || !attachments || attachments.length === 0) return content;

  let processedContent = content;
  const token = getAccessToken();

  attachments.forEach((attachment) => {
    if (attachment.content_id) {
      const cid = `cid:${attachment.content_id}`;
      const url = `${API_BASE_URL}/emails/${emailId}/attachments/${attachment.id}?token=${token}`;
      processedContent = processedContent.split(cid).join(url);
    }
  });

  return processedContent;
}

/**
 * Custom hook for email compose actions (reply, reply all, forward)
 * 
 * Centralizes the logic for preparing compose dialog with quoted content.
 * 
 * @example
 * ```tsx
 * const { isComposeOpen, composeData, handleReply, handleForward } = useEmailActions({
 *   userEmail: user?.email,
 * });
 * 
 * return (
 *   <ComposeEmail
 *     open={isComposeOpen}
 *     initialTo={composeData.to}
 *     quotedContent={composeData.quotedContent}
 *     ...
 *   />
 * );
 * ```
 */
export function useEmailActions({
  userEmail = "",
}: UseEmailActionsOptions = {}): UseEmailActionsReturn {
  const [isComposeOpen, setIsComposeOpen] = useState(false);
  const [composeData, setComposeData] = useState<ComposeData>(EMPTY_COMPOSE_DATA);

  const clearComposeData = useCallback(() => {
    setComposeData(EMPTY_COMPOSE_DATA);
  }, []);

  const handleForward = useCallback((email: Email) => {
    const originalBody = email.body || email.preview || "";
    const forwardHeader = `---------- Forwarded message ---------\nFrom: ${email.from}\nDate: ${new Date(email.received_at).toLocaleString()}\nSubject: ${email.subject}\nTo: ${email.to.join(", ")}`;

    // Process inline images in quoted content
    const processedBody = processQuotedContent(originalBody, email.id, email.attachments);

    setComposeData({
      to: [],
      cc: [],
      subject: `Fwd: ${email.subject}`,
      body: "",
      quotedContent: processedBody,
      quotedHeader: forwardHeader,
      originalEmailId: email.id,
      originalAttachments: email.attachments,
      forwardAttachments: true, // Forward all attachments
    });
    setIsComposeOpen(true);
  }, []);

  const handleReply = useCallback((email: Email) => {
    const date = new Date(email.received_at);
    const dateStr = formatQuoteDate(date);
    const { name, email: senderEmail } = parseSender(email.from);
    const senderHtml = `${name} <${senderEmail}>`;

    const originalBody = email.body || email.preview || "";
    const quoteHeader = `Vào ${dateStr}, ${senderHtml} đã viết:`;

    // Process inline images in quoted content
    const processedBody = processQuotedContent(originalBody, email.id, email.attachments);

    setComposeData({
      to: [senderEmail],
      cc: [],
      subject: `Re: ${email.subject}`,
      body: "",
      quotedContent: processedBody,
      quotedHeader: quoteHeader,
      originalEmailId: email.id,
      originalAttachments: email.attachments,
      includeInlineImages: true, // Download inline images for quoted content
    });
    setIsComposeOpen(true);
  }, []);

  const handleReplyAll = useCallback((email: Email) => {
    const date = new Date(email.received_at);
    const dateStr = formatQuoteDate(date);
    const { name, email: senderEmail } = parseSender(email.from);
    const senderHtml = `${name} <${senderEmail}>`;

    // Calculate CC list
    // CC = (Original To + Original CC) - (Me + Sender)
    const allRecipients = [...(email.to || []), ...(email.cc || [])];

    const ccList = allRecipients
      .map((r) => {
        const { email } = parseSender(r);
        return email;
      })
      .filter(
        (email) =>
          email.toLowerCase() !== userEmail.toLowerCase() &&
          email.toLowerCase() !== senderEmail.toLowerCase()
      );

    // Remove duplicates
    const uniqueCcList = [...new Set(ccList)];

    const originalBody = email.body || email.preview || "";
    const quoteHeader = `Vào ${dateStr}, ${senderHtml} đã viết:`;

    // Process inline images in quoted content
    const processedBody = processQuotedContent(originalBody, email.id, email.attachments);

    setComposeData({
      to: [senderEmail],
      cc: uniqueCcList,
      subject: `Re: ${email.subject}`,
      body: "",
      quotedContent: processedBody,
      quotedHeader: quoteHeader,
      originalEmailId: email.id,
      originalAttachments: email.attachments,
      includeInlineImages: true, // Download inline images for quoted content
    });
    setIsComposeOpen(true);
  }, [userEmail]);

  return {
    isComposeOpen,
    setIsComposeOpen,
    composeData,
    handleReply,
    handleReplyAll,
    handleForward,
    clearComposeData,
  };
}

export default useEmailActions;
