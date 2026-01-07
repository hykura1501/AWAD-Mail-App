package repository

import (
	"errors"
	"time"

	authdomain "ga03-backend/internal/auth/domain"

	"github.com/google/uuid"
	"golang.org/x/crypto/bcrypt"
	"gorm.io/gorm"
)

// userRepository implements UserRepository interface
type userRepository struct {
	db *gorm.DB
}

// NewUserRepository creates a new instance of userRepository
func NewUserRepository(db *gorm.DB) UserRepository {
	return &userRepository{
		db: db,
	}
}

func (r *userRepository) Create(user *authdomain.User) error {
	user.ID = uuid.New().String()
	user.CreatedAt = time.Now()
	user.UpdatedAt = time.Now()
	return r.db.Create(user).Error
}

func (r *userRepository) FindByEmail(email string) (*authdomain.User, error) {
	var user authdomain.User
	err := r.db.Where("email = ?", email).First(&user).Error
	if err != nil {
		if errors.Is(err, gorm.ErrRecordNotFound) {
			return nil, nil
		}
		return nil, err
	}
	return &user, nil
}

func (r *userRepository) FindByID(id string) (*authdomain.User, error) {
	var user authdomain.User
	err := r.db.Where("id = ?", id).First(&user).Error
	if err != nil {
		if errors.Is(err, gorm.ErrRecordNotFound) {
			return nil, nil
		}
		return nil, err
	}
	return &user, nil
}

func (r *userRepository) Update(user *authdomain.User) error {
	user.UpdatedAt = time.Now()
	return r.db.Save(user).Error
}

func (r *userRepository) SaveRefreshToken(token *authdomain.RefreshToken) error {
	return r.db.Create(token).Error
}

func (r *userRepository) FindRefreshToken(token string) (*authdomain.RefreshToken, error) {
	var refreshToken authdomain.RefreshToken
	err := r.db.Where("token = ?", token).First(&refreshToken).Error
	if err != nil {
		if errors.Is(err, gorm.ErrRecordNotFound) {
			return nil, nil
		}
		return nil, err
	}
	return &refreshToken, nil
}

func (r *userRepository) DeleteRefreshToken(token string) error {
	return r.db.Where("token = ?", token).Delete(&authdomain.RefreshToken{}).Error
}

func (r *userRepository) DeleteRefreshTokensByUser(userID string) error {
	return r.db.Where("user_id = ?", userID).Delete(&authdomain.RefreshToken{}).Error
}

// ReplaceRefreshToken adds a new refresh token for the user without deleting existing ones.
// This allows multi-device login - each device keeps its own refresh token.
// Only cleans up expired tokens to prevent DB bloat.
func (r *userRepository) ReplaceRefreshToken(token *authdomain.RefreshToken) error {
	// Use a transaction to ensure atomicity
	return r.db.Transaction(func(tx *gorm.DB) error {
		// Only delete EXPIRED refresh tokens for this user (cleanup, not invalidation)
		if err := tx.Where("user_id = ? AND expires_at < ?", token.UserID, time.Now()).Delete(&authdomain.RefreshToken{}).Error; err != nil {
			return err
		}
		// Insert the new token (existing valid tokens remain)
		return tx.Create(token).Error
	})
}

// HashPassword hashes a password using bcrypt
func HashPassword(password string) (string, error) {
	bytes, err := bcrypt.GenerateFromPassword([]byte(password), bcrypt.DefaultCost)
	return string(bytes), err
}

// CheckPasswordHash compares a password with a hash
func CheckPasswordHash(password, hash string) bool {
	err := bcrypt.CompareHashAndPassword([]byte(hash), []byte(password))
	return err == nil
}
