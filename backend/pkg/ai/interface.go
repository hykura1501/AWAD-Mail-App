package ai

import (
	"context"
)

// SummarizerService is the interface for AI summarization
// Implement this interface to add new AI providers (Gemini, Ollama, OpenAI, etc.)
type SummarizerService interface {
	SummarizeEmail(ctx context.Context, emailText string) (string, error)
}

// ProviderType represents the AI provider type
type ProviderType string

const (
	ProviderGemini ProviderType = "gemini"
	ProviderOllama ProviderType = "ollama"
)
