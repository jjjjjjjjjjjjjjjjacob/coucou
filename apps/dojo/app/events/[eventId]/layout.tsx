import { api } from "@convex/_generated/api";
import { fetchQuery } from "convex/nextjs";
import type React from "react";
import { EventThemeProvider } from "@/components/event-theme-provider";
import { buildEventThemeStyle } from "@/lib/event-theme";

export default async function EventLayout({
  children,
  params,
}: {
  children: React.ReactNode;
  params: Promise<{ eventId: string }>;
}) {
  const { eventId: eventRouteId } = await params;
  const event = await fetchQuery(api.events.getByRouteId, {
    eventRouteId,
  }).catch((error) => {
    console.error("Failed to load event theme", error);
    return null;
  });
  let eventIconUrl: string | null = null;
  if (event?.customIconStorageId) {
    try {
      const iconResponse = await fetchQuery(api.files.getUrl, {
        storageId: event.customIconStorageId,
      });
      eventIconUrl = iconResponse?.url ?? null;
    } catch (error) {
      console.error("Failed to load event icon", error);
    }
  }
  const eventThemeStyle = buildEventThemeStyle(event ?? null);

  return (
    <EventThemeProvider
      event={event ?? null}
      iconUrl={eventIconUrl}
      brandingSourceId={event ? `event:${event._id}` : null}
    >
      <div className="min-h-screen" style={eventThemeStyle}>
        {children}
      </div>
    </EventThemeProvider>
  );
}
