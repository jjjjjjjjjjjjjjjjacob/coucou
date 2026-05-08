import { currentUser } from "@clerk/nextjs/server";
import { api } from "@convex/_generated/api";
import { buildSatelliteReturnUrl, buildTenantPrimarySignInUrl } from "@coucou/sdk";
import { preloadQuery } from "convex/nextjs";
import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { coucouBaseUrl, siteConfiguration } from "@/lib/site";
import TicketClientPage from "./ticket-client";

async function resolveRequestOrigin(): Promise<string> {
  // Use the live request origin for the satellite return URL so local
  // dev (localhost:5679) and Vercel previews don't get bounced back to
  // the production domain after sign-in.
  const headersList = await headers();
  const forwardedHost = headersList.get("x-forwarded-host");
  const host = forwardedHost ?? headersList.get("host");
  if (!host) {
    return new URL(siteConfiguration.domain).origin;
  }
  const protocol = headersList.get("x-forwarded-proto") ?? "https";
  return `${protocol}://${host}`;
}

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
    // Bounce unauthenticated visitors directly to the chlorine-branded
    // phone-auth page on coucou.events with a return URL pointing back to
    // the ticket. The proxy would otherwise add an extra hop through the
    // (now-removed) /sign-in route.
    const satelliteOrigin = await resolveRequestOrigin();
    redirect(
      buildTenantPrimarySignInUrl({
        primaryBaseUrl: coucouBaseUrl,
        siteConfiguration,
        redirectUrl: buildSatelliteReturnUrl(satelliteOrigin, `/events/${eventRouteId}/ticket`),
      }),
    );
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
