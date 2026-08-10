"use client";

import { useAuth } from "@clerk/nextjs";
import { api } from "@convex/_generated/api";
import type { Id } from "@convex/_generated/dataModel";
import { isEventOpenForRsvp, resolveEventRsvpCutoff } from "@coucou/sdk/shared/event-availability";
import { getEventRouteId } from "@coucou/sdk/shared/event-routes";
import { useQuery } from "convex/react";
import { useSearchParams } from "next/navigation";
import { Suspense, useMemo } from "react";
import { DanzaBauhausEvent, DanzaBauhausPage } from "@/components/danza-bauhaus-event";
import { DanzaPresentationDetails } from "@/components/danza-event-detail-sections";
import type { DanzaLandingEvent } from "@/components/danza-event-row";
import { EventReferralShareButton } from "@/components/event-referral-share-button";
import { EventThemeProvider } from "@/components/event-theme-provider";
import { getPublicEventActs } from "@/lib/event-lineup";
import {
  buildRsvpPathForViewport,
  type RsvpFlowViewport,
  useRsvpFlowViewport,
} from "@/lib/rsvp-flow-routing";
import { buildPathWithPreservedQuery } from "@/lib/rsvp-url-state";
import { siteConfiguration } from "@/lib/site";
import type { Event as ClubEvent } from "@/lib/types";

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

interface LandingRowSeed {
  sourceEvent: ClubEvent;
  eventId: Id<"events">;
  routeId: string;
  expandedDate: string;
  lineup: DanzaLandingEvent["lineup"];
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
        sourceEvent: event,
        eventId: event._id,
        routeId: getEventRouteId(event),
        expandedDate: formatExpandedDate(event.eventDate, event.eventTimezone),
        lineup: getPublicEventActs(event).map((act) => ({
          label: act.displayName,
          descriptorBadges: act.descriptorBadges,
          href: act.socialUrl,
        })),
        isOpenForRsvp: isEventOpenForRsvp(event),
      }));
  }, [allEvents]);

  const isLoadingEvents = allEvents === undefined;
  const rsvpFlowViewport = useRsvpFlowViewport();
  const takeoverEvent = landingRowSeeds[0]?.sourceEvent;
  const takeoverIconResponse = useQuery(
    api.files.getUrl,
    takeoverEvent?.customIconStorageId ? { storageId: takeoverEvent.customIconStorageId } : "skip",
  );

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
    <EventThemeProvider
      event={takeoverEvent ?? null}
      iconUrl={takeoverIconResponse?.url}
      brandingSourceId={takeoverEvent ? `home-event:${takeoverEvent._id}` : null}
    >
      <DanzaBauhausPage>
        {landingRowSeeds.map((rowSeed, index) => (
          <HomeEventRow
            key={rowSeed.eventId}
            rowSeed={rowSeed}
            searchParams={searchParams}
            rsvpFlowViewport={rsvpFlowViewport}
            isFirstEvent={index === 0}
          />
        ))}
      </DanzaBauhausPage>
    </EventThemeProvider>
  );
}

interface HomeEventRowProps {
  rowSeed: LandingRowSeed;
  searchParams: ReturnType<typeof useSearchParams>;
  rsvpFlowViewport: RsvpFlowViewport;
  isFirstEvent: boolean;
}

/**
 * Adds RSVP-aware actions to each full-screen poster. When a guest already
 * has an RSVP, the action routes to their ticket or status instead of opening
 * a fresh form.
 */
function HomeEventRow({
  rowSeed,
  searchParams,
  rsvpFlowViewport,
  isFirstEvent,
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

  const event: DanzaLandingEvent = {
    id: rowSeed.routeId,
    title: rowSeed.sourceEvent.name,
    subtitle: rowSeed.sourceEvent.secondaryTitle,
    hosts: rowSeed.sourceEvent.hosts,
    date: rowSeed.expandedDate,
    location: rowSeed.sourceEvent.location,
    lineup: rowSeed.lineup,
    rsvpHref: brickHref,
    rsvpLabel: brickLabel,
    rsvpDisabled: brickDisabled,
  };

  const expandedContent =
    rowSeed.sourceEvent.productionCompany || rowSeed.sourceEvent.description ? (
      <DanzaPresentationDetails
        productionCompany={rowSeed.sourceEvent.productionCompany}
        description={rowSeed.sourceEvent.description}
      />
    ) : undefined;

  return (
    <DanzaBauhausEvent
      event={event}
      sponsors={rowSeed.sourceEvent.sponsors}
      partners={rowSeed.sourceEvent.eventPartners}
      expandedContent={expandedContent}
      utilitySlot={
        isFirstEvent && isSignedIn ? (
          <EventReferralShareButton event={rowSeed.sourceEvent} showLabel={false} />
        ) : undefined
      }
    />
  );
}
