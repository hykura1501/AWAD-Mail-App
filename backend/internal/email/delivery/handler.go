package delivery

import (
	"net/http"
	"strconv"

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
	mailboxes, err := h.emailUsecase.GetAllMailboxes()
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

	emails, total, err := h.emailUsecase.GetEmailsByMailbox(mailboxID, limit, offset)
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
	email, err := h.emailUsecase.GetEmailByID(id)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}

	if email == nil {
		c.JSON(http.StatusNotFound, gin.H{"error": "email not found"})
		return
	}

	// Mark as read when viewing
	_ = h.emailUsecase.MarkEmailAsRead(id)

	c.JSON(http.StatusOK, email)
}

func (h *EmailHandler) MarkAsRead(c *gin.Context) {
	id := c.Param("id")
	if err := h.emailUsecase.MarkEmailAsRead(id); err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}

	c.JSON(http.StatusOK, gin.H{"message": "email marked as read"})
}

func (h *EmailHandler) ToggleStar(c *gin.Context) {
	id := c.Param("id")
	if err := h.emailUsecase.ToggleStar(id); err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}

	email, _ := h.emailUsecase.GetEmailByID(id)
	c.JSON(http.StatusOK, email)
}

