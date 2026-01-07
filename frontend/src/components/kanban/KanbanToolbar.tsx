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
    <div className="hidden lg:flex items-center gap-2 pr-4 bg-white dark:bg-[#0f1724]">
      <div className="flex-1">
        <KanbanFilters
          sortBy={sortBy}
          onSortChange={onSortChange}
          filters={filters}
          onFilterChange={onFilterChange}
          snoozedCount={snoozedCount}
          onSnoozedClick={onSnoozedClick}
        />
      </div>
      <button
        onClick={onSearchClick}
        className="flex items-center gap-2 px-3 py-1.5 text-sm text-gray-600 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-lg transition-colors"
        title="Search emails"
      >
        <Search className="h-4 w-4" />
        <span className="hidden xl:inline">Tìm kiếm</span>
      </button>
      <button
        onClick={onSettingsClick}
        className="flex items-center gap-2 px-3 py-1.5 text-sm text-gray-600 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-lg transition-colors"
        title="Kanban Settings"
      >
        <Settings className="h-4 w-4" />
        <span className="hidden xl:inline">Cài đặt cột</span>
      </button>
    </div>
  );
}
