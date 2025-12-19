package repository

// EmailSyncHistoryRepository defines the interface for email sync history operations
type EmailSyncHistoryRepository interface {
	// Check if an email has been synced for a user
	IsEmailSynced(userID, emailID string) (bool, error)
	// Mark an email as synced
	MarkEmailAsSynced(userID, emailID string) error
	// Delete sync history for an email (optional, for cleanup)
	DeleteSyncHistory(userID, emailID string) error
}
