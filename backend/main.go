package main

import (
	"context"
	"log"
	"os"
	"strings"

	api "ga03-backend/cmd/api"
	authdomain "ga03-backend/internal/auth/domain"
	authRepo "ga03-backend/internal/auth/repository"
	authUsecase "ga03-backend/internal/auth/usecase"
	emaildomain "ga03-backend/internal/email/domain"
	emailRepo "ga03-backend/internal/email/repository"
	emailUsecase "ga03-backend/internal/email/usecase"
	"ga03-backend/internal/notification"
	"ga03-backend/pkg/config"
	"ga03-backend/pkg/database"
	"ga03-backend/pkg/fcm"
	"ga03-backend/pkg/gmail"
	"ga03-backend/pkg/imap"
	"ga03-backend/pkg/sse"
)

func main() {
	// Load configuration
	cfg := config.Load()

	// Initialize database
	db, err := database.NewPostgresConnection(cfg)
	if err != nil {
		log.Fatal("Failed to connect to database:", err)
	}

	// Auto-migrate database schemas
	if err := db.AutoMigrate(&authdomain.User{}, &authdomain.RefreshToken{}, &authdomain.FCMToken{}, &emaildomain.EmailSyncHistory{}, &emaildomain.KanbanColumn{}, &emaildomain.EmailKanbanColumn{}, &emaildomain.EmailSummary{}); err != nil {
		log.Fatal("Failed to migrate database:", err)
	}

	// Initialize repositories (dependency injection)
	userRepo := authRepo.NewUserRepository(db)
	fcmTokenRepo := authRepo.NewFCMTokenRepository(db)
	emailRepository := emailRepo.NewEmailRepository()
	emailSyncHistoryRepo := emailRepo.NewEmailSyncHistoryRepository(db)
	kanbanColumnRepo := emailRepo.NewKanbanColumnRepository(db)
	emailKanbanColumnRepo := emailRepo.NewEmailKanbanColumnRepository(db)
	emailSummaryRepo := emailRepo.NewEmailSummaryRepository(db)

	// Initialize SSE Manager
	sseManager := sse.NewManager()
	go sseManager.Run()

	// Initialize Gmail service (needed for notification service and email usecase)
	gmailService := gmail.NewService(cfg.GoogleClientID, cfg.GoogleClientSecret)

	// Initialize IMAP service
	imapService := imap.NewService()

	// Initialize Notification Service (Pub/Sub)
	// Only start if project ID is configured
	if cfg.GoogleProjectID != "" {
		log.Printf("[DEBUG] Initializing notification service with projectID: %s", cfg.GoogleProjectID)
		
		// Extract short topic name from full resource name if necessary
		topicName := cfg.GooglePubSubTopic
		if parts := strings.Split(topicName, "/"); len(parts) > 1 {
			topicName = parts[len(parts)-1]
		}
		if topicName == "" {
			topicName = "gmail-updates"
		}
		log.Printf("[DEBUG] Using topic name: %s", topicName)
		
		// Initialize FCM Client (optional, notification service works without it)
		var fcmClient *fcm.Client
		if cfg.FirebaseCredentials != "" {
			var err error
			fcmClient, err = fcm.NewClient(cfg.FirebaseCredentials)
			if err != nil {
				log.Printf("[WARN] Failed to initialize FCM client (push notifications disabled): %v", err)
			} else {
				log.Printf("[DEBUG] FCM client initialized successfully")
			}
		} else {
			log.Printf("[DEBUG] No Firebase credentials configured, FCM disabled")
		}

		notifService, err := notification.NewService(cfg.GoogleProjectID, topicName, sseManager, userRepo, fcmTokenRepo, fcmClient, gmailService, cfg.GoogleCredentials)
		if err != nil {
			log.Printf("[ERROR] Failed to initialize notification service: %v", err)
		} else {
			log.Printf("[DEBUG] Notification service initialized, starting...")
			go notifService.Start(context.Background())
		}
	} else {
		log.Printf("[WARN] GoogleProjectID not configured, notification service disabled")
	}

	// Initialize use cases (dependency injection)
	authUsecaseInstance := authUsecase.NewAuthUsecase(userRepo, fcmTokenRepo, cfg)
	emailUsecaseInstance := emailUsecase.NewEmailUsecase(emailRepository, emailSyncHistoryRepo, kanbanColumnRepo, emailKanbanColumnRepo, userRepo, gmailService, imapService, cfg, cfg.GooglePubSubTopic)

	// Set up email sync callback for auth usecase
	// This will sync all emails after login/registration
	authUsecaseInstance.SetEmailSyncCallback(emailUsecaseInstance.SyncAllEmailsForUser)

	// Initialize HTTP handler
	handler := api.NewHandler(authUsecaseInstance, emailUsecaseInstance, sseManager, cfg, emailSummaryRepo)

	// Start server

	// Start server
	port := os.Getenv("PORT")
	if port == "" {
		port = "8080"
	}

	log.Printf("Server starting on port %s", port)
	if err := handler.Start(":" + port); err != nil {
		log.Fatal("Failed to start server:", err)
	}
}
