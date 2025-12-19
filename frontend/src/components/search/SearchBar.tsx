import { useState, useEffect, useRef } from "react";
import { Search, X } from "lucide-react";
import { cn } from "@/lib/utils";
import { emailService } from "@/services/email.service";
import { useDebounce } from "@/hooks/useDebounce";

interface SearchBarProps {
  onSearch: (query: string) => void;
  onClear: () => void;
  isSearching?: boolean;
  placeholder?: string;
  className?: string;
  value?: string; // Controlled value - if provided, displays this value
  onChange?: (value: string) => void; // Optional onChange callback for controlled mode
  disableSuggestions?: boolean; // If true, don't fetch or show suggestions (e.g., when already on search page)
}

export default function SearchBar({
  onSearch,
  onClear,
  isSearching = false,
  placeholder = "Tìm kiếm email...",
  className,
  value: controlledValue,
  onChange,
  disableSuggestions = false,
}: SearchBarProps) {
  const [internalQuery, setInternalQuery] = useState(controlledValue || "");
  const [suggestions, setSuggestions] = useState<string[]>([]);
  const [showSuggestions, setShowSuggestions] = useState(false);
  const [selectedIndex, setSelectedIndex] = useState(-1);
  const [suggestionSelected, setSuggestionSelected] = useState(false); // Track if a suggestion was clicked
  const inputRef = useRef<HTMLInputElement>(null);
  const suggestionsRef = useRef<HTMLDivElement>(null);

  // Sync internal state when controlled value changes from outside (not from user input)
  useEffect(() => {
    if (controlledValue !== undefined) {
      setInternalQuery(controlledValue);
    }
  }, [controlledValue]);

  // Use controlled value if provided, otherwise use internal state
  const query = controlledValue !== undefined ? controlledValue : internalQuery;

  // Debounce query for API calls
  const debouncedQuery = useDebounce(query, 1000);

  // Fetch suggestions when debounced query changes (only if suggestions are enabled)
  useEffect(() => {
    // Don't fetch suggestions if disabled (e.g., already on search page)
    if (disableSuggestions) {
      setSuggestions([]);
      setShowSuggestions(false);
      return;
    }

    // Don't fetch suggestions if a suggestion was recently selected
    if (suggestionSelected) {
      return;
    }

    if (!debouncedQuery || debouncedQuery.trim().length < 2) {
      setSuggestions([]);
      setShowSuggestions(false);
      return;
    }

    const fetchSuggestions = async () => {
      try {
        const trimmedQuery = debouncedQuery.trim();
        const results = await emailService.getSearchSuggestions(trimmedQuery);
        setSuggestions(results);
        setShowSuggestions(results.length > 0);
        setSelectedIndex(-1);
      } catch (error) {
        console.error("Failed to fetch suggestions:", error);
        setSuggestions([]);
        setShowSuggestions(false);
      }
    };

    fetchSuggestions();
  }, [debouncedQuery, suggestionSelected, disableSuggestions]);

  // Close suggestions when clicking outside
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (
        suggestionsRef.current &&
        !suggestionsRef.current.contains(event.target as Node) &&
        inputRef.current &&
        !inputRef.current.contains(event.target as Node)
      ) {
        setShowSuggestions(false);
      }
    };

    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (query.trim()) {
      setShowSuggestions(false);
      onSearch(query.trim());
    }
  };

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const newValue = e.target.value;
    setInternalQuery(newValue);
    // Reset suggestion selected flag when user manually types (value decreases or changes differently)
    // This allows fetching suggestions again when user starts typing something new
    if (suggestionSelected) {
      setSuggestionSelected(false);
    }
    // If onChange callback provided, notify parent (for controlled mode)
    if (onChange) {
      onChange(newValue);
    }
  };

  const handleClear = () => {
    setInternalQuery("");
    setSuggestions([]);
    setShowSuggestions(false);
    setSuggestionSelected(false); // Reset suggestion selected flag
    onClear();
  };

  const handleSuggestionClick = (suggestion: string) => {
    // Mark suggestion as selected to prevent fetching suggestions again
    setSuggestionSelected(true);
    // Clear and hide suggestions immediately
    setSuggestions([]);
    setShowSuggestions(false);
    // Update query
    setInternalQuery(suggestion);
    if (onChange) {
      onChange(suggestion);
    }
    // Trigger search (will navigate to search page if not already there)
    onSearch(suggestion);
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Escape") {
      setShowSuggestions(false);
      handleClear();
    } else if (e.key === "ArrowDown") {
      e.preventDefault();
      if (showSuggestions && suggestions.length > 0) {
        setSelectedIndex((prev) =>
          prev < suggestions.length - 1 ? prev + 1 : prev
        );
      }
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      if (showSuggestions && suggestions.length > 0) {
        setSelectedIndex((prev) => (prev > 0 ? prev - 1 : -1));
      }
    } else if (e.key === "Enter" && selectedIndex >= 0) {
      e.preventDefault();
      handleSuggestionClick(suggestions[selectedIndex]);
    }
  };

  // Highlight matching words in suggestion text
  const highlightText = (text: string, query: string): React.ReactNode => {
    if (!query || query.trim().length === 0) {
      return text;
    }

    // Split query into words and remove empty strings
    const queryWords = query.trim().toLowerCase().split(/\s+/).filter(w => w.length > 0);
    if (queryWords.length === 0) {
      return text;
    }

    const textLower = text.toLowerCase();
    
    // Find all matches and their positions (allow substring matches, not just whole words)
    const matches: Array<{ start: number; end: number }> = [];
    queryWords.forEach((word) => {
      if (word.length === 0) return;
      
      let startIndex = 0;
      while (startIndex < textLower.length) {
        const index = textLower.indexOf(word, startIndex);
        if (index === -1) break;
        
        // Allow substring matches (like "local" in "LocalStack")
        matches.push({ start: index, end: index + word.length });
        startIndex = index + 1;
      }
    });

    if (matches.length === 0) {
      return text;
    }

    // Sort matches by start position
    matches.sort((a, b) => a.start - b.start);

    // Merge overlapping or adjacent matches
    const mergedMatches: Array<{ start: number; end: number }> = [];
    for (const match of matches) {
      if (mergedMatches.length === 0) {
        mergedMatches.push(match);
      } else {
        const last = mergedMatches[mergedMatches.length - 1];
        if (match.start <= last.end) {
          // Overlapping or adjacent, merge them
          last.end = Math.max(last.end, match.end);
        } else {
          mergedMatches.push(match);
        }
      }
    }

    // Build highlighted text
    const parts: React.ReactNode[] = [];
    let lastIndex = 0;

    mergedMatches.forEach((match, idx) => {
      // Add text before match
      if (match.start > lastIndex) {
        parts.push(text.substring(lastIndex, match.start));
      }
      // Add highlighted match
      parts.push(
        <span key={`${match.start}-${idx}`} className="font-semibold text-blue-600 dark:text-blue-400">
          {text.substring(match.start, match.end)}
        </span>
      );
      lastIndex = match.end;
    });

    // Add remaining text
    if (lastIndex < text.length) {
      parts.push(text.substring(lastIndex));
    }

    return <>{parts}</>;
  };

  return (
    <div className={cn("relative flex-1 max-w-md", className)}>
      <form onSubmit={handleSubmit} className="relative flex items-center">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400 z-10" />
        <input
          ref={inputRef}
          type="text"
          value={query}
          onChange={handleChange}
          onKeyDown={handleKeyDown}
          onFocus={() => {
            if (suggestions.length > 0) {
              setShowSuggestions(true);
            }
          }}
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
            className="absolute right-3 top-1/2 -translate-y-1/2 p-0.5 rounded-full hover:bg-gray-200 dark:hover:bg-gray-700 z-10"
          >
            <X className="h-4 w-4 text-gray-500" />
          </button>
        )}
      </form>

      {/* Suggestions Dropdown */}
      {showSuggestions && suggestions.length > 0 && (
        <div
          ref={suggestionsRef}
          className={cn(
            "absolute top-full left-0 right-0 mt-1 z-50",
            "bg-white dark:bg-gray-800",
            "border border-gray-200 dark:border-gray-700",
            "rounded-lg shadow-lg",
            "max-h-60 overflow-y-auto"
          )}
        >
          {suggestions.map((suggestion, index) => (
            <button
              key={index}
              type="button"
              onClick={() => handleSuggestionClick(suggestion)}
              className={cn(
                "w-full text-left px-4 py-2 text-sm",
                "hover:bg-gray-100 dark:hover:bg-gray-700",
                "transition-colors",
                selectedIndex === index &&
                  "bg-blue-50 dark:bg-blue-900/30 text-blue-600 dark:text-blue-400"
              )}
            >
              {highlightText(suggestion, debouncedQuery)}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
