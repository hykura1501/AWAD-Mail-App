package ai

import (
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

// NewSummarizerService creates a SummarizerService based on the config
// This is the factory function - switch AI provider by changing config.Provider
func NewSummarizerService(cfg Config) (SummarizerService, error) {
	switch cfg.Provider {
	case ProviderGemini:
		if cfg.GeminiAPIKey == "" {
			return nil, fmt.Errorf("GEMINI_API_KEY is required for Gemini provider")
		}
		return gemini.NewGeminiService(cfg.GeminiAPIKey), nil
		
	case ProviderOllama:
		return NewOllamaService(cfg.OllamaBaseURL, cfg.OllamaModel), nil
		
	default:
		// Default to Gemini if API key is available, otherwise Ollama
		if cfg.GeminiAPIKey != "" {
			return gemini.NewGeminiService(cfg.GeminiAPIKey), nil
		}
		return NewOllamaService(cfg.OllamaBaseURL, cfg.OllamaModel), nil
	}
}
