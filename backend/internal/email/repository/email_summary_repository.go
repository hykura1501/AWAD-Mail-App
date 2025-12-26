package repository

import (
	"time"

	emaildomain "ga03-backend/internal/email/domain"

	"github.com/google/uuid"
	"gorm.io/gorm"
)

// EmailSummaryRepository defines the interface for email summary operations
type EmailSummaryRepository interface {
	// GetSummary retrieves a cached summary for an email
	GetSummary(userID, emailID string) (*emaildomain.EmailSummary, error)
	// GetSummaries retrieves cached summaries for multiple emails
	GetSummaries(userID string, emailIDs []string) (map[string]string, error)
	// SaveSummary saves or updates a summary for an email
	SaveSummary(userID, emailID, summary string) error
	// DeleteSummary deletes a summary for an email
	DeleteSummary(userID, emailID string) error
}

// emailSummaryRepository implements EmailSummaryRepository interface
type emailSummaryRepository struct {
	db *gorm.DB
}

// NewEmailSummaryRepository creates a new instance of emailSummaryRepository
func NewEmailSummaryRepository(db *gorm.DB) EmailSummaryRepository {
	return &emailSummaryRepository{
		db: db,
	}
}

// GetSummary retrieves a cached summary for an email
func (r *emailSummaryRepository) GetSummary(userID, emailID string) (*emaildomain.EmailSummary, error) {
	var summary emaildomain.EmailSummary
	err := r.db.Where("user_id = ? AND email_id = ?", userID, emailID).First(&summary).Error
	if err != nil {
		if err == gorm.ErrRecordNotFound {
			return nil, nil
		}
		return nil, err
	}
	return &summary, nil
}

// GetSummaries retrieves cached summaries for multiple emails
// Returns a map of emailID -> summary
func (r *emailSummaryRepository) GetSummaries(userID string, emailIDs []string) (map[string]string, error) {
	if len(emailIDs) == 0 {
		return map[string]string{}, nil
	}

	var summaries []emaildomain.EmailSummary
	err := r.db.Where("user_id = ? AND email_id IN ?", userID, emailIDs).Find(&summaries).Error
	if err != nil {
		return nil, err
	}

	result := make(map[string]string, len(summaries))
	for _, s := range summaries {
		result[s.EmailID] = s.Summary
	}
	return result, nil
}

// SaveSummary saves or updates a summary for an email
func (r *emailSummaryRepository) SaveSummary(userID, emailID, summaryText string) error {
	var existing emaildomain.EmailSummary
	err := r.db.Where("user_id = ? AND email_id = ?", userID, emailID).First(&existing).Error

	now := time.Now()
	if err == gorm.ErrRecordNotFound {
		// Create new record
		summary := emaildomain.EmailSummary{
			ID:        uuid.New().String(),
			UserID:    userID,
			EmailID:   emailID,
			Summary:   summaryText,
			CreatedAt: now,
		}
		return r.db.Create(&summary).Error
	} else if err != nil {
		return err
	}

	// Update existing record
	existing.Summary = summaryText
	existing.CreatedAt = now
	return r.db.Save(&existing).Error
}

// DeleteSummary deletes a summary for an email
func (r *emailSummaryRepository) DeleteSummary(userID, emailID string) error {
	return r.db.Where("user_id = ? AND email_id = ?", userID, emailID).Delete(&emaildomain.EmailSummary{}).Error
}
