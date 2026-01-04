import { Circle, Clock, CheckCircle2 } from "lucide-react";
import type { TaskStatus } from "@/types/task";

interface StatusButtonProps {
  status: TaskStatus;
  onToggle: () => void;
}

const icons = {
  pending: <Circle className="w-5 h-5 text-gray-400" />,
  in_progress: <Clock className="w-5 h-5 text-blue-500" />,
  completed: <CheckCircle2 className="w-5 h-5 text-green-500" />,
};

export function StatusButton({ status, onToggle }: StatusButtonProps) {
  return (
    <button
      onClick={onToggle}
      className="hover:scale-110 transition-transform"
      title="Thay đổi trạng thái"
    >
      {icons[status]}
    </button>
  );
}

export default StatusButton;
