package notification

import (
	"context"
	"encoding/json"
	"fmt"
	"log"
	"time"

	authrepo "ga03-backend/internal/auth/repository"
	"ga03-backend/pkg/fcm"
	"ga03-backend/pkg/gmail"
	"ga03-backend/pkg/sse"

	"ga03-backend/internal/email/usecase"


	"cloud.google.com/go/pubsub"
	"golang.org/x/oauth2"
	"google.golang.org/api/option"
)

type GmailNotification struct {
	EmailAddress string `json:"emailAddress"`
	HistoryID    uint64 `json:"historyId"`
}

type Service struct {
	pubsubClient *pubsub.Client
	sseManager   *sse.Manager
	userRepo     authrepo.UserRepository
	fcmRepo      authrepo.FCMTokenRepository
	fcmClient    *fcm.Client
	gmailService *gmail.Service
	emailUsecase usecase.EmailUsecase
	projectID    string
	topicName    string
	subName      string
	// Deduplication: track last historyId per user to avoid duplicate notifications
	lastHistoryID map[string]uint64
}

func NewService(projectID, topicName string, sseManager *sse.Manager, userRepo authrepo.UserRepository, fcmRepo authrepo.FCMTokenRepository, fcmClient *fcm.Client, gmailService *gmail.Service, emailUsecase usecase.EmailUsecase, credentialsFile string) (*Service, error) {
	ctx := context.Background()
	
	var opts []option.ClientOption
	if credentialsFile != "" {
		opts = append(opts, option.WithCredentialsFile(credentialsFile))
	}

	client, err := pubsub.NewClient(ctx, projectID, opts...)
	if err != nil {
		return nil, fmt.Errorf("failed to create pubsub client: %v", err)
	}

	return &Service{
		pubsubClient:  client,
		sseManager:    sseManager,
		userRepo:      userRepo,
		fcmRepo:       fcmRepo,
		fcmClient:     fcmClient,
		gmailService:  gmailService,
		emailUsecase:  emailUsecase,
		projectID:     projectID,
		topicName:     topicName,
		subName:       topicName + "-sub", // Convention: topic-sub
		lastHistoryID: make(map[string]uint64),
	}, nil
}

func (s *Service) Start(ctx context.Context) {
	log.Printf("[PubSub] Starting notification service with topic: %s, subscription: %s", s.topicName, s.subName)
	
	// Ensure subscription exists
	sub := s.pubsubClient.Subscription(s.subName)
	exists, err := sub.Exists(ctx)
	if err != nil {
		log.Printf("[PubSub] Error checking subscription existence: %v", err)
		return
	}

	log.Printf("[PubSub] Subscription %s exists: %v", s.subName, exists)

	if !exists {
		topic := s.pubsubClient.Topic(s.topicName)
		topicExists, err := topic.Exists(ctx)
		if err != nil {
			log.Printf("[PubSub] Error checking topic existence: %v", err)
			return
		}
		log.Printf("[PubSub] Topic %s exists: %v", s.topicName, topicExists)
		
		if !topicExists {
			log.Printf("[PubSub] Topic does not exist, cannot create subscription")
			return
		}
		
		sub, err = s.pubsubClient.CreateSubscription(ctx, s.subName, pubsub.SubscriptionConfig{
			Topic:       topic,
			AckDeadline: 10 * time.Second,
		})
		if err != nil {
			log.Printf("[PubSub] Failed to create subscription: %v", err)
			return
		}
		log.Printf("[PubSub] Created subscription: %s", s.subName)
	}

	log.Printf("[PubSub] Listening for messages on subscription: %s", s.subName)
	err = sub.Receive(ctx, func(ctx context.Context, msg *pubsub.Message) {
		log.Printf("[PubSub] Received message: %s", string(msg.Data))
		s.handleMessage(ctx, msg)
		msg.Ack()
	})
	if err != nil {
		log.Printf("[PubSub] Error receiving messages: %v", err)
	}
}

func (s *Service) handleMessage(ctx context.Context, msg *pubsub.Message) {
	var notification GmailNotification
	if err := json.Unmarshal(msg.Data, &notification); err != nil {
		log.Printf("Failed to unmarshal notification: %v", err)
		return
	}

	log.Printf("[PubSub] Received notification for: %s (historyId: %d)", notification.EmailAddress, notification.HistoryID)

	// Find user by email
	user, err := s.userRepo.FindByEmail(notification.EmailAddress)
	if err != nil {
		log.Printf("Error finding user by email %s: %v", notification.EmailAddress, err)
		return
	}
	if user == nil {
		log.Printf("User not found for email: %s", notification.EmailAddress)
		return
	}

	// Deduplication: Skip if we already processed this historyId for this user
	lastHID, exists := s.lastHistoryID[user.ID]
	if exists && notification.HistoryID <= lastHID {
		log.Printf("[PubSub] Skipping duplicate notification for user %s (historyId %d <= last %d)", user.ID, notification.HistoryID, lastHID)
		return
	}
	s.lastHistoryID[user.ID] = notification.HistoryID

	// Notify user via SSE
	s.sseManager.SendToUser(user.ID, "email_update", map[string]interface{}{
		"email":     notification.EmailAddress,
		"historyId": notification.HistoryID,
		"timestamp": time.Now(),
	})

	// Notify user via FCM (Push Notification)
	if s.fcmClient != nil && s.fcmRepo != nil {
		go func() {
			log.Printf("[FCM] Attempting to send push notification to user: %s", user.ID)
			
			tokens, err := s.fcmRepo.GetTokensByUserID(user.ID)
			if err != nil {
				log.Printf("[FCM] Error getting FCM tokens for user %s: %v", user.ID, err)
				return
			}
			
			log.Printf("[FCM] Found %d tokens for user %s", len(tokens), user.ID)
			
			if len(tokens) > 0 {
				var tokenStrings []string
				for _, t := range tokens {
					tokenStrings = append(tokenStrings, t.Token)
				}
				
				// Try to get latest email details for better notification
				title := "Email mới"
				body := "Bạn có email mới trong hộp thư đến"
				messageID := ""
				
				// Fetch latest email from inbox to get subject and sender
				if s.gmailService != nil && user.AccessToken != "" {
					// Token refresh callback
					onTokenRefresh := func(newToken *oauth2.Token) error {
						user.AccessToken = newToken.AccessToken
						user.RefreshToken = newToken.RefreshToken
						return s.userRepo.Update(user)
					}
					
					emails, _, err := s.gmailService.GetEmails(
						context.Background(),
						user.AccessToken,
						user.RefreshToken,
						"INBOX",
						1, // Only need latest email
						0,
						"", // No additional query
						onTokenRefresh,
					)
					
					if err == nil && len(emails) > 0 {
						latestEmail := emails[0]
						messageID = latestEmail.ID
						// Use sender name and subject for notification
						senderName := latestEmail.FromName
						if senderName == "" {
							senderName = latestEmail.From
						}
						// Truncate subject if too long
						subject := latestEmail.Subject
						if len(subject) > 100 {
							subject = subject[:97] + "..."
						}
						
						title = fmt.Sprintf("Email từ %s", senderName)
						body = subject
						if body == "" {
							body = "(Không có tiêu đề)"
						}
						log.Printf("[FCM] Got email details - From: %s, Subject: %s, ID: %s", senderName, subject, messageID)

						// SYNC TO CHROME DB: Ensure this new email is indexed for semantic search
						if s.emailUsecase != nil {
							go s.emailUsecase.SyncEmailToVectorDB(user.ID, latestEmail)
							log.Printf("[PubSub] Triggered async vector sync for email %s", messageID)
						}
					} else {
						log.Printf("[FCM] Could not fetch email details (using generic message): %v", err)
					}
				}
				
				failedTokens, err := s.fcmClient.SendToDevices(context.Background(), tokenStrings, fcm.NotificationData{
					Title: title,
					Body:  body,
					Data: map[string]string{
						"type":         "email_update",
						"email":        notification.EmailAddress,
						"historyId":    fmt.Sprintf("%d", notification.HistoryID),
						"messageId":    messageID,
						"click_action": s.buildEmailClickAction(messageID),
					},
				})
				
				if err != nil {
					log.Printf("[FCM] Error sending notifications: %v", err)
				} else {
					log.Printf("[FCM] Successfully sent to %d devices", len(tokens)-len(failedTokens))
				}
				
				// Cleanup failed tokens
				if len(failedTokens) > 0 {
					log.Printf("[FCM] Cleaning up %d failed tokens", len(failedTokens))
					for _, token := range failedTokens {
						s.fcmRepo.DeleteToken(token)
					}
				}
			} else {
				log.Printf("[FCM] No tokens found for user %s, skipping push notification", user.ID)
			}
		}()
	} else {
		log.Printf("[FCM] FCM client or repo not available (client=%v, repo=%v)", s.fcmClient != nil, s.fcmRepo != nil)
	}
}

// buildEmailClickAction returns the URL path for opening a specific email
func (s *Service) buildEmailClickAction(messageID string) string {
	if messageID == "" {
		return "/inbox"
	}
	return fmt.Sprintf("/inbox/%s", messageID)
}
