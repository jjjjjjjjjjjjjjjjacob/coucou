import { clsx, type ClassValue } from "clsx"

export type { ClassValue }
import { twMerge } from "tailwind-merge"
import { toast } from "sonner"

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

export function formatEventDateTime(timestamp: number, timezone?: string): string {
  const date = new Date(timestamp);
  const day = date.toLocaleDateString(undefined, {
    weekday: "long",
    timeZone: timezone ?? "UTC",
  });
  const formattedDate = date.toLocaleDateString("en-US", {
    month: "2-digit",
    day: "2-digit",
    year: "2-digit",
    timeZone: timezone ?? "UTC",
  });
  const time = date.toLocaleTimeString(undefined, {
    hour: "numeric",
    minute: "2-digit",
    hour12: true,
    timeZone: timezone ?? "UTC",
  });
  return `${day} ${formattedDate.replace(/\//g, ".")} at ${time}`;
}

export function copyEventLink(eventId: string): void {
  const eventUrl = `${window.location.origin}/events/${eventId}`;
  navigator.clipboard.writeText(eventUrl).then(() => {
    toast.success("Event link copied to clipboard");
  }).catch(() => {
    toast.error("Failed to copy event link");
  });
}

export function ensureAbsoluteUrl(url: string): string {
  if (!url) return url;
  const trimmedUrl = url.trim();
  if (/^https?:\/\//i.test(trimmedUrl)) return trimmedUrl;
  return `https://${trimmedUrl}`;
}

export function sanitizeFieldValue(value: string, fieldKey?: string): string {
  if (!value) return '';

  // Remove leading/trailing whitespace
  let sanitized = value.trim();

  // Remove @ symbol commonly used for social media handles
  if (sanitized.startsWith('@')) {
    sanitized = sanitized.substring(1);
  }

  // Platform-specific sanitization
  const lowerFieldKey = fieldKey?.toLowerCase() || '';
  if (lowerFieldKey.includes('instagram') ||
      lowerFieldKey.includes('twitter') ||
      lowerFieldKey.includes('tiktok') ||
      lowerFieldKey.includes('x.com') ||
      lowerFieldKey.includes('github') ||
      lowerFieldKey.includes('linkedin')) {
    // Remove spaces and special characters except underscore, period, and hyphen for social media
    sanitized = sanitized.replace(/[^a-zA-Z0-9._-]/g, '');
  } else {
    // Generic URL path sanitization - encode special characters
    sanitized = encodeURIComponent(sanitized);
  }

  return sanitized;
}
