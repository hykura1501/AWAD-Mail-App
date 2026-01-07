import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Clock } from "lucide-react";

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
  snoozedCount?: number;
  onSnoozedClick?: () => void;
}

export default function KanbanFilters({
  sortBy,
  onSortChange,
  filters,
  onFilterChange,
  snoozedCount = 0,
  onSnoozedClick,
}: KanbanFiltersProps) {
  return (
    <div className="flex items-center gap-3 px-4 py-1.5 bg-white dark:bg-[#0f1724]">
      {/* Sort segmented control (pill-shaped) */}
      <div className="flex items-center gap-0 rounded-full border bg-transparent overflow-hidden shadow-sm">
          <Button
              size="sm"
              variant={sortBy === "newest" ? "default" : "ghost"}
              onClick={() => onSortChange("newest")}
              aria-pressed={sortBy === "newest"}
              title="Sắp xếp: Mới nhất"
              className="rounded-none first:rounded-l-full last:rounded-r-full px-3"
          >
              <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 3l1.5 3L17 8l-3 1.5L12 13l-1.5-3L7 8l3-1.5L12 3z"/>
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M5 13l.8 1.6L7.5 16l-1.7.4L5 18l-.8-1.6L2.5 16l1.7-.4L5 13z"/>
              </svg>
              <span className="ml-2">Mới nhất</span>
          </Button>

          <Button
              size="sm"
              variant={sortBy === "oldest" ? "default" : "ghost"}
              onClick={() => onSortChange("oldest")}
              aria-pressed={sortBy === "oldest"}
              title="Sắp xếp: Cũ nhất"
              className="rounded-none first:rounded-l-full last:rounded-r-full px-3"
          >
              <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor">
                  <circle cx="12" cy="12" r="9" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 7v5l3 2"/>
              </svg>
              <span className="ml-2">Cũ nhất</span>
          </Button>

      </div>

      {/* Filter Toggles as buttons for a modern look */}
      <div className="flex items-center gap-2">
        <Label className="sr-only">Filters</Label>
        <Button
          size="sm"
          variant={filters.unreadOnly ? "default" : "ghost"}
          onClick={() => onFilterChange({ ...filters, unreadOnly: !filters.unreadOnly })}
          aria-pressed={filters.unreadOnly}
          title="Chỉ hiển thị thư chưa đọc"
        >
          <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M3 8l7.89 5.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z"/>
          </svg>
          <span className="hidden sm:inline">Chưa đọc</span>
        </Button>

        <Button
          size="sm"
          variant={filters.withAttachments ? "default" : "ghost"}
          onClick={() => onFilterChange({ ...filters, withAttachments: !filters.withAttachments })}
          aria-pressed={filters.withAttachments}
          title="Có tệp đính kèm"
        >
          <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M21.44 11.05l-9.19 9.19a5 5 0 01-7.07 0 5 5 0 010-7.07l9.19-9.19a3.5 3.5 0 014.95 4.95L9.12 18.07a2 2 0 01-2.83 0 2 2 0 010-2.83l8.49-8.49"/>
          </svg>
          <span className="hidden sm:inline">Có tệp</span>
        </Button>
      </div>

      {/* Spacer and Clear Filters */}
      <div className="ml-auto flex items-center gap-2">
        {(filters.unreadOnly || filters.withAttachments) && (
          <Button
            size="sm"
            variant="link"
            onClick={() => onFilterChange({ unreadOnly: false, withAttachments: false })}
          >
            Xóa bộ lọc
          </Button>
        )}

        {/* Snoozed Button */}
        <Button
          size="sm"
          variant="outline"
          onClick={onSnoozedClick}
          className="relative gap-2 border-orange-200 dark:border-orange-800/50 text-orange-600 dark:text-orange-400 hover:bg-orange-50 dark:hover:bg-orange-900/20"
          title="Xem email đã tạm ẩn"
        >
          <Clock className="h-4 w-4" />
          <span className="hidden sm:inline">Snoozed</span>
          {snoozedCount > 0 && (
            <span className="absolute -top-1.5 -right-1.5 min-w-[18px] h-[18px] flex items-center justify-center rounded-full bg-orange-500 text-white text-[10px] font-bold px-1">
              {snoozedCount > 99 ? "99+" : snoozedCount}
            </span>
          )}
        </Button>
      </div>
    </div>
  );
}

