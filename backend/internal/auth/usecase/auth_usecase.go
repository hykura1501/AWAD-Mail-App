package usecase

import (
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"net/http"
	"net/url"
	"time"

	authdomain "ga03-backend/internal/auth/domain"
	authdto "ga03-backend/internal/auth/dto"
	"ga03-backend/internal/auth/repository"
	"ga03-backend/pkg/config"
	"ga03-backend/pkg/imap"
	"ga03-backend/pkg/utils/crypto"

	"github.com/golang-jwt/jwt/v5"
	"github.com/google/uuid"
	"golang.org/x/oauth2"
	"golang.org/x/oauth2/google"
)

// authUsecase implements AuthUsecase interface
type authUsecase struct {
	userRepo          repository.UserRepository
	config            *config.Config
	emailSyncCallback EmailSyncCallback // Optional callback to sync emails after auth
}

// NewAuthUsecase creates a new instance of authUsecase
func NewAuthUsecase(userRepo repository.UserRepository, cfg *config.Config) AuthUsecase {
	return &authUsecase{
		userRepo: userRepo,
		config:   cfg,
	}
}

// SetEmailSyncCallback sets the callback function to sync emails after login/registration
func (u *authUsecase) SetEmailSyncCallback(callback EmailSyncCallback) {
	u.emailSyncCallback = callback
}

func (u *authUsecase) Login(req *authdto.LoginRequest) (*authdto.TokenResponse, error) {
	user, err := u.userRepo.FindByEmail(req.Email)
	if err != nil {
		return nil, err
	}

	if user == nil {
		return nil, errors.New("invalid email or password")
	}

	if user.Provider != "email" && user.Provider != "imap" {
		return nil, errors.New("please use Google Sign-In for this account")
	}

	if !repository.CheckPasswordHash(req.Password, user.Password) {
		return nil, errors.New("invalid email or password")
	}

	// Sync all emails for user in background (non-blocking)
	if u.emailSyncCallback != nil {
		u.emailSyncCallback(user.ID)
	}

	return u.generateTokens(user)
}

func (u *authUsecase) IMAPLogin(req *authdto.ImapLoginRequest) (*authdto.TokenResponse, error) {
	// 1. Try to connect and login to IMAP server
	client, err := imap.ConnectAndLogin(req.ImapServer, req.ImapPort, req.Email, req.Password)
	if err != nil {
		return nil, fmt.Errorf("IMAP authentication failed: %w", err)
	}
	defer client.Logout()

	// 2. Check if user exists
	user, err := u.userRepo.FindByEmail(req.Email)
	if err != nil {
		return nil, err
	}

	// Encrypt password
	encryptedPass, err := crypto.Encrypt(req.Password, u.config.EncryptionKey)
	if err != nil {
		return nil, fmt.Errorf("failed to encrypt password: %w", err)
	}

	// 3. Create or Update user
	if user == nil {
		user = &authdomain.User{
			Email:        req.Email,
			Name:         req.Email, // Use email as name initially
			Provider:     "imap",
			ImapServer:   req.ImapServer,
			ImapPort:     req.ImapPort,
			ImapPassword: encryptedPass, // Store encrypted password
		}
		if err := u.userRepo.Create(user); err != nil {
			return nil, err
		}
	} else {
		// Update existing user's IMAP credentials
		// This allows users to update their password or server settings by logging in again
		user.ImapServer = req.ImapServer
		user.ImapPort = req.ImapPort
		user.ImapPassword = encryptedPass

		// If the user was previously a different provider, we might want to handle that
		// For now, we just update the provider to imap if it wasn't
		if user.Provider != "imap" {
			user.Provider = "imap"
		}

		if err := u.userRepo.Update(user); err != nil {
			return nil, err
		}
	}

	// 4. Generate tokens
	resp, err := u.generateTokens(user)
	if err != nil {
		return nil, err
	}

	// Sync all emails for user in background (non-blocking)
	if u.emailSyncCallback != nil {
		u.emailSyncCallback(user.ID)
	}

	if user.Password == "" {
		resp.NeedsPasswordSet = true
	}

	return resp, nil
}

func (u *authUsecase) SetPassword(userID string, password string) error {
	user, err := u.userRepo.FindByID(userID)
	if err != nil {
		return err
	}
	if user == nil {
		return errors.New("user not found")
	}

	hashedPassword, err := repository.HashPassword(password)
	if err != nil {
		return err
	}

	user.Password = hashedPassword
	return u.userRepo.Update(user)
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

	// Sync all emails for user in background (non-blocking)
	if u.emailSyncCallback != nil {
		u.emailSyncCallback(user.ID)
	}

	return u.generateTokens(user)
}

// GoogleTokenInfo represents the response from Google's userinfo endpoint
type GoogleTokenInfo struct {
	Email         string `json:"email"`
	Name          string `json:"name"`
	Picture       string `json:"picture"`
	EmailVerified bool   `json:"email_verified"`
	Sub           string `json:"sub"`
}

func (u *authUsecase) GoogleSignIn(code string, scope []string) (*authdto.TokenResponse, error) {
	conf := &oauth2.Config{
		ClientID:     u.config.GoogleClientID,
		ClientSecret: u.config.GoogleClientSecret,
		RedirectURL:  "postmessage",
		Scopes:       scope,
		Endpoint:     google.Endpoint,
	}
	token, err := conf.Exchange(context.Background(), code)
	if err != nil {
		return nil, fmt.Errorf("google oauth exchange failed: %v", err)
	}
	accessToken := token.AccessToken
	refreshToken := token.RefreshToken
	tokenExpiry := token.Expiry

	url := "https://www.googleapis.com/oauth2/v3/userinfo"

	req, err := http.NewRequest("GET", url, nil)
	if err != nil {
		return nil, errors.New("failed to create request: " + err.Error())
	}
	req.Header.Set("Authorization", "Bearer "+accessToken)

	resp, err := http.DefaultClient.Do(req)
	if err != nil {
		return nil, errors.New("failed to verify Google token: " + err.Error())
	}
	defer resp.Body.Close()

	bodyBytes, err := io.ReadAll(resp.Body)
	if err != nil {
		return nil, errors.New("failed to read response body: " + err.Error())
	}

	if resp.StatusCode != http.StatusOK {
		errMsg := fmt.Sprintf("failed to verify Google token: status %d, body: %s", resp.StatusCode, string(bodyBytes))
		fmt.Println("Error:", errMsg)
		return nil, errors.New(errMsg)
	}

	fmt.Printf("Google UserInfo Response: %s\n", string(bodyBytes))

	var tokenInfo GoogleTokenInfo
	if err := json.Unmarshal(bodyBytes, &tokenInfo); err != nil {
		return nil, errors.New("failed to decode Google token info: " + err.Error())
	}

	// Verify that email is verified (Google returns "true" as string)
	if tokenInfo.EmailVerified != true {
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
			Email:        tokenInfo.Email,
			Name:         tokenInfo.Name,
			AvatarURL:    tokenInfo.Picture,
			Provider:     "google",
			AccessToken:  accessToken,
			RefreshToken: refreshToken,
			TokenExpiry:  tokenExpiry,
		}
		if err := u.userRepo.Create(user); err != nil {
			fmt.Printf("Error creating user: %v\n", err)
			return nil, err
		}
		fmt.Println("User created successfully")
	} else {
		fmt.Println("Updating existing user...")
		// Update existing user info and tokens
		user.Name = tokenInfo.Name
		user.AvatarURL = tokenInfo.Picture
		user.AccessToken = accessToken
		user.RefreshToken = refreshToken
		if err := u.userRepo.Update(user); err != nil {
			fmt.Printf("Error updating user: %v\n", err)
			return nil, err
		}
		fmt.Println("User updated successfully")
	}

	fmt.Println("Generating tokens...")
	tokenResp, err := u.generateTokens(user)
	if err != nil {
		fmt.Printf("Error generating tokens: %v\n", err)
		return nil, err
	}

	// Sync all emails for user in background (non-blocking)
	if u.emailSyncCallback != nil {
		u.emailSyncCallback(user.ID)
	}

	fmt.Println("Tokens generated successfully")
	return tokenResp, nil
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

	// Generate new access token only (don't rotate refresh token unless needed)
	// This prevents issues with concurrent refresh requests
	accessToken, err := u.generateAccessToken(user)
	if err != nil {
		return nil, err
	}

	// Check if refresh token is close to expiry (within 24 hours)
	// If so, rotate it to extend session
	shouldRotateRefreshToken := storedToken.ExpiresAt.Sub(time.Now()) < 24*time.Hour

	if shouldRotateRefreshToken {
		// Generate new refresh token and replace old one
		newRefreshToken, err := u.generateRefreshToken(user)
		if err != nil {
			return nil, err
		}

		refreshTokenEntity := &authdomain.RefreshToken{
			Token:     newRefreshToken,
			UserID:    user.ID,
			ExpiresAt: time.Now().Add(u.config.JWTRefreshExpiry),
		}
		if err := u.userRepo.ReplaceRefreshToken(refreshTokenEntity); err != nil {
			return nil, err
		}

		return &authdto.TokenResponse{
			AccessToken:  accessToken,
			RefreshToken: newRefreshToken,
			User:         user,
		}, nil
	}

	// Keep existing refresh token
	return &authdto.TokenResponse{
		AccessToken:  accessToken,
		RefreshToken: refreshToken, // Return same refresh token
		User:         user,
	}, nil
}

func (u *authUsecase) Logout(refreshToken string) error {
	// Find the refresh token to identify the user
	token, err := u.userRepo.FindRefreshToken(refreshToken)
	if err != nil {
		return err
	}

	if token != nil {
		// Get the user to check for Google OAuth
		user, err := u.userRepo.FindByID(token.UserID)
		if err == nil && user != nil && user.Provider == "google" && user.RefreshToken != "" {
			// Revoke Google token
			revokeURL := "https://oauth2.googleapis.com/revoke"
			resp, err := http.PostForm(revokeURL, url.Values{"token": {user.RefreshToken}})
			if err != nil {
				fmt.Printf("Failed to revoke Google token: %v\n", err)
			} else {
				resp.Body.Close()

				// Clear Google tokens from user record
				user.AccessToken = ""
				user.RefreshToken = ""
				user.TokenExpiry = time.Time{}
				u.userRepo.Update(user)
			}
		}
	}

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

	// Use repository ReplaceRefreshToken to atomically replace any existing token for this user
	refreshTokenEntity := &authdomain.RefreshToken{
		Token:     refreshToken,
		UserID:    user.ID,
		ExpiresAt: time.Now().Add(u.config.JWTRefreshExpiry),
	}
	if err := u.userRepo.ReplaceRefreshToken(refreshTokenEntity); err != nil {
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
