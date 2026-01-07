/**
 * Application-wide constants
 * 
 * Centralizes magic numbers and strings to avoid duplication
 * and make maintenance easier.
 */

// ============================================
// Pagination
// ============================================
export const ITEMS_PER_PAGE = 20;
export const DEFAULT_LIMIT = 50;

// ============================================
// Timing (in milliseconds)
// ============================================
export const DEBOUNCE_DELAY = 500;
export const SSE_DEBOUNCE_MS = 3000;
export const STALE_TIME_MS = 30000;
export const TOAST_DURATION = 3000;

// ============================================
// React Query Keys
// ============================================
export const QUERY_KEYS = {
  EMAILS: "emails",
  EMAIL: "email",
  MAILBOXES: "mailboxes",
  KANBAN_COLUMNS: "kanban-columns",
  SEARCH: "search",
} as const;

// ============================================
// Routes
// ============================================
export const ROUTES = {
  LOGIN: "/login",
  SIGNUP: "/signup",
  SET_PASSWORD: "/set-password",
  INBOX: "/inbox",
  KANBAN: "/kanban",
  SEARCH: "/search",
  TERMS: "/terms-of-service",
  PRIVACY: "/privacy-policy",
} as const;

// ============================================
// Mailbox Types
// ============================================
export const MAILBOX_TYPES = {
  INBOX: "inbox",
  TODO: "todo",
  DONE: "done",
  SNOOZED: "snoozed",
  TRASH: "trash",
  STARRED: "starred",
  SENT: "sent",
  DRAFTS: "drafts",
} as const;

export type MailboxType = (typeof MAILBOX_TYPES)[keyof typeof MAILBOX_TYPES];

// ============================================
// Keyboard Shortcuts
// ============================================
export const KEYBOARD_SHORTCUTS = [
  { key: "j / ↓", action: "Email tiếp theo" },
  { key: "k / ↑", action: "Email trước" },
  { key: "Enter", action: "Mở email" },
  { key: "Delete", action: "Xóa email" },
  { key: "s", action: "Gắn/bỏ sao" },
  { key: "r", action: "Đã đọc/chưa đọc" },
  { key: "Esc", action: "Bỏ chọn" },
] as const;

// ============================================
// Search Modes
// ============================================
export const SEARCH_MODES = {
  SEMANTIC: "semantic",
  FUZZY: "fuzzy",
} as const;

export type SearchMode = (typeof SEARCH_MODES)[keyof typeof SEARCH_MODES];

// ============================================
// Local Storage Keys
// ============================================
export const STORAGE_KEYS = {
  THEME: "theme",
  ACCESS_TOKEN: "access_token",
} as const;

// ============================================
// Default Values
// ============================================
export const DEFAULTS = {
  AVATAR_URL:
    "https://lh3.googleusercontent.com/aida-public/AB6AXuDRNQSlv4je28jMHI0WjXZhE5xKv7aSQKNqKhtFzfV3noDp7AgOUk9Hz5vby11yRlctZmQJOUwfeApOcQV9Yt",
} as const;
