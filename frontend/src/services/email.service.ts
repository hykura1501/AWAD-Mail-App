import apiClient from '@/lib/api-client';
import type { Mailbox, Email, EmailsResponse } from '@/types/email';

export const emailService = {
  getAllMailboxes: async (): Promise<Mailbox[]> => {
    const response = await apiClient.get<{ mailboxes: Mailbox[] }>('/emails/mailboxes');
    return response.data.mailboxes;
  },

  getMailboxById: async (id: string): Promise<Mailbox> => {
    const response = await apiClient.get<Mailbox>(`/emails/mailboxes/${id}`);
    return response.data;
  },

  getEmailsByMailbox: async (
    mailboxId: string,
    limit = 50,
    offset = 0
  ): Promise<EmailsResponse> => {
    const response = await apiClient.get<EmailsResponse>(
      `/emails/mailboxes/${mailboxId}/emails`,
      {
        params: { limit, offset },
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

  toggleStar: async (id: string): Promise<Email> => {
    const response = await apiClient.patch<Email>(`/emails/${id}/star`);
    return response.data;
  },
};

