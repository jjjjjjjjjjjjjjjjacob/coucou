import { describe, expect, it } from "bun:test";
import {
  buildRedirectPathWithSearch,
  resolveSafeApplicationRedirect,
} from "../lib/auth-redirects";

describe("auth redirect helpers", () => {
  it("preserves the protected route query string for sign-in redirects", () => {
    expect(buildRedirectPathWithSearch("/host/rsvps", "?eventId=event_123"))
      .toBe("/host/rsvps?eventId=event_123");
  });

  it("normalizes query strings without a leading question mark", () => {
    expect(buildRedirectPathWithSearch("/events/event_123/rsvp", "password=test123"))
      .toBe("/events/event_123/rsvp?password=test123");
  });

  it("allows relative application redirects", () => {
    expect(resolveSafeApplicationRedirect("/host")).toBe("/host");
    expect(resolveSafeApplicationRedirect("/events/event_123/rsvp?password=test123"))
      .toBe("/events/event_123/rsvp?password=test123");
  });

  it("falls back to home for missing or external redirects", () => {
    expect(resolveSafeApplicationRedirect(undefined)).toBe("/");
    expect(resolveSafeApplicationRedirect("host")).toBe("/");
    expect(resolveSafeApplicationRedirect("https://example.com/host")).toBe("/");
    expect(resolveSafeApplicationRedirect("//example.com/host")).toBe("/");
    expect(resolveSafeApplicationRedirect("/\\example.com/host")).toBe("/");
  });
});
