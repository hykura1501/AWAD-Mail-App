package delivery

import (
	"log"
	"net/http"
	"strconv"

	authdomain "ga03-backend/internal/auth/domain"
	emaildto "ga03-backend/internal/email/dto"
	"ga03-backend/internal/email/usecase"

	"github.com/gin-gonic/gin"
)

type EmailHandler struct {
	emailUsecase usecase.EmailUsecase
}

func NewEmailHandler(emailUsecase usecase.EmailUsecase) *EmailHandler {
	return &EmailHandler{
		emailUsecase: emailUsecase,
	}
}

func (h *EmailHandler) GetAllMailboxes(c *gin.Context) {
	user, exists := c.Get("user")
	if !exists {
		c.JSON(http.StatusUnauthorized, gin.H{"error": "not authenticated"})
		return
	}
	
	userData, ok := user.(*authdomain.User)
	if !ok {
		c.JSON(http.StatusUnauthorized, gin.H{"error": "invalid user data"})
		return
	}
	
	userID := userData.ID
	
	mailboxes, err := h.emailUsecase.GetAllMailboxes(userID)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}

	c.JSON(http.StatusOK, emaildto.MailboxesResponse{Mailboxes: mailboxes})
}

func (h *EmailHandler) GetMailboxByID(c *gin.Context) {
	id := c.Param("id")
	mailbox, err := h.emailUsecase.GetMailboxByID(id)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}

	if mailbox == nil {
		c.JSON(http.StatusNotFound, gin.H{"error": "mailbox not found"})
		return
	}

	c.JSON(http.StatusOK, mailbox)
}

func (h *EmailHandler) GetEmailsByMailbox(c *gin.Context) {
	mailboxID := c.Param("id")

	user, exists := c.Get("user")
	if !exists {
		c.JSON(http.StatusUnauthorized, gin.H{"error": "not authenticated"})
		return
	}
	
	userData, ok := user.(*authdomain.User)
	if !ok {
		c.JSON(http.StatusUnauthorized, gin.H{"error": "invalid user data"})
		return
	}
	
	userID := userData.ID

	limit := 20
	offset := 0

	if limitStr := c.Query("limit"); limitStr != "" {
		if parsed, err := strconv.Atoi(limitStr); err == nil && parsed > 0 {
			limit = parsed
		}
	}

	if offsetStr := c.Query("offset"); offsetStr != "" {
		if parsed, err := strconv.Atoi(offsetStr); err == nil && parsed >= 0 {
			offset = parsed
		}
	}

	query := c.Query("q")

	emails, total, err := h.emailUsecase.GetEmailsByMailbox(userID, mailboxID, limit, offset, query)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}

	c.JSON(http.StatusOK, emaildto.EmailsResponse{
		Emails: emails,
		Limit:  limit,
		Offset: offset,
		Total:  total,
	})
}

func (h *EmailHandler) GetEmailByID(c *gin.Context) {
	id := c.Param("id")
	
	user, exists := c.Get("user")
	if !exists {
		c.JSON(http.StatusUnauthorized, gin.H{"error": "not authenticated"})
		return
	}
	
	userData, ok := user.(*authdomain.User)
	if !ok {
		c.JSON(http.StatusUnauthorized, gin.H{"error": "invalid user data"})
		return
	}
	
	userID := userData.ID
	
	email, err := h.emailUsecase.GetEmailByID(userID, id)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}

	if email == nil {
		c.JSON(http.StatusNotFound, gin.H{"error": "email not found"})
		return
	}

	// Mark as read when viewing
	_ = h.emailUsecase.MarkEmailAsRead(userID, id)

	c.JSON(http.StatusOK, email)
}

func (h *EmailHandler) MarkAsRead(c *gin.Context) {
	id := c.Param("id")
	
	user, exists := c.Get("user")
	if !exists {
		c.JSON(http.StatusUnauthorized, gin.H{"error": "not authenticated"})
		return
	}
	
	userData, ok := user.(*authdomain.User)
	if !ok {
		c.JSON(http.StatusUnauthorized, gin.H{"error": "invalid user data"})
		return
	}
	
	userID := userData.ID
	
	if err := h.emailUsecase.MarkEmailAsRead(userID, id); err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}

	c.JSON(http.StatusOK, gin.H{"message": "email marked as read"})
}

func (h *EmailHandler) MarkAsUnread(c *gin.Context) {
	id := c.Param("id")
	
	user, exists := c.Get("user")
	if !exists {
		c.JSON(http.StatusUnauthorized, gin.H{"error": "not authenticated"})
		return
	}
	
	userData, ok := user.(*authdomain.User)
	if !ok {
		c.JSON(http.StatusUnauthorized, gin.H{"error": "invalid user data"})
		return
	}
	
	userID := userData.ID
	
	if err := h.emailUsecase.MarkEmailAsUnread(userID, id); err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}

	c.JSON(http.StatusOK, gin.H{"message": "email marked as unread"})
}

func (h *EmailHandler) ToggleStar(c *gin.Context) {
	id := c.Param("id")
	
	user, exists := c.Get("user")
	if !exists {
		c.JSON(http.StatusUnauthorized, gin.H{"error": "not authenticated"})
		return
	}
	
	userData, ok := user.(*authdomain.User)
	if !ok {
		c.JSON(http.StatusUnauthorized, gin.H{"error": "invalid user data"})
		return
	}
	
	userID := userData.ID
	
	if err := h.emailUsecase.ToggleStar(userID, id); err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}

	c.JSON(http.StatusOK, gin.H{"message": "email star toggled"})
}

func (h *EmailHandler) SendEmail(c *gin.Context) {
	var req emaildto.SendEmailRequest
	if err := c.ShouldBind(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}

	user, exists := c.Get("user")
	if !exists {
		c.JSON(http.StatusUnauthorized, gin.H{"error": "not authenticated"})
		return
	}
	
	userData, ok := user.(*authdomain.User)
	if !ok {
		c.JSON(http.StatusUnauthorized, gin.H{"error": "invalid user data"})
		return
	}
	
	userID := userData.ID

	if err := h.emailUsecase.SendEmail(userID, req.To, req.Subject, req.Body, req.Files); err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}

	c.JSON(http.StatusOK, gin.H{"message": "email sent successfully"})
}

func (h *EmailHandler) TrashEmail(c *gin.Context) {
	id := c.Param("id")
	
	user, exists := c.Get("user")
	if !exists {
		c.JSON(http.StatusUnauthorized, gin.H{"error": "not authenticated"})
		return
	}
	
	userData, ok := user.(*authdomain.User)
	if !ok {
		c.JSON(http.StatusUnauthorized, gin.H{"error": "invalid user data"})
		return
	}
	
	userID := userData.ID

	if err := h.emailUsecase.TrashEmail(userID, id); err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}

	c.JSON(http.StatusOK, gin.H{"message": "email moved to trash"})
}

func (h *EmailHandler) ArchiveEmail(c *gin.Context) {
	id := c.Param("id")
	
	user, exists := c.Get("user")
	if !exists {
		c.JSON(http.StatusUnauthorized, gin.H{"error": "not authenticated"})
		return
	}
	
	userData, ok := user.(*authdomain.User)
	if !ok {
		c.JSON(http.StatusUnauthorized, gin.H{"error": "invalid user data"})
		return
	}
	
	userID := userData.ID

	if err := h.emailUsecase.ArchiveEmail(userID, id); err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}

	c.JSON(http.StatusOK, gin.H{"message": "email archived"})
}

func (h *EmailHandler) WatchMailbox(c *gin.Context) {
	user, exists := c.Get("user")
	if !exists {
		c.JSON(http.StatusUnauthorized, gin.H{"error": "not authenticated"})
		return
	}
	
	userData, ok := user.(*authdomain.User)
	if !ok {
		c.JSON(http.StatusUnauthorized, gin.H{"error": "invalid user data"})
		return
	}
	
	userID := userData.ID
	
	// Log the watch request
	log.Printf("Received watch request for user: %s", userID)

	err := h.emailUsecase.WatchMailbox(userID)
	if err != nil {
		log.Printf("Failed to watch mailbox for user %s: %v", userID, err)
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}

	log.Printf("Successfully started watching mailbox for user: %s", userID)
	c.JSON(http.StatusOK, gin.H{"message": "watch started"})
}

func (h *EmailHandler) GetAttachment(c *gin.Context) {
	messageID := c.Param("id")
	attachmentID := c.Param("attachmentId")

	user, exists := c.Get("user")
	if !exists {
		c.JSON(http.StatusUnauthorized, gin.H{"error": "not authenticated"})
		return
	}
	
	userData, ok := user.(*authdomain.User)
	if !ok {
		c.JSON(http.StatusUnauthorized, gin.H{"error": "invalid user data"})
		return
	}
	
	userID := userData.ID

	attachment, data, err := h.emailUsecase.GetAttachment(userID, messageID, attachmentID)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}

	c.Header("Content-Disposition", "attachment; filename="+attachment.Name)
	c.Data(http.StatusOK, attachment.MimeType, data)
}

