import { describe, expect, it } from "bun:test";
import {
  RSVP_CLOSE_GRACE_PERIOD_MS,
  isEventOpenForRsvp,
  resolveEventRsvpCutoff,
} from "../src/shared/event-availability";

const startDate = Date.UTC(2026, 0, 1, 20, 0, 0);
const endDate = Date.UTC(2026, 0, 2, 2, 0, 0);

describe("event RSVP availability", () => {
  it("keeps active events open through ten hours after their explicit end", () => {
    const event = {
      status: "active",
      eventDate: startDate,
      eventEndDate: endDate,
    };
    const cutoff = endDate + RSVP_CLOSE_GRACE_PERIOD_MS;

    expect(resolveEventRsvpCutoff(event)).toBe(cutoff);
    expect(isEventOpenForRsvp(event, cutoff)).toBe(true);
    expect(isEventOpenForRsvp(event, cutoff + 1)).toBe(false);
  });

  it("does not open inactive or past events", () => {
    const inactiveEvent = {
      status: "inactive",
      eventDate: startDate,
      eventEndDate: endDate,
    };
    const pastEvent = {
      status: "past",
      eventDate: startDate,
      eventEndDate: endDate,
    };

    expect(isEventOpenForRsvp(inactiveEvent, startDate)).toBe(false);
    expect(isEventOpenForRsvp(pastEvent, startDate)).toBe(false);
  });

  it("falls back to the start timestamp for legacy events without an end", () => {
    const legacyEvent = {
      status: "active",
      eventDate: startDate,
    };
    const cutoff = startDate + RSVP_CLOSE_GRACE_PERIOD_MS;

    expect(resolveEventRsvpCutoff(legacyEvent)).toBe(cutoff);
    expect(isEventOpenForRsvp(legacyEvent, cutoff)).toBe(true);
    expect(isEventOpenForRsvp(legacyEvent, cutoff + 1)).toBe(false);
  });
});
