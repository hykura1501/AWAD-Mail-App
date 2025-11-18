package repository

import authdomain "ga03-backend/internal/auth/domain"

// UserRepository defines the interface for user repository operations
type UserRepository interface {
	Create(user *authdomain.User) error
	FindByEmail(email string) (*authdomain.User, error)
	FindByID(id string) (*authdomain.User, error)
	Update(user *authdomain.User) error
	SaveRefreshToken(token *authdomain.RefreshToken) error
	FindRefreshToken(token string) (*authdomain.RefreshToken, error)
	DeleteRefreshToken(token string) error
}
