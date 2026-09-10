"use client";

import { useAuth } from "@clerk/nextjs";
import { api } from "@convex/_generated/api";
import { buildSatelliteReturnUrl, buildTenantPrimarySignInUrl } from "@coucou/sdk";
import { isEventOpenForRsvp } from "@coucou/sdk/shared/event-availability";
import { REFERRAL_QUERY_PARAM } from "@coucou/sdk/shared/event-routes";
import { useConvexAuth, useMutation, useQuery } from "convex/react";
import { useRouter, useSearchParams } from "next/navigation";
import { use, useEffect } from "react";
import { toast } from "sonner";
import { Spinner } from "@/components/ui/spinner";
import { buildRsvpFlowPath, existingRsvpPath } from "@/lib/rsvp-routing";
import { resolveCoucouBaseUrl, siteConfiguration } from "@/lib/site";
import type { Event } from "@/lib/types";
import { RsvpAcceptedForm, type RsvpCollectedArgs } from "./rsvp-accepted-form";

export function RsvpPageClient({ params }: { params: Promise<{ eventId: string }> }) {
  const { eventId: eventRouteId } = use(params);
  const router = useRouter();
  const searchParameters = useSearchParams();
  const { isLoaded, isSignedIn, signOut } = useAuth();
  const { isAuthenticated, isLoading: isAuthenticationLoading } = useConvexAuth();
  const event = useQuery(api.events.getByRouteId, {
    eventRouteId,
    siteKey: siteConfiguration.siteKey,
  });
  const status = useQuery(
    api.rsvps.statusForUserEventByRouteId,
    isLoaded && isSignedIn && isAuthenticated
      ? { eventRouteId, siteKey: siteConfiguration.siteKey }
      : "skip",
  );
  const hasNoPasswordList = useQuery(
    api.events.hasNoPasswordList,
    event ? { eventId: event._id } : "skip",
  );
  const hasPasswordList = useQuery(
    api.events.hasPasswordList,
    event ? { eventId: event._id } : "skip",
  );
  const submitRsvp = useMutation(api.rsvps.submitRequest);
  const prepareGuestRsvp = useMutation(api.rsvps.prepareGuestRequest);
  const password = (searchParameters.get("password") ?? "").trim();
  const eventIsOpen = event ? isEventOpenForRsvp(event) : false;
  const isStatusLoading =
    !!isSignedIn && (isAuthenticationLoading || !isAuthenticated || status === undefined);
  const shouldValidateEntry =
    !!event &&
    eventIsOpen &&
    !isStatusLoading &&
    ((!status && hasNoPasswordList === false) || (status?.status === "denied" && !!password));
  const entryResolution = useQuery(
    api.credentials.resolveListByPassword,
    event && shouldValidateEntry
      ? { eventId: event._id, password, siteKey: siteConfiguration.siteKey }
      : "skip",
  );
  const isValidatingEntry = shouldValidateEntry && entryResolution === undefined;
  const isDifferentListRetry =
    status?.status === "denied" &&
    !!password &&
    entryResolution?.ok &&
    entryResolution.listKey !== status.listKey;
  const existingDestination = isDifferentListRetry
    ? null
    : existingRsvpPath(eventRouteId, status?.status);
  const needsPasswordGate = shouldValidateEntry && !status && entryResolution?.ok === false;
  const redirectDestination = isValidatingEntry
    ? null
    : (existingDestination ?? (needsPasswordGate ? `/events/${eventRouteId}` : null));

  useEffect(() => {
    if (redirectDestination)
      router.replace(buildRsvpFlowPath(redirectDestination, searchParameters));
  }, [redirectDestination, router, searchParameters]);

  async function handleInfoCollected(collected: RsvpCollectedArgs) {
    if (!event || !isEventOpenForRsvp(event))
      throw new Error("This event is no longer accepting RSVPs.");
    const { resolvedListKey, requiresPhoneVerification, ...fields } = collected;
    const submission = {
      ...fields,
      eventId: event._id,
      siteKey: siteConfiguration.siteKey,
      listKey: resolvedListKey,
      referralCode: searchParameters.get(REFERRAL_QUERY_PARAM) ?? undefined,
    };
    const statusPath = buildRsvpFlowPath(`/events/${eventRouteId}/status`, searchParameters);
    if (isSignedIn && isAuthenticated && !requiresPhoneVerification) {
      await submitRsvp(submission);
      toast.success("RSVP submitted");
      router.replace(statusPath);
      return;
    }
    const result = await prepareGuestRsvp(submission);
    const returnSearchParameters = new URLSearchParams(searchParameters.toString());
    returnSearchParameters.set("rsvp_handoff", result.rsvpHandoffToken);
    const verificationReturnPath = buildRsvpFlowPath(
      `/events/${eventRouteId}/status`,
      returnSearchParameters,
    );
    const signInUrl = new URL(
      buildTenantPrimarySignInUrl({
        primaryBaseUrl: resolveCoucouBaseUrl(window.location.origin),
        siteConfiguration,
        redirectUrl: buildSatelliteReturnUrl(window.location.origin, verificationReturnPath),
      }),
    );
    signInUrl.searchParams.set("rsvp_handoff", result.rsvpHandoffToken);
    if (isSignedIn) await signOut();
    window.location.assign(signInUrl.toString());
  }

  const isLoading =
    event === undefined ||
    !isLoaded ||
    isStatusLoading ||
    isValidatingEntry ||
    !!redirectDestination ||
    (!!event && (hasNoPasswordList === undefined || hasPasswordList === undefined));
  return (
    <main className="min-h-screen flex items-center justify-center p-6 text-primary">
      {isLoading ? (
        <Spinner />
      ) : !event ? (
        <p>Event not found.</p>
      ) : !eventIsOpen ? (
        <div className="text-center space-y-2">
          <h1 className="text-2xl font-semibold">RSVP closed.</h1>
          <p>This event is no longer accepting RSVP requests.</p>
        </div>
      ) : (
        <section className="w-full max-w-xl space-y-6 animate-in fade-in">
          <header className="space-y-1 text-center">
            <h1 className="text-2xl font-semibold">RSVP</h1>
            <p className="text-sm text-primary/70">{event.name}</p>
          </header>
          <RsvpAcceptedForm
            key={event._id}
            eventId={event._id}
            eventRouteId={eventRouteId}
            event={event as Event}
            hasNoPasswordList={hasNoPasswordList === true}
            hasPasswordList={hasPasswordList === true}
            initialPassword={password}
            isSignedIn={isSignedIn === true}
            onCollect={handleInfoCollected}
          />
        </section>
      )}
    </main>
  );
}
