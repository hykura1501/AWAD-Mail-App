import apiClient from "@/lib/api-client";
import { getAccessToken } from "@/lib/api-client";
import { API_BASE_URL } from "@/config/api";
import type {
  Mailbox,
  Email,
  EmailsResponse,
  KanbanColumnConfig,
  Attachment,
} from "@/types/email";

export const emailService = {
  /**
   * Download an attachment as a File object (for forwarding emails)
   * @param emailId - The email ID containing the attachment
   * @param attachment - The attachment metadata
   * @returns File object that can be used in FormData for sending
   */
  getAttachmentAsFile: async (
    emailId: string,
    attachment: Attachment
  ): Promise<File> => {
    const token = getAccessToken();
    const url = `${API_BASE_URL}/emails/${emailId}/attachments/${attachment.id}?token=${token}`;
    
    const response = await fetch(url);
    if (!response.ok) {
      throw new Error(`Failed to download attachment: ${attachment.name}`);
    }
    
    const blob = await response.blob();
    return new File([blob], attachment.name, { type: attachment.mime_type });
  },
  getEmailsByStatus: async (
    status: string,
    limit = 50,
    offset = 0
  ): Promise<EmailsResponse> => {
    const response = await apiClient.get<EmailsResponse>(
      `/emails/status/${status}`,
      {
        params: { limit, offset },
      }
    );
    return response.data;
  },
  getEmailSummary: async (emailId: string): Promise<string> => {
    const response = await apiClient.get<{ summary: string }>(
      `/emails/${emailId}/summary`
    );
    return response.data.summary;
  },
  moveEmailToMailbox: async (
    emailId: string,
    mailboxId: string,
    sourceColumnId?: string
  ): Promise<void> => {
    await apiClient.patch(`/emails/${emailId}/mailbox`, {
      mailbox_id: mailboxId,
      source_column_id: sourceColumnId,
    });
  },
  snoozeEmail: async (emailId: string, snoozeUntil: Date): Promise<void> => {
    await apiClient.post(`/emails/${emailId}/snooze`, {
      snooze_until: snoozeUntil.toISOString(),
    });
  },
  unsnoozeEmail: async (emailId: string): Promise<{ targetColumn: string }> => {
    const response = await apiClient.post<{ message: string; target_column: string }>(
      `/emails/${emailId}/unsnooze`
    );
    return { targetColumn: response.data.target_column };
  },
  getAllMailboxes: async (): Promise<Mailbox[]> => {
    const response = await apiClient.get<{ mailboxes: Mailbox[] }>(
      "/emails/mailboxes"
    );
    return response.data.mailboxes;
  },

  getMailboxById: async (id: string): Promise<Mailbox> => {
    const response = await apiClient.get<Mailbox>(`/emails/mailboxes/${id}`);
    return response.data;
  },

  getEmailsByMailbox: async (
    mailboxId: string,
    limit = 50,
    offset = 0,
    q = ""
  ): Promise<EmailsResponse> => {
    const response = await apiClient.get<EmailsResponse>(
      `/emails/mailboxes/${mailboxId}/emails`,
      {
        params: { limit, offset, q },
      }
    );
    return response.data;
  },

  getEmailById: async (id: string): Promise<Email> => {
    const response = await apiClient.get<Email>(`/emails/${id}`);
    return response.data;
  },

  markAsRead: async (id: string): Promise<void> => {
    await apiClient.patch(`/emails/${id}/read`);
  },

  markAsUnread: async (id: string): Promise<void> => {
    await apiClient.patch(`/emails/${id}/unread`);
  },

  toggleStar: async (id: string): Promise<Email> => {
    const response = await apiClient.patch<Email>(`/emails/${id}/star`);
    return response.data;
  },

  /**
   * Send an email with optional attachments and inline images
   * 
   * @param inlineImages - Inline images with contentId for CID embedding
   */
  sendEmail: async (
    to: string,
    cc: string,
    bcc: string,
    subject: string,
    body: string,
    files: File[] = [],
    inlineImages: { file: File; contentId: string }[] = []
  ): Promise<void> => {
    const formData = new FormData();
    formData.append("to", to);
    formData.append("cc", cc);
    formData.append("bcc", bcc);
    formData.append("subject", subject);
    formData.append("body", body);
    
    // Regular attachments
    files.forEach((file) => {
      formData.append("files", file);
    });

    // Inline images with Content-ID metadata
    if (inlineImages.length > 0) {
      // Send metadata as JSON
      const inlineMetadata = inlineImages.map((img) => ({
        filename: img.file.name,
        content_id: img.contentId,
      }));
      formData.append("inline_images_meta", JSON.stringify(inlineMetadata));
      
      // Send files
      inlineImages.forEach((img) => {
        formData.append("inline_images", img.file);
      });
    }

    await apiClient.post("/emails/send", formData, {
      headers: {
        "Content-Type": "multipart/form-data",
      },
    });
  },

  trashEmail: async (id: string): Promise<void> => {
    await apiClient.post(`/emails/${id}/trash`);
  },

  archiveEmail: async (id: string): Promise<void> => {
    await apiClient.post(`/emails/${id}/archive`);
  },

  // Permanently delete a single email (for emails in trash)
  permanentDeleteEmail: async (id: string): Promise<void> => {
    await apiClient.delete(`/emails/${id}/permanent`);
  },

  // Bulk operations
  bulkMarkAsRead: async (emailIds: string[]): Promise<{ success_count: number; fail_count: number }> => {
    const response = await apiClient.post<{ success_count: number; fail_count: number }>(
      "/emails/bulk",
      { email_ids: emailIds, action: "mark_read" }
    );
    return response.data;
  },

  bulkMarkAsUnread: async (emailIds: string[]): Promise<{ success_count: number; fail_count: number }> => {
    const response = await apiClient.post<{ success_count: number; fail_count: number }>(
      "/emails/bulk",
      { email_ids: emailIds, action: "mark_unread" }
    );
    return response.data;
  },

  bulkTrash: async (emailIds: string[]): Promise<{ success_count: number; fail_count: number }> => {
    const response = await apiClient.post<{ success_count: number; fail_count: number }>(
      "/emails/bulk",
      { email_ids: emailIds, action: "trash" }
    );
    return response.data;
  },

  bulkPermanentDelete: async (emailIds: string[]): Promise<{ success_count: number; fail_count: number }> => {
    const response = await apiClient.post<{ success_count: number; fail_count: number }>(
      "/emails/bulk",
      { email_ids: emailIds, action: "permanent_delete" }
    );
    return response.data;
  },

  watchMailbox: async (): Promise<void> => {
    await apiClient.post("/emails/watch");
  },

  fuzzySearch: async (
    query: string,
    limit = 10,
    offset = 0
  ): Promise<EmailsResponse> => {
    const response = await apiClient.get<EmailsResponse>("/emails/search", {
      params: { q: query, limit, offset },
    });
    return response.data;
  },

  semanticSearch: async (
    query: string,
    limit = 20,
    offset = 0
  ): Promise<EmailsResponse> => {
    const response = await apiClient.post<EmailsResponse>(
      "/search/semantic",
      { query, limit },
      {
        params: { offset },
      }
    );
    return response.data;
  },

  getSearchSuggestions: async (query: string): Promise<string[]> => {
    const response = await apiClient.get<{ suggestions: string[] }>(
      "/search/suggestions",
      {
        params: { q: query },
      }
    );
    return response.data.suggestions;
  },

  // Kanban Column Management
  getKanbanColumns: async (): Promise<KanbanColumnConfig[]> => {
    const response = await apiClient.get<{ columns: KanbanColumnConfig[] }>(
      "/kanban/columns"
    );
    return response.data.columns;
  },

  createKanbanColumn: async (
    column: Omit<KanbanColumnConfig, "id" | "user_id" | "created_at" | "updated_at">
  ): Promise<KanbanColumnConfig> => {
    const response = await apiClient.post<{ column: KanbanColumnConfig }>(
      "/kanban/columns",
      column
    );
    return response.data.column;
  },

  updateKanbanColumn: async (
    columnId: string,
    column: Partial<KanbanColumnConfig>
  ): Promise<KanbanColumnConfig> => {
    const response = await apiClient.put<{ column: KanbanColumnConfig }>(
      `/kanban/columns/${columnId}`,
      column
    );
    return response.data.column;
  },

  deleteKanbanColumn: async (columnId: string): Promise<void> => {
    await apiClient.delete(`/kanban/columns/${columnId}`);
  },

  updateKanbanColumnOrders: async (
    orders: Record<string, number>
  ): Promise<void> => {
    await apiClient.put("/kanban/columns/orders", { orders });
  },

  // Queue emails for background AI summary generation
  // Returns cached summaries immediately; new summaries arrive via SSE "summary_update"
  queueSummaries: async (
    emailIds: string[]
  ): Promise<{ summaries: Record<string, string>; queued: number }> => {
    const response = await apiClient.post<{
      summaries: Record<string, string>;
      queued: number;
    }>("/kanban/summarize", { email_ids: emailIds });
    return response.data;
  },
};
