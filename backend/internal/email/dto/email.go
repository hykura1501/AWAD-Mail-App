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
	Subject string                  `form:"subject"`
	Body    string                  `form:"body"`
	Files   []*multipart.FileHeader `form:"files"`
}

