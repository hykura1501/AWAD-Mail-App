package repository

import emaildomain "ga03-backend/internal/email/domain"

// EmailRepository defines the interface for email repository operations
type EmailRepository interface {
	GetAllMailboxes() ([]*emaildomain.Mailbox, error)
	GetMailboxByID(id string) (*emaildomain.Mailbox, error)
	GetEmailsByMailbox(mailboxID string, limit, offset int) ([]*emaildomain.Email, int, error)
	GetEmailByID(id string) (*emaildomain.Email, error)
	UpdateEmail(email *emaildomain.Email) error
}

