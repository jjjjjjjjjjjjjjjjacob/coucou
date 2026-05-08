import { describe, expect, it } from "bun:test";
import { resolveSafeRedirectPath } from "@coucou/sdk/routes";
import { buildRedirectPathWithSearch } from "../lib/auth-redirects";

describe("auth redirect helpers", () => {
  it("preserves the protected route query string for sign-in redirects", () => {
    expect(buildRedirectPathWithSearch("/host/rsvps", "?eventId=event_123")).toBe(
      "/host/rsvps?eventId=event_123",
    );
  });

  it("normalizes query strings without a leading question mark", () => {
    expect(buildRedirectPathWithSearch("/events/event_123/rsvp", "password=test123")).toBe(
      "/events/event_123/rsvp?password=test123",
    );
  });

  it("allows relative application redirects", () => {
    expect(resolveSafeRedirectPath("/host", "/")).toBe("/host");
    expect(resolveSafeRedirectPath("/events/event_123/rsvp?password=test123", "/")).toBe(
      "/events/event_123/rsvp?password=test123",
    );
  });

  it("falls back to home for missing or external redirects", () => {
    expect(resolveSafeRedirectPath(undefined, "/")).toBe("/");
    expect(resolveSafeRedirectPath("host", "/")).toBe("/");
    expect(resolveSafeRedirectPath("https://example.com/host", "/")).toBe("/");
    expect(resolveSafeRedirectPath("//example.com/host", "/")).toBe("/");
    expect(resolveSafeRedirectPath("/\\example.com/host", "/")).toBe("/");
  });

  it("falls back to home for authentication redirect loops", () => {
    expect(resolveSafeRedirectPath("/sign-in", "/")).toBe("/");
    expect(resolveSafeRedirectPath("/sign-in?redirect_url=/host", "/")).toBe("/");
  });
});
