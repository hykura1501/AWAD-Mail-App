import { format } from "date-fns";

/**
 * Get relative time display for email list
 * Shows time for today, "Yesterday" for yesterday, or date for older
 * 
 * @param date - ISO date string or Date object
 * @returns Formatted time string
 */
export function getTimeDisplay(date: string | Date): string {
  const emailDate = typeof date === "string" ? new Date(date) : date;
  const now = new Date();
  const diffInHours = (now.getTime() - emailDate.getTime()) / (1000 * 60 * 60);

  if (diffInHours < 24) {
    return format(emailDate, "h:mm a");
  } else if (diffInHours < 48) {
    return "Yesterday";
  } else {
    return format(emailDate, "MMM d");
  }
}

/**
 * Get detailed time display for email detail view
 * Includes "Today" or "Yesterday" prefix
 * 
 * @param date - ISO date string or Date object
 * @returns Formatted time string with prefix
 */
export function getDetailedTimeDisplay(date: string | Date): string {
  const emailDate = typeof date === "string" ? new Date(date) : date;
  const now = new Date();
  const diffInHours = (now.getTime() - emailDate.getTime()) / (1000 * 60 * 60);

  if (diffInHours < 24) {
    return `Today, ${format(emailDate, "h:mm a")}`;
  } else if (diffInHours < 48) {
    return `Yesterday, ${format(emailDate, "h:mm a")}`;
  } else {
    return format(emailDate, "MMM d, h:mm a");
  }
}

/**
 * Format date for Vietnamese reply/forward headers
 * 
 * @param date - ISO date string or Date object
 * @returns Vietnamese formatted date string
 */
export function formatVietnameseDate(date: string | Date): string {
  const d = typeof date === "string" ? new Date(date) : date;
  const weekday = d.toLocaleDateString("vi-VN", { weekday: "short" });
  const day = d.getDate();
  const month = d.getMonth() + 1;
  const year = d.getFullYear();
  const time = d.toLocaleTimeString("vi-VN", {
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  });

  return `Vào ${weekday}, ${day} thg ${month}, ${year} vào lúc ${time}`;
}

/**
 * Check if a date is today
 * 
 * @param date - ISO date string or Date object
 * @returns true if date is today
 */
export function isToday(date: string | Date): boolean {
  const d = typeof date === "string" ? new Date(date) : date;
  const today = new Date();
  
  return (
    d.getDate() === today.getDate() &&
    d.getMonth() === today.getMonth() &&
    d.getFullYear() === today.getFullYear()
  );
}

/**
 * Check if a date is yesterday
 * 
 * @param date - ISO date string or Date object
 * @returns true if date is yesterday
 */
export function isYesterday(date: string | Date): boolean {
  const d = typeof date === "string" ? new Date(date) : date;
  const yesterday = new Date();
  yesterday.setDate(yesterday.getDate() - 1);
  
  return (
    d.getDate() === yesterday.getDate() &&
    d.getMonth() === yesterday.getMonth() &&
    d.getFullYear() === yesterday.getFullYear()
  );
}

/**
 * Format relative time (e.g., "2 hours ago", "3 days ago")
 * 
 * @param date - ISO date string or Date object
 * @returns Relative time string
 */
export function formatRelativeTime(date: string | Date): string {
  const d = typeof date === "string" ? new Date(date) : date;
  const now = new Date();
  const diffMs = now.getTime() - d.getTime();
  
  const seconds = Math.floor(diffMs / 1000);
  const minutes = Math.floor(seconds / 60);
  const hours = Math.floor(minutes / 60);
  const days = Math.floor(hours / 24);
  const months = Math.floor(days / 30);
  const years = Math.floor(days / 365);

  if (seconds < 60) {
    return "Vừa xong";
  } else if (minutes < 60) {
    return `${minutes} phút trước`;
  } else if (hours < 24) {
    return `${hours} giờ trước`;
  } else if (days < 30) {
    return `${days} ngày trước`;
  } else if (months < 12) {
    return `${months} tháng trước`;
  } else {
    return `${years} năm trước`;
  }
}
