package ai

import (
	"context"
	"fmt"

	"ga03-backend/pkg/gemini"
)

// Config holds AI provider configuration
type Config struct {
	Provider   ProviderType // "gemini" or "ollama"
	
	// Gemini config
	GeminiAPIKey string
	
	// Ollama config
	OllamaBaseURL string // e.g., "http://localhost:11434"
	OllamaModel   string // e.g., "llama3", "mistral"
}

// GeminiAdapter wraps gemini.GeminiService to implement SummarizerService
type GeminiAdapter struct {
	service *gemini.GeminiService
}

func (g *GeminiAdapter) SummarizeEmail(ctx context.Context, emailText string) (string, error) {
	return g.service.SummarizeEmail(ctx, emailText)
}

func (g *GeminiAdapter) ExtractTasksFromEmail(ctx context.Context, emailText string) ([]TaskExtraction, error) {
	geminiTasks, err := g.service.ExtractTasksFromEmail(ctx, emailText)
	if err != nil {
		return nil, err
	}
	
	// Convert gemini.TaskExtraction to ai.TaskExtraction
	tasks := make([]TaskExtraction, len(geminiTasks))
	for i, gt := range geminiTasks {
		tasks[i] = TaskExtraction{
			Title:       gt.Title,
			Description: gt.Description,
			DueDate:     gt.DueDate,
			Priority:    gt.Priority,
		}
	}
	return tasks, nil
}

// NewSummarizerService creates a SummarizerService based on the config
// This is the factory function - switch AI provider by changing config.Provider
func NewSummarizerService(cfg Config) (SummarizerService, error) {
	switch cfg.Provider {
	case ProviderGemini:
		if cfg.GeminiAPIKey == "" {
			return nil, fmt.Errorf("GEMINI_API_KEY is required for Gemini provider")
		}
		return &GeminiAdapter{service: gemini.NewGeminiService(cfg.GeminiAPIKey)}, nil
		
	case ProviderOllama:
		return NewOllamaService(cfg.OllamaBaseURL, cfg.OllamaModel), nil
		
	default:
		// Default to Gemini if API key is available, otherwise Ollama
		if cfg.GeminiAPIKey != "" {
			return &GeminiAdapter{service: gemini.NewGeminiService(cfg.GeminiAPIKey)}, nil
		}
		return NewOllamaService(cfg.OllamaBaseURL, cfg.OllamaModel), nil
	}
}

