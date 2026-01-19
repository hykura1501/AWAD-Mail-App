package usecase

import (
	"context"
	"fmt"
	emaildomain "ga03-backend/internal/email/domain"
	"ga03-backend/pkg/utils/crypto"
	"log"
	"regexp"
	"strings"
)

// cleanHTMLForEmbedding removes HTML tags, CSS, scripts and normalizes whitespace
// This ensures better quality embeddings for semantic search
func cleanHTMLForEmbedding(body string) string {
	if body == "" {
		return ""
	}

	cleaned := body

	// Remove style blocks (CSS)
	reStyle := regexp.MustCompile(`(?i)<style[^>]*>[\s\S]*?</style>`)
	cleaned = reStyle.ReplaceAllString(cleaned, " ")

	// Remove script blocks
	reScript := regexp.MustCompile(`(?i)<script[^>]*>[\s\S]*?</script>`)
	cleaned = reScript.ReplaceAllString(cleaned, " ")

	// Remove head block (contains meta, title, styles)
	reHead := regexp.MustCompile(`(?i)<head[^>]*>[\s\S]*?</head>`)
	cleaned = reHead.ReplaceAllString(cleaned, " ")

	// Strip remaining HTML tags
	reTag := regexp.MustCompile(`<[^>]*>`)
	cleaned = reTag.ReplaceAllString(cleaned, " ")

	// Unescape common HTML entities
	cleaned = strings.ReplaceAll(cleaned, "&nbsp;", " ")
	cleaned = strings.ReplaceAll(cleaned, "&lt;", "<")
	cleaned = strings.ReplaceAll(cleaned, "&gt;", ">")
	cleaned = strings.ReplaceAll(cleaned, "&amp;", "&")
	cleaned = strings.ReplaceAll(cleaned, "&quot;", "\"")
	cleaned = strings.ReplaceAll(cleaned, "&#39;", "'")
	cleaned = strings.ReplaceAll(cleaned, "&#x27;", "'")

	// Collapse multiple spaces into one and trim
	cleaned = strings.Join(strings.Fields(cleaned), " ")

	return cleaned
}

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

	// Generate synonyms to expand query (Conceptual Search)
	expandedQuery := query
	if u.aiService != nil {
		synonyms, err := u.aiService.GenerateSynonyms(context.Background(), query)
		if err == nil && len(synonyms) > 0 {
			// Combine original query with top 10 concepts for better context
			// e.g. "tiền" -> "tiền invoice salary payment transaction billing..."
			topSynonyms := synonyms
			if len(topSynonyms) > 10 {
				topSynonyms = topSynonyms[:10]
			}
			expandedQuery = fmt.Sprintf("%s %s", query, strings.Join(topSynonyms, " "))
			log.Printf("[SemanticSearch] Expanded query (Conceptual): '%s' -> '%s'", query, expandedQuery)
		} else {
			log.Printf("[SemanticSearch] Failed to generate synonyms or empty result: %v", err)
		}
	}

	// Perform semantic search
	ctx := context.Background()
	emailIDs, distances, err := u.vectorSearchService.SemanticSearch(
		ctx,
		"emails", // collection name
		userID,
		expandedQuery,
		300, // Fetch fixed top 300 (Chroma quota limit) to ensure stable total count
	)
	if err != nil {
		return nil, 0, fmt.Errorf("semantic search failed: %w", err)
	}

	// Filter results by distance threshold
	// Lower distance = more similar. Threshold of 1.2 filters out irrelevant results
	const distanceThreshold = 1.2
	var filteredIDs []string
	for i, id := range emailIDs {
		if i < len(distances) {
			fmt.Printf("[SemanticSearch] Email %s - distance: %.4f\n", id, distances[i])
			if distances[i] <= distanceThreshold {
				filteredIDs = append(filteredIDs, id)
			}
		} else {
			// If no distance info, include the result
			filteredIDs = append(filteredIDs, id)
		}
	}
	emailIDs = filteredIDs
	fmt.Printf("[SemanticSearch] After filtering: %d results (threshold: %.2f)\n", len(emailIDs), distanceThreshold)

	if len(emailIDs) == 0 {
		return []*emaildomain.Email{}, 0, nil
	}

	// Apply offset and limit to email IDs
	endIdx := offset + limit
	if endIdx > len(emailIDs) {
		endIdx = len(emailIDs)
	}
	if offset >= len(emailIDs) {
		return []*emaildomain.Email{}, len(emailIDs), nil
	}
	targetIDs := emailIDs[offset:endIdx]

	// Fetch email details in parallel for better performance
	type emailResult struct {
		index int
		email *emaildomain.Email
	}

	resultChan := make(chan emailResult, len(targetIDs))
	semaphore := make(chan struct{}, 10) // Max 10 concurrent requests

	// Pre-fetch tokens/password once (not in goroutines)
	var accessToken, refreshToken, decryptedPass string
	if user.Provider == "imap" {
		var decryptErr error
		decryptedPass, decryptErr = crypto.Decrypt(user.ImapPassword, u.config.EncryptionKey)
		if decryptErr != nil {
			return nil, 0, fmt.Errorf("failed to decrypt password: %w", decryptErr)
		}
	} else {
		accessToken, refreshToken, _ = u.getUserTokens(userID)
	}

	// Fetch emails in parallel
	for i, emailID := range targetIDs {
		go func(idx int, id string) {
			semaphore <- struct{}{}        // Acquire
			defer func() { <-semaphore }() // Release

			var email *emaildomain.Email
			var err error

			if user.Provider == "imap" {
				email, err = u.imapProvider.GetEmailByID(context.Background(), user.ImapServer, user.ImapPort, user.Email, decryptedPass, id)
			} else if accessToken != "" && u.mailProvider != nil {
				email, err = u.mailProvider.GetEmailByID(ctx, accessToken, refreshToken, id, u.makeTokenUpdateCallback(userID))
			} else {
				email, err = u.emailRepo.GetEmailByID(id)
			}

			if err == nil && email != nil {
				resultChan <- emailResult{index: idx, email: email}
			} else {
				resultChan <- emailResult{index: idx, email: nil}
			}
		}(i, emailID)
	}

	// Collect results
	emails := make([]*emaildomain.Email, len(targetIDs))
	for i := 0; i < len(targetIDs); i++ {
		result := <-resultChan
		emails[result.index] = result.email
	}

	// Filter out nil results and maintain order
	var finalEmails []*emaildomain.Email
	for _, email := range emails {
		if email != nil {
			finalEmails = append(finalEmails, email)
		}
	}

	return finalEmails, len(emailIDs), nil
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
// OPTIMIZED: Uses in-memory cache instead of Gmail API calls for fast response
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

	// OPTIMIZED: Use in-memory cache instead of Gmail API
	u.suggestionCacheMu.RLock()
	userCache, exists := u.suggestionCache[userID]
	u.suggestionCacheMu.RUnlock()

	if !exists || len(userCache) == 0 {
		// Cache empty - return empty suggestions
		// Cache will be populated when user loads emails
		return []string{}, nil
	}

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

	// Search through cache for matching suggestions
	suggestions := make([]string, 0, limit)
	u.suggestionCacheMu.RLock()
	for suggestion := range userCache {
		if containsAnyWord(suggestion, queryWordsLower) {
			suggestions = append(suggestions, suggestion)
			if len(suggestions) >= limit {
				break
			}
		}
	}
	u.suggestionCacheMu.RUnlock()

	return suggestions, nil
}

// SyncEmailToVectorDB syncs a single email to vector database asynchronously
// This is called after fetching emails to ensure they are indexed for semantic search
// Uses job worker pattern to process sync jobs with controlled concurrency
// ALSO populates the suggestion cache for fast auto-suggest
func (u *emailUsecase) SyncEmailToVectorDB(userID string, email *emaildomain.Email) {
	if email == nil {
		return
	}

	// Always populate suggestion cache (even if vector search is disabled)
	u.addToSuggestionCache(userID, email.FromName, email.Subject)

	if u.vectorSearchService == nil {
		return
	}

	// Skip if email doesn't have subject or body
	if email.Subject == "" && email.Body == "" {
		log.Printf("[VectorSync] Email %s has no subject or body, skipping", email.ID)
		return
	}

	// Clean HTML from body for better embedding quality
	cleanedBody := cleanHTMLForEmbedding(email.Body)

	// Enqueue job (non-blocking, skip if queue is full)
	job := EmailSyncJob{
		UserID:  userID,
		EmailID: email.ID,
		Subject: email.Subject,
		Body:    cleanedBody,
	}

	select {
	case u.syncJobQueue <- job:
		// Job enqueued successfully
	default:
		// Queue is full, skip this sync to avoid blocking
		// Emails will be synced when user fetches them again or queue has space
	}
}

// addToSuggestionCache adds FromName and Subject to the suggestion cache
// This is called when emails are fetched/synced to build up the cache
func (u *emailUsecase) addToSuggestionCache(userID, fromName, subject string) {
	u.suggestionCacheMu.Lock()
	defer u.suggestionCacheMu.Unlock()

	if u.suggestionCache[userID] == nil {
		u.suggestionCache[userID] = make(map[string]struct{})
	}

	// Add FromName if not empty and not too long
	if fromName != "" && len(fromName) <= 100 {
		u.suggestionCache[userID][fromName] = struct{}{}
	}

	// Add Subject if not empty and not too long
	if subject != "" && len(subject) <= 200 {
		u.suggestionCache[userID][subject] = struct{}{}
	}

	// Limit cache size per user to prevent memory issues
	const maxCacheSize = 1000
	if len(u.suggestionCache[userID]) > maxCacheSize {
		// Remove oldest entries (since map iteration is random, this is approximate)
		count := 0
		for key := range u.suggestionCache[userID] {
			if count >= maxCacheSize/2 {
				break
			}
			delete(u.suggestionCache[userID], key)
			count++
		}
	}
}
