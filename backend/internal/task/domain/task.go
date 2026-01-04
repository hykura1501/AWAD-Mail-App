package domain

import "time"

// Priority represents task priority level
type Priority string

const (
	PriorityHigh   Priority = "high"
	PriorityMedium Priority = "medium"
	PriorityLow    Priority = "low"
)

// TaskStatus represents the current state of a task
type TaskStatus string

const (
	TaskStatusPending    TaskStatus = "pending"
	TaskStatusInProgress TaskStatus = "in_progress"
	TaskStatusCompleted  TaskStatus = "completed"
)

// Task represents a to-do item extracted from email or created manually
type Task struct {
	ID          string     `json:"id" gorm:"primaryKey"`
	UserID      string     `json:"user_id" gorm:"index;not null"`
	EmailID     string     `json:"email_id,omitempty" gorm:"index"` // Optional link to source email
	Title       string     `json:"title" gorm:"not null"`
	Description string     `json:"description,omitempty"`
	DueDate     *time.Time `json:"due_date,omitempty"`
	Priority    Priority   `json:"priority" gorm:"default:medium"`
	Status      TaskStatus `json:"status" gorm:"default:pending"`
	ReminderAt  *time.Time `json:"reminder_at,omitempty"`           // When to send FCM reminder
	ReminderSent bool      `json:"reminder_sent" gorm:"default:false"` // Track if reminder was sent
	CreatedAt   time.Time  `json:"created_at"`
	UpdatedAt   time.Time  `json:"updated_at"`
}

// TaskExtraction represents the AI-extracted task data from an email
type TaskExtraction struct {
	Title       string     `json:"title"`
	Description string     `json:"description,omitempty"`
	DueDate     *time.Time `json:"due_date,omitempty"`
	Priority    Priority   `json:"priority"`
}
