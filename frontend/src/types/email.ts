export interface Mailbox {
  id: string;
  name: string;
  type: string;
  count: number;
}

export interface Attachment {
  id: string;
  name: string;
  size: number;
  mime_type: string;
  url?: string;
}

export interface Email {
  id: string;
  mailbox_id: string;
  from: string;
  from_name: string;
  to: string[];
  cc?: string[];
  subject: string;
  preview: string;
  body: string;
  is_html: boolean;
  is_read: boolean;
  is_starred: boolean;
  is_important: boolean;
  attachments?: Attachment[];
  received_at: string;
  created_at: string;
}

export interface EmailsResponse {
  emails: Email[];
  limit: number;
  offset: number;
  total: number;
}

