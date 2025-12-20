package repository

import emaildomain "ga03-backend/internal/email/domain"

// KanbanColumnRepository defines the interface for kanban column operations
type KanbanColumnRepository interface {
	// Get all columns for a user, ordered by order field
	GetColumnsByUserID(userID string) ([]*emaildomain.KanbanColumn, error)
	// Get a column by ID
	GetColumnByID(userID, columnID string) (*emaildomain.KanbanColumn, error)
	// Create a new column
	CreateColumn(column *emaildomain.KanbanColumn) error
	// Update a column
	UpdateColumn(column *emaildomain.KanbanColumn) error
	// Delete a column
	DeleteColumn(userID, columnID string) error
	// Update column order for multiple columns
	UpdateColumnOrders(userID string, orders map[string]int) error
}
