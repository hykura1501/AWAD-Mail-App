package repository

import (
	"time"

	emaildomain "ga03-backend/internal/email/domain"

	"github.com/google/uuid"
	"gorm.io/gorm"
)

// kanbanColumnRepository implements KanbanColumnRepository interface
type kanbanColumnRepository struct {
	db *gorm.DB
}

// NewKanbanColumnRepository creates a new instance of kanbanColumnRepository
func NewKanbanColumnRepository(db *gorm.DB) KanbanColumnRepository {
	return &kanbanColumnRepository{
		db: db,
	}
}

// GetColumnsByUserID gets all columns for a user, ordered by order field
func (r *kanbanColumnRepository) GetColumnsByUserID(userID string) ([]*emaildomain.KanbanColumn, error) {
	var columns []*emaildomain.KanbanColumn
	err := r.db.Where("user_id = ?", userID).Order("display_order ASC").Find(&columns).Error
	if err != nil {
		return nil, err
	}

	// Ensure RemoveLabelIDs is initialized
	for _, col := range columns {
		if col.RemoveLabelIDs == nil {
			col.RemoveLabelIDs = emaildomain.StringArray{}
		}
	}

	return columns, nil
}

// GetColumnByID gets a column by ID
func (r *kanbanColumnRepository) GetColumnByID(userID, columnID string) (*emaildomain.KanbanColumn, error) {
	var column emaildomain.KanbanColumn
	err := r.db.Where("user_id = ? AND column_id = ?", userID, columnID).First(&column).Error
	if err != nil {
		if err == gorm.ErrRecordNotFound {
			return nil, nil
		}
		return nil, err
	}
	return &column, nil
}

// CreateColumn creates a new column
func (r *kanbanColumnRepository) CreateColumn(column *emaildomain.KanbanColumn) error {
	if column.ID == "" {
		column.ID = uuid.New().String()
	}
	column.CreatedAt = time.Now()
	column.UpdatedAt = time.Now()

	// Ensure RemoveLabelIDs is initialized
	if column.RemoveLabelIDs == nil {
		column.RemoveLabelIDs = emaildomain.StringArray{}
	}

	return r.db.Create(column).Error
}

// UpdateColumn updates a column
func (r *kanbanColumnRepository) UpdateColumn(column *emaildomain.KanbanColumn) error {
	column.UpdatedAt = time.Now()

	// Ensure RemoveLabelIDs is initialized
	if column.RemoveLabelIDs == nil {
		column.RemoveLabelIDs = emaildomain.StringArray{}
	}

	return r.db.Save(column).Error
}

// DeleteColumn deletes a column
func (r *kanbanColumnRepository) DeleteColumn(userID, columnID string) error {
	return r.db.Where("user_id = ? AND column_id = ?", userID, columnID).Delete(&emaildomain.KanbanColumn{}).Error
}

// UpdateColumnOrders updates column order for multiple columns
func (r *kanbanColumnRepository) UpdateColumnOrders(userID string, orders map[string]int) error {
	for columnID, orderVal := range orders {
		err := r.db.Model(&emaildomain.KanbanColumn{}).
			Where("user_id = ? AND column_id = ?", userID, columnID).
			Update("display_order", orderVal).Error
		if err != nil {
			return err
		}
	}
	return nil
}
