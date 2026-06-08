"use client";

import { useAuth } from "@clerk/nextjs";
import { api } from "@convex/_generated/api";
import type { Id } from "@convex/_generated/dataModel";
import { isEventOpenForRsvp, resolveEventRsvpCutoff } from "@coucou/sdk/shared/event-availability";
import { getEventRouteId } from "@coucou/sdk/shared/event-routes";
import { ChlorineEventRow, type ChlorineLandingEvent, useMobile } from "@coucou/ui/tenant-template";
import { useQuery } from "convex/react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { Suspense, useMemo } from "react";
import { getPublicEventActs } from "@/lib/event-lineup";
import {
  buildRsvpPathForViewport,
  type RsvpFlowViewport,
  useRsvpFlowViewport,
} from "@/lib/rsvp-flow-routing";
import {
  buildEventDetailPathWithPreservedQuery,
  buildPathWithPreservedQuery,
} from "@/lib/rsvp-url-state";
import { siteConfiguration } from "@/lib/site";
import type { Event as ClubEvent } from "@/lib/types";

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
  eventId: Id<"events">;
  routeId: string;
  date: string;
  lineup: ChlorineLandingEvent["lineup"];
  isOpenForRsvp: boolean;
}

export default function Home() {
  return (
    <Suspense fallback={null}>
      <HomeContent />
    </Suspense>
  );
}

function HomeContent() {
  const searchParams = useSearchParams();
  const allEvents = useQuery(api.events.listAll, {
    siteKey: siteConfiguration.siteKey,
  }) as ClubEvent[] | undefined;

  const landingRowSeeds = useMemo<LandingRowSeed[]>(() => {
    if (!allEvents) return [];
    const now = Date.now();
    return allEvents
      .filter((event) => resolveEventRsvpCutoff(event) >= now)
      .sort((firstEvent, secondEvent) => firstEvent.eventDate - secondEvent.eventDate)
      .map((event) => ({
        eventId: event._id,
        routeId: getEventRouteId(event),
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
  const rsvpFlowViewport = useRsvpFlowViewport();

  if (isLoadingEvents) {
    return null;
  }

  if (landingRowSeeds.length === 0) {
    return (
      <div
        style={{
          fontFamily: "var(--tt-text)",
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
        <HomeEventRow
          key={rowSeed.eventId}
          rowSeed={rowSeed}
          mobile={isMobile}
          delayMs={index * 140}
          searchParams={searchParams}
          rsvpFlowViewport={rsvpFlowViewport}
        />
      ))}
    </div>
  );
}

interface HomeEventRowProps {
  rowSeed: LandingRowSeed;
  mobile: boolean;
  delayMs: number;
  searchParams: ReturnType<typeof useSearchParams>;
  rsvpFlowViewport: RsvpFlowViewport;
}

/**
 * Wraps `ChlorineEventRow` with the same contextual brick logic as the
 * event detail page: when the user already has an RSVP for this event the
 * brick routes them to their existing ticket / status surface instead of
 * the RSVP form. Each row owns its own RSVP-status subscription so the
 * homepage stays reactive without a batch query.
 */
function HomeEventRow({
  rowSeed,
  mobile,
  delayMs,
  searchParams,
  rsvpFlowViewport,
}: HomeEventRowProps) {
  const { isSignedIn, isLoaded } = useAuth();
  const rsvpStatus = useQuery(
    api.rsvps.statusForUserEvent,
    isLoaded && isSignedIn
      ? { eventId: rowSeed.eventId, siteKey: siteConfiguration.siteKey }
      : "skip",
  );

  const status = rsvpStatus?.status;
  const hasRsvp = status === "pending" || status === "approved" || status === "denied";
  const rsvpStatusIsLoading = !isLoaded || (isSignedIn && rsvpStatus === undefined);
  const existingRsvpHref =
    status === "approved"
      ? buildPathWithPreservedQuery(`/events/${rowSeed.routeId}/ticket`, searchParams, ["step"])
      : status === "pending" || status === "denied"
        ? buildPathWithPreservedQuery(`/events/${rowSeed.routeId}/status`, searchParams, ["step"])
        : null;
  let rsvpFormHref: string | undefined;
  if (!existingRsvpHref && rowSeed.isOpenForRsvp && !rsvpStatusIsLoading) {
    rsvpFormHref = buildRsvpPathForViewport(rowSeed.routeId, searchParams, rsvpFlowViewport);
  }
  const brickHref = existingRsvpHref ?? rsvpFormHref;
  const brickLabel =
    status === "approved"
      ? "TICKET"
      : status === "pending"
        ? "MY RSVP"
        : status === "denied"
          ? "STATUS"
          : rowSeed.isOpenForRsvp
            ? "RSVP"
            : "CLOSED";
  const rsvpFlowRouteIsLoading =
    !existingRsvpHref &&
    rowSeed.isOpenForRsvp &&
    !rsvpStatusIsLoading &&
    rsvpFlowViewport === "unknown";
  const brickDisabled = hasRsvp
    ? false
    : !rowSeed.isOpenForRsvp || rsvpStatusIsLoading || rsvpFlowRouteIsLoading;

  const event: ChlorineLandingEvent = {
    id: rowSeed.routeId,
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
      detailHref={buildEventDetailPathWithPreservedQuery(rowSeed.routeId, searchParams)}
    />
  );
}
