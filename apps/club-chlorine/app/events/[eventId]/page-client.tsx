"use client";
import React, { use, useCallback, useEffect, useMemo } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { useQuery } from "@tanstack/react-query";
import { convexQuery } from "@convex-dev/react-query";
import { api } from "@convex/_generated/api";
import type { Id } from "@convex/_generated/dataModel";
import { Spinner } from "@/components/ui/spinner";
import {
  TenantTemplateProvider,
  TenantLanding,
  TenantButton,
  type TenantLandingEvent,
} from "@coucou/ui/tenant-template";
import { siteConfiguration } from "@/lib/site";
import { getPublicEventActs } from "@/lib/event-lineup";

interface EventPageClientProps {
  params: Promise<{ eventId: string }>;
}

function formatWhenLabel(timestamp: number, timezone: string | undefined): string {
  const date = new Date(timestamp);
  const day = date.toLocaleDateString(undefined, {
    weekday: "long",
    timeZone: timezone ?? "UTC",
  });
  const formattedDate = date
    .toLocaleDateString("en-US", {
      month: "2-digit",
      day: "2-digit",
      year: "2-digit",
      timeZone: timezone ?? "UTC",
    })
    .replace(/\//g, ".");
  return `${day} ${formattedDate}`;
}

export default function EventPageClient({ params }: EventPageClientProps) {
  const { eventId } = use(params);
  const router = useRouter();
  const searchParams = useSearchParams();

  const eventQuery = useQuery(
    convexQuery(api.events.get, { eventId: eventId as Id<"events"> }),
  );
  const event = eventQuery.data;

  const queryParamPassword = searchParams?.get("password") ?? "";

  // Preserve any inbound /events/{id}?password=foo deep links by forwarding
  // them to the new full-page RSVP gate.
  useEffect(() => {
    if (!queryParamPassword) return;
    const passwordSearch = new URLSearchParams({
      password: queryParamPassword,
    }).toString();
    router.replace(`/events/${eventId}/rsvp?${passwordSearch}`);
  }, [queryParamPassword, eventId, router]);

  const handleRsvpClick = useCallback(() => {
    if (event?.status !== "active") return;
    router.push(`/events/${eventId}/rsvp`);
  }, [event?.status, router, eventId]);

  const tenantLandingEvent = useMemo<TenantLandingEvent | null>(() => {
    if (!event) return null;
    return {
      name: event.name,
      secondaryTitle: event.secondaryTitle ?? null,
      whenLabel: event.eventDate
        ? formatWhenLabel(event.eventDate, event.eventTimezone)
        : null,
      whereLabel: event.location ?? null,
      lede: event.description ?? null,
      lineup: getPublicEventActs(event).map((act) => ({
        displayName: act.displayName,
        descriptorBadges: act.descriptorBadges,
        socialUrl: act.socialUrl,
      })),
    };
  }, [event]);

  if (eventQuery.isLoading || !event || !tenantLandingEvent) {
    return (
      <main className="flex min-h-screen items-center justify-center p-6">
        <div className="flex animate-in fade-in items-center justify-center py-10 text-primary">
          <Spinner />
        </div>
      </main>
    );
  }

  return (
    <TenantTemplateProvider
      siteConfigurationPreset={siteConfiguration.preset}
      event={event}
    >
      <TenantLanding
        event={tenantLandingEvent}
        primaryCta={
          <TenantButton
            type="button"
            onClick={handleRsvpClick}
            disabled={event.status !== "active"}
          >
            {event.status === "active" ? "RSVP" : "RSVP CLOSED"}
          </TenantButton>
        }
      />
    </TenantTemplateProvider>
  );
}
