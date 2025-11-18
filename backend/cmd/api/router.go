package api

import (
	"ga03-backend/internal/auth/delivery"
	authUsecase "ga03-backend/internal/auth/usecase"
	emailDelivery "ga03-backend/internal/email/delivery"
	emailUsecase "ga03-backend/internal/email/usecase"
	"ga03-backend/pkg/config"

	"github.com/gin-gonic/gin"
)

func SetupRoutes(r *gin.Engine, authUsecase authUsecase.AuthUsecase, emailUsecase emailUsecase.EmailUsecase, cfg *config.Config) {
	authHandler := delivery.NewAuthHandler(authUsecase)
	emailHandler := emailDelivery.NewEmailHandler(emailUsecase)

	api := r.Group("/api")
	{
		// Auth routes
		auth := api.Group("/auth")
		{
			auth.POST("/login", authHandler.Login)
			auth.POST("/register", authHandler.Register)
			auth.POST("/google", authHandler.GoogleSignIn)
			auth.POST("/refresh", authHandler.RefreshToken)
			auth.GET("/me", delivery.AuthMiddleware(authUsecase), authHandler.Me)
			auth.POST("/logout", authHandler.Logout)
		}

		// Email routes (protected)
		emails := api.Group("/emails")
		emails.Use(delivery.AuthMiddleware(authUsecase))
		{
			emails.GET("/mailboxes", emailHandler.GetAllMailboxes)
			emails.GET("/mailboxes/:id", emailHandler.GetMailboxByID)
			emails.GET("/mailboxes/:id/emails", emailHandler.GetEmailsByMailbox)
			emails.GET("/:id", emailHandler.GetEmailByID)
			emails.PATCH("/:id/read", emailHandler.MarkAsRead)
			emails.PATCH("/:id/star", emailHandler.ToggleStar)
		}
	}
}
