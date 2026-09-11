"use client";

import { api } from "@convex/_generated/api";
import { getEventRouteId } from "@coucou/sdk/shared/event-routes";
import { storeListAccess } from "@coucou/sdk/shared/list-access";
import { useAction, useQuery } from "convex/react";
import { useRouter, useSearchParams } from "next/navigation";
import { useCallback, useEffect, useState } from "react";
import { EventEntry } from "@/components/event-entry";
import { EventThemeProvider } from "@/components/event-theme-provider";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Spinner } from "@/components/ui/spinner";
import { buildRsvpFlowPath } from "@/lib/rsvp-routing";
import { siteConfiguration } from "@/lib/site";

export function HomePageClient() {
  const featuredEvent = useQuery(api.events.getFeaturedEvent, {
    siteKey: siteConfiguration.siteKey,
  });
  const hasNoPasswordList = useQuery(
    api.events.hasNoPasswordList,
    featuredEvent ? { eventId: featuredEvent._id } : "skip",
  );
  const iconResponse = useQuery(
    api.files.getUrl,
    featuredEvent?.customIconStorageId ? { storageId: featuredEvent.customIconStorageId } : "skip",
  );
  const router = useRouter();
  const searchParameters = useSearchParams();
  useEffect(() => {
    if (featuredEvent && hasNoPasswordList === false) {
      router.replace(
        buildRsvpFlowPath(`/events/${getEventRouteId(featuredEvent)}`, searchParameters),
      );
    }
  }, [featuredEvent, hasNoPasswordList, router, searchParameters]);
  if (featuredEvent === undefined || (featuredEvent && hasNoPasswordList !== true)) {
    return (
      <main className="flex min-h-screen items-center justify-center text-primary">
        <Spinner />
      </main>
    );
  }
  if (!featuredEvent) return <PasswordHome />;
  return (
    <EventThemeProvider
      event={featuredEvent}
      iconUrl={iconResponse?.url}
      brandingSourceId={`home-event:${featuredEvent._id}`}
    >
      <EventEntry event={featuredEvent} />
    </EventThemeProvider>
  );
}

function PasswordHome() {
  const [password, setPassword] = useState("");
  const [message, setMessage] = useState("");
  const [loading, setLoading] = useState(false);
  const router = useRouter();
  const searchParameters = useSearchParams();
  const resolve = useAction(api.credentialsNode.resolveEventByPassword);

  const onSubmit = useCallback(async () => {
    const normalizedPassword = password.trim();
    if (!normalizedPassword) {
      setMessage("Enter your list code.");
      return;
    }
    try {
      setLoading(true);
      setMessage("");
      const resolutionResult = await resolve({
        password: normalizedPassword,
        siteKey: siteConfiguration.siteKey,
      });
      if (resolutionResult?.ok && resolutionResult.eventRouteId) {
        storeListAccess(resolutionResult.eventId, normalizedPassword, resolutionResult);
        // Pass the code along in search params to the event page
        const nextSearchParameters = new URLSearchParams(searchParameters.toString());
        nextSearchParameters.set("password", normalizedPassword);
        router.push(
          buildRsvpFlowPath(`/events/${resolutionResult.eventRouteId}`, nextSearchParameters),
        );
      } else {
        setMessage("No active event matches that password.");
      }
    } catch (error: unknown) {
      const errorDetails = error as Error;
      setMessage(errorDetails?.message || "Error resolving event");
    } finally {
      setLoading(false);
    }
  }, [password, resolve, router, searchParameters]);

  return (
    <main className="min-h-[calc(100vh-56px)] flex items-center justify-center p-6">
      <div className="w-full max-w-md space-y-4">
        <h1 className="text-2xl font-semibold text-primary">{siteConfiguration.homeTitle}</h1>
        <p className="text-sm text-foreground/70 text-primary">
          {siteConfiguration.homeDescription}
        </p>
        <div className="flex gap-2">
          <Input
            placeholder="Password"
            value={password}
            onChange={(event) => setPassword(event.target.value.trim())}
            onKeyDown={(event) => {
              if (event.key === "Enter") onSubmit();
            }}
            className="border border-primary/20 placeholder:text-primary/30"
          />
          <Button onClick={onSubmit} disabled={loading}>
            {loading ? "Checking..." : "Continue"}
          </Button>
        </div>
        {message && <div className="text-sm text-red-500">{message}</div>}
      </div>
    </main>
  );
}
