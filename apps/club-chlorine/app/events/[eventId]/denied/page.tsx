"use client";

import { api } from "@convex/_generated/api";
import { convexQuery } from "@convex-dev/react-query";
import { RsvpDenied, TenantButton, TenantTemplateProvider } from "@coucou/ui/tenant-template";
import { useQuery } from "@tanstack/react-query";
import { useRouter, useSearchParams } from "next/navigation";
import posthog from "posthog-js";
import { use, useCallback, useState } from "react";
import { Spinner } from "@/components/ui/spinner";
import {
  buildEventDetailPathWithPreservedQuery,
  buildFullRsvpPath,
  buildInfoRsvpPath,
} from "@/lib/rsvp-url-state";
import { siteConfiguration } from "@/lib/site";
import type { Event as ClubEvent } from "@/lib/types";

interface DeniedRsvpStatus {
  listKey?: string;
}

export default function DeniedPage({ params }: { params: Promise<{ eventId: string }> }) {
  const { eventId: eventRouteId } = use(params);
  const router = useRouter();
  const searchParams = useSearchParams();
  const [newPassword, setNewPassword] = useState("");
  const [isLoading, setIsLoading] = useState(false);

  const eventQuery = useQuery(
    convexQuery(api.events.getByRouteId, {
      eventRouteId,
      siteKey: siteConfiguration.siteKey,
    }),
  );
  const statusQuery = useQuery(
    convexQuery(api.rsvps.statusForUserEventByRouteId, {
      eventRouteId,
      siteKey: siteConfiguration.siteKey,
    }),
  );

  const event = eventQuery.data as ClubEvent | null | undefined;
  const status = statusQuery.data as DeniedRsvpStatus | null | undefined;

  const handleTryNewPassword = useCallback(() => {
    const trimmed = newPassword.trim();
    if (!trimmed) return;
    setIsLoading(true);
    const nextSearchParams = new URLSearchParams(searchParams?.toString());
    nextSearchParams.set("password", trimmed);
    if (posthog.getFeatureFlag("rsvp-flow-route") === "info") {
      router.push(buildInfoRsvpPath(eventRouteId, nextSearchParams));
    } else {
      router.push(buildFullRsvpPath(eventRouteId, nextSearchParams));
    }
  }, [newPassword, eventRouteId, router, searchParams]);

  if (eventQuery.isLoading || !event) {
    return (
      <main className="flex min-h-screen items-center justify-center p-6">
        <Spinner />
      </main>
    );
  }

  return (
    <TenantTemplateProvider siteConfigurationPreset={siteConfiguration.preset} event={event}>
      <RsvpDenied
        description={
          status?.listKey ? (
            <>
              Unfortunately, your RSVP for <strong>{status.listKey}</strong> was not approved. If
              you have access to another list, try that password below.
            </>
          ) : (
            <>
              We could not place you on this list. If you have access to another list, try that
              password below.
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
                onClick={() =>
                  router.push(buildEventDetailPathWithPreservedQuery(eventRouteId, searchParams))
                }
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
