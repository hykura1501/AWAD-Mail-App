package repository

import (
	"sync"
	"time"

	authdomain "ga03-backend/internal/auth/domain"

	"github.com/google/uuid"
	"golang.org/x/crypto/bcrypt"
)

// userRepository implements UserRepository interface
type userRepository struct {
	users         map[string]*authdomain.User
	refreshTokens map[string]*authdomain.RefreshToken
	mu            sync.RWMutex
}

// NewUserRepository creates a new instance of userRepository
func NewUserRepository() UserRepository {
	return &userRepository{
		users:         make(map[string]*authdomain.User),
		refreshTokens: make(map[string]*authdomain.RefreshToken),
	}
}

func (r *userRepository) Create(user *authdomain.User) error {
	r.mu.Lock()
	defer r.mu.Unlock()

	user.ID = uuid.New().String()
	user.CreatedAt = time.Now()
	user.UpdatedAt = time.Now()
	r.users[user.ID] = user
	return nil
}

func (r *userRepository) FindByEmail(email string) (*authdomain.User, error) {
	r.mu.RLock()
	defer r.mu.RUnlock()

	for _, user := range r.users {
		if user.Email == email {
			return user, nil
		}
	}
	return nil, nil
}

func (r *userRepository) FindByID(id string) (*authdomain.User, error) {
	r.mu.RLock()
	defer r.mu.RUnlock()

	user, exists := r.users[id]
	if !exists {
		return nil, nil
	}
	return user, nil
}

func (r *userRepository) Update(user *authdomain.User) error {
	r.mu.Lock()
	defer r.mu.Unlock()

	if _, exists := r.users[user.ID]; !exists {
		return nil
	}

	user.UpdatedAt = time.Now()
	r.users[user.ID] = user
	return nil
}

func (r *userRepository) SaveRefreshToken(token *authdomain.RefreshToken) error {
	r.mu.Lock()
	defer r.mu.Unlock()

	r.refreshTokens[token.Token] = token
	return nil
}

func (r *userRepository) FindRefreshToken(token string) (*authdomain.RefreshToken, error) {
	r.mu.RLock()
	defer r.mu.RUnlock()

	refreshToken, exists := r.refreshTokens[token]
	if !exists {
		return nil, nil
	}
	return refreshToken, nil
}

func (r *userRepository) DeleteRefreshToken(token string) error {
	r.mu.Lock()
	defer r.mu.Unlock()

	delete(r.refreshTokens, token)
	return nil
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
