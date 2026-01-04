import apiClient from "@/lib/api-client";
import type {
  Task,
  CreateTaskRequest,
  UpdateTaskRequest,
  TasksResponse,
  ExtractTasksResponse,
  TaskStatus,
} from "@/types/task";

export const taskService = {
  // Get all tasks for the current user
  getTasks: async (
    status?: TaskStatus,
    limit = 50,
    offset = 0
  ): Promise<TasksResponse> => {
    const params: Record<string, unknown> = { limit, offset };
    if (status) {
      params.status = status;
    }
    const response = await apiClient.get<TasksResponse>("/tasks", { params });
    return response.data;
  },

  // Get a specific task by ID
  getTaskById: async (taskId: string): Promise<Task> => {
    const response = await apiClient.get<Task>(`/tasks/${taskId}`);
    return response.data;
  },

  // Create a new task manually
  createTask: async (task: CreateTaskRequest): Promise<Task> => {
    const response = await apiClient.post<Task>("/tasks", task);
    return response.data;
  },

  // Update an existing task
  updateTask: async (taskId: string, updates: UpdateTaskRequest): Promise<Task> => {
    const response = await apiClient.put<Task>(`/tasks/${taskId}`, updates);
    return response.data;
  },

  // Update task status (convenience method)
  updateTaskStatus: async (taskId: string, status: TaskStatus): Promise<Task> => {
    const response = await apiClient.patch<Task>(`/tasks/${taskId}/status`, { status });
    return response.data;
  },

  // Delete a task
  deleteTask: async (taskId: string): Promise<void> => {
    await apiClient.delete(`/tasks/${taskId}`);
  },

  // Extract tasks from an email using AI
  extractTasksFromEmail: async (emailId: string): Promise<ExtractTasksResponse> => {
    const response = await apiClient.post<ExtractTasksResponse>(
      `/tasks/extract/${emailId}`
    );
    return response.data;
  },
};
