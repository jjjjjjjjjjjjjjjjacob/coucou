"use client";

import React, { use, useCallback, useState } from "react";
import { useRouter } from "next/navigation";
import { useQuery } from "@tanstack/react-query";
import { convexQuery } from "@convex-dev/react-query";
import { api } from "@convex/_generated/api";
import type { Id } from "@convex/_generated/dataModel";
import { Spinner } from "@/components/ui/spinner";
import { siteConfiguration } from "@/lib/site";
import {
  RsvpDenied,
  TenantButton,
  TenantTemplateProvider,
} from "@coucou/ui/tenant-template";

export default function DeniedPage({
  params,
}: {
  params: Promise<{ eventId: string }>;
}) {
  const { eventId } = use(params);
  const router = useRouter();
  const [newPassword, setNewPassword] = useState("");
  const [isLoading, setIsLoading] = useState(false);

  const eventQuery = useQuery(
    convexQuery(api.events.get, {
      eventId: eventId as Id<"events">,
      siteKey: siteConfiguration.siteKey,
    }),
  );
  const statusQuery = useQuery(
    convexQuery(api.rsvps.statusForUserEvent, {
      eventId: eventId as Id<"events">,
      siteKey: siteConfiguration.siteKey,
    }),
  );

  const event = eventQuery.data;
  const status = statusQuery.data;

  const handleTryNewPassword = useCallback(() => {
    const trimmed = newPassword.trim();
    if (!trimmed) return;
    setIsLoading(true);
    const searchParams = new URLSearchParams({ password: trimmed }).toString();
    router.push(`/events/${eventId}/rsvp?${searchParams}`);
  }, [newPassword, eventId, router]);

  if (eventQuery.isLoading || !event) {
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
      <RsvpDenied
        description={
          status?.listKey ? (
            <>
              Unfortunately, your RSVP for{" "}
              <strong>{status.listKey}</strong> was not approved. If you have
              access to another list, try that password below.
            </>
          ) : (
            <>
              We could not place you on this list. If you have access to
              another list, try that password below.
            </>
          )
        }
        secondaryAction={
          <div className="flex w-full max-w-md flex-col gap-3">
            <input
              placeholder="Different list password"
              value={newPassword}
              onChange={(event) => setNewPassword(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === "Enter") handleTryNewPassword();
              }}
              type="password"
              autoComplete="off"
              autoCapitalize="none"
              spellCheck={false}
              className="bg-transparent outline-none"
              style={{
                fontFamily: "var(--tt-text)",
                fontSize: 16,
                color: "var(--tt-fg)",
                padding: "10px 0",
                border: "none",
                borderBottom: "1px solid var(--tt-rule-strong)",
                letterSpacing: "0.2em",
              }}
            />
            <div className="flex flex-wrap gap-3">
              <TenantButton
                type="button"
                onClick={handleTryNewPassword}
                disabled={!newPassword.trim() || isLoading}
              >
                {isLoading ? "Trying…" : "Try again"}
              </TenantButton>
              <TenantButton
                type="button"
                onClick={() => router.push(`/events/${eventId}`)}
              >
                Back to event
              </TenantButton>
            </div>
          </div>
        }
      />
    </TenantTemplateProvider>
  );
}
