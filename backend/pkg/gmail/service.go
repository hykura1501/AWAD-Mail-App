package gmail

import (
	"bytes"
	"context"
	"encoding/base64"
	"fmt"
	"io"
	"log"
	"mime/multipart"
	"strings"
	"time"
	"errors"

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
func (s *Service) GetEmails(ctx context.Context, accessToken, refreshToken string, labelID string, limit, offset int, queryStr string, onTokenRefresh TokenUpdateFunc) ([]*emaildomain.Email, int, error) {
	srv, err := s.GetGmailService(ctx, accessToken, refreshToken, onTokenRefresh)
	if err != nil {
		return nil, 0, err
	}

	user := "me"
	
	// Build query
	query := srv.Users.Messages.List(user)
	
	q := ""
	if labelID != "" && labelID != "ALL" {
		q += "label:" + labelID + " "
	}
	if queryStr != "" {
		q += queryStr
	}
	
	if q != "" {
		query = query.Q(q)
	}

	// Handle offset by advancing page token
	pageToken := ""
	if offset > 0 {
		skipped := 0
		for skipped < offset {
			toSkip := offset - skipped
			if toSkip > 500 {
				toSkip = 500
			}
			
			// Just fetch IDs to skip
			resp, err := srv.Users.Messages.List(user).Q(q).MaxResults(int64(toSkip)).PageToken(pageToken).Do()
			if err != nil {
				return nil, 0, fmt.Errorf("unable to skip messages: %v", err)
			}
			
			skipped += len(resp.Messages)
			pageToken = resp.NextPageToken
			if pageToken == "" {
				break
			}
		}
	}

	query = query.MaxResults(int64(limit))
	if pageToken != "" {
		query = query.PageToken(pageToken)
	}

	messagesResp, err := query.Do()
	if err != nil {
		return nil, 0, fmt.Errorf("unable to retrieve messages: %v", err)
	}

	emails := make([]*emaildomain.Email, 0)

	// Get full message details for each message
	for _, msg := range messagesResp.Messages {
		fullMsg, err := srv.Users.Messages.Get(user, msg.Id).Format("full").Do()
		if err != nil {
			continue // Skip messages we can't fetch
		}

		email := convertGmailMessageToEmail(fullMsg)
		emails = append(emails, email)
	}

	return emails, int(messagesResp.ResultSizeEstimate), nil
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
func (s *Service) SendEmail(ctx context.Context, accessToken, refreshToken string, to, subject, body string, files []*multipart.FileHeader, onTokenRefresh TokenUpdateFunc) error {
	srv, err := s.GetGmailService(ctx, accessToken, refreshToken, onTokenRefresh)
	if err != nil {
		return err
	}

	user := "me"
	
	var emailMsg bytes.Buffer
	boundary := "foo_bar_baz"

	// Headers
	emailMsg.WriteString(fmt.Sprintf("To: %s\r\n", to))
	emailMsg.WriteString(fmt.Sprintf("Subject: %s\r\n", subject))
	emailMsg.WriteString("MIME-Version: 1.0\r\n")
	emailMsg.WriteString(fmt.Sprintf("Content-Type: multipart/mixed; boundary=\"%s\"\r\n\r\n", boundary))

	// Body
	emailMsg.WriteString(fmt.Sprintf("--%s\r\n", boundary))
	emailMsg.WriteString("Content-Type: text/html; charset=\"UTF-8\"\r\n\r\n")
	emailMsg.WriteString(body)
	emailMsg.WriteString("\r\n")

	// Attachments
	for _, file := range files {
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

		emailMsg.WriteString(fmt.Sprintf("--%s\r\n", boundary))
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

	emailMsg.WriteString(fmt.Sprintf("--%s--", boundary))

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
	
	// Convert To header to array
	toHeader := getHeader(msg.Payload.Headers, "To")
	toArray := []string{}
	if toHeader != "" {
		toArray = []string{toHeader}
	}
	
	body, isHTML := getEmailBody(msg.Payload)
	preview := body
	// Strip HTML tags for preview if needed, but for now just truncate
	if len(preview) > 200 {
		preview = preview[:200] + "..."
	}
	
	attachments := getAttachments(msg.Payload)

	email := &emaildomain.Email{
		ID:         msg.Id,
		Subject:    getHeader(msg.Payload.Headers, "Subject"),
		From:       from,
		FromName:   fromName,
		To:         toArray,
		Preview:    preview,
		Body:       body,
		IsHTML:     isHTML,
		ReceivedAt: time.Unix(msg.InternalDate/1000, 0),
		IsRead:     !hasLabel(msg.LabelIds, "UNREAD"),
		IsStarred:  hasLabel(msg.LabelIds, "STARRED"),
		MailboxID:  getMailboxID(msg.LabelIds),
		Attachments: attachments,
	}

	return email
}

func getHeader(headers []*gmail.MessagePartHeader, name string) string {
	for _, header := range headers {
		if header.Name == name {
			return header.Value
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
			if part.Filename != "" && part.Body != nil && part.Body.AttachmentId != "" {
				attachments = append(attachments, emaildomain.Attachment{
					ID:       part.Body.AttachmentId,
					Name:     part.Filename,
					Size:     int64(part.Body.Size),
					MimeType: part.MimeType,
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
		"INBOX":     "inbox",
		"SENT":      "send",
		"DRAFT":     "file-text",
		"STARRED":   "star",
		"SPAM":      "alert-circle",
		"TRASH":     "trash-2",
		"IMPORTANT": "bookmark",
		"CATEGORY_PERSONAL": "user",
		"CATEGORY_SOCIAL":   "users",
		"CATEGORY_PROMOTIONS": "tag",
		"CATEGORY_UPDATES":  "bell",
		"CATEGORY_FORUMS":   "message-square",
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
