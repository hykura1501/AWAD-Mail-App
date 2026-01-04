import type { KanbanColumn } from "./KanbanBoard";

interface MobileColumnTabsProps {
  columns: KanbanColumn[];
  selectedColumn: string;
  onSelectColumn: (columnId: string) => void;
}

export default function MobileColumnTabs({
  columns,
  selectedColumn,
  onSelectColumn,
}: MobileColumnTabsProps) {
  return (
    <div className="flex gap-1 p-2 bg-white dark:bg-[#1a1f2e] border-b border-gray-200 dark:border-gray-700 overflow-x-auto">
      {columns.map((col) => (
        <button
          key={col.id}
          onClick={() => onSelectColumn(col.id)}
          className={`px-4 py-2 rounded-lg text-sm font-medium whitespace-nowrap transition-all ${
            selectedColumn === col.id
              ? "bg-blue-600 text-white shadow-md"
              : "bg-gray-100 dark:bg-gray-800 text-gray-700 dark:text-gray-300 hover:bg-gray-200 dark:hover:bg-gray-700"
          }`}
        >
          {col.title}
          {col.emails.length > 0 && (
            <span className="ml-2 px-1.5 py-0.5 rounded-full text-xs bg-white/20">
              {col.emails.length}
            </span>
          )}
        </button>
      ))}
    </div>
  );
}
