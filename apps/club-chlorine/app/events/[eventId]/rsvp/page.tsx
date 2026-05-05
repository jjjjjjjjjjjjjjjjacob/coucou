"use client";

import React, { use, useCallback, useEffect, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { useAction, useQuery } from "convex/react";
import { useAuth } from "@clerk/nextjs";
import { api } from "@convex/_generated/api";
import type { Id } from "@convex/_generated/dataModel";
import { Spinner } from "@/components/ui/spinner";
import { siteConfiguration } from "@/lib/site";
import {
  RsvpAccepted,
  RsvpGate,
  TenantTemplateProvider,
  type RsvpGateState,
} from "@coucou/ui/tenant-template";
import { ApplicationError, Event } from "@/lib/types";
import { RsvpAcceptedForm } from "./rsvp-accepted-form";

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

  const resolveListByPassword = useAction(
    api.credentialsNode.resolveListByPassword,
  );

  const queryParamPassword = (searchParams?.get("password") ?? "").trim();

  const [password, setPassword] = useState(queryParamPassword);
  const [listKey, setListKey] = useState<string | null>(null);
  const [gateState, setGateState] = useState<RsvpGateState>("idle");
  const [resolvedFromUrl, setResolvedFromUrl] = useState(false);

  // Auto-redirect to the right post-submission surface if the user already
  // has an RSVP for this event.
  useEffect(() => {
    if (!status) return;
    if (status.status === "approved" || status.status === "attending") {
      router.replace(`/events/${eventId}/ticket`);
      return;
    }
    if (status.status === "pending" && status.listKey) {
      router.replace(`/events/${eventId}/status`);
      return;
    }
  }, [status, eventId, router]);

  // If the user landed here unauthenticated, push them through sign-in and
  // bring them back. Mirrors the previous landing-page behavior so the dojo
  // flow stays "sign-in then RSVP" rather than letting unsigned users see
  // the password gate without context.
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

  const tryResolvePassword = useCallback(
    async (passwordToResolve: string) => {
      const trimmed = passwordToResolve.trim();
      if (!trimmed) return;
      setGateState("submitting");
      try {
        const result = await resolveListByPassword({
          eventId: eventId as Id<"events">,
          password: trimmed,
          siteKey: siteConfiguration.siteKey,
        });
        if (result?.ok) {
          setListKey(result.listKey);
          setGateState("idle");
          // Mirror the password into the URL so refreshes preserve state.
          const params = new URLSearchParams({ password: trimmed }).toString();
          router.replace(`/events/${eventId}/rsvp?${params}`);
        } else {
          setListKey(null);
          setGateState("wrong");
        }
      } catch (error: unknown) {
        const errorDetails = error as ApplicationError | Error;
        console.error("Password resolution failed:", errorDetails);
        setListKey(null);
        setGateState("wrong");
      }
    },
    [resolveListByPassword, eventId, router],
  );

  // If a password came in via the URL and we haven't tried to resolve yet, do it.
  useEffect(() => {
    if (resolvedFromUrl) return;
    if (!queryParamPassword) return;
    if (!isSignedIn) return;
    setResolvedFromUrl(true);
    void tryResolvePassword(queryParamPassword);
  }, [queryParamPassword, isSignedIn, resolvedFromUrl, tryResolvePassword]);

  const handleGateSubmit = useCallback(async () => {
    await tryResolvePassword(password);
  }, [password, tryResolvePassword]);

  if (!event || !isLoaded || (!isSignedIn && isLoaded)) {
    return (
      <main className="flex min-h-screen items-center justify-center p-6">
        <Spinner />
      </main>
    );
  }

  return (
    <TenantTemplateProvider
      siteConfigurationPreset={siteConfiguration.preset}
      event={event}
    >
      {!listKey ? (
        <RsvpGate
          password={password}
          onPasswordChange={setPassword}
          onSubmit={handleGateSubmit}
          state={gateState}
        />
      ) : (
        <RsvpAccepted
          tier={listKey}
          tierDescription={
            <>
              {event?.name ? <>You&apos;re in for {event.name}. </> : null}
              We&apos;ll text the address day-of. Bring ID.
            </>
          }
        >
          <RsvpAcceptedForm
            eventId={eventId as Id<"events">}
            event={event as Event}
            listKey={listKey}
          />
        </RsvpAccepted>
      )}
    </TenantTemplateProvider>
  );
}
