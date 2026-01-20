import { useEffect, useRef, useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { emailService } from "@/services/email.service";
import { format } from "date-fns";
import type { Email, Attachment, EmailsResponse } from "@/types/email";
import { API_BASE_URL } from "@/config/api";
import { getAccessToken } from "@/lib/api-client";
import { cn } from "@/lib/utils";
import { useAppSelector } from "@/store/hooks";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import StarIcon from "@/assets/star.svg?react";
import { isViewableFileType } from "@/utils/email";
import {
    Dialog,
    DialogContent,
    DialogHeader,
    DialogTitle,
} from "@/components/ui/dialog";
import { Document, Page, pdfjs } from "react-pdf";
import "react-pdf/dist/Page/AnnotationLayer.css";
import "react-pdf/dist/Page/TextLayer.css";
import mammoth from "mammoth";
import * as XLSX from "xlsx";

// Configure PDF.js worker - use worker from public folder
// Worker file is copied from react-pdf's pdfjs-dist (version 5.4.296) to ensure version compatibility
pdfjs.GlobalWorkerOptions.workerSrc = '/pdf.worker.min.mjs';

interface EmailDetailProps {
    emailId: string | null;
    onToggleStar: (emailId: string) => void;
    onReply?: (email: Email) => void;
    onReplyAll?: (email: Email) => void;
    onForward?: (email: Email) => void;
    onExtractTask?: () => void;
    theme: "light" | "dark";
}

export default function EmailDetail({
                                        emailId,
                                        onReply,
                                        onReplyAll,
                                        onForward,
                                        onExtractTask,
                                        theme,
                                    }: EmailDetailProps) {
    const queryClient = useQueryClient();
    const { user } = useAppSelector((state) => state.auth);
    const [isMoreMenuOpen, setIsMoreMenuOpen] = useState(false);
    const [viewerAttachment, setViewerAttachment] = useState<{
        id: string;
        name: string;
        mimeType: string;
        url: string;
    } | null>(null);
    const [numPages, setNumPages] = useState<number | null>(null);
    const [pdfLoading, setPdfLoading] = useState(false);
    const [pdfError, setPdfError] = useState<string | null>(null);
    const [docxContent, setDocxContent] = useState<string | null>(null);
    const [xlsxContent, setXlsxContent] = useState<string | null>(null);
    const [jsonContent, setJsonContent] = useState<unknown>(null);
    const [fileLoading, setFileLoading] = useState(false);
    const [fileError, setFileError] = useState<string | null>(null);
    
    // Track which emails we've already marked as read to avoid duplicate API calls
    const markedAsReadRef = useRef<Set<string>>(new Set());

    const { data: email, isLoading } = useQuery<Email>({
        queryKey: ["email", emailId],
        queryFn: () => emailService.getEmailById(emailId!),
        enabled: !!emailId,
    });

    // Auto mark as read when email is opened
    useEffect(() => {
        if (email && emailId && !email.is_read && !markedAsReadRef.current.has(emailId)) {
            // Mark this email as being processed to avoid duplicate calls
            markedAsReadRef.current.add(emailId);
            
            // Optimistically update the email detail cache
            queryClient.setQueryData<Email>(["email", emailId], {
                ...email,
                is_read: true,
            });
            
            // Optimistically update all email list caches
            queryClient.setQueriesData<EmailsResponse>(
                { queryKey: ["emails"] },
                (old) => {
                    if (!old) return old;
                    return {
                        ...old,
                        emails: old.emails.map((e: Email) =>
                            e.id === emailId ? { ...e, is_read: true } : e
                        ),
                    };
                }
            );
            
            // Call the API to mark as read (fire and forget)
            emailService.markAsRead(emailId).catch((error) => {
                console.error("Failed to mark email as read:", error);
                // On error, remove from tracked set so it can be retried
                markedAsReadRef.current.delete(emailId);
            });
        }
    }, [email, emailId, queryClient]);

    const toggleStarMutation = useMutation({
        mutationFn: emailService.toggleStar,
        onMutate: async () => {
            // Cancel outgoing queries to prevent overwriting optimistic update
            await queryClient.cancelQueries({ queryKey: ["email", emailId] });
            await queryClient.cancelQueries({ queryKey: ["emails"] });

            const previousEmail = queryClient.getQueryData<Email>(["email", emailId]);

            // Update email detail cache
            if (previousEmail) {
                queryClient.setQueryData<Email>(["email", emailId], {
                    ...previousEmail,
                    is_starred: !previousEmail.is_starred,
                });
            }

            // Update all email list caches
            queryClient.setQueriesData<EmailsResponse>(
                { queryKey: ["emails"] },
                (old) => {
                    if (!old) return old;
                    return {
                        ...old,
                        emails: old.emails.map((e: Email) =>
                            e.id === emailId ? { ...e, is_starred: !e.is_starred } : e
                        ),
                    };
                }
            );

            return { previousEmail };
        },
        onSuccess: () => {
            toast.success("Đã cập nhật trạng thái đánh dấu sao");
        },
        onError: (_err, _variables, context) => {
            // Restore previous data on error
            if (context?.previousEmail) {
                queryClient.setQueryData(["email", emailId], context.previousEmail);
            }
            toast.error("Không thể cập nhật trạng thái đánh dấu sao");
            // Refetch all to restore correct state
            queryClient.invalidateQueries({ queryKey: ["email", emailId] });
            queryClient.invalidateQueries({ queryKey: ["emails"] });
        },
        // Don't use onSettled - let the optimistic update persist
    });

    const trashMutation = useMutation({
        mutationFn: emailService.trashEmail,
        onMutate: async () => {
            await queryClient.cancelQueries({ queryKey: ["email", emailId] });
            await queryClient.cancelQueries({ queryKey: ["emails"] });

            const previousEmail = queryClient.getQueryData<Email>(["email", emailId]);
            // snapshot all queries whose key starts with ["emails"]
            const previousEmails = queryClient.getQueriesData({ queryKey: ["emails"] }) as Array<[any, EmailsResponse | undefined]>;

            // Optimistically remove this email from all emails caches
            queryClient.setQueriesData<EmailsResponse>({ queryKey: ["emails"] }, (old) => {
                if (!old) return old;
                return {
                    ...old,
                    emails: old.emails.filter((e: Email) => e.id !== emailId),
                    total: Math.max(0, old.total - 1),
                };
            });

            // Clear the email detail cache
            queryClient.setQueryData(["email", emailId], undefined);

            const toastId = toast.success("Đã chuyển vào thùng rác");
            return { previousEmail, previousEmails, toastId };
        },
        onError: (_err, _variables, context: any) => {
            if (context?.toastId) toast.dismiss(context.toastId);
            if (context?.previousEmail) {
                queryClient.setQueryData(["email", emailId], context.previousEmail);
            }
            if (context?.previousEmails) {
                // restore each cached query entry
                context.previousEmails.forEach(([key, data]: [any, any]) => {
                    if (key) queryClient.setQueryData(key, data);
                });
            }
            toast.error("Không thể chuyển vào thùng rác");
        },
        onSettled: () => {
            queryClient.invalidateQueries({ queryKey: ["emails"] });
            queryClient.invalidateQueries({ queryKey: ["email", emailId] });
        },
    });

    const archiveMutation = useMutation({
        mutationFn: emailService.archiveEmail,
        onMutate: () => {
            const toastId = toast.success("Đã lưu trữ hội thoại");
            return { toastId };
        },
        onError: (_err, _variables, context) => {
            if (context?.toastId) toast.dismiss(context.toastId);
            toast.error("Lưu trữ thất bại");
        },
        onSettled: () => {
            queryClient.invalidateQueries({ queryKey: ["emails"] });
        },
    });

    const markAsUnreadMutation = useMutation({
        mutationFn: emailService.markAsUnread,
        onMutate: async () => {
            const toastId = toast.success("Đã đánh dấu là chưa đọc");
            await queryClient.cancelQueries({ queryKey: ["email", emailId] });
            const previousEmail = queryClient.getQueryData<Email>(["email", emailId]);

            if (previousEmail) {
                queryClient.setQueryData<Email>(["email", emailId], {
                    ...previousEmail,
                    is_read: false,
                });
            }

            return { previousEmail, toastId };
        },
        onError: (_err, _variables, context) => {
            if (context?.toastId) toast.dismiss(context.toastId);
            if (context?.previousEmail) {
                queryClient.setQueryData(["email", emailId], context.previousEmail);
            }
            toast.error("Không thể đánh dấu là chưa đọc");
        },
        onSettled: () => {
            queryClient.invalidateQueries({ queryKey: ["email", emailId] });
            queryClient.invalidateQueries({ queryKey: ["emails"] });
        },
    });

    const handleToggleStar = () => {
        if (emailId) {
            toggleStarMutation.mutate(emailId);
            // Don't call onToggleStar - mutation handles all cache updates
        }
    };

    const handleTrash = () => {
        if (emailId) {
            trashMutation.mutate(emailId);
        }
    };

    const handleArchive = () => {
        if (emailId) {
            archiveMutation.mutate(emailId);
        }
    };

    const handleMarkAsUnread = () => {
        if (emailId) {
            markAsUnreadMutation.mutate(emailId);
        }
    };

    const handleReply = () => {
        if (email && onReply) {
            onReply(email);
        }
    };

    const handleReplyAll = () => {
        if (email && onReplyAll) {
            onReplyAll(email);
        }
    };

    const handleForward = () => {
        if (email && onForward) {
            onForward(email);
        }
    };

    const handleOpenInGmail = () => {
        if (!email || !emailId) return;

        // Gmail web URL format with authuser parameter to open correct account
        // Format: https://mail.google.com/mail/u/?authuser={email}#all/{messageId}
        // This ensures Gmail opens the correct account even if user has multiple accounts
        let gmailUrl: string;
        
        if (user?.email) {
            // Use authuser parameter to specify the account by email
            gmailUrl = `https://mail.google.com/mail/u/?authuser=${encodeURIComponent(user.email)}#all/${encodeURIComponent(emailId)}`;
        } else {
            // Fallback: let Gmail auto-detect (will use default account)
            gmailUrl = `https://mail.google.com/mail/#all/${encodeURIComponent(emailId)}`;
        }
        
        // Open in new tab
        window.open(gmailUrl, '_blank', 'noopener,noreferrer');
        
        toast.success("Đang mở email trong Gmail...");
    };

    const handleDownloadAttachment = async (
        attachmentId: string,
        filename: string
    ) => {
        if (!emailId) return;

        try {
            const token = getAccessToken();
            const url = `${API_BASE_URL}/emails/${emailId}/attachments/${attachmentId}?token=${token}`;

            // Fetch -> blob -> object URL so the browser always uses our filename
            const response = await fetch(url);
            if (!response.ok) {
                throw new Error("Failed to download attachment");
            }

            const blob = await response.blob();
            const objectUrl = URL.createObjectURL(blob);

            const link = document.createElement("a");
            link.href = objectUrl;
            link.download = filename;
            document.body.appendChild(link);
            link.click();
            document.body.removeChild(link);
            URL.revokeObjectURL(objectUrl);

            toast.success(`Đang tải xuống ${filename}`);
        } catch (error) {
            console.error("Download failed:", error);
            toast.error("Không thể tải xuống tệp đính kèm");
        }
    };

    const handleViewAttachment = async (
        attachmentId: string,
        filename: string,
        mimeType: string
    ) => {
        if (!emailId) return;

        try {
            const token = getAccessToken();
            // Add view=true parameter to get inline content
            const url = `${API_BASE_URL}/emails/${emailId}/attachments/${attachmentId}?view=true&token=${token}`;
            
            // Reset states
            setPdfLoading(false);
            setPdfError(null);
            setFileLoading(true);
            setFileError(null);
            setDocxContent(null);
            setXlsxContent(null);
            setJsonContent(null);
            
            if (mimeType === "application/pdf") {
                setNumPages(null);
                setPdfLoading(true);
            }
            
            // Fetch as blob
            const response = await fetch(url);
            if (!response.ok) {
                throw new Error("Failed to fetch attachment");
            }
            
            const blob = await response.blob();
            
            // Handle different file types
            if (
                mimeType === "application/vnd.openxmlformats-officedocument.wordprocessingml.document" ||
                mimeType === "application/msword"
            ) {
                // Convert DOCX to HTML
                const arrayBuffer = await blob.arrayBuffer();
                const result = await mammoth.convertToHtml({ arrayBuffer });
                setDocxContent(result.value);
                setFileLoading(false);
            } else if (
                mimeType === "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" ||
                mimeType === "application/vnd.ms-excel"
            ) {
                // Convert XLSX to HTML table
                const arrayBuffer = await blob.arrayBuffer();
                const workbook = XLSX.read(arrayBuffer, { type: "array" });
                const firstSheetName = workbook.SheetNames[0];
                const worksheet = workbook.Sheets[firstSheetName];
                const html = XLSX.utils.sheet_to_html(worksheet);
                setXlsxContent(html);
                setFileLoading(false);
            } else if (mimeType === "application/json") {
                // Parse and format JSON
                const text = await blob.text();
                try {
                    const json = JSON.parse(text);
                    setJsonContent(json);
                    setFileLoading(false);
                } catch {
                    throw new Error("Invalid JSON format");
                }
            } else {
                // For other files, create object URL
                const objectUrl = URL.createObjectURL(blob);
                setFileLoading(false);
                
                setViewerAttachment({
                    id: attachmentId,
                    name: filename,
                    mimeType: mimeType,
                    url: objectUrl,
                });
                return;
            }
            
            // Set viewer attachment for DOCX/XLSX/JSON
            setViewerAttachment({
                id: attachmentId,
                name: filename,
                mimeType: mimeType,
                url: "", // Not used for these types
            });
        } catch (error) {
            console.error("View failed:", error);
            toast.error("Không thể mở tệp đính kèm");
            setFileError("Không thể tải file");
            setPdfError("Không thể tải file");
            setFileLoading(false);
            setPdfLoading(false);
        }
    };

    const processEmailBody = (body: string, attachments?: Attachment[]) => {
        if (!attachments || attachments.length === 0) return body;

        let processedBody = body;
        const token = getAccessToken();

        attachments.forEach((attachment) => {
            if (attachment.content_id) {
                const cid = `cid:${attachment.content_id}`;
                const url = `${API_BASE_URL}/emails/${emailId}/attachments/${attachment.id}?token=${token}`;
                processedBody = processedBody.split(cid).join(url);
            }
        });

        return processedBody;
    };

    if (!emailId) {
        return (
            <div className="flex items-center justify-center h-full text-gray-400 bg-white dark:bg-[#111418]">
                <div className="text-center">
          <span className="material-symbols-outlined text-8xl text-gray-300 dark:text-gray-600 mb-4">
            mail
          </span>
                    <p className="text-lg font-medium text-gray-500 dark:text-gray-300 mb-2">
                        Select an email to read
                    </p>
                    <p className="text-sm text-gray-400 dark:text-gray-500">
                        Nothing is selected.
                    </p>
                </div>
            </div>
        );
    }

    if (isLoading) {
        return (
            <div className="w-full h-full bg-white dark:bg-[#111418] p-6">
                <div className="space-y-4">
                    <div className="h-8 bg-gray-100 dark:bg-[#283039] animate-pulse rounded w-3/4" />
                    <div className="h-4 bg-gray-100 dark:bg-[#283039] animate-pulse rounded w-1/2" />
                    <div className="h-32 bg-gray-100 dark:bg-[#283039] animate-pulse rounded" />
                </div>
            </div>
        );
    }

    if (!email) {
        return (
            <div className="flex items-center justify-center h-full text-gray-400 bg-white dark:bg-[#111418]">
                <div className="text-center">
          <span className="material-symbols-outlined text-8xl text-gray-300 dark:text-gray-600 mb-4">
            error
          </span>
                    <p className="text-lg font-medium text-gray-500 dark:text-gray-300">
                        Email not found
                    </p>
                </div>
            </div>
        );
    }

    const getTimeDisplay = (date: string) => {
        const emailDate = new Date(date);
        const now = new Date();
        const diffInHours =
            (now.getTime() - emailDate.getTime()) / (1000 * 60 * 60);

        if (diffInHours < 24) {
            return `Today, ${format(emailDate, "h:mm a")}`;
        } else if (diffInHours < 48) {
            return `Yesterday, ${format(emailDate, "h:mm a")}`;
        } else {
            return format(emailDate, "MMM d, h:mm a");
        }
    };

    const getFileIcon = (mimeType: string) => {
        if (mimeType.startsWith("image/")) {
            return "image";
        }
        if (mimeType.includes("pdf")) {
            return "picture_as_pdf";
        }
        return "description";
    };

    const formatFileSize = (bytes: number) => {
        if (bytes < 1024) return bytes + " B";
        if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + " KB";
        return (bytes / (1024 * 1024)).toFixed(1) + " MB";
    };

    return (
        <div className="flex-1 flex flex-col bg-white dark:bg-[#111418] overflow-y-auto h-full scrollbar-thin">
            <div className="flex flex-col md:h-full">
                {/* Header*/}
                <div className="p-4 border-b border-gray-200 dark:border-gray-700 shrink-0 space-y-2">
                    <h2 className="text-lg font-bold text-gray-900 dark:text-white leading-tight">
                        {email.subject}
                    </h2>
                    <div className="flex items-center justify-between">
                        <div className="flex items-center gap-0.5">
                            <Button
                                variant="ghost"
                                size="icon"
                                className="h-8 w-8 text-gray-500 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-white/10"
                                title="Trả lời"
                                onClick={handleReply}
                                disabled={!onReply}
                            >
                <span className="material-symbols-outlined text-[18px] [font-variation-settings:'wght'_300]">
                  reply
                </span>
                            </Button>
                            <Button
                                variant="ghost"
                                size="icon"
                                className="h-8 w-8 text-gray-500 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-white/10"
                                title="Trả lời tất cả"
                                onClick={handleReplyAll}
                                disabled={!onReplyAll}
                            >
                <span className="material-symbols-outlined text-[18px] [font-variation-settings:'wght'_300]">
                  reply_all
                </span>
                            </Button>
                            <Button
                                variant="ghost"
                                size="icon"
                                className="h-8 w-8 text-gray-500 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-white/10"
                                title="Chuyển tiếp"
                                onClick={handleForward}
                                disabled={!onForward}
                            >
                <span className="material-symbols-outlined text-[18px] [font-variation-settings:'wght'_300]">
                  forward
                </span>
                            </Button>
                            <Button
                                variant="ghost"
                                size="icon"
                                className="h-8 w-8 text-gray-500 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-white/10"
                                title="Lưu trữ"
                                onClick={handleArchive}
                                disabled={archiveMutation.isPending}
                            >
                <span className="material-symbols-outlined text-[18px] [font-variation-settings:'wght'_300]">
                  {archiveMutation.isPending ? "progress_activity" : "archive"}
                </span>
                            </Button>
                            <Button
                                variant="ghost"
                                size="icon"
                                className="h-8 w-8 text-gray-500 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-white/10"
                                title="Đánh dấu chưa đọc"
                                onClick={handleMarkAsUnread}
                                disabled={markAsUnreadMutation.isPending}
                            >
                <span className="material-symbols-outlined text-[18px] [font-variation-settings:'wght'_300]">
                  {markAsUnreadMutation.isPending ? "progress_activity" : "mark_email_unread"}
                </span>
                            </Button>
                            <Button
                                variant="ghost"
                                size="icon"
                                className="h-8 w-8 text-gray-500 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-white/10"
                                title="Xóa"
                                onClick={handleTrash}
                                disabled={trashMutation.isPending}
                            >
                <span className="material-symbols-outlined text-[18px] [font-variation-settings:'wght'_300]">
                  {trashMutation.isPending ? "progress_activity" : "delete"}
                </span>
                            </Button>
                            <Button
                                variant="ghost"
                                size="icon"
                                className="h-8 w-8 text-gray-500 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-white/10"
                                title="Mở trong Gmail"
                                onClick={handleOpenInGmail}
                            >
                <span className="material-symbols-outlined text-[18px] [font-variation-settings:'wght'_300]">
                  open_in_new
                </span>
                            </Button>
                            <Button
                                variant="ghost"
                                size="icon"
                                className="h-8 w-8 text-gray-500 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-white/10"
                                title="Thêm"
                                onClick={() => toast.info("Tính năng đang phát triển")}
                            >
                <span className="material-symbols-outlined text-[18px] [font-variation-settings:'wght'_300]">
                  more_vert
                </span>
                            </Button>
                        </div>
                    </div>
                </div>

                {/* Content */}
                <div className="flex-1 md:overflow-y-auto p-4 dark:bg-white">
                    {/* Sender Info */}
                    <div className="flex items-start gap-3 mb-4">
                        <div className="w-10 h-10 rounded-full bg-blue-100 flex items-center justify-center text-blue-600 font-semibold text-sm shrink-0">
                            {(email.from_name || email.from || "?")
                                .replace(/['"]/g, "")
                                .trim()
                                .charAt(0)
                                .toUpperCase()}
                        </div>
                        <div className="flex-1">
                            <div className="flex items-center justify-between">
                                <div>
                                    <p className="font-medium text-gray-900 text-sm flex flex-col md:flex-row md:items-center items-start gap-0 md:gap-2">
                    <span>
                      {(email.from_name || email.from)
                          .replace(/<.*>/, "")
                          .replace(/"/g, "")
                          .trim()}
                    </span>
                                        <span className="text-xs text-gray-500 font-normal">
                      &lt;
                                            {email.from.match(/<([^>]+)>/)?.[1] ||
                                                (email.from.includes("@") ? email.from : "")}
                                            &gt;
                    </span>
                                    </p>
                                    <p className="text-xs text-gray-500">
                                        To:{" "}
                                        {email.to.map((recipient, index) => (
                                            <span key={index}>
                        {index > 0 && ", "}
                                                {user?.email && recipient.includes(user.email)
                                                    ? "Me"
                                                    : recipient}
                      </span>
                                        ))}
                                    </p>
                                    <p className="text-xs text-gray-500 md:hidden mt-1">
                                        {getTimeDisplay(email.received_at)}
                                    </p>
                                </div>
                                <div className="flex items-center gap-2 text-xs text-gray-500">
                  <span className="hidden md:block">
                    {getTimeDisplay(email.received_at)}
                  </span>
                                    <Button
                                        variant="ghost"
                                        size="icon"
                                        className="h-8 w-8 rounded-full"
                                        title="Bật/tắt dấu sao"
                                        onClick={handleToggleStar}
                                        disabled={toggleStarMutation.isPending}
                                    >
                                        {toggleStarMutation.isPending ? (
                                            <span className="material-symbols-outlined text-[18px] text-gray-400 dark:text-gray-500 animate-spin">
                                                progress_activity
                                            </span>
                                        ) : (
                                            <StarIcon
                                                className={cn(
                                                    "size-7 cursor-pointer",
                                                    email.is_starred
                                                        ? "text-yellow-400 fill-yellow-400"
                                                        : "text-gray-400 fill-gray-400 dark:text-gray-500 dark:fill-gray-500"
                                                )}
                                            />
                                        )}
                                    </Button>
                                    <Button
                                        variant="ghost"
                                        size="icon"
                                        className="h-8 w-8 rounded-full"
                                        title="Trả lời"
                                        onClick={handleReply}
                                        disabled={!onReply}
                                    >
                    <span className="material-symbols-outlined text-[18px]">
                      reply
                    </span>
                                    </Button>
                                    <div className="relative">
                                        <Button
                                            variant="ghost"
                                            size="icon"
                                            className="h-8 w-8 rounded-full"
                                            title="Khác"
                                            onClick={() => setIsMoreMenuOpen(!isMoreMenuOpen)}
                                        >
                                            <span className="material-symbols-outlined text-[18px]">
                                                more_vert
                                            </span>
                                        </Button>
                                        {isMoreMenuOpen && (
                                            <>
                                                <div
                                                    className="fixed inset-0 z-40"
                                                    onClick={() => setIsMoreMenuOpen(false)}
                                                />
                                                <div className="absolute top-full right-0 mt-1 w-48 bg-white dark:bg-[#283039] rounded-lg shadow-xl border border-gray-200 dark:border-gray-700 z-50 overflow-hidden">
                                                    <button
                                                        onClick={() => {
                                                            handleOpenInGmail();
                                                            setIsMoreMenuOpen(false);
                                                        }}
                                                        className="w-full px-3 py-2 text-left text-sm text-gray-700 dark:text-white hover:bg-gray-100 dark:hover:bg-white/10 flex items-center gap-2 transition-colors"
                                                    >
                                                        <span className="material-symbols-outlined text-[18px]">open_in_new</span>
                                                        Mở trong Gmail
                                                    </button>
                                                    <button
                                                        onClick={() => {
                                                            if (onExtractTask) {
                                                                onExtractTask();
                                                            } else {
                                                                toast.info("Trích xuất task chỉ khả dụng khi xem chi tiết email");
                                                            }
                                                            setIsMoreMenuOpen(false);
                                                        }}
                                                        className="w-full px-3 py-2 text-left text-sm text-gray-700 dark:text-white hover:bg-gray-100 dark:hover:bg-white/10 flex items-center gap-2 transition-colors"
                                                    >
                                                        <span className="material-symbols-outlined text-[18px]">task</span>
                                                        Trích xuất Tasks
                                                    </button>
                                                </div>
                                            </>
                                        )}
                                    </div>
                                </div>
                            </div>
                        </div>
                    </div>

                    {/* Email Body */}
                    <div className="prose prose-sm max-w-none text-gray-900 leading-relaxed mb-4">
                        {email.is_html ? (
                            <iframe
                                srcDoc={`
                  <base target="_blank" />
                  <style>
                    body {
                      background-color: ${
                                    theme === "dark" ? "#ffffff" : "#ffffff"
                                };
                      color: ${theme === "dark" ? "#111827" : "#111827"};
                      font-family: ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif;
                      margin: 0;
                      padding: 0;
                      font-size: 0.875rem;
                      line-height: 1.625;
                    }
                    a { color: ${theme === "dark" ? "#60a5fa" : "#2563eb"}; }
                    p { margin-bottom: 1em; }
                    img { max-width: 100%; height: auto; display: block; }
                  </style>
                  ${processEmailBody(email.body, email.attachments)}
                `}
                                title="Email Content"
                                className="w-full border-none bg-transparent overflow-hidden"
                                sandbox="allow-same-origin allow-popups allow-popups-to-escape-sandbox"
                                style={{ minHeight: "100px" }}
                                onLoad={(e) => {
                                    const iframe = e.currentTarget;
                                    if (iframe.contentWindow) {
                                        const height =
                                            iframe.contentWindow.document.documentElement
                                                .scrollHeight;
                                        iframe.style.height = `${height + 20}px`;
                                    }
                                }}
                            />
                        ) : (
                            <pre className="whitespace-pre-wrap font-sans text-gray-900 text-sm">
                {email.body}
              </pre>
                        )}
                    </div>

                    <hr className="border-gray-200 my-4" />

                    {/* Attachments */}
                    {email.attachments && email.attachments.length > 0 && (
                        <div className="mb-4">
                            <h3 className="text-xs font-semibold text-gray-900 mb-2">
                                {email.attachments.length} Tệp đính kèm
                            </h3>
                            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                                {email.attachments.map((attachment) => {
                                    const iconName = getFileIcon(attachment.mime_type);
                                    const canView = isViewableFileType(attachment.mime_type);
                                    return (
                                        <div
                                            key={attachment.id}
                                            className="flex items-center gap-2 bg-gray-100 p-2 rounded-lg"
                                        >
                      <span
                          className={cn(
                              "material-symbols-outlined text-[20px]",
                              iconName === "picture_as_pdf"
                                  ? "text-red-400"
                                  : "text-blue-400"
                          )}
                      >
                        {iconName}
                      </span>
                                            <div className="flex-1 min-w-0">
                                                <p className="text-xs font-medium text-gray-900 truncate">
                                                    {attachment.name}
                                                </p>
                                                <p className="text-[10px] text-gray-500">
                                                    {formatFileSize(attachment.size)}
                                                </p>
                                            </div>
                                            <div className="flex items-center gap-1">
                                                {canView && (
                                                    <Button
                                                        variant="ghost"
                                                        size="icon"
                                                        className="h-8 w-8 rounded-full hover:bg-gray-200"
                                                        title="Xem"
                                                        onClick={() =>
                                                            handleViewAttachment(
                                                                attachment.id,
                                                                attachment.name,
                                                                attachment.mime_type
                                                            )
                                                        }
                                                    >
                                                        <span className="material-symbols-outlined text-gray-500 text-[18px]">
                                                            visibility
                                                        </span>
                                                    </Button>
                                                )}
                                                <Button
                                                    variant="ghost"
                                                    size="icon"
                                                    className="h-8 w-8 rounded-full hover:bg-gray-200"
                                                    title="Tải xuống"
                                                    onClick={() =>
                                                        handleDownloadAttachment(
                                                            attachment.id,
                                                            attachment.name
                                                        )
                                                    }
                                                >
                                                    <span className="material-symbols-outlined text-gray-500 text-[18px]">
                                                        download
                                                    </span>
                                                </Button>
                                            </div>
                                        </div>
                                    );
                                })}
                            </div>
                        </div>
                    )}

                    {/* Action Buttons (Moved inside content) */}
                    <div className="flex items-center gap-2 mt-4 pt-4 border-t border-gray-200">
                        <Button
                            onClick={handleReply}
                            variant="secondary"
                            className="gap-2 px-3 py-1.5 h-auto text-xs font-semibold rounded-lg bg-gray-100 hover:bg-gray-200 text-gray-900 shadow-none border-none"
                            disabled={!onReply}
                        >
                            <span className="material-symbols-outlined text-sm">reply</span>
                            Trả lời
                        </Button>
                        <Button
                            onClick={handleReplyAll}
                            variant="secondary"
                            className="gap-2 px-3 py-1.5 h-auto text-xs font-semibold rounded-lg bg-gray-100 hover:bg-gray-200 text-gray-900 shadow-none border-none"
                            disabled={!onReplyAll}
                        >
              <span className="material-symbols-outlined text-sm">
                reply_all
              </span>
                            Trả lời tất cả
                        </Button>
                        <Button
                            className="gap-2 px-3 py-1.5 h-auto text-xs font-semibold rounded-lg bg-gray-100 hover:bg-gray-200 text-gray-900 shadow-none border-none"
                            onClick={handleForward}
                            variant="secondary"
                            disabled={!onForward}
                        >
                            <span className="material-symbols-outlined text-sm">forward</span>
                            Chuyển tiếp
                        </Button>
                    </div>
                </div>
            </div>
            
            {/* Attachment Viewer Dialog */}
            <Dialog 
                open={!!viewerAttachment} 
                onOpenChange={(open) => {
                    if (!open && viewerAttachment) {
                        // Clean up object URL when closing dialog
                        if (viewerAttachment.url.startsWith("blob:")) {
                            URL.revokeObjectURL(viewerAttachment.url);
                        }
                        setViewerAttachment(null);
                        setNumPages(null);
                        setPdfError(null);
                        setPdfLoading(false);
                    }
                }}
            >
                <DialogContent className="max-w-[90vw] max-h-[90vh] w-full h-full flex flex-col p-0">
                    <DialogHeader className="px-6 py-4 border-b shrink-0">
                        <DialogTitle className="text-lg font-semibold">
                            {viewerAttachment?.name}
                        </DialogTitle>
                    </DialogHeader>
                    <div className="flex-1 overflow-auto p-6">
                        {viewerAttachment && (
                            <>
                                {viewerAttachment.mimeType.startsWith("image/") ? (
                                    <img
                                        src={viewerAttachment.url}
                                        alt={viewerAttachment.name}
                                        className="max-w-full max-h-full mx-auto object-contain"
                                    />
                                ) : viewerAttachment.mimeType === "application/pdf" ? (
                                    <div className="flex flex-col items-center">
                                        {pdfLoading && (
                                            <div className="mb-4 text-gray-500">
                                                Đang tải PDF...
                                            </div>
                                        )}
                                        {pdfError && (
                                            <div className="mb-4 text-red-500">
                                                {pdfError}
                                            </div>
                                        )}
                                        <Document
                                            file={viewerAttachment.url}
                                            onLoadSuccess={({ numPages }) => {
                                                setNumPages(numPages);
                                                setPdfLoading(false);
                                                setPdfError(null);
                                            }}
                                            onLoadError={(error) => {
                                                setPdfError(`Lỗi tải PDF: ${error.message}`);
                                                setPdfLoading(false);
                                            }}
                                            loading={
                                                <div className="text-gray-500">
                                                    Đang tải PDF...
                                                </div>
                                            }
                                            className="flex flex-col items-center"
                                        >
                                            {numPages &&
                                                Array.from({ length: numPages }, (_, idx) => (
                                                    <div
                                                        key={`pdf_page_${idx + 1}`}
                                                        className="mb-4 border border-gray-300 shadow-lg"
                                                    >
                                                        <Page
                                                            pageNumber={idx + 1}
                                                            renderTextLayer={true}
                                                            renderAnnotationLayer={true}
                                                            width={Math.min(800, window.innerWidth * 0.8)}
                                                        />
                                                    </div>
                                                ))}
                                        </Document>
                                    </div>
                                ) : viewerAttachment.mimeType.startsWith("text/") ? (
                                    <iframe
                                        src={viewerAttachment.url}
                                        className="w-full h-full min-h-[400px] border-0"
                                        title={viewerAttachment.name}
                                    />
                                ) : viewerAttachment.mimeType.startsWith("video/") ? (
                                    <video
                                        src={viewerAttachment.url}
                                        controls
                                        className="max-w-full max-h-full mx-auto"
                                    />
                                ) : viewerAttachment.mimeType.startsWith("audio/") ? (
                                    <audio
                                        src={viewerAttachment.url}
                                        controls
                                        className="w-full"
                                    />
                                ) : (
                                    viewerAttachment.mimeType === "application/vnd.openxmlformats-officedocument.wordprocessingml.document" ||
                                    viewerAttachment.mimeType === "application/msword"
                                ) ? (
                                    <div className="w-full h-full overflow-auto">
                                        {fileLoading && (
                                            <div className="text-center text-gray-500 py-8">
                                                Đang tải tài liệu...
                                            </div>
                                        )}
                                        {fileError && (
                                            <div className="text-center text-red-500 py-8">
                                                {fileError}
                                            </div>
                                        )}
                                        {docxContent && (
                                            <div
                                                className="prose max-w-none p-4 bg-white"
                                                dangerouslySetInnerHTML={{ __html: docxContent }}
                                            />
                                        )}
                                    </div>
                                ) : (
                                    viewerAttachment.mimeType === "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" ||
                                    viewerAttachment.mimeType === "application/vnd.ms-excel"
                                ) ? (
                                    <div className="w-full h-full overflow-auto">
                                        {fileLoading && (
                                            <div className="text-center text-gray-500 py-8">
                                                Đang tải bảng tính...
                                            </div>
                                        )}
                                        {fileError && (
                                            <div className="text-center text-red-500 py-8">
                                                {fileError}
                                            </div>
                                        )}
                                        {xlsxContent && (
                                            <div
                                                className="p-4 bg-white overflow-auto"
                                                dangerouslySetInnerHTML={{ __html: xlsxContent }}
                                            />
                                        )}
                                    </div>
                                ) : viewerAttachment.mimeType === "application/json" ? (
                                    <div className="w-full h-full overflow-auto">
                                        {fileLoading && (
                                            <div className="text-center text-gray-500 py-8">
                                                Đang tải JSON...
                                            </div>
                                        )}
                                        {fileError && (
                                            <div className="text-center text-red-500 py-8">
                                                {fileError}
                                            </div>
                                        )}
                                        {jsonContent !== null && (
                                            <pre className="p-4 bg-gray-50 rounded-lg overflow-auto text-sm">
                                                <code>{JSON.stringify(jsonContent, null, 2)}</code>
                                            </pre>
                                        )}
                                    </div>
                                ) : (
                                    <div className="flex items-center justify-center h-full">
                                        <p className="text-gray-500">
                                            Không thể xem trước loại file này. Vui lòng tải xuống để xem.
                                        </p>
                                    </div>
                                )}
                            </>
                        )}
                    </div>
                </DialogContent>
            </Dialog>
        </div>
    );
}
