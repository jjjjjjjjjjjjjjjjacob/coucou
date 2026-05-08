"use client";

import React, { use, useCallback, useEffect } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { useMutation, useQuery } from "convex/react";
import { useAuth } from "@clerk/nextjs";
import { toast } from "sonner";
import { api } from "@convex/_generated/api";
import type { Id } from "@convex/_generated/dataModel";
import { isEventOpenForRsvp } from "@coucou/sdk/shared/event-availability";
import { Spinner } from "@/components/ui/spinner";
import { siteConfiguration } from "@/lib/site";
import { RsvpPending } from "@coucou/ui/tenant-template";
import { ApplicationError, Event } from "@/lib/types";
import {
  RsvpAcceptedForm,
  type RsvpCollectedArgs,
} from "./rsvp-accepted-form";

export default function RsvpPage({
  params,
}: {
  params: Promise<{ eventId: string }>;
}) {
  const { eventId } = use(params);
  const router = useRouter();
  const searchParams = useSearchParams();
  const { isSignedIn, isLoaded } = useAuth();

  const event = useQuery(api.events.get, {
    eventId: eventId as Id<"events">,
    siteKey: siteConfiguration.siteKey,
  });

  const status = useQuery(api.rsvps.statusForUserEvent, {
    eventId: eventId as Id<"events">,
    siteKey: siteConfiguration.siteKey,
  });

  const submitRsvp = useMutation(api.rsvps.submitRequest);

  const hasNoPasswordList = useQuery(api.events.hasNoPasswordList, {
    eventId: eventId as Id<"events">,
  });
  const hasPasswordList = useQuery(api.events.hasPasswordList, {
    eventId: eventId as Id<"events">,
  });

  const queryParamPassword = (searchParams?.get("password") ?? "").trim();
  const eventIsOpenForRsvp = event ? isEventOpenForRsvp(event) : false;

  // Auto-redirect to the right post-submission surface if the user already
  // has an RSVP for this event. Any submitted request — pending, approved,
  // attending, denied — should pull the user off the password gate and onto
  // the matching status / ticket / denied surface.
  useEffect(() => {
    if (!status?.status) return;
    if (status.status === "approved" || status.status === "attending") {
      router.replace(`/events/${eventId}/ticket`);
      return;
    }
    if (status.status === "denied") {
      router.replace(`/events/${eventId}/denied`);
      return;
    }
    if (status.status === "pending") {
      router.replace(`/events/${eventId}/status`);
      return;
    }
  }, [status, eventId, router]);

  // Sign-in gate. Push unauthenticated users through Clerk first.
  useEffect(() => {
    if (!isLoaded) return;
    if (isSignedIn) return;
    const intended = `/events/${eventId}/rsvp${
      queryParamPassword
        ? `?${new URLSearchParams({ password: queryParamPassword }).toString()}`
        : ""
    }`;
    router.replace(`/sign-in?redirect_url=${encodeURIComponent(intended)}`);
  }, [isLoaded, isSignedIn, eventId, queryParamPassword, router]);

  const handleInfoCollected = useCallback(
    async (args: RsvpCollectedArgs) => {
      if (!eventIsOpenForRsvp) return;
      if (!args.resolvedListKey) {
        toast.error("Couldn't determine your list. Re-check your password.");
        return;
      }
      try {
        const { resolvedListKey, ...submissionArgs } = args;
        await submitRsvp({
          eventId: eventId as Id<"events">,
          siteKey: siteConfiguration.siteKey,
          listKey: resolvedListKey,
          ...submissionArgs,
        });
        toast.success("RSVP submitted");
        router.replace(`/events/${eventId}/status`);
      } catch (error: unknown) {
        const errorDetails = error as ApplicationError | Error;
        const errorMessage =
          errorDetails?.message || "Failed to submit request";
        toast.error("Request failed", { description: errorMessage });
      }
    },
    [eventIsOpenForRsvp, submitRsvp, eventId, router],
  );

  if (
    !event ||
    !isLoaded ||
    (!isSignedIn && isLoaded) ||
    (isSignedIn && status === undefined)
  ) {
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
      eventId={eventId as Id<"events">}
      event={event as Event}
      submitMode="collect"
      submitLabel="Submit Request"
      onCollect={handleInfoCollected}
      hasNoPasswordList={hasNoPasswordList === true}
      hasPasswordList={hasPasswordList === true}
      initialPassword={queryParamPassword}
    />
  );
}
