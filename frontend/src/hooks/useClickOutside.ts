import { useEffect, useRef, type RefObject } from "react";

type Handler = (event: MouseEvent | TouchEvent) => void;

/**
 * Custom hook that triggers a callback when clicking outside of the specified element
 * 
 * @param handler - Callback function to run when clicking outside
 * @returns ref - Ref to attach to the element you want to detect clicks outside of
 * 
 * @example
 * ```tsx
 * function Dropdown() {
 *   const [isOpen, setIsOpen] = useState(false);
 *   const dropdownRef = useClickOutside<HTMLDivElement>(() => {
 *     setIsOpen(false);
 *   });
 *   
 *   return (
 *     <div ref={dropdownRef}>
 *       {isOpen && <DropdownMenu />}
 *     </div>
 *   );
 * }
 * ```
 */
export function useClickOutside<T extends HTMLElement = HTMLElement>(
  handler: Handler
): RefObject<T | null> {
  const ref = useRef<T>(null);

  useEffect(() => {
    const listener = (event: MouseEvent | TouchEvent) => {
      const element = ref.current;

      // Do nothing if clicking ref's element or descendent elements
      if (!element || element.contains(event.target as Node)) {
        return;
      }

      handler(event);
    };

    document.addEventListener("mousedown", listener);
    document.addEventListener("touchstart", listener);

    return () => {
      document.removeEventListener("mousedown", listener);
      document.removeEventListener("touchstart", listener);
    };
  }, [handler]);

  return ref;
}

export default useClickOutside;
