package domain

import "time"

// EmailKanbanColumn represents the mapping between an email and a Kanban column
// This is used to track which emails belong to which custom Kanban columns
type EmailKanbanColumn struct {
	ID               string    `json:"id" gorm:"primaryKey"`
	UserID           string    `json:"user_id" gorm:"index:idx_user_email_column;not null"`
	EmailID          string    `json:"email_id" gorm:"index:idx_user_email_column;not null"`
	ColumnID         string    `json:"column_id" gorm:"index:idx_user_email_column;not null"` // Kanban column ID (custom or default)
	PreviousColumnID string     `json:"previous_column_id"`                                    // Column before snooze (for restore)
	SnoozedUntil     *time.Time `json:"snoozed_until,omitempty"`                               // Expiration time for snooze
	CreatedAt        time.Time  `json:"created_at"`
	UpdatedAt        time.Time  `json:"updated_at"`
}
