import { useState, useEffect, useRef, useCallback } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { emailService } from "@/services/email.service";
import { toast } from "sonner";
import type { Attachment } from "@/types/email";
import {
  type InlineImage,
  downloadAllInlineImages,
  replaceApiUrlsWithCid,
  getRegularAttachments,
} from "@/utils/inlineImageUtils";

export interface UseComposeEmailOptions {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  initialTo?: string[];
  initialCc?: string[];
  initialSubject?: string;
  initialBody?: string;
  quotedContent?: string;
  quotedHeader?: string;
  /** Original email ID for downloading attachments */
  originalEmailId?: string;
  /** Original attachments metadata */
  originalAttachments?: Attachment[];
  /** When true, download and attach all original attachments on open */
  forwardAttachments?: boolean;
  /** When true, only download inline images (for reply) */
  includeInlineImages?: boolean;
}

export interface RecipientState {
  to: string[];
  cc: string[];
  bcc: string[];
  toInput: string;
  ccInput: string;
  bccInput: string;
}

export interface UseComposeEmailReturn {
  // Recipients
  recipients: RecipientState;
  setToInput: (value: string) => void;
  setCcInput: (value: string) => void;
  setBccInput: (value: string) => void;
  handleAddRecipient: (value: string, type: "to" | "cc" | "bcc") => void;
  handleRemoveRecipient: (email: string, type: "to" | "cc" | "bcc") => void;
  handleKeyDown: (e: React.KeyboardEvent<HTMLInputElement>, type: "to" | "cc" | "bcc") => void;

  // Subject & Body
  subject: string;
  setSubject: (value: string) => void;
  body: string;
  setBody: (value: string) => void;

  // Quoted content
  quotedHtml: string;
  quotedHeaderText: string;

  // Attachments
  attachments: File[];
  handleAddAttachment: () => void;
  handleRemoveAttachment: (fileName: string) => void;

  // UI State
  showCc: boolean;
  setShowCc: (value: boolean) => void;
  showBcc: boolean;
  setShowBcc: (value: boolean) => void;
  isMinimized: boolean;
  setIsMinimized: (value: boolean) => void;

  // Actions
  handleSend: () => void;
  handleDiscard: () => void;
  isSending: boolean;
}

/**
 * Custom hook that encapsulates all ComposeEmail form logic.
 * Extracts 16 useState calls and all handlers from the component.
 * 
 * @example
 * ```tsx
 * const compose = useComposeEmail({
 *   open,
 *   onOpenChange,
 *   initialTo: ["john@example.com"],
 * });
 * 
 * return (
 *   <input
 *     value={compose.recipients.toInput}
 *     onChange={(e) => compose.setToInput(e.target.value)}
 *     onKeyDown={(e) => compose.handleKeyDown(e, "to")}
 *   />
 * );
 * ```
 */
export function useComposeEmail({
  open,
  onOpenChange,
  initialTo = [],
  initialCc = [],
  initialSubject = "",
  initialBody = "",
  quotedContent = "",
  quotedHeader = "",
  originalEmailId,
  originalAttachments,
  forwardAttachments = false,
  includeInlineImages = false,
}: UseComposeEmailOptions): UseComposeEmailReturn {
  const queryClient = useQueryClient();

  // Recipient state
  const [to, setTo] = useState<string[]>([]);
  const [toInput, setToInput] = useState("");
  const [cc, setCc] = useState<string[]>([]);
  const [ccInput, setCcInput] = useState("");
  const [bcc, setBcc] = useState<string[]>([]);
  const [bccInput, setBccInput] = useState("");

  // Content state
  const [subject, setSubject] = useState("");
  const [body, setBody] = useState("");
  const [attachments, setAttachments] = useState<File[]>([]);
  const [inlineImages, setInlineImages] = useState<InlineImage[]>([]);

  // Quoted content state
  const [quotedHtml, setQuotedHtml] = useState("");
  const [quotedHeaderText, setQuotedHeaderText] = useState("");

  // UI state
  const [showCc, setShowCc] = useState(false);
  const [showBcc, setShowBcc] = useState(false);
  const [isMinimized, setIsMinimized] = useState(false);

  // Track previous open state
  const prevOpen = useRef(open);

  // Reset form to initial state
  const resetForm = useCallback(() => {
    setTo([]);
    setToInput("");
    setCc([]);
    setCcInput("");
    setBcc([]);
    setBccInput("");
    setSubject("");
    setBody("");
    setAttachments([]);
    setInlineImages([]);
    setShowCc(false);
    setShowBcc(false);
    setIsMinimized(false);
    setQuotedHtml("");
    setQuotedHeaderText("");
  }, []);

  // Handle dialog open/close transitions
  useEffect(() => {
    // Dialog just opened - load initial data
    if (open && !prevOpen.current) {
      if (initialTo.length > 0 || initialCc.length > 0 || initialSubject || initialBody || quotedContent) {
        setTimeout(() => {
          setTo(initialTo);
          setCc(initialCc);
          if (initialCc.length > 0) setShowCc(true);
          setSubject(initialSubject);
          setBody(initialBody);
          setQuotedHtml(quotedContent);
          setQuotedHeaderText(quotedHeader);
        }, 0);
      }

      // Download attachments for forwarding (all) or reply (inline only)
      const shouldDownload = (forwardAttachments || includeInlineImages) && 
                             originalEmailId && 
                             originalAttachments && 
                             originalAttachments.length > 0;
      
      if (shouldDownload) {
        const downloadAllAttachments = async () => {
          try {
            // Download inline images (those with content_id) - needed for both forward and reply
            const inlineImagesResult = await downloadAllInlineImages(originalEmailId!, originalAttachments!);
            if (inlineImagesResult.length > 0) {
              setInlineImages(inlineImagesResult);
            }

            // Download regular attachments only if forwarding (not for reply)
            if (forwardAttachments) {
              const regularAttachmentsMeta = getRegularAttachments(originalAttachments!);
              if (regularAttachmentsMeta.length > 0) {
                const downloadPromises = regularAttachmentsMeta.map((attachment) =>
                  emailService.getAttachmentAsFile(originalEmailId!, attachment)
                );
                
                const results = await Promise.allSettled(downloadPromises);
                
                const downloadedFiles: File[] = [];
                results.forEach((result, index) => {
                  if (result.status === "fulfilled") {
                    downloadedFiles.push(result.value);
                  } else {
                    console.error(`Failed to download attachment: ${regularAttachmentsMeta[index].name}`, result.reason);
                  }
                });

                if (downloadedFiles.length > 0) {
                  setAttachments(downloadedFiles);
                }
              }
            }
          } catch (error) {
            console.error("Failed to download attachments:", error);
            toast.error("Không thể tải tệp đính kèm");
          }
        };

        downloadAllAttachments();
      }
    }
    // Dialog just closed - reset form
    else if (!open && prevOpen.current) {
      setTimeout(resetForm, 0);
    }

    prevOpen.current = open;
  }, [open, initialTo, initialCc, initialSubject, initialBody, quotedContent, quotedHeader, resetForm, forwardAttachments, includeInlineImages, originalEmailId, originalAttachments]);

  // Send email mutation
  const sendMutation = useMutation({
    mutationFn: async () => {
      // Combine all recipients
      const allTo = [...to];
      if (toInput.trim()) allTo.push(toInput.trim());

      if (allTo.length === 0) {
        throw new Error("Vui lòng thêm ít nhất một người nhận");
      }

      const allCc = [...cc];
      if (ccInput.trim()) allCc.push(ccInput.trim());

      const allBcc = [...bcc];
      if (bccInput.trim()) allBcc.push(bccInput.trim());

      // Process body with blockquote styles
      let processedBody = body.replace(
        /<blockquote>/g,
        '<blockquote style="margin: 0 0 0 0.8ex; border-left: 1px #ccc solid; padding-left: 1ex;">'
      );

      // Combine with quoted content
      if (quotedHtml) {
        const quoteWrapper = quotedHeaderText
          ? `<br><br><div class="gmail_quote"><div class="gmail_attr">${quotedHeaderText}</div><blockquote class="gmail_quote" style="margin:0px 0px 0px 0.8ex;border-left:1px solid rgb(204,204,204);padding-left:1ex">${quotedHtml}</blockquote></div>`
          : `<br><br><div class="gmail_quote"><blockquote class="gmail_quote" style="margin:0px 0px 0px 0.8ex;border-left:1px solid rgb(204,204,204);padding-left:1ex">${quotedHtml}</blockquote></div>`;
        processedBody = processedBody + quoteWrapper;
      }

      // Replace API URLs with cid: references for inline images
      // Backend will use Content-ID to create proper multipart/related structure
      if (originalEmailId && originalAttachments && inlineImages.length > 0) {
        processedBody = replaceApiUrlsWithCid(processedBody, originalEmailId, originalAttachments);
      }

      await emailService.sendEmail(
        allTo.join(", "),
        allCc.join(", "),
        allBcc.join(", "),
        subject,
        processedBody,
        attachments,
        inlineImages  // Pass inline images with contentId
      );
    },
    onSuccess: () => {
      toast.success("Đã gửi email thành công");
      onOpenChange(false);
      resetForm();
      queryClient.invalidateQueries({ queryKey: ["emails"] });
      queryClient.invalidateQueries({ queryKey: ["mailboxes"] });
    },
    onError: (error: Error) => {
      console.error("Failed to send email:", error);
      toast.error(error?.message || "Không thể gửi email. Vui lòng thử lại");
    },
  });

  // Handler: Add recipient
  const handleAddRecipient = useCallback((value: string, type: "to" | "cc" | "bcc") => {
    if (!value.trim()) return;

    const email = value.trim();
    if (type === "to") {
      setTo((prev) => [...prev, email]);
      setToInput("");
    } else if (type === "cc") {
      setCc((prev) => [...prev, email]);
      setCcInput("");
    } else {
      setBcc((prev) => [...prev, email]);
      setBccInput("");
    }
  }, []);

  // Handler: Remove recipient
  const handleRemoveRecipient = useCallback((email: string, type: "to" | "cc" | "bcc") => {
    if (type === "to") {
      setTo((prev) => prev.filter((e) => e !== email));
    } else if (type === "cc") {
      setCc((prev) => prev.filter((e) => e !== email));
    } else {
      setBcc((prev) => prev.filter((e) => e !== email));
    }
  }, []);

  // Handler: Keyboard input
  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent<HTMLInputElement>, type: "to" | "cc" | "bcc") => {
      if (e.key === "Enter" || e.key === ",") {
        e.preventDefault();
        const value = (e.target as HTMLInputElement).value;
        handleAddRecipient(value, type);
      }
    },
    [handleAddRecipient]
  );

  // Handler: Add attachment
  const handleAddAttachment = useCallback(() => {
    const input = document.createElement("input");
    input.type = "file";
    input.multiple = true;
    input.onchange = (e) => {
      const files = (e.target as HTMLInputElement).files;
      if (files) {
        const newAttachments = Array.from(files);
        setAttachments((prev) => [...prev, ...newAttachments]);
      }
    };
    input.click();
  }, []);

  // Handler: Remove attachment
  const handleRemoveAttachment = useCallback((fileName: string) => {
    setAttachments((prev) => prev.filter((file) => file.name !== fileName));
  }, []);

  // Handler: Send email
  const handleSend = useCallback(() => {
    sendMutation.mutate();
  }, [sendMutation]);

  // Handler: Discard email
  const handleDiscard = useCallback(() => {
    onOpenChange(false);
    resetForm();
  }, [onOpenChange, resetForm]);

  return {
    // Recipients
    recipients: { to, cc, bcc, toInput, ccInput, bccInput },
    setToInput,
    setCcInput,
    setBccInput,
    handleAddRecipient,
    handleRemoveRecipient,
    handleKeyDown,

    // Subject & Body
    subject,
    setSubject,
    body,
    setBody,

    // Quoted content
    quotedHtml,
    quotedHeaderText,

    // Attachments
    attachments,
    handleAddAttachment,
    handleRemoveAttachment,

    // UI State
    showCc,
    setShowCc,
    showBcc,
    setShowBcc,
    isMinimized,
    setIsMinimized,

    // Actions
    handleSend,
    handleDiscard,
    isSending: sendMutation.isPending,
  };
}

export default useComposeEmail;
