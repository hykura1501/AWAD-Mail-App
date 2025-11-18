package main

import (
	"log"
	"os"

	api "ga03-backend/cmd/api"
	authRepo "ga03-backend/internal/auth/repository"
	authUsecase "ga03-backend/internal/auth/usecase"
	emailRepo "ga03-backend/internal/email/repository"
	emailUsecase "ga03-backend/internal/email/usecase"
	"ga03-backend/pkg/config"
)

func main() {
	// Load configuration
	cfg := config.Load()

	// Initialize repositories (dependency injection)
	userRepo := authRepo.NewUserRepository()
	emailRepository := emailRepo.NewEmailRepository()

	// Initialize use cases (dependency injection)
	authUsecaseInstance := authUsecase.NewAuthUsecase(userRepo, cfg)
	emailUsecaseInstance := emailUsecase.NewEmailUsecase(emailRepository)

	// Initialize HTTP handler
	handler := api.NewHandler(authUsecaseInstance, emailUsecaseInstance, cfg)

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
