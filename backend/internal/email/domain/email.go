package domain

import "time"

type Mailbox struct {
	ID    string `json:"id"`
	Name  string `json:"name"`
	Type  string `json:"type"`  // "inbox", "sent", "drafts", etc.
	Count int    `json:"count"` // unread count for inbox
}

type Email struct {
	ID          string       `json:"id"`
	MailboxID   string       `json:"mailbox_id"`
	From        string       `json:"from"`
	FromName    string       `json:"from_name"`
	To          []string     `json:"to"`
	Cc          []string     `json:"cc,omitempty"`
	Subject     string       `json:"subject"`
	Preview     string       `json:"preview"`
	Body        string       `json:"body"`
	IsHTML      bool         `json:"is_html"`
	IsRead      bool         `json:"is_read"`
	IsStarred   bool         `json:"is_starred"`
	IsImportant bool         `json:"is_important"`
	Attachments []Attachment `json:"attachments,omitempty"`
	ReceivedAt  time.Time    `json:"received_at"`
	CreatedAt   time.Time    `json:"created_at"`
}

type Attachment struct {
	ID       string `json:"id"`
	Name     string `json:"name"`
	Size     int64  `json:"size"`
	MimeType string `json:"mime_type"`
	URL      string `json:"url,omitempty"`
}
