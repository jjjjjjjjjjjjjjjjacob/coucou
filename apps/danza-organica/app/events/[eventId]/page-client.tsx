"use client";
import { useAuth } from "@clerk/nextjs";
import { api } from "@convex/_generated/api";
import { isEventOpenForRsvp, resolveEventRsvpCutoff } from "@coucou/sdk/shared/event-availability";
import { getEventRouteId } from "@coucou/sdk/shared/event-routes";
import { useQuery } from "convex/react";
import { useSearchParams } from "next/navigation";
import { use, useMemo } from "react";
import { DanzaBauhausEvent, DanzaBauhausPage } from "@/components/danza-bauhaus-event";
import { DanzaPresentationDetails } from "@/components/danza-event-detail-sections";
import type { DanzaLandingEvent } from "@/components/danza-event-row";
import { EventReferralShareButton } from "@/components/event-referral-share-button";
import { Spinner } from "@/components/ui/spinner";
import {
  DANZA_BAUHAUS_EVENT_TIME,
  formatCompactBauhausDate,
  formatExpandedBauhausDate,
} from "@/lib/bauhaus-event-display";
import { getPublicEventActs } from "@/lib/event-lineup";
import { buildRsvpPathForViewport, useRsvpFlowViewport } from "@/lib/rsvp-flow-routing";
import { buildPathWithPreservedQuery } from "@/lib/rsvp-url-state";
import { siteConfiguration } from "@/lib/site";
import type { Event as ClubEvent, RSVP } from "@/lib/types";

interface EventPageClientProps {
  params: Promise<{ eventId: string }>;
}

type UserEventRsvpStatus = {
  status?: RSVP["status"];
} | null;

export default function EventPageClient({ params }: EventPageClientProps) {
  const { eventId: eventRouteId } = use(params);
  const searchParams = useSearchParams();
  const { isLoaded, isSignedIn } = useAuth();

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
          fontFamily: "var(--tt-text)",
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

  const expandedContent =
    resolvedFocusedEvent.productionCompany || resolvedFocusedEvent.description ? (
      <DanzaPresentationDetails
        productionCompany={resolvedFocusedEvent.productionCompany}
        description={resolvedFocusedEvent.description}
      />
    ) : undefined;

  // If the focused event is the only thing to show, render just it expanded.
  // Otherwise render every event as a row, expanding the focused one and
  // minimizing siblings.
  const allRows: Array<{
    landingEvent: DanzaLandingEvent;
    isFocused: boolean;
    sourceEvent: ClubEvent;
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
        title: resolvedFocusedEvent.name,
        subtitle: resolvedFocusedEvent.secondaryTitle,
        hosts: resolvedFocusedEvent.hosts,
        date: formatExpandedBauhausDate(
          resolvedFocusedEvent.eventDate,
          resolvedFocusedEvent.eventTimezone,
        ),
        compactDate: formatCompactBauhausDate(
          resolvedFocusedEvent.eventDate,
          resolvedFocusedEvent.eventTimezone,
        ),
        location: resolvedFocusedEvent.location,
        time: DANZA_BAUHAUS_EVENT_TIME,
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
      sourceEvent: resolvedFocusedEvent,
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
        title: event.name,
        subtitle: event.secondaryTitle,
        hosts: event.hosts,
        date: formatExpandedBauhausDate(event.eventDate, event.eventTimezone),
        compactDate: formatCompactBauhausDate(event.eventDate, event.eventTimezone),
        location: event.location,
        time: DANZA_BAUHAUS_EVENT_TIME,
        lineup: getPublicEventActs(event).map((act) => ({
          label: act.displayName,
          descriptorBadges: act.descriptorBadges,
          href: act.socialUrl,
        })),
        rsvpHref: isFocused ? focusedBrickHref : rsvpFormHref,
        rsvpLabel: isFocused ? focusedBrickLabel : eventIsOpen ? "RSVP" : "CLOSED",
        rsvpDisabled: isFocused
          ? focusedBrickDisabled
          : !eventIsOpen || rsvpFlowViewport === "unknown",
      },
      isFocused,
      sourceEvent: event,
    });
  }

  return (
    <DanzaBauhausPage>
      {allRows.map((row) => (
        <DanzaBauhausEvent
          key={row.landingEvent.id}
          event={row.landingEvent}
          sponsors={row.sourceEvent.sponsors}
          partners={row.sourceEvent.eventPartners}
          expandedContent={row.isFocused ? expandedContent : undefined}
          utilitySlot={
            row.isFocused && isSignedIn ? (
              <EventReferralShareButton event={resolvedFocusedEvent} showLabel={false} />
            ) : undefined
          }
        />
      ))}
    </DanzaBauhausPage>
  );
}
