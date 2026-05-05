import { currentUser } from "@clerk/nextjs/server";
import { redirect } from "next/navigation";
import { preloadQuery } from "convex/nextjs";
import { api } from "@convex/_generated/api";
import type { Id } from "@convex/_generated/dataModel";
import { siteConfiguration } from "@/lib/site";
import TicketClientPage from "./ticket-client";

export default async function TicketServerPage({
  params,
}: {
  params: Promise<{ eventId: string }>;
}) {
  const resolvedParams = await Promise.resolve(params);
  const { eventId } = resolvedParams;

  // Get the current user
  const user = await currentUser();

  if (!user) {
    redirect(`/sign-in?redirect_url=/events/${eventId}/ticket`);
  }

  // Pre-load event data on the server
  const eventPreload = await preloadQuery(api.events.get, {
    eventId: eventId as Id<"events">,
    siteKey: siteConfiguration.siteKey,
  });

  // Pre-load RSVP status for the current user
  const statusPreload = await preloadQuery(api.rsvps.statusForUserEvent, {
    eventId: eventId as Id<"events">,
    siteKey: siteConfiguration.siteKey,
  });

  // Pass the preloaded data to the client component
  return (
    <TicketClientPage
      eventId={eventId}
      eventPreload={eventPreload}
      statusPreload={statusPreload}
    />
  );
}
