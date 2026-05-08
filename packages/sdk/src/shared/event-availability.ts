/**
 * Window between an event's start time and the moment its RSVP form
 * stops accepting new requests. Set to 24 hours so a host doesn't have
 * to capture an explicit end time for the cutoff math to work — most
 * events run shorter than this and the extra slack accommodates late
 * arrivals during the day-of.
 */
export const RSVP_CLOSE_GRACE_PERIOD_AFTER_START_MS = 24 * 60 * 60 * 1000;

/**
 * @deprecated Use `RSVP_CLOSE_GRACE_PERIOD_AFTER_START_MS`. The legacy
 * 10-hour value was applied after `eventEndDate`; the new rule ignores
 * `eventEndDate` and measures 24 hours from `eventDate`.
 */
export const RSVP_CLOSE_GRACE_PERIOD_MS = 10 * 60 * 60 * 1000;

export type EventAvailabilityStatus = "active" | "inactive" | "past";

export interface EventAvailabilityInput {
  status?: EventAvailabilityStatus | string;
  eventDate: number;
  /** Legacy field — retained for back-compat reads but no longer drives the cutoff. */
  eventEndDate?: number | null;
}

export function resolveEventRsvpCutoffFromStart(
  event: Pick<EventAvailabilityInput, "eventDate">,
): number {
  return event.eventDate + RSVP_CLOSE_GRACE_PERIOD_AFTER_START_MS;
}

/**
 * @deprecated Use `resolveEventRsvpCutoffFromStart`. This helper still
 * runs for callers that haven't migrated, but its output now matches the
 * new helper: it ignores `eventEndDate` and returns `eventDate + 24h`.
 */
export function resolveEventRsvpCutoff(
  event: EventAvailabilityInput,
): number {
  return resolveEventRsvpCutoffFromStart(event);
}

export function isEventOpenForRsvp(
  event: EventAvailabilityInput,
  now: number = Date.now(),
): boolean {
  if (event.status !== "active") {
    return false;
  }

  return now <= resolveEventRsvpCutoffFromStart(event);
}
