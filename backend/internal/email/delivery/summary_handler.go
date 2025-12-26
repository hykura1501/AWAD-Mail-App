package delivery

import (
	"net/http"

	authdomain "ga03-backend/internal/auth/domain"
	"ga03-backend/internal/email/usecase"

	"github.com/gin-gonic/gin"
)

// SummaryHandler handles email summary API endpoints
type SummaryHandler struct {
	summaryWorker *usecase.SummaryWorkerService
	emailUsecase  usecase.EmailUsecase
}

// NewSummaryHandler creates a new SummaryHandler
func NewSummaryHandler(summaryWorker *usecase.SummaryWorkerService, emailUsecase usecase.EmailUsecase) *SummaryHandler {
	return &SummaryHandler{
		summaryWorker: summaryWorker,
		emailUsecase:  emailUsecase,
	}
}

// QueueSummaryRequest represents the request body
type QueueSummaryRequest struct {
	EmailIDs []string `json:"email_ids" binding:"required"`
}

// POST /api/kanban/summarize
// QueueSummaries queues emails for background AI summary generation
// Returns cached summaries immediately; rest will arrive via SSE "summary_update" events
func (h *SummaryHandler) QueueSummaries(c *gin.Context) {
	user, exists := c.Get("user")
	if !exists {
		c.JSON(http.StatusUnauthorized, gin.H{"error": "not authenticated"})
		return
	}
	userData, ok := user.(*authdomain.User)
	if !ok {
		c.JSON(http.StatusUnauthorized, gin.H{"error": "invalid user data"})
		return
	}
	userID := userData.ID

	var req QueueSummaryRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}

	if len(req.EmailIDs) == 0 {
		c.JSON(http.StatusOK, gin.H{"summaries": map[string]string{}, "queued": 0})
		return
	}

	// Get cached summaries
	cachedSummaries, err := h.summaryWorker.GetCachedSummaries(userID, req.EmailIDs)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "failed to get summaries"})
		return
	}

	// Queue emails that need summarization
	queuedCount := 0
	for _, emailID := range req.EmailIDs {
		if _, hasCached := cachedSummaries[emailID]; hasCached {
			continue
		}

		// Fetch email to get subject/body for summarization
		email, err := h.emailUsecase.GetEmailByID(userID, emailID)
		if err != nil || email == nil {
			continue
		}

		job := usecase.SummaryJob{
			UserID:  userID,
			EmailID: email.ID,
			Subject: email.Subject,
			Body:    email.Body,
		}
		if h.summaryWorker.QueueJob(job) {
			queuedCount++
		}
	}

	c.JSON(http.StatusOK, gin.H{
		"summaries": cachedSummaries,
		"queued":    queuedCount,
	})
}
