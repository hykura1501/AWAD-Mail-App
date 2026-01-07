import { useState, useEffect, useRef } from "react";
import { Search, X, ChevronDown } from "lucide-react";
import { cn } from "@/lib/utils";
import { emailService } from "@/services/email.service";
import { useDebounce } from "@/hooks/useDebounce";
import { getLocalSuggestions } from "@/lib/db";

export type SearchMode = "semantic" | "fuzzy";

interface SearchBarProps {
  onSearch: (query: string, mode: SearchMode) => void;
  onClear: () => void;
  isSearching?: boolean;
  placeholder?: string;
  className?: string;
  value?: string; // Controlled value - if provided, displays this value
  onChange?: (value: string) => void; // Optional onChange callback for controlled mode
  disableSuggestions?: boolean; // If true, don't fetch or show suggestions (e.g., when already on search page)
  searchMode?: SearchMode; // Controlled search mode
  onSearchModeChange?: (mode: SearchMode) => void; // Callback when mode changes
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
  searchMode: controlledSearchMode,
  onSearchModeChange,
}: SearchBarProps) {
  const [internalQuery, setInternalQuery] = useState(controlledValue || "");
  const [suggestions, setSuggestions] = useState<string[]>([]);
  const [showSuggestions, setShowSuggestions] = useState(false);
  const [selectedIndex, setSelectedIndex] = useState(-1);
  const [suggestionSelected, setSuggestionSelected] = useState(false);
  const [internalSearchMode, setInternalSearchMode] = useState<SearchMode>("semantic");
  const [showModeDropdown, setShowModeDropdown] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const suggestionsRef = useRef<HTMLDivElement>(null);
  const modeDropdownRef = useRef<HTMLDivElement>(null);

  // Use controlled mode if provided, otherwise use internal state
  const searchMode = controlledSearchMode !== undefined ? controlledSearchMode : internalSearchMode;

  // Sync internal state when controlled value changes from outside (not from user input)
  useEffect(() => {
    if (controlledValue !== undefined) {
      setInternalQuery(controlledValue);
    }
  }, [controlledValue]);

  // Use controlled value if provided, otherwise use internal state
  const query = controlledValue !== undefined ? controlledValue : internalQuery;

  // Debounce query for API calls (reduced from 1000ms to 300ms for faster response)
  const debouncedQuery = useDebounce(query, 300);

  // Hybrid suggestions: fetch from IndexedDB (instant) + backend API (async)
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

    const trimmedQuery = debouncedQuery.trim();
    let isCancelled = false;

    const fetchHybridSuggestions = async () => {
      try {
        // 1. Get local suggestions from IndexedDB (instant)
        const localSuggestions = await getLocalSuggestions(trimmedQuery, 5);
        
        if (!isCancelled && localSuggestions.length > 0) {
          // Show local suggestions immediately
          setSuggestions(localSuggestions);
          setShowSuggestions(true);
          setSelectedIndex(-1);
        }

        // 2. Also fetch from backend API (async, may take longer)
        try {
          const apiSuggestions = await emailService.getSearchSuggestions(trimmedQuery);
          
          if (!isCancelled) {
            // Merge and dedupe: local first, then API
            const merged = [...localSuggestions];
            const seen = new Set(localSuggestions.map(s => s.toLowerCase()));
            
            for (const suggestion of apiSuggestions) {
              if (!seen.has(suggestion.toLowerCase())) {
                merged.push(suggestion);
                seen.add(suggestion.toLowerCase());
              }
            }
            
            // Limit to 7 suggestions total
            const finalSuggestions = merged.slice(0, 7);
            setSuggestions(finalSuggestions);
            setShowSuggestions(finalSuggestions.length > 0);
            setSelectedIndex(-1);
          }
        } catch (apiError) {
          // API failed, but we still have local suggestions
          console.warn("Backend suggestions failed, using local only:", apiError);
        }
      } catch (error) {
        console.error("Failed to fetch suggestions:", error);
        if (!isCancelled) {
          setSuggestions([]);
          setShowSuggestions(false);
        }
      }
    };

    fetchHybridSuggestions();

    return () => {
      isCancelled = true;
    };
  }, [debouncedQuery, suggestionSelected, disableSuggestions]);

  // Close suggestions and mode dropdown when clicking outside
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
      // Close mode dropdown if clicking outside
      if (
        modeDropdownRef.current &&
        !modeDropdownRef.current.contains(event.target as Node)
      ) {
        setShowModeDropdown(false);
      }
    };

    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  const handleModeChange = (newMode: SearchMode) => {
    if (controlledSearchMode === undefined) {
      setInternalSearchMode(newMode);
    }
    if (onSearchModeChange) {
      onSearchModeChange(newMode);
    }
    setShowModeDropdown(false);
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (query.trim()) {
      setShowSuggestions(false);
      setShowModeDropdown(false);
      onSearch(query.trim(), searchMode);
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
    onSearch(suggestion, searchMode);
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

  const modeConfig = {
    semantic: { label: "AI Semantic", icon: "✨", description: "Tìm kiếm theo ngữ nghĩa" },
    fuzzy: { label: "Exact Match", icon: "🔤", description: "Tìm kiếm chính xác" },
  };

  return (
    <div className={cn("relative flex-1 max-w-md", className)}>
      <div className="flex items-center gap-1">
        {/* Search Input */}
        <form onSubmit={handleSubmit} className="relative flex-1 flex items-center">
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
              "w-full pl-10 pr-10 py-2 rounded-l-full",
              "bg-gray-100 dark:bg-gray-800",
              "border border-transparent border-r-0",
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

        {/* Search Mode Dropdown */}
        <div className="relative" ref={modeDropdownRef}>
          <button
            type="button"
            onClick={() => setShowModeDropdown(!showModeDropdown)}
            className={cn(
              "flex items-center gap-1 px-3 py-2 rounded-r-full",
              "bg-gray-100 dark:bg-gray-800",
              "border border-transparent border-l-0",
              "hover:bg-gray-200 dark:hover:bg-gray-700",
              "text-xs font-medium text-gray-600 dark:text-gray-300",
              "transition-all duration-200",
              "whitespace-nowrap"
            )}
          >
            <span>{modeConfig[searchMode].icon}</span>
            <span className="hidden sm:inline">{modeConfig[searchMode].label}</span>
            <ChevronDown className={cn(
              "h-3 w-3 transition-transform duration-200",
              showModeDropdown && "rotate-180"
            )} />
          </button>

          {/* Mode Dropdown Menu */}
          {showModeDropdown && (
            <div className={cn(
              "absolute top-full right-0 mt-1 z-50",
              "bg-white dark:bg-gray-800",
              "border border-gray-200 dark:border-gray-700",
              "rounded-lg shadow-lg",
              "min-w-[180px] py-1"
            )}>
              {(["semantic", "fuzzy"] as SearchMode[]).map((mode) => (
                <button
                  key={mode}
                  type="button"
                  onClick={() => handleModeChange(mode)}
                  className={cn(
                    "w-full text-left px-3 py-2 text-sm",
                    "hover:bg-gray-100 dark:hover:bg-gray-700",
                    "transition-colors flex items-center gap-2",
                    searchMode === mode && "bg-blue-50 dark:bg-blue-900/30 text-blue-600 dark:text-blue-400"
                  )}
                >
                  <span>{modeConfig[mode].icon}</span>
                  <div>
                    <div className="font-medium">{modeConfig[mode].label}</div>
                    <div className="text-xs text-gray-500 dark:text-gray-400">
                      {modeConfig[mode].description}
                    </div>
                  </div>
                  {searchMode === mode && (
                    <span className="ml-auto text-blue-600 dark:text-blue-400">✓</span>
                  )}
                </button>
              ))}
            </div>
          )}
        </div>
      </div>

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
