package usecase

import emaildomain "ga03-backend/internal/email/domain"
import "mime/multipart"

// EmailUsecase defines the interface for email use cases
type EmailUsecase interface {
	GetAllMailboxes(userID string) ([]*emaildomain.Mailbox, error)
	GetMailboxByID(id string) (*emaildomain.Mailbox, error)
	GetEmailsByMailbox(userID, mailboxID string, limit, offset int, query string) ([]*emaildomain.Email, int, error)
	GetEmailByID(userID, id string) (*emaildomain.Email, error)
	GetAttachment(userID, messageID, attachmentID string) (*emaildomain.Attachment, []byte, error)
	MarkEmailAsRead(userID, id string) error
	MarkEmailAsUnread(userID, id string) error
	ToggleStar(userID, id string) error
	SendEmail(userID, to, subject, body string, files []*multipart.FileHeader) error
	TrashEmail(userID, id string) error
	ArchiveEmail(userID, id string) error
	WatchMailbox(userID string) error
}

