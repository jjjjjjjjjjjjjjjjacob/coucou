import { describe, expect, it } from "bun:test";
import {
  isEventOpenForRsvp,
  RSVP_CLOSE_GRACE_PERIOD_AFTER_START_MS,
  RSVP_CLOSE_GRACE_PERIOD_MS,
  resolveEventRsvpCutoff,
  resolveEventRsvpCutoffFromStart,
} from "../src/shared/event-availability";

const startDate = Date.UTC(2026, 0, 1, 20, 0, 0);
const legacyEndDate = Date.UTC(2026, 0, 2, 2, 0, 0);

describe("event RSVP availability", () => {
  it("closes RSVPs exactly 24 hours after the start time", () => {
    const event = { lifecycle: "published", eventDate: startDate };
    const cutoff = startDate + RSVP_CLOSE_GRACE_PERIOD_AFTER_START_MS;

    expect(resolveEventRsvpCutoffFromStart(event)).toBe(cutoff);
    expect(isEventOpenForRsvp(event, cutoff)).toBe(true);
    expect(isEventOpenForRsvp(event, cutoff + 1)).toBe(false);
  });

  it("uses an explicit event end timestamp when present", () => {
    const eventWithExplicitEnd = {
      lifecycle: "published",
      eventDate: startDate,
      eventEndDate: legacyEndDate,
    };
    const fallbackCutoff = startDate + RSVP_CLOSE_GRACE_PERIOD_AFTER_START_MS;

    expect(resolveEventRsvpCutoffFromStart(eventWithExplicitEnd)).toBe(fallbackCutoff);
    expect(resolveEventRsvpCutoff(eventWithExplicitEnd)).toBe(legacyEndDate);
    expect(isEventOpenForRsvp(eventWithExplicitEnd, legacyEndDate)).toBe(true);
    expect(isEventOpenForRsvp(eventWithExplicitEnd, legacyEndDate + 1)).toBe(false);
  });

  it("opens published events regardless of their legacy RSVP status", () => {
    const inactiveEvent = { lifecycle: "published", status: "inactive", eventDate: startDate };
    const pastEvent = { lifecycle: "published", status: "past", eventDate: startDate };

    expect(isEventOpenForRsvp(inactiveEvent, startDate)).toBe(true);
    expect(isEventOpenForRsvp(pastEvent, startDate)).toBe(true);
  });

  it("does not open draft events", () => {
    const draftEvent = { lifecycle: "draft", status: "active", eventDate: startDate };

    expect(isEventOpenForRsvp(draftEvent, startDate)).toBe(false);
  });

  it("treats legacy events without lifecycle metadata as published", () => {
    const legacyEvent = { status: "inactive", eventDate: startDate };

    expect(isEventOpenForRsvp(legacyEvent, startDate)).toBe(true);
  });

  it("retains the deprecated 10-hour constant for back-compat consumers", () => {
    expect(RSVP_CLOSE_GRACE_PERIOD_MS).toBe(10 * 60 * 60 * 1000);
    expect(RSVP_CLOSE_GRACE_PERIOD_AFTER_START_MS).toBe(24 * 60 * 60 * 1000);
  });
});
