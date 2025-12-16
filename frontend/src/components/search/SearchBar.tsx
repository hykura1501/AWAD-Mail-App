import { useState, useEffect } from "react";
import { Search, X } from "lucide-react";
import { cn } from "@/lib/utils";

interface SearchBarProps {
  onSearch: (query: string) => void;
  onClear: () => void;
  isSearching?: boolean;
  placeholder?: string;
  className?: string;
  value?: string; // Controlled value - if provided, displays this value
  onChange?: (value: string) => void; // Optional onChange callback for controlled mode
}

export default function SearchBar({
  onSearch,
  onClear,
  isSearching = false,
  placeholder = "Tìm kiếm email...",
  className,
  value: controlledValue,
  onChange,
}: SearchBarProps) {
  const [internalQuery, setInternalQuery] = useState(controlledValue || "");

  // Sync internal state when controlled value changes from outside (not from user input)
  useEffect(() => {
    if (controlledValue !== undefined) {
      setInternalQuery(controlledValue);
    }
  }, [controlledValue]);

  // Use controlled value if provided, otherwise use internal state
  const query = controlledValue !== undefined ? controlledValue : internalQuery;

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (query.trim()) {
      onSearch(query.trim());
    }
  };

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const newValue = e.target.value;
    setInternalQuery(newValue);
    // If onChange callback provided, notify parent (for controlled mode)
    if (onChange) {
      onChange(newValue);
    }
  };

  const handleClear = () => {
    setInternalQuery("");
    onClear();
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Escape") {
      handleClear();
    }
  };

  return (
    <form
      onSubmit={handleSubmit}
      className={cn(
        "relative flex items-center",
        className
      )}
    >
      <div className="relative flex-1 max-w-md">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
        <input
          type="text"
          value={query}
          onChange={handleChange}
          onKeyDown={handleKeyDown}
          placeholder={placeholder}
          disabled={isSearching}
          className={cn(
            "w-full pl-10 pr-10 py-2 rounded-full",
            "bg-gray-100 dark:bg-gray-800",
            "border border-transparent",
            "focus:border-blue-500 focus:bg-white dark:focus:bg-gray-900",
            "text-sm text-gray-900 dark:text-white",
            "placeholder:text-gray-500 dark:placeholder:text-gray-400",
            "transition-all duration-200",
            "focus:outline-none focus:ring-2 focus:ring-blue-500/20"
          )}
        />
        {query && (
          <button
            type="button"
            onClick={handleClear}
            className="absolute right-3 top-1/2 -translate-y-1/2 p-0.5 rounded-full hover:bg-gray-200 dark:hover:bg-gray-700"
          >
            <X className="h-4 w-4 text-gray-500" />
          </button>
        )}
      </div>
    </form>
  );
}
