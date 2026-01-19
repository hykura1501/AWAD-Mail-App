package usecase

import (
	"context"
	"fmt"
	authrepo "ga03-backend/internal/auth/repository"
	emaildomain "ga03-backend/internal/email/domain"
	"ga03-backend/internal/email/repository"
	"ga03-backend/pkg/ai"
	"ga03-backend/pkg/config"
	"ga03-backend/pkg/fuzzy"
	"ga03-backend/pkg/imap"
	"ga03-backend/pkg/utils/crypto"
	"log"
	"mime/multipart"
	"sort"
	"strings"
	"sync"
	"time"

	"golang.org/x/oauth2"
)

// EventService defines interface for sending notifications
type EventService interface {
	SendToUser(userID string, eventType string, payload interface{})
}

// emailUsecase implements EmailUsecase interface
type emailUsecase struct {
	emailRepo             repository.EmailRepository
	emailSyncHistoryRepo  repository.EmailSyncHistoryRepository
	kanbanColumnRepo      repository.KanbanColumnRepository
	emailKanbanColumnRepo repository.EmailKanbanColumnRepository
	userRepo              authrepo.UserRepository
	mailProvider          emaildomain.MailProvider // Gmail Provider
	imapProvider          *imap.IMAPService        // IMAP Provider
	config                *config.Config
	topicName             string
	aiService             ai.SummarizerService
	kanbanStatus          map[string]string // emailID -> status
	kanbanStatusMu        sync.RWMutex      // Mutex to protect kanbanStatus map
	vectorSearchService   VectorSearchService
	syncJobQueue          chan EmailSyncJob // Job queue for email sync workers
	workerWg              sync.WaitGroup    // Wait group for workers

	// Suggestion cache: stores FromName and Subject for fast auto-suggest
	// Key: userID, Value: map of unique suggestions (FromName or Subject)
	suggestionCache   map[string]map[string]struct{}
	suggestionCacheMu sync.RWMutex
	eventService      EventService // injected event service
}

// SetEventService allows wiring EventService after creation
func (u *emailUsecase) SetEventService(svc EventService) {
	u.eventService = svc
}

// EmailSyncJob represents a job to sync an email to vector DB
type EmailSyncJob struct {
	UserID  string
	EmailID string
	Subject string
	Body    string
}

// SetAIService allows wiring AI Service after creation
func (u *emailUsecase) SetAIService(svc ai.SummarizerService) {
	u.aiService = svc
}

// SetVectorSearchService allows wiring VectorSearchService after creation
func (u *emailUsecase) SetVectorSearchService(svc VectorSearchService) {
	u.vectorSearchService = svc
}

// NewEmailUsecase creates a new instance of emailUsecase
func NewEmailUsecase(emailRepo repository.EmailRepository, emailSyncHistoryRepo repository.EmailSyncHistoryRepository, kanbanColumnRepo repository.KanbanColumnRepository, emailKanbanColumnRepo repository.EmailKanbanColumnRepository, userRepo authrepo.UserRepository, mailProvider emaildomain.MailProvider, imapProvider *imap.IMAPService, cfg *config.Config, topicName string) EmailUsecase {
	// GeminiService cần được truyền vào khi khởi tạo
	uc := &emailUsecase{
		emailRepo:             emailRepo,
		emailSyncHistoryRepo:  emailSyncHistoryRepo,
		kanbanColumnRepo:      kanbanColumnRepo,
		emailKanbanColumnRepo: emailKanbanColumnRepo,
		userRepo:              userRepo,
		mailProvider:          mailProvider,
		imapProvider:          imapProvider,
		config:                cfg,
		topicName:             topicName,
		aiService:             nil, // cần set sau
		kanbanStatus:          make(map[string]string),
		syncJobQueue:          make(chan EmailSyncJob, 1000), // Buffered channel for jobs
		suggestionCache:       make(map[string]map[string]struct{}),
	}
	uc.startSnoozeChecker()
	uc.startSyncWorkers(5) // Start 5 worker goroutines
	return uc
}

func (u *emailUsecase) startSnoozeChecker() {
	ticker := time.NewTicker(1 * time.Minute)
	go func() {
		for range ticker.C {
			u.checkSnoozedEmails()
		}
	}()
}

// startSyncWorkers starts worker goroutines to process email sync jobs
func (u *emailUsecase) startSyncWorkers(workerCount int) {
	for i := 0; i < workerCount; i++ {
		u.workerWg.Add(1)
		go u.syncWorker(i)
	}
}

// syncWorker processes email sync jobs from the queue
func (u *emailUsecase) syncWorker(workerID int) {
	defer u.workerWg.Done()

	for job := range u.syncJobQueue {
		if u.vectorSearchService == nil {
			continue
		}

		// Check if email has already been synced (read-only check, doesn't insert)
		alreadySynced, err := u.emailSyncHistoryRepo.IsEmailSynced(job.UserID, job.EmailID)
		if err != nil {
			log.Printf("[VectorSync] Worker %d: Error checking sync status for %s: %v", workerID, job.EmailID, err)
			continue
		}

		if alreadySynced {
			// Email already synced, skip silently (don't log to avoid spam)
			continue
		}

		log.Printf("[VectorSync] Worker %d: Syncing email %s to vector DB", workerID, job.EmailID)

		// Email not synced yet, upsert to vector DB
		ctx, cancel := context.WithTimeout(context.Background(), 30*time.Second)
		err = u.UpsertEmailEmbedding(ctx, job.UserID, job.EmailID, job.Subject, job.Body)
		cancel()

		if err != nil {
			// Log embedding error - will retry next time email is fetched
			log.Printf("[VectorSync] Worker %d: Failed to sync email %s: %v", workerID, job.EmailID, err)
			continue // Don't mark as synced so it can retry
		}

		// Mark as synced ONLY after successful embedding
		if markErr := u.emailSyncHistoryRepo.MarkEmailAsSynced(job.UserID, job.EmailID); markErr != nil {
			log.Printf("[VectorSync] Worker %d: Failed to mark email %s as synced: %v", workerID, job.EmailID, markErr)
		} else {
			log.Printf("[VectorSync] Worker %d: Successfully synced email %s", workerID, job.EmailID)
		}
	}
}

func (u *emailUsecase) checkSnoozedEmails() {
	// Get snoozed mappings to know previous columns and userIDs and expiration
	snoozedMappings, err := u.emailKanbanColumnRepo.GetAllSnoozedMappings()
	if err != nil {
		log.Printf("Failed to get snoozed mappings: %v", err)
		return
	}

	now := time.Now()
	for _, mapping := range snoozedMappings {
		// Calculate if snooze has expired
		// Default to 1 hour from now if no time set (legacy data)
		var expired bool
		if mapping.SnoozedUntil == nil {
			// For legacy data without time, we can't check unless we fetch email
			// But for now, let's assume if it's in DB without time, it might be stuck or manual only.
			// Ideally we should fix legacy data.
			continue
		} else {
			expired = mapping.SnoozedUntil.Before(now)
		}

		if expired {
			// Wake up! Restore to previous column
			targetColumn := mapping.PreviousColumnID
			if targetColumn == "" {
				targetColumn = "inbox"
			}

			// Update in-memory status if user is active (optional, but good for consistency)
			u.kanbanStatusMu.Lock()
			u.kanbanStatus[mapping.EmailID] = targetColumn
			u.kanbanStatusMu.Unlock()

			// Update email object in local repo if it exists there
			email, _ := u.emailRepo.GetEmailByID(mapping.EmailID)
			if email != nil {
				email.Status = targetColumn
				email.SnoozedUntil = nil
				u.emailRepo.UpdateEmail(email)
			}

			// Update DB mapping to restore column
			u.emailKanbanColumnRepo.SetEmailColumn(mapping.UserID, mapping.EmailID, targetColumn)

			log.Printf("Email %s woken up from snooze, restored to %s", mapping.EmailID, targetColumn)

			// Notify user via SSE to refresh UI
			if u.eventService != nil {
				u.eventService.SendToUser(mapping.UserID, "email_update", map[string]string{
					"email_id": mapping.EmailID,
					"action":   "unsnooze",
					"column":   targetColumn,
				})
			}
		}
	}
}

func (u *emailUsecase) SnoozeEmail(userID, emailID string, snoozeUntil time.Time) error {
	// Get current column before snoozing (to restore later)
	previousColumn, _ := u.emailKanbanColumnRepo.GetEmailColumn(userID, emailID)
	if previousColumn == "" || previousColumn == "snoozed" {
		previousColumn = "inbox" // Default to inbox if no column or already snoozed
	}

	// Update local status with lock
	u.kanbanStatusMu.Lock()
	u.kanbanStatus[emailID] = "snoozed"
	u.kanbanStatusMu.Unlock()

	// Fetch the full email object (from provider or repo)
	email, err := u.GetEmailByID(userID, emailID)
	if err != nil {
		// If we can't fetch it, we still persist the mapping below so it works
		log.Printf("[SnoozeEmail] Warning: could not fetch email %s to update local object: %v", emailID, err)
	}

	if email != nil {
		email.Status = "snoozed"
		email.SnoozedUntil = &snoozeUntil
		email.UserID = userID // Critical for wake-up logic

		// Persist to local repo so the background checker can find it (for in-memory cache)
		if err := u.emailRepo.UpsertEmail(email); err != nil {
			log.Printf("[SnoozeEmail] Failed to upsert email to local repo: %v", err)
		}
	}

	// Persist email-column mapping with previous column AND expiration time for restore
	if err := u.emailKanbanColumnRepo.SnoozeEmailToColumn(userID, emailID, previousColumn, snoozeUntil); err != nil {
		log.Printf("Failed to save snooze email-column mapping: %v", err)
		return err
	}

	return nil
}

// UnsnoozeEmail manually unsnoozes an email and restores it to its previous column
func (u *emailUsecase) UnsnoozeEmail(userID, emailID string) (string, error) {
	// Get previous column from mapping
	previousColumn, err := u.emailKanbanColumnRepo.GetPreviousColumn(userID, emailID)
	if err != nil {
		log.Printf("Failed to get previous column for email %s: %v", emailID, err)
		previousColumn = "inbox" // Default fallback
	}
	if previousColumn == "" {
		previousColumn = "inbox"
	}

	// Update local status with lock
	u.kanbanStatusMu.Lock()
	u.kanbanStatus[emailID] = previousColumn
	u.kanbanStatusMu.Unlock()

	// Update email object in repository
	email, err := u.emailRepo.GetEmailByID(emailID)
	if err == nil && email != nil {
		email.Status = previousColumn
		email.SnoozedUntil = nil
		u.emailRepo.UpdateEmail(email)
	}

	// Update DB mapping to restore column
	if err := u.emailKanbanColumnRepo.SetEmailColumn(userID, emailID, previousColumn); err != nil {
		log.Printf("Failed to update email-column mapping: %v", err)
	}

	return previousColumn, nil
}

// Lấy summary email qua Gemini
func (u *emailUsecase) SummarizeEmail(ctx context.Context, emailID string) (string, error) {
	// Lấy userID từ context nếu có
	var userID string
	if v := ctx.Value("userID"); v != nil {
		if s, ok := v.(string); ok {
			userID = s
		}
	}

	user, err := u.userRepo.FindByID(userID)
	if err != nil {
		return "", err
	}
	if user == nil {
		return "", fmt.Errorf("user not found")
	}

	var email *emaildomain.Email

	if user.Provider == "imap" {
		decryptedPass, err := crypto.Decrypt(user.ImapPassword, u.config.EncryptionKey)
		if err != nil {
			return "", fmt.Errorf("failed to decrypt password: %w", err)
		}
		email, err = u.imapProvider.GetEmailByID(ctx, user.ImapServer, user.ImapPort, user.Email, decryptedPass, emailID)
		if err != nil {
			return "", fmt.Errorf("failed to get email: %w", err)
		}
	} else {
		accessToken, refreshToken, _ := u.getUserTokens(userID)
		if accessToken != "" && u.mailProvider != nil {
			// Lấy email từ Gmail API
			email, err = u.mailProvider.GetEmailByID(ctx, accessToken, refreshToken, emailID, u.makeTokenUpdateCallback(userID))
		} else {
			// Fallback mock
			email, err = u.emailRepo.GetEmailByID(emailID)
		}
	}

	if err != nil || email == nil {
		return "", fmt.Errorf("email not found")
	}
	if u.aiService == nil {
		return "", fmt.Errorf("AI service not configured")
	}
	prompt := "Hãy tóm tắt nội dung email sau bằng tiếng Việt, chỉ nêu ý chính, không thêm nhận xét cá nhân: " + email.Body
	return u.aiService.SummarizeEmail(ctx, prompt)
}

func (u *emailUsecase) getUserTokens(userID string) (string, string, error) {
	user, err := u.userRepo.FindByID(userID)
	if err != nil {
		return "", "", err
	}
	if user == nil {
		return "", "", nil
	}
	return user.AccessToken, user.RefreshToken, nil
}

func (u *emailUsecase) makeTokenUpdateCallback(userID string) emaildomain.TokenUpdateFunc {
	return func(token *oauth2.Token) error {
		user, err := u.userRepo.FindByID(userID)
		if err != nil {
			return err
		}
		if user == nil {
			return nil
		}

		user.AccessToken = token.AccessToken
		if token.RefreshToken != "" {
			user.RefreshToken = token.RefreshToken
		}
		user.TokenExpiry = token.Expiry

		return u.userRepo.Update(user)
	}
}

func (u *emailUsecase) GetAllMailboxes(userID string) ([]*emaildomain.Mailbox, error) {
	user, err := u.userRepo.FindByID(userID)
	if err != nil {
		return nil, err
	}
	if user == nil {
		return nil, fmt.Errorf("user not found")
	}

	// IMAP Handler
	if user.Provider == "imap" {
		decryptedPass, err := crypto.Decrypt(user.ImapPassword, u.config.EncryptionKey)
		if err != nil {
			return nil, fmt.Errorf("failed to decrypt password: %w", err)
		}
		return u.imapProvider.GetMailboxes(context.Background(), user.ImapServer, user.ImapPort, user.Email, decryptedPass)
	}

	// Gmail Handler
	accessToken, refreshToken, err := u.getUserTokens(userID)
	if err != nil {
		return nil, err
	}

	if accessToken == "" {
		// Fallback to local storage if no access token
		return u.emailRepo.GetAllMailboxes()
	}

	ctx := context.Background()
	return u.mailProvider.GetMailboxes(ctx, accessToken, refreshToken, u.makeTokenUpdateCallback(userID))
}

func (u *emailUsecase) GetMailboxByID(id string) (*emaildomain.Mailbox, error) {
	return u.emailRepo.GetMailboxByID(id)
}

func (u *emailUsecase) GetEmailsByMailbox(userID, mailboxID string, limit, offset int, query string) ([]*emaildomain.Email, int, error) {
	user, err := u.userRepo.FindByID(userID)
	if err != nil {
		return nil, 0, err
	}
	if user == nil {
		return nil, 0, fmt.Errorf("user not found")
	}

	// IMAP Handler
	if user.Provider == "imap" {
		decryptedPass, err := crypto.Decrypt(user.ImapPassword, u.config.EncryptionKey)
		if err != nil {
			return nil, 0, fmt.Errorf("failed to decrypt password: %w", err)
		}
		return u.imapProvider.GetEmails(context.Background(), user.ImapServer, user.ImapPort, user.Email, decryptedPass, mailboxID, limit, offset)
	}

	// Gmail Handler
	accessToken, refreshToken, err := u.getUserTokens(userID)
	if err != nil {
		return nil, 0, err
	}

	if accessToken == "" {
		// Fallback to local storage if no access token
		return u.emailRepo.GetEmailsByMailbox(mailboxID, limit, offset)
	}

	ctx := context.Background()
	emails, total, err := u.mailProvider.GetEmails(ctx, accessToken, refreshToken, mailboxID, limit, offset, query, u.makeTokenUpdateCallback(userID))
	if err == nil {
		// Sync emails to vector DB asynchronously (don't block the request)
		for _, email := range emails {
			u.SyncEmailToVectorDB(userID, email)
		}
	}
	return emails, total, err
}

func (u *emailUsecase) GetAttachment(userID, messageID, attachmentID string) (*emaildomain.Attachment, []byte, error) {
	accessToken, refreshToken, err := u.getUserTokens(userID)
	if err != nil {
		return nil, nil, err
	}

	if accessToken == "" {
		return nil, nil, nil // Not supported for local storage yet
	}

	ctx := context.Background()
	return u.mailProvider.GetAttachment(ctx, accessToken, refreshToken, messageID, attachmentID, u.makeTokenUpdateCallback(userID))
}

func (u *emailUsecase) GetEmailByID(userID, id string) (*emaildomain.Email, error) {
	user, err := u.userRepo.FindByID(userID)
	if err != nil {
		return nil, err
	}
	if user == nil {
		return nil, fmt.Errorf("user not found")
	}

	// IMAP Handler
	if user.Provider == "imap" {
		decryptedPass, err := crypto.Decrypt(user.ImapPassword, u.config.EncryptionKey)
		if err != nil {
			return nil, fmt.Errorf("failed to decrypt password: %w", err)
		}
		email, err := u.imapProvider.GetEmailByID(context.Background(), user.ImapServer, user.ImapPort, user.Email, decryptedPass, id)
		if err == nil && email != nil {
			// Sync email to vector DB asynchronously
			u.SyncEmailToVectorDB(userID, email)
		}
		return email, err
	}

	// Gmail Handler
	accessToken, refreshToken, err := u.getUserTokens(userID)
	if err != nil {
		return nil, err
	}

	if accessToken == "" {
		// Fallback to local storage if no access token
		return u.emailRepo.GetEmailByID(id)
	}

	ctx := context.Background()
	email, err := u.mailProvider.GetEmailByID(ctx, accessToken, refreshToken, id, u.makeTokenUpdateCallback(userID))
	if err == nil && email != nil {
		// Sync email to vector DB asynchronously
		u.SyncEmailToVectorDB(userID, email)
	}
	return email, err
}

func (u *emailUsecase) MarkEmailAsRead(userID, id string) error {
	user, err := u.userRepo.FindByID(userID)
	if err != nil {
		return err
	}
	if user == nil {
		return fmt.Errorf("user not found")
	}

	// IMAP Handler
	if user.Provider == "imap" {
		decryptedPass, err := crypto.Decrypt(user.ImapPassword, u.config.EncryptionKey)
		if err != nil {
			return fmt.Errorf("failed to decrypt password: %w", err)
		}
		return u.imapProvider.MarkAsRead(context.Background(), user.ImapServer, user.ImapPort, user.Email, decryptedPass, id)
	}

	accessToken, refreshToken, err := u.getUserTokens(userID)
	if err != nil {
		return err
	}

	if accessToken == "" {
		// Fallback to local storage if no access token
		email, err := u.emailRepo.GetEmailByID(id)
		if err != nil {
			return err
		}
		if email == nil {
			return nil
		}
		email.IsRead = true
		return u.emailRepo.UpdateEmail(email)
	}

	ctx := context.Background()
	return u.mailProvider.MarkAsRead(ctx, accessToken, refreshToken, id, u.makeTokenUpdateCallback(userID))
}

func (u *emailUsecase) MarkEmailAsUnread(userID, id string) error {
	user, err := u.userRepo.FindByID(userID)
	if err != nil {
		return err
	}
	if user == nil {
		return fmt.Errorf("user not found")
	}

	// IMAP Handler
	if user.Provider == "imap" {
		decryptedPass, err := crypto.Decrypt(user.ImapPassword, u.config.EncryptionKey)
		if err != nil {
			return fmt.Errorf("failed to decrypt password: %w", err)
		}
		return u.imapProvider.MarkAsUnread(context.Background(), user.ImapServer, user.ImapPort, user.Email, decryptedPass, id)
	}

	accessToken, refreshToken, err := u.getUserTokens(userID)
	if err != nil {
		return err
	}

	if accessToken == "" {
		// Fallback to local storage if no access token
		email, err := u.emailRepo.GetEmailByID(id)
		if err != nil {
			return err
		}
		if email == nil {
			return nil
		}
		email.IsRead = false
		return u.emailRepo.UpdateEmail(email)
	}

	ctx := context.Background()
	return u.mailProvider.MarkAsUnread(ctx, accessToken, refreshToken, id, u.makeTokenUpdateCallback(userID))
}

func (u *emailUsecase) ToggleStar(userID, id string) error {
	user, err := u.userRepo.FindByID(userID)
	if err != nil {
		return err
	}
	if user == nil {
		return fmt.Errorf("user not found")
	}

	// IMAP Handler
	if user.Provider == "imap" {
		decryptedPass, err := crypto.Decrypt(user.ImapPassword, u.config.EncryptionKey)
		if err != nil {
			return fmt.Errorf("failed to decrypt password: %w", err)
		}
		return u.imapProvider.ToggleStar(context.Background(), user.ImapServer, user.ImapPort, user.Email, decryptedPass, id)
	}

	accessToken, refreshToken, err := u.getUserTokens(userID)
	if err != nil {
		return err
	}

	if accessToken == "" {
		// Fallback to local storage if no access token
		email, err := u.emailRepo.GetEmailByID(id)
		if err != nil {
			return err
		}
		if email == nil {
			return nil
		}
		email.IsStarred = !email.IsStarred
		return u.emailRepo.UpdateEmail(email)
	}

	ctx := context.Background()
	return u.mailProvider.ToggleStar(ctx, accessToken, refreshToken, id, u.makeTokenUpdateCallback(userID))
}

func (u *emailUsecase) SendEmail(userID, to, cc, bcc, subject, body string, files []*multipart.FileHeader) error {
	user, err := u.userRepo.FindByID(userID)
	if err != nil {
		return err
	}
	if user == nil {
		return fmt.Errorf("user not found")
	}

	// IMAP Handler (SMTP)
	if user.Provider == "imap" {
		decryptedPass, err := crypto.Decrypt(user.ImapPassword, u.config.EncryptionKey)
		if err != nil {
			return fmt.Errorf("failed to decrypt password: %w", err)
		}
		return u.imapProvider.SendEmail(context.Background(), user.ImapServer, user.ImapPort, user.Email, decryptedPass, to, subject, body)
	}

	if user.AccessToken == "" {
		return nil // Not supported for local storage yet
	}

	ctx := context.Background()
	return u.mailProvider.SendEmail(ctx, user.AccessToken, user.RefreshToken, user.Name, user.Email, to, cc, bcc, subject, body, files, u.makeTokenUpdateCallback(userID))
}

func (u *emailUsecase) TrashEmail(userID, id string) error {
	user, err := u.userRepo.FindByID(userID)
	if err != nil {
		return err
	}
	if user == nil {
		return fmt.Errorf("user not found")
	}

	// IMAP Handler
	if user.Provider == "imap" {
		decryptedPass, err := crypto.Decrypt(user.ImapPassword, u.config.EncryptionKey)
		if err != nil {
			return fmt.Errorf("failed to decrypt password: %w", err)
		}
		return u.imapProvider.TrashEmail(context.Background(), user.ImapServer, user.ImapPort, user.Email, decryptedPass, id)
	}

	accessToken, refreshToken, err := u.getUserTokens(userID)
	if err != nil {
		return err
	}

	if accessToken == "" {
		// Fallback to local storage
		return nil
	}

	ctx := context.Background()
	return u.mailProvider.TrashEmail(ctx, accessToken, refreshToken, id, u.makeTokenUpdateCallback(userID))
}

func (u *emailUsecase) ArchiveEmail(userID, id string) error {
	user, err := u.userRepo.FindByID(userID)
	if err != nil {
		return err
	}
	if user == nil {
		return fmt.Errorf("user not found")
	}

	// IMAP Handler
	if user.Provider == "imap" {
		decryptedPass, err := crypto.Decrypt(user.ImapPassword, u.config.EncryptionKey)
		if err != nil {
			return fmt.Errorf("failed to decrypt password: %w", err)
		}
		return u.imapProvider.ArchiveEmail(context.Background(), user.ImapServer, user.ImapPort, user.Email, decryptedPass, id)
	}

	accessToken, refreshToken, err := u.getUserTokens(userID)
	if err != nil {
		return err
	}

	if accessToken == "" {
		// Fallback to local storage
		return nil
	}

	ctx := context.Background()
	return u.mailProvider.ArchiveEmail(ctx, accessToken, refreshToken, id, u.makeTokenUpdateCallback(userID))
}

// PermanentDeleteEmail permanently deletes an email (for emails in trash)
func (u *emailUsecase) PermanentDeleteEmail(userID, id string) error {
	user, err := u.userRepo.FindByID(userID)
	if err != nil {
		return err
	}
	if user == nil {
		return fmt.Errorf("user not found")
	}

	// IMAP Handler
	if user.Provider == "imap" {
		decryptedPass, err := crypto.Decrypt(user.ImapPassword, u.config.EncryptionKey)
		if err != nil {
			return fmt.Errorf("failed to decrypt password: %w", err)
		}
		return u.imapProvider.PermanentDeleteEmail(context.Background(), user.ImapServer, user.ImapPort, user.Email, decryptedPass, id)
	}

	accessToken, refreshToken, err := u.getUserTokens(userID)
	if err != nil {
		return err
	}

	if accessToken == "" {
		// Fallback to local storage - not supported for permanent delete
		return nil
	}

	ctx := context.Background()
	return u.mailProvider.PermanentDeleteEmail(ctx, accessToken, refreshToken, id, u.makeTokenUpdateCallback(userID))
}
func (u *emailUsecase) WatchMailbox(userID string) error {
	accessToken, refreshToken, err := u.getUserTokens(userID)
	if err != nil {
		return err
	}
	if accessToken == "" {
		// Fallback to local storage
		return nil
	}
	ctx := context.Background()
	return u.mailProvider.Watch(ctx, accessToken, refreshToken, u.topicName, u.makeTokenUpdateCallback(userID))
}

// Move email to another mailbox (Kanban drag & drop)
func (u *emailUsecase) MoveEmailToMailbox(userID, emailID, mailboxID, sourceColumnID string) error {
	user, err := u.userRepo.FindByID(userID)
	if err != nil {
		return err
	}
	if user == nil {
		return fmt.Errorf("user not found")
	}

	accessToken, refreshToken, err := u.getUserTokens(userID)
	if err != nil {
		return err
	}

	if accessToken == "" {
		// Fallback to local storage
		email, err := u.emailRepo.GetEmailByID(emailID)
		if err != nil {
			return err
		}
		if email == nil {
			return nil
		}
		email.MailboxID = mailboxID
		return u.emailRepo.UpdateEmail(email)
	}

	// For Gmail provider, sync labels based on Kanban column configuration
	if user.Provider == "google" && u.mailProvider != nil {
		// Get target column configuration
		targetColumn, err := u.kanbanColumnRepo.GetColumnByID(userID, mailboxID)
		if err != nil {
			return fmt.Errorf("failed to get target column config: %w", err)
		}

		// Get source column configuration
		// First try from DB mapping, then use sourceColumnID from frontend
		dbSourceColumnID, _ := u.emailKanbanColumnRepo.GetEmailColumn(userID, emailID)
		actualSourceColumnID := dbSourceColumnID
		if actualSourceColumnID == "" && sourceColumnID != "" {
			// Use the sourceColumnID passed from frontend
			actualSourceColumnID = sourceColumnID
		}

		var sourceColumn *emaildomain.KanbanColumn
		if actualSourceColumnID != "" && actualSourceColumnID != mailboxID {
			sourceColumn, _ = u.kanbanColumnRepo.GetColumnByID(userID, actualSourceColumnID)
		}

		// Prepare label IDs to add and remove
		addLabelIDs := []string{}
		removeLabelIDs := []string{}

		// Add target column's label (or INBOX if no label configured)
		if targetColumn != nil && targetColumn.GmailLabelID != "" {
			addLabelIDs = append(addLabelIDs, targetColumn.GmailLabelID)
		} else {
			// If target column has no label mapping, add INBOX to keep email visible
			addLabelIDs = append(addLabelIDs, "INBOX")
		}

		// Add target column's remove_label_ids to removeLabelIDs
		if targetColumn != nil && len(targetColumn.RemoveLabelIDs) > 0 {
			removeLabelIDs = append(removeLabelIDs, []string(targetColumn.RemoveLabelIDs)...)
		}

		// Remove source column's label (when leaving the column)
		if sourceColumn != nil && sourceColumn.GmailLabelID != "" {
			// Only remove if it's not the same as the target label
			if targetColumn == nil || sourceColumn.GmailLabelID != targetColumn.GmailLabelID {
				removeLabelIDs = append(removeLabelIDs, sourceColumn.GmailLabelID)
			}
		}

		// Apply label changes via Gmail API
		if len(addLabelIDs) > 0 || len(removeLabelIDs) > 0 {
			// Deduplicate: remove labels that appear in both add and remove lists
			addSet := make(map[string]bool)
			for _, id := range addLabelIDs {
				addSet[id] = true
			}

			// Filter out labels from removeLabelIDs that are also in addLabelIDs
			var filteredRemove []string
			for _, id := range removeLabelIDs {
				if !addSet[id] {
					filteredRemove = append(filteredRemove, id)
				}
			}
			removeLabelIDs = filteredRemove

			ctx := context.Background()
			log.Printf("[MoveEmail] Source: %s (label: %v), Target: %s (label: %v)",
				actualSourceColumnID,
				func() string {
					if sourceColumn != nil {
						return sourceColumn.GmailLabelID
					} else {
						return "nil"
					}
				}(),
				mailboxID,
				func() string {
					if targetColumn != nil {
						return targetColumn.GmailLabelID
					} else {
						return "nil"
					}
				}())
			log.Printf("[MoveEmail] Applying labels - Add: %v, Remove: %v", addLabelIDs, removeLabelIDs)

			// Only call API if there are actual changes
			if len(addLabelIDs) > 0 || len(removeLabelIDs) > 0 {
				err = u.mailProvider.ModifyMessageLabels(ctx, accessToken, refreshToken, emailID, addLabelIDs, removeLabelIDs, u.makeTokenUpdateCallback(userID))
				if err != nil {
					return fmt.Errorf("failed to modify message labels: %w", err)
				}
			}
		}
	}

	// Update local Kanban status map with lock
	u.kanbanStatusMu.Lock()
	u.kanbanStatus[emailID] = mailboxID
	u.kanbanStatusMu.Unlock()

	// Save email-column mapping to DB (for both default and custom columns)
	// This allows us to persist which emails belong to which columns
	if err := u.emailKanbanColumnRepo.SetEmailColumn(userID, emailID, mailboxID); err != nil {
		// Log error but don't fail the operation
		log.Printf("Failed to save email-column mapping: %v", err)
	}

	return nil
}

// GetEmailsByStatus returns emails by status (for Kanban columns)
func (u *emailUsecase) GetEmailsByStatus(userID, status string, limit, offset int, isKanban bool) ([]*emaildomain.Email, int, error) {
	user, err := u.userRepo.FindByID(userID)
	if err != nil {
		return nil, 0, err
	}
	if user == nil {
		return nil, 0, fmt.Errorf("user not found")
	}

	// IMAP Handler
	if user.Provider == "imap" {
		decryptedPass, err := crypto.Decrypt(user.ImapPassword, u.config.EncryptionKey)
		if err != nil {
			return nil, 0, fmt.Errorf("failed to decrypt password: %w", err)
		}

		// For IMAP, we fetch INBOX and filter by local Kanban status
		// Note: This is inefficient for large mailboxes as we fetch then filter.
		// A better approach would be to store Kanban status in DB for IMAP users too.
		emails, total, err := u.imapProvider.GetEmails(context.Background(), user.ImapServer, user.ImapPort, user.Email, decryptedPass, "INBOX", limit, offset)
		if err != nil {
			return nil, 0, err
		}

		// Sync emails to vector DB asynchronously
		for _, email := range emails {
			u.SyncEmailToVectorDB(userID, email)
		}

		var filtered []*emaildomain.Email
		if isKanban {
			// In Kanban mode, use DB mapping to guarantee uniqueness across columns.
			emailToCol, err := u.emailKanbanColumnRepo.GetEmailColumnMap(userID)
			if err != nil {
				log.Printf("[GetEmailsByStatus][IMAP] Failed to get email-column map: %v", err)
				emailToCol = map[string]string{}
			}

			for _, email := range emails {
				col := emailToCol[email.ID]
				switch status {
				case "inbox":
					// Inbox shows only unmapped emails or explicitly mapped to inbox.
					if col == "" || col == "inbox" {
						filtered = append(filtered, email)
					}
				default:
					// Other columns show only emails mapped to that column.
					if col == status {
						filtered = append(filtered, email)
					}
				}
			}
			return filtered, len(filtered), nil
		}

		// Non-Kanban fallback: use in-memory status map.
		if status == "inbox" {
			for _, email := range emails {
				u.kanbanStatusMu.RLock()
				s, ok := u.kanbanStatus[email.ID]
				u.kanbanStatusMu.RUnlock()
				if !ok || s == "inbox" {
					filtered = append(filtered, email)
				}
			}
		} else {
			for _, email := range emails {
				u.kanbanStatusMu.RLock()
				s, ok := u.kanbanStatus[email.ID]
				u.kanbanStatusMu.RUnlock()
				if ok && s == status {
					filtered = append(filtered, email)
				}
			}
		}
		return filtered, total, nil
	}

	// Gmail Handler
	accessToken, refreshToken, err := u.getUserTokens(userID)
	if err != nil {
		return nil, 0, err
	}

	if accessToken == "" {
		// Fallback to local storage if no access token
		return u.emailRepo.GetEmailsByStatus(status, limit, offset)
	}

	ctx := context.Background()

	// Check if this column has a Gmail label mapping
	column, _ := u.kanbanColumnRepo.GetColumnByID(userID, status)

	// If column has gmail_label_id, fetch emails directly from Gmail using that label
	// NOTE: In Kanban mode, we avoid label-driven columns to prevent duplicates across columns.
	if !isKanban && column != nil && column.GmailLabelID != "" {
		log.Printf("[GetEmailsByStatus] Column %s mapped to Gmail label %s - fetching from Gmail", status, column.GmailLabelID)

		// Use the Gmail label ID directly to fetch emails
		emails, total, err := u.mailProvider.GetEmails(ctx, accessToken, refreshToken, column.GmailLabelID, limit, offset, "", u.makeTokenUpdateCallback(userID))
		if err != nil {
			// If label doesn't exist or error, fallback to empty
			log.Printf("[GetEmailsByStatus] Failed to fetch from label %s: %v", column.GmailLabelID, err)
			return []*emaildomain.Email{}, 0, nil
		}

		// Sync emails to vector DB asynchronously
		for _, email := range emails {
			u.SyncEmailToVectorDB(userID, email)
		}

		// Exclude snoozed emails from this column
		snoozedEmailIDs, _ := u.emailKanbanColumnRepo.GetEmailsByColumn(userID, "snoozed")
		snoozedSet := make(map[string]bool)
		for _, id := range snoozedEmailIDs {
			snoozedSet[id] = true
		}

		var filtered []*emaildomain.Email
		for _, email := range emails {
			if !snoozedSet[email.ID] {
				filtered = append(filtered, email)
			}
		}

		return filtered, total, nil
	}

	// Special handling for "snoozed" column - fetch from DB mapping directly
	if status == "snoozed" {
		snoozedEmailIDs, err := u.emailKanbanColumnRepo.GetEmailsByColumn(userID, "snoozed")
		if err != nil {
			log.Printf("[GetEmailsByStatus] Failed to get snoozed emails from DB: %v", err)
			return []*emaildomain.Email{}, 0, nil
		}

		if len(snoozedEmailIDs) == 0 {
			return []*emaildomain.Email{}, 0, nil
		}

		// Apply pagination
		start := offset
		end := offset + limit
		if start >= len(snoozedEmailIDs) {
			return []*emaildomain.Email{}, len(snoozedEmailIDs), nil
		}
		if end > len(snoozedEmailIDs) {
			end = len(snoozedEmailIDs)
		}
		paginatedIDs := snoozedEmailIDs[start:end]

		// Fetch full email details from Gmail AND local DB to ensure SnoozedUntil is present
		var emails []*emaildomain.Email
		for _, emailID := range paginatedIDs {
			// 1. Fetch from local DB first to get SnoozedUntil
			localEmail, _ := u.emailRepo.GetEmailByID(emailID)

			// 2. Fetch from Gmail
			email, err := u.mailProvider.GetEmailByID(ctx, accessToken, refreshToken, emailID, u.makeTokenUpdateCallback(userID))
			if err != nil {
				log.Printf("[GetEmailsByStatus] Failed to fetch snoozed email %s from provider: %v", emailID, err)

				// Fallback to local email if provider fails
				if localEmail != nil {
					emails = append(emails, localEmail)
				}
				continue
			}

			if email != nil {
				// Enrich with local data if available
				if localEmail != nil {
					email.SnoozedUntil = localEmail.SnoozedUntil
					// Ensure status is consistent
					email.Status = "snoozed"
				}
				emails = append(emails, email)
			}
		}

		return emails, len(snoozedEmailIDs), nil
	}

	// Kanban mode: ensure no email appears in multiple columns.
	// - Non-inbox columns are driven purely by DB mapping (stable pagination + uniqueness).
	// - Inbox shows only emails that are not mapped to any other column (or explicitly mapped to inbox).
	if isKanban {
		if status != "inbox" {
			dbEmailIDs, err := u.emailKanbanColumnRepo.GetEmailsByColumn(userID, status)
			if err != nil {
				log.Printf("[GetEmailsByStatus] Failed to get emails for column %s: %v", status, err)
				return []*emaildomain.Email{}, 0, nil
			}

			if len(dbEmailIDs) == 0 {
				return []*emaildomain.Email{}, 0, nil
			}

			start := offset
			end := offset + limit
			if start >= len(dbEmailIDs) {
				return []*emaildomain.Email{}, len(dbEmailIDs), nil
			}
			if end > len(dbEmailIDs) {
				end = len(dbEmailIDs)
			}
			paginatedIDs := dbEmailIDs[start:end]

			var mapped []*emaildomain.Email
			for _, emailID := range paginatedIDs {
				email, err := u.mailProvider.GetEmailByID(ctx, accessToken, refreshToken, emailID, u.makeTokenUpdateCallback(userID))
				if err != nil {
					log.Printf("[GetEmailsByStatus] Failed to fetch email %s for column %s: %v", emailID, status, err)
					continue
				}
				if email != nil {
					mapped = append(mapped, email)
				}
			}
			return mapped, len(dbEmailIDs), nil
		}

		// status == "inbox"
		emailToCol, err := u.emailKanbanColumnRepo.GetEmailColumnMap(userID)
		if err != nil {
			log.Printf("[GetEmailsByStatus] Failed to get email-column map: %v", err)
			emailToCol = map[string]string{}
		}

		inboxEmails, _, err := u.mailProvider.GetEmails(ctx, accessToken, refreshToken, "INBOX", limit, offset, "", u.makeTokenUpdateCallback(userID))
		if err != nil {
			return nil, 0, err
		}

		filtered := make([]*emaildomain.Email, 0, len(inboxEmails))
		for _, email := range inboxEmails {
			col := emailToCol[email.ID]
			if col == "" || col == "inbox" {
				filtered = append(filtered, email)
			}
		}
		return filtered, len(filtered), nil
	}

	// Default behavior: Fetch from INBOX with exact limit (avoid over-fetching for performance)
	emails, _, err := u.mailProvider.GetEmails(ctx, accessToken, refreshToken, "INBOX", limit, offset, "", u.makeTokenUpdateCallback(userID))
	if err != nil {
		return nil, 0, err
	}

	// Sync emails to vector DB asynchronously
	for _, email := range emails {
		u.SyncEmailToVectorDB(userID, email)
	}

	// Check if this is a default column or custom column
	defaultColumns := map[string]bool{
		"inbox":   true,
		"todo":    true,
		"done":    true,
		"snoozed": true,
	}

	var filtered []*emaildomain.Email
	if defaultColumns[status] {
		// Default columns: use kanbanStatus map (in-memory) as fallback, but also check DB
		emailIDSet := make(map[string]bool)

		// Get email IDs from DB mapping first
		dbEmailIDs, err := u.emailKanbanColumnRepo.GetEmailsByColumn(userID, status)
		if err == nil {
			for _, id := range dbEmailIDs {
				emailIDSet[id] = true
			}
		}

		// Get snoozed email IDs to exclude them from other columns
		snoozedEmailIDs := make(map[string]bool)
		if status != "snoozed" {
			snoozedIDs, err := u.emailKanbanColumnRepo.GetEmailsByColumn(userID, "snoozed")
			if err == nil {
				for _, id := range snoozedIDs {
					snoozedEmailIDs[id] = true
				}
			}
		}

		// Filter emails
		if status == "inbox" {
			// For inbox: include emails that are in inbox (no mapping) or explicitly mapped to inbox
			// Exclude snoozed emails
			for _, email := range emails {
				// Skip if email is snoozed
				if snoozedEmailIDs[email.ID] {
					continue
				}
				// Check DB mapping first
				if emailIDSet[email.ID] {
					filtered = append(filtered, email)
					continue
				}
				// Fallback to in-memory status
				u.kanbanStatusMu.RLock()
				s, ok := u.kanbanStatus[email.ID]
				u.kanbanStatusMu.RUnlock()
				if !ok || s == "inbox" {
					filtered = append(filtered, email)
				}
			}
		} else {
			// For other default columns: only include if mapped
			// Exclude snoozed emails
			for _, email := range emails {
				// Skip if email is snoozed
				if snoozedEmailIDs[email.ID] {
					continue
				}
				// Check DB mapping first
				if emailIDSet[email.ID] {
					filtered = append(filtered, email)
					continue
				}
				// Fallback to in-memory status
				u.kanbanStatusMu.RLock()
				s, ok := u.kanbanStatus[email.ID]
				u.kanbanStatusMu.RUnlock()
				if ok && s == status {
					filtered = append(filtered, email)
				}
			}
		}
	} else {
		// Custom column without gmail_label_id: fetch emails directly using DB mapping
		// Similar to how "snoozed" column works
		dbEmailIDs, err := u.emailKanbanColumnRepo.GetEmailsByColumn(userID, status)
		if err != nil {
			log.Printf("[GetEmailsByStatus] Failed to get emails for custom column %s: %v", status, err)
			return []*emaildomain.Email{}, 0, nil
		}

		if len(dbEmailIDs) == 0 {
			return []*emaildomain.Email{}, 0, nil
		}

		// Apply pagination
		start := offset
		end := offset + limit
		if start >= len(dbEmailIDs) {
			return []*emaildomain.Email{}, len(dbEmailIDs), nil
		}
		if end > len(dbEmailIDs) {
			end = len(dbEmailIDs)
		}
		paginatedIDs := dbEmailIDs[start:end]

		// Fetch full email details from Gmail
		for _, emailID := range paginatedIDs {
			email, err := u.mailProvider.GetEmailByID(ctx, accessToken, refreshToken, emailID, u.makeTokenUpdateCallback(userID))
			if err != nil {
				log.Printf("[GetEmailsByStatus] Failed to fetch email %s for column %s: %v", emailID, status, err)
				continue
			}
			if email != nil {
				filtered = append(filtered, email)
			}
		}

		return filtered, len(dbEmailIDs), nil
	}
	return filtered, len(filtered), nil
}

// FuzzySearch performs fuzzy search over emails
// It searches subject, from, from_name fields with typo tolerance and partial matching
// Results are ranked by relevance score (best matches first)
// Optimized: Progressive fetching - fetch small batches and only fetch more if needed
func (u *emailUsecase) FuzzySearch(userID, query string, limit, offset int) ([]*emaildomain.Email, int, error) {
	// Validate and normalize query
	query = strings.TrimSpace(query)
	if len(query) == 0 {
		return []*emaildomain.Email{}, 0, nil
	}
	if len(query) < 1 {
		return []*emaildomain.Email{}, 0, fmt.Errorf("query too short")
	}

	user, err := u.userRepo.FindByID(userID)
	if err != nil {
		return nil, 0, err
	}
	if user == nil {
		return nil, 0, fmt.Errorf("user not found")
	}

	// Build Gmail search query for pre-filtering (only for Gmail provider)
	var gmailSearchQuery string
	if user.Provider != "imap" {
		gmailSearchQuery = fuzzy.BuildGmailSearchQuery(query)
	}

	// Progressive fetching: start with small batch, fetch more if needed
	// Initial batch size - small enough to be fast, large enough to find matches
	initialBatchSize := 50
	if limit > 0 {
		// Fetch at least 2x the limit initially
		initialBatchSize = limit * 2
		if initialBatchSize < 30 {
			initialBatchSize = 30
		}
		if initialBatchSize > 100 {
			initialBatchSize = 100 // Start with reasonable size
		}
	}

	// Additional batch size when we need more results
	additionalBatchSize := 50
	maxBatches := 10      // Safety limit to prevent infinite loops
	maxTotalEmails := 500 // Maximum total emails to process

	type scoredEmail struct {
		email *emaildomain.Email
		score float64
	}

	matchedEmails := make([]scoredEmail, 0, limit*2)
	currentOffset := 0
	batchCount := 0
	totalProcessed := 0

	// Track if we should continue fetching
	shouldContinue := true
	targetHighQualityResults := limit
	if targetHighQualityResults <= 0 {
		targetHighQualityResults = 20 // Default target
	}

	for shouldContinue && batchCount < maxBatches && totalProcessed < maxTotalEmails {
		batchCount++
		batchSize := initialBatchSize
		if batchCount > 1 {
			batchSize = additionalBatchSize
		}

		var batchEmails []*emaildomain.Email
		var accessToken string

		// Fetch batch of emails
		if user.Provider == "imap" {
			decryptedPass, err := crypto.Decrypt(user.ImapPassword, u.config.EncryptionKey)
			if err != nil {
				return nil, 0, fmt.Errorf("failed to decrypt password: %w", err)
			}
			batchEmails, _, err = u.imapProvider.GetEmails(context.Background(), user.ImapServer, user.ImapPort, user.Email, decryptedPass, "INBOX", batchSize, currentOffset)
			if err != nil {
				return nil, 0, err
			}
		} else {
			var refreshToken string
			accessToken, refreshToken, err = u.getUserTokens(userID)
			if err != nil {
				return nil, 0, err
			}

			if accessToken == "" {
				// Fallback to local storage
				batchEmails, _, err = u.emailRepo.GetEmailsByMailbox("INBOX", batchSize, currentOffset)
				if err != nil {
					return nil, 0, err
				}
			} else {
				// Use Gmail search query for pre-filtering
				ctx := context.Background()
				batchEmails, _, err = u.mailProvider.GetEmails(ctx, accessToken, refreshToken, "INBOX", batchSize, currentOffset, gmailSearchQuery, u.makeTokenUpdateCallback(userID))
				if err != nil {
					return nil, 0, err
				}
			}
		}

		// If no more emails, stop fetching
		if len(batchEmails) == 0 {
			break
		}

		totalProcessed += len(batchEmails)

		// Pre-filter with quick contains check (for local storage and IMAP)
		var preFilteredEmails []*emaildomain.Email
		if user.Provider == "imap" || (user.Provider != "imap" && accessToken == "") {
			preFilteredEmails = make([]*emaildomain.Email, 0, len(batchEmails)/2)
			for _, email := range batchEmails {
				if fuzzy.QuickFilter(query, email.Subject, email.From, email.FromName) {
					preFilteredEmails = append(preFilteredEmails, email)
				}
			}
			batchEmails = preFilteredEmails
		}

		// Process batch: fuzzy match and score
		for _, email := range batchEmails {
			if fuzzy.FuzzyMatchEmail(query, email.Subject, email.From, email.FromName, email.Preview) {
				score := fuzzy.CalculateRelevanceScore(query, email.Subject, email.From, email.FromName)

				if score > 0 {
					matchedEmails = append(matchedEmails, scoredEmail{
						email: email,
						score: score,
					})
				}
			}
		}

		// Check if we have enough high-quality results
		highQualityCount := 0
		for _, m := range matchedEmails {
			if m.score > 50 {
				highQualityCount++
			}
		}

		// Decision: continue fetching?
		// 1. If we have enough high-quality results, we can stop
		// 2. If we have enough total results (limit * 2), we can stop
		// 3. If batch was smaller than requested, no more emails available
		if highQualityCount >= targetHighQualityResults && limit > 0 {
			shouldContinue = false
		} else if len(matchedEmails) >= limit*2 && limit > 0 {
			shouldContinue = false
		} else if len(batchEmails) < batchSize {
			// Last batch was smaller, no more emails
			shouldContinue = false
		}

		// Update offset for next batch
		currentOffset += len(batchEmails)
	}

	// Early return if no matches
	if len(matchedEmails) == 0 {
		return []*emaildomain.Email{}, 0, nil
	}

	// Sort by relevance score (highest first), then by date (newest first) for tie-breaking
	sort.Slice(matchedEmails, func(i, j int) bool {
		if matchedEmails[i].score != matchedEmails[j].score {
			return matchedEmails[i].score > matchedEmails[j].score
		}
		// If scores are equal, prefer newer emails
		return matchedEmails[i].email.ReceivedAt.After(matchedEmails[j].email.ReceivedAt)
	})

	total := len(matchedEmails)

	// Apply pagination
	if offset < 0 {
		offset = 0
	}
	if offset >= total {
		return []*emaildomain.Email{}, total, nil
	}

	end := offset + limit
	if end > total {
		end = total
	}
	if limit <= 0 {
		end = total // Return all if limit is 0 or negative
	}

	result := make([]*emaildomain.Email, 0, end-offset)
	for i := offset; i < end; i++ {
		result = append(result, matchedEmails[i].email)
	}

	return result, total, nil
}

// SyncAllEmailsForUser syncs all emails for a user to vector DB (async, non-blocking)
// This is typically called after login/registration to index all existing emails
func (u *emailUsecase) SyncAllEmailsForUser(userID string) {
	if u.vectorSearchService == nil {
		log.Printf("Vector search service not available, skipping email sync for user %s", userID)
		return
	}

	// Run in background goroutine to not block the caller
	go func() {
		// Wait a bit to ensure token is saved to DB after login
		time.Sleep(2 * time.Second)

		log.Printf("Starting full email sync for user %s", userID)

		// Check user and provider first
		user, err := u.userRepo.FindByID(userID)
		if err != nil {
			log.Printf("Failed to get user %s: %v", userID, err)
			return
		}
		if user == nil {
			log.Printf("User %s not found", userID)
			return
		}

		// Check if emails have already been synced
		if user.EmailsSynced {
			log.Printf("Emails already synced for user %s, skipping", userID)
			return
		}

		// Only sync for Google and IMAP providers (skip email provider as it has no external email access)
		if user.Provider != "google" && user.Provider != "imap" {
			log.Printf("Skipping email sync for user %s: provider %s doesn't have email access", userID, user.Provider)
			return
		}

		// For Google provider, check if access token exists
		if user.Provider == "google" {
			if user.AccessToken == "" {
				log.Printf("Skipping email sync for user %s: no access token available", userID)
				return
			}
		}

		// Get all mailboxes for the user
		mailboxes, err := u.GetAllMailboxes(userID)
		if err != nil {
			// Check if error is about insufficient scopes
			errStr := err.Error()
			if strings.Contains(errStr, "insufficient authentication scopes") ||
				strings.Contains(errStr, "ACCESS_TOKEN_SCOPE_INSUFFICIENT") ||
				strings.Contains(errStr, "Insufficient Permission") {
				log.Printf("Skipping email sync for user %s: access token doesn't have Gmail scopes. User may need to re-authorize with Gmail permissions.", userID)
				return
			}
			log.Printf("Failed to get mailboxes for user %s: %v", userID, err)
			return
		}

		if len(mailboxes) == 0 {
			log.Printf("No mailboxes found for user %s", userID)
			return
		}

		// Common mailboxes to sync (prioritize these)
		priorityMailboxes := []string{"INBOX", "SENT", "DRAFT"}
		syncedMailboxes := make(map[string]bool)

		// First, sync priority mailboxes
		for _, mailboxID := range priorityMailboxes {
			for _, mb := range mailboxes {
				if mb.ID == mailboxID {
					u.syncMailboxEmails(userID, mailboxID)
					syncedMailboxes[mailboxID] = true
					break
				}
			}
		}

		// Then sync other mailboxes
		for _, mb := range mailboxes {
			if !syncedMailboxes[mb.ID] {
				u.syncMailboxEmails(userID, mb.ID)
			}
		}

		// Mark user as synced after successful completion
		user.EmailsSynced = true
		if updateErr := u.userRepo.Update(user); updateErr != nil {
			log.Printf("Failed to mark user %s as synced: %v", userID, updateErr)
		} else {
			log.Printf("Marked user %s as emails synced", userID)
		}

		log.Printf("Completed full email sync for user %s", userID)
	}()
}

// syncMailboxEmails syncs all emails from a specific mailbox
func (u *emailUsecase) syncMailboxEmails(userID, mailboxID string) {
	const batchSize = 100 // Fetch 100 emails at a time
	offset := 0

	for {
		// Fetch batch of emails
		emails, total, err := u.GetEmailsByMailbox(userID, mailboxID, batchSize, offset, "")
		if err != nil {
			// Check if error is about insufficient scopes
			errStr := err.Error()
			if strings.Contains(errStr, "insufficient authentication scopes") ||
				strings.Contains(errStr, "ACCESS_TOKEN_SCOPE_INSUFFICIENT") ||
				strings.Contains(errStr, "Insufficient Permission") {
				log.Printf("Stopping email sync for mailbox %s (user %s): access token doesn't have Gmail scopes", mailboxID, userID)
				break
			}
			log.Printf("Failed to fetch emails from mailbox %s for user %s (offset %d): %v", mailboxID, userID, offset, err)
			break
		}

		if len(emails) == 0 {
			// No more emails
			break
		}

		// Sync each email to vector DB
		// Note: GetEmailsByMailbox already calls syncEmailToVectorDB, but we want to ensure
		// all emails are synced even if they were fetched before
		for _, email := range emails {
			u.SyncEmailToVectorDB(userID, email)
		}

		log.Printf("Synced %d emails from mailbox %s for user %s (offset %d/%d)", len(emails), mailboxID, userID, offset, total)

		offset += len(emails)

		// Stop if we've fetched all emails
		if offset >= total || len(emails) < batchSize {
			break
		}
	}
}

// GetKanbanColumns gets all Kanban columns for a user
func (u *emailUsecase) GetKanbanColumns(userID string) ([]*emaildomain.KanbanColumn, error) {
	columns, err := u.kanbanColumnRepo.GetColumnsByUserID(userID)
	if err != nil {
		return nil, err
	}

	// Deduplicate columns by ColumnID
	// Keep the most recently updated one
	uniqueColumns := make(map[string]*emaildomain.KanbanColumn)
	duplicatesToDelete := []string{}

	for _, col := range columns {
		if existing, found := uniqueColumns[col.ColumnID]; found {
			// Keep the one updated most recently
			if col.UpdatedAt.After(existing.UpdatedAt) {
				duplicatesToDelete = append(duplicatesToDelete, existing.ID)
				uniqueColumns[col.ColumnID] = col
			} else {
				duplicatesToDelete = append(duplicatesToDelete, col.ID)
			}
		} else {
			uniqueColumns[col.ColumnID] = col
		}
	}

	// Clean up duplicates async
	if len(duplicatesToDelete) > 0 {
		go func() {
			for _, id := range duplicatesToDelete {
				if err := u.kanbanColumnRepo.DeleteColumnByPK(id); err != nil {
					log.Printf("Failed to delete duplicate column %s: %v", id, err)
				}
			}
		}()
	}

	// Rebuild columns list ensuring we keep the unique ones
	// Be careful to preserve order from DB if possible, or use the map
	var validColumns []*emaildomain.KanbanColumn
	// We iterate original list to preserve relative order of the "kept" items
	seenIDs := make(map[string]bool)
	for _, col := range columns {
		if unique, ok := uniqueColumns[col.ColumnID]; ok && unique.ID == col.ID {
			if !seenIDs[col.ColumnID] {
				validColumns = append(validColumns, col)
				seenIDs[col.ColumnID] = true
			}
		}
	}
	columns = validColumns

	// Default columns that should always exist
	defaults := []*emaildomain.KanbanColumn{
		{
			ColumnID:       "inbox",
			Name:           "Inbox",
			Order:          0,
			GmailLabelID:   "INBOX",
			RemoveLabelIDs: []string{"INBOX"},
			UserID:         userID,
		},
		{
			ColumnID:       "todo",
			Name:           "To Do",
			Order:          1,
			GmailLabelID:   "IMPORTANT",
			RemoveLabelIDs: []string{"IMPORTANT"},
			UserID:         userID,
		},
		{
			ColumnID:       "done",
			Name:           "Done",
			Order:          2,
			GmailLabelID:   "STARRED",
			RemoveLabelIDs: []string{"STARRED"},
			UserID:         userID,
		},
		{
			ColumnID: "snoozed",
			Name:     "Snoozed",
			Order:    3,
			UserID:   userID,
		},
	}

	// Check which default columns are missing and create them
	existingColumnIDs := make(map[string]bool)
	for _, col := range columns {
		existingColumnIDs[col.ColumnID] = true
	}

	for _, defaultCol := range defaults {
		if !existingColumnIDs[defaultCol.ColumnID] {
			// Double check against DB to avoid race condition
			existing, _ := u.kanbanColumnRepo.GetColumnByID(userID, defaultCol.ColumnID)
			if existing != nil {
				columns = append(columns, existing)
				continue
			}

			if err := u.CreateKanbanColumn(userID, defaultCol); err != nil {
				log.Printf("Failed to create default column %s: %v", defaultCol.ColumnID, err)
			} else {
				// Append to result so we return the newly created columns immediately
				columns = append(columns, defaultCol)
			}
		}
	}

	return columns, nil
}

// CreateKanbanColumn creates a new Kanban column
func (u *emailUsecase) CreateKanbanColumn(userID string, column *emaildomain.KanbanColumn) error {
	column.UserID = userID
	return u.kanbanColumnRepo.CreateColumn(column)
}

// UpdateKanbanColumn updates a Kanban column
func (u *emailUsecase) UpdateKanbanColumn(userID string, column *emaildomain.KanbanColumn) error {
	// Fetch existing column to get the primary key ID
	existing, err := u.kanbanColumnRepo.GetColumnByID(userID, column.ColumnID)
	if err != nil {
		return fmt.Errorf("failed to find column: %w", err)
	}
	if existing == nil {
		return fmt.Errorf("column not found: %s", column.ColumnID)
	}

	// Preserve the primary key ID and merge updates
	existing.Name = column.Name
	existing.GmailLabelID = column.GmailLabelID
	existing.RemoveLabelIDs = column.RemoveLabelIDs
	if column.Order > 0 {
		existing.Order = column.Order
	}

	return u.kanbanColumnRepo.UpdateColumn(existing)
}

// DeleteKanbanColumn deletes a Kanban column
func (u *emailUsecase) DeleteKanbanColumn(userID, columnID string) error {
	return u.kanbanColumnRepo.DeleteColumn(userID, columnID)
}

// UpdateKanbanColumnOrders updates the order of multiple Kanban columns
func (u *emailUsecase) UpdateKanbanColumnOrders(userID string, orders map[string]int) error {
	return u.kanbanColumnRepo.UpdateColumnOrders(userID, orders)
}
