import type { StaffEventSummary } from "@/types";
import { chooseDefaultEvent } from "../event-selection";

function event(eventId: string, eventDate: number, eventEndDate?: number): StaffEventSummary {
  return {
    eventId,
    eventDate,
    eventEndDate,
    listKeys: [],
    location: "Test venue",
    name: eventId,
  } as unknown as StaffEventSummary;
}

describe("chooseDefaultEvent", () => {
  const now = Date.UTC(2026, 6, 23, 20);

  it("prefers a currently running event", () => {
    const currentEvent = event("current", now - 1_000, now + 1_000);
    const upcomingEvent = event("upcoming", now + 5_000);
    expect(chooseDefaultEvent([upcomingEvent, currentEvent], now)?.eventId).toBe("current");
  });

  it("prefers the next upcoming event when none is running", () => {
    const nextEvent = event("next", now + 1_000);
    const laterEvent = event("later", now + 10_000);
    expect(chooseDefaultEvent([laterEvent, nextEvent], now)?.eventId).toBe("next");
  });

  it("falls back to the most recent past event", () => {
    const olderEvent = event("older", now - 20_000, now - 15_000);
    const recentEvent = event("recent", now - 10_000, now - 5_000);
    expect(chooseDefaultEvent([olderEvent, recentEvent], now)?.eventId).toBe("recent");
  });
});
