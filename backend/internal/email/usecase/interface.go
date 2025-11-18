package usecase

import emaildomain "ga03-backend/internal/email/domain"

// EmailUsecase defines the interface for email use cases
type EmailUsecase interface {
	GetAllMailboxes() ([]*emaildomain.Mailbox, error)
	GetMailboxByID(id string) (*emaildomain.Mailbox, error)
	GetEmailsByMailbox(mailboxID string, limit, offset int) ([]*emaildomain.Email, int, error)
	GetEmailByID(id string) (*emaildomain.Email, error)
	MarkEmailAsRead(id string) error
	ToggleStar(id string) error
}

