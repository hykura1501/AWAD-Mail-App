package dto

import (
	emaildomain "ga03-backend/internal/email/domain"
	"mime/multipart"
)

type MailboxesResponse struct {
	Mailboxes []*emaildomain.Mailbox `json:"mailboxes"`
}

type EmailsResponse struct {
	Emails []*emaildomain.Email `json:"emails"`
	Limit  int                  `json:"limit"`
	Offset int                  `json:"offset"`
	Total  int                  `json:"total"`
}

type SendEmailRequest struct {
	To      string                  `form:"to" binding:"required,email"`
	Cc      string                  `form:"cc"`
	Bcc     string                  `form:"bcc"`
	Subject string                  `form:"subject"`
	Body    string                  `form:"body"`
	Files   []*multipart.FileHeader `form:"files"`
}

// BulkOperationRequest for bulk email operations
type BulkOperationRequest struct {
	EmailIDs []string `json:"email_ids" binding:"required"`
	Action   string   `json:"action" binding:"required"` // mark_read, mark_unread, trash, permanent_delete
}
