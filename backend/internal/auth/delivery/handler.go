package delivery

import (
	"net/http"

	authdto "ga03-backend/internal/auth/dto"
	"ga03-backend/internal/auth/usecase"

	"github.com/gin-gonic/gin"
)

type AuthHandler struct {
	authUsecase usecase.AuthUsecase
}

func NewAuthHandler(authUsecase usecase.AuthUsecase) *AuthHandler {
	return &AuthHandler{
		authUsecase: authUsecase,
	}
}

func (h *AuthHandler) Login(c *gin.Context) {
	var req authdto.LoginRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}

	result, err := h.authUsecase.Login(&req)
	if err != nil {
		c.JSON(http.StatusUnauthorized, gin.H{"error": err.Error()})
		return
	}

	c.SetSameSite(http.SameSiteNoneMode)
	c.SetCookie("refresh_token", result.RefreshToken, 7*24*3600, "/", "", true, true)
	result.RefreshToken = ""

	c.JSON(http.StatusOK, result)
}

func (h *AuthHandler) IMAPLogin(c *gin.Context) {
	var req authdto.ImapLoginRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}

	result, err := h.authUsecase.IMAPLogin(&req)
	if err != nil {
		c.JSON(http.StatusUnauthorized, gin.H{"error": err.Error()})
		return
	}

	c.SetSameSite(http.SameSiteNoneMode)
	c.SetCookie("refresh_token", result.RefreshToken, 7*24*3600, "/", "", true, true)
	result.RefreshToken = ""

	c.JSON(http.StatusOK, result)
}

func (h *AuthHandler) Register(c *gin.Context) {
	var req authdto.RegisterRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}

	result, err := h.authUsecase.Register(&req)
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}

	c.SetSameSite(http.SameSiteNoneMode)
	c.SetCookie("refresh_token", result.RefreshToken, 7*24*3600, "/", "", true, true)
	result.RefreshToken = ""

	c.JSON(http.StatusOK, result)
}

func (h *AuthHandler) SetPassword(c *gin.Context) {
	var req authdto.SetPasswordRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}

	userID := c.GetString("userID")
	if userID == "" {
		c.JSON(http.StatusUnauthorized, gin.H{"error": "unauthorized"})
		return
	}

	if err := h.authUsecase.SetPassword(userID, req.Password); err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}

	c.JSON(http.StatusOK, gin.H{"message": "password set successfully"})
}

func (h *AuthHandler) GoogleSignIn(c *gin.Context) {
	var req authdto.GoogleSignInRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}

	result, err := h.authUsecase.GoogleSignIn(req.Code, req.Scope)
	if err != nil {
		c.JSON(http.StatusUnauthorized, gin.H{"error": err.Error()})
		return
	}

	c.SetSameSite(http.SameSiteNoneMode)
	c.SetCookie("refresh_token", result.RefreshToken, 7*24*3600, "/", "", true, true)
	result.RefreshToken = ""

	c.JSON(http.StatusOK, result)
}

func (h *AuthHandler) RefreshToken(c *gin.Context) {
	refreshToken, err := c.Cookie("refresh_token")
	if err != nil || refreshToken == "" {
		var req authdto.RefreshTokenRequest
		if err := c.ShouldBindJSON(&req); err == nil && req.RefreshToken != "" {
			refreshToken = req.RefreshToken
		}
	}

	if refreshToken == "" {
		c.JSON(http.StatusBadRequest, gin.H{"error": "refresh token required"})
		return
	}

	result, err := h.authUsecase.RefreshToken(refreshToken)
	if err != nil {
		c.JSON(http.StatusUnauthorized, gin.H{"error": err.Error()})
		return
	}

	// Only update cookie if refresh token was rotated (different from input)
	// This prevents unnecessary cookie updates and race conditions
	newRefreshToken := result.RefreshToken
	if newRefreshToken != "" && newRefreshToken != refreshToken {
		c.SetSameSite(http.SameSiteNoneMode)
		c.SetCookie("refresh_token", newRefreshToken, 7*24*3600, "/", "", true, true)
	}

	// Don't send refresh token in response body for security
	result.RefreshToken = ""

	c.JSON(http.StatusOK, result)
}

func (h *AuthHandler) Me(c *gin.Context) {
	// Get user from context (set by AuthMiddleware)
	user, exists := c.Get("user")
	if !exists {
		c.JSON(http.StatusUnauthorized, gin.H{"error": "not authenticated"})
		return
	}

	c.JSON(http.StatusOK, gin.H{"user": user})
}

func (h *AuthHandler) Logout(c *gin.Context) {
	refreshToken, err := c.Cookie("refresh_token")
	if err != nil || refreshToken == "" {
		var req authdto.RefreshTokenRequest
		if err := c.ShouldBindJSON(&req); err == nil {
			refreshToken = req.RefreshToken
		}
	}

	if refreshToken != "" {
		_ = h.authUsecase.Logout(refreshToken)
	}

	c.SetSameSite(http.SameSiteNoneMode)
	c.SetCookie("refresh_token", "", -1, "/", "", true, true)

	c.JSON(http.StatusOK, gin.H{"message": "logged out successfully"})
}

func (h *AuthHandler) RegisterFCMToken(c *gin.Context) {
	var req authdto.RegisterFCMRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}

	userID := c.GetString("userID")
	if userID == "" {
		c.JSON(http.StatusUnauthorized, gin.H{"error": "unauthorized"})
		return
	}

	if err := h.authUsecase.RegisterFCMToken(userID, req.Token, req.DeviceInfo); err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}

	c.JSON(http.StatusOK, gin.H{"message": "fcm token registered"})
}

func (h *AuthHandler) UnregisterFCMToken(c *gin.Context) {
	token := c.Param("token")
	if token == "" {
		c.JSON(http.StatusBadRequest, gin.H{"error": "token required"})
		return
	}

	if err := h.authUsecase.UnregisterFCMToken(token); err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}

	c.JSON(http.StatusOK, gin.H{"message": "fcm token unregistered"})
}
