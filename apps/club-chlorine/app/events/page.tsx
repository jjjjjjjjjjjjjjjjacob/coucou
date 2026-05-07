"use client";

import Link from "next/link";
import { useMemo } from "react";
import { useQuery } from "convex/react";
import { api } from "@convex/_generated/api";
import {
  isEventOpenForRsvp,
  resolveEventRsvpCutoff,
} from "@coucou/sdk/shared/event-availability";
import {
  TenantShell,
  TenantTemplateProvider,
} from "@coucou/ui/tenant-template";
import { Spinner } from "@/components/ui/spinner";
import { formatPublicEventActLabel, getPublicEventActs } from "@/lib/event-lineup";
import { siteConfiguration } from "@/lib/site";

function formatEventDate(timestamp: number, timezone?: string): string {
  return new Date(timestamp).toLocaleDateString("en-US", {
    weekday: "long",
    month: "2-digit",
    day: "2-digit",
    year: "2-digit",
    timeZone: timezone ?? "UTC",
  });
}

function formatEventTime(timestamp: number, timezone?: string): string {
  return new Date(timestamp).toLocaleTimeString("en-US", {
    hour: "numeric",
    minute: "2-digit",
    hour12: true,
    timeZone: timezone ?? "UTC",
  });
}

export default function EventsPage() {
  const allEvents = useQuery(api.events.listAll, {
    siteKey: siteConfiguration.siteKey,
  });

  const events = useMemo(() => {
    if (!allEvents) return [];
    const now = Date.now();
    return allEvents
      .filter((event) => resolveEventRsvpCutoff(event) >= now)
      .sort((firstEvent, secondEvent) => firstEvent.eventDate - secondEvent.eventDate);
  }, [allEvents]);

  if (allEvents === undefined) {
    return (
      <TenantTemplateProvider siteConfigurationPreset={siteConfiguration.preset}>
        <main className="flex min-h-[60vh] items-center justify-center p-6">
          <Spinner />
        </main>
      </TenantTemplateProvider>
    );
  }

  return (
    <TenantTemplateProvider siteConfigurationPreset={siteConfiguration.preset}>
      <TenantShell>
        <section className="py-14 sm:py-20">
          <div className="mb-10">
            <p
              className="mb-3 text-xs uppercase"
              style={{
                color: "var(--tt-fg-dim)",
                letterSpacing: "0.12em",
              }}
            >
              Club Chlorine
            </p>
            <h1
              className="m-0 text-4xl sm:text-5xl"
              style={{
                color: "var(--tt-fg)",
                fontFamily: "var(--tt-display)",
              }}
            >
              Events
            </h1>
          </div>

          {events.length === 0 ? (
            <div
              className="border-y py-10 text-sm"
              style={{
                borderColor: "var(--tt-rule)",
                color: "var(--tt-fg-dim)",
              }}
            >
              No open event listings right now.
            </div>
          ) : (
            <div
              className="divide-y border-y"
              style={{ borderColor: "var(--tt-rule)" }}
            >
              {events.map((event) => {
                const eventIsOpen = isEventOpenForRsvp(event);
                const eventActs = getPublicEventActs(event)
                  .map((act) => formatPublicEventActLabel(act))
                  .join(" · ");

                return (
                  <article
                    key={event._id}
                    className="grid gap-5 py-6 sm:grid-cols-[10rem_minmax(0,1fr)_auto] sm:items-center"
                    style={{ borderColor: "var(--tt-rule)" }}
                  >
                    <div
                      className="text-sm uppercase"
                      style={{
                        color: "var(--tt-fg-dim)",
                        fontFamily: "var(--tt-mono)",
                        letterSpacing: "0.08em",
                      }}
                    >
                      <div>{formatEventDate(event.eventDate, event.eventTimezone)}</div>
                      <div>{formatEventTime(event.eventDate, event.eventTimezone)}</div>
                    </div>

                    <div>
                      <Link
                        href={`/events/${event._id}`}
                        className="text-2xl no-underline"
                        style={{
                          color: "var(--tt-fg)",
                          fontFamily: "var(--tt-display)",
                        }}
                      >
                        {event.name}
                      </Link>
                      {event.secondaryTitle ? (
                        <div
                          className="mt-1 text-sm"
                          style={{ color: "var(--tt-fg-dim)" }}
                        >
                          {event.secondaryTitle}
                        </div>
                      ) : null}
                      <div
                        className="mt-3 text-sm"
                        style={{ color: "var(--tt-fg-dim)" }}
                      >
                        {eventActs || event.location}
                      </div>
                    </div>

                    <div className="flex flex-wrap gap-3 sm:justify-end">
                      <Link
                        href={`/events/${event._id}`}
                        className="inline-flex items-center justify-center border px-4 py-2 text-sm no-underline"
                        style={{
                          borderColor: "var(--tt-rule-strong)",
                          color: "var(--tt-fg)",
                          fontFamily: "var(--tt-text)",
                        }}
                      >
                        Details
                      </Link>
                      {eventIsOpen ? (
                        <Link
                          href={`/events/${event._id}/rsvp`}
                          className="inline-flex items-center justify-center border px-4 py-2 text-sm no-underline"
                          style={{
                            borderColor: "var(--tt-fg)",
                            background: "var(--tt-fg)",
                            color: "var(--tt-bg)",
                            fontFamily: "var(--tt-text)",
                          }}
                        >
                          RSVP
                        </Link>
                      ) : (
                        <span
                          className="inline-flex items-center justify-center border px-4 py-2 text-sm"
                          style={{
                            borderColor: "var(--tt-rule)",
                            color: "var(--tt-fg-mute)",
                            fontFamily: "var(--tt-text)",
                          }}
                        >
                          RSVP closed
                        </span>
                      )}
                    </div>
                  </article>
                );
              })}
            </div>
          )}
        </section>
      </TenantShell>
    </TenantTemplateProvider>
  );
}
