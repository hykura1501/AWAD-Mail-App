package api

import (
	"log"

	authUsecase "ga03-backend/internal/auth/usecase"
	emailDelivery "ga03-backend/internal/email/delivery"
	emailRepo "ga03-backend/internal/email/repository"
	emailUsecasePkg "ga03-backend/internal/email/usecase"
	taskDelivery "ga03-backend/internal/task/delivery"
	taskRepo "ga03-backend/internal/task/repository"
	taskUsecasePkg "ga03-backend/internal/task/usecase"
	"ga03-backend/pkg/ai"
	"ga03-backend/pkg/chroma"
	"ga03-backend/pkg/config"
	"ga03-backend/pkg/sse"

	"github.com/gin-gonic/gin"
)

type Handler struct {
	authUsecase    authUsecase.AuthUsecase
	emailUsecase   emailUsecasePkg.EmailUsecase
	taskUsecase    taskUsecasePkg.TaskUsecase
	sseManager     *sse.Manager
	config         *config.Config
	summaryHandler *emailDelivery.SummaryHandler
	taskHandler    *taskDelivery.TaskHandler
}

// emailFetcherAdapter adapts EmailUsecase to TaskUsecase.EmailFetcher interface
type emailFetcherAdapter struct {
	emailUc emailUsecasePkg.EmailUsecase
}

func (a *emailFetcherAdapter) GetEmailByID(userID, id string) (subject, body string, err error) {
	email, err := a.emailUc.GetEmailByID(userID, id)
	if err != nil {
		return "", "", err
	}
	return email.Subject, email.Body, nil
}

func NewHandler(authUc authUsecase.AuthUsecase, emailUc emailUsecasePkg.EmailUsecase, taskUc taskUsecasePkg.TaskUsecase, sseManager *sse.Manager, cfg *config.Config, summaryRepo emailRepo.EmailSummaryRepository, taskRepository taskRepo.TaskRepository) *Handler {
	// Initialize runtime config for settings API
	InitRuntimeConfig(cfg.OllamaBaseURL, cfg.OllamaModel)

	// Initialize AI service with dynamic config getters for runtime updates
	aiCfg := ai.DynamicConfig{
		Provider:         ai.ProviderType(cfg.AIProvider),
		GeminiAPIKey:     cfg.GeminiApiKey,
		GetOllamaBaseURL: GetRuntimeOllamaBaseURL,
		GetOllamaModel:   GetRuntimeOllamaModel,
	}
	aiService, err := ai.NewSummarizerServiceWithDynamicConfig(aiCfg)
	if err != nil {
		log.Printf("Warning: Failed to initialize AI service: %v", err)
	} else {
		log.Printf("AI service initialized with provider: %s (dynamic config enabled)", cfg.AIProvider)
	}

	// Set AI service vào emailUsecase qua interface
	if aiService != nil {
		emailUc.SetAIService(aiService)
	}

	// Initialize Chroma client for vector search
	if cfg.ChromaAPIKey != "" {
		chromaClient, err := chroma.NewChromaClient(cfg)
		if err != nil {
			log.Printf("Warning: Failed to initialize Chroma client: %v. Semantic search will not be available.", err)
		} else {
			emailUc.SetVectorSearchService(chromaClient)
			log.Println("Chroma client initialized successfully")
		}
	} else {
		log.Println("Warning: CHROMA_API_KEY not set. Semantic search will not be available.")
	}

	// Initialize SummaryWorkerService for background AI summaries
	summaryWorker := emailUsecasePkg.NewSummaryWorkerService(summaryRepo, sseManager, 3)
	if aiService != nil {
		summaryWorker.SetGeminiService(aiService)
	}
	summaryWorker.Start()
	log.Println("Summary worker service started")

	// Create SummaryHandler
	summaryHandler := emailDelivery.NewSummaryHandler(summaryWorker, emailUc)

	// Set up Task Usecase with AI service and email fetcher
	if aiService != nil {
		taskUc.SetGeminiService(aiService)
	}
	taskUc.SetEmailFetcher(&emailFetcherAdapter{emailUc: emailUc})

	// Create TaskHandler
	taskHandler := taskDelivery.NewTaskHandler(taskUc)
	log.Println("Task handler initialized")

	return &Handler{
		authUsecase:    authUc,
		emailUsecase:   emailUc,
		taskUsecase:    taskUc,
		sseManager:     sseManager,
		config:         cfg,
		summaryHandler: summaryHandler,
		taskHandler:    taskHandler,
	}
}


func (h *Handler) Start(addr string) error {
	r := gin.Default()
	gin.SetMode(gin.ReleaseMode)

	// CORS middleware
	r.Use(func(c *gin.Context) {
		origin := c.Request.Header.Get("Origin")
		if origin != "" {
			c.Writer.Header().Set("Access-Control-Allow-Origin", origin)
		} else {
			c.Writer.Header().Set("Access-Control-Allow-Origin", "*")
		}

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
	SetupRoutes(r, h.authUsecase, h.emailUsecase, h.sseManager, h.config, h.summaryHandler, h.taskHandler)

	return r.Run(addr)
}

