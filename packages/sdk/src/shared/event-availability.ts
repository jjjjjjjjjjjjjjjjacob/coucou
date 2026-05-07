export const RSVP_CLOSE_GRACE_PERIOD_MS = 10 * 60 * 60 * 1000;

export type EventAvailabilityStatus = "active" | "inactive" | "past";

export interface EventAvailabilityInput {
  status?: EventAvailabilityStatus | string;
  eventDate: number;
  eventEndDate?: number | null;
}

export function resolveEventRsvpCutoff(
  event: EventAvailabilityInput,
): number {
  const eventEndDate =
    typeof event.eventEndDate === "number" &&
    Number.isFinite(event.eventEndDate)
      ? event.eventEndDate
      : event.eventDate;

  return eventEndDate + RSVP_CLOSE_GRACE_PERIOD_MS;
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
