import type { Email } from "@/types/email";

/**
 * Strip HTML tags and decode HTML entities from a string
 * 
 * @param html - HTML string to clean
 * @returns Plain text without HTML tags
 */
export function stripHtml(html: string): string {
  if (!html) return "";
  
  // Use a temporary div to decode HTML entities
  const tmp = document.createElement("DIV");
  tmp.innerHTML = html;
  return tmp.textContent || tmp.innerText || "";
}

/**
 * Clean and truncate preview text from email body
 * Removes HTML, CSS, and other code artifacts
 * 
 * @param text - Raw email preview or body text
 * @param maxLength - Maximum length of returned string (default: 100)
 * @returns Cleaned preview text
 */
export function getCleanPreview(text: string | undefined, maxLength = 100): string {
  if (!text) return "Không có nội dung xem trước";
  
  let cleaned = text;

  // Remove HTML tags
  cleaned = cleaned.replace(/<[^>]*>/g, " ");

  // Remove CSS blocks: *{...}, .class{...}, #id{...}, element{...}, [attr]{...}
  cleaned = cleaned.replace(/[\*\.#]?[a-zA-Z0-9_\-\[\]='\"]+\s*\{[^}]*\}/g, " ");

  // Remove remaining CSS property patterns: property: value; or property: value !important
  cleaned = cleaned.replace(/[a-zA-Z\-]+\s*:\s*[^;{}]+(!important)?;?/gi, " ");

  // Remove attribute selectors like [x-apple-data-detectors]
  cleaned = cleaned.replace(/\[[^\]]+\]/g, " ");

  // Remove CSS at-rules like @media, @font-face
  cleaned = cleaned.replace(/@[a-zA-Z\-]+[^{]*\{[^}]*\}/g, " ");

  // Remove numbers followed by special chars that look like CSS (e.g., "96 *")
  cleaned = cleaned.replace(/\d+\s*[\*\.#]/g, " ");

  // Remove common CSS keywords
  cleaned = cleaned.replace(
    /\b(important|inherit|none|auto|px|em|rem|%|rgb|rgba|hsl|hsla)\b/gi,
    " "
  );

  // Remove extra whitespace
  cleaned = cleaned.replace(/\s+/g, " ").trim();

  // Return cleaned text or fallback
  if (cleaned.length <= 5) {
    return "Không có nội dung xem trước";
  }

  // Truncate if too long
  if (cleaned.length > maxLength) {
    return cleaned.slice(0, maxLength) + "...";
  }

  return cleaned;
}

/**
 * Extract sender name from email, removing quotes and email addresses
 * 
 * @param email - Email object
 * @returns Clean sender name
 */
export function getSenderName(email: Email): string {
  // Use from_name if available
  if (email.from_name) {
    return email.from_name.replace(/^["']|["']$/g, "").trim();
  }

  // Otherwise extract from 'from' field
  const from = email.from || "";

  // Match pattern: "Name" <email> or Name <email>
  const match = from.match(/^["']?([^"'<]+)["']?\s*<.*>$/);
  if (match) {
    return match[1].trim();
  }

  // If no match, just remove quotes and return
  return from.replace(/^["']|["']$/g, "").trim() || "Unknown Sender";
}

/**
 * Get sender's initials for avatar
 * 
 * @param email - Email object
 * @returns Single uppercase initial character
 */
export function getSenderInitial(email: Email): string {
  const name = getSenderName(email);
  return name.charAt(0).toUpperCase() || "?";
}

/**
 * Extract email address from a "Name <email>" format string
 * 
 * @param fromString - Email from field
 * @returns Just the email address
 */
export function extractEmailAddress(fromString: string): string {
  const match = fromString.match(/<([^>]+)>/);
  if (match) {
    return match[1].trim();
  }
  
  // If already just an email
  if (fromString.includes("@")) {
    return fromString.trim();
  }
  
  return fromString;
}

/**
 * Check if an email has attachments
 * 
 * @param email - Email object
 * @returns true if email has attachments
 */
export function hasAttachments(email: Email): boolean {
  return Boolean(email.attachments && email.attachments.length > 0);
}

/**
 * Get file icon name based on MIME type
 * 
 * @param mimeType - MIME type of the file
 * @returns Material icon name
 */
export function getFileIcon(mimeType: string): string {
  if (mimeType.startsWith("image/")) {
    return "image";
  }
  if (mimeType.includes("pdf")) {
    return "picture_as_pdf";
  }
  if (mimeType.includes("word") || mimeType.includes("document")) {
    return "description";
  }
  if (mimeType.includes("sheet") || mimeType.includes("excel")) {
    return "table_chart";
  }
  if (mimeType.includes("presentation") || mimeType.includes("powerpoint")) {
    return "slideshow";
  }
  if (mimeType.includes("zip") || mimeType.includes("compressed")) {
    return "folder_zip";
  }
  return "description";
}

/**
 * Format file size in human readable format
 * 
 * @param bytes - File size in bytes
 * @returns Formatted string (e.g., "1.5 MB")
 */
export function formatFileSize(bytes: number): string {
  if (bytes < 1024) return bytes + " B";
  if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + " KB";
  return (bytes / (1024 * 1024)).toFixed(1) + " MB";
}

/**
 * Check if a file type can be viewed directly in browser
 * 
 * @param mimeType - MIME type of the file
 * @returns true if file can be viewed in browser
 */
export function isViewableFileType(mimeType: string): boolean {
  if (!mimeType) return false;
  
  // Images
  if (mimeType.startsWith("image/")) {
    return true;
  }
  
  // PDFs
  if (mimeType === "application/pdf") {
    return true;
  }
  
  // Text files
  if (mimeType.startsWith("text/")) {
    return true;
  }
  
  // HTML
  if (mimeType === "text/html" || mimeType === "application/xhtml+xml") {
    return true;
  }
  
  // JSON, XML
  if (mimeType === "application/json" || mimeType === "application/xml" || mimeType === "text/xml") {
    return true;
  }
  
  // Office documents
  if (
    mimeType === "application/vnd.openxmlformats-officedocument.wordprocessingml.document" || // .docx
    mimeType === "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" || // .xlsx
    mimeType === "application/msword" || // .doc
    mimeType === "application/vnd.ms-excel" // .xls
  ) {
    return true;
  }
  
  // Video and audio (browser can play)
  if (mimeType.startsWith("video/") || mimeType.startsWith("audio/")) {
    return true;
  }
  
  return false;
}
