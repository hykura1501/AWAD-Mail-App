package usecase

import (
	"context"
	"ga03-backend/internal/task/domain"
	"ga03-backend/pkg/ai"
)

// TaskUsecase defines the interface for task business logic
type TaskUsecase interface {
	// CreateTask creates a new task manually
	CreateTask(userID, title, description string, dueDate, reminderAt *string, priority string) (*domain.Task, error)
	
	// GetTaskByID retrieves a task by ID (with ownership check)
	GetTaskByID(userID, taskID string) (*domain.Task, error)
	
	// GetUserTasks retrieves all tasks for a user with optional status filter
	GetUserTasks(userID string, status *string, limit, offset int) ([]*domain.Task, int64, error)
	
	// UpdateTask updates an existing task
	UpdateTask(userID, taskID string, updates TaskUpdateRequest) (*domain.Task, error)
	
	// DeleteTask deletes a task
	DeleteTask(userID, taskID string) error
	
	// ExtractTasksFromEmail uses AI to extract tasks from an email
	ExtractTasksFromEmail(ctx context.Context, userID, emailID string) ([]*domain.Task, error)
	
	// SetGeminiService sets the AI service for task extraction
	SetGeminiService(svc ai.SummarizerService)
	
	// SetEmailFetcher sets the email fetcher for getting email content
	SetEmailFetcher(fetcher EmailFetcher)
}

// TaskUpdateRequest represents the fields that can be updated
type TaskUpdateRequest struct {
	Title       *string `json:"title,omitempty"`
	Description *string `json:"description,omitempty"`
	DueDate     *string `json:"due_date,omitempty"`
	Priority    *string `json:"priority,omitempty"`
	Status      *string `json:"status,omitempty"`
	ReminderAt  *string `json:"reminder_at,omitempty"`
}

// EmailFetcher defines the interface for fetching email content
type EmailFetcher interface {
	GetEmailByID(userID, id string) (subject, body string, err error)
}

