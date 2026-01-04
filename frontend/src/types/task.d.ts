export type Priority = 'high' | 'medium' | 'low';
export type TaskStatus = 'pending' | 'in_progress' | 'completed';

export interface Task {
  id: string;
  user_id: string;
  email_id?: string;
  title: string;
  description?: string;
  due_date?: string;
  priority: Priority;
  status: TaskStatus;
  reminder_at?: string;
  reminder_sent: boolean;
  created_at: string;
  updated_at: string;
}

export interface CreateTaskRequest {
  title: string;
  description?: string;
  due_date?: string;
  priority?: Priority;
  reminder_at?: string;
}

export interface UpdateTaskRequest {
  title?: string;
  description?: string;
  due_date?: string;
  priority?: Priority;
  status?: TaskStatus;
  reminder_at?: string;
}

export interface TasksResponse {
  tasks: Task[];
  total: number;
}

export interface ExtractTasksResponse {
  tasks: Task[];
  count: number;
  message: string;
}
