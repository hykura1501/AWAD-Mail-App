import type { Priority } from "@/types/task";

interface PriorityBadgeProps {
  priority: Priority;
}

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

const labels = {
  high: "Cao",
  medium: "Trung bình",
  low: "Thấp",
};

export function PriorityBadge({ priority }: PriorityBadgeProps) {
  return (
    <span
      className={`inline-flex items-center gap-1 px-2 py-0.5 text-xs font-medium rounded-full ${colors[priority]}`}
    >
      <span>{icons[priority]}</span>
      {labels[priority]}
    </span>
  );
}

export default PriorityBadge;
