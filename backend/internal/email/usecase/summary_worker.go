package usecase

import (
	"context"
	"fmt"
	"log"
	"sync"

	emaildomain "ga03-backend/internal/email/domain"
	"ga03-backend/internal/email/repository"
	"ga03-backend/pkg/sse"
)

// SummaryJob represents a job to generate AI summary for an email
type SummaryJob struct {
	UserID  string
	EmailID string
	Subject string
	Body    string
}

// SummaryWorkerService handles background AI summary generation
type SummaryWorkerService struct {
	summaryRepo   repository.EmailSummaryRepository
	geminiService interface {
		SummarizeEmail(ctx context.Context, emailText string) (string, error)
	}
	sseManager  *sse.Manager
	jobQueue    chan SummaryJob
	workerWg    sync.WaitGroup
	workerCount int
	started     bool
	mu          sync.Mutex
}

// NewSummaryWorkerService creates a new summary worker service
func NewSummaryWorkerService(
	summaryRepo repository.EmailSummaryRepository,
	sseManager *sse.Manager,
	workerCount int,
) *SummaryWorkerService {
	if workerCount <= 0 {
		workerCount = 3 // Default to 3 workers
	}

	return &SummaryWorkerService{
		summaryRepo: summaryRepo,
		sseManager:  sseManager,
		jobQueue:    make(chan SummaryJob, 500), // Buffered channel
		workerCount: workerCount,
	}
}

// SetGeminiService sets the Gemini service for AI summarization
func (s *SummaryWorkerService) SetGeminiService(svc interface {
	SummarizeEmail(ctx context.Context, emailText string) (string, error)
}) {
	s.geminiService = svc
}

// Start starts the summary workers
func (s *SummaryWorkerService) Start() {
	s.mu.Lock()
	defer s.mu.Unlock()

	if s.started {
		return
	}

	for i := 0; i < s.workerCount; i++ {
		s.workerWg.Add(1)
		go s.worker(i)
	}
	s.started = true
	log.Printf("[SummaryWorker] Started %d workers", s.workerCount)
}

// Stop stops all workers gracefully
func (s *SummaryWorkerService) Stop() {
	close(s.jobQueue)
	s.workerWg.Wait()
	log.Println("[SummaryWorker] All workers stopped")
}

// worker processes summary jobs from the queue
func (s *SummaryWorkerService) worker(id int) {
	defer s.workerWg.Done()

	for job := range s.jobQueue {
		s.processJob(job)
	}

	log.Printf("[SummaryWorker] Worker %d stopped", id)
}

// processJob processes a single summary job
func (s *SummaryWorkerService) processJob(job SummaryJob) {
	if s.geminiService == nil {
		return
	}

	// Check if summary already exists (cache hit)
	existing, err := s.summaryRepo.GetSummary(job.UserID, job.EmailID)
	if err != nil {
		log.Printf("[SummaryWorker] Error checking cache: %v", err)
		return
	}
	if existing != nil {
		// Already have summary, send via SSE
		s.sendSummaryUpdate(job.UserID, job.EmailID, existing.Summary)
		return
	}

	// Generate summary using Gemini AI
	ctx := context.Background()
	emailText := fmt.Sprintf("Subject: %s\n\nBody: %s", job.Subject, job.Body)

	// Truncate to avoid token limits
	if len(emailText) > 5000 {
		emailText = emailText[:5000]
	}

	summary, err := s.geminiService.SummarizeEmail(ctx, emailText)
	if err != nil {
		log.Printf("[SummaryWorker] AI error for email %s: %v", job.EmailID, err)
		return
	}

	// Truncate summary to 2-3 sentences if too long
	if len(summary) > 200 {
		summary = summary[:200] + "..."
	}

	// Save to database (cache)
	if err := s.summaryRepo.SaveSummary(job.UserID, job.EmailID, summary); err != nil {
		log.Printf("[SummaryWorker] Save error: %v", err)
		return
	}

	// Send real-time update via SSE
	s.sendSummaryUpdate(job.UserID, job.EmailID, summary)

	log.Printf("[SummaryWorker] Generated summary for %s", job.EmailID)
}

// sendSummaryUpdate sends summary update to frontend via SSE
func (s *SummaryWorkerService) sendSummaryUpdate(userID, emailID, summary string) {
	if s.sseManager == nil {
		return
	}

	s.sseManager.SendToUser(userID, "summary_update", map[string]interface{}{
		"email_id": emailID,
		"summary":  summary,
	})
}

// QueueJob adds a single job to the queue (non-blocking)
func (s *SummaryWorkerService) QueueJob(job SummaryJob) bool {
	select {
	case s.jobQueue <- job:
		return true
	default:
		return false // Queue full
	}
}

// QueueEmailsForSummary queues multiple emails for summary generation
// Returns cached summaries immediately, queues the rest for background processing
func (s *SummaryWorkerService) QueueEmailsForSummary(userID string, emails []*emaildomain.Email) (map[string]string, int, error) {
	if len(emails) == 0 {
		return map[string]string{}, 0, nil
	}

	// Collect email IDs
	emailIDs := make([]string, len(emails))
	for i, email := range emails {
		emailIDs[i] = email.ID
	}

	// Get cached summaries from database
	cachedSummaries, err := s.summaryRepo.GetSummaries(userID, emailIDs)
	if err != nil {
		return nil, 0, fmt.Errorf("failed to get cached summaries: %w", err)
	}

	// Queue emails that don't have cached summaries
	queuedCount := 0
	for _, email := range emails {
		if _, hasCached := cachedSummaries[email.ID]; !hasCached {
			job := SummaryJob{
				UserID:  userID,
				EmailID: email.ID,
				Subject: email.Subject,
				Body:    email.Body,
			}
			if s.QueueJob(job) {
				queuedCount++
			}
		}
	}

	return cachedSummaries, queuedCount, nil
}

// GetCachedSummaries returns cached summaries for given email IDs
func (s *SummaryWorkerService) GetCachedSummaries(userID string, emailIDs []string) (map[string]string, error) {
	return s.summaryRepo.GetSummaries(userID, emailIDs)
}
