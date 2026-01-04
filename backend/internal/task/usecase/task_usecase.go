package usecase

import (
	"context"
	"errors"
	"ga03-backend/internal/task/domain"
	"ga03-backend/internal/task/repository"
	"ga03-backend/pkg/ai"
	"log"
	"time"

	"github.com/google/uuid"
)

// taskUsecase implements TaskUsecase interface
type taskUsecase struct {
	taskRepo      repository.TaskRepository
	geminiService ai.SummarizerService
	emailFetcher  EmailFetcher
}

// NewTaskUsecase creates a new instance of taskUsecase
func NewTaskUsecase(taskRepo repository.TaskRepository) TaskUsecase {
	return &taskUsecase{
		taskRepo: taskRepo,
	}
}

func (u *taskUsecase) SetGeminiService(svc ai.SummarizerService) {
	u.geminiService = svc
}

func (u *taskUsecase) SetEmailFetcher(fetcher EmailFetcher) {
	u.emailFetcher = fetcher
}

func (u *taskUsecase) CreateTask(userID, title, description string, dueDate, reminderAt *string, priority string) (*domain.Task, error) {
	task := &domain.Task{
		ID:          uuid.New().String(),
		UserID:      userID,
		Title:       title,
		Description: description,
		Priority:    parsePriority(priority),
		Status:      domain.TaskStatusPending,
		CreatedAt:   time.Now(),
		UpdatedAt:   time.Now(),
	}

	if dueDate != nil && *dueDate != "" {
		if t, err := time.Parse(time.RFC3339, *dueDate); err == nil {
			task.DueDate = &t
		}
	}

	if reminderAt != nil && *reminderAt != "" {
		if t, err := time.Parse(time.RFC3339, *reminderAt); err == nil {
			task.ReminderAt = &t
		}
	}

	if err := u.taskRepo.Create(task); err != nil {
		return nil, err
	}

	return task, nil
}

func (u *taskUsecase) GetTaskByID(userID, taskID string) (*domain.Task, error) {
	task, err := u.taskRepo.FindByID(taskID)
	if err != nil {
		return nil, err
	}
	if task == nil {
		return nil, errors.New("task not found")
	}
	if task.UserID != userID {
		return nil, errors.New("unauthorized")
	}
	return task, nil
}

func (u *taskUsecase) GetUserTasks(userID string, status *string, limit, offset int) ([]*domain.Task, int64, error) {
	var statusFilter *domain.TaskStatus
	if status != nil && *status != "" {
		s := domain.TaskStatus(*status)
		statusFilter = &s
	}
	return u.taskRepo.FindByUserID(userID, statusFilter, limit, offset)
}

func (u *taskUsecase) UpdateTask(userID, taskID string, updates TaskUpdateRequest) (*domain.Task, error) {
	task, err := u.GetTaskByID(userID, taskID)
	if err != nil {
		return nil, err
	}

	if updates.Title != nil {
		task.Title = *updates.Title
	}
	if updates.Description != nil {
		task.Description = *updates.Description
	}
	if updates.Priority != nil {
		task.Priority = parsePriority(*updates.Priority)
	}
	if updates.Status != nil {
		task.Status = domain.TaskStatus(*updates.Status)
	}
	if updates.DueDate != nil {
		if *updates.DueDate == "" {
			task.DueDate = nil
		} else if t, err := time.Parse(time.RFC3339, *updates.DueDate); err == nil {
			task.DueDate = &t
		}
	}
	if updates.ReminderAt != nil {
		if *updates.ReminderAt == "" {
			task.ReminderAt = nil
			task.ReminderSent = false
		} else if t, err := time.Parse(time.RFC3339, *updates.ReminderAt); err == nil {
			task.ReminderAt = &t
			task.ReminderSent = false // Reset reminder status when time changes
		}
	}

	task.UpdatedAt = time.Now()
	if err := u.taskRepo.Update(task); err != nil {
		return nil, err
	}

	return task, nil
}

func (u *taskUsecase) DeleteTask(userID, taskID string) error {
	task, err := u.GetTaskByID(userID, taskID)
	if err != nil {
		return err
	}
	return u.taskRepo.Delete(task.ID)
}

func (u *taskUsecase) ExtractTasksFromEmail(ctx context.Context, userID, emailID string) ([]*domain.Task, error) {
	if u.geminiService == nil {
		return nil, errors.New("AI service not configured")
	}
	if u.emailFetcher == nil {
		return nil, errors.New("email fetcher not configured")
	}

	// Get email content
	subject, body, err := u.emailFetcher.GetEmailByID(userID, emailID)
	if err != nil {
		return nil, err
	}

	emailText := "Subject: " + subject + "\n\n" + body

	// Extract tasks using AI
	log.Printf("[TaskUsecase] Extracting tasks from email %s for user %s", emailID, userID)
	extractions, err := u.geminiService.ExtractTasksFromEmail(ctx, emailText)
	if err != nil {
		return nil, err
	}

	log.Printf("[TaskUsecase] AI extracted %d tasks from email", len(extractions))

	// Create tasks from extractions
	var tasks []*domain.Task
	for _, extraction := range extractions {
		task := &domain.Task{
			ID:          uuid.New().String(),
			UserID:      userID,
			EmailID:     emailID,
			Title:       extraction.Title,
			Description: extraction.Description,
			DueDate:     extraction.DueDate,
			Priority:    domain.Priority(extraction.Priority),
			Status:      domain.TaskStatusPending,
			CreatedAt:   time.Now(),
			UpdatedAt:   time.Now(),
		}

		// Set default reminder (1 hour before due date if exists)
		if task.DueDate != nil {
			reminderTime := task.DueDate.Add(-1 * time.Hour)
			if reminderTime.After(time.Now()) {
				task.ReminderAt = &reminderTime
			}
		}

		if err := u.taskRepo.Create(task); err != nil {
			log.Printf("[TaskUsecase] Failed to create task: %v", err)
			continue
		}
		tasks = append(tasks, task)
	}

	return tasks, nil
}

func parsePriority(p string) domain.Priority {
	switch p {
	case "high":
		return domain.PriorityHigh
	case "low":
		return domain.PriorityLow
	default:
		return domain.PriorityMedium
	}
}
