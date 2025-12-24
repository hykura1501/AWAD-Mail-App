import apiClient from "@/lib/api-client";
import type {
  Mailbox,
  Email,
  EmailsResponse,
  KanbanColumnConfig,
} from "@/types/email";

export const emailService = {
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

  sendEmail: async (
    to: string,
    cc: string,
    bcc: string,
    subject: string,
    body: string,
    files: File[] = []
  ): Promise<void> => {
    const formData = new FormData();
    formData.append("to", to);
    formData.append("cc", cc);
    formData.append("bcc", bcc);
    formData.append("subject", subject);
    formData.append("body", body);
    files.forEach((file) => {
      formData.append("files", file);
    });

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
};
