package repository

import "time"

// EmailKanbanColumnRepository defines the interface for email-kanban column mapping repository
type EmailKanbanColumnRepository interface {
	// SetEmailColumn sets the column for an email (creates or updates)
	SetEmailColumn(userID, emailID, columnID string) error
	
	// SnoozeEmailToColumn moves email to snoozed column and saves previous column
	SnoozeEmailToColumn(userID, emailID, previousColumnID string, snoozedUntil time.Time) error
	
	// GetPreviousColumn gets the previous column ID for a snoozed email
	GetPreviousColumn(userID, emailID string) (string, error)
	
	// GetEmailColumn gets the column ID for an email
	GetEmailColumn(userID, emailID string) (string, error)
	
	// GetEmailsByColumn gets all email IDs for a specific column
	GetEmailsByColumn(userID, columnID string) ([]string, error)
	
	// RemoveEmailColumn removes the column mapping for an email
	RemoveEmailColumn(userID, emailID string) error
	
	// RemoveEmailColumnMapping removes a specific email-column mapping
	RemoveEmailColumnMapping(userID, emailID, columnID string) error
	
	// GetAllSnoozedMappings gets all email mappings in snoozed column (for auto-unsnooze)
	GetAllSnoozedMappings() ([]SnoozedEmailMapping, error)
}

// SnoozedEmailMapping contains info needed for auto-unsnooze
type SnoozedEmailMapping struct {
	UserID           string
	EmailID          string
	PreviousColumnID string
	SnoozedUntil     *time.Time
}
