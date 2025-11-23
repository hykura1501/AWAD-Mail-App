package domain

import (
	"context"
	"mime/multipart"

	"golang.org/x/oauth2"
)

// TokenUpdateFunc is a callback function that handles token updates
type TokenUpdateFunc func(token *oauth2.Token) error

// MailProvider defines the interface for email service providers
type MailProvider interface {
	GetMailboxes(ctx context.Context, accessToken, refreshToken string, onTokenRefresh TokenUpdateFunc) ([]*Mailbox, error)
	GetEmails(ctx context.Context, accessToken, refreshToken, mailboxID string, limit, offset int, query string, onTokenRefresh TokenUpdateFunc) ([]*Email, int, error)
	GetEmailByID(ctx context.Context, accessToken, refreshToken, messageID string, onTokenRefresh TokenUpdateFunc) (*Email, error)
	GetAttachment(ctx context.Context, accessToken, refreshToken, messageID, attachmentID string, onTokenRefresh TokenUpdateFunc) (*Attachment, []byte, error)
	SendEmail(ctx context.Context, accessToken, refreshToken, to, subject, body string, files []*multipart.FileHeader, onTokenRefresh TokenUpdateFunc) error
	TrashEmail(ctx context.Context, accessToken, refreshToken, emailID string, onTokenRefresh TokenUpdateFunc) error
	ArchiveEmail(ctx context.Context, accessToken, refreshToken, emailID string, onTokenRefresh TokenUpdateFunc) error
	MarkAsRead(ctx context.Context, accessToken, refreshToken, messageID string, onTokenRefresh TokenUpdateFunc) error
	MarkAsUnread(ctx context.Context, accessToken, refreshToken, messageID string, onTokenRefresh TokenUpdateFunc) error
	ToggleStar(ctx context.Context, accessToken, refreshToken, messageID string, onTokenRefresh TokenUpdateFunc) error
	Watch(ctx context.Context, accessToken, refreshToken string, topicName string, onTokenRefresh TokenUpdateFunc) error
	Stop(ctx context.Context, accessToken, refreshToken string, onTokenRefresh TokenUpdateFunc) error
	ValidateToken(ctx context.Context, accessToken, refreshToken string, onTokenRefresh TokenUpdateFunc) error
}
