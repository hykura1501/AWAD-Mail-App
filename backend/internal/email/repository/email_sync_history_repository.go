package repository

import (
	"time"

	emaildomain "ga03-backend/internal/email/domain"

	"github.com/google/uuid"
	"gorm.io/gorm"
)

// emailSyncHistoryRepository implements EmailSyncHistoryRepository interface
type emailSyncHistoryRepository struct {
	db *gorm.DB
}

// NewEmailSyncHistoryRepository creates a new instance of emailSyncHistoryRepository
func NewEmailSyncHistoryRepository(db *gorm.DB) EmailSyncHistoryRepository {
	return &emailSyncHistoryRepository{
		db: db,
	}
}

// IsEmailSynced checks if an email has been synced to vector DB for a user
func (r *emailSyncHistoryRepository) IsEmailSynced(userID, emailID string) (bool, error) {
	var history emaildomain.EmailSyncHistory
	err := r.db.Where("user_id = ? AND email_id = ?", userID, emailID).First(&history).Error
	if err != nil {
		if err == gorm.ErrRecordNotFound {
			return false, nil
		}
		return false, err
	}
	return true, nil
}

// MarkEmailAsSynced marks an email as synced to vector DB
func (r *emailSyncHistoryRepository) MarkEmailAsSynced(userID, emailID string) error {
	var history emaildomain.EmailSyncHistory

	// Try to find existing record
	err := r.db.Where("user_id = ? AND email_id = ?", userID, emailID).First(&history).Error

	now := time.Now()
	if err == gorm.ErrRecordNotFound {
		// Create new record
		history = emaildomain.EmailSyncHistory{
			ID:        uuid.New().String(),
			UserID:    userID,
			EmailID:   emailID,
			SyncedAt:  now,
			CreatedAt: now,
			UpdatedAt: now,
		}
		return r.db.Create(&history).Error
	} else if err != nil {
		return err
	}

	// Update existing record
	history.SyncedAt = now
	history.UpdatedAt = now
	return r.db.Save(&history).Error
}

// EnsureEmailSynced checks if email is synced, if not marks it as synced (optimized: 1 query)
// Returns: (wasAlreadySynced bool, error)
func (r *emailSyncHistoryRepository) EnsureEmailSynced(userID, emailID string) (bool, error) {
	var history emaildomain.EmailSyncHistory

	// Use FirstOrCreate to check and create in one query
	now := time.Now()
	result := r.db.Where("user_id = ? AND email_id = ?", userID, emailID).FirstOrCreate(&history, emaildomain.EmailSyncHistory{
		ID:        uuid.New().String(),
		UserID:    userID,
		EmailID:   emailID,
		SyncedAt:  now,
		CreatedAt: now,
		UpdatedAt: now,
	})

	if result.Error != nil {
		return false, result.Error
	}

	// If record was just created (result.RowsAffected > 0), it means it wasn't synced before
	wasAlreadySynced := result.RowsAffected == 0

	return wasAlreadySynced, nil
}

// DeleteSyncHistory deletes sync history for an email (for cleanup purposes)
func (r *emailSyncHistoryRepository) DeleteSyncHistory(userID, emailID string) error {
	return r.db.Where("user_id = ? AND email_id = ?", userID, emailID).Delete(&emaildomain.EmailSyncHistory{}).Error
}
