package repository

import (
	"fmt"
	"sync"
	"time"

	emaildomain "ga03-backend/internal/email/domain"

	"github.com/google/uuid"
)

// emailRepository implements EmailRepository interface
type emailRepository struct {
	mailboxes map[string]*emaildomain.Mailbox
	emails    map[string]*emaildomain.Email
	mu        sync.RWMutex
}

// NewEmailRepository creates a new instance of emailRepository
func NewEmailRepository() EmailRepository {
	repo := &emailRepository{
		mailboxes: make(map[string]*emaildomain.Mailbox),
		emails:    make(map[string]*emaildomain.Email),
	}

	// Initialize mock mailboxes
	repo.initMockMailboxes()
	repo.initMockEmails()

	return repo
}

func (r *emailRepository) initMockMailboxes() {
	mailboxes := []*emaildomain.Mailbox{
		{ID: "inbox", Name: "Inbox", Type: "inbox", Count: 3},
		{ID: "starred", Name: "Starred", Type: "starred", Count: 2},
		{ID: "sent", Name: "Sent", Type: "sent", Count: 0},
		{ID: "drafts", Name: "Drafts", Type: "drafts", Count: 1},
		{ID: "archive", Name: "Archive", Type: "archive", Count: 0},
		{ID: "trash", Name: "Trash", Type: "trash", Count: 0},
	}

	for _, mb := range mailboxes {
		r.mailboxes[mb.ID] = mb
	}
}

func (r *emailRepository) initMockEmails() {
	now := time.Now()

	// Sample senders and subjects for variety
	senders := []struct {
		name  string
		email string
	}{
		{"John Doe", "john.doe@example.com"},
		{"Sarah Smith", "sarah.smith@company.com"},
		{"Tech Newsletter", "newsletter@tech.com"},
		{"Alice Johnson", "alice.johnson@company.com"},
		{"Marketing Team", "marketing@company.com"},
		{"HR Department", "hr@company.com"},
		{"Support Team", "support@company.com"},
		{"Project Manager", "pm@company.com"},
		{"Design Team", "design@company.com"},
		{"Finance Team", "finance@company.com"},
	}

	subjects := []string{
		"Welcome to our platform!",
		"Meeting scheduled for tomorrow",
		"Weekly Tech Digest - Issue #42",
		"Quarterly Report Draft",
		"New Campaign Launch",
		"Meeting Follow-up",
		"Company Policy Update",
		"Project Update - Q3 Roadmap",
		"New comments on your design file",
		"Pull request opened",
		"Action Required: Project Review",
		"Weekly Newsletter Draft",
		"Budget Approval Request",
		"Team Standup Notes",
		"Client Feedback Summary",
	}

	previews := []string{
		"Thank you for joining us. We're excited to have you on board...",
		"Hi, I'd like to schedule a meeting tomorrow at 2 PM...",
		"This week's top stories: AI breakthroughs, new frameworks...",
		"Please find the attached draft for the Q3 quarterly report...",
		"We are excited to announce the launch of our new campaign...",
		"Great meeting today. Here are the action items we discussed...",
		"Please be advised of the new updates to the company's policy...",
		"Hi team, here is the latest update on the Q3 roadmap...",
		"Jane added a new comment to your 'Dashboard V2' frame...",
		"A new pull request has been opened in the 'main' branch...",
		"Please review the attached documents and provide feedback...",
		"Please review the draft for this week's newsletter...",
		"I need your approval for the Q4 budget proposal...",
		"Here are the key points from today's standup meeting...",
		"The client has provided feedback on the latest prototype...",
	}

	emails := []*emaildomain.Email{}

	// Generate inbox emails (50 emails)
	for i := 0; i < 50; i++ {
		sender := senders[i%len(senders)]
		subject := subjects[i%len(subjects)]
		preview := previews[i%len(previews)]

		emails = append(emails, &emaildomain.Email{
			ID:          uuid.New().String(),
			MailboxID:   "inbox",
			From:        sender.email,
			FromName:    sender.name,
			To:          []string{"user@example.com"},
			Subject:     subject + fmt.Sprintf(" #%d", i+1),
			Preview:     preview,
			Body:        fmt.Sprintf("<p>%s</p><p>This is email #%d in your inbox.</p>", preview, i+1),
			IsHTML:      true,
			IsRead:      i%3 == 0, // Every 3rd email is read
			IsStarred:   i%5 == 0, // Every 5th email is starred
			IsImportant: i%7 == 0, // Every 7th email is important
			ReceivedAt:  now.Add(-time.Duration(i) * time.Hour),
			CreatedAt:   now.Add(-time.Duration(i) * time.Hour),
		})
	}

	// Generate starred emails (15 emails)
	for i := 0; i < 15; i++ {
		sender := senders[i%len(senders)]
		subject := subjects[i%len(subjects)]
		preview := previews[i%len(previews)]

		emails = append(emails, &emaildomain.Email{
			ID:          uuid.New().String(),
			MailboxID:   "starred",
			From:        sender.email,
			FromName:    sender.name,
			To:          []string{"user@example.com"},
			Subject:     subject + fmt.Sprintf(" (Starred #%d)", i+1),
			Preview:     preview,
			Body:        fmt.Sprintf("<p>%s</p><p>This is a starred email #%d.</p>", preview, i+1),
			IsHTML:      true,
			IsRead:      i%2 == 0,
			IsStarred:   true,
			IsImportant: i%3 == 0,
			ReceivedAt:  now.Add(-time.Duration(i*2) * time.Hour),
			CreatedAt:   now.Add(-time.Duration(i*2) * time.Hour),
		})
	}

	// Generate sent emails (30 emails)
	for i := 0; i < 30; i++ {
		emails = append(emails, &emaildomain.Email{
			ID:          uuid.New().String(),
			MailboxID:   "sent",
			From:        "user@example.com",
			FromName:    "You",
			To:          []string{senders[i%len(senders)].email},
			Subject:     subjects[i%len(subjects)] + fmt.Sprintf(" (Sent #%d)", i+1),
			Preview:     previews[i%len(previews)],
			Body:        fmt.Sprintf("<p>%s</p>", previews[i%len(previews)]),
			IsHTML:      true,
			IsRead:      true,
			IsStarred:   false,
			IsImportant: false,
			ReceivedAt:  now.Add(-time.Duration(i*3) * time.Hour),
			CreatedAt:   now.Add(-time.Duration(i*3) * time.Hour),
		})
	}

	// Generate drafts (5 emails)
	for i := 0; i < 5; i++ {
		emails = append(emails, &emaildomain.Email{
			ID:          uuid.New().String(),
			MailboxID:   "drafts",
			From:        "user@example.com",
			FromName:    "You",
			To:          []string{senders[i%len(senders)].email},
			Subject:     "Draft: " + subjects[i%len(subjects)],
			Preview:     previews[i%len(previews)],
			Body:        fmt.Sprintf("<p>%s</p>", previews[i%len(previews)]),
			IsHTML:      true,
			IsRead:      true,
			IsStarred:   false,
			IsImportant: false,
			ReceivedAt:  now.Add(-time.Duration(i) * time.Hour),
			CreatedAt:   now.Add(-time.Duration(i) * time.Hour),
		})
	}

	for _, email := range emails {
		r.emails[email.ID] = email
	}

	// Update mailbox counts
	r.updateMailboxCounts()
}

func (r *emailRepository) updateMailboxCounts() {
	r.mu.Lock()
	defer r.mu.Unlock()

	for _, mailbox := range r.mailboxes {
		count := 0
		for _, email := range r.emails {
			if email.MailboxID == mailbox.ID && !email.IsRead {
				count++
			}
		}
		mailbox.Count = count
	}
}

func (r *emailRepository) GetAllMailboxes() ([]*emaildomain.Mailbox, error) {
	r.mu.RLock()
	defer r.mu.RUnlock()

	result := make([]*emaildomain.Mailbox, 0, len(r.mailboxes))
	for _, mb := range r.mailboxes {
		result = append(result, mb)
	}
	return result, nil
}

func (r *emailRepository) GetMailboxByID(id string) (*emaildomain.Mailbox, error) {
	r.mu.RLock()
	defer r.mu.RUnlock()

	mailbox, exists := r.mailboxes[id]
	if !exists {
		return nil, nil
	}
	return mailbox, nil
}

func (r *emailRepository) GetEmailsByMailbox(mailboxID string, limit, offset int) ([]*emaildomain.Email, int, error) {
	r.mu.RLock()
	defer r.mu.RUnlock()

	var result []*emaildomain.Email
	for _, email := range r.emails {
		if email.MailboxID == mailboxID {
			result = append(result, email)
		}
	}

	// Sort by received_at descending (newest first)
	for i := 0; i < len(result)-1; i++ {
		for j := i + 1; j < len(result); j++ {
			if result[i].ReceivedAt.Before(result[j].ReceivedAt) {
				result[i], result[j] = result[j], result[i]
			}
		}
	}

	total := len(result)

	// Simple pagination
	if offset >= len(result) {
		return []*emaildomain.Email{}, total, nil
	}

	end := offset + limit
	if end > len(result) {
		end = len(result)
	}

	return result[offset:end], total, nil
}

func (r *emailRepository) GetEmailByID(id string) (*emaildomain.Email, error) {
	r.mu.RLock()
	defer r.mu.RUnlock()

	email, exists := r.emails[id]
	if !exists {
		return nil, nil
	}
	return email, nil
}

func (r *emailRepository) UpdateEmail(email *emaildomain.Email) error {
	r.mu.Lock()
	defer r.mu.Unlock()

	if _, exists := r.emails[email.ID]; !exists {
		return nil
	}

	r.emails[email.ID] = email
	return nil
}

