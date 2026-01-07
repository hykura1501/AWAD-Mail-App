package repository

import (
	"ga03-backend/internal/task/domain"
	"time"
)

// TaskRepository defines the interface for task data access
type TaskRepository interface {
	// Create creates a new task
	Create(task *domain.Task) error
	
	// FindByID finds a task by its ID
	FindByID(id string) (*domain.Task, error)
	
	// FindByUserID finds all tasks for a user with optional filters
	FindByUserID(userID string, status *domain.TaskStatus, limit, offset int) ([]*domain.Task, int64, error)
	
	// Update updates an existing task
	Update(task *domain.Task) error
	
	// Delete deletes a task by ID
	Delete(id string) error
	
	// FindPendingReminders finds tasks that need reminder notifications
	// Returns tasks where reminder_at <= now AND reminder_sent = false AND status != completed
	FindPendingReminders(now time.Time) ([]*domain.Task, error)
	
	// MarkReminderSent marks a task's reminder as sent
	MarkReminderSent(id string) error
}
