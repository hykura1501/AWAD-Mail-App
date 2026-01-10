package ai

import (
	"context"
	"time"
)

// TaskExtraction represents an extracted task from email (shared type)
type TaskExtraction struct {
	Title       string     `json:"title"`
	Description string     `json:"description,omitempty"`
	DueDate     *time.Time `json:"due_date,omitempty"`
	Priority    string     `json:"priority"`
}

// SummarizerService is the interface for AI summarization and task extraction
// Implement this interface to add new AI providers (Gemini, Ollama, OpenAI, etc.)
type SummarizerService interface {
	SummarizeEmail(ctx context.Context, emailText string) (string, error)
	ExtractTasksFromEmail(ctx context.Context, emailText string) ([]TaskExtraction, error)
	GenerateSynonyms(ctx context.Context, word string) ([]string, error)
}

// ProviderType represents the AI provider type
type ProviderType string

const (
	ProviderGemini ProviderType = "gemini"
	ProviderOllama ProviderType = "ollama"
	ProviderAuto   ProviderType = "auto"
)

