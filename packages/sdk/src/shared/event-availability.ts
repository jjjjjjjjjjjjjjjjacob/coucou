/**
 * Legacy fallback window for events without an explicit close timestamp.
 * New events use `eventEndDate`, inferred from their standard/late policy.
 */
export const RSVP_CLOSE_GRACE_PERIOD_AFTER_START_MS = 24 * 60 * 60 * 1000;

/** @deprecated Retained for back-compat consumers. */
export const RSVP_CLOSE_GRACE_PERIOD_MS = 10 * 60 * 60 * 1000;

export type EventAvailabilityStatus = "active" | "inactive" | "past";
export type EventAvailabilityLifecycle = "draft" | "published";

export interface EventAvailabilityInput {
  /** Legacy status retained for compatibility. RSVP availability follows lifecycle and timing. */
  status?: EventAvailabilityStatus | string;
  /** Events created before lifecycle was introduced are treated as published. */
  lifecycle?: EventAvailabilityLifecycle | string;
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
  if ((event.lifecycle ?? "published") !== "published") {
    return false;
  }

  return now <= resolveEventRsvpCutoff(event);
}
