package delivery

import (
	"ga03-backend/internal/task/domain"
	"ga03-backend/internal/task/usecase"
	"net/http"
	"strconv"

	"github.com/gin-gonic/gin"
)

// TaskHandler handles task-related HTTP requests
type TaskHandler struct {
	taskUsecase usecase.TaskUsecase
}

// NewTaskHandler creates a new TaskHandler
func NewTaskHandler(taskUsecase usecase.TaskUsecase) *TaskHandler {
	return &TaskHandler{
		taskUsecase: taskUsecase,
	}
}

// CreateTaskRequest represents the request body for creating a task
type CreateTaskRequest struct {
	Title       string  `json:"title" binding:"required"`
	Description string  `json:"description"`
	DueDate     *string `json:"due_date"`
	Priority    string  `json:"priority"`
	ReminderAt  *string `json:"reminder_at"`
}

// GetTasks returns all tasks for the authenticated user
// GET /api/tasks?status=pending&limit=50&offset=0
func (h *TaskHandler) GetTasks(c *gin.Context) {
	userID := c.GetString("userID")

	status := c.Query("status")
	limit, _ := strconv.Atoi(c.DefaultQuery("limit", "50"))
	offset, _ := strconv.Atoi(c.DefaultQuery("offset", "0"))

	var statusPtr *string
	if status != "" {
		statusPtr = &status
	}

	tasks, total, err := h.taskUsecase.GetUserTasks(userID, statusPtr, limit, offset)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}

	c.JSON(http.StatusOK, gin.H{
		"tasks": tasks,
		"total": total,
	})
}

// GetTaskByID returns a specific task
// GET /api/tasks/:id
func (h *TaskHandler) GetTaskByID(c *gin.Context) {
	userID := c.GetString("userID")
	taskID := c.Param("id")

	task, err := h.taskUsecase.GetTaskByID(userID, taskID)
	if err != nil {
		if err.Error() == "task not found" {
			c.JSON(http.StatusNotFound, gin.H{"error": "Task not found"})
			return
		}
		if err.Error() == "unauthorized" {
			c.JSON(http.StatusForbidden, gin.H{"error": "Unauthorized"})
			return
		}
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}

	c.JSON(http.StatusOK, task)
}

// CreateTask creates a new task manually
// POST /api/tasks
func (h *TaskHandler) CreateTask(c *gin.Context) {
	userID := c.GetString("userID")

	var req CreateTaskRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}

	priority := req.Priority
	if priority == "" {
		priority = "medium"
	}

	task, err := h.taskUsecase.CreateTask(userID, req.Title, req.Description, req.DueDate, req.ReminderAt, priority)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}

	c.JSON(http.StatusCreated, task)
}

// UpdateTask updates an existing task
// PUT /api/tasks/:id
func (h *TaskHandler) UpdateTask(c *gin.Context) {
	userID := c.GetString("userID")
	taskID := c.Param("id")

	var updates usecase.TaskUpdateRequest
	if err := c.ShouldBindJSON(&updates); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}

	task, err := h.taskUsecase.UpdateTask(userID, taskID, updates)
	if err != nil {
		if err.Error() == "task not found" {
			c.JSON(http.StatusNotFound, gin.H{"error": "Task not found"})
			return
		}
		if err.Error() == "unauthorized" {
			c.JSON(http.StatusForbidden, gin.H{"error": "Unauthorized"})
			return
		}
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}

	c.JSON(http.StatusOK, task)
}

// DeleteTask deletes a task
// DELETE /api/tasks/:id
func (h *TaskHandler) DeleteTask(c *gin.Context) {
	userID := c.GetString("userID")
	taskID := c.Param("id")

	err := h.taskUsecase.DeleteTask(userID, taskID)
	if err != nil {
		if err.Error() == "task not found" {
			c.JSON(http.StatusNotFound, gin.H{"error": "Task not found"})
			return
		}
		if err.Error() == "unauthorized" {
			c.JSON(http.StatusForbidden, gin.H{"error": "Unauthorized"})
			return
		}
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}

	c.JSON(http.StatusOK, gin.H{"message": "Task deleted successfully"})
}

// ExtractTasksFromEmail uses AI to extract tasks from an email
// POST /api/tasks/extract/:emailId
func (h *TaskHandler) ExtractTasksFromEmail(c *gin.Context) {
	userID := c.GetString("userID")
	emailID := c.Param("emailId")

	tasks, err := h.taskUsecase.ExtractTasksFromEmail(c.Request.Context(), userID, emailID)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}

	// Return empty array if no tasks found instead of null
	if tasks == nil {
		tasks = []*domain.Task{}
	}

	c.JSON(http.StatusOK, gin.H{
		"tasks":   tasks,
		"count":   len(tasks),
		"message": "Tasks extracted successfully",
	})
}

// UpdateTaskStatus is a convenience endpoint to just update status
// PATCH /api/tasks/:id/status
func (h *TaskHandler) UpdateTaskStatus(c *gin.Context) {
	userID := c.GetString("userID")
	taskID := c.Param("id")

	var req struct {
		Status string `json:"status" binding:"required"`
	}
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}

	updates := usecase.TaskUpdateRequest{
		Status: &req.Status,
	}

	task, err := h.taskUsecase.UpdateTask(userID, taskID, updates)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}

	c.JSON(http.StatusOK, task)
}
