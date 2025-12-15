import { ChevronDown } from "lucide-react";

export type SortOption = "newest" | "oldest";
export type FilterState = {
  unreadOnly: boolean;
  withAttachments: boolean;
};

interface KanbanFiltersProps {
  sortBy: SortOption;
  onSortChange: (sort: SortOption) => void;
  filters: FilterState;
  onFilterChange: (filters: FilterState) => void;
}

export default function KanbanFilters({
  sortBy,
  onSortChange,
  filters,
  onFilterChange,
}: KanbanFiltersProps) {
  return (
    <div className="flex items-center gap-3 px-4 py-2 border-b border-gray-200 dark:border-gray-700 bg-white dark:bg-[#1a1f2e]">
      {/* Sort Dropdown */}
      <div className="relative">
        <select
          value={sortBy}
          onChange={(e) => onSortChange(e.target.value as SortOption)}
          className="appearance-none pl-3 pr-8 py-1.5 rounded-lg text-sm
            bg-gray-100 dark:bg-gray-800 
            text-gray-700 dark:text-gray-300
            border border-gray-200 dark:border-gray-700
            hover:bg-gray-200 dark:hover:bg-gray-700
            focus:outline-none focus:ring-2 focus:ring-blue-500/20
            cursor-pointer transition-colors"
        >
          <option value="newest">📅 Mới nhất</option>
          <option value="oldest">📅 Cũ nhất</option>
        </select>
        <ChevronDown className="absolute right-2 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-500 pointer-events-none" />
      </div>

      {/* Filter Toggle: Unread Only */}
      <label className="flex items-center gap-2 cursor-pointer">
        <input
          type="checkbox"
          checked={filters.unreadOnly}
          onChange={(e) =>
            onFilterChange({ ...filters, unreadOnly: e.target.checked })
          }
          className="w-4 h-4 rounded border-gray-300 dark:border-gray-600 
            text-blue-600 focus:ring-blue-500 focus:ring-offset-0
            bg-gray-100 dark:bg-gray-800"
        />
        <span className="text-sm text-gray-700 dark:text-gray-300">
          Chưa đọc
        </span>
      </label>

      {/* Filter Toggle: With Attachments */}
      <label className="flex items-center gap-2 cursor-pointer">
        <input
          type="checkbox"
          checked={filters.withAttachments}
          onChange={(e) =>
            onFilterChange({ ...filters, withAttachments: e.target.checked })
          }
          className="w-4 h-4 rounded border-gray-300 dark:border-gray-600 
            text-blue-600 focus:ring-blue-500 focus:ring-offset-0
            bg-gray-100 dark:bg-gray-800"
        />
        <span className="text-sm text-gray-700 dark:text-gray-300">
          📎 Có tệp đính kèm
        </span>
      </label>

      {/* Clear Filters */}
      {(filters.unreadOnly || filters.withAttachments) && (
        <button
          onClick={() => onFilterChange({ unreadOnly: false, withAttachments: false })}
          className="text-sm text-blue-600 dark:text-blue-400 hover:underline ml-auto"
        >
          Xóa bộ lọc
        </button>
      )}
    </div>
  );
}
