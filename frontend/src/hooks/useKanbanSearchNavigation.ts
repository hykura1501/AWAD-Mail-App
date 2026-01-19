import { useState, useCallback, useRef, useEffect } from "react";
import type { Email } from "@/types/email";
import { emailService } from "@/services/email.service";
import { toast } from "sonner";

// Constants for hybrid search
const BATCH_SIZE = 100; // Load 100 emails per batch to search
const MAX_BATCHES = 5;  // Max 5 batches = 500 emails deep
const PAGE_SIZE = 20;   // Default page size for display

// Default Kanban columns to search through
const DEFAULT_COLUMNS = ["inbox", "todo", "done", "snoozed"];

export interface UseKanbanSearchNavigationOptions {
  /** Current loaded emails by column */
  kanbanEmails: Record<string, Email[]>;
  /** Page size limit for display */
  limit?: number;
  /** Function to load a column at specific offset */
  loadColumn: (columnId: string, offset: number) => Promise<void>;
  /** Function to set mobile selected column (for mobile support) */
  setMobileSelectedColumn?: (columnId: string) => void;
  /** Fallback function when email not found (e.g., open detail popup) */
  onEmailNotFound?: (emailId: string) => void;
}

export interface UseKanbanSearchNavigationReturn {
  /** Currently highlighted email ID */
  highlightedEmailId: string | null;
  /** Handle click on search result - navigates and highlights */
  handleSearchResultClick: (emailId: string) => Promise<void>;
  /** Whether navigation is in progress */
  isNavigating: boolean;
}

/**
 * Custom hook for Kanban search result navigation with hybrid loading
 * 
 * Uses a hybrid approach to find the exact page of an email:
 * 1. Search across all Kanban columns
 * 2. Load batches of 100 emails from each column
 * 3. When found, calculate the correct page offset
 * 4. Load that specific page for display
 * 5. Highlight and scroll to the email
 */
export function useKanbanSearchNavigation({
  kanbanEmails,
  limit = PAGE_SIZE,
  loadColumn,
  setMobileSelectedColumn,
  onEmailNotFound,
}: UseKanbanSearchNavigationOptions): UseKanbanSearchNavigationReturn {
  const [highlightedEmailId, setHighlightedEmailId] = useState<string | null>(null);
  const [isNavigating, setIsNavigating] = useState(false);
  
  // Ref to track pending scroll after state updates
  const pendingScrollEmailId = useRef<string | null>(null);

  /**
   * Find email in currently loaded kanban data
   */
  const findEmailInCurrentView = useCallback((emailId: string): {
    columnId: string;
    email: Email;
  } | null => {
    for (const [columnId, emails] of Object.entries(kanbanEmails)) {
      if (!emails) continue;
      const email = emails.find(e => e.id === emailId);
      if (email) {
        return { columnId, email };
      }
    }
    return null;
  }, [kanbanEmails]);

  /**
   * Scroll email card into view
   */
  const scrollEmailIntoView = useCallback((emailId: string) => {
    // Use requestAnimationFrame to ensure DOM has updated
    requestAnimationFrame(() => {
      const emailCard = document.querySelector(`[data-email-id="${emailId}"]`);
      if (emailCard) {
        emailCard.scrollIntoView({
          behavior: 'smooth',
          block: 'center',
          inline: 'nearest'
        });
      }
    });
  }, []);

  /**
   * Set highlight with auto-clear after animation completes
   */
  const setHighlightWithAutoClear = useCallback((emailId: string) => {
    setHighlightedEmailId(emailId);
    scrollEmailIntoView(emailId);
    
    // Clear highlight after animation completes (3 cycles * 0.5s = 1.5s + buffer)
    setTimeout(() => {
      setHighlightedEmailId(null);
    }, 2000);
  }, [scrollEmailIntoView]);

  /**
   * Find email position in a specific column using batch loading
   * Returns { position } or null if not found
   */
  const findEmailPositionInColumn = useCallback(async (
    emailId: string,
    columnId: string
  ): Promise<{ position: number } | null> => {
    let offset = 0;
    
    for (let batch = 0; batch < MAX_BATCHES; batch++) {
      try {
        // Load batch of emails from the column
        const response = await emailService.getEmailsByStatus(columnId, BATCH_SIZE, offset, true);
        const emails = response.emails;
        
        if (!emails || emails.length === 0) {
          // No more emails in this column
          break;
        }
        
        // Search for email in this batch
        const indexInBatch = emails.findIndex(e => e.id === emailId);
        
        if (indexInBatch !== -1) {
          // Found! Calculate absolute position
          const position = offset + indexInBatch;
          console.log(`[SearchNav] Found email ${emailId} in column "${columnId}" at position ${position}`);
          return { position };
        }
        
        // Not found in this batch, try next
        offset += BATCH_SIZE;
        
        // If we got fewer emails than batch size, we've reached the end
        if (emails.length < BATCH_SIZE) {
          break;
        }
      } catch (error) {
        console.error(`[SearchNav] Error loading batch ${batch} for column ${columnId}:`, error);
        break;
      }
    }
    
    // Email not found in this column
    return null;
  }, []);

  /**
   * Search for email across all Kanban columns
   * Returns { columnId, position } or null if not found
   */
  const findEmailAcrossAllColumns = useCallback(async (
    emailId: string
  ): Promise<{ columnId: string; position: number } | null> => {
    // Get all column IDs (default + custom from kanbanEmails)
    const allColumnIds = new Set([...DEFAULT_COLUMNS, ...Object.keys(kanbanEmails)]);
    
    console.log(`[SearchNav] Searching email ${emailId} across columns:`, Array.from(allColumnIds));
    
    for (const columnId of allColumnIds) {
      const result = await findEmailPositionInColumn(emailId, columnId);
      if (result) {
        return { columnId, position: result.position };
      }
    }
    
    // Email not found in any column
    console.log(`[SearchNav] Email ${emailId} not found in any column`);
    return null;
  }, [kanbanEmails, findEmailPositionInColumn]);

  /**
   * Handle click on search result
   * Uses hybrid approach to find exact page and navigate
   */
  const handleSearchResultClick = useCallback(async (emailId: string) => {
    setIsNavigating(true);
    
    // Show loading toast
    const toastId = toast.loading("Đang tìm kiếm email...", {
      description: "Vui lòng chờ trong giây lát",
    });
    
    try {
      // Step 1: Check if email is already in current view
      const foundInView = findEmailInCurrentView(emailId);
      
      if (foundInView) {
        // Email is already visible - just highlight and scroll
        console.log(`[SearchNav] Email ${emailId} found in current view, highlighting`);
        toast.dismiss(toastId);
        setHighlightWithAutoClear(emailId);
        return;
      }

      // Step 2: Search for email across all Kanban columns
      console.log(`[SearchNav] Email not in current view, searching across all columns...`);
      const result = await findEmailAcrossAllColumns(emailId);
      
      if (result === null) {
        // Email not found in accessible range of any column
        // Fallback to opening detail popup
        console.log(`[SearchNav] Email ${emailId} not found in any column (max ${MAX_BATCHES * BATCH_SIZE} emails per column), opening fallback`);
        toast.info("Không tìm thấy email trong Kanban", {
          id: toastId,
          description: "Đang mở chi tiết email...",
        });
        onEmailNotFound?.(emailId);
        return;
      }
      
      const { columnId, position } = result;
      
      // Step 3: Calculate the correct page offset
      const pageOffset = Math.floor(position / limit) * limit;
      
      console.log(`[SearchNav] Email found in "${columnId}" at position ${position}, loading page with offset ${pageOffset}`);
      
      // Update toast
      toast.loading("Đang điều hướng...", {
        id: toastId,
        description: `Tìm thấy ở cột "${columnId}"`,
      });
      
      // Step 4: Switch mobile column if on mobile
      setMobileSelectedColumn?.(columnId);
      
      // Step 5: Load the exact page that contains the email
      await loadColumn(columnId, pageOffset);
      
      // Step 6: Wait for render then highlight and scroll
      pendingScrollEmailId.current = emailId;
      
      // Dismiss toast on success
      toast.success("Đã tìm thấy email!", {
        id: toastId,
        duration: 1500,
      });
      
    } catch (error) {
      console.error('[SearchNav] Error navigating to search result:', error);
      toast.error("Có lỗi xảy ra", {
        id: toastId,
        description: "Đang mở chi tiết email...",
      });
      onEmailNotFound?.(emailId);
    } finally {
      setIsNavigating(false);
    }
  }, [
    findEmailInCurrentView, 
    setHighlightWithAutoClear, 
    findEmailAcrossAllColumns,
    limit,
    loadColumn, 
    setMobileSelectedColumn,
    onEmailNotFound
  ]);

  /**
   * Effect to handle pending scroll after kanbanEmails updates
   */
  useEffect(() => {
    if (!pendingScrollEmailId.current) return;
    
    const emailId = pendingScrollEmailId.current;
    const foundInView = findEmailInCurrentView(emailId);
    
    if (foundInView) {
      // Email is now in view after loading - highlight it
      pendingScrollEmailId.current = null;
      
      // Small delay to ensure render is complete
      setTimeout(() => {
        setHighlightWithAutoClear(emailId);
      }, 100);
    }
  }, [kanbanEmails, findEmailInCurrentView, setHighlightWithAutoClear]);

  return {
    highlightedEmailId,
    handleSearchResultClick,
    isNavigating,
  };
}

export default useKanbanSearchNavigation;
