package dto

import authdomain "ga03-backend/internal/auth/domain"

type LoginRequest struct {
	Email    string `json:"email" binding:"required,email"`
	Password string `json:"password" binding:"required,min=6"`
}

type RegisterRequest struct {
	Email    string `json:"email" binding:"required,email"`
	Password string `json:"password" binding:"required,min=6"`
	Name     string `json:"name" binding:"required"`
}

type GoogleSignInRequest struct {
	Code        string `json:"code" binding:"required"`
	Scope       []string `json:"scope" binding:"required"`
}

type RefreshTokenRequest struct {
	RefreshToken string `json:"refresh_token" binding:"required"`
}

type ImapLoginRequest struct {
	Email      string `json:"email" binding:"required,email"`
	Password   string `json:"password" binding:"required"`
	ImapServer string `json:"imapServer" binding:"required"`
	ImapPort   int    `json:"imapPort" binding:"required"`
}

type SetPasswordRequest struct {
	Password string `json:"password" binding:"required,min=6"`
}

type TokenResponse struct {
	AccessToken      string              `json:"access_token"`
	RefreshToken     string              `json:"refresh_token"`
	User             *authdomain.User    `json:"user"`
	NeedsPasswordSet bool                `json:"needs_password_set"`
}

type RegisterFCMRequest struct {
	Token      string `json:"token" binding:"required"`
	DeviceInfo string `json:"device_info"`
}
