import { useState, useEffect } from "react";
import { useQuery } from "@tanstack/react-query";
import { X } from "lucide-react";
import SearchBar, { type SearchMode } from "./SearchBar";
import SearchResultsView from "./SearchResultsView";
import { emailService } from "@/services/email.service";
import { cn } from "@/lib/utils";

const ITEMS_PER_PAGE = 20;

interface SearchModalProps {
  isOpen: boolean;
  onClose: () => void;
  onEmailClick: (emailId: string) => void;
}

export default function SearchModal({
  isOpen,
  onClose,
  onEmailClick,
}: SearchModalProps) {
  const [query, setQuery] = useState("");
  const [searchQuery, setSearchQuery] = useState("");
  const [searchMode, setSearchMode] = useState<SearchMode>("semantic");
  const [currentPage, setCurrentPage] = useState(1);

  const offset = (currentPage - 1) * ITEMS_PER_PAGE;

  // Debounce search query
  useEffect(() => {
    const timer = setTimeout(() => {
      setSearchQuery(query);
      setCurrentPage(1);
    }, 500);

    return () => clearTimeout(timer);
  }, [query]);

  // Reset state when modal closes
  useEffect(() => {
    if (!isOpen) {
      setQuery("");
      setSearchQuery("");
      setCurrentPage(1);
    }
  }, [isOpen]);

  // Fetch search results based on mode
  const { data, isLoading, error } = useQuery({
    queryKey: ["searchEmails", searchQuery, searchMode, ITEMS_PER_PAGE, offset],
    queryFn: () => {
      if (searchMode === "semantic") {
        return emailService.semanticSearch(searchQuery, ITEMS_PER_PAGE, offset);
      } else {
        return emailService.fuzzySearch(searchQuery, ITEMS_PER_PAGE, offset);
      }
    },
    enabled: isOpen && searchQuery.trim().length > 0,
  });

  const total = data?.total ?? 0;
  const totalPages = total > 0 ? Math.ceil(total / ITEMS_PER_PAGE) : 0;

  const handleSearch = (value: string, mode: SearchMode) => {
    setQuery(value.trim());
    setSearchMode(mode);
  };

  const handleSearchChange = (value: string) => {
    setQuery(value);
  };

  const handleClear = () => {
    setQuery("");
    setSearchQuery("");
    setCurrentPage(1);
  };

  const handleEmailClick = (emailId: string) => {
    onEmailClick(emailId);
    onClose();
  };

  const handlePageChange = (newPage: number) => {
    if (newPage < 1 || (totalPages && newPage > totalPages)) return;
    setCurrentPage(newPage);
  };

  // Close on escape key
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape" && isOpen) {
        onClose();
      }
    };

    document.addEventListener("keydown", handleKeyDown);
    return () => document.removeEventListener("keydown", handleKeyDown);
  }, [isOpen, onClose]);

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center pt-20">
      {/* Backdrop */}
      <div
        className="absolute inset-0 bg-black/50 backdrop-blur-sm"
        onClick={onClose}
      />

      {/* Modal */}
      <div
        className={cn(
          "relative w-full max-w-2xl max-h-[80vh] mx-4",
          "bg-white dark:bg-gray-900",
          "rounded-xl shadow-2xl",
          "flex flex-col overflow-hidden",
          "animate-in fade-in zoom-in-95 duration-200"
        )}
      >
        {/* Header */}
        <div className="flex items-center gap-3 px-4 py-3 border-b border-gray-200 dark:border-gray-800">
          <div className="flex-1">
            <SearchBar
              value={query}
              onChange={handleSearchChange}
              onSearch={handleSearch}
              onClear={handleClear}
              isSearching={isLoading}
              placeholder="Tìm kiếm email..."
              className="w-full"
              disableSuggestions={true}
              searchMode={searchMode}
              onSearchModeChange={setSearchMode}
            />
          </div>
          <button
            onClick={onClose}
            className="p-2 rounded-full hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors"
          >
            <X className="h-5 w-5 text-gray-500 dark:text-gray-400" />
          </button>
        </div>

        {/* Results */}
        <div className="flex-1 overflow-auto">
          <SearchResultsView
            query={searchQuery}
            results={data?.emails || []}
            isLoading={isLoading}
            error={error ? "Không thể tìm kiếm. Vui lòng thử lại." : null}
            onBack={onClose}
            onEmailClick={handleEmailClick}
          />
        </div>

        {/* Pagination footer */}
        {searchQuery && total > 0 && (
          <div className="px-4 py-2 border-t border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-900 text-xs text-gray-600 dark:text-gray-400 flex items-center justify-between">
            <span>
              {offset + 1}-{Math.min(offset + ITEMS_PER_PAGE, total)} của {total}
            </span>
            <div className="flex items-center gap-1">
              <button
                className="h-8 w-8 flex items-center justify-center rounded hover:bg-gray-100 dark:hover:bg-gray-800 disabled:opacity-40"
                onClick={() => handlePageChange(currentPage - 1)}
                disabled={currentPage <= 1}
              >
                <span className="material-symbols-outlined text-lg">
                  chevron_left
                </span>
              </button>
              <span className="px-1">
                {currentPage}/{totalPages || 1}
              </span>
              <button
                className="h-8 w-8 flex items-center justify-center rounded hover:bg-gray-100 dark:hover:bg-gray-800 disabled:opacity-40"
                onClick={() => handlePageChange(currentPage + 1)}
                disabled={totalPages === 0 || currentPage >= totalPages}
              >
                <span className="material-symbols-outlined text-lg">
                  chevron_right
                </span>
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
