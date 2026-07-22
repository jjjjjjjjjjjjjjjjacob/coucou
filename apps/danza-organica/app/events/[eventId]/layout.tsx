import { api } from "@convex/_generated/api";
import type { Id } from "@convex/_generated/dataModel";
import { fetchQuery } from "convex/nextjs";
import type { Metadata } from "next";
import type React from "react";
import { cache } from "react";
import { EventThemeProvider } from "@/components/event-theme-provider";
import { formatEventDisplayName } from "@/lib/event-display";
import { danzaOrganicaIconPaths, siteConfiguration } from "@/lib/site";

type LayoutParams = Promise<{ eventId: string }>;

// React.cache() dedupes the Convex query across the metadata generator and
// the layout's render — Next.js calls generateMetadata and the layout
// component as separate render passes for the same request, and Convex's
// fetchQuery doesn't memoize across them by default.
const loadEventForLayout = cache(async (eventId: string) => {
  try {
    return await fetchQuery(api.events.getByRouteId, {
      eventRouteId: eventId,
      siteKey: siteConfiguration.siteKey,
    });
  } catch (error) {
    console.error("Failed to load event for layout", error);
    return null;
  }
});

const loadStorageUrl = cache(async (storageId: Id<"_storage">) => {
  try {
    const response = await fetchQuery(api.files.getUrl, { storageId });
    return response?.url ?? null;
  } catch (error) {
    console.error("Failed to load storage URL", error);
    return null;
  }
});

export async function generateMetadata({ params }: { params: LayoutParams }): Promise<Metadata> {
  const { eventId } = await params;
  const event = await loadEventForLayout(eventId);

  if (!event) {
    return {
      title: "Event Not Found | Danza Organica",
      description: "The requested event could not be found.",
    };
  }

  const eventDate = new Date(event.eventDate);
  const eventTimezone = event.eventTimezone ?? "UTC";
  const formattedDate = eventDate
    .toLocaleDateString("en-US", {
      month: "2-digit",
      day: "2-digit",
      year: "numeric",
      timeZone: eventTimezone,
    })
    .replace(/\//g, ".");

  const title = `Danza Organica | ${event.location} ${formattedDate}`;
  const eventDisplayName = formatEventDisplayName(event);
  const description = `Join us at ${eventDisplayName} on ${eventDate.toLocaleDateString("en-US", {
    weekday: "long",
    year: "numeric",
    month: "long",
    day: "numeric",
    timeZone: eventTimezone,
  })} at ${event.location}`;

  const flyerImageUrl = event.flyerStorageId ? await loadStorageUrl(event.flyerStorageId) : null;
  const eventIconUrl = event.customIconStorageId
    ? await loadStorageUrl(event.customIconStorageId)
    : null;

  // Prefer the event's flyer poster when available so a shared event /
  // rsvp link previews with the actual artwork. Fall back to the dynamic
  // /opengraph-image route — the blue swimmer brand mark — so we never
  // surface the legacy Dojo Pomodoro tomato or render an empty card.
  const ogImageUrl = flyerImageUrl ?? "/opengraph-image";

  const iconEntries = eventIconUrl
    ? [{ url: eventIconUrl }]
    : [
        {
          url: danzaOrganicaIconPaths.faviconIco,
          sizes: "any",
          type: "image/x-icon",
        },
        {
          url: danzaOrganicaIconPaths.faviconPng,
          sizes: "32x32",
          type: "image/png",
        },
        {
          url: danzaOrganicaIconPaths.icon192,
          sizes: "192x192",
          type: "image/png",
        },
      ];

  return {
    title,
    description,
    openGraph: {
      title,
      description,
      url: new URL(`/events/${eventId}`, siteConfiguration.domain).toString(),
      siteName: "Danza Organica",
      images: [
        {
          url: ogImageUrl,
          width: 1200,
          height: 630,
          alt: eventDisplayName,
        },
      ],
      locale: "en_US",
      type: "website",
    },
    twitter: {
      card: "summary_large_image",
      title,
      description,
      images: [ogImageUrl],
    },
    icons: {
      icon: iconEntries,
      apple: eventIconUrl ?? danzaOrganicaIconPaths.appleTouchIcon,
      shortcut: eventIconUrl ?? danzaOrganicaIconPaths.faviconIco,
    },
  };
}

export default async function EventLayout({
  children,
  params,
}: {
  children: React.ReactNode;
  params: LayoutParams;
}) {
  const { eventId } = await params;
  const event = await loadEventForLayout(eventId);
  const eventIconUrl = event?.customIconStorageId
    ? await loadStorageUrl(event.customIconStorageId)
    : null;

  // the shared chrome lives at the AppChrome level so it stays
  // mounted across every route. We only need to mutate the shared body /
  // root CSS variables here so the shell's `var(--tt-bg)` / `var(--tt-fg)`
  // pick up the event takeover colours.
  return (
    <EventThemeProvider
      event={event ?? null}
      iconUrl={eventIconUrl}
      brandingSourceId={event ? `event:${event._id}` : null}
    >
      {children}
    </EventThemeProvider>
  );
}
