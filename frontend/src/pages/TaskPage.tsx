import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { useAppDispatch } from "@/store/hooks";
import { logout } from "@/store/authSlice";
import { authService } from "@/services/auth.service";
import { taskService } from "@/services/task.service";
import type { Task, TaskStatus, Priority } from "@/types/task";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useTheme, useFCM } from "@/hooks";
import KanbanToggle from "@/components/kanban/KanbanToggle";
import { 
  Plus, 
  CheckCircle2, 
  Circle, 
  Clock, 
  Trash2, 
  Edit3,
  Calendar,
  AlertCircle,
  ListTodo,
  CheckCheck
} from "lucide-react";

// Priority badge component
function PriorityBadge({ priority }: { priority: Priority }) {
  const colors = {
    high: "bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400",
    medium: "bg-yellow-100 text-yellow-700 dark:bg-yellow-900/30 dark:text-yellow-400",
    low: "bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400",
  };
  const icons = {
    high: "🔴",
    medium: "🟡",
    low: "🟢",
  };
  return (
    <span className={`inline-flex items-center gap-1 px-2 py-0.5 text-xs font-medium rounded-full ${colors[priority]}`}>
      <span>{icons[priority]}</span>
      {priority === "high" ? "Cao" : priority === "medium" ? "Trung bình" : "Thấp"}
    </span>
  );
}

// Status toggle button
function StatusButton({ status, onToggle }: { status: TaskStatus; onToggle: () => void }) {
  const icons = {
    pending: <Circle className="w-5 h-5 text-gray-400" />,
    in_progress: <Clock className="w-5 h-5 text-blue-500" />,
    completed: <CheckCircle2 className="w-5 h-5 text-green-500" />,
  };
  return (
    <button onClick={onToggle} className="hover:scale-110 transition-transform" title="Thay đổi trạng thái">
      {icons[status]}
    </button>
  );
}

// Task card component
function TaskCard({
  task,
  onStatusChange,
  onDelete,
  onEdit,
}: {
  task: Task;
  onStatusChange: (taskId: string, status: TaskStatus) => void;
  onDelete: (taskId: string) => void;
  onEdit: (task: Task) => void;
}) {
  const nextStatus = (current: TaskStatus): TaskStatus => {
    if (current === "pending") return "in_progress";
    if (current === "in_progress") return "completed";
    return "pending";
  };

  const formatDate = (dateStr?: string) => {
    if (!dateStr) return null;
    const date = new Date(dateStr);
    const now = new Date();
    const diff = date.getTime() - now.getTime();
    const days = Math.ceil(diff / (1000 * 60 * 60 * 24));
    
    if (days < 0) return { text: "Quá hạn", color: "text-red-500" };
    if (days === 0) return { text: "Hôm nay", color: "text-orange-500" };
    if (days === 1) return { text: "Ngày mai", color: "text-yellow-500" };
    return { text: date.toLocaleDateString("vi-VN"), color: "text-gray-500" };
  };

  const dueInfo = formatDate(task.due_date);

  return (
    <div className={`group bg-white dark:bg-[#1a1f2e] rounded-xl p-4 shadow-sm border border-gray-200 dark:border-gray-700 hover:shadow-md transition-all ${task.status === "completed" ? "opacity-60" : ""}`}>
      <div className="flex items-start gap-3">
        <StatusButton 
          status={task.status} 
          onToggle={() => onStatusChange(task.id, nextStatus(task.status))} 
        />
        <div className="flex-1 min-w-0">
          <h3 className={`font-medium text-gray-900 dark:text-white ${task.status === "completed" ? "line-through" : ""}`}>
            {task.title}
          </h3>
          {task.description && (
            <p className="mt-1 text-sm text-gray-500 dark:text-gray-400 line-clamp-2">
              {task.description}
            </p>
          )}
          <div className="mt-2 flex flex-wrap items-center gap-2">
            <PriorityBadge priority={task.priority} />
            {dueInfo && (
              <span className={`inline-flex items-center gap-1 text-xs ${dueInfo.color}`}>
                <Calendar className="w-3 h-3" />
                {dueInfo.text}
              </span>
            )}
            {task.email_id && (
              <span className="inline-flex items-center gap-1 text-xs text-blue-500 dark:text-blue-400">
                <span className="material-symbols-outlined text-sm">mail</span>
                Từ email
              </span>
            )}
          </div>
        </div>
        <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
          <button
            onClick={() => onEdit(task)}
            className="p-1.5 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-lg transition-colors"
            title="Chỉnh sửa"
          >
            <Edit3 className="w-4 h-4 text-gray-400" />
          </button>
          <button
            onClick={() => onDelete(task.id)}
            className="p-1.5 hover:bg-red-50 dark:hover:bg-red-900/20 rounded-lg transition-colors"
            title="Xóa"
          >
            <Trash2 className="w-4 h-4 text-red-400" />
          </button>
        </div>
      </div>
    </div>
  );
}

// Create/Edit Task Modal
function TaskModal({
  isOpen,
  onClose,
  onSave,
  task,
}: {
  isOpen: boolean;
  onClose: () => void;
  onSave: (data: { title: string; description: string; due_date?: string; priority: Priority; reminder_at?: string }) => void;
  task?: Task | null;
}) {
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [dueDate, setDueDate] = useState("");
  const [dueTime, setDueTime] = useState("");
  const [priority, setPriority] = useState<Priority>("medium");
  const [enableReminder, setEnableReminder] = useState(false);
  const [reminderMinutes, setReminderMinutes] = useState(60);

  useEffect(() => {
    if (task) {
      setTitle(task.title);
      setDescription(task.description || "");
      if (task.due_date) {
        const date = new Date(task.due_date);
        setDueDate(date.toISOString().split("T")[0]);
        setDueTime(date.toTimeString().slice(0, 5));
      }
      setPriority(task.priority);
      if (task.reminder_at) {
        setEnableReminder(true);
      }
    } else {
      setTitle("");
      setDescription("");
      setDueDate("");
      setDueTime("");
      setPriority("medium");
      setEnableReminder(false);
    }
  }, [task, isOpen]);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    let dueDateISO: string | undefined;
    let reminderAtISO: string | undefined;

    if (dueDate) {
      const dateTime = dueTime ? `${dueDate}T${dueTime}:00` : `${dueDate}T23:59:00`;
      dueDateISO = new Date(dateTime).toISOString();
      
      if (enableReminder) {
        const reminderDate = new Date(new Date(dateTime).getTime() - reminderMinutes * 60 * 1000);
        reminderAtISO = reminderDate.toISOString();
      }
    }

    onSave({ title, description, due_date: dueDateISO, priority, reminder_at: reminderAtISO });
    onClose();
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm animate-in fade-in">
      <div className="bg-white dark:bg-[#1a1f2e] rounded-2xl shadow-2xl w-full max-w-md mx-4 animate-in zoom-in-95">
        <div className="p-6">
          <h2 className="text-xl font-semibold text-gray-900 dark:text-white mb-4">
            {task ? "Chỉnh sửa Task" : "Tạo Task mới"}
          </h2>
          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                Tiêu đề *
              </label>
              <input
                type="text"
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                required
                className="w-full px-3 py-2 bg-gray-50 dark:bg-[#283039] border border-gray-300 dark:border-gray-600 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent text-gray-900 dark:text-white"
                placeholder="Nhập tiêu đề task..."
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                Mô tả
              </label>
              <textarea
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                rows={3}
                className="w-full px-3 py-2 bg-gray-50 dark:bg-[#283039] border border-gray-300 dark:border-gray-600 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent text-gray-900 dark:text-white resize-none"
                placeholder="Mô tả chi tiết..."
              />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                  Ngày hạn
                </label>
                <input
                  type="date"
                  value={dueDate}
                  onChange={(e) => setDueDate(e.target.value)}
                  className="w-full px-3 py-2 bg-gray-50 dark:bg-[#283039] border border-gray-300 dark:border-gray-600 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent text-gray-900 dark:text-white"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                  Giờ
                </label>
                <input
                  type="time"
                  value={dueTime}
                  onChange={(e) => setDueTime(e.target.value)}
                  className="w-full px-3 py-2 bg-gray-50 dark:bg-[#283039] border border-gray-300 dark:border-gray-600 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent text-gray-900 dark:text-white"
                />
              </div>
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                Độ ưu tiên
              </label>
              <div className="flex gap-2">
                {(["low", "medium", "high"] as Priority[]).map((p) => (
                  <button
                    key={p}
                    type="button"
                    onClick={() => setPriority(p)}
                    className={`flex-1 py-2 rounded-lg border-2 transition-colors ${
                      priority === p
                        ? p === "high"
                          ? "border-red-500 bg-red-50 dark:bg-red-900/20"
                          : p === "medium"
                          ? "border-yellow-500 bg-yellow-50 dark:bg-yellow-900/20"
                          : "border-green-500 bg-green-50 dark:bg-green-900/20"
                        : "border-gray-200 dark:border-gray-600"
                    }`}
                  >
                    <PriorityBadge priority={p} />
                  </button>
                ))}
              </div>
            </div>
            {dueDate && (
              <div className="flex items-center gap-3 p-3 bg-blue-50 dark:bg-blue-900/20 rounded-lg">
                <input
                  type="checkbox"
                  id="reminder"
                  checked={enableReminder}
                  onChange={(e) => setEnableReminder(e.target.checked)}
                  className="w-4 h-4 rounded"
                />
                <label htmlFor="reminder" className="text-sm text-gray-700 dark:text-gray-300">
                  Nhắc nhở trước
                </label>
                <select
                  value={reminderMinutes}
                  onChange={(e) => setReminderMinutes(Number(e.target.value))}
                  disabled={!enableReminder}
                  className="px-2 py-1 bg-white dark:bg-[#283039] border border-gray-300 dark:border-gray-600 rounded text-sm text-gray-900 dark:text-white disabled:opacity-50"
                >
                  <option value={15}>15 phút</option>
                  <option value={30}>30 phút</option>
                  <option value={60}>1 giờ</option>
                  <option value={120}>2 giờ</option>
                  <option value={1440}>1 ngày</option>
                </select>
              </div>
            )}
            <div className="flex gap-3 pt-2">
              <button
                type="button"
                onClick={onClose}
                className="flex-1 py-2.5 px-4 border border-gray-300 dark:border-gray-600 rounded-lg text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-700 transition-colors"
              >
                Hủy
              </button>
              <button
                type="submit"
                className="flex-1 py-2.5 px-4 bg-blue-600 hover:bg-blue-700 text-white rounded-lg font-medium transition-colors"
              >
                {task ? "Cập nhật" : "Tạo Task"}
              </button>
            </div>
          </form>
        </div>
      </div>
    </div>
  );
}

export default function TaskPage() {
  const navigate = useNavigate();
  const dispatch = useAppDispatch();
  const queryClient = useQueryClient();
  const { theme, toggleTheme } = useTheme();
  
  useFCM();

  const [tasks, setTasks] = useState<Task[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [statusFilter, setStatusFilter] = useState<TaskStatus | "all">("all");
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingTask, setEditingTask] = useState<Task | null>(null);

  const logoutMutation = useMutation({
    mutationFn: authService.logout,
    onSuccess: () => {
      dispatch(logout());
      queryClient.clear();
      navigate("/login");
    },
  });

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
  const handleSave = async (data: { title: string; description: string; due_date?: string; priority: Priority; reminder_at?: string }) => {
    try {
      if (editingTask) {
        const updated = await taskService.updateTask(editingTask.id, data);
        setTasks((prev) => prev.map((t) => (t.id === editingTask.id ? updated : t)));
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
          <button
            onClick={toggleTheme}
            className="p-2 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-lg transition-colors"
          >
            <span className="material-symbols-outlined text-gray-600 dark:text-gray-300">
              {theme === "dark" ? "light_mode" : "dark_mode"}
            </span>
          </button>
          <button
            onClick={() => logoutMutation.mutate()}
            className="p-2 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-lg transition-colors"
          >
            <span className="material-symbols-outlined text-gray-600 dark:text-gray-300">logout</span>
          </button>
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
            onChange={(e) => setStatusFilter(e.target.value as TaskStatus | "all")}
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
