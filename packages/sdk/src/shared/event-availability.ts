/**
 * Legacy fallback window for events without an explicit close timestamp.
 * New events use `eventEndDate`, inferred from their standard/late policy.
 */
export const RSVP_CLOSE_GRACE_PERIOD_AFTER_START_MS = 24 * 60 * 60 * 1000;

/** @deprecated Retained for back-compat consumers. */
export const RSVP_CLOSE_GRACE_PERIOD_MS = 10 * 60 * 60 * 1000;

export type EventAvailabilityStatus = "active" | "inactive" | "past";

export interface EventAvailabilityInput {
  status?: EventAvailabilityStatus | string;
  eventDate: number;
  /** Explicit event close timestamp. */
  eventEndDate?: number | null;
}

export function resolveEventRsvpCutoffFromStart(
  event: Pick<EventAvailabilityInput, "eventDate">,
): number {
  return event.eventDate + RSVP_CLOSE_GRACE_PERIOD_AFTER_START_MS;
}

export function resolveEventRsvpCutoff(event: EventAvailabilityInput): number {
  return typeof event.eventEndDate === "number"
    ? event.eventEndDate
    : resolveEventRsvpCutoffFromStart(event);
}

export function isEventOpenForRsvp(
  event: EventAvailabilityInput,
  now: number = Date.now(),
): boolean {
  if (event.status !== "active") {
    return false;
  }

  return now <= resolveEventRsvpCutoff(event);
}
