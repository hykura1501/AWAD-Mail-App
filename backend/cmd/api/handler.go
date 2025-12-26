package api

import (
	"log"

	authUsecase "ga03-backend/internal/auth/usecase"
	emailDelivery "ga03-backend/internal/email/delivery"
	emailRepo "ga03-backend/internal/email/repository"
	emailUsecasePkg "ga03-backend/internal/email/usecase"
	"ga03-backend/pkg/ai"
	"ga03-backend/pkg/chroma"
	"ga03-backend/pkg/config"
	"ga03-backend/pkg/sse"

	"github.com/gin-gonic/gin"
)

type Handler struct {
	authUsecase    authUsecase.AuthUsecase
	emailUsecase   emailUsecasePkg.EmailUsecase
	sseManager     *sse.Manager
	config         *config.Config
	summaryHandler *emailDelivery.SummaryHandler
}

func NewHandler(authUc authUsecase.AuthUsecase, emailUc emailUsecasePkg.EmailUsecase, sseManager *sse.Manager, cfg *config.Config, summaryRepo emailRepo.EmailSummaryRepository) *Handler {
	// Initialize AI service with pluggable provider (Gemini/Ollama)
	aiCfg := ai.Config{
		Provider:      ai.ProviderType(cfg.AIProvider),
		GeminiAPIKey:  cfg.GeminiApiKey,
		OllamaBaseURL: cfg.OllamaBaseURL,
		OllamaModel:   cfg.OllamaModel,
	}
	aiService, err := ai.NewSummarizerService(aiCfg)
	if err != nil {
		log.Printf("Warning: Failed to initialize AI service: %v", err)
	} else {
		log.Printf("AI service initialized with provider: %s", cfg.AIProvider)
	}

	// Set AI service vào emailUsecase qua interface
	if aiService != nil {
		emailUc.SetGeminiService(aiService)
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

	return &Handler{
		authUsecase:    authUc,
		emailUsecase:   emailUc,
		sseManager:     sseManager,
		config:         cfg,
		summaryHandler: summaryHandler,
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
	SetupRoutes(r, h.authUsecase, h.emailUsecase, h.sseManager, h.config, h.summaryHandler)

	return r.Run(addr)
}
