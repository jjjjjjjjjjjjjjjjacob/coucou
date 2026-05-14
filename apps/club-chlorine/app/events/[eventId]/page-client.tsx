"use client";
import { useAuth } from "@clerk/nextjs";
import { api } from "@convex/_generated/api";
import { isEventOpenForRsvp, resolveEventRsvpCutoff } from "@coucou/sdk/shared/event-availability";
import { getEventRouteId } from "@coucou/sdk/shared/event-routes";
import { ChlorineEventRow, type ChlorineLandingEvent, useMobile } from "@coucou/ui/tenant-template";
import { useQuery } from "convex/react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import type React from "react";
import { use, useMemo } from "react";
import { EventReferralShareButton } from "@/components/event-referral-share-button";
import { Spinner } from "@/components/ui/spinner";
import { getPublicEventActs } from "@/lib/event-lineup";
import { buildRsvpPathForViewport, useRsvpFlowViewport } from "@/lib/rsvp-flow-routing";
import {
  buildEventDetailPathWithPreservedQuery,
  buildPathWithPreservedQuery,
} from "@/lib/rsvp-url-state";
import { siteConfiguration } from "@/lib/site";
import type { Event as ClubEvent, RSVP } from "@/lib/types";

interface EventPageClientProps {
  params: Promise<{ eventId: string }>;
}

type UserEventRsvpStatus = {
  status?: RSVP["status"];
} | null;

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

function formatExpandedDate(timestamp: number, timezone?: string): string {
  const date = new Date(timestamp);
  const day = date.toLocaleDateString("en-US", {
    weekday: "long",
    timeZone: timezone ?? "UTC",
  });
  const formatted = date
    .toLocaleDateString("en-US", {
      month: "2-digit",
      day: "2-digit",
      year: "2-digit",
      timeZone: timezone ?? "UTC",
    })
    .replace(/\//g, ".");
  const time = date.toLocaleTimeString("en-US", {
    hour: "numeric",
    minute: "2-digit",
    hour12: true,
    timeZone: timezone ?? "UTC",
  });
  return `${day} ${formatted} · ${time}`;
}

function formatEndTime(timestamp: number, timezone?: string): string {
  return new Date(timestamp).toLocaleTimeString("en-US", {
    hour: "numeric",
    minute: "2-digit",
    hour12: true,
    timeZone: timezone ?? "UTC",
  });
}

const monoLabelStyle: React.CSSProperties = {
  fontFamily: 'var(--font-geist-mono), "Geist Mono", "JetBrains Mono", ui-monospace, monospace',
  fontSize: 11,
  letterSpacing: "0.1em",
  textTransform: "uppercase",
  color: "var(--tt-fg-mute)",
};

const monoBodyStyle: React.CSSProperties = {
  fontFamily: 'var(--font-geist-mono), "Geist Mono", "JetBrains Mono", ui-monospace, monospace',
  fontSize: 12,
  letterSpacing: "0.04em",
  color: "var(--tt-fg-dim)",
};

export default function EventPageClient({ params }: EventPageClientProps) {
  const { eventId: eventRouteId } = use(params);
  const searchParams = useSearchParams();
  const { isLoaded, isSignedIn } = useAuth();

  const isMobile = useMobile();
  const rsvpFlowViewport = useRsvpFlowViewport();
  const allEvents = useQuery(api.events.listAll, {
    siteKey: siteConfiguration.siteKey,
  }) as ClubEvent[] | undefined;
  const focusedEvent = useQuery(api.events.getByRouteId, {
    eventRouteId,
    siteKey: siteConfiguration.siteKey,
  }) as ClubEvent | null | undefined;
  const focusedEventStatus = useQuery(api.rsvps.statusForUserEventByRouteId, {
    eventRouteId,
    siteKey: siteConfiguration.siteKey,
  }) as UserEventRsvpStatus | undefined;

  const orderedEvents = useMemo(() => {
    if (!allEvents) return [];
    const now = Date.now();
    return allEvents
      .filter((event) => resolveEventRsvpCutoff(event) >= now)
      .sort((firstEvent, secondEvent) => firstEvent.eventDate - secondEvent.eventDate);
  }, [allEvents]);

  const focusedEventInList = useMemo(() => {
    return (
      orderedEvents.find(
        (event) => event._id === focusedEvent?._id || getEventRouteId(event) === eventRouteId,
      ) ?? null
    );
  }, [orderedEvents, focusedEvent?._id, eventRouteId]);

  // The focused event may have already passed (cutoff in the past). When
  // that happens it won't be in `orderedEvents`; we still want to render
  // its detail panel via the `focusedEvent` query.
  const resolvedFocusedEvent = focusedEventInList ?? focusedEvent ?? null;

  if (allEvents === undefined || focusedEvent === undefined) {
    return (
      <div className="flex items-center justify-center py-10 text-primary">
        <Spinner />
      </div>
    );
  }

  if (!resolvedFocusedEvent) {
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
        Event not found.
      </div>
    );
  }

  // When the user already has an RSVP, replace the standard "RSVP" brick
  // with a contextual one that jumps straight to their existing status or
  // ticket. There's no separate pill — the brick itself becomes the link.
  const focusedEventIsOpen = isEventOpenForRsvp(resolvedFocusedEvent);
  const focusedRsvpStatus = focusedEventStatus?.status;
  const focusedHasRsvp =
    focusedRsvpStatus === "pending" ||
    focusedRsvpStatus === "approved" ||
    focusedRsvpStatus === "denied";
  const focusedRsvpStatusIsLoading = !isLoaded || (isSignedIn && focusedEventStatus === undefined);
  const focusedExistingRsvpHref =
    focusedRsvpStatus === "approved"
      ? buildPathWithPreservedQuery(`/events/${eventRouteId}/ticket`, searchParams, ["step"])
      : focusedRsvpStatus === "pending" || focusedRsvpStatus === "denied"
        ? buildPathWithPreservedQuery(`/events/${eventRouteId}/status`, searchParams, ["step"])
        : null;
  let focusedRsvpFormHref: string | undefined;
  if (!focusedExistingRsvpHref && focusedEventIsOpen && !focusedRsvpStatusIsLoading) {
    focusedRsvpFormHref = buildRsvpPathForViewport(eventRouteId, searchParams, rsvpFlowViewport);
  }
  const focusedBrickHref = focusedExistingRsvpHref ?? focusedRsvpFormHref;
  const focusedBrickLabel =
    focusedRsvpStatus === "approved"
      ? "TICKET"
      : focusedRsvpStatus === "pending"
        ? "MY RSVP"
        : focusedRsvpStatus === "denied"
          ? "STATUS"
          : focusedEventIsOpen
            ? "RSVP"
            : "CLOSED";

  const expandedContent = (
    <div className="flex flex-col gap-5">
      <dl className="grid gap-x-6 gap-y-2" style={{ gridTemplateColumns: "min-content 1fr" }}>
        <dt style={monoLabelStyle}>When</dt>
        <dd style={monoBodyStyle}>
          {formatExpandedDate(resolvedFocusedEvent.eventDate, resolvedFocusedEvent.eventTimezone)}
          {resolvedFocusedEvent.eventEndDate ? (
            <span>
              {" "}
              — until{" "}
              {formatEndTime(resolvedFocusedEvent.eventEndDate, resolvedFocusedEvent.eventTimezone)}
            </span>
          ) : null}
        </dd>
        {resolvedFocusedEvent.location ? (
          <>
            <dt style={monoLabelStyle}>Where</dt>
            <dd style={monoBodyStyle}>{resolvedFocusedEvent.location}</dd>
          </>
        ) : null}
        {resolvedFocusedEvent.hosts && resolvedFocusedEvent.hosts.length > 0 ? (
          <>
            <dt style={monoLabelStyle}>Hosts</dt>
            <dd style={monoBodyStyle}>{resolvedFocusedEvent.hosts.join(", ")}</dd>
          </>
        ) : null}
        {resolvedFocusedEvent.productionCompany ? (
          <>
            <dt style={monoLabelStyle}>Presented by</dt>
            <dd style={monoBodyStyle}>{resolvedFocusedEvent.productionCompany}</dd>
          </>
        ) : null}
      </dl>

      {resolvedFocusedEvent.description ? (
        <p
          className="m-0 max-w-[540px]"
          style={{
            fontSize: 13,
            lineHeight: 1.65,
            color: "var(--tt-fg-dim)",
          }}
        >
          {resolvedFocusedEvent.description}
        </p>
      ) : null}
    </div>
  );

  // If the focused event is the only thing to show, render just it expanded.
  // Otherwise render every event as a row, expanding the focused one and
  // minimizing siblings.
  const allRows: Array<{
    landingEvent: ChlorineLandingEvent;
    isFocused: boolean;
  }> = [];

  // The brick on the focused row is contextual: when the user already has
  // an RSVP it routes straight to their status/ticket and is never
  // disabled. Otherwise it's the standard CLOSED-aware RSVP brick.
  const focusedBrickDisabled = focusedHasRsvp
    ? false
    : !focusedEventIsOpen || focusedRsvpStatusIsLoading || rsvpFlowViewport === "unknown";

  // Include the focused event even if it's not in `orderedEvents` (e.g. its
  // RSVP cutoff has already passed but the user navigated to it directly).
  if (!focusedEventInList && resolvedFocusedEvent) {
    allRows.push({
      landingEvent: {
        id: eventRouteId,
        date: formatLandingDate(resolvedFocusedEvent.eventDate, resolvedFocusedEvent.eventTimezone),
        lineup: getPublicEventActs(resolvedFocusedEvent).map((act) => ({
          label: act.displayName,
          descriptorBadges: act.descriptorBadges,
          // The focused row is variant="expanded" → row is a div, no
          // outer anchor — so we can wrap individual lineup names in a
          // social-link `<a>` without triggering the nested-anchor
          // hydration warning.
          href: act.socialUrl,
        })),
        rsvpHref: focusedBrickHref,
        rsvpLabel: focusedBrickLabel,
        rsvpDisabled: focusedBrickDisabled,
      },
      isFocused: true,
    });
  }

  for (const event of orderedEvents) {
    const eventIsOpen = isEventOpenForRsvp(event);
    const eventRouteIdentifier = getEventRouteId(event);
    const isFocused = event._id === resolvedFocusedEvent._id;
    let rsvpFormHref: string | undefined;
    if (!isFocused && eventIsOpen) {
      rsvpFormHref = buildRsvpPathForViewport(eventRouteIdentifier, searchParams, rsvpFlowViewport);
    }
    allRows.push({
      landingEvent: {
        id: eventRouteIdentifier,
        date: formatLandingDate(event.eventDate, event.eventTimezone),
        lineup: getPublicEventActs(event).map((act) => ({
          label: act.displayName,
          descriptorBadges: act.descriptorBadges,
          // Only the focused/expanded row exposes social links — minimized
          // sibling rows get joined into a single line and would otherwise
          // nest anchors inside their detailHref wrap.
          href: isFocused ? act.socialUrl : undefined,
        })),
        rsvpHref: isFocused ? focusedBrickHref : rsvpFormHref,
        rsvpLabel: isFocused ? focusedBrickLabel : eventIsOpen ? "RSVP" : "CLOSED",
        rsvpDisabled: isFocused
          ? focusedBrickDisabled
          : !eventIsOpen || rsvpFlowViewport === "unknown",
      },
      isFocused,
    });
  }

  return (
    <div>
      {allRows.map((row, index) => (
        <div key={row.landingEvent.id}>
          {row.isFocused ? (
            <div
              style={{
                display: "flex",
                justifyContent: "flex-end",
                paddingBottom: 6,
              }}
            >
              <Link
                href={buildPathWithPreservedQuery("/", searchParams, ["step"])}
                style={{
                  fontFamily:
                    'var(--font-geist-mono), "Geist Mono", "JetBrains Mono", ui-monospace, monospace',
                  fontSize: 10,
                  fontWeight: 600,
                  letterSpacing: "0.08em",
                  textTransform: "uppercase",
                  color: "var(--tt-fg-mute)",
                  textDecoration: "none",
                }}
              >
                ← Back
              </Link>
            </div>
          ) : null}
          <ChlorineEventRow
            event={row.landingEvent}
            mobile={isMobile}
            visible
            delayMs={index * 90}
            linkComponent={Link}
            variant={row.isFocused ? "expanded" : "minimized"}
            detailHref={
              row.isFocused
                ? undefined
                : buildEventDetailPathWithPreservedQuery(row.landingEvent.id, searchParams)
            }
            bottomRightSlot={
              row.isFocused && isSignedIn ? (
                <EventReferralShareButton event={resolvedFocusedEvent} showLabel={false} />
              ) : undefined
            }
            expandedContent={row.isFocused ? expandedContent : undefined}
          />
        </div>
      ))}
    </div>
  );
}
