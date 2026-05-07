"use client";

import { useMemo } from "react";
import { useQuery } from "convex/react";
import { api } from "@convex/_generated/api";
import {
  isEventOpenForRsvp,
  resolveEventRsvpCutoff,
} from "@coucou/sdk/shared/event-availability";
import {
  ChlorineLanding,
  type ChlorineLandingEvent,
} from "@coucou/ui/tenant-template";
import {
  formatPublicEventActLabel,
  getPublicEventActs,
} from "@/lib/event-lineup";
import { siteConfiguration } from "@/lib/site";

function formatLandingDate(timestamp: number, timezone?: string): string {
  const dateFormatter = new Intl.DateTimeFormat("en-US", {
    weekday: "short",
    month: "2-digit",
    day: "2-digit",
    timeZone: timezone ?? "UTC",
  });
  const parts = dateFormatter.formatToParts(new Date(timestamp));
  const weekday =
    parts.find((part) => part.type === "weekday")?.value.toUpperCase() ?? "";
  const month = parts.find((part) => part.type === "month")?.value ?? "";
  const day = parts.find((part) => part.type === "day")?.value ?? "";
  return `${weekday} ${month}.${day}`;
}

export default function Home() {
  const allEvents = useQuery(api.events.listAll, {
    siteKey: siteConfiguration.siteKey,
  });

  const landingEvents = useMemo<ChlorineLandingEvent[]>(() => {
    if (!allEvents) return [];
    const now = Date.now();
    return allEvents
      .filter((event) => resolveEventRsvpCutoff(event) >= now)
      .sort(
        (firstEvent, secondEvent) =>
          firstEvent.eventDate - secondEvent.eventDate,
      )
      .map((event) => {
        const eventIsOpen = isEventOpenForRsvp(event);
        return {
          id: event._id,
          date: formatLandingDate(event.eventDate, event.eventTimezone),
          lineup: getPublicEventActs(event).map((act) => ({
            label: formatPublicEventActLabel(act),
            href: act.socialUrl,
          })),
          rsvpHref: `/events/${event._id}/rsvp`,
          rsvpLabel: eventIsOpen ? "RSVP" : "CLOSED",
          rsvpDisabled: !eventIsOpen,
        };
      });
  }, [allEvents]);

  const isLoadingEvents = allEvents === undefined;

  return (
    <ChlorineLanding
      events={landingEvents}
      emptyState={
        isLoadingEvents ? null : (
          <div
            style={{
              fontFamily:
                'var(--font-geist-mono), "Geist Mono", ui-monospace, monospace',
              fontSize: 12,
              letterSpacing: "0.08em",
              color: "var(--tt-fg-mute)",
              textTransform: "uppercase",
              textAlign: "center",
            }}
          >
            No upcoming events
          </div>
        )
      }
    />
  );
}
