import { describe, expect, it } from "bun:test";
import {
  buildEventDetailPathWithPreservedQuery,
  buildPathWithPreservedQuery,
  buildRsvpPathWithStep,
  parseRsvpStepQueryValue,
} from "../lib/rsvp-url-state";

describe("RSVP URL state", () => {
  it("parses supported RSVP step query values", () => {
    expect(parseRsvpStepQueryValue("info")).toBe(1);
    expect(parseRsvpStepQueryValue("details")).toBe(2);
    expect(parseRsvpStepQueryValue("final")).toBe(3);
    expect(parseRsvpStepQueryValue("unknown")).toBe(1);
    expect(parseRsvpStepQueryValue(null)).toBe(1);
  });

  it("preserves existing query params while setting RSVP step state", () => {
    const searchParams = new URLSearchParams({
      password: "pool",
      list: "vip",
      step: "final",
    });

    expect(buildRsvpPathWithStep("event_123", searchParams, 2)).toBe(
      "/events/event_123/rsvp?password=pool&list=vip&step=details",
    );
  });

  it("drops step when navigating back to non-RSVP event surfaces", () => {
    const searchParams = "password=pool&list=vip&step=final";

    expect(buildEventDetailPathWithPreservedQuery("event_123", searchParams)).toBe(
      "/events/event_123?password=pool&list=vip",
    );
    expect(buildPathWithPreservedQuery("/events/event_123/status", searchParams, ["step"])).toBe(
      "/events/event_123/status?password=pool&list=vip",
    );
  });
});
