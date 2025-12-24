package repository

// EmailKanbanColumnRepository defines the interface for email-kanban column mapping repository
type EmailKanbanColumnRepository interface {
	// SetEmailColumn sets the column for an email (creates or updates)
	SetEmailColumn(userID, emailID, columnID string) error
	
	// GetEmailColumn gets the column ID for an email
	GetEmailColumn(userID, emailID string) (string, error)
	
	// GetEmailsByColumn gets all email IDs for a specific column
	GetEmailsByColumn(userID, columnID string) ([]string, error)
	
	// RemoveEmailColumn removes the column mapping for an email
	RemoveEmailColumn(userID, emailID string) error
	
	// RemoveEmailColumnMapping removes a specific email-column mapping
	RemoveEmailColumnMapping(userID, emailID, columnID string) error
}
