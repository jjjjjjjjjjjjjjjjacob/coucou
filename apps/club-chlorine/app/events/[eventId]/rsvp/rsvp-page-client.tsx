"use client";

import { useAuth } from "@clerk/nextjs";
import { api } from "@convex/_generated/api";
import type { Id } from "@convex/_generated/dataModel";
import { buildSatelliteReturnUrl, buildTenantPrimarySignInUrl } from "@coucou/sdk";
import { isEventOpenForRsvp } from "@coucou/sdk/shared/event-availability";
import { REFERRAL_QUERY_PARAM } from "@coucou/sdk/shared/event-routes";
import { CHLORINE_PHASE_SPLIT_MS, RsvpPending } from "@coucou/ui/tenant-template";
import { useMutation, useQuery } from "convex/react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import posthog from "posthog-js";
import { use, useCallback, useEffect } from "react";
import { toast } from "sonner";
import { Spinner } from "@/components/ui/spinner";
import { isPostHogConfigured } from "@/lib/posthog";
import {
  buildPathWithPreservedQuery,
  buildPathWithQueryString,
  buildQueryStringWithoutKeys,
  buildQueryStringWithRsvpStep,
  parseRsvpStepQueryValue,
} from "@/lib/rsvp-url-state";
import { siteConfiguration } from "@/lib/site";
import type { ApplicationError, Event } from "@/lib/types";
import { RsvpAcceptedForm, type RsvpCollectedArgs } from "./rsvp-accepted-form";

const coucouBaseUrl = (process.env.NEXT_PUBLIC_COUCOU_BASE_URL ?? "http://localhost:5680").replace(
  /\/+$/,
  "",
);

export interface RsvpPageClientProps {
  params: Promise<{ eventId: string }>;
  formVariant?: "stepped" | "full";
}

export function RsvpPageClient({ params, formVariant = "stepped" }: RsvpPageClientProps) {
  const { eventId: eventRouteId } = use(params);
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const { isSignedIn, isLoaded } = useAuth();

  const event = useQuery(api.events.getByRouteId, {
    eventRouteId,
    siteKey: siteConfiguration.siteKey,
  });
  const canonicalEventId = event?._id;

  const status = useQuery(api.rsvps.statusForUserEventByRouteId, {
    eventRouteId,
    siteKey: siteConfiguration.siteKey,
  });

  const submitRsvp = useMutation(api.rsvps.submitRequest);

  const hasNoPasswordList = useQuery(
    api.events.hasNoPasswordList,
    canonicalEventId ? { eventId: canonicalEventId as Id<"events"> } : "skip",
  );
  const hasPasswordList = useQuery(
    api.events.hasPasswordList,
    canonicalEventId ? { eventId: canonicalEventId as Id<"events"> } : "skip",
  );

  const queryParamPassword = (searchParams?.get("password") ?? "").trim();
  const currentRsvpStep = parseRsvpStepQueryValue(searchParams?.get("step"));
  const rsvpQueryString =
    formVariant === "full"
      ? buildQueryStringWithoutKeys(searchParams, ["step"])
      : buildQueryStringWithRsvpStep(searchParams, currentRsvpStep);
  const rsvpPathname =
    formVariant === "full"
      ? `/events/${eventRouteId}/rsvp/full`
      : pathname === `/events/${eventRouteId}/rsvp/info`
        ? `/events/${eventRouteId}/rsvp/info`
        : `/events/${eventRouteId}/rsvp`;
  const eventIsOpenForRsvp = event ? isEventOpenForRsvp(event) : false;
  const rsvpFlowVariant = formVariant === "full" ? "control" : "info";

  // Auto-redirect to the right post-submission surface if the user already
  // has an RSVP for this event. Any submitted request — pending, approved,
  // denied — should pull the user off the password gate and onto
  // the matching status / ticket / denied surface.
  useEffect(() => {
    if (!status?.status) return;
    if (status.status === "approved") {
      router.replace(
        buildPathWithPreservedQuery(`/events/${eventRouteId}/ticket`, searchParams, ["step"]),
      );
      return;
    }
    if (status.status === "denied") {
      router.replace(
        buildPathWithPreservedQuery(`/events/${eventRouteId}/denied`, searchParams, ["step"]),
      );
      return;
    }
    if (status.status === "pending") {
      router.replace(
        buildPathWithPreservedQuery(`/events/${eventRouteId}/status`, searchParams, ["step"]),
      );
      return;
    }
  }, [status, eventRouteId, router, searchParams]);

  // Sign-in gate. The satellite never serves its own auth surface — bounce
  // unauthenticated visitors to the chlorine-branded phone-auth page hosted
  // on coucou.events with a return URL pointing back to this RSVP entry.
  // We deliberately hold the redirect until the wordmark's split→collapsed
  // transition has had time to settle — without the delay, the user would
  // see the wordmark mid-tween at the moment the cross-domain navigation
  // started and the coucou page would mount with a visible position jump.
  // The bouncing-dots Spinner below renders during the wait.
  useEffect(() => {
    if (!isLoaded) return;
    if (isSignedIn) return;
    if (typeof window === "undefined") return;
    const intendedPath = buildPathWithQueryString(rsvpPathname, rsvpQueryString);
    // Anchor the return URL at the *live* origin so the user lands back
    // on the same satellite they came from (localhost during dev,
    // clubchlorine.party in prod). Hard-coding `siteConfiguration.domain`
    // here would always send the post-auth bounce to production, which is
    // wrong on local and on Vercel preview deploys.
    const satelliteReturnUrl = buildSatelliteReturnUrl(window.location.origin, intendedPath);
    const primarySignInUrl = buildTenantPrimarySignInUrl({
      primaryBaseUrl: coucouBaseUrl,
      siteConfiguration,
      redirectUrl: satelliteReturnUrl,
    });
    const redirectTimeoutId = window.setTimeout(() => {
      window.location.assign(primarySignInUrl);
    }, CHLORINE_PHASE_SPLIT_MS);
    return () => {
      window.clearTimeout(redirectTimeoutId);
    };
  }, [isLoaded, isSignedIn, rsvpPathname, rsvpQueryString]);

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
        const { resolvedListKey, ...submissionArgs } = args;
        await submitRsvp({
          eventId: canonicalEventId as Id<"events">,
          siteKey: siteConfiguration.siteKey,
          listKey: resolvedListKey,
          referralCode: searchParams?.get(REFERRAL_QUERY_PARAM) ?? undefined,
          ...submissionArgs,
        });
        if (isPostHogConfigured()) {
          posthog.capture("rsvp_request_submitted", {
            event_id: canonicalEventId,
            event_route_id: eventRouteId,
            rsvp_flow_variant: rsvpFlowVariant,
            "$feature/rsvp-flow-route": rsvpFlowVariant,
          });
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
      canonicalEventId,
      eventRouteId,
      router,
      searchParams,
      rsvpFlowVariant,
    ],
  );

  if (!event || !isLoaded || (!isSignedIn && isLoaded) || (isSignedIn && status === undefined)) {
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
      formVariant={formVariant}
    />
  );
}
