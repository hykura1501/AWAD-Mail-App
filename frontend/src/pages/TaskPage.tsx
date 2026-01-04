import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { useAppSelector } from "@/store/hooks";
import { taskService } from "@/services/task.service";
import type { Task, TaskStatus, Priority } from "@/types/task";
import { useFCM } from "@/hooks";
import KanbanToggle from "@/components/kanban/KanbanToggle";
import AccountMenu from "@/components/common/AccountMenu";
import { TaskCard, TaskModal } from "@/components/tasks";
import { Plus, Circle, Clock, ListTodo, CheckCheck, AlertCircle } from "lucide-react";

export default function TaskPage() {
  const navigate = useNavigate();
  const user = useAppSelector((state) => state.auth.user);

  // Initialize FCM for push notifications
  useFCM();

  // Task state
  const [tasks, setTasks] = useState<Task[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [statusFilter, setStatusFilter] = useState<TaskStatus | "all">("all");
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingTask, setEditingTask] = useState<Task | null>(null);

  // Load tasks
  useEffect(() => {
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
    loadTasks();
  }, [statusFilter]);

  // Status change handler
  const handleStatusChange = async (taskId: string, status: TaskStatus) => {
    try {
      // Optimistic update
      setTasks((prev) =>
        prev.map((t) => (t.id === taskId ? { ...t, status } : t))
      );
      await taskService.updateTaskStatus(taskId, status);
    } catch (error) {
      console.error("Error updating task status:", error);
      // Reload on error
      const response = await taskService.getTasks(undefined, 100, 0);
      setTasks(response.tasks || []);
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

  return (
    <div className="flex flex-col h-screen bg-gray-50 dark:bg-[#111418] text-gray-900 dark:text-white overflow-hidden font-sans transition-colors duration-200">
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-2 border-b border-gray-200 dark:border-gray-700 bg-white dark:bg-[#1a1f2e] shadow-sm">
        <div className="flex items-center gap-3">
          <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-purple-500 to-pink-500 flex items-center justify-center shadow-md">
            <ListTodo className="w-5 h-5 text-white" />
          </div>
          <span className="text-xl font-semibold bg-gradient-to-r from-purple-600 to-pink-600 bg-clip-text text-transparent">
            Tasks
          </span>
        </div>
        <div className="flex items-center gap-2">
          <KanbanToggle isKanban={false} onToggle={() => navigate("/kanban")} />
          {/* AccountMenu - uses internal hook for theme/logout */}
          <AccountMenu user={user} showFullProfile={false} />
        </div>
      </div>

      {/* Stats Bar */}
      <div className="px-4 py-3 bg-white dark:bg-[#1a1f2e] border-b border-gray-200 dark:border-gray-700">
        <div className="flex flex-wrap items-center gap-4">
          <div className="flex items-center gap-2 text-gray-600 dark:text-gray-400">
            <ListTodo className="w-4 h-4" />
            <span className="text-sm">{stats.total} tasks</span>
          </div>
          <div className="flex items-center gap-2 text-yellow-600 dark:text-yellow-400">
            <Circle className="w-4 h-4" />
            <span className="text-sm">{stats.pending} chờ xử lý</span>
          </div>
          <div className="flex items-center gap-2 text-blue-600 dark:text-blue-400">
            <Clock className="w-4 h-4" />
            <span className="text-sm">{stats.inProgress} đang làm</span>
          </div>
          <div className="flex items-center gap-2 text-green-600 dark:text-green-400">
            <CheckCheck className="w-4 h-4" />
            <span className="text-sm">{stats.completed} hoàn thành</span>
          </div>
          <div className="flex-1" />
          <select
            value={statusFilter}
            onChange={(e) =>
              setStatusFilter(e.target.value as TaskStatus | "all")
            }
            className="px-3 py-1.5 bg-gray-100 dark:bg-[#283039] border border-gray-200 dark:border-gray-600 rounded-lg text-sm text-gray-700 dark:text-gray-300"
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
            className="flex items-center gap-2 px-4 py-1.5 bg-purple-600 hover:bg-purple-700 text-white rounded-lg font-medium transition-colors"
          >
            <Plus className="w-4 h-4" />
            Tạo Task
          </button>
        </div>
      </div>

      {/* Task List */}
      <div className="flex-1 overflow-y-auto p-4">
        {isLoading ? (
          <div className="flex items-center justify-center h-64">
            <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-purple-600" />
          </div>
        ) : tasks.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-64 text-gray-500 dark:text-gray-400">
            <AlertCircle className="w-12 h-12 mb-3 opacity-50" />
            <p className="text-lg">Chưa có task nào</p>
            <p className="text-sm">Tạo task mới hoặc trích xuất từ email</p>
          </div>
        ) : (
          <div className="max-w-3xl mx-auto space-y-3">
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
    </div>
  );
}
