"use client";

import type { Id } from "@convex/_generated/dataModel";
import { GuestManager } from "@/app/workspaces/[workspaceSlug]/host/rsvps/page";

interface EventGuestsTabProps {
  eventId: Id<"events">;
}

export function EventGuestsTab({ eventId }: EventGuestsTabProps) {
  return <GuestManager initialEventId={eventId} embedded lockEvent />;
}
