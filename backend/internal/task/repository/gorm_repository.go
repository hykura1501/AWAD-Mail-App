package repository

import (
	"ga03-backend/internal/task/domain"
	"time"

	"github.com/google/uuid"
	"gorm.io/gorm"
)

// gormTaskRepository implements TaskRepository using GORM
type gormTaskRepository struct {
	db *gorm.DB
}

// NewGormTaskRepository creates a new GORM-based TaskRepository
func NewGormTaskRepository(db *gorm.DB) TaskRepository {
	// Auto-migrate the Task model
	db.AutoMigrate(&domain.Task{})
	return &gormTaskRepository{db: db}
}

func (r *gormTaskRepository) Create(task *domain.Task) error {
	if task.ID == "" {
		task.ID = uuid.New().String()
	}
	task.CreatedAt = time.Now()
	task.UpdatedAt = time.Now()
	return r.db.Create(task).Error
}

func (r *gormTaskRepository) FindByID(id string) (*domain.Task, error) {
	var task domain.Task
	err := r.db.Where("id = ?", id).First(&task).Error
	if err != nil {
		if err == gorm.ErrRecordNotFound {
			return nil, nil
		}
		return nil, err
	}
	return &task, nil
}

func (r *gormTaskRepository) FindByUserID(userID string, status *domain.TaskStatus, limit, offset int) ([]*domain.Task, int64, error) {
	var tasks []*domain.Task
	var total int64

	query := r.db.Model(&domain.Task{}).Where("user_id = ?", userID)
	
	if status != nil {
		query = query.Where("status = ?", *status)
	}

	// Count total
	if err := query.Count(&total).Error; err != nil {
		return nil, 0, err
	}

	// Fetch with pagination, ordered by due_date (nulls last), then created_at
	err := query.Order("CASE WHEN due_date IS NULL THEN 1 ELSE 0 END, due_date ASC, created_at DESC").
		Limit(limit).Offset(offset).Find(&tasks).Error
	
	return tasks, total, err
}

func (r *gormTaskRepository) Update(task *domain.Task) error {
	task.UpdatedAt = time.Now()
	return r.db.Save(task).Error
}

func (r *gormTaskRepository) Delete(id string) error {
	return r.db.Delete(&domain.Task{}, "id = ?", id).Error
}

func (r *gormTaskRepository) FindPendingReminders(now time.Time) ([]*domain.Task, error) {
	var tasks []*domain.Task
	err := r.db.Where("reminder_at <= ? AND reminder_sent = ? AND status != ?", 
		now, false, domain.TaskStatusCompleted).Find(&tasks).Error
	return tasks, err
}

func (r *gormTaskRepository) MarkReminderSent(id string) error {
	return r.db.Model(&domain.Task{}).Where("id = ?", id).
		Updates(map[string]interface{}{
			"reminder_sent": true,
			"updated_at":    time.Now(),
		}).Error
}
