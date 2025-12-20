package domain

import (
	"database/sql/driver"
	"encoding/json"
	"time"
)

// StringArray is a custom type to handle JSON array in GORM
type StringArray []string

// Value implements driver.Valuer
func (a StringArray) Value() (driver.Value, error) {
	if len(a) == 0 {
		return "[]", nil
	}
	return json.Marshal(a)
}

// Scan implements sql.Scanner
func (a *StringArray) Scan(value interface{}) error {
	if value == nil {
		*a = []string{}
		return nil
	}
	var bytes []byte
	switch v := value.(type) {
	case []byte:
		bytes = v
	case string:
		bytes = []byte(v)
	default:
		return nil
	}
	if len(bytes) == 0 {
		*a = []string{}
		return nil
	}
	return json.Unmarshal(bytes, a)
}

// KanbanColumn represents a user-defined Kanban board column configuration
type KanbanColumn struct {
	ID             string      `json:"id" gorm:"primaryKey"`
	UserID         string      `json:"user_id" gorm:"index;not null"`
	Name           string      `json:"name" gorm:"not null"`                                 // Display name of the column
	ColumnID       string      `json:"column_id" gorm:"index:idx_user_column;not null"`      // Internal ID used for mapping (e.g., "inbox", "todo")
	Order          int         `json:"order" gorm:"column:display_order;not null;default:0"` // Display order
	GmailLabelID   string      `json:"gmail_label_id,omitempty" gorm:"default:''"`           // Gmail label ID to add when moving here (e.g., "STARRED")
	RemoveLabelIDs StringArray `json:"remove_label_ids,omitempty" gorm:"type:text"`          // Gmail label IDs to remove when moving here (e.g., ["INBOX"])
	CreatedAt      time.Time   `json:"created_at"`
	UpdatedAt      time.Time   `json:"updated_at"`
}
