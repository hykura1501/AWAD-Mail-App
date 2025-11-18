package api

import (
	authUsecase "ga03-backend/internal/auth/usecase"
	emailUsecase "ga03-backend/internal/email/usecase"
	"ga03-backend/pkg/config"

	"github.com/gin-gonic/gin"
)

type Handler struct {
	authUsecase  authUsecase.AuthUsecase
	emailUsecase emailUsecase.EmailUsecase
	config       *config.Config
}

func NewHandler(authUsecase authUsecase.AuthUsecase, emailUsecase emailUsecase.EmailUsecase, cfg *config.Config) *Handler {
	return &Handler{
		authUsecase:  authUsecase,
		emailUsecase: emailUsecase,
		config:       cfg,
	}
}

func (h *Handler) Start(addr string) error {
	r := gin.Default()
	gin.SetMode(gin.ReleaseMode)

	// CORS middleware
	r.Use(func(c *gin.Context) {
		c.Writer.Header().Set("Access-Control-Allow-Origin", "*")
		c.Writer.Header().Set("Access-Control-Allow-Credentials", "true")
		c.Writer.Header().Set("Access-Control-Allow-Headers", "Content-Type, Content-Length, Accept-Encoding, X-CSRF-Token, Authorization, accept, origin, Cache-Control, X-Requested-With")
		c.Writer.Header().Set("Access-Control-Allow-Methods", "POST, OPTIONS, GET, PUT, DELETE, PATCH")

		if c.Request.Method == "OPTIONS" {
			c.AbortWithStatus(204)
			return
		}

		c.Next()
	})

	// Setup routes
	SetupRoutes(r, h.authUsecase, h.emailUsecase, h.config)

	return r.Run(addr)
}
