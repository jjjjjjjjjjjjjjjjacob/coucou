"use client";

import { useAuth } from "@clerk/nextjs";
import { api } from "@convex/_generated/api";
import type { Doc } from "@convex/_generated/dataModel";
import { isEventOpenForRsvp } from "@coucou/sdk/shared/event-availability";
import { getEventRouteId } from "@coucou/sdk/shared/event-routes";
import { resolveRsvpAccess } from "@coucou/sdk/shared/list-access";
import { useAction, useConvexAuth, useQuery } from "convex/react";
import { useRouter, useSearchParams } from "next/navigation";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { hasEventSecondaryTitle } from "@/lib/event-display";
import { buildRsvpFlowPath, existingRsvpPath } from "@/lib/rsvp-routing";
import { siteConfiguration } from "@/lib/site";

export function EventEntry({ event }: { event: Doc<"events"> }) {
  const router = useRouter();
  const searchParameters = useSearchParams();
  const { isLoaded, isSignedIn } = useAuth();
  const { isAuthenticated } = useConvexAuth();
  const eventRouteId = getEventRouteId(event);
  const status = useQuery(
    api.rsvps.statusForUserEventByRouteId,
    isLoaded && isSignedIn && isAuthenticated
      ? { eventRouteId, siteKey: siteConfiguration.siteKey }
      : "skip",
  );
  const hasNoPasswordList = useQuery(api.events.hasNoPasswordList, { eventId: event._id });
  const resolvePassword = useAction(api.credentialsNode.resolveListByPassword);
  const [password, setPassword] = useState(searchParameters.get("password") ?? "");
  const [isPasswordDialogOpen, setIsPasswordDialogOpen] = useState(false);
  const [isCheckingPassword, setIsCheckingPassword] = useState(false);
  const [message, setMessage] = useState("");
  const existingDestination = existingRsvpPath(eventRouteId, status?.status);
  const eventIsOpen = isEventOpenForRsvp(event);
  const isLoading =
    !isLoaded ||
    hasNoPasswordList === undefined ||
    (isSignedIn && (!isAuthenticated || status === undefined));

  async function continueWithPassword() {
    if (!password.trim()) {
      setMessage("Enter your list password.");
      return;
    }
    setIsCheckingPassword(true);
    setMessage("");
    try {
      const resolution = await resolveRsvpAccess(resolvePassword, {
        eventId: event._id,
        password: password.trim(),
        siteKey: siteConfiguration.siteKey,
      });
      if (!resolution.ok) {
        setMessage("Invalid password for this event.");
        return;
      }
      const nextSearchParameters = new URLSearchParams(searchParameters.toString());
      nextSearchParameters.set("password", password.trim());
      router.push(buildRsvpFlowPath(`/events/${eventRouteId}/rsvp`, nextSearchParameters));
    } catch (error: unknown) {
      setMessage(error instanceof Error ? error.message : "Unable to check your password.");
    } finally {
      setIsCheckingPassword(false);
    }
  }

  const eventDate = new Date(event.eventDate);
  const timeZone = event.eventTimezone ?? "UTC";
  const weekday = eventDate.toLocaleDateString(undefined, { weekday: "long", timeZone });
  const date = eventDate
    .toLocaleDateString("en-US", { month: "2-digit", day: "2-digit", year: "2-digit", timeZone })
    .replace(/\//g, ".");

  return (
    <main className="min-h-screen flex items-center justify-center p-6">
      <header className="w-full max-w-2xl space-y-4 text-center text-primary animate-in! fade-in! duration-1000">
        <div className="space-y-1">
          <h1 className="text-4xl font-semibold uppercase">{event.name}</h1>
          {hasEventSecondaryTitle(event) && (
            <p className="text-2xl uppercase tracking-wide text-primary/85 font-semibold">
              {event.secondaryTitle}
            </p>
          )}
        </div>
        <div>
          <div className="text-lg leading-tight">
            {weekday} {date}
          </div>
          <div className="text-lg leading-tight">{event.location}</div>
        </div>
        <Button
          disabled={isLoading || (!existingDestination && !eventIsOpen)}
          onClick={() => {
            if (existingDestination)
              router.push(buildRsvpFlowPath(existingDestination, searchParameters));
            else if (hasNoPasswordList)
              router.push(buildRsvpFlowPath(`/events/${eventRouteId}/rsvp`, searchParameters));
            else setIsPasswordDialogOpen(true);
          }}
        >
          {status?.status === "approved"
            ? "VIEW TICKET"
            : status?.status === "pending" || status?.status === "denied"
              ? "RSVP STATUS"
              : eventIsOpen
                ? "RSVP"
                : "RSVP CLOSED"}
        </Button>
        <Dialog open={isPasswordDialogOpen} onOpenChange={setIsPasswordDialogOpen}>
          <DialogContent className="text-primary">
            <DialogHeader>
              <DialogTitle>Enter List Password</DialogTitle>
              <DialogDescription className="text-primary">
                Provide the password for your guest list to continue.
              </DialogDescription>
            </DialogHeader>
            <form
              className="flex gap-2"
              onSubmit={(event) => {
                event.preventDefault();
                void continueWithPassword();
              }}
            >
              <Input
                autoFocus
                aria-label="List password"
                placeholder="List password"
                value={password}
                onChange={(event) => setPassword(event.target.value)}
                className="flex-1 border border-primary/20 placeholder:text-primary/30"
              />
              <Button type="submit" disabled={isCheckingPassword}>
                {isCheckingPassword ? "Checking…" : "Continue"}
              </Button>
            </form>
            {message && (
              <p role="alert" className="text-sm text-red-500">
                {message}
              </p>
            )}
          </DialogContent>
        </Dialog>
      </header>
    </main>
  );
}
