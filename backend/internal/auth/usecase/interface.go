package usecase

import (
	authdomain "ga03-backend/internal/auth/domain"
	authdto "ga03-backend/internal/auth/dto"
)

// EmailSyncCallback is a function type for syncing emails after login/registration
type EmailSyncCallback func(userID string)

// AuthUsecase defines the interface for authentication use cases
type AuthUsecase interface {
	Login(req *authdto.LoginRequest) (*authdto.TokenResponse, error)
	IMAPLogin(req *authdto.ImapLoginRequest) (*authdto.TokenResponse, error)
	Register(req *authdto.RegisterRequest) (*authdto.TokenResponse, error)
	GoogleSignIn(code string, scope []string) (*authdto.TokenResponse, error)
	RefreshToken(refreshToken string) (*authdto.TokenResponse, error)
	Logout(refreshToken string) error
	ValidateToken(tokenString string) (*authdomain.User, error)
	SetPassword(userID string, password string) error
	SetEmailSyncCallback(callback EmailSyncCallback)
}
