import { useState, useEffect } from "react";
import type { Task, Priority } from "@/types/task";
import { PriorityBadge } from "./PriorityBadge";

interface TaskModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSave: (data: {
    title: string;
    description: string;
    due_date?: string;
    priority: Priority;
    reminder_at?: string;
  }) => void;
  task?: Task | null;
}

export function TaskModal({ isOpen, onClose, onSave, task }: TaskModalProps) {
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
        const reminderDate = new Date(
          new Date(dateTime).getTime() - reminderMinutes * 60 * 1000
        );
        reminderAtISO = reminderDate.toISOString();
      }
    }

    onSave({
      title,
      description,
      due_date: dueDateISO,
      priority,
      reminder_at: reminderAtISO,
    });
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
                <label
                  htmlFor="reminder"
                  className="text-sm text-gray-700 dark:text-gray-300"
                >
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

export default TaskModal;
