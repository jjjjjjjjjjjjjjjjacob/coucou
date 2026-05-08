import type { EventLifecycle } from "./eventMetadata";

// Falls in line with the SDK's RSVP cutoff so the host-dashboard "past
// event" badge flips at the same moment that the public RSVP form
// reports "closed." Keep the two values in sync.
export const DEFAULT_EVENT_DURATION_MS = 24 * 60 * 60 * 1000;

export type EventTimingInput = {
  eventDate?: number | null;
  eventEndDate?: number | null;
};

export type EventLifecycleInput = EventTimingInput & {
  lifecycle?: EventLifecycle;
};

export function resolveEventEndTimestamp(
  event: EventTimingInput,
): number | null {
  if (typeof event.eventEndDate === "number") {
    return event.eventEndDate;
  }
  if (typeof event.eventDate === "number") {
    return event.eventDate + DEFAULT_EVENT_DURATION_MS;
  }
  return null;
}

export function isEventPast(
  event: EventTimingInput,
  now: number = Date.now(),
): boolean {
  const endTimestamp = resolveEventEndTimestamp(event);
  if (endTimestamp === null) {
    return false;
  }
  return endTimestamp < now;
}

export type EventLifecycleBadge = "draft" | "published-upcoming" | "past";

export function resolveEventLifecycleBadge(
  event: EventLifecycleInput,
  now: number = Date.now(),
): EventLifecycleBadge {
  const lifecycle: EventLifecycle = event.lifecycle ?? "published";
  if (lifecycle === "draft") {
    return "draft";
  }
  return isEventPast(event, now) ? "past" : "published-upcoming";
}
