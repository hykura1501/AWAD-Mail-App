package fcm

import (
	"context"
	"fmt"
	"log"

	firebase "firebase.google.com/go/v4"
	"firebase.google.com/go/v4/messaging"
	"google.golang.org/api/option"
)

// Client wraps Firebase Cloud Messaging functionality
type Client struct {
	messagingClient *messaging.Client
}

// NewClient creates a new FCM client using the provided credentials file
func NewClient(credentialsFile string) (*Client, error) {
	ctx := context.Background()
	
	var opts []option.ClientOption
	if credentialsFile != "" {
		opts = append(opts, option.WithCredentialsFile(credentialsFile))
	}

	app, err := firebase.NewApp(ctx, nil, opts...)
	if err != nil {
		return nil, fmt.Errorf("failed to initialize Firebase app: %w", err)
	}

	messagingClient, err := app.Messaging(ctx)
	if err != nil {
		return nil, fmt.Errorf("failed to get messaging client: %w", err)
	}

	log.Println("[FCM] Client initialized successfully")
	return &Client{
		messagingClient: messagingClient,
	}, nil
}

// NotificationData contains the data to send in a push notification
type NotificationData struct {
	Title    string
	Body     string
	ImageURL string            // Optional notification image
	Data     map[string]string // Custom data payload
	// Click action
	ClickAction string // URL to open when notification is clicked
}

// SendToDevice sends a push notification to a specific device token
func (c *Client) SendToDevice(ctx context.Context, token string, notification NotificationData) error {
	message := &messaging.Message{
		Token: token,
		Notification: &messaging.Notification{
			Title:    notification.Title,
			Body:     notification.Body,
			ImageURL: notification.ImageURL,
		},
		Data: notification.Data,
		Webpush: &messaging.WebpushConfig{
			Notification: &messaging.WebpushNotification{
				Title: notification.Title,
				Body:  notification.Body,
				Icon:  "/icon-192.svg",
			},
		},
	}

	response, err := c.messagingClient.Send(ctx, message)
	if err != nil {
		return fmt.Errorf("failed to send FCM message: %w", err)
	}

	log.Printf("[FCM] Message sent successfully: %s", response)
	return nil
}

// SendToDevices sends a push notification to multiple device tokens
// Returns a list of tokens that failed to receive the notification
func (c *Client) SendToDevices(ctx context.Context, tokens []string, notification NotificationData) ([]string, error) {
	if len(tokens) == 0 {
		return nil, nil
	}

	message := &messaging.MulticastMessage{
		Tokens: tokens,
		Notification: &messaging.Notification{
			Title:    notification.Title,
			Body:     notification.Body,
			ImageURL: notification.ImageURL,
		},
		Data: notification.Data,
		Webpush: &messaging.WebpushConfig{
			Notification: &messaging.WebpushNotification{
				Title: notification.Title,
				Body:  notification.Body,
				Icon:  "/icon-192.svg",
			},
		},
	}

	response, err := c.messagingClient.SendEachForMulticast(ctx, message)
	if err != nil {
		return nil, fmt.Errorf("failed to send FCM multicast message: %w", err)
	}

	log.Printf("[FCM] Multicast sent: %d success, %d failures", response.SuccessCount, response.FailureCount)

	// Collect failed tokens
	var failedTokens []string
	for i, resp := range response.Responses {
		if !resp.Success {
			failedTokens = append(failedTokens, tokens[i])
			log.Printf("[FCM] Failed to send to token %s: %v", tokens[i][:20]+"...", resp.Error)
		}
	}

	return failedTokens, nil
}
