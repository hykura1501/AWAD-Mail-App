import { Calendar, Edit3, Trash2 } from "lucide-react";
import type { Task, TaskStatus } from "@/types/task";
import { PriorityBadge } from "./PriorityBadge";
import { StatusButton } from "./StatusButton";

interface TaskCardProps {
  task: Task;
  onStatusChange: (taskId: string, status: TaskStatus) => void;
  onDelete: (taskId: string) => void;
  onEdit: (task: Task) => void;
}

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

export function TaskCard({ task, onStatusChange, onDelete, onEdit }: TaskCardProps) {
  const dueInfo = formatDate(task.due_date);

  return (
    <div
      className={`group bg-white dark:bg-[#1a1f2e] rounded-xl p-4 shadow-sm border border-gray-200 dark:border-gray-700 hover:shadow-md transition-all ${
        task.status === "completed" ? "opacity-60" : ""
      }`}
    >
      <div className="flex items-start gap-3">
        <StatusButton
          status={task.status}
          onToggle={() => onStatusChange(task.id, nextStatus(task.status))}
        />
        <div className="flex-1 min-w-0">
          <h3
            className={`font-medium text-gray-900 dark:text-white ${
              task.status === "completed" ? "line-through" : ""
            }`}
          >
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
                <span className="material-symbols-outlined text-sm">email</span>
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

export default TaskCard;
