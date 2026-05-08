"use client";
import { api } from "@convex/_generated/api";
import type { Id } from "@convex/_generated/dataModel";
import { convexQuery } from "@convex-dev/react-query";
import { useQuery } from "@tanstack/react-query";
import { useRouter } from "next/navigation";
import { use, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Spinner } from "@/components/ui/spinner";
import { siteConfiguration } from "@/lib/site";

export default function DeniedPage({ params }: { params: Promise<{ eventId: string }> }) {
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

  const handleTryNewPassword = () => {
    const password = newPassword.trim();
    if (!password) return;

    setIsLoading(true);
    const searchParams = new URLSearchParams({ password }).toString();
    router.push(`/events/${eventId}/rsvp?${searchParams}`);
  };

  if (eventQuery.isLoading || !event) {
    return (
      <main className="min-h-screen flex items-center justify-center p-6">
        <div className="flex items-center text-primary justify-center py-10">
          <Spinner />
        </div>
      </main>
    );
  }

  return (
    <main className="min-h-screen flex items-center justify-center p-6">
      <div className="w-full max-w-2xl space-y-6 text-center">
        <header className="space-y-1">
          <h1 className="text-2xl font-semibold text-primary">Access Denied</h1>
          <div className="space-y-1 text-primary">
            <p className="text-3xl font-semibold leading-tight">{event.name}</p>
            {event.secondaryTitle?.trim() && (
              <p className="text-2xl leading-tight text-primary/85 font-medium">
                {event.secondaryTitle}
              </p>
            )}
            {event.location && <p className="text-sm text-primary/70">{event.location}</p>}
          </div>
        </header>

        <div className="space-y-4">
          <div className="rounded border border-red-200 bg-red-50 p-4">
            <div className="text-sm text-red-800">
              <p className="font-medium mb-2">Your request was denied</p>
              <p>
                Unfortunately, your RSVP for <span className="font-medium">{status?.listKey}</span>{" "}
                was not approved.
              </p>
            </div>
          </div>

          <div className="rounded border border-primary/30 p-4 space-y-3">
            <div className="text-sm text-primary">
              <p className="font-medium mb-2">Try a different list</p>
              <p className="text-primary/70">
                If you have access to another guest list, enter that password below:
              </p>
            </div>

            <div className="flex gap-2">
              <Input
                placeholder="Different list password"
                value={newPassword}
                onChange={(e) => setNewPassword(e.target.value.trim())}
                onKeyDown={(e) => {
                  if (e.key === "Enter") handleTryNewPassword();
                }}
                className="flex-1 border border-primary/20 placeholder:text-primary/30"
              />
              <Button onClick={handleTryNewPassword} disabled={!newPassword.trim() || isLoading}>
                {isLoading ? "Trying..." : "Try Again"}
              </Button>
            </div>
          </div>

          <div className="text-xs text-primary/70">
            Contact the event organizers if you believe this is an error.
          </div>

          <Button
            variant="outline"
            onClick={() => router.push(`/events/${eventId}`)}
            className="text-primary border-primary/20"
          >
            Back to Event
          </Button>
        </div>
      </div>
    </main>
  );
}
