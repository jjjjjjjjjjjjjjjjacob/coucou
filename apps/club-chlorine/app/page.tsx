"use client";

import { useMemo } from "react";
import { useQuery } from "convex/react";
import { api } from "@convex/_generated/api";
import {
  ChlorineLanding,
  type ChlorineLandingEvent,
} from "@coucou/ui/tenant-template";
import { siteConfiguration } from "@/lib/site";

export default function Home() {
  const allEvents = useQuery(api.events.listAll, {
    siteKey: siteConfiguration.siteKey,
  });

  const events = useMemo<ChlorineLandingEvent[]>(() => {
    if (!allEvents) return [];
    const now = Date.now();
    return allEvents
      .filter((event) => event.eventDate >= now)
      .sort((a, b) => a.eventDate - b.eventDate)
      .slice(0, 5)
      .map((event) => ({
        id: event._id,
        date: formatChlorineDate(event.eventDate, event.eventTimezone),
        lineup: buildLineupLines(event.name, event.secondaryTitle),
        rsvpHref: `/events/${event._id}/rsvp`,
      }));
  }, [allEvents]);

  // While the query is in flight we render the landing with no rows so the
  // logo entrance animation still plays. The events grid then populates as
  // soon as Convex resolves.
  return (
    <ChlorineLanding
      events={events}
      emptyState={
        allEvents === undefined ? null : (
          <div
            style={{
              textAlign: "center",
              fontFamily:
                'var(--font-geist-mono), "Geist Mono", ui-monospace, monospace',
              fontSize: 12,
              letterSpacing: "0.08em",
              textTransform: "uppercase",
              color: "var(--tt-fg-dim)",
              padding: "32px 0",
            }}
          >
            No upcoming nights — check back soon.
          </div>
        )
      }
    />
  );
}

const SHORT_WEEKDAY_FORMATTER_CACHE = new Map<string, Intl.DateTimeFormat>();
const SHORT_DATE_FORMATTER_CACHE = new Map<string, Intl.DateTimeFormat>();

function getShortWeekdayFormatter(timezone: string): Intl.DateTimeFormat {
  let formatter = SHORT_WEEKDAY_FORMATTER_CACHE.get(timezone);
  if (!formatter) {
    formatter = new Intl.DateTimeFormat("en-US", {
      weekday: "short",
      timeZone: timezone,
    });
    SHORT_WEEKDAY_FORMATTER_CACHE.set(timezone, formatter);
  }
  return formatter;
}

function getShortDateFormatter(timezone: string): Intl.DateTimeFormat {
  let formatter = SHORT_DATE_FORMATTER_CACHE.get(timezone);
  if (!formatter) {
    formatter = new Intl.DateTimeFormat("en-US", {
      month: "2-digit",
      day: "2-digit",
      timeZone: timezone,
    });
    SHORT_DATE_FORMATTER_CACHE.set(timezone, formatter);
  }
  return formatter;
}

function formatChlorineDate(timestamp: number, timezone?: string): string {
  const tz = timezone ?? "UTC";
  const date = new Date(timestamp);
  const weekday = getShortWeekdayFormatter(tz)
    .format(date)
    .toUpperCase();
  const monthDay = getShortDateFormatter(tz)
    .format(date)
    .replace(/\//g, ".");
  return `${weekday} ${monthDay}`;
}

/**
 * Splits a `name` (and optional `secondaryTitle`) on the editorial `·`
 * separator the design uses for multi-act lineups. Falls back to the raw
 * strings when `·` isn't present so events with a single act render on one
 * line.
 */
function buildLineupLines(
  name: string,
  secondaryTitle: string | null | undefined,
): string[] {
  const lines: string[] = [];
  for (const part of name.split("·")) {
    const trimmed = part.trim();
    if (trimmed.length > 0) lines.push(trimmed);
  }
  if (secondaryTitle) {
    for (const part of secondaryTitle.split("·")) {
      const trimmed = part.trim();
      if (trimmed.length > 0) lines.push(trimmed);
    }
  }
  return lines.length > 0 ? lines : [name];
}
