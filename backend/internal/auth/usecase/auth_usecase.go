package usecase

import (
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"net/http"
	"time"

	authdomain "ga03-backend/internal/auth/domain"
	authdto "ga03-backend/internal/auth/dto"
	"ga03-backend/internal/auth/repository"
	"ga03-backend/pkg/config"

	"github.com/golang-jwt/jwt/v5"
	"github.com/google/uuid"
)

// authUsecase implements AuthUsecase interface
type authUsecase struct {
	userRepo repository.UserRepository
	config   *config.Config
}

// NewAuthUsecase creates a new instance of authUsecase
func NewAuthUsecase(userRepo repository.UserRepository, cfg *config.Config) AuthUsecase {
	return &authUsecase{
		userRepo: userRepo,
		config:   cfg,
	}
}

func (u *authUsecase) Login(req *authdto.LoginRequest) (*authdto.TokenResponse, error) {
	user, err := u.userRepo.FindByEmail(req.Email)
	if err != nil {
		return nil, err
	}

	if user == nil {
		return nil, errors.New("invalid email or password")
	}

	if user.Provider != "email" {
		return nil, errors.New("please use Google Sign-In for this account")
	}

	if !repository.CheckPasswordHash(req.Password, user.Password) {
		return nil, errors.New("invalid email or password")
	}

	return u.generateTokens(user)
}

func (u *authUsecase) Register(req *authdto.RegisterRequest) (*authdto.TokenResponse, error) {
	existing, err := u.userRepo.FindByEmail(req.Email)
	if err != nil {
		return nil, err
	}

	if existing != nil {
		return nil, errors.New("email already registered")
	}

	hashedPassword, err := repository.HashPassword(req.Password)
	if err != nil {
		return nil, err
	}

	user := &authdomain.User{
		Email:    req.Email,
		Password: hashedPassword,
		Name:     req.Name,
		Provider: "email",
	}

	if err := u.userRepo.Create(user); err != nil {
		return nil, err
	}

	return u.generateTokens(user)
}

// GoogleTokenInfo represents the response from Google's tokeninfo endpoint
type GoogleTokenInfo struct {
	Email         string `json:"email"`
	Name          string `json:"name"`
	Picture       string `json:"picture"`
	EmailVerified string `json:"email_verified"` // Google returns this as string "true" or "false"
	Sub           string `json:"sub"`
}

func (u *authUsecase) GoogleSignIn(idToken string) (*authdto.TokenResponse, error) {
	// Verify ID token by calling Google's tokeninfo endpoint
	url := fmt.Sprintf("https://oauth2.googleapis.com/tokeninfo?id_token=%s", idToken)

	resp, err := http.Get(url)
	if err != nil {
		return nil, errors.New("failed to verify Google token: " + err.Error())
	}
	defer resp.Body.Close()

	if resp.StatusCode != http.StatusOK {
		body, _ := io.ReadAll(resp.Body)
		return nil, fmt.Errorf("failed to verify Google token: status %d, body: %s", resp.StatusCode, string(body))
	}

	var tokenInfo GoogleTokenInfo
	if err := json.NewDecoder(resp.Body).Decode(&tokenInfo); err != nil {
		return nil, errors.New("failed to decode Google token info: " + err.Error())
	}

	// Verify that email is verified (Google returns "true" as string)
	if tokenInfo.EmailVerified != "true" {
		return nil, errors.New("google email is not verified")
	}

	// Find or create user
	user, err := u.userRepo.FindByEmail(tokenInfo.Email)
	if err != nil {
		return nil, err
	}

	if user == nil {
		// Create new user
		user = &authdomain.User{
			Email:     tokenInfo.Email,
			Name:      tokenInfo.Name,
			AvatarURL: tokenInfo.Picture,
			Provider:  "google",
		}
		if err := u.userRepo.Create(user); err != nil {
			return nil, err
		}
	} else {
		// Update existing user info
		user.Name = tokenInfo.Name
		user.AvatarURL = tokenInfo.Picture
		if err := u.userRepo.Update(user); err != nil {
			return nil, err
		}
	}

	return u.generateTokens(user)
}

func (u *authUsecase) RefreshToken(refreshToken string) (*authdto.TokenResponse, error) {
	// Verify refresh token
	token, err := jwt.Parse(refreshToken, func(token *jwt.Token) (interface{}, error) {
		return []byte(u.config.JWTSecret), nil
	})

	if err != nil || !token.Valid {
		return nil, errors.New("invalid refresh token")
	}

	claims, ok := token.Claims.(jwt.MapClaims)
	if !ok {
		return nil, errors.New("invalid token claims")
	}

	// Check if token exists in repository
	storedToken, err := u.userRepo.FindRefreshToken(refreshToken)
	if err != nil {
		return nil, err
	}

	if storedToken == nil || storedToken.ExpiresAt.Before(time.Now()) {
		return nil, errors.New("refresh token expired")
	}

	// Get user
	userID, ok := claims["user_id"].(string)
	if !ok {
		return nil, errors.New("invalid token claims")
	}

	user, err := u.userRepo.FindByID(userID)
	if err != nil {
		return nil, err
	}

	if user == nil {
		return nil, errors.New("user not found")
	}

	return u.generateTokens(user)
}

func (u *authUsecase) Logout(refreshToken string) error {
	return u.userRepo.DeleteRefreshToken(refreshToken)
}

func (u *authUsecase) generateTokens(user *authdomain.User) (*authdto.TokenResponse, error) {
	// Generate access token
	accessToken, err := u.generateAccessToken(user)
	if err != nil {
		return nil, err
	}

	// Generate refresh token
	refreshToken, err := u.generateRefreshToken(user)
	if err != nil {
		return nil, err
	}

	// Store refresh token
	refreshTokenEntity := &authdomain.RefreshToken{
		Token:     refreshToken,
		UserID:    user.ID,
		ExpiresAt: time.Now().Add(u.config.JWTRefreshExpiry),
	}
	if err := u.userRepo.SaveRefreshToken(refreshTokenEntity); err != nil {
		return nil, err
	}

	return &authdto.TokenResponse{
		AccessToken:  accessToken,
		RefreshToken: refreshToken,
		User:         user,
	}, nil
}

func (u *authUsecase) generateAccessToken(user *authdomain.User) (string, error) {
	claims := jwt.MapClaims{
		"user_id": user.ID,
		"email":   user.Email,
		"exp":     time.Now().Add(u.config.JWTAccessExpiry).Unix(),
		"iat":     time.Now().Unix(),
	}

	token := jwt.NewWithClaims(jwt.SigningMethodHS256, claims)
	return token.SignedString([]byte(u.config.JWTSecret))
}

func (u *authUsecase) generateRefreshToken(user *authdomain.User) (string, error) {
	claims := jwt.MapClaims{
		"user_id":  user.ID,
		"token_id": uuid.New().String(),
		"exp":      time.Now().Add(u.config.JWTRefreshExpiry).Unix(),
		"iat":      time.Now().Unix(),
	}

	token := jwt.NewWithClaims(jwt.SigningMethodHS256, claims)
	return token.SignedString([]byte(u.config.JWTSecret))
}

func (u *authUsecase) ValidateToken(tokenString string) (*authdomain.User, error) {
	token, err := jwt.Parse(tokenString, func(token *jwt.Token) (interface{}, error) {
		return []byte(u.config.JWTSecret), nil
	})

	if err != nil || !token.Valid {
		return nil, errors.New("invalid token")
	}

	claims, ok := token.Claims.(jwt.MapClaims)
	if !ok {
		return nil, errors.New("invalid token claims")
	}

	userID, ok := claims["user_id"].(string)
	if !ok {
		return nil, errors.New("invalid token claims")
	}

	user, err := u.userRepo.FindByID(userID)
	if err != nil {
		return nil, err
	}

	if user == nil {
		return nil, errors.New("user not found")
	}

	return user, nil
}
