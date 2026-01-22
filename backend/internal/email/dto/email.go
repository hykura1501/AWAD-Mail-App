package dto

import (
	"fmt"
	emaildomain "ga03-backend/internal/email/domain"
	"mime/multipart"
	"regexp"
	"strings"
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
	To      string                  `form:"to" binding:"required"`
	Cc      string                  `form:"cc"`
	Bcc     string                  `form:"bcc"`
	Subject string                  `form:"subject"`
	Body    string                  `form:"body"`
	Files   []*multipart.FileHeader `form:"files"`
	// Inline images with Content-ID for embedding in HTML body
	InlineImages     []*multipart.FileHeader `form:"inline_images"`
	InlineImagesMeta string                  `form:"inline_images_meta"` // JSON: [{"filename":"x","content_id":"y"}]
}

// ValidateEmailList validates a comma-separated list of email addresses
func ValidateEmailList(emailList string) error {
	if emailList == "" {
		return nil // Empty is allowed for optional fields
	}

	// Split by comma and validate each email
	emails := strings.Split(emailList, ",")
	emailRegex := regexp.MustCompile(`^[a-zA-Z0-9._%+\-]+@[a-zA-Z0-9.\-]+\.[a-zA-Z]{2,}$`)

	for _, email := range emails {
		email = strings.TrimSpace(email)
		if email == "" {
			continue // Skip empty entries
		}
		if !emailRegex.MatchString(email) {
			return fmt.Errorf("invalid email address: %s", email)
		}
	}

	return nil
}

// InlineImageMeta represents metadata for an inline image
type InlineImageMeta struct {
	Filename  string `json:"filename"`
	ContentID string `json:"content_id"`
}

// BulkOperationRequest for bulk email operations
type BulkOperationRequest struct {
	EmailIDs []string `json:"email_ids" binding:"required"`
	Action   string   `json:"action" binding:"required"` // mark_read, mark_unread, trash, permanent_delete
}
