package domain

import "time"

// FCMToken represents a Firebase Cloud Messaging device token for push notifications
type FCMToken struct {
	ID         string    `json:"id" gorm:"primaryKey"`
	UserID     string    `json:"user_id" gorm:"index;not null"`
	Token      string    `json:"-" gorm:"uniqueIndex;not null"` // Don't expose token in JSON
	DeviceInfo string    `json:"device_info"`                   // Browser/device metadata
	CreatedAt  time.Time `json:"created_at"`
	UpdatedAt  time.Time `json:"updated_at"`
}
