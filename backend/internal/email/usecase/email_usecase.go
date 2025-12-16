package usecase

import (
	"context"
	"fmt"
	authrepo "ga03-backend/internal/auth/repository"
	emaildomain "ga03-backend/internal/email/domain"
	"ga03-backend/internal/email/repository"
	"ga03-backend/pkg/config"
	"ga03-backend/pkg/fuzzy"
	"ga03-backend/pkg/imap"
	"ga03-backend/pkg/utils/crypto"
	"mime/multipart"
	"sort"
	"strings"
	"time"

	"golang.org/x/oauth2"
)

// emailUsecase implements EmailUsecase interface
type emailUsecase struct {
	emailRepo     repository.EmailRepository
	userRepo      authrepo.UserRepository
	mailProvider  emaildomain.MailProvider // Gmail Provider
	imapProvider  *imap.IMAPService        // IMAP Provider
	config        *config.Config
	topicName     string
	geminiService interface {
		SummarizeEmail(ctx context.Context, emailText string) (string, error)
	}
	kanbanStatus map[string]string // emailID -> status
}

// SetGeminiService allows wiring GeminiService after creation
func (u *emailUsecase) SetGeminiService(svc interface {
	SummarizeEmail(ctx context.Context, emailText string) (string, error)
}) {
	u.geminiService = svc
}

// NewEmailUsecase creates a new instance of emailUsecase
func NewEmailUsecase(emailRepo repository.EmailRepository, userRepo authrepo.UserRepository, mailProvider emaildomain.MailProvider, imapProvider *imap.IMAPService, cfg *config.Config, topicName string) EmailUsecase {
	// GeminiService cần được truyền vào khi khởi tạo
	uc := &emailUsecase{
		emailRepo:     emailRepo,
		userRepo:      userRepo,
		mailProvider:  mailProvider,
		imapProvider:  imapProvider,
		config:        cfg,
		topicName:     topicName,
		geminiService: nil, // cần set sau
		kanbanStatus:  make(map[string]string),
	}
	uc.startSnoozeChecker()
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

func (u *emailUsecase) checkSnoozedEmails() {
	// Get snoozed emails from repo
	emails, _, err := u.emailRepo.GetEmailsByStatus("snoozed", 1000, 0)
	if err != nil {
		return
	}

	now := time.Now()
	for _, email := range emails {
		if email.SnoozedUntil != nil && email.SnoozedUntil.Before(now) {
			// Wake up!
			u.kanbanStatus[email.ID] = "inbox"
			email.Status = "inbox"
			email.SnoozedUntil = nil
			u.emailRepo.UpdateEmail(email)
			fmt.Printf("Email %s woke up from snooze\n", email.ID)
		}
	}
}

func (u *emailUsecase) SnoozeEmail(userID, emailID string, snoozeUntil time.Time) error {
	// Update local status
	u.kanbanStatus[emailID] = "snoozed"

	// Also update the email object in repository if possible
	email, err := u.emailRepo.GetEmailByID(emailID)
	if err == nil && email != nil {
		email.Status = "snoozed"
		email.SnoozedUntil = &snoozeUntil
		u.emailRepo.UpdateEmail(email)
	}

	return nil
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
	if u.geminiService == nil {
		return "", fmt.Errorf("gemini service not configured")
	}
	prompt := "Hãy tóm tắt nội dung email sau bằng tiếng Việt, chỉ nêu ý chính, không thêm nhận xét cá nhân: " + email.Body
	return u.geminiService.SummarizeEmail(ctx, prompt)
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
	return u.mailProvider.GetEmails(ctx, accessToken, refreshToken, mailboxID, limit, offset, query, u.makeTokenUpdateCallback(userID))
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
		return u.imapProvider.GetEmailByID(context.Background(), user.ImapServer, user.ImapPort, user.Email, decryptedPass, id)
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
	return u.mailProvider.GetEmailByID(ctx, accessToken, refreshToken, id, u.makeTokenUpdateCallback(userID))
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
func (u *emailUsecase) MoveEmailToMailbox(userID, emailID, mailboxID string) error {
	accessToken, _, err := u.getUserTokens(userID)
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
	// Nếu là email thật từ Gmail, lưu trạng thái Kanban vào map
	u.kanbanStatus[emailID] = mailboxID // mailboxID ở đây là status Kanban
	return nil
}

// GetEmailsByStatus returns emails by status (for Kanban columns)
func (u *emailUsecase) GetEmailsByStatus(userID, status string, limit, offset int) ([]*emaildomain.Email, int, error) {
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

		var filtered []*emaildomain.Email
		if status == "inbox" {
			for _, email := range emails {
				s, ok := u.kanbanStatus[email.ID]
				if !ok || s == "inbox" {
					filtered = append(filtered, email)
				}
			}
		} else {
			for _, email := range emails {
				if s, ok := u.kanbanStatus[email.ID]; ok && s == status {
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
	// Chỉ lấy đúng số lượng email từ Gmail theo limit và offset truyền vào
	emails, total, err := u.mailProvider.GetEmails(ctx, accessToken, refreshToken, "INBOX", limit, offset, "", u.makeTokenUpdateCallback(userID))
	if err != nil {
		return nil, 0, err
	}
	var filtered []*emaildomain.Email
	if status == "inbox" {
		for _, email := range emails {
			s, ok := u.kanbanStatus[email.ID]
			if !ok || s == "inbox" {
				filtered = append(filtered, email)
			}
		}
	} else {
		for _, email := range emails {
			if s, ok := u.kanbanStatus[email.ID]; ok && s == status {
				filtered = append(filtered, email)
			}
		}
	}
	return filtered, total, nil
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
