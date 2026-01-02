import { useCallback, useEffect, useState, type RefObject } from "react";

export interface KeyboardNavigationOptions<T> {
  /** Array of items to navigate through */
  items: T[];
  /** Whether to enable keyboard navigation */
  enabled?: boolean;
  /** Callback when Enter is pressed on focused item */
  onSelect?: (item: T, index: number) => void;
  /** Callback when Delete/Backspace is pressed on focused item */
  onDelete?: (item: T, index: number) => void;
  /** Custom key handlers */
  customHandlers?: Record<string, (item: T, index: number) => void>;
  /** Ref to scroll items into view */
  itemRefs?: RefObject<(HTMLElement | null)[]>;
  /** Whether navigation is blocked (e.g., when a dialog is open) */
  blocked?: boolean;
}

export interface KeyboardNavigationReturn {
  /** Currently focused index (-1 if none) */
  focusedIndex: number;
  /** Set focused index manually */
  setFocusedIndex: (index: number) => void;
  /** Whether an item is currently focused */
  isFocused: boolean;
  /** Reset focus to -1 */
  resetFocus: () => void;
}

/**
 * Custom hook for keyboard navigation in lists
 * 
 * Supports:
 * - j/k or Arrow keys for navigation
 * - Enter to select
 * - Delete/Backspace to delete
 * - Escape to reset focus
 * - Custom key handlers
 * 
 * @example
 * ```tsx
 * const { focusedIndex, isFocused } = useKeyboardNavigation({
 *   items: emails,
 *   onSelect: (email) => navigate(`/email/${email.id}`),
 *   onDelete: (email) => deleteEmail(email.id),
 * });
 * ```
 */
export function useKeyboardNavigation<T>({
  items,
  enabled = true,
  onSelect,
  onDelete,
  customHandlers = {},
  itemRefs,
  blocked = false,
}: KeyboardNavigationOptions<T>): KeyboardNavigationReturn {
  const [focusedIndex, setFocusedIndex] = useState(-1);

  const handleKeyDown = useCallback(
    (event: KeyboardEvent) => {
      // Don't handle if user is typing in an input/textarea
      const target = event.target as HTMLElement;
      if (
        target.tagName === "INPUT" ||
        target.tagName === "TEXTAREA" ||
        target.isContentEditable
      ) {
        return;
      }

      // Don't handle if blocked or disabled
      if (!enabled || blocked) return;

      const itemCount = items.length;
      if (itemCount === 0) return;

      const scrollIntoView = (index: number) => {
        if (itemRefs?.current?.[index]) {
          itemRefs.current[index]?.scrollIntoView({
            behavior: "smooth",
            block: "nearest",
          });
        }
      };

      switch (event.key) {
        case "j":
        case "ArrowDown":
          event.preventDefault();
          setFocusedIndex((prev) => {
            const next = prev < itemCount - 1 ? prev + 1 : prev;
            scrollIntoView(next);
            return next;
          });
          break;

        case "k":
        case "ArrowUp":
          event.preventDefault();
          setFocusedIndex((prev) => {
            const next = prev > 0 ? prev - 1 : 0;
            scrollIntoView(next);
            return next;
          });
          break;

        case "Enter":
          event.preventDefault();
          if (focusedIndex >= 0 && focusedIndex < itemCount) {
            onSelect?.(items[focusedIndex], focusedIndex);
          }
          break;

        case "Delete":
        case "Backspace":
          event.preventDefault();
          if (focusedIndex >= 0 && focusedIndex < itemCount) {
            onDelete?.(items[focusedIndex], focusedIndex);
          }
          break;

        case "Escape":
          setFocusedIndex(-1);
          break;

        default:
          // Check custom handlers
          if (customHandlers[event.key] && focusedIndex >= 0) {
            event.preventDefault();
            customHandlers[event.key](items[focusedIndex], focusedIndex);
          }
          break;
      }
    },
    [items, enabled, blocked, focusedIndex, onSelect, onDelete, customHandlers, itemRefs]
  );

  // Register keyboard event listener
  useEffect(() => {
    if (!enabled) return;

    document.addEventListener("keydown", handleKeyDown);
    return () => document.removeEventListener("keydown", handleKeyDown);
  }, [handleKeyDown, enabled]);

  // Reset focus when items change significantly
  useEffect(() => {
    if (focusedIndex >= items.length) {
      setFocusedIndex(items.length > 0 ? items.length - 1 : -1);
    }
  }, [items.length, focusedIndex]);

  const resetFocus = useCallback(() => {
    setFocusedIndex(-1);
  }, []);

  return {
    focusedIndex,
    setFocusedIndex,
    isFocused: focusedIndex >= 0,
    resetFocus,
  };
}

export default useKeyboardNavigation;
