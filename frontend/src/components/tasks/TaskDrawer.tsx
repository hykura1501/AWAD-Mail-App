import { useState, useEffect } from "react";
import { taskService } from "@/services/task.service";
import type { Task, TaskStatus, Priority } from "@/types/task";
import { TaskCard, TaskModal } from "@/components/tasks";
import { Plus, Circle, Clock, ListTodo, CheckCheck, AlertCircle, X } from "lucide-react";

interface TaskDrawerProps {
  isOpen: boolean;
  onClose: () => void;
}

export default function TaskDrawer({ isOpen, onClose }: TaskDrawerProps) {
  // Task state
  const [tasks, setTasks] = useState<Task[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [statusFilter, setStatusFilter] = useState<TaskStatus | "all">("all");
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingTask, setEditingTask] = useState<Task | null>(null);

  // Load tasks when drawer opens
  useEffect(() => {
    if (isOpen) {
      loadTasks();
    }
  }, [isOpen, statusFilter]);

  const loadTasks = async () => {
    try {
      setIsLoading(true);
      const status = statusFilter === "all" ? undefined : statusFilter;
      const response = await taskService.getTasks(status, 100, 0);
      setTasks(response.tasks || []);
    } catch (error) {
      console.error("Error loading tasks:", error);
    } finally {
      setIsLoading(false);
    }
  };

  // Status change handler
  const handleStatusChange = async (taskId: string, status: TaskStatus) => {
    try {
      setTasks((prev) =>
        prev.map((t) => (t.id === taskId ? { ...t, status } : t))
      );
      await taskService.updateTaskStatus(taskId, status);
    } catch (error) {
      console.error("Error updating task status:", error);
      loadTasks();
    }
  };

  // Delete handler
  const handleDelete = async (taskId: string) => {
    if (!confirm("Bạn có chắc muốn xóa task này?")) return;
    try {
      setTasks((prev) => prev.filter((t) => t.id !== taskId));
      await taskService.deleteTask(taskId);
    } catch (error) {
      console.error("Error deleting task:", error);
    }
  };

  // Save handler
  const handleSave = async (data: {
    title: string;
    description: string;
    due_date?: string;
    priority: Priority;
    reminder_at?: string;
  }) => {
    try {
      if (editingTask) {
        const updated = await taskService.updateTask(editingTask.id, data);
        setTasks((prev) =>
          prev.map((t) => (t.id === editingTask.id ? updated : t))
        );
      } else {
        const created = await taskService.createTask(data);
        setTasks((prev) => [created, ...prev]);
      }
      setEditingTask(null);
    } catch (error) {
      console.error("Error saving task:", error);
    }
  };

  // Stats
  const stats = {
    total: tasks.length,
    pending: tasks.filter((t) => t.status === "pending").length,
    inProgress: tasks.filter((t) => t.status === "in_progress").length,
    completed: tasks.filter((t) => t.status === "completed").length,
  };

  if (!isOpen) return null;

  return (
    <>
      {/* Backdrop */}
      <div
        className="fixed inset-0 bg-black/30 backdrop-blur-sm z-40"
        onClick={onClose}
      />

      {/* Drawer */}
      <div className="fixed top-0 right-0 h-full w-full max-w-md bg-white dark:bg-[#111418] shadow-2xl z-50 flex flex-col animate-in slide-in-from-right duration-300">
        {/* Header */}
        <div className="flex items-center justify-between px-4 py-3 border-b border-gray-200 dark:border-gray-700 bg-white dark:bg-[#1a1f2e]">
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-purple-500 to-pink-500 flex items-center justify-center shadow-md">
              <ListTodo className="w-5 h-5 text-white" />
            </div>
            <span className="text-lg font-semibold bg-gradient-to-r from-purple-600 to-pink-600 bg-clip-text text-transparent">
              Tasks
            </span>
          </div>
          <button
            onClick={onClose}
            className="p-2 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-lg transition-colors"
          >
            <X className="w-5 h-5 text-gray-500" />
          </button>
        </div>

        {/* Stats */}
        <div className="px-4 py-2 bg-gray-50 dark:bg-[#1a1f2e] border-b border-gray-200 dark:border-gray-700 flex flex-wrap items-center gap-3 text-xs">
          <div className="flex items-center gap-1 text-gray-600 dark:text-gray-400">
            <ListTodo className="w-3.5 h-3.5" />
            <span>{stats.total}</span>
          </div>
          <div className="flex items-center gap-1 text-yellow-600 dark:text-yellow-400">
            <Circle className="w-3.5 h-3.5" />
            <span>{stats.pending}</span>
          </div>
          <div className="flex items-center gap-1 text-blue-600 dark:text-blue-400">
            <Clock className="w-3.5 h-3.5" />
            <span>{stats.inProgress}</span>
          </div>
          <div className="flex items-center gap-1 text-green-600 dark:text-green-400">
            <CheckCheck className="w-3.5 h-3.5" />
            <span>{stats.completed}</span>
          </div>
          <div className="flex-1" />
          <select
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value as TaskStatus | "all")}
            className="px-2 py-1 bg-white dark:bg-[#283039] border border-gray-200 dark:border-gray-600 rounded text-xs text-gray-700 dark:text-gray-300"
          >
            <option value="all">Tất cả</option>
            <option value="pending">Chờ xử lý</option>
            <option value="in_progress">Đang làm</option>
            <option value="completed">Hoàn thành</option>
          </select>
          <button
            onClick={() => {
              setEditingTask(null);
              setIsModalOpen(true);
            }}
            className="flex items-center gap-1 px-2 py-1 bg-purple-600 hover:bg-purple-700 text-white rounded text-xs font-medium transition-colors"
          >
            <Plus className="w-3.5 h-3.5" />
            Tạo
          </button>
        </div>

        {/* Task List */}
        <div className="flex-1 overflow-y-auto p-4">
          {isLoading ? (
            <div className="flex items-center justify-center h-32">
              <div className="animate-spin rounded-full h-6 w-6 border-b-2 border-purple-600" />
            </div>
          ) : tasks.length === 0 ? (
            <div className="flex flex-col items-center justify-center h-32 text-gray-500 dark:text-gray-400">
              <AlertCircle className="w-8 h-8 mb-2 opacity-50" />
              <p className="text-sm">Chưa có task nào</p>
            </div>
          ) : (
            <div className="space-y-2">
              {tasks.map((task) => (
                <TaskCard
                  key={task.id}
                  task={task}
                  onStatusChange={handleStatusChange}
                  onDelete={handleDelete}
                  onEdit={(t) => {
                    setEditingTask(t);
                    setIsModalOpen(true);
                  }}
                />
              ))}
            </div>
          )}
        </div>
      </div>

      {/* Create/Edit Modal */}
      <TaskModal
        isOpen={isModalOpen}
        onClose={() => {
          setIsModalOpen(false);
          setEditingTask(null);
        }}
        onSave={handleSave}
        task={editingTask}
      />
    </>
  );
}
