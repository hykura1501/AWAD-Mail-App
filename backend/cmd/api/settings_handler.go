package api

import (
	"net/http"
	"sync"

	"github.com/gin-gonic/gin"
)

// RuntimeConfig holds runtime-configurable settings
type RuntimeConfig struct {
	OllamaBaseURL string `json:"ollama_base_url"`
	OllamaModel   string `json:"ollama_model,omitempty"`
}

var (
	runtimeConfig     RuntimeConfig
	runtimeConfigLock sync.RWMutex
)

// InitRuntimeConfig initializes runtime config from static config
func InitRuntimeConfig(ollamaBaseURL, ollamaModel string) {
	runtimeConfigLock.Lock()
	defer runtimeConfigLock.Unlock()
	runtimeConfig = RuntimeConfig{
		OllamaBaseURL: ollamaBaseURL,
		OllamaModel:   ollamaModel,
	}
}

// GetRuntimeOllamaBaseURL returns the current runtime Ollama base URL
func GetRuntimeOllamaBaseURL() string {
	runtimeConfigLock.RLock()
	defer runtimeConfigLock.RUnlock()
	return runtimeConfig.OllamaBaseURL
}

// GetRuntimeOllamaModel returns the current runtime Ollama model
func GetRuntimeOllamaModel() string {
	runtimeConfigLock.RLock()
	defer runtimeConfigLock.RUnlock()
	return runtimeConfig.OllamaModel
}

// UpdateOllamaSettingsRequest represents the request body for updating Ollama settings
type UpdateOllamaSettingsRequest struct {
	OllamaBaseURL string `json:"ollama_base_url" binding:"required"`
	OllamaModel   string `json:"ollama_model,omitempty"`
}

// GetOllamaSettings returns current Ollama configuration
// GET /api/settings/ollama
func GetOllamaSettings(c *gin.Context) {
	runtimeConfigLock.RLock()
	defer runtimeConfigLock.RUnlock()
	
	c.JSON(http.StatusOK, gin.H{
		"ollama_base_url": runtimeConfig.OllamaBaseURL,
		"ollama_model":    runtimeConfig.OllamaModel,
	})
}

// UpdateOllamaSettings updates Ollama configuration at runtime
// PUT /api/settings/ollama
func UpdateOllamaSettings(c *gin.Context) {
	var req UpdateOllamaSettingsRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}

	runtimeConfigLock.Lock()
	runtimeConfig.OllamaBaseURL = req.OllamaBaseURL
	if req.OllamaModel != "" {
		runtimeConfig.OllamaModel = req.OllamaModel
	}
	runtimeConfigLock.Unlock()

	c.JSON(http.StatusOK, gin.H{
		"message":         "Ollama settings updated successfully",
		"ollama_base_url": req.OllamaBaseURL,
		"ollama_model":    GetRuntimeOllamaModel(),
	})
}

// TestOllamaConnection tests if the Ollama server is reachable
// POST /api/settings/ollama/test
func TestOllamaConnection(c *gin.Context) {
	var req struct {
		OllamaBaseURL string `json:"ollama_base_url"`
	}
	if err := c.ShouldBindJSON(&req); err != nil {
		// If no body provided, use current config
		req.OllamaBaseURL = GetRuntimeOllamaBaseURL()
	}
	if req.OllamaBaseURL == "" {
		req.OllamaBaseURL = GetRuntimeOllamaBaseURL()
	}

	// Test connection by calling Ollama's /api/tags endpoint
	resp, err := http.Get(req.OllamaBaseURL + "/api/tags")
	if err != nil {
		c.JSON(http.StatusServiceUnavailable, gin.H{
			"connected": false,
			"error":     err.Error(),
		})
		return
	}
	defer resp.Body.Close()

	if resp.StatusCode != http.StatusOK {
		c.JSON(http.StatusServiceUnavailable, gin.H{
			"connected":   false,
			"status_code": resp.StatusCode,
		})
		return
	}

	c.JSON(http.StatusOK, gin.H{
		"connected":       true,
		"ollama_base_url": req.OllamaBaseURL,
	})
}
