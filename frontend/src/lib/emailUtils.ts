import type { Email } from "@/types/email";

export type SortOption = "newest" | "oldest";

export interface FilterState {
  unreadOnly: boolean;
  withAttachments: boolean;
}

/**
 * Sort emails by received date
 */
export function sortEmails(emails: Email[], sort: SortOption): Email[] {
  return [...emails].sort((a, b) => {
    const dateA = new Date(a.received_at).getTime();
    const dateB = new Date(b.received_at).getTime();
    return sort === "newest" ? dateB - dateA : dateA - dateB;
  });
}

/**
 * Filter emails based on filter state
 */
export function filterEmails(emails: Email[], filterState: FilterState): Email[] {
  if (!emails) return [];
  return emails.filter((email) => {
    if (filterState.unreadOnly && email.is_read) return false;
    if (filterState.withAttachments && (!email.attachments || email.attachments.length === 0)) return false;
    return true;
  });
}

/**
 * Clean preview text by stripping HTML/CSS code
 * Used to display clean email previews in lists
 */
export function cleanPreviewText(text: string | undefined): string {
  if (!text) return "Không có nội dung xem trước";
  let cleaned = text;

  // Remove HTML tags
  cleaned = cleaned.replace(/<[^>]*>/g, " ");

  // Remove CSS blocks: *{...}, .class{...}, #id{...}, element{...}, [attr]{...}
  cleaned = cleaned.replace(/[*\.\#]?[a-zA-Z0-9_\-\[\]='\"]+\s*\{[^}]*\}/g, " ");

  // Remove remaining CSS property patterns: property: value; or property: value !important
  cleaned = cleaned.replace(/[a-zA-Z\-]+\s*:\s*[^;{}]+(!important)?;?/gi, " ");

  // Remove attribute selectors like [x-apple-data-detectors]
  cleaned = cleaned.replace(/\[[^\]]+\]/g, " ");

  // Remove CSS at-rules like @media, @font-face
  cleaned = cleaned.replace(/@[a-zA-Z\-]+[^{]*\{[^}]*\}/g, " ");

  // Remove numbers followed by special chars that look like CSS (e.g., "96 *")
  cleaned = cleaned.replace(/\d+\s*[*\.\#]/g, " ");

  // Remove common CSS keywords
  cleaned = cleaned.replace(/\b(important|inherit|none|auto|px|em|rem|%|rgb|rgba|hsl|hsla)\b/gi, " ");

  // Remove extra whitespace
  cleaned = cleaned.replace(/\s+/g, " ").trim();

  return cleaned.length > 5 ? cleaned : "Không có nội dung xem trước";
}

/**
 * Process emails for Kanban display
 * Applies sorting, filtering, and cleans preview text
 */
export function processEmailsForKanban(
  emails: Email[] | null | undefined, 
  sort: SortOption, 
  filter: FilterState
): Email[] {
  if (!emails) return [];
  
  const sorted = sortEmails(emails, sort);
  const filtered = filterEmails(sorted, filter);
  
  // Clean preview text for each email
  return filtered.map((email) => ({
    ...email,
    preview: cleanPreviewText(email.preview),
  }));
}
