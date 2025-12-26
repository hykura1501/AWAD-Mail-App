package domain

import "time"

// EmailSummary stores cached AI-generated summaries for emails
type EmailSummary struct {
	ID        string    `json:"id" gorm:"primaryKey"`
	UserID    string    `json:"user_id" gorm:"index:idx_user_email;not null"`
	EmailID   string    `json:"email_id" gorm:"index:idx_user_email;uniqueIndex:idx_user_email_unique;not null"`
	Summary   string    `json:"summary" gorm:"type:text"`
	CreatedAt time.Time `json:"created_at"`
}

// TableName specifies the table name for GORM
func (EmailSummary) TableName() string {
	return "email_summaries"
}
