package repository

import (
	"time"

	authdomain "ga03-backend/internal/auth/domain"

	"github.com/google/uuid"
	"gorm.io/gorm"
	"gorm.io/gorm/clause"
)

// FCMTokenRepository defines the interface for FCM token operations
type FCMTokenRepository interface {
	SaveToken(userID, token, deviceInfo string) error
	GetTokensByUserID(userID string) ([]authdomain.FCMToken, error)
	DeleteToken(token string) error
	DeleteTokensByUserID(userID string) error
}

// fcmTokenRepository implements FCMTokenRepository interface
type fcmTokenRepository struct {
	db *gorm.DB
}

// NewFCMTokenRepository creates a new instance of fcmTokenRepository
func NewFCMTokenRepository(db *gorm.DB) FCMTokenRepository {
	return &fcmTokenRepository{
		db: db,
	}
}

// SaveToken saves or updates an FCM token for a user (atomic upsert)
func (r *fcmTokenRepository) SaveToken(userID, token, deviceInfo string) error {
	fcmToken := &authdomain.FCMToken{
		ID:         uuid.New().String(),
		UserID:     userID,
		Token:      token,
		DeviceInfo: deviceInfo,
		CreatedAt:  time.Now(),
		UpdatedAt:  time.Now(),
	}
	
	// Atomic upsert: INSERT ... ON CONFLICT (token) DO UPDATE
	return r.db.Clauses(clause.OnConflict{
		Columns:   []clause.Column{{Name: "token"}},
		DoUpdates: clause.AssignmentColumns([]string{"user_id", "device_info", "updated_at"}),
	}).Create(fcmToken).Error
}

// GetTokensByUserID returns all FCM tokens for a user
func (r *fcmTokenRepository) GetTokensByUserID(userID string) ([]authdomain.FCMToken, error) {
	var tokens []authdomain.FCMToken
	err := r.db.Where("user_id = ?", userID).Find(&tokens).Error
	if err != nil {
		return nil, err
	}
	return tokens, nil
}

// DeleteToken removes a specific FCM token
func (r *fcmTokenRepository) DeleteToken(token string) error {
	return r.db.Where("token = ?", token).Delete(&authdomain.FCMToken{}).Error
}

// DeleteTokensByUserID removes all FCM tokens for a user
func (r *fcmTokenRepository) DeleteTokensByUserID(userID string) error {
	return r.db.Where("user_id = ?", userID).Delete(&authdomain.FCMToken{}).Error
}
