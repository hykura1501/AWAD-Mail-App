package scheduler

import (
	"context"
	"fmt"
	"ga03-backend/internal/task/repository"
	"ga03-backend/pkg/fcm"
	"log"
	"time"

	authrepo "ga03-backend/internal/auth/repository"
)

// TaskReminderScheduler handles sending FCM reminders for tasks
type TaskReminderScheduler struct {
	taskRepo  repository.TaskRepository
	fcmRepo   authrepo.FCMTokenRepository
	fcmClient *fcm.Client
	interval  time.Duration
	stopChan  chan struct{}
}

// NewTaskReminderScheduler creates a new scheduler
func NewTaskReminderScheduler(
	taskRepo repository.TaskRepository,
	fcmRepo authrepo.FCMTokenRepository,
	fcmClient *fcm.Client,
) *TaskReminderScheduler {
	return &TaskReminderScheduler{
		taskRepo:  taskRepo,
		fcmRepo:   fcmRepo,
		fcmClient: fcmClient,
		interval:  1 * time.Minute, // Check every minute
		stopChan:  make(chan struct{}),
	}
}

// Start begins the scheduler loop
func (s *TaskReminderScheduler) Start() {
	if s.fcmClient == nil {
		log.Println("[TaskScheduler] FCM client not available, scheduler disabled")
		return
	}

	log.Println("[TaskScheduler] Starting task reminder scheduler (interval: 1 minute)")
	
	go func() {
		// Run immediately on start
		s.checkAndSendReminders()
		
		ticker := time.NewTicker(s.interval)
		defer ticker.Stop()

		for {
			select {
			case <-ticker.C:
				s.checkAndSendReminders()
			case <-s.stopChan:
				log.Println("[TaskScheduler] Scheduler stopped")
				return
			}
		}
	}()
}

// Stop gracefully stops the scheduler
func (s *TaskReminderScheduler) Stop() {
	close(s.stopChan)
}

// checkAndSendReminders finds tasks with due reminders and sends FCM notifications
func (s *TaskReminderScheduler) checkAndSendReminders() {
	now := time.Now()
	
	tasks, err := s.taskRepo.FindPendingReminders(now)
	if err != nil {
		log.Printf("[TaskScheduler] Error finding pending reminders: %v", err)
		return
	}

	if len(tasks) == 0 {
		return
	}

	log.Printf("[TaskScheduler] Found %d tasks with pending reminders", len(tasks))

	for _, task := range tasks {
		// Get FCM tokens for the user
		tokens, err := s.fcmRepo.GetTokensByUserID(task.UserID)
		if err != nil {
			log.Printf("[TaskScheduler] Error getting FCM tokens for user %s: %v", task.UserID, err)
			continue
		}

		if len(tokens) == 0 {
			log.Printf("[TaskScheduler] No FCM tokens for user %s, marking reminder as sent", task.UserID)
			s.taskRepo.MarkReminderSent(task.ID)
			continue
		}

		// Build notification
		title := "📌 Nhắc nhở: " + task.Title
		body := task.Description
		if body == "" {
			body = "Bạn có một task cần hoàn thành"
		}
		if task.DueDate != nil {
			body = fmt.Sprintf("%s\n📅 Hạn chót: %s", body, task.DueDate.Format("02/01/2006 15:04"))
		}

		// Priority badge
		priorityEmoji := "🟡"
		switch task.Priority {
		case "high":
			priorityEmoji = "🔴"
		case "low":
			priorityEmoji = "🟢"
		}
		title = priorityEmoji + " " + title

		// Send to all user devices
		var tokenStrings []string
		for _, t := range tokens {
			tokenStrings = append(tokenStrings, t.Token)
		}

		notification := fcm.NotificationData{
			Title: title,
			Body:  body,
			Data: map[string]string{
				"type":         "task_reminder",
				"task_id":      task.ID,
				"priority":     string(task.Priority),
				"click_action": "/tasks",
			},
		}

		failedTokens, err := s.fcmClient.SendToDevices(context.Background(), tokenStrings, notification)
		if err != nil {
			log.Printf("[TaskScheduler] Error sending reminder for task %s: %v", task.ID, err)
		} else {
			log.Printf("[TaskScheduler] Sent reminder for task '%s' to %d devices", task.Title, len(tokenStrings)-len(failedTokens))
		}

		// Cleanup failed tokens
		for _, token := range failedTokens {
			s.fcmRepo.DeleteToken(token)
		}

		// Mark reminder as sent regardless of success (to avoid spamming)
		if err := s.taskRepo.MarkReminderSent(task.ID); err != nil {
			log.Printf("[TaskScheduler] Error marking reminder as sent for task %s: %v", task.ID, err)
		}
	}
}
