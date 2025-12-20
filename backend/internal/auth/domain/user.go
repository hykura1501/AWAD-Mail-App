package domain

import "time"

type User struct {
	ID           string    `json:"id" gorm:"primaryKey"`
	Email        string    `json:"email" gorm:"uniqueIndex;not null"`
	Password     string    `json:"-"` // Never return password in JSON
	Name         string    `json:"name"`
	AvatarURL    string    `json:"avatar_url,omitempty"`
	Provider     string    `json:"provider"` // "email" or "google" or "imap"
	AccessToken  string    `json:"-"`        // Google access token (not returned in JSON)
	RefreshToken string    `json:"-"`        // Google refresh token (not returned in JSON)
	TokenExpiry  time.Time `json:"-"`        // When the access token expires

	// IMAP specific fields
	ImapServer   string `json:"imap_server,omitempty"`
	ImapPort     int    `json:"imap_port,omitempty"`
	ImapPassword string `json:"-"` // Store IMAP password (should be encrypted in production)

	// Email sync status
	EmailsSynced bool `json:"emails_synced" gorm:"default:false"` // Whether all emails have been synced to vector DB

	CreatedAt time.Time `json:"created_at"`
	UpdatedAt time.Time `json:"updated_at"`
}

type RefreshToken struct {
	Token     string    `json:"token" gorm:"primaryKey"`
	UserID    string    `json:"user_id" gorm:"uniqueIndex"`
	ExpiresAt time.Time `json:"expires_at"`
}
