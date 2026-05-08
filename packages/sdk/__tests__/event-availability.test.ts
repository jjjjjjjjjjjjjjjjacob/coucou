import { describe, expect, it } from "bun:test";
import {
  RSVP_CLOSE_GRACE_PERIOD_AFTER_START_MS,
  RSVP_CLOSE_GRACE_PERIOD_MS,
  isEventOpenForRsvp,
  resolveEventRsvpCutoff,
  resolveEventRsvpCutoffFromStart,
} from "../src/shared/event-availability";

const startDate = Date.UTC(2026, 0, 1, 20, 0, 0);
const legacyEndDate = Date.UTC(2026, 0, 2, 2, 0, 0);

describe("event RSVP availability", () => {
  it("closes RSVPs exactly 24 hours after the start time", () => {
    const event = { status: "active", eventDate: startDate };
    const cutoff = startDate + RSVP_CLOSE_GRACE_PERIOD_AFTER_START_MS;

    expect(resolveEventRsvpCutoffFromStart(event)).toBe(cutoff);
    expect(isEventOpenForRsvp(event, cutoff)).toBe(true);
    expect(isEventOpenForRsvp(event, cutoff + 1)).toBe(false);
  });

  it("ignores any legacy explicit end timestamp on the event", () => {
    const eventWithLegacyEnd = {
      status: "active",
      eventDate: startDate,
      eventEndDate: legacyEndDate,
    };
    const cutoff = startDate + RSVP_CLOSE_GRACE_PERIOD_AFTER_START_MS;

    // Both the new helper and the deprecated helper now return the same
    // value — the deprecated helper delegates to the new one so existing
    // callsites pick up the new semantics until they're migrated.
    expect(resolveEventRsvpCutoffFromStart(eventWithLegacyEnd)).toBe(cutoff);
    expect(resolveEventRsvpCutoff(eventWithLegacyEnd)).toBe(cutoff);
    expect(isEventOpenForRsvp(eventWithLegacyEnd, cutoff)).toBe(true);
    expect(isEventOpenForRsvp(eventWithLegacyEnd, cutoff + 1)).toBe(false);
  });

  it("does not open inactive or past events", () => {
    const inactiveEvent = { status: "inactive", eventDate: startDate };
    const pastEvent = { status: "past", eventDate: startDate };

    expect(isEventOpenForRsvp(inactiveEvent, startDate)).toBe(false);
    expect(isEventOpenForRsvp(pastEvent, startDate)).toBe(false);
  });

  it("retains the deprecated 10-hour constant for back-compat consumers", () => {
    expect(RSVP_CLOSE_GRACE_PERIOD_MS).toBe(10 * 60 * 60 * 1000);
    expect(RSVP_CLOSE_GRACE_PERIOD_AFTER_START_MS).toBe(24 * 60 * 60 * 1000);
  });
});
