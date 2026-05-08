"use client";

import { useAuth } from "@clerk/nextjs";
import { api } from "@convex/_generated/api";
import type { Id } from "@convex/_generated/dataModel";
import { isEventOpenForRsvp, resolveEventRsvpCutoff } from "@coucou/sdk/shared/event-availability";
import { ChlorineEventRow, type ChlorineLandingEvent, useMobile } from "@coucou/ui/tenant-template";
import { useQuery } from "convex/react";
import Link from "next/link";
import { useMemo } from "react";
import { getPublicEventActs } from "@/lib/event-lineup";
import { siteConfiguration } from "@/lib/site";

function formatLandingDate(timestamp: number, timezone?: string): string {
  const dateFormatter = new Intl.DateTimeFormat("en-US", {
    weekday: "short",
    month: "2-digit",
    day: "2-digit",
    timeZone: timezone ?? "UTC",
  });
  const parts = dateFormatter.formatToParts(new Date(timestamp));
  const weekday = parts.find((part) => part.type === "weekday")?.value.toUpperCase() ?? "";
  const month = parts.find((part) => part.type === "month")?.value ?? "";
  const day = parts.find((part) => part.type === "day")?.value ?? "";
  return `${weekday} ${month}.${day}`;
}

interface LandingRowSeed {
  id: Id<"events">;
  date: string;
  lineup: ChlorineLandingEvent["lineup"];
  isOpenForRsvp: boolean;
}

export default function Home() {
  const allEvents = useQuery(api.events.listAll, {
    siteKey: siteConfiguration.siteKey,
  });

  const landingRowSeeds = useMemo<LandingRowSeed[]>(() => {
    if (!allEvents) return [];
    const now = Date.now();
    return allEvents
      .filter((event) => resolveEventRsvpCutoff(event) >= now)
      .sort((firstEvent, secondEvent) => firstEvent.eventDate - secondEvent.eventDate)
      .map((event) => ({
        id: event._id,
        date: formatLandingDate(event.eventDate, event.eventTimezone),
        lineup: getPublicEventActs(event).map((act) => ({
          label: act.displayName,
          descriptorBadges: act.descriptorBadges,
        })),
        isOpenForRsvp: isEventOpenForRsvp(event),
      }));
  }, [allEvents]);

  const isLoadingEvents = allEvents === undefined;
  const isMobile = useMobile();

  if (isLoadingEvents) {
    return null;
  }

  if (landingRowSeeds.length === 0) {
    return (
      <div
        style={{
          fontFamily: 'var(--font-geist-mono), "Geist Mono", ui-monospace, monospace',
          fontSize: 12,
          letterSpacing: "0.08em",
          color: "var(--tt-fg-mute)",
          textTransform: "uppercase",
          textAlign: "center",
        }}
      >
        No upcoming events
      </div>
    );
  }

  return (
    <div>
      {landingRowSeeds.map((rowSeed, index) => (
        <HomeEventRow key={rowSeed.id} rowSeed={rowSeed} mobile={isMobile} delayMs={index * 140} />
      ))}
    </div>
  );
}

interface HomeEventRowProps {
  rowSeed: LandingRowSeed;
  mobile: boolean;
  delayMs: number;
}

/**
 * Wraps `ChlorineEventRow` with the same contextual brick logic as the
 * event detail page: when the user already has an RSVP for this event the
 * brick routes them to their existing ticket / status surface instead of
 * the RSVP form. Each row owns its own RSVP-status subscription so the
 * homepage stays reactive without a batch query.
 */
function HomeEventRow({ rowSeed, mobile, delayMs }: HomeEventRowProps) {
  const { isSignedIn, isLoaded } = useAuth();
  const rsvpStatus = useQuery(
    api.rsvps.statusForUserEvent,
    isLoaded && isSignedIn ? { eventId: rowSeed.id, siteKey: siteConfiguration.siteKey } : "skip",
  );

  const status = rsvpStatus?.status;
  const hasRsvp =
    status === "pending" || status === "approved" || status === "attending" || status === "denied";
  const existingRsvpHref =
    status === "approved" || status === "attending"
      ? `/events/${rowSeed.id}/ticket`
      : status === "pending" || status === "denied"
        ? `/events/${rowSeed.id}/status`
        : null;
  const brickHref = existingRsvpHref ?? `/events/${rowSeed.id}/rsvp`;
  const brickLabel =
    status === "approved" || status === "attending"
      ? "TICKET"
      : status === "pending"
        ? "MY RSVP"
        : status === "denied"
          ? "STATUS"
          : rowSeed.isOpenForRsvp
            ? "RSVP"
            : "CLOSED";
  const brickDisabled = hasRsvp ? false : !rowSeed.isOpenForRsvp;

  const event: ChlorineLandingEvent = {
    id: rowSeed.id,
    date: rowSeed.date,
    lineup: rowSeed.lineup,
    rsvpHref: brickHref,
    rsvpLabel: brickLabel,
    rsvpDisabled: brickDisabled,
  };

  return (
    <ChlorineEventRow
      event={event}
      mobile={mobile}
      visible
      delayMs={delayMs}
      linkComponent={Link}
      detailHref={`/events/${rowSeed.id}`}
    />
  );
}
