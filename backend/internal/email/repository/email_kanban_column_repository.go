package repository

import (
	"errors"
	"time"

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
	var count int64
	r.db.Model(&emaildomain.EmailKanbanColumn{}).Where("user_id = ? AND email_id = ?", userID, emailID).Count(&count)

	if count == 0 {
		// Create new mapping
		mapping := emaildomain.EmailKanbanColumn{
			ID:       uuid.New().String(),
			UserID:   userID,
			EmailID:  emailID,
			ColumnID: columnID,
		}
		return r.db.Create(&mapping).Error
	}

	// Update existing mapping(s) - handle potential duplicates by updating all
	return r.db.Model(&emaildomain.EmailKanbanColumn{}).
		Where("user_id = ? AND email_id = ?", userID, emailID).
		Update("column_id", columnID).Error
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

// SnoozeEmailToColumn moves email to snoozed column and saves previous column
func (r *emailKanbanColumnRepository) SnoozeEmailToColumn(userID, emailID, previousColumnID string, snoozedUntil time.Time) error {
	var count int64
	r.db.Model(&emaildomain.EmailKanbanColumn{}).Where("user_id = ? AND email_id = ?", userID, emailID).Count(&count)

	if count == 0 {
		// Create new mapping
		mapping := emaildomain.EmailKanbanColumn{
			ID:               uuid.New().String(),
			UserID:           userID,
			EmailID:          emailID,
			ColumnID:         "snoozed",
			PreviousColumnID: previousColumnID,
			SnoozedUntil:     &snoozedUntil,
		}
		return r.db.Create(&mapping).Error
	}

	// Update existing mapping(s) - handle potential duplicates by updating all
	return r.db.Model(&emaildomain.EmailKanbanColumn{}).
		Where("user_id = ? AND email_id = ?", userID, emailID).
		Updates(map[string]interface{}{
			"column_id":          "snoozed",
			"previous_column_id": previousColumnID,
			"snoozed_until":      snoozedUntil,
		}).Error
}

// GetPreviousColumn gets the previous column ID for a snoozed email
func (r *emailKanbanColumnRepository) GetPreviousColumn(userID, emailID string) (string, error) {
	var mapping emaildomain.EmailKanbanColumn
	err := r.db.Where("user_id = ? AND email_id = ?", userID, emailID).First(&mapping).Error
	if err != nil {
		if errors.Is(err, gorm.ErrRecordNotFound) {
			return "inbox", nil // Default to inbox if no previous column
		}
		return "", err
	}
	if mapping.PreviousColumnID == "" {
		return "inbox", nil // Default to inbox if previous column is empty
	}
	return mapping.PreviousColumnID, nil
}

// GetAllSnoozedMappings gets all email mappings in snoozed column (for auto-unsnooze)
func (r *emailKanbanColumnRepository) GetAllSnoozedMappings() ([]SnoozedEmailMapping, error) {
	var mappings []emaildomain.EmailKanbanColumn
	err := r.db.Where("column_id = ?", "snoozed").Find(&mappings).Error
	if err != nil {
		return nil, err
	}
	
	result := make([]SnoozedEmailMapping, len(mappings))
	for i, m := range mappings {
		prevCol := m.PreviousColumnID
		if prevCol == "" {
			prevCol = "inbox"
		}
		result[i] = SnoozedEmailMapping{
			UserID:           m.UserID,
			EmailID:          m.EmailID,
			PreviousColumnID: prevCol,
			SnoozedUntil:     m.SnoozedUntil,
		}
	}
	return result, nil
}
