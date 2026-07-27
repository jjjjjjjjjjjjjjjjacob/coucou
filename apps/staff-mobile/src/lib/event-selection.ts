import type { StaffEventSummary } from "@/types";

function eventEnd(event: StaffEventSummary): number {
  return event.eventEndDate ?? event.eventDate + 6 * 60 * 60 * 1000;
}

export function chooseDefaultEvent(
  events: StaffEventSummary[],
  now: number = Date.now(),
): StaffEventSummary | undefined {
  const runningEvents = events
    .filter((event) => event.eventDate <= now && eventEnd(event) >= now)
    .sort(
      (firstEvent, secondEvent) =>
        firstEvent.eventDate - secondEvent.eventDate,
    );
  if (runningEvents[0]) {
    return runningEvents[0];
  }

  const upcomingEvents = events
    .filter((event) => event.eventDate > now)
    .sort(
      (firstEvent, secondEvent) =>
        firstEvent.eventDate - secondEvent.eventDate,
    );
  if (upcomingEvents[0]) {
    return upcomingEvents[0];
  }

  return [...events].sort(
    (firstEvent, secondEvent) => secondEvent.eventDate - firstEvent.eventDate,
  )[0];
}
