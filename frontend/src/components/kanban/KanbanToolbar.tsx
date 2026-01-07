import KanbanFilters, { type SortOption, type FilterState } from "./KanbanFilters";
import { Settings, Search } from "lucide-react";

interface KanbanToolbarProps {
  sortBy: SortOption;
  onSortChange: (sort: SortOption) => void;
  filters: FilterState;
  onFilterChange: (filters: FilterState) => void;
  snoozedCount: number;
  onSnoozedClick: () => void;
  onSearchClick: () => void;
  onSettingsClick: () => void;
}

export default function KanbanToolbar({
  sortBy,
  onSortChange,
  filters,
  onFilterChange,
  snoozedCount,
  onSnoozedClick,
  onSearchClick,
  onSettingsClick,
}: KanbanToolbarProps) {
  return (
    <div className="flex items-center gap-2 px-3 py-2 bg-white dark:bg-[#0f1724] border-b border-gray-200 dark:border-gray-700 overflow-x-auto">
      {/* Filters - scrollable container on mobile */}
      <div className="flex-1 min-w-0">
        <KanbanFilters
          sortBy={sortBy}
          onSortChange={onSortChange}
          filters={filters}
          onFilterChange={onFilterChange}
          snoozedCount={snoozedCount}
          onSnoozedClick={onSnoozedClick}
        />
      </div>
      
      {/* Action buttons - always visible */}
      <div className="flex items-center gap-1 shrink-0">
        <button
          onClick={onSearchClick}
          className="flex items-center justify-center w-9 h-9 lg:w-auto lg:h-auto lg:gap-2 lg:px-3 lg:py-1.5 text-sm text-gray-600 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-lg transition-colors"
          title="Tìm kiếm"
        >
          <Search className="h-4 w-4" />
          <span className="hidden lg:inline">Tìm kiếm</span>
        </button>
        <button
          onClick={onSettingsClick}
          className="flex items-center justify-center w-9 h-9 lg:w-auto lg:h-auto lg:gap-2 lg:px-3 lg:py-1.5 text-sm text-gray-600 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-lg transition-colors"
          title="Cài đặt cột"
        >
          <Settings className="h-4 w-4" />
          <span className="hidden lg:inline">Cài đặt cột</span>
        </button>
      </div>
    </div>
  );
}

