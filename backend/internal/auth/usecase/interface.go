package usecase

import (
	authdomain "ga03-backend/internal/auth/domain"
	authdto "ga03-backend/internal/auth/dto"
)

// AuthUsecase defines the interface for authentication use cases
type AuthUsecase interface {
	Login(req *authdto.LoginRequest) (*authdto.TokenResponse, error)
	Register(req *authdto.RegisterRequest) (*authdto.TokenResponse, error)
	GoogleSignIn(idToken string) (*authdto.TokenResponse, error)
	RefreshToken(refreshToken string) (*authdto.TokenResponse, error)
	Logout(refreshToken string) error
	ValidateToken(tokenString string) (*authdomain.User, error)
}
