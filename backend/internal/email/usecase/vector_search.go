package usecase

import (
	"context"
	"fmt"
	emaildomain "ga03-backend/internal/email/domain"
	"ga03-backend/pkg/utils/crypto"
	"strings"
)

// VectorSearchService interface for vector search operations
type VectorSearchService interface {
	SemanticSearch(ctx context.Context, collectionName, userID, query string, limit int) ([]string, []float64, error)
	AddEmailEmbedding(ctx context.Context, collectionName, emailID, userID, subject, body string) error
	UpsertEmailEmbedding(ctx context.Context, collectionName, emailID, userID, subject, body string) error
}

// SemanticSearch performs semantic search using vector embeddings
func (u *emailUsecase) SemanticSearch(userID, query string, limit, offset int) ([]*emaildomain.Email, int, error) {
	// Validate query
	query = strings.TrimSpace(query)
	if len(query) == 0 {
		return []*emaildomain.Email{}, 0, nil
	}

	// Get user to verify existence
	user, err := u.userRepo.FindByID(userID)
	if err != nil {
		return nil, 0, err
	}
	if user == nil {
		return nil, 0, fmt.Errorf("user not found")
	}

	// Check if vector search is available
	if u.vectorSearchService == nil {
		return []*emaildomain.Email{}, 0, fmt.Errorf("vector search not available")
	}

	// Perform semantic search
	ctx := context.Background()
	emailIDs, _, err := u.vectorSearchService.SemanticSearch(
		ctx,
		"emails", // collection name
		userID,
		query,
		limit+offset+10, // Fetch more to account for filtering
	)
	if err != nil {
		return nil, 0, fmt.Errorf("semantic search failed: %w", err)
	}

	if len(emailIDs) == 0 {
		return []*emaildomain.Email{}, 0, nil
	}

	// Fetch email details for the found IDs
	var emails []*emaildomain.Email
	for i, emailID := range emailIDs {
		// Apply offset
		if i < offset {
			continue
		}

		// Stop if we have enough results
		if len(emails) >= limit {
			break
		}

		var email *emaildomain.Email
		var getEmailErr error
		if user.Provider == "imap" {
			decryptedPass, decryptErr := crypto.Decrypt(user.ImapPassword, u.config.EncryptionKey)
			if decryptErr != nil {
				continue // Skip this email if password decryption fails
			}
			var getEmailErr error
			email, getEmailErr = u.imapProvider.GetEmailByID(context.Background(), user.ImapServer, user.ImapPort, user.Email, decryptedPass, emailID)
			if getEmailErr != nil {
				continue // Skip this email if fetch fails
			}
		} else {
			accessToken, refreshToken, _ := u.getUserTokens(userID)
			if accessToken != "" && u.mailProvider != nil {
				email, getEmailErr = u.mailProvider.GetEmailByID(ctx, accessToken, refreshToken, emailID, u.makeTokenUpdateCallback(userID))
			} else {
				email, getEmailErr = u.emailRepo.GetEmailByID(emailID)
			}
		}

		if getEmailErr == nil && email != nil {
			emails = append(emails, email)
		}
	}

	return emails, len(emailIDs), nil
}

// StoreEmailEmbedding stores embedding for an email
func (u *emailUsecase) StoreEmailEmbedding(ctx context.Context, userID, emailID, subject, body string) error {
	if u.vectorSearchService == nil {
		return nil // Silently fail if vector search not available
	}

	return u.vectorSearchService.AddEmailEmbedding(ctx, "emails", emailID, userID, subject, body)
}

// UpsertEmailEmbedding upserts embedding for an email (prevents duplicates)
func (u *emailUsecase) UpsertEmailEmbedding(ctx context.Context, userID, emailID, subject, body string) error {
	if u.vectorSearchService == nil {
		return nil // Silently fail if vector search not available
	}

	return u.vectorSearchService.UpsertEmailEmbedding(ctx, "emails", emailID, userID, subject, body)
}

// GetSearchSuggestions returns suggestions based on sender names and full subjects from inbox
// This is used for auto-complete, NOT semantic search
// Returns full subject or sender name if it contains ANY word from the query
func (u *emailUsecase) GetSearchSuggestions(userID, query string, limit int) ([]string, error) {
	query = strings.TrimSpace(query)
	if len(query) < 1 {
		return []string{}, nil
	}

	if limit <= 0 {
		limit = 5
	}
	if limit > 10 {
		limit = 10 // Cap at 10 suggestions
	}

	// Get emails from inbox to extract suggestions
	// Fetch more emails to have better variety of suggestions
	emails, _, err := u.GetEmailsByMailbox(userID, "INBOX", 50, 0, "")
	if err != nil {
		return []string{}, fmt.Errorf("failed to get inbox emails: %w", err)
	}

	suggestions := make([]string, 0)
	suggestionSet := make(map[string]bool) // Track suggestions to avoid duplicates

	// Split query into words (remove empty strings from multiple spaces)
	queryWords := strings.Fields(query)
	if len(queryWords) == 0 {
		return []string{}, nil
	}

	// Convert all query words to lowercase for matching
	queryWordsLower := make([]string, len(queryWords))
	for i, word := range queryWords {
		queryWordsLower[i] = strings.ToLower(word)
	}

	// Helper function to check if text contains ANY of the query words
	containsAnyWord := func(text string, words []string) bool {
		textLower := strings.ToLower(text)
		for _, word := range words {
			if strings.Contains(textLower, word) {
				return true
			}
		}
		return false
	}

	// Extract suggestions from emails
	for _, email := range emails {
		// Check sender name - return full sender name if it contains ANY query word
		if email.FromName != "" && !suggestionSet[email.FromName] {
			if containsAnyWord(email.FromName, queryWordsLower) {
				suggestions = append(suggestions, email.FromName)
				suggestionSet[email.FromName] = true
				if len(suggestions) >= limit {
					break
				}
			}
		}

		// Check subject - return full subject if it contains ANY query word
		if email.Subject != "" && !suggestionSet[email.Subject] {
			if containsAnyWord(email.Subject, queryWordsLower) {
				suggestions = append(suggestions, email.Subject)
				suggestionSet[email.Subject] = true
				if len(suggestions) >= limit {
					break
				}
			}
		}

		if len(suggestions) >= limit {
			break
		}
	}

	return suggestions, nil
}

// syncEmailToVectorDB syncs a single email to vector database asynchronously
// This is called after fetching emails to ensure they are indexed for semantic search
// Uses job worker pattern to process sync jobs with controlled concurrency
func (u *emailUsecase) syncEmailToVectorDB(userID string, email *emaildomain.Email) {
	if email == nil || u.vectorSearchService == nil {
		return
	}

	// Skip if email doesn't have subject or body
	if email.Subject == "" && email.Body == "" {
		return
	}

	// Enqueue job (non-blocking, skip if queue is full)
	job := EmailSyncJob{
		UserID:  userID,
		EmailID: email.ID,
		Subject: email.Subject,
		Body:    email.Body,
	}

	select {
	case u.syncJobQueue <- job:
		// Job enqueued successfully
	default:
		// Queue is full, skip this sync to avoid blocking
		// Emails will be synced when user fetches them again or queue has space
		fmt.Printf("Sync job queue full, skipping email %s (will retry later)\n", email.ID)
	}
}
