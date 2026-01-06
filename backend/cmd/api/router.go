package api

import (
	"ga03-backend/internal/auth/delivery"
	authUsecase "ga03-backend/internal/auth/usecase"
	emailDelivery "ga03-backend/internal/email/delivery"
	emailUsecase "ga03-backend/internal/email/usecase"
	taskDelivery "ga03-backend/internal/task/delivery"
	"ga03-backend/pkg/config"
	"ga03-backend/pkg/sse"
	"net/http"

	"github.com/gin-gonic/gin"
)

func SetupRoutes(r *gin.Engine, authUsecase authUsecase.AuthUsecase, emailUsecase emailUsecase.EmailUsecase, sseManager *sse.Manager, cfg *config.Config, summaryHandler *emailDelivery.SummaryHandler, taskHandler *taskDelivery.TaskHandler) {
	authHandler := delivery.NewAuthHandler(authUsecase)
	emailHandler := emailDelivery.NewEmailHandler(emailUsecase)

	api := r.Group("/api")
	{
		// Health check (no auth required)
		api.GET("/health", func(c *gin.Context) {
			c.JSON(http.StatusOK, gin.H{"status": "ok"})
		})

		// SSE endpoint
		api.GET("/events", delivery.AuthMiddleware(authUsecase), func(c *gin.Context) {
			userID := c.GetString("userID")
			sseManager.ServeHTTP(c, userID)
		})

		// Auth routes
		auth := api.Group("/auth")
		{
			auth.POST("/login", authHandler.Login)
			auth.POST("/imap", authHandler.IMAPLogin)
			auth.POST("/register", authHandler.Register)
			auth.POST("/google", authHandler.GoogleSignIn)
			auth.POST("/refresh", authHandler.RefreshToken)
			auth.GET("/me", delivery.AuthMiddleware(authUsecase), authHandler.Me)
			auth.POST("/logout", authHandler.Logout)
			auth.POST("/set-password", delivery.AuthMiddleware(authUsecase), authHandler.SetPassword)
		}
		
		// FCM routes (protected)
		fcm := api.Group("/fcm")
		fcm.Use(delivery.AuthMiddleware(authUsecase))
		{
			fcm.POST("/register", authHandler.RegisterFCMToken)
			fcm.DELETE("/:token", authHandler.UnregisterFCMToken)
		}

		// Email routes (protected)
		emails := api.Group("/emails")
		emails.Use(delivery.AuthMiddleware(authUsecase))
		{
			emails.GET("/mailboxes", emailHandler.GetAllMailboxes)
			emails.GET("/mailboxes/:id", emailHandler.GetMailboxByID)
			emails.GET("/mailboxes/:id/emails", emailHandler.GetEmailsByMailbox)
			emails.GET("/status/:status", emailHandler.GetEmailsByStatus) // Kanban status API
			emails.GET("/:id", emailHandler.GetEmailByID)
			emails.GET("/:id/summary", emailHandler.SummarizeEmail)
			emails.GET("/:id/attachments/:attachmentId", emailHandler.GetAttachment)
			emails.PATCH("/:id/read", emailHandler.MarkAsRead)
			emails.PATCH("/:id/unread", emailHandler.MarkAsUnread)
			emails.PATCH("/:id/star", emailHandler.ToggleStar)
			emails.PATCH("/:id/mailbox", emailHandler.MoveEmailToMailbox)
			emails.POST("/:id/snooze", emailHandler.SnoozeEmail)
			emails.POST("/:id/unsnooze", emailHandler.UnsnoozeEmail)
			emails.POST("/send", emailHandler.SendEmail)
			emails.POST("/:id/trash", emailHandler.TrashEmail)
			emails.POST("/:id/archive", emailHandler.ArchiveEmail)
			emails.POST("/watch", emailHandler.WatchMailbox)
			emails.GET("/search", emailHandler.FuzzySearch)
			emails.POST("/bulk", emailHandler.BulkOperation)
			emails.DELETE("/:id/permanent", emailHandler.PermanentDeleteEmail)
		}

		// Search routes (protected)
		search := api.Group("/search")
		search.Use(delivery.AuthMiddleware(authUsecase))
		{
			search.POST("/semantic", emailHandler.SemanticSearch)
			search.GET("/suggestions", emailHandler.GetSearchSuggestions)
		}

		// Kanban routes (protected)
		kanban := api.Group("/kanban")
		kanban.Use(delivery.AuthMiddleware(authUsecase))
		{
			kanban.GET("/columns", emailHandler.GetKanbanColumns)
			kanban.POST("/columns", emailHandler.CreateKanbanColumn)
			kanban.PUT("/columns/:column_id", emailHandler.UpdateKanbanColumn)
			kanban.DELETE("/columns/:column_id", emailHandler.DeleteKanbanColumn)
			kanban.PUT("/columns/orders", emailHandler.UpdateKanbanColumnOrders)
			kanban.POST("/summarize", summaryHandler.QueueSummaries) // Background AI summary generation
		}

		// Task routes (protected) - AI task extraction and management
		if taskHandler != nil {
			tasks := api.Group("/tasks")
			tasks.Use(delivery.AuthMiddleware(authUsecase))
			{
				tasks.GET("", taskHandler.GetTasks)
				tasks.POST("", taskHandler.CreateTask)
				tasks.GET("/:id", taskHandler.GetTaskByID)
				tasks.PUT("/:id", taskHandler.UpdateTask)
				tasks.DELETE("/:id", taskHandler.DeleteTask)
				tasks.PATCH("/:id/status", taskHandler.UpdateTaskStatus)
				tasks.POST("/extract/:emailId", taskHandler.ExtractTasksFromEmail)
			}
		}

		// Settings routes (public) - Runtime configuration
		settings := api.Group("/settings")
		{
			settings.GET("/ollama", GetOllamaSettings)
			settings.PUT("/ollama", UpdateOllamaSettings)
			settings.POST("/ollama/test", TestOllamaConnection)
		}
	}
}

