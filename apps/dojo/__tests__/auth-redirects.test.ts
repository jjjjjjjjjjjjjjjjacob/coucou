import { describe, expect, it } from "bun:test";
import { resolveSafeRedirectPath } from "@coucou/sdk/routes";
import { buildRedirectPathWithSearch, resolveRequestSatelliteContext } from "../lib/auth-redirects";
import { resolveCoucouBaseUrl } from "../lib/site";

describe("auth redirect helpers", () => {
  it("uses the actual request host for Clerk instead of the production domain", () => {
    expect(resolveRequestSatelliteContext(new Headers({ host: "localhost:5678" }))).toEqual({
      host: "localhost:5678",
      origin: "http://localhost:5678",
    });
    expect(
      resolveRequestSatelliteContext(
        new Headers({
          host: "internal:3000",
          "x-forwarded-host": "dojo-preview.vercel.app",
          "x-forwarded-proto": "https",
        }),
      ),
    ).toEqual({
      host: "dojo-preview.vercel.app",
      origin: "https://dojo-preview.vercel.app",
    });
  });
  it("uses primary domains from the same environment even when configuration points elsewhere", () => {
    expect(resolveCoucouBaseUrl("http://localhost:5678", "https://coucou.events")).toBe(
      "http://localhost:5680",
    );
    expect(resolveCoucouBaseUrl("http://localhost:5678", "http://localhost:8888")).toBe(
      "http://localhost:8888",
    );
    expect(resolveCoucouBaseUrl("https://dev.dojopomodoro.club", "https://coucou.events")).toBe(
      "https://dev.coucou.events",
    );
    expect(
      resolveCoucouBaseUrl("https://dojo-preview.vercel.app", "https://coucou-preview.vercel.app"),
    ).toBe("https://coucou-preview.vercel.app");
    expect(resolveCoucouBaseUrl("https://dojopomodoro.club", "http://localhost:5680")).toBe(
      "https://coucou.events",
    );
  });
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
