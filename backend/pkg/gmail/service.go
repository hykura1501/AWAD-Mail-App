package gmail

import (
	"bytes"
	"context"
	"encoding/base64"
	"errors"
	"fmt"
	"io"
	"log"
	"mime"
	"mime/multipart"
	"regexp"
	"sort"
	"strings"
	"time"

	emaildomain "ga03-backend/internal/email/domain"

	"golang.org/x/oauth2"
	"golang.org/x/oauth2/google"
	"google.golang.org/api/gmail/v1"
	"google.golang.org/api/option"
)

// TokenUpdateFunc is a callback function that handles token updates
type TokenUpdateFunc = emaildomain.TokenUpdateFunc

type Service struct {
	clientID     string
	clientSecret string
}

type notifyTokenSource struct {
	src      oauth2.TokenSource
	current  *oauth2.Token
	callback TokenUpdateFunc
}

func (s *notifyTokenSource) Token() (*oauth2.Token, error) {
	t, err := s.src.Token()
	if err != nil {
		return nil, err
	}
	if s.callback != nil && s.current.AccessToken != t.AccessToken {
		s.current = t
		// Execute callback in background to not block the request?
		// Better to block to ensure consistency, or at least log error.
		if err := s.callback(t); err != nil {
			fmt.Printf("Failed to update token: %v\n", err)
		}
	}
	return t, nil
}

func NewService(clientID, clientSecret string) *Service {
	return &Service{
		clientID:     clientID,
		clientSecret: clientSecret,
	}
}

// GetGmailService creates Gmail service with user's access token
func (s *Service) GetGmailService(ctx context.Context, accessToken, refreshToken string, onTokenRefresh TokenUpdateFunc) (*gmail.Service, error) {
	token := &oauth2.Token{
		AccessToken:  accessToken,
		RefreshToken: refreshToken,
		TokenType:    "Bearer",
	}

	// Only force refresh if we have a refresh token
	if refreshToken != "" {
		token.Expiry = time.Now()
	}

	config := &oauth2.Config{
		ClientID:     s.clientID,
		ClientSecret: s.clientSecret,
		Endpoint:     google.Endpoint,
	}

	tokenSource := config.TokenSource(ctx, token)

	// Wrap token source to detect refreshes
	wrappedSource := &notifyTokenSource{
		src:      tokenSource,
		current:  token,
		callback: onTokenRefresh,
	}

	client := oauth2.NewClient(ctx, wrappedSource)

	srv, err := gmail.NewService(ctx, option.WithHTTPClient(client))
	if err != nil {
		return nil, fmt.Errorf("unable to create Gmail service: %v", err)
	}

	return srv, nil
}

// GetMailboxes retrieves all mailboxes (labels) from Gmail
func (s *Service) GetMailboxes(ctx context.Context, accessToken, refreshToken string, onTokenRefresh TokenUpdateFunc) ([]*emaildomain.Mailbox, error) {
	srv, err := s.GetGmailService(ctx, accessToken, refreshToken, onTokenRefresh)
	if err != nil {
		return nil, err
	}

	user := "me"
	labelsResp, err := srv.Users.Labels.List(user).Do()
	if err != nil {
		return nil, fmt.Errorf("unable to retrieve labels: %v", err)
	}

	mailboxes := make([]*emaildomain.Mailbox, 0)

	// Map Gmail labels to our mailbox structure
	for _, label := range labelsResp.Labels {
		// Only include system labels and user labels
		if label.Type == "system" || label.Type == "user" {
			mailboxType := "user"
			if label.Type == "system" {
				mailboxType = strings.ToLower(label.Name)
			}

			mailbox := &emaildomain.Mailbox{
				ID:    label.Id,
				Name:  label.Name,
				Type:  mailboxType,
				Count: int(label.MessagesUnread),
			}
			mailboxes = append(mailboxes, mailbox)
		}
	}

	return mailboxes, nil
}

// GetEmails retrieves emails from a specific mailbox/label
// Uses Gmail API pagination with pageToken for efficient pagination
// MaxResults can be up to 500 per request according to Gmail API docs
func (s *Service) GetEmails(ctx context.Context, accessToken, refreshToken string, labelID string, limit, offset int, queryStr string, onTokenRefresh TokenUpdateFunc) ([]*emaildomain.Email, int, error) {
	srv, err := s.GetGmailService(ctx, accessToken, refreshToken, onTokenRefresh)
	if err != nil {
		return nil, 0, err
	}

	user := "me"

	// Build query string
	q := ""
	if labelID != "" && labelID != "ALL" {
		q += "label:" + labelID + " "
	}
	if queryStr != "" {
		q += queryStr
	}

	// Gmail API pagination: use pageToken instead of offset
	// We need to advance through pages to reach the desired offset
	pageToken := ""
	currentOffset := 0

	// Optimize offset handling: use MaxResults=500 (Gmail API max) to skip faster
	if offset > 0 {
		maxResultsPerPage := int64(500) // Gmail API maximum
		skipped := 0

		for skipped < offset {
			remaining := offset - skipped
			toFetch := int64(remaining)
			if toFetch > maxResultsPerPage {
				toFetch = maxResultsPerPage
			}

			// Fetch only message IDs (lightweight) to advance pageToken
			listQuery := srv.Users.Messages.List(user)
			if q != "" {
				listQuery = listQuery.Q(q)
			}
			listQuery = listQuery.MaxResults(toFetch)
			if pageToken != "" {
				listQuery = listQuery.PageToken(pageToken)
			}

			resp, err := listQuery.Do()
			if err != nil {
				return nil, 0, fmt.Errorf("unable to skip messages: %v", err)
			}

			// Update skipped count
			skipped += len(resp.Messages)
			pageToken = resp.NextPageToken

			// If no more pages or we've skipped enough, stop
			if pageToken == "" || skipped >= offset {
				break
			}
		}

		// If we skipped exactly the offset, we're ready
		// If we skipped more, we need to adjust (but Gmail API doesn't support going back)
		// So we just continue from current pageToken
		currentOffset = skipped
	}

	// Now fetch the actual messages we need
	// Set limit (Gmail API max is 500)
	requestLimit := int64(limit)
	if requestLimit <= 0 {
		requestLimit = 20 // Default
	}
	if requestLimit > 500 {
		requestLimit = 500 // Gmail API maximum
	}

	listQuery := srv.Users.Messages.List(user)
	if q != "" {
		listQuery = listQuery.Q(q)
	}
	listQuery = listQuery.MaxResults(requestLimit)
	if pageToken != "" {
		listQuery = listQuery.PageToken(pageToken)
	}

	messagesResp, err := listQuery.Do()
	if err != nil {
		return nil, 0, fmt.Errorf("unable to retrieve messages: %v", err)
	}

	// If we had an offset and skipped some messages, we might need to adjust
	// But since Gmail API uses pageToken, we can't go back, so we just return what we got
	emails := make([]*emaildomain.Email, 0, len(messagesResp.Messages))

	// Get full message details for each message
	// Use goroutines for parallel fetching to improve performance
	type emailResult struct {
		email *emaildomain.Email
		err   error
	}

	emailChan := make(chan emailResult, len(messagesResp.Messages))

	// Fetch emails in parallel (with reasonable concurrency limit)
	semaphore := make(chan struct{}, 10) // Max 10 concurrent requests

	for _, msg := range messagesResp.Messages {
		go func(msgID string) {
			semaphore <- struct{}{}        // Acquire
			defer func() { <-semaphore }() // Release

			fullMsg, err := srv.Users.Messages.Get(user, msgID).Format("full").Do()
			if err != nil {
				emailChan <- emailResult{nil, err}
				return
			}

			email := convertGmailMessageToEmail(fullMsg)
			emailChan <- emailResult{email, nil}
		}(msg.Id)
	}

	// Collect results
	for i := 0; i < len(messagesResp.Messages); i++ {
		result := <-emailChan
		if result.err == nil && result.email != nil {
			emails = append(emails, result.email)
		}
		// Skip emails we can't fetch (already logged in Get)
	}

	// Sort emails by ReceivedAt descending (newest first)
	// This is necessary because parallel fetching returns emails in random order
	sort.Slice(emails, func(i, j int) bool {
		return emails[i].ReceivedAt.After(emails[j].ReceivedAt)
	})

	// Return total estimate from Gmail API
	totalEstimate := int(messagesResp.ResultSizeEstimate)
	if totalEstimate == 0 && len(emails) > 0 {
		// If estimate is 0 but we have emails, use a reasonable estimate
		totalEstimate = len(emails) + currentOffset
	}

	return emails, totalEstimate, nil
}

// GetAttachment retrieves an attachment from a message
func (s *Service) GetAttachment(ctx context.Context, accessToken, refreshToken, messageID, attachmentID string, onTokenRefresh TokenUpdateFunc) (*emaildomain.Attachment, []byte, error) {
	srv, err := s.GetGmailService(ctx, accessToken, refreshToken, onTokenRefresh)
	if err != nil {
		return nil, nil, err
	}

	user := "me"

	// Fetch message to get attachment metadata
	msg, err := srv.Users.Messages.Get(user, messageID).Format("full").Do()
	if err != nil {
		return nil, nil, fmt.Errorf("unable to retrieve message details: %v", err)
	}

	// Find attachment metadata
	var filename, mimeType string
	var findMetadata func(parts []*gmail.MessagePart)
	findMetadata = func(parts []*gmail.MessagePart) {
		for _, part := range parts {
			if part.Body != nil && part.Body.AttachmentId == attachmentID {
				filename = part.Filename
				mimeType = part.MimeType
				return
			}
			if len(part.Parts) > 0 {
				findMetadata(part.Parts)
			}
		}
	}
	findMetadata(msg.Payload.Parts)

	// Fetch attachment data
	attachPart, err := srv.Users.Messages.Attachments.Get(user, messageID, attachmentID).Do()
	if err != nil {
		return nil, nil, fmt.Errorf("unable to retrieve attachment: %v", err)
	}

	data, err := base64.URLEncoding.DecodeString(attachPart.Data)
	if err != nil {
		return nil, nil, fmt.Errorf("unable to decode attachment data: %v", err)
	}

	return &emaildomain.Attachment{
		ID:       attachmentID,
		Name:     filename,
		MimeType: mimeType,
		Size:     int64(len(data)),
	}, data, nil
}

// GetEmailByID retrieves a specific email by ID
func (s *Service) GetEmailByID(ctx context.Context, accessToken, refreshToken, emailID string, onTokenRefresh TokenUpdateFunc) (*emaildomain.Email, error) {
	srv, err := s.GetGmailService(ctx, accessToken, refreshToken, onTokenRefresh)
	if err != nil {
		return nil, err
	}

	user := "me"
	msg, err := srv.Users.Messages.Get(user, emailID).Format("full").Do()
	if err != nil {
		return nil, fmt.Errorf("unable to retrieve message: %v", err)
	}

	return convertGmailMessageToEmail(msg), nil
}

// MarkAsRead marks an email as read
func (s *Service) MarkAsRead(ctx context.Context, accessToken, refreshToken, emailID string, onTokenRefresh TokenUpdateFunc) error {
	srv, err := s.GetGmailService(ctx, accessToken, refreshToken, onTokenRefresh)
	if err != nil {
		return err
	}

	user := "me"
	modifyReq := &gmail.ModifyMessageRequest{
		RemoveLabelIds: []string{"UNREAD"},
	}

	_, err = srv.Users.Messages.Modify(user, emailID, modifyReq).Do()
	if err != nil {
		return fmt.Errorf("unable to mark message as read: %v", err)
	}

	return nil
}

// MarkAsUnread marks an email as unread
func (s *Service) MarkAsUnread(ctx context.Context, accessToken, refreshToken, emailID string, onTokenRefresh TokenUpdateFunc) error {
	srv, err := s.GetGmailService(ctx, accessToken, refreshToken, onTokenRefresh)
	if err != nil {
		return err
	}

	user := "me"
	modifyReq := &gmail.ModifyMessageRequest{
		AddLabelIds: []string{"UNREAD"},
	}

	_, err = srv.Users.Messages.Modify(user, emailID, modifyReq).Do()
	if err != nil {
		return fmt.Errorf("unable to mark message as unread: %v", err)
	}

	return nil
}

// ToggleStar toggles the star status of an email
func (s *Service) ToggleStar(ctx context.Context, accessToken, refreshToken, emailID string, onTokenRefresh TokenUpdateFunc) error {
	srv, err := s.GetGmailService(ctx, accessToken, refreshToken, onTokenRefresh)
	if err != nil {
		return err
	}

	user := "me"

	// Get current message to check star status
	msg, err := srv.Users.Messages.Get(user, emailID).Format("minimal").Do()
	if err != nil {
		return fmt.Errorf("unable to get message: %v", err)
	}

	isStarred := false
	for _, labelID := range msg.LabelIds {
		if labelID == "STARRED" {
			isStarred = true
			break
		}
	}

	var modifyReq *gmail.ModifyMessageRequest
	if isStarred {
		modifyReq = &gmail.ModifyMessageRequest{
			RemoveLabelIds: []string{"STARRED"},
		}
	} else {
		modifyReq = &gmail.ModifyMessageRequest{
			AddLabelIds: []string{"STARRED"},
		}
	}

	_, err = srv.Users.Messages.Modify(user, emailID, modifyReq).Do()
	if err != nil {
		return fmt.Errorf("unable to toggle star: %v", err)
	}

	return nil
}

// SendEmail sends an email
func (s *Service) SendEmail(ctx context.Context, accessToken, refreshToken, fromName, fromEmail, to, cc, bcc, subject, body string, files []*multipart.FileHeader, onTokenRefresh TokenUpdateFunc) error {
	srv, err := s.GetGmailService(ctx, accessToken, refreshToken, onTokenRefresh)
	if err != nil {
		return err
	}

	user := "me"

	var emailMsg bytes.Buffer
	mixedBoundary := "mixed_boundary_123"
	relatedBoundary := "related_boundary_456"

	// Extract data URIs from HTML body and convert to inline attachments
	// This is the proper way to handle inline images per RFC 2387
	type inlineImageData struct {
		contentID   string
		contentType string
		data        []byte
	}
	var extractedImages []inlineImageData

	// Regex to find data URIs in img tags
	dataURIRegex := regexp.MustCompile(`<img([^>]*?)src="data:([^;]+);base64,([^"]+)"([^>]*)>`)
	imageCounter := 0

	processedBody := dataURIRegex.ReplaceAllStringFunc(body, func(match string) string {
		submatches := dataURIRegex.FindStringSubmatch(match)
		if len(submatches) < 5 {
			return match
		}

		beforeSrc := submatches[1]
		contentType := submatches[2]
		base64Data := submatches[3]
		afterSrc := submatches[4]

		// Decode base64 data
		imageData, err := base64.StdEncoding.DecodeString(base64Data)
		if err != nil {
			log.Printf("Failed to decode inline image: %v", err)
			return match
		}

		// Generate Content-ID
		imageCounter++
		contentID := fmt.Sprintf("inline_image_%d_%d", time.Now().UnixNano(), imageCounter)

		// Store the image data
		extractedImages = append(extractedImages, inlineImageData{
			contentID:   contentID,
			contentType: contentType,
			data:        imageData,
		})

		// Replace data URI with cid: reference
		return fmt.Sprintf(`<img%ssrc="cid:%s"%s>`, beforeSrc, contentID, afterSrc)
	})

	log.Printf("Gmail Service - Extracted %d inline images from data URIs", len(extractedImages))

	// Separate inline images (with Content-ID) from regular attachments
	var inlineImages []*multipart.FileHeader
	var regularAttachments []*multipart.FileHeader

	for _, file := range files {
		// Check if file has Content-ID header (inline image)
		if file.Header.Get("Content-ID") != "" {
			inlineImages = append(inlineImages, file)
		} else {
			regularAttachments = append(regularAttachments, file)
		}
	}

	log.Printf("Gmail Service - Subject: %s", subject)
	log.Printf("Gmail Service - FromName: %s", fromName)

	// RFC 2047 B-encoding for non-ASCII headers
	// Manual implementation to ensure correct encoding
	encodeHeader := func(s string) string {
		// Check if string contains non-ASCII
		needsEncoding := false
		for _, r := range s {
			if r > 127 {
				needsEncoding = true
				break
			}
		}
		if !needsEncoding {
			return s
		}
		// RFC 2047 B-encoding: =?charset?B?base64_encoded_text?=
		return "=?UTF-8?B?" + base64.StdEncoding.EncodeToString([]byte(s)) + "?="
	}

	// Headers
	if fromName != "" && fromEmail != "" {
		encodedName := encodeHeader(fromName)
		log.Printf("Gmail Service - Encoded FromName: %s", encodedName)
		emailMsg.WriteString(fmt.Sprintf("From: %s <%s>\r\n", encodedName, fromEmail))
	}
	emailMsg.WriteString(fmt.Sprintf("To: %s\r\n", to))
	if cc != "" {
		emailMsg.WriteString(fmt.Sprintf("Cc: %s\r\n", cc))
	}
	if bcc != "" {
		emailMsg.WriteString(fmt.Sprintf("Bcc: %s\r\n", bcc))
	}

	// Subject
	encodedSubject := encodeHeader(subject)
	log.Printf("Gmail Service - Encoded Subject: %s", encodedSubject)
	emailMsg.WriteString(fmt.Sprintf("Subject: %s\r\n", encodedSubject))

	emailMsg.WriteString("MIME-Version: 1.0\r\n")

	// Determine if we need multipart/related (for inline images)
	hasInlineImages := len(extractedImages) > 0 || len(inlineImages) > 0

	// Use multipart/mixed as the outer container
	emailMsg.WriteString(fmt.Sprintf("Content-Type: multipart/mixed; boundary=\"%s\"\r\n\r\n", mixedBoundary))

	// First part: HTML body (possibly with inline images using multipart/related)
	emailMsg.WriteString(fmt.Sprintf("--%s\r\n", mixedBoundary))

	if hasInlineImages {
		// Use multipart/related for HTML + inline images
		emailMsg.WriteString(fmt.Sprintf("Content-Type: multipart/related; boundary=\"%s\"\r\n\r\n", relatedBoundary))

		// HTML part - encode as base64 to handle UTF-8 properly
		emailMsg.WriteString(fmt.Sprintf("--%s\r\n", relatedBoundary))
		emailMsg.WriteString("Content-Type: text/html; charset=\"UTF-8\"\r\n")
		emailMsg.WriteString("Content-Transfer-Encoding: base64\r\n\r\n")

		// Encode processed body (with cid: references) as base64
		encodedBody := base64.StdEncoding.EncodeToString([]byte(processedBody))
		for i := 0; i < len(encodedBody); i += 76 {
			end := i + 76
			if end > len(encodedBody) {
				end = len(encodedBody)
			}
			emailMsg.WriteString(encodedBody[i:end] + "\r\n")
		}

		// Inline images with Content-ID
		for _, file := range inlineImages {
			f, err := file.Open()
			if err != nil {
				return fmt.Errorf("unable to open inline image: %v", err)
			}
			defer f.Close()

			content, err := io.ReadAll(f)
			if err != nil {
				return fmt.Errorf("unable to read inline image: %v", err)
			}

			encodedContent := base64.StdEncoding.EncodeToString(content)
			contentID := file.Header.Get("Content-ID")
			contentType := file.Header.Get("Content-Type")
			filename := file.Filename

			log.Printf("Gmail Service - Inline image filename: %s", filename)
			log.Printf("Gmail Service - Inline image contentType: %s", contentType)
			log.Printf("Gmail Service - Inline image contentID: %s", contentID)

			// Encode filename for MIME header (RFC 2047)
			encodedFilename := encodeHeader(filename)

			emailMsg.WriteString(fmt.Sprintf("--%s\r\n", relatedBoundary))
			emailMsg.WriteString(fmt.Sprintf("Content-Type: %s; name=\"%s\"\r\n", contentType, encodedFilename))
			emailMsg.WriteString("Content-Transfer-Encoding: base64\r\n")
			emailMsg.WriteString(fmt.Sprintf("Content-ID: <%s>\r\n", contentID))
			emailMsg.WriteString("Content-Disposition: inline\r\n\r\n")

			// Split base64 into lines of 76 characters
			for i := 0; i < len(encodedContent); i += 76 {
				end := i + 76
				if end > len(encodedContent) {
					end = len(encodedContent)
				}
				emailMsg.WriteString(encodedContent[i:end] + "\r\n")
			}
		}

		// Add extracted images (from data URIs in HTML)
		for _, img := range extractedImages {
			encodedContent := base64.StdEncoding.EncodeToString(img.data)

			emailMsg.WriteString(fmt.Sprintf("--%s\r\n", relatedBoundary))
			emailMsg.WriteString(fmt.Sprintf("Content-Type: %s\r\n", img.contentType))
			emailMsg.WriteString("Content-Transfer-Encoding: base64\r\n")
			emailMsg.WriteString(fmt.Sprintf("Content-ID: <%s>\r\n", img.contentID))
			emailMsg.WriteString("Content-Disposition: inline\r\n\r\n")

			// Split base64 into lines of 76 characters
			for i := 0; i < len(encodedContent); i += 76 {
				end := i + 76
				if end > len(encodedContent) {
					end = len(encodedContent)
				}
				emailMsg.WriteString(encodedContent[i:end] + "\r\n")
			}
		}

		// Close related boundary
		emailMsg.WriteString(fmt.Sprintf("--%s--\r\n", relatedBoundary))
	} else {
		// No inline images, just HTML - use base64 encoding for large bodies
		// This prevents Gmail from double-encoding UTF-8 when body contains large data URIs
		emailMsg.WriteString("Content-Type: text/html; charset=\"UTF-8\"\r\n")
		emailMsg.WriteString("Content-Transfer-Encoding: base64\r\n\r\n")

		// Encode body as base64 and split into 76-char lines
		encodedBody := base64.StdEncoding.EncodeToString([]byte(body))
		for i := 0; i < len(encodedBody); i += 76 {
			end := i + 76
			if end > len(encodedBody) {
				end = len(encodedBody)
			}
			emailMsg.WriteString(encodedBody[i:end] + "\r\n")
		}
	}

	// Regular attachments
	for _, file := range regularAttachments {
		f, err := file.Open()
		if err != nil {
			return fmt.Errorf("unable to open file: %v", err)
		}
		defer f.Close()

		content, err := io.ReadAll(f)
		if err != nil {
			return fmt.Errorf("unable to read file: %v", err)
		}

		encodedContent := base64.StdEncoding.EncodeToString(content)

		emailMsg.WriteString(fmt.Sprintf("--%s\r\n", mixedBoundary))
		emailMsg.WriteString(fmt.Sprintf("Content-Type: %s; name=\"%s\"\r\n", file.Header.Get("Content-Type"), file.Filename))
		emailMsg.WriteString("Content-Transfer-Encoding: base64\r\n")
		emailMsg.WriteString(fmt.Sprintf("Content-Disposition: attachment; filename=\"%s\"\r\n\r\n", file.Filename))

		// Split base64 into lines of 76 characters
		for i := 0; i < len(encodedContent); i += 76 {
			end := i + 76
			if end > len(encodedContent) {
				end = len(encodedContent)
			}
			emailMsg.WriteString(encodedContent[i:end] + "\r\n")
		}
	}

	emailMsg.WriteString(fmt.Sprintf("--%s--", mixedBoundary))

	// Debug: print the first 2000 bytes of the raw message to see headers
	rawBytes := emailMsg.Bytes()
	debugLen := 2000
	if len(rawBytes) < debugLen {
		debugLen = len(rawBytes)
	}
	log.Printf("Gmail Service - Raw message first %d bytes:\n%s", debugLen, string(rawBytes[:debugLen]))

	msg := &gmail.Message{
		Raw: base64.URLEncoding.EncodeToString(emailMsg.Bytes()),
	}

	_, err = srv.Users.Messages.Send(user, msg).Do()
	if err != nil {
		return fmt.Errorf("unable to send message: %v", err)
	}

	return nil
}

// TrashEmail moves an email to trash
func (s *Service) TrashEmail(ctx context.Context, accessToken, refreshToken, emailID string, onTokenRefresh TokenUpdateFunc) error {
	srv, err := s.GetGmailService(ctx, accessToken, refreshToken, onTokenRefresh)
	if err != nil {
		return err
	}

	user := "me"
	modifyReq := &gmail.ModifyMessageRequest{
		AddLabelIds: []string{"TRASH"},
	}

	_, err = srv.Users.Messages.Modify(user, emailID, modifyReq).Do()
	if err != nil {
		return fmt.Errorf("unable to trash message: %v", err)
	}

	return nil
}

// ArchiveEmail archives an email (removes INBOX label)
func (s *Service) ArchiveEmail(ctx context.Context, accessToken, refreshToken, emailID string, onTokenRefresh TokenUpdateFunc) error {
	srv, err := s.GetGmailService(ctx, accessToken, refreshToken, onTokenRefresh)
	if err != nil {
		return err
	}

	user := "me"
	modifyReq := &gmail.ModifyMessageRequest{
		RemoveLabelIds: []string{"INBOX"},
	}

	_, err = srv.Users.Messages.Modify(user, emailID, modifyReq).Do()
	if err != nil {
		return fmt.Errorf("unable to archive message: %v", err)
	}

	return nil
}

// PermanentDeleteEmail permanently deletes an email (cannot be recovered)
func (s *Service) PermanentDeleteEmail(ctx context.Context, accessToken, refreshToken, emailID string, onTokenRefresh TokenUpdateFunc) error {
	log.Printf("[PermanentDeleteEmail] Attempting to delete email: %s", emailID)
	srv, err := s.GetGmailService(ctx, accessToken, refreshToken, onTokenRefresh)
	if err != nil {
		log.Printf("[PermanentDeleteEmail] Failed to get Gmail service: %v", err)
		return err
	}

	user := "me"
	err = srv.Users.Messages.Delete(user, emailID).Do()
	if err != nil {
		log.Printf("[PermanentDeleteEmail] Failed to delete: %v", err)
		return fmt.Errorf("unable to permanently delete message: %v", err)
	}

	log.Printf("[PermanentDeleteEmail] Successfully deleted email: %s", emailID)
	return nil
}

// ModifyMessageLabels adds and/or removes labels from a message
func (s *Service) ModifyMessageLabels(ctx context.Context, accessToken, refreshToken, messageID string, addLabelIDs, removeLabelIDs []string, onTokenRefresh TokenUpdateFunc) error {
	srv, err := s.GetGmailService(ctx, accessToken, refreshToken, onTokenRefresh)
	if err != nil {
		return err
	}

	user := "me"
	modifyReq := &gmail.ModifyMessageRequest{}

	if len(addLabelIDs) > 0 {
		modifyReq.AddLabelIds = addLabelIDs
	}

	if len(removeLabelIDs) > 0 {
		modifyReq.RemoveLabelIds = removeLabelIDs
	}

	_, err = srv.Users.Messages.Modify(user, messageID, modifyReq).Do()
	if err != nil {
		return fmt.Errorf("unable to modify message labels: %v", err)
	}

	return nil
}

// Watch sets up push notifications for the user's mailbox
func (s *Service) Watch(ctx context.Context, accessToken, refreshToken string, topicName string, onTokenRefresh TokenUpdateFunc) error {
	srv, err := s.GetGmailService(ctx, accessToken, refreshToken, onTokenRefresh)
	if err != nil {
		return err
	}

	// Try to stop any existing watch first to avoid "Only one user push notification client allowed" error
	// We ignore the error here because if there's no watch, it might fail, or if it succeeds, great.
	// But strictly speaking, we just want to ensure we clear the state if possible.
	log.Printf("Stopping existing watch for user...")
	_ = srv.Users.Stop("me").Do()

	req := &gmail.WatchRequest{
		TopicName: topicName,
		LabelIds:  []string{"INBOX"},
	}

	log.Printf("Starting watch for user on topic: %s", topicName)
	resp, err := srv.Users.Watch("me", req).Do()
	if err != nil {
		log.Printf("Gmail Watch API error: %v", err)
		return fmt.Errorf("unable to watch mailbox: %v", err)
	}
	log.Printf("Watch started successfully. Expiration: %d, HistoryId: %d", resp.Expiration, resp.HistoryId)

	return nil
}

// Stop stops push notifications for the user's mailbox
func (s *Service) Stop(ctx context.Context, accessToken, refreshToken string, onTokenRefresh TokenUpdateFunc) error {
	srv, err := s.GetGmailService(ctx, accessToken, refreshToken, onTokenRefresh)
	if err != nil {
		return err
	}

	err = srv.Users.Stop("me").Do()
	if err != nil {
		return fmt.Errorf("unable to stop mailbox watch: %v", err)
	}

	return nil
}

// Helper functions

func convertGmailMessageToEmail(msg *gmail.Message) *emaildomain.Email {
	from := getHeader(msg.Payload.Headers, "From")
	fromName := from
	// Extract name from "Name <email@example.com>" format
	if idx := strings.Index(from, "<"); idx > 0 {
		fromName = strings.TrimSpace(from[:idx])
	}
	// Remove surrounding quotes from name (e.g., "John Doe" -> John Doe)
	fromName = strings.Trim(fromName, `"`)

	// Convert To header to array
	toHeader := getHeader(msg.Payload.Headers, "To")
	toArray := []string{}
	if toHeader != "" {
		toArray = []string{toHeader}
	}

	body, isHTML := getEmailBody(msg.Payload)
	preview := body

	if isHTML {
		// Remove style blocks (CSS) - MUST be done before stripping tags
		reStyle := regexp.MustCompile(`(?i)<style[^>]*>[\s\S]*?</style>`)
		preview = reStyle.ReplaceAllString(preview, " ")

		// Remove script blocks
		reScript := regexp.MustCompile(`(?i)<script[^>]*>[\s\S]*?</script>`)
		preview = reScript.ReplaceAllString(preview, " ")

		// Remove head block (contains meta, title, styles)
		reHead := regexp.MustCompile(`(?i)<head[^>]*>[\s\S]*?</head>`)
		preview = reHead.ReplaceAllString(preview, " ")

		// Strip remaining HTML tags
		re := regexp.MustCompile(`<[^>]*>`)
		preview = re.ReplaceAllString(preview, " ")

		// Unescape HTML entities (basic ones)
		preview = strings.ReplaceAll(preview, "&nbsp;", " ")
		preview = strings.ReplaceAll(preview, "&lt;", "<")
		preview = strings.ReplaceAll(preview, "&gt;", ">")
		preview = strings.ReplaceAll(preview, "&amp;", "&")
		preview = strings.ReplaceAll(preview, "&quot;", "\"")
	}

	// Collapse multiple spaces into one
	preview = strings.Join(strings.Fields(preview), " ")

	// Truncate for preview
	if len(preview) > 200 {
		preview = preview[:200] + "..."
	}

	attachments := getAttachments(msg.Payload)

	email := &emaildomain.Email{
		ID:          msg.Id,
		Subject:     getHeader(msg.Payload.Headers, "Subject"),
		From:        from,
		FromName:    fromName,
		To:          toArray,
		Preview:     preview,
		Body:        body,
		IsHTML:      isHTML,
		ReceivedAt:  time.Unix(msg.InternalDate/1000, 0),
		IsRead:      !hasLabel(msg.LabelIds, "UNREAD"),
		IsStarred:   hasLabel(msg.LabelIds, "STARRED"),
		MailboxID:   getMailboxID(msg.LabelIds),
		Attachments: attachments,
	}

	return email
}

func getHeader(headers []*gmail.MessagePartHeader, name string) string {
	for _, header := range headers {
		if header.Name == name {
			dec := new(mime.WordDecoder)
			decoded, err := dec.DecodeHeader(header.Value)
			if err != nil {
				return header.Value
			}
			return decoded
		}
	}
	return ""
}

func getEmailBody(payload *gmail.MessagePart) (string, bool) {
	// If the payload itself is the body
	if payload.Body != nil && payload.Body.Data != "" {
		data, err := base64.URLEncoding.DecodeString(payload.Body.Data)
		if err == nil {
			return string(data), payload.MimeType == "text/html"
		}
	}

	var htmlBody string
	var plainBody string

	var findBody func(parts []*gmail.MessagePart)
	findBody = func(parts []*gmail.MessagePart) {
		for _, part := range parts {
			if part.MimeType == "text/html" {
				if part.Body != nil && part.Body.Data != "" {
					data, err := base64.URLEncoding.DecodeString(part.Body.Data)
					if err == nil {
						htmlBody = string(data)
					}
				}
			} else if part.MimeType == "text/plain" {
				if part.Body != nil && part.Body.Data != "" {
					data, err := base64.URLEncoding.DecodeString(part.Body.Data)
					if err == nil {
						plainBody = string(data)
					}
				}
			}

			if len(part.Parts) > 0 {
				findBody(part.Parts)
			}
		}
	}

	findBody(payload.Parts)

	if htmlBody != "" {
		return htmlBody, true
	}
	return plainBody, false
}

func getAttachments(payload *gmail.MessagePart) []emaildomain.Attachment {
	var attachments []emaildomain.Attachment

	var findAttachments func(parts []*gmail.MessagePart)
	findAttachments = func(parts []*gmail.MessagePart) {
		for _, part := range parts {
			// Log all parts for debugging
			contentID := getHeader(part.Headers, "Content-ID")

			// Check for inline parts (may not have filename but have Content-ID)
			if contentID != "" && part.Body != nil && part.Body.AttachmentId != "" {
				contentID = strings.Trim(contentID, "<>")
				filename := part.Filename
				if filename == "" {
					// Generate filename for inline images without name
					ext := ".bin"
					if strings.HasPrefix(part.MimeType, "image/") {
						ext = "." + strings.TrimPrefix(part.MimeType, "image/")
					}
					filename = "inline" + ext
				}

				attachments = append(attachments, emaildomain.Attachment{
					ID:        part.Body.AttachmentId,
					Name:      filename,
					Size:      int64(part.Body.Size),
					MimeType:  part.MimeType,
					ContentID: contentID,
				})
			} else if part.Filename != "" && part.Body != nil && part.Body.AttachmentId != "" {
				// Regular attachment with filename
				contentID = strings.Trim(contentID, "<>")

				attachments = append(attachments, emaildomain.Attachment{
					ID:        part.Body.AttachmentId,
					Name:      part.Filename,
					Size:      int64(part.Body.Size),
					MimeType:  part.MimeType,
					ContentID: contentID,
				})
			}

			if len(part.Parts) > 0 {
				findAttachments(part.Parts)
			}
		}
	}

	findAttachments(payload.Parts)
	return attachments
}

func hasLabel(labels []string, labelID string) bool {
	for _, label := range labels {
		if label == labelID {
			return true
		}
	}
	return false
}

func getMailboxID(labels []string) string {
	// Priority order for mailbox labels
	priority := []string{"INBOX", "SENT", "DRAFT", "SPAM", "TRASH"}

	for _, p := range priority {
		if hasLabel(labels, p) {
			return p
		}
	}

	// Return first label if no priority match
	if len(labels) > 0 {
		return labels[0]
	}

	return "INBOX"
}

func getIconForLabel(name string) string {
	iconMap := map[string]string{
		"INBOX":               "inbox",
		"SENT":                "send",
		"DRAFT":               "file-text",
		"STARRED":             "star",
		"SPAM":                "alert-circle",
		"TRASH":               "trash-2",
		"IMPORTANT":           "bookmark",
		"CATEGORY_PERSONAL":   "user",
		"CATEGORY_SOCIAL":     "users",
		"CATEGORY_PROMOTIONS": "tag",
		"CATEGORY_UPDATES":    "bell",
		"CATEGORY_FORUMS":     "message-square",
	}

	upperName := strings.ToUpper(name)
	if icon, ok := iconMap[upperName]; ok {
		return icon
	}

	return "folder"
}

// ValidateToken validates the access token by making a simple API call
func (s *Service) ValidateToken(ctx context.Context, accessToken, refreshToken string, onTokenRefresh TokenUpdateFunc) error {
	srv, err := s.GetGmailService(ctx, accessToken, refreshToken, onTokenRefresh)
	if err != nil {
		return err
	}

	_, err = srv.Users.GetProfile("me").Do()
	if err != nil {
		return errors.New("invalid or expired access token")
	}

	return nil
}
