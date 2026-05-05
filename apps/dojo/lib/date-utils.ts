/**
 * Shared date formatting utilities
 */

/**
 * Formats a timestamp to a readable date string
 */
export function formatEventDate(timestamp: number, timezone?: string): string {
  const date = new Date(timestamp);
  return date.toLocaleDateString("en-US", {
    weekday: "long",
    year: "numeric",
    month: "long",
    day: "numeric",
    timeZone: timezone ?? "UTC",
  });
}

/**
 * Formats a timestamp to a readable time string
 */
export function formatEventTime(timestamp: number, timezone?: string): string {
  const date = new Date(timestamp);
  return date.toLocaleTimeString("en-US", {
    hour: "numeric",
    minute: "2-digit",
    hour12: true,
    timeZone: timezone ?? "UTC",
  });
}

/**
 * Returns a list of timezone options for select components
 */
export function getTimeZoneOptions(): Array<{ value: string; label: string }> {
  const baseTimeZones = [
    "America/Los_Angeles",
    "America/New_York",
    "America/Chicago",
    "America/Denver",
    "Europe/London",
    "Europe/Paris",
    "Europe/Berlin",
    "Asia/Tokyo",
    "Asia/Seoul",
    "Australia/Sydney",
    "UTC",
  ];

  const resolved = Intl.DateTimeFormat().resolvedOptions().timeZone;

  const supportedTimeZones =
    typeof (Intl as unknown as { supportedValuesOf?: (key: string) => string[] })
      .supportedValuesOf === "function"
      ? (Intl as unknown as { supportedValuesOf: (key: string) => string[] })
          .supportedValuesOf("timeZone")
      : baseTimeZones;

  const uniqueTimeZoneSet = new Set<string>();
  const canonicalize = (value: string) => {
    try {
      return new Intl.DateTimeFormat("en-US", { timeZone: value }).resolvedOptions()
        .timeZone;
    } catch {
      return value;
    }
  };

  if (resolved) uniqueTimeZoneSet.add(canonicalize(resolved));
  baseTimeZones.forEach((zone) => uniqueTimeZoneSet.add(canonicalize(zone)));
  supportedTimeZones.forEach((zone) => uniqueTimeZoneSet.add(canonicalize(zone)));

  const sortedOptions = Array.from(uniqueTimeZoneSet)
    .map((value) => ({
      value,
      label: value.replace(/_/g, " "),
    }))
    .sort((a, b) => a.label.localeCompare(b.label));

  if (!resolved) {
    return sortedOptions;
  }

  const resolvedOptionIndex = sortedOptions.findIndex(
    (option) => option.value === resolved,
  );

  if (resolvedOptionIndex === -1) {
    return sortedOptions;
  }

  const [resolvedOption] = sortedOptions.splice(resolvedOptionIndex, 1);
  return [resolvedOption, ...sortedOptions];
}

/**
 * Converts a date object to YYYY-MM-DD format for input fields
 */
export function formatDateForInput(date: Date): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

/**
 * Converts a date object to HH:MM format for input fields
 */
export function formatTimeForInput(date: Date): string {
  const hours = String(date.getHours()).padStart(2, "0");
  const minutes = String(date.getMinutes()).padStart(2, "0");
  return `${hours}:${minutes}`;
}

/**
 * Extracts date string (YYYY-MM-DD) from a timestamp, formatted in the specified timezone
 */
export function extractDateFromTimestamp(timestamp: number, timezone?: string): string {
  const date = new Date(timestamp);
  const formatter = new Intl.DateTimeFormat("en-US", {
    timeZone: timezone ?? "UTC",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  });
  const parts = formatter.formatToParts(date);
  const year = parts.find((p) => p.type === "year")?.value || "0";
  const month = parts.find((p) => p.type === "month")?.value || "0";
  const day = parts.find((p) => p.type === "day")?.value || "0";
  return `${year}-${month}-${day}`;
}

/**
 * Extracts time string (HH:MM) from a timestamp, formatted in the specified timezone
 */
export function extractTimeFromTimestamp(timestamp: number, timezone?: string): string {
  const date = new Date(timestamp);
  const formatter = new Intl.DateTimeFormat("en-US", {
    timeZone: timezone ?? "UTC",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  });
  const parts = formatter.formatToParts(date);
  const hour = parts.find((p) => p.type === "hour")?.value || "00";
  const minute = parts.find((p) => p.type === "minute")?.value || "00";
  return `${hour}:${minute}`;
}

/**
 * Creates a timestamp from date and time strings
 * Interprets the date/time as being IN the specified timezone, then converts to UTC timestamp
 * 
 * Example: createTimestamp("2024-01-15", "19:00", "America/New_York")
 * Returns: UTC timestamp for Jan 15, 2024 7:00 PM New York time
 */
export function createTimestamp(dateString: string, timeString?: string, timezone?: string): number {
  const [year, month, day] = dateString.split("-").map(value => parseInt(value, 10));

  if (timeString) {
    const [hours, minutes] = timeString.split(":").map(value => parseInt(value, 10));
    if (timezone) {
      // Strategy: Use binary search or iterative approach to find the UTC timestamp
      // that, when formatted in the target timezone, matches our desired local time
      
      // Start with a reasonable guess: UTC time equal to local time
      let candidateUtc = new Date(Date.UTC(year, month - 1, day, hours || 0, minutes || 0));
      
      const formatter = new Intl.DateTimeFormat("en-US", {
        timeZone: timezone,
        year: "numeric",
        month: "2-digit",
        day: "2-digit",
        hour: "2-digit",
        minute: "2-digit",
        hour12: false,
      });
      
      // Refine the candidate by checking what local time it represents
      // and adjusting until it matches our target
      for (let iteration = 0; iteration < 3; iteration++) {
        const parts = formatter.formatToParts(candidateUtc);
        const candidateYear = parseInt(parts.find((p) => p.type === "year")?.value || "0", 10);
        const candidateMonth = parseInt(parts.find((p) => p.type === "month")?.value || "0", 10);
        const candidateDay = parseInt(parts.find((p) => p.type === "day")?.value || "0", 10);
        const candidateHour = parseInt(parts.find((p) => p.type === "hour")?.value || "0", 10);
        const candidateMinute = parseInt(parts.find((p) => p.type === "minute")?.value || "0", 10);
        
        // Check if we've found the right date/time
        if (
          candidateYear === year &&
          candidateMonth === month &&
          candidateDay === day &&
          candidateHour === (hours || 0) &&
          candidateMinute === (minutes || 0)
        ) {
          return candidateUtc.getTime();
        }
        
        // Calculate the difference and adjust
        const hourDiff = (hours || 0) - candidateHour;
        const minuteDiff = (minutes || 0) - candidateMinute;
        const dayDiff = day - candidateDay;
        
        // Adjust by the difference (in milliseconds)
        const adjustmentMs = (dayDiff * 24 * 60 + hourDiff * 60 + minuteDiff) * 60 * 1000;
        candidateUtc = new Date(candidateUtc.getTime() + adjustmentMs);
      }
      
      // Final check - if still not matching, use the last candidate
      return candidateUtc.getTime();
    }
    return new Date(Date.UTC(year, month - 1, day, hours || 0, minutes || 0)).getTime();
  } else {
    if (timezone) {
      // For date-only, we want midnight in the timezone
      let candidateUtc = new Date(Date.UTC(year, month - 1, day, 0, 0, 0));
      
      const formatter = new Intl.DateTimeFormat("en-US", {
        timeZone: timezone,
        year: "numeric",
        month: "2-digit",
        day: "2-digit",
        hour: "2-digit",
        minute: "2-digit",
        hour12: false,
      });
      
      for (let iteration = 0; iteration < 3; iteration++) {
        const parts = formatter.formatToParts(candidateUtc);
        const candidateYear = parseInt(parts.find((p) => p.type === "year")?.value || "0", 10);
        const candidateMonth = parseInt(parts.find((p) => p.type === "month")?.value || "0", 10);
        const candidateDay = parseInt(parts.find((p) => p.type === "day")?.value || "0", 10);
        const candidateHour = parseInt(parts.find((p) => p.type === "hour")?.value || "0", 10);
        const candidateMinute = parseInt(parts.find((p) => p.type === "minute")?.value || "0", 10);
        
        if (
          candidateYear === year &&
          candidateMonth === month &&
          candidateDay === day &&
          candidateHour === 0 &&
          candidateMinute === 0
        ) {
          return candidateUtc.getTime();
        }
        
        const hourDiff = 0 - candidateHour;
        const minuteDiff = 0 - candidateMinute;
        const dayDiff = day - candidateDay;
        
        const adjustmentMs = (dayDiff * 24 * 60 + hourDiff * 60 + minuteDiff) * 60 * 1000;
        candidateUtc = new Date(candidateUtc.getTime() + adjustmentMs);
      }
      
      return candidateUtc.getTime();
    }
    return new Date(Date.UTC(year, month - 1, day)).getTime();
  }
}

/**
 * Formats a relative time (e.g., "2 hours ago", "in 3 days")
 */
export function formatRelativeTime(timestamp: number): string {
  const now = Date.now();
  const difference = timestamp - now;
  const absDifference = Math.abs(difference);

  const minute = 60 * 1000;
  const hour = minute * 60;
  const day = hour * 24;
  const week = day * 7;
  const month = day * 30;
  const year = day * 365;

  const rtf = new Intl.RelativeTimeFormat("en", { numeric: "auto" });

  if (absDifference < minute) {
    return "just now";
  } else if (absDifference < hour) {
    const minutes = Math.floor(absDifference / minute);
    return rtf.format(difference > 0 ? minutes : -minutes, "minute");
  } else if (absDifference < day) {
    const hours = Math.floor(absDifference / hour);
    return rtf.format(difference > 0 ? hours : -hours, "hour");
  } else if (absDifference < week) {
    const days = Math.floor(absDifference / day);
    return rtf.format(difference > 0 ? days : -days, "day");
  } else if (absDifference < month) {
    const weeks = Math.floor(absDifference / week);
    return rtf.format(difference > 0 ? weeks : -weeks, "week");
  } else if (absDifference < year) {
    const months = Math.floor(absDifference / month);
    return rtf.format(difference > 0 ? months : -months, "month");
  } else {
    const years = Math.floor(absDifference / year);
    return rtf.format(difference > 0 ? years : -years, "year");
  }
}