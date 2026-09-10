"use client";

import { api } from "@convex/_generated/api";
import { useQuery } from "convex/react";
import { use } from "react";
import { EventEntry } from "@/components/event-entry";
import { Spinner } from "@/components/ui/spinner";
import { siteConfiguration } from "@/lib/site";

export default function EventPageClient({ params }: { params: Promise<{ eventId: string }> }) {
  const { eventId: eventRouteId } = use(params);
  const event = useQuery(api.events.getByRouteId, {
    eventRouteId,
    siteKey: siteConfiguration.siteKey,
  });
  if (event === undefined)
    return (
      <main className="flex min-h-screen items-center justify-center text-primary">
        <Spinner />
      </main>
    );
  if (!event) return <main className="p-6 text-center text-primary">Event not found.</main>;
  return <EventEntry event={event} />;
}
