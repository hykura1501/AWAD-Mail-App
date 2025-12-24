package repository

import (
	"errors"

	emaildomain "ga03-backend/internal/email/domain"

	"github.com/google/uuid"
	"gorm.io/gorm"
)

type emailKanbanColumnRepository struct {
	db *gorm.DB
}

func NewEmailKanbanColumnRepository(db *gorm.DB) EmailKanbanColumnRepository {
	return &emailKanbanColumnRepository{db: db}
}

// SetEmailColumn sets the column for an email (creates or updates)
func (r *emailKanbanColumnRepository) SetEmailColumn(userID, emailID, columnID string) error {
	var mapping emaildomain.EmailKanbanColumn
	
	// Try to find existing mapping
	err := r.db.Where("user_id = ? AND email_id = ?", userID, emailID).First(&mapping).Error
	if err != nil && !errors.Is(err, gorm.ErrRecordNotFound) {
		return err
	}
	
	if errors.Is(err, gorm.ErrRecordNotFound) {
		// Create new mapping
		mapping = emaildomain.EmailKanbanColumn{
			ID:       uuid.New().String(),
			UserID:   userID,
			EmailID:  emailID,
			ColumnID: columnID,
		}
		return r.db.Create(&mapping).Error
	}
	
	// Update existing mapping
	mapping.ColumnID = columnID
	return r.db.Save(&mapping).Error
}

// GetEmailColumn gets the column ID for an email
func (r *emailKanbanColumnRepository) GetEmailColumn(userID, emailID string) (string, error) {
	var mapping emaildomain.EmailKanbanColumn
	err := r.db.Where("user_id = ? AND email_id = ?", userID, emailID).First(&mapping).Error
	if err != nil {
		if errors.Is(err, gorm.ErrRecordNotFound) {
			return "", nil // Return empty string if not found
		}
		return "", err
	}
	return mapping.ColumnID, nil
}

// GetEmailsByColumn gets all email IDs for a specific column
func (r *emailKanbanColumnRepository) GetEmailsByColumn(userID, columnID string) ([]string, error) {
	var mappings []emaildomain.EmailKanbanColumn
	err := r.db.Where("user_id = ? AND column_id = ?", userID, columnID).Find(&mappings).Error
	if err != nil {
		return nil, err
	}
	
	emailIDs := make([]string, len(mappings))
	for i, m := range mappings {
		emailIDs[i] = m.EmailID
	}
	return emailIDs, nil
}

// RemoveEmailColumn removes the column mapping for an email
func (r *emailKanbanColumnRepository) RemoveEmailColumn(userID, emailID string) error {
	return r.db.Where("user_id = ? AND email_id = ?", userID, emailID).Delete(&emaildomain.EmailKanbanColumn{}).Error
}

// RemoveEmailColumnMapping removes a specific email-column mapping
func (r *emailKanbanColumnRepository) RemoveEmailColumnMapping(userID, emailID, columnID string) error {
	return r.db.Where("user_id = ? AND email_id = ? AND column_id = ?", userID, emailID, columnID).Delete(&emaildomain.EmailKanbanColumn{}).Error
}
