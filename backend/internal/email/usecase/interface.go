package usecase

import (
	"context"
	emaildomain "ga03-backend/internal/email/domain"
	"mime/multipart"
	"time"
)

// EmailUsecase defines the interface for email use cases
type EmailUsecase interface {
	GetAllMailboxes(userID string) ([]*emaildomain.Mailbox, error)
	GetMailboxByID(id string) (*emaildomain.Mailbox, error)
	GetEmailsByMailbox(userID, mailboxID string, limit, offset int, query string) ([]*emaildomain.Email, int, error)
	GetEmailsByStatus(userID, status string, limit, offset int) ([]*emaildomain.Email, int, error)
	GetEmailByID(userID, id string) (*emaildomain.Email, error)
	GetAttachment(userID, messageID, attachmentID string) (*emaildomain.Attachment, []byte, error)
	MarkEmailAsRead(userID, id string) error
	MarkEmailAsUnread(userID, id string) error
	ToggleStar(userID, id string) error
	SendEmail(userID, to, cc, bcc, subject, body string, files []*multipart.FileHeader) error
	TrashEmail(userID, id string) error
	ArchiveEmail(userID, id string) error
	PermanentDeleteEmail(userID, id string) error
	WatchMailbox(userID string) error
	SummarizeEmail(ctx context.Context, emailID string) (string, error)
	MoveEmailToMailbox(userID, emailID, mailboxID, sourceColumnID string) error
	SnoozeEmail(userID, emailID string, snoozeUntil time.Time) error
	UnsnoozeEmail(userID, emailID string) (targetColumn string, err error)
	FuzzySearch(userID, query string, limit, offset int) ([]*emaildomain.Email, int, error)
	SemanticSearch(userID, query string, limit, offset int) ([]*emaildomain.Email, int, error)
	GetSearchSuggestions(userID, query string, limit int) ([]string, error)
	StoreEmailEmbedding(ctx context.Context, userID, emailID, subject, body string) error
	UpsertEmailEmbedding(ctx context.Context, userID, emailID, subject, body string) error
	SyncAllEmailsForUser(userID string) // Sync all emails for a user to vector DB (async, non-blocking)
	// Kanban Column Management
	GetKanbanColumns(userID string) ([]*emaildomain.KanbanColumn, error)
	CreateKanbanColumn(userID string, column *emaildomain.KanbanColumn) error
	UpdateKanbanColumn(userID string, column *emaildomain.KanbanColumn) error
	DeleteKanbanColumn(userID, columnID string) error
	UpdateKanbanColumnOrders(userID string, orders map[string]int) error
	SetGeminiService(svc interface {
		SummarizeEmail(ctx context.Context, emailText string) (string, error)
	})
	SetVectorSearchService(svc VectorSearchService)
}
