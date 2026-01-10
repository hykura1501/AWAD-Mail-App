package ai

import (
	"context"
	"fmt"
	"log"
	"net"
	"strings"
)

// FallbackService implements smart AI provider routing with fallback
// - Summarization: Ollama first (local, free), fallback to Gemini
// - Task extraction: Gemini first (better quality), fallback to Ollama
type FallbackService struct {
	gemini SummarizerService
	ollama *OllamaService
}

// NewFallbackService creates a new fallback service with both providers
func NewFallbackService(gemini SummarizerService, ollama *OllamaService) *FallbackService {
	return &FallbackService{
		gemini: gemini,
		ollama: ollama,
	}
}

// isConnectionError checks if the error is a network/connection error
func isConnectionError(err error) bool {
	if err == nil {
		return false
	}
	
	// Check for network errors
	if _, ok := err.(net.Error); ok {
		return true
	}
	
	// Check for common connection error messages
	errStr := err.Error()
	connectionIndicators := []string{
		"connection refused",
		"no such host",
		"network is unreachable",
		"connection reset",
		"timeout",
		"dial tcp",
		"EOF",
	}
	
	for _, indicator := range connectionIndicators {
		if strings.Contains(strings.ToLower(errStr), strings.ToLower(indicator)) {
			return true
		}
	}
	
	return false
}

// isQuotaError checks if the error indicates API quota exhaustion (429)
func isQuotaError(err error) bool {
	if err == nil {
		return false
	}
	
	errStr := err.Error()
	quotaIndicators := []string{
		"429",
		"quota",
		"rate limit",
		"too many requests",
		"resource exhausted",
		"RESOURCE_EXHAUSTED",
	}
	
	for _, indicator := range quotaIndicators {
		if strings.Contains(strings.ToLower(errStr), strings.ToLower(indicator)) {
			return true
		}
	}
	
	return false
}

// SummarizeEmail tries Ollama first (free, local), falls back to Gemini on connection error
func (f *FallbackService) SummarizeEmail(ctx context.Context, emailText string) (string, error) {
	// Try Ollama first for summarization (local, free)
	if f.ollama != nil {
		log.Println("[AI] Trying Ollama for summarization...")
		result, err := f.ollama.SummarizeEmail(ctx, emailText)
		if err == nil {
			log.Println("[AI] Ollama summarization successful")
			return result, nil
		}
		
		// If connection error, try Gemini
		if isConnectionError(err) {
			log.Printf("[AI] Ollama connection failed: %v, falling back to Gemini", err)
		} else {
			// Other errors, still try Gemini but log the error
			log.Printf("[AI] Ollama error: %v, falling back to Gemini", err)
		}
	}
	
	// Fallback to Gemini
	if f.gemini != nil {
		log.Println("[AI] Using Gemini for summarization...")
		result, err := f.gemini.SummarizeEmail(ctx, emailText)
		if err == nil {
			log.Println("[AI] Gemini summarization successful")
			return result, nil
		}
		
		// If Gemini also fails with quota error, try Ollama again (might have been temp issue)
		if isQuotaError(err) && f.ollama != nil {
			log.Printf("[AI] Gemini quota exhausted: %v, retrying Ollama", err)
			return f.ollama.SummarizeEmail(ctx, emailText)
		}
		
		return "", fmt.Errorf("gemini summarization failed: %w", err)
	}
	
	return "", fmt.Errorf("no AI provider available for summarization")
}

// ExtractTasksFromEmail tries Gemini first (better quality), falls back to Ollama on quota error
func (f *FallbackService) ExtractTasksFromEmail(ctx context.Context, emailText string) ([]TaskExtraction, error) {
	// Try Gemini first for task extraction (better quality)
	if f.gemini != nil {
		log.Println("[AI] Trying Gemini for task extraction...")
		result, err := f.gemini.ExtractTasksFromEmail(ctx, emailText)
		if err == nil {
			log.Println("[AI] Gemini task extraction successful")
			return result, nil
		}
		
		// If quota error, try Ollama
		if isQuotaError(err) {
			log.Printf("[AI] Gemini quota exhausted: %v, falling back to Ollama", err)
		} else {
			// Other errors, still try Ollama but log
			log.Printf("[AI] Gemini error: %v, falling back to Ollama", err)
		}
	}
	
	// Fallback to Ollama
	if f.ollama != nil {
		log.Println("[AI] Using Ollama for task extraction...")
		result, err := f.ollama.ExtractTasksFromEmail(ctx, emailText)
		if err == nil {
			log.Println("[AI] Ollama task extraction successful")
			return result, nil
		}
		
		// If Ollama also fails with connection error, try Gemini again
		if isConnectionError(err) && f.gemini != nil {
			log.Printf("[AI] Ollama connection failed: %v, retrying Gemini", err)
			return f.gemini.ExtractTasksFromEmail(ctx, emailText)
		}
		
		return nil, fmt.Errorf("ollama task extraction failed: %w", err)
	}
	
	return nil, fmt.Errorf("no AI provider available for task extraction")
}

// GenerateSynonyms tries Gemini first (better quality), falls back to Ollama
func (f *FallbackService) GenerateSynonyms(ctx context.Context, word string) ([]string, error) {
	// Try Gemini first for synonyms (better understanding of concepts)
	if f.gemini != nil {
		result, err := f.gemini.GenerateSynonyms(ctx, word)
		if err == nil {
			return result, nil
		}
		
		if isQuotaError(err) {
			log.Printf("[AI] Gemini quota exhausted for synonyms: %v, falling back to Ollama", err)
		} else {
			log.Printf("[AI] Gemini error for synonyms: %v, falling back to Ollama", err)
		}
	}
	
	// Fallback to Ollama
	if f.ollama != nil {
		result, err := f.ollama.GenerateSynonyms(ctx, word)
		if err == nil {
			return result, nil
		}
		
		if isConnectionError(err) && f.gemini != nil {
			log.Printf("[AI] Ollama connection failed for synonyms: %v, retrying Gemini", err)
			return f.gemini.GenerateSynonyms(ctx, word)
		}
		
		return nil, fmt.Errorf("ollama synonyms generation failed: %w", err)
	}
	
	return nil, fmt.Errorf("no AI provider available for synonyms generation")
}
