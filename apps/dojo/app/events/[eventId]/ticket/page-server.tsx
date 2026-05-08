import { currentUser } from "@clerk/nextjs/server";
import { api } from "@convex/_generated/api";
import { preloadQuery } from "convex/nextjs";
import { redirect } from "next/navigation";
import { siteConfiguration } from "@/lib/site";
import TicketClientPage from "./ticket-client";

export default async function TicketServerPage({
  params,
}: {
  params: Promise<{ eventId: string }>;
}) {
  const resolvedParams = await Promise.resolve(params);
  const { eventId: eventRouteId } = resolvedParams;

  // Get the current user
  const user = await currentUser();

  if (!user) {
    redirect(`/sign-in?redirect_url=/events/${eventRouteId}/ticket`);
  }

  // Pre-load event data on the server
  const eventPreload = await preloadQuery(api.events.getByRouteId, {
    eventRouteId,
    siteKey: siteConfiguration.siteKey,
  });

  // Pre-load RSVP status for the current user
  const statusPreload = await preloadQuery(api.rsvps.statusForUserEventByRouteId, {
    eventRouteId,
    siteKey: siteConfiguration.siteKey,
  });

  // Pass the preloaded data to the client component
  return (
    <TicketClientPage
      eventRouteId={eventRouteId}
      eventPreload={eventPreload}
      statusPreload={statusPreload}
    />
  );
}
