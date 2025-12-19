package domain

import "time"

// EmailSyncHistory tracks which emails have been synced to the vector database
// This helps avoid unnecessary API calls to Chroma/Gemini
type EmailSyncHistory struct {
	ID        string    `json:"id" gorm:"primaryKey"`
	UserID    string    `json:"user_id" gorm:"index:idx_user_email;not null"`
	EmailID   string    `json:"email_id" gorm:"index:idx_user_email;not null;uniqueIndex:idx_user_email_unique"`
	SyncedAt  time.Time `json:"synced_at"`
	CreatedAt time.Time `json:"created_at"`
	UpdatedAt time.Time `json:"updated_at"`
}
