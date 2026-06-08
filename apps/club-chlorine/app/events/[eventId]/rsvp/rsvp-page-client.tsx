"use client";

import { useAuth } from "@clerk/nextjs";
import { api } from "@convex/_generated/api";
import type { Id } from "@convex/_generated/dataModel";
import { buildSatelliteReturnUrl, buildTenantPrimarySignInUrl } from "@coucou/sdk";
import { isEventOpenForRsvp } from "@coucou/sdk/shared/event-availability";
import { REFERRAL_QUERY_PARAM } from "@coucou/sdk/shared/event-routes";
import { RsvpPending } from "@coucou/ui/tenant-template";
import { useConvexAuth, useMutation, useQuery } from "convex/react";
import { useRouter, useSearchParams } from "next/navigation";
import posthog from "posthog-js";
import { use, useCallback, useEffect, useRef } from "react";
import { toast } from "sonner";
import { Spinner } from "@/components/ui/spinner";
import { isPostHogConfigured } from "@/lib/posthog";
import { useRsvpFlowViewport } from "@/lib/rsvp-flow-routing";
import { buildPathWithPreservedQuery } from "@/lib/rsvp-url-state";
import { siteConfiguration } from "@/lib/site";
import type { ApplicationError, Event } from "@/lib/types";
import { RsvpAcceptedForm, type RsvpCollectedArgs } from "./rsvp-accepted-form";

const coucouBaseUrl = (process.env.NEXT_PUBLIC_COUCOU_BASE_URL ?? "http://localhost:5680").replace(
  /\/+$/,
  "",
);

export interface RsvpPageClientProps {
  params: Promise<{ eventId: string }>;
}

export function RsvpPageClient({ params }: RsvpPageClientProps) {
  const { eventId: eventRouteId } = use(params);
  const router = useRouter();
  const searchParams = useSearchParams();
  const { isSignedIn, isLoaded, signOut } = useAuth();
  const { isAuthenticated: isConvexAuthenticated, isLoading: isConvexAuthLoading } =
    useConvexAuth();
  const rsvpFlowViewport = useRsvpFlowViewport();
  const lastExistingRsvpDestinationRef = useRef<string | null>(null);

  const event = useQuery(api.events.getByRouteId, {
    eventRouteId,
    siteKey: siteConfiguration.siteKey,
  });
  const canonicalEventId = event?._id;

  const status = useQuery(
    api.rsvps.statusForUserEventByRouteId,
    isLoaded && isSignedIn && isConvexAuthenticated
      ? {
          eventRouteId,
          siteKey: siteConfiguration.siteKey,
        }
      : "skip",
  );

  const submitRsvp = useMutation(api.rsvps.submitRequest);
  const submitGuestRsvp = useMutation(api.rsvps.submitGuestRequest);

  const hasNoPasswordList = useQuery(
    api.events.hasNoPasswordList,
    canonicalEventId ? { eventId: canonicalEventId as Id<"events"> } : "skip",
  );
  const hasPasswordList = useQuery(
    api.events.hasPasswordList,
    canonicalEventId ? { eventId: canonicalEventId as Id<"events"> } : "skip",
  );

  const queryParamPassword = (searchParams?.get("password") ?? "").trim();
  const eventIsOpenForRsvp = event ? isEventOpenForRsvp(event) : false;
  const existingRsvpDestination =
    status?.status === "approved"
      ? buildPathWithPreservedQuery(`/events/${eventRouteId}/ticket`, searchParams, ["step"])
      : status?.status === "denied"
        ? buildPathWithPreservedQuery(`/events/${eventRouteId}/denied`, searchParams, ["step"])
        : status?.status === "pending"
          ? buildPathWithPreservedQuery(`/events/${eventRouteId}/status`, searchParams, ["step"])
          : null;

  // Auto-redirect to the right post-submission surface if the user already
  // has an RSVP for this event. Any submitted request — pending, approved,
  // denied — should pull the user off the password gate and onto
  // the matching status / ticket / denied surface.
  useEffect(() => {
    if (!existingRsvpDestination) return;
    if (lastExistingRsvpDestinationRef.current === existingRsvpDestination) return;
    lastExistingRsvpDestinationRef.current = existingRsvpDestination;
    router.replace(existingRsvpDestination);
  }, [existingRsvpDestination, router]);

  const handleInfoCollected = useCallback(
    async (args: RsvpCollectedArgs) => {
      if (!eventIsOpenForRsvp) return;
      if (!args.resolvedListKey) {
        toast.error("Couldn't determine your list. Re-check your password.");
        return;
      }
      try {
        if (!canonicalEventId) {
          toast.error("Event not found");
          return;
        }
        const {
          resolvedListKey,
          firstName,
          lastName,
          phone,
          requiresPhoneVerification,
          ...submissionArgs
        } = args;
        const referralCode = searchParams?.get(REFERRAL_QUERY_PARAM) ?? undefined;
        const shouldSubmitAuthenticatedRsvp =
          isSignedIn && isConvexAuthenticated && !requiresPhoneVerification;

        if (shouldSubmitAuthenticatedRsvp) {
          await submitRsvp({
            eventId: canonicalEventId as Id<"events">,
            siteKey: siteConfiguration.siteKey,
            listKey: resolvedListKey,
            referralCode,
            phone: phone || undefined,
            ...submissionArgs,
          });
        } else {
          if (!phone) {
            toast.error("Phone number is required");
            return;
          }
          const guestSubmissionResult = await submitGuestRsvp({
            eventId: canonicalEventId as Id<"events">,
            siteKey: siteConfiguration.siteKey,
            listKey: resolvedListKey,
            firstName,
            lastName,
            phone,
            referralCode,
            ...submissionArgs,
          });
          if (typeof window === "undefined") {
            return;
          }
          const statusPath = buildPathWithPreservedQuery(
            `/events/${eventRouteId}/status`,
            searchParams,
            ["step"],
          );
          const satelliteReturnUrl = buildSatelliteReturnUrl(window.location.origin, statusPath);
          const primarySignInUrl = new URL(
            buildTenantPrimarySignInUrl({
              primaryBaseUrl: coucouBaseUrl,
              siteConfiguration,
              redirectUrl: satelliteReturnUrl,
            }),
          );
          primarySignInUrl.searchParams.set("rsvp_handoff", guestSubmissionResult.rsvpHandoffToken);
          toast.success("RSVP submitted");
          if (isSignedIn) {
            await signOut();
          }
          window.location.assign(primarySignInUrl.toString());
          return;
        }
        if (isPostHogConfigured()) {
          const postHogEventProperties = {
            event_id: canonicalEventId,
            event_route_id: eventRouteId,
            rsvp_flow_viewport: rsvpFlowViewport,
          };
          posthog.capture("rsvp_request_submitted", postHogEventProperties);
        }
        toast.success("RSVP submitted");
        router.replace(
          buildPathWithPreservedQuery(`/events/${eventRouteId}/status`, searchParams, ["step"]),
        );
      } catch (error: unknown) {
        const errorDetails = error as ApplicationError | Error;
        const errorMessage = errorDetails?.message || "Failed to submit request";
        toast.error("Request failed", { description: errorMessage });
      }
    },
    [
      eventIsOpenForRsvp,
      submitRsvp,
      submitGuestRsvp,
      canonicalEventId,
      eventRouteId,
      router,
      searchParams,
      rsvpFlowViewport,
      isSignedIn,
      isConvexAuthenticated,
      signOut,
    ],
  );

  const rsvpStatusIsLoading =
    isLoaded &&
    isSignedIn &&
    (isConvexAuthLoading || !isConvexAuthenticated || status === undefined);

  if (!event || !isLoaded || rsvpStatusIsLoading || existingRsvpDestination) {
    return (
      <div className="flex w-full items-center justify-center py-10">
        <Spinner />
      </div>
    );
  }

  if (!status && !eventIsOpenForRsvp) {
    return (
      <RsvpPending
        eyebrow="RSVP"
        heading="RSVP closed."
        description="This event is no longer accepting RSVP requests."
        statusLabel="Closed"
        noShell
      />
    );
  }

  return (
    <RsvpAcceptedForm
      eventId={canonicalEventId as Id<"events">}
      eventRouteId={eventRouteId}
      event={event as Event}
      submitMode="collect"
      submitLabel="Submit Request"
      onCollect={handleInfoCollected}
      hasNoPasswordList={hasNoPasswordList === true}
      hasPasswordList={hasPasswordList === true}
      initialPassword={queryParamPassword}
      isSignedIn={isSignedIn === true}
    />
  );
}
